import type { FastifyReply, FastifyRequest } from 'fastify';
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from '@marquee/shared';
import type { Ctx } from '../library/queries.js';
import type { Services } from '../services.js';

export function langOf(req: FastifyRequest): LanguageCode {
  const q = (req.query as { lang?: string }).lang;
  return isLanguageCode(q) ? q : DEFAULT_LANGUAGE;
}

export function ctxOf(req: FastifyRequest, svc: Services): Ctx {
  const header = Number(req.headers['x-profile']);
  const row = svc.db.$client.prepare('SELECT id FROM profiles WHERE id = ?').get(header) as
    { id: number } | undefined;
  const fallback = svc.db.$client.prepare('SELECT id FROM profiles ORDER BY id LIMIT 1').get() as
    { id: number } | undefined;
  const q = req.headers['x-quality'];
  const quality = q === '1080p' || q === '720p' ? q : 'best';
  return { lang: langOf(req), profileId: row?.id ?? fallback?.id ?? 0, quality };
}

export function notFound(reply: FastifyReply, what = 'Not found') {
  return reply.code(404).send({ error: 'not_found', message: what });
}

export function badRequest(reply: FastifyReply, message = 'Invalid request') {
  return reply.code(400).send({ error: 'bad_request', message });
}
