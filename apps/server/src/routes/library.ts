import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { isLanguageCode, languageInfo } from '@marquee/shared';
import { schema } from '../db/client.js';
import type { Services } from '../services.js';
import { badRequest, ctxOf, langOf, notFound } from './util.js';

const { titles } = schema;

const idParam = (req: { params: unknown }) => Number((req.params as { id: string }).id);

export function libraryRoutes(app: FastifyInstance, svc: Services): void {
  const lib = svc.library;

  app.get('/api/home', async (req) => lib.home(ctxOf(req, svc)));

  app.get('/api/titles', async (req) => {
    const q = z
      .object({
        kind: z.enum(['movie', 'series']).optional(),
        genre: z.string().optional(),
        sort: z.enum(['recent', 'title', 'rating', 'year']).optional(),
      })
      .parse(req.query);
    return lib.list(q, ctxOf(req, svc));
  });

  app.get('/api/titles/:id', async (req, reply) => {
    const detail = lib.detail(idParam(req), ctxOf(req, svc));
    return detail ?? notFound(reply);
  });

  app.get('/api/titles/:id/episodes', async (req) => {
    const season = Number((req.query as { season?: string }).season) || 1;
    return { episodes: await lib.episodeList(idParam(req), season, ctxOf(req, svc)) };
  });

  app.get('/api/search', async (req) => {
    const q = String((req.query as { q?: string }).q ?? '').slice(0, 80);
    return lib.search(q, ctxOf(req, svc));
  });

  app.get('/api/my-list', async (req) => ({ items: lib.myList(ctxOf(req, svc)) }));
  app.put('/api/my-list/:id', async (req) => (lib.setList(ctxOf(req, svc), idParam(req), true), { ok: true }));
  app.delete('/api/my-list/:id', async (req) => (lib.setList(ctxOf(req, svc), idParam(req), false), { ok: true }));
  app.put('/api/likes/:id', async (req) => (lib.setLike(ctxOf(req, svc), idParam(req), true), { ok: true }));
  app.delete('/api/likes/:id', async (req) => (lib.setLike(ctxOf(req, svc), idParam(req), false), { ok: true }));

  app.post('/api/progress', async (req, reply) => {
    const body = z.object({ fileId: z.number(), position: z.number().min(0), duration: z.number().positive() }).safeParse(req.body);
    if (!body.success) return badRequest(reply);
    lib.saveProgress(ctxOf(req, svc).profileId, body.data.fileId, body.data.position, body.data.duration);
    return { ok: true };
  });
  app.delete('/api/progress/:id', async (req) => (lib.clearProgress(ctxOf(req, svc).profileId, idParam(req)), { ok: true }));

  // ---- Manual matching -------------------------------------------------------------------
  app.get('/api/titles/:id/matches', async (req, reply) => {
    const row = svc.db.select().from(titles).where(eq(titles.id, idParam(req))).get();
    if (!row) return notFound(reply);
    const q = String((req.query as { q?: string }).q ?? row.name).slice(0, 100);
    const hits = await svc.meta.search(row.kind, q);
    return {
      matches: hits.map((h) => ({
        tmdbId: h.id,
        title: h.title,
        year: h.year,
        overview: h.overview,
        poster: h.posterPath ? { id: h.posterPath, color: svc.meta.colorFor(h.posterPath), lang: null } : null,
      })),
    };
  });

  app.post('/api/titles/:id/match', async (req, reply) => {
    const body = z.object({ tmdbId: z.number().int().positive().nullable() }).safeParse(req.body);
    if (!body.success) return badRequest(reply);
    const id = idParam(req);
    if (body.data.tmdbId === null) {
      svc.meta.clearMatch(id);
      return { id };
    }
    const row = svc.db.select().from(titles).where(eq(titles.id, id)).get();
    if (!row) return notFound(reply);
    const survivor = svc.meta.setMatch(id, body.data.tmdbId, true);
    await svc.meta.ensure(row.kind, body.data.tmdbId, langOf(req));
    return { id: survivor };
  });

  app.post('/api/library/prefetch', async (req, reply) => {
    const lang = (req.body as { lang?: string } | undefined)?.lang;
    if (!isLanguageCode(lang)) return badRequest(reply);
    svc.meta.prefetch(lang);
    return { ok: true, tmdb: languageInfo(lang).tmdb };
  });
}
