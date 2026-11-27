import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PlaybackInfo } from '@marquee/shared';
import { listChannels, setFavourite } from '../live/channels.js';
import { assertPublicEnough } from '../live/service.js';
import { spawnLiveRemux } from '../stream/ffmpeg.js';
import type { Services } from '../services.js';
import { badRequest, ctxOf, notFound } from './util.js';

const idOf = (req: { params: unknown }) => Number((req.params as { id: string }).id);

function rewritePlaylist(text: string, base: URL, proxy: (u: string) => string): string {
  const abs = (u: string) => new URL(u, base).toString();
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, u: string) => `URI="${proxy(abs(u))}"`);
      }
      return proxy(abs(t));
    })
    .join('\n');
}

export function liveRoutes(app: FastifyInstance, svc: Services): void {
  app.get('/api/live/channels', async (req) => ({
    channels: listChannels(svc.db, ctxOf(req, svc).profileId),
  }));

  app.put(
    '/api/live/favourites/:id',
    async (req) => (setFavourite(svc.db, ctxOf(req, svc).profileId, idOf(req), true), { ok: true }),
  );
  app.delete(
    '/api/live/favourites/:id',
    async (req) => (
      setFavourite(svc.db, ctxOf(req, svc).profileId, idOf(req), false),
      { ok: true }
    ),
  );

  app.get('/api/live/:id/playback', async (req, reply) => {
    const ch = svc.live.channel(idOf(req));
    if (!ch) return notFound(reply);
    let mode: PlaybackInfo['mode'];
    let url: string;
    if (ch.url.startsWith('mock:sample/')) {
      mode = 'live-direct';
      url = `/api/mock/sample/${ch.url.split('/')[1]}.webm`;
    } else if (/\.m3u8?(\?|$)/i.test(ch.url)) {
      mode = 'live-hls';
      url = svc.live.proxyUrl(ch.url);
    } else if (/\.(mp4|webm)(\?|$)/i.test(ch.url)) {
      mode = 'live-direct';
      url = svc.live.proxyUrl(ch.url);
    } else {
      mode = 'live-direct';
      url = `/api/live/${ch.id}/remux`;
    }
    const info: PlaybackInfo = {
      fileId: null,
      channelId: ch.id,
      titleId: null,
      episodeId: null,
      title: ch.name,
      subtitle: ch.grp || null,
      duration: 0,
      mode,
      url,
      audioTracks: [],
      subtitleTracks: [],
      chapters: [],
      resume: 0,
      next: null,
      versions: [],
      thumbs: false,
      backdrop: null,
    };
    return info;
  });

  app.get('/api/live/:id/remux', async (req, reply) => {
    const ch = svc.live.channel(idOf(req));
    if (!ch) return notFound(reply);
    try {
      await assertPublicEnough(new URL(ch.url));
    } catch {
      return badRequest(reply, 'That address is not allowed.');
    }
    const child = spawnLiveRemux(ch.url);
    req.raw.on('close', () => child.kill('SIGKILL'));
    reply.header('Content-Type', 'video/mp4').header('Cache-Control', 'no-store');
    return reply.send(child.stdout);
  });

  app.get('/api/live/proxy', async (req, reply) => {
    const q = z.object({ u: z.string(), s: z.string() }).safeParse(req.query);
    if (!q.success) return badRequest(reply);
    const target = Buffer.from(q.data.u, 'base64url').toString('utf8');
    if (!svc.live.verify(target, q.data.s))
      return reply.code(403).send({ error: 'forbidden', message: 'Unknown stream.' });
    let url: URL;
    try {
      url = new URL(target);
      await assertPublicEnough(url);
    } catch {
      return badRequest(reply, 'That address is not allowed.');
    }
    const headers: Record<string, string> = { 'user-agent': 'Mozilla/5.0 Marquee' };
    if (req.headers.range) headers.range = String(req.headers.range);
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return reply
        .code(502)
        .send({ error: 'unreachable', message: 'The channel did not respond.' });
    }
    if (!upstream.ok && upstream.status !== 206)
      return reply
        .code(502)
        .send({ error: 'unreachable', message: 'The channel did not respond.' });

    const type = upstream.headers.get('content-type') ?? '';
    const isPlaylist = /mpegurl/i.test(type) || /\.m3u8?(\?|$)/i.test(url.pathname + url.search);
    if (isPlaylist) {
      const text = await upstream.text();
      const base = new URL(upstream.url || url.toString());
      const body = rewritePlaylist(text, base, (u) => svc.live.proxyUrl(u));
      return reply
        .type('application/vnd.apple.mpegurl')
        .header('Cache-Control', 'no-store')
        .send(body);
    }
    reply
      .code(upstream.status)
      .header('Content-Type', type || 'application/octet-stream')
      .header('Cache-Control', 'no-store');
    for (const h of ['content-length', 'content-range', 'accept-ranges']) {
      const v = upstream.headers.get(h);
      if (v) reply.header(h, v);
    }
    if (!upstream.body) return reply.send();
    const stream = Readable.fromWeb(upstream.body as never);
    req.raw.on('close', () => stream.destroy());
    return reply.send(stream);
  });
}
