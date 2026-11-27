import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppStatus, SourceKind } from '@marquee/shared';
import { schema } from '../db/client.js';
import type { Services } from '../services.js';
import { badRequest } from './util.js';

const { sources, profiles } = schema;

const kinds = z.enum(['movies', 'series', 'live']);

export function coreRoutes(app: FastifyInstance, svc: Services): void {
  const count = (table: 'files' | 'titles' | 'channels' | 'profiles') =>
    svc.db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM ${sql.identifier(table)}`)?.n ?? 0;

  const status = (): AppStatus => ({
    mock: svc.config.mock,
    tmdb: svc.meta.enabled,
    version: svc.config.version,
    telegram: svc.tg.status(),
    onboarded: svc.getSetting('onboarded') === '1',
    index: svc.indexer?.status() ?? {
      scanning: false,
      scanned: 0,
      items: count('files'),
      titles: count('titles'),
      channels: count('channels'),
    },
    languagesCached: svc.meta.languagesCached(),
  });

  app.get('/api/status', async () => status());

  app.post('/api/onboarding/complete', async () => {
    svc.setSetting('onboarded', '1');
    return status();
  });

  if (svc.config.mock) {
    app.post('/api/dev/reset-onboarding', async () => {
      svc.setSetting('onboarded', '0');
      return status();
    });
  }

  // ---- Telegram login --------------------------------------------------------------------
  app.get('/api/auth', async () => svc.tg.authState());
  app.post('/api/auth/credentials', async (req, reply) => {
    const body = z.object({ apiId: z.coerce.number(), apiHash: z.string() }).safeParse(req.body);
    if (!body.success) return badRequest(reply);
    return svc.tg.saveCredentials(body.data.apiId, body.data.apiHash.trim());
  });
  app.post('/api/auth/keys/phone', async (req, reply) => {
    const body = z.object({ phone: z.string().min(3).max(32) }).safeParse(req.body);
    return body.success ? svc.tg.requestKeysCode(body.data.phone) : badRequest(reply);
  });
  app.post('/api/auth/keys/code', async (req, reply) => {
    const body = z.object({ code: z.string().max(64) }).safeParse(req.body);
    return body.success ? svc.tg.submitKeysCode(body.data.code) : badRequest(reply);
  });
  app.post('/api/auth/phone', async (req, reply) => {
    const body = z.object({ phone: z.string().min(3).max(32) }).safeParse(req.body);
    return body.success ? svc.tg.sendPhone(body.data.phone) : badRequest(reply);
  });
  app.post('/api/auth/resend', async () => svc.tg.resendCode());
  app.post('/api/auth/code', async (req, reply) => {
    const body = z.object({ code: z.string().min(3).max(12) }).safeParse(req.body);
    return body.success ? svc.tg.submitCode(body.data.code) : badRequest(reply);
  });
  app.post('/api/auth/password', async (req, reply) => {
    const body = z.object({ password: z.string().min(1).max(256) }).safeParse(req.body);
    return body.success ? svc.tg.submitPassword(body.data.password) : badRequest(reply);
  });
  app.post('/api/auth/qr', async () => svc.tg.startQr());
  app.post('/api/auth/cancel', async () => svc.tg.cancelAuth());
  app.post('/api/auth/logout', async () => {
    await svc.tg.logout();
    svc.setSetting('onboarded', '0');
    return status();
  });

  // ---- Sources ---------------------------------------------------------------------------
  app.get('/api/chats', async (_req, reply) => {
    if (svc.tg.status().state !== 'ready')
      return reply.code(409).send({ error: 'not_ready', message: 'Not connected' });
    return { chats: await svc.tg.listChats() };
  });

  app.get('/api/sources', async () => ({ sources: svc.db.select().from(sources).all() }));

  app.put('/api/sources', async (req, reply) => {
    const body = z
      .object({
        sources: z.array(z.object({ chatId: z.string(), title: z.string(), kind: kinds })),
      })
      .safeParse(req.body);
    if (!body.success) return badRequest(reply);
    const existing = new Map(
      svc.db
        .select()
        .from(sources)
        .all()
        .map((s) => [s.chatId, s]),
    );
    const next = new Map(body.data.sources.map((s) => [s.chatId, s]));
    const removed = [...existing.keys()].filter((id) => !next.has(id));
    svc.indexer?.forget(removed);
    for (const id of removed) svc.db.delete(sources).where(eq(sources.chatId, id)).run();
    for (const s of next.values()) {
      const kind: SourceKind = s.kind;
      const prev = existing.get(s.chatId);
      if (prev && prev.kind !== kind) svc.indexer?.forget([s.chatId]);
      svc.db
        .insert(sources)
        .values({
          chatId: s.chatId,
          title: s.title,
          kind,
          lastMessageId: prev && prev.kind === kind ? prev.lastMessageId : 0,
        })
        .onConflictDoUpdate({
          target: sources.chatId,
          set: {
            title: s.title,
            kind,
            lastMessageId: prev && prev.kind === kind ? prev.lastMessageId : 0,
          },
        })
        .run();
    }
    void svc.indexer?.scanAll();
    return { ok: true };
  });

  app.post('/api/library/scan', async (req) => {
    const body = z.object({ rescan: z.boolean().optional() }).safeParse(req.body ?? {});
    void svc.indexer?.scanAll(body.success && body.data.rescan);
    return status().index;
  });

  // ---- Profiles --------------------------------------------------------------------------
  const profileBody = z.object({
    name: z.string().trim().min(1).max(24),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    avatar: z.string().min(1).max(24),
  });
  app.get('/api/profiles', async () => ({
    profiles: svc.db.select().from(profiles).orderBy(profiles.id).all(),
  }));
  app.post('/api/profiles', async (req, reply) => {
    const body = profileBody.safeParse(req.body);
    if (!body.success) return badRequest(reply);
    return svc.db
      .insert(profiles)
      .values({ ...body.data, createdAt: Math.floor(Date.now() / 1000) })
      .returning()
      .get();
  });
  app.patch('/api/profiles/:id', async (req, reply) => {
    const body = profileBody.partial().safeParse(req.body);
    if (!body.success) return badRequest(reply);
    const id = Number((req.params as { id: string }).id);
    return svc.db.update(profiles).set(body.data).where(eq(profiles.id, id)).returning().get();
  });
  app.delete('/api/profiles/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (count('profiles') <= 1) return badRequest(reply, 'Keep at least one profile');
    for (const t of ['progress', 'my_list', 'likes', 'fav_channels'])
      svc.db.run(sql`DELETE FROM ${sql.identifier(t)} WHERE profile_id = ${id}`);
    svc.db.delete(profiles).where(eq(profiles.id, id)).run();
    return { ok: true };
  });

  // ---- Metadata key -----------------------------------------------------------------------
  app.put('/api/settings/tmdb', async (req, reply) => {
    const body = z.object({ key: z.string().trim().min(16).max(400) }).safeParse(req.body);
    if (!body.success) return badRequest(reply);
    if (svc.config.mock) return { ok: true };
    const ok = await svc.setTmdbKey(body.data.key);
    return ok
      ? { ok: true }
      : reply.code(422).send({ error: 'tmdb_invalid', message: 'TMDB rejected that key.' });
  });

  // ---- Cache -----------------------------------------------------------------------------
  app.get('/api/cache', async () => ({
    streamBytes: svc.chunkCache.bytes,
    imageBytes: svc.images.bytes(),
    limitMb: Number(svc.getSetting('cache_limit_mb')) || svc.config.streamCacheMb,
  }));
  app.put('/api/cache', async (req, reply) => {
    const body = z.object({ limitMb: z.number().int().min(64).max(20480) }).safeParse(req.body);
    if (!body.success) return badRequest(reply);
    svc.setSetting('cache_limit_mb', String(body.data.limitMb));
    svc.chunkCache.setLimit(body.data.limitMb);
    return { ok: true };
  });
  app.delete('/api/cache', async () => {
    svc.chunkCache.clear();
    svc.images.clear();
    return { ok: true };
  });
}
