import { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** Anything that can produce bytes `start..end` (inclusive). Telegram files and local files implement it. */
export interface ByteSource {
  readonly size: number;
  readonly mime: string;
  read(start: number, end: number, signal: AbortSignal): AsyncIterable<Buffer>;
}

export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Parse a `Range` header against a known size.
 * Returns null when there is no usable header (serve the whole body) and 'unsatisfiable' for a 416.
 * Only the first range of a multi-range request is honoured.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): ByteRange | 'unsatisfiable' | null {
  if (!header) return null;
  const m = /^bytes=\s*(\d*)\s*-\s*(\d*)\s*(?:,.*)?$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart = '', rawEnd = ''] = m;
  if (rawStart === '' && rawEnd === '') return null;
  if (size === 0) return 'unsatisfiable';

  if (rawStart === '') {
    const suffix = Number(rawEnd);
    if (suffix === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(rawStart);
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (start >= size || end < start) return 'unsatisfiable';
  return { start, end };
}

export interface ServeOptions {
  /** Used for Content-Disposition; omit to stream inline without a name. */
  filename?: string;
  cacheControl?: string;
}

export async function serveRange(
  req: FastifyRequest,
  reply: FastifyReply,
  source: ByteSource,
  opts: ServeOptions = {},
): Promise<FastifyReply> {
  const range = parseRange(req.headers.range, source.size);

  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', source.mime);
  reply.header('Cache-Control', opts.cacheControl ?? 'private, max-age=3600');
  if (opts.filename) {
    reply.header(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(opts.filename)}`,
    );
  }

  if (range === 'unsatisfiable') {
    return reply.code(416).header('Content-Range', `bytes */${source.size}`).send();
  }

  const { start, end } = range ?? { start: 0, end: source.size - 1 };
  const length = source.size === 0 ? 0 : end - start + 1;
  reply.header('Content-Length', length);
  if (range) {
    reply.code(206).header('Content-Range', `bytes ${start}-${end}/${source.size}`);
  }

  if (req.method === 'HEAD') {
    // Fastify resets Content-Length on empty responses, so answer HEAD on the raw socket.
    reply.hijack();
    reply.raw.writeHead(reply.statusCode, reply.getHeaders() as Record<string, string>);
    reply.raw.end();
    return reply;
  }
  if (length === 0) return reply.send();

  const abort = new AbortController();
  req.raw.on('close', () => abort.abort());
  const body = Readable.from(source.read(start, end, abort.signal), { objectMode: false });
  body.on('error', () => undefined);
  return reply.send(body);
}
