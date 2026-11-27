import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { loadSharp } from '../lib/optional.js';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '../db/client.js';
import { createLimiter } from '../lib/async.js';
import { renderArt } from '../mock/art.js';
import {
  canCopyVideo,
  extractSubtitle,
  extractThumb,
  ffmpegAvailable,
  spawnRemux,
} from '../stream/ffmpeg.js';
import { buildPlayback, inputFor, probeFile } from '../stream/playback.js';
import { serveRange } from '../stream/range.js';
import { LocalFileSource } from '../stream/sources.js';
import type { Services } from '../services.js';
import { ctxOf, notFound } from './util.js';

const { files } = schema;
const fileId = (req: { params: unknown }) => Number((req.params as { id: string }).id);

const backdropCache = new Map<string, Buffer>();

export function streamRoutes(app: FastifyInstance, svc: Services): void {
  const cacheDir = join(svc.config.dataDir, 'cache', 'derived');
  mkdirSync(cacheDir, { recursive: true });
  const ffLimit = createLimiter(2);

  app.get('/api/playback/:id', async (req, reply) => {
    const q = z
      .object({
        audio: z.coerce.number().int().min(0).default(0),
        hevc: z.coerce.boolean().default(false),
        transcode: z.coerce.boolean().default(false),
      })
      .parse(req.query);
    const info = await buildPlayback(svc, fileId(req), ctxOf(req, svc), q);
    return info ?? notFound(reply);
  });

  app.get('/api/stream/:id', async (req, reply) => {
    const file = svc.db
      .select()
      .from(files)
      .where(eq(files.id, fileId(req)))
      .get();
    if (!file) return notFound(reply);
    const source = await svc.tg.byteSource(file);
    if (!source)
      return reply
        .code(503)
        .send({ error: 'unavailable', message: 'Telegram is not connected right now.' });
    return serveRange(req, reply, source, { filename: file.name });
  });

  app.get('/api/stream/:id/remux', async (req, reply) => {
    const q = z
      .object({
        start: z.coerce.number().min(0).default(0),
        audio: z.coerce.number().int().min(0).default(0),
        mode: z.enum(['remux', 'transcode']).default('remux'),
        hevc: z.coerce.boolean().default(false),
      })
      .parse(req.query);
    const id = fileId(req);
    if (!svc.db.select().from(files).where(eq(files.id, id)).get()) return notFound(reply);
    if (!(await ffmpegAvailable()))
      return reply
        .code(501)
        .send({ error: 'no_ffmpeg', message: 'ffmpeg is not installed on the server.' });
    const info = await probeFile(svc, id);
    const copyVideo =
      q.mode === 'remux' && (info ? canCopyVideo(info.video?.codec ?? null, q.hevc) : true);
    const audioCodec = info?.audio[q.audio]?.codec;
    const copyAudio = Boolean(audioCodec && ['aac', 'mp3', 'opus'].includes(audioCodec));
    const child = spawnRemux({
      input: inputFor(svc, id),
      start: q.start,
      audioIndex: q.audio,
      copyVideo,
      copyAudio,
    });
    req.raw.on('close', () => child.kill('SIGKILL'));
    reply.header('Content-Type', 'video/mp4').header('Cache-Control', 'no-store');
    return reply.send(child.stdout);
  });

  app.get('/api/stream/:id/thumb', async (req, reply) => {
    const id = fileId(req);
    const t = Math.max(0, Math.floor(Number((req.query as { t?: string }).t) || 0));
    const bucket = Math.floor(t / 10) * 10;
    const out = join(cacheDir, `thumb-${id}-${bucket}.jpg`);
    if (!existsSync(out)) {
      if (!(await ffmpegAvailable())) return reply.code(404).send();
      const ok = await ffLimit(() => extractThumb(inputFor(svc, id), bucket, out));
      if (!ok) return reply.code(404).send();
    }
    return reply
      .header('Cache-Control', 'public, max-age=86400')
      .type('image/jpeg')
      .send(createReadStream(out));
  });

  app.get('/api/stream/:id/subs/:n', async (req, reply) => {
    const { id, n } = req.params as { id: string; n: string };
    const idx = Number(n.replace(/\.vtt$/, ''));
    const out = join(cacheDir, `subs-${id}-${idx}.vtt`);
    if (!existsSync(out)) {
      const ok = await ffLimit(() => extractSubtitle(inputFor(svc, Number(id)), idx, out));
      if (!ok) return reply.code(404).send();
    }
    return reply
      .header('Cache-Control', 'public, max-age=86400')
      .type('text/vtt; charset=utf-8')
      .send(createReadStream(out));
  });

  // ---- Images ----------------------------------------------------------------------------
  app.get('/api/img/:size/*', async (req, reply) => {
    const { size, '*': path } = req.params as { size: string; '*': string };
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    if (path.startsWith('mock/')) {
      const [, slug = '', kind = 'poster', lang = 'en'] = path.split('/');
      if (kind !== 'poster' && kind !== 'backdrop' && kind !== 'logo') return notFound(reply);
      const svg = renderArt(slug, kind, lang);
      if (!svg) return notFound(reply);
      const sharp = kind === 'backdrop' ? await loadSharp() : null;
      if (sharp) {
        // Backdrops carry no text, so serve them as JPEG like TMDB does: same decode path, realistic weight.
        const width = Number(size.replace(/\D/g, '')) || 1280;
        const key = `${slug}:${width}`;
        let jpeg = backdropCache.get(key);
        if (!jpeg) {
          jpeg = await sharp(Buffer.from(svg))
            .resize({ width: Math.min(width, 1280) })
            .jpeg({ quality: 82, mozjpeg: true })
            .toBuffer();
          backdropCache.set(key, jpeg);
        }
        return reply.type('image/jpeg').send(jpeg);
      }
      return reply.type('image/svg+xml').send(svg);
    }
    const file = await svc.images.get(size, `/${path}`);
    if (!file) return reply.header('Cache-Control', 'no-store').code(404).send();
    return reply
      .type(path.endsWith('.png') ? 'image/png' : 'image/jpeg')
      .send(createReadStream(file));
  });

  // ---- Demo assets -----------------------------------------------------------------------
  if (svc.config.mock) {
    app.get('/api/mock/sample/:name', async (req, reply) => {
      const n = Number((req.params as { name: string }).name.replace(/\D/g, '')) || 1;
      const path = svc.samples[(n - 1) % svc.samples.length];
      if (!path) return notFound(reply);
      return serveRange(req, reply, new LocalFileSource(path, 'video/webm'));
    });
    app.get('/api/mock/logo/:name', async (req, reply) => {
      const tvg = (req.params as { name: string }).name.replace(/\.svg$/, '');
      const letters = tvg
        .split('.')
        .map((p) => p[0]!.toUpperCase())
        .join('')
        .slice(0, 2);
      let h = 0;
      for (const c of tvg) h = (h * 33 + c.charCodeAt(0)) >>> 0;
      const fills = ['#1d4a5a', '#7a2e1b', '#214c3d', '#3f5f8a', '#5a4638', '#37627f'];
      const fill = fills[h % fills.length]!;
      return reply
        .type('image/svg+xml')
        .header('Cache-Control', 'public, max-age=86400')
        .send(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="14" fill="${fill}"/><text x="60" y="76" font-size="46" text-anchor="middle" fill="#F2F0EC" font-family="Georgia, serif">${letters}</text></svg>`,
        );
    });
  }
}
