import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyCompress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { coreRoutes } from './routes/core.js';
import { libraryRoutes } from './routes/library.js';
import { liveRoutes } from './routes/live.js';
import { streamRoutes } from './routes/stream.js';
import type { Services } from './services.js';

export async function buildApp(svc: Services): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: false });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError)
      return reply.code(400).send({ error: 'bad_request', message: 'Invalid request.' });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) console.error(err);
    return reply
      .code(status)
      .send({ error: 'server_error', message: 'Something went wrong on the server.' });
  });

  // Text, JSON, JS, CSS and SVG are compressed; video and JPEG are not compressible and pass through.
  await app.register(fastifyCompress, { global: true, threshold: 1024, encodings: ['br', 'gzip'] });

  coreRoutes(app, svc);
  libraryRoutes(app, svc);
  streamRoutes(app, svc);
  liveRoutes(app, svc);

  // In production the built web app is served from the same origin.
  const here = dirname(fileURLToPath(import.meta.url));
  const webDist = [
    process.env.MARQUEE_WEB_DIST,
    resolve(here, '../../web/dist'),
    resolve(here, '../../../web/dist'),
  ].find((p): p is string => Boolean(p) && existsSync(join(p!, 'index.html')));
  if (webDist) {
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
      setHeaders: (res, path) => {
        if (/\/assets\//.test(path))
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/'))
        return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
      return reply.code(404).send({ error: 'not_found', message: 'Not found' });
    });
  }
  return app;
}
