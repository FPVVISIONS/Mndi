import http from 'node:http';
import https from 'node:https';
import { Readable } from 'node:stream';

/**
 * A small fetch built on node:http(s). Node's own fetch (undici) parses HTTP with WebAssembly, and
 * the Node build that runs inside the Android app has none, so there the app installs this instead.
 * It covers what the server uses: method, headers, string body, redirects, AbortSignal, and a
 * response with status, headers, url, text(), json(), arrayBuffer() and a web stream body.
 */

class NodeHeaders {
  private readonly map = new Map<string, string[]>();

  constructor(raw: http.IncomingHttpHeaders) {
    for (const [k, v] of Object.entries(raw)) {
      if (v === undefined) continue;
      this.map.set(k.toLowerCase(), Array.isArray(v) ? v : [String(v)]);
    }
  }

  get(name: string): string | null {
    const v = this.map.get(name.toLowerCase());
    if (!v) return null;
    return name.toLowerCase() === 'set-cookie' ? v.join(', ') : v.join(', ');
  }

  has(name: string): boolean {
    return this.map.has(name.toLowerCase());
  }

  getSetCookie(): string[] {
    return this.map.get('set-cookie') ?? [];
  }

  forEach(cb: (value: string, key: string) => void): void {
    for (const [k, v] of this.map) cb(v.join(', '), k);
  }

  *entries(): IterableIterator<[string, string]> {
    for (const [k, v] of this.map) yield [k, v.join(', ')];
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }
}

function toHeaderRecord(h: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (typeof (h as { forEach?: unknown }).forEach === 'function' && !Array.isArray(h)) {
    (h as { forEach(cb: (v: string, k: string) => void): void }).forEach((v, k) => (out[k] = v));
    return out;
  }
  if (Array.isArray(h)) {
    for (const [k, v] of h as [string, string][]) out[k] = v;
    return out;
  }
  return { ...(h as Record<string, string>) };
}

function once(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: string | Buffer | undefined,
  signal: AbortSignal | undefined,
): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.request(url, { method, headers }, resolve);
    const abort = () =>
      req.destroy(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
    if (signal) {
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true });
      req.on('close', () => signal.removeEventListener('abort', abort));
    }
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

export async function nodeFetch(input: string | URL | { url: string }, init: RequestInit = {}) {
  let url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  let method = (init.method ?? 'GET').toUpperCase();
  const headers = toHeaderRecord(init.headers);
  let body: string | Buffer | undefined =
    init.body === undefined || init.body === null
      ? undefined
      : typeof init.body === 'string'
        ? init.body
        : init.body instanceof URLSearchParams
          ? init.body.toString()
          : Buffer.from(init.body as ArrayBuffer);
  if (body !== undefined && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-length'))
    headers['content-length'] = String(Buffer.byteLength(body));
  const signal = init.signal ?? undefined;

  for (let hop = 0; ; hop++) {
    const res = await once(url, method, headers, body, signal);
    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (init.redirect !== 'manual' && location && status >= 300 && status < 400 && hop < 10) {
      res.resume();
      url = new URL(location, url);
      if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
        for (const k of Object.keys(headers))
          if (/^content-(length|type)$/i.test(k)) delete headers[k];
      }
      continue;
    }

    let used = false;
    const read = async (): Promise<Buffer> => {
      if (used) throw new TypeError('Body already used');
      used = true;
      const parts: Buffer[] = [];
      for await (const chunk of res) parts.push(chunk as Buffer);
      return Buffer.concat(parts);
    };
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: res.statusMessage ?? '',
      url: url.href,
      redirected: hop > 0,
      headers: new NodeHeaders(res.headers),
      get body() {
        used = true;
        return Readable.toWeb(res);
      },
      text: async () => (await read()).toString('utf8'),
      json: async () => JSON.parse((await read()).toString('utf8')),
      arrayBuffer: async () => {
        const b = await read();
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
    };
  }
}

/** Installs nodeFetch as the global fetch when Node's own cannot work (no WebAssembly). */
export function ensureFetch(): boolean {
  const g = globalThis as { WebAssembly?: unknown; fetch?: unknown };
  if (typeof g.WebAssembly !== 'undefined' && typeof g.fetch === 'function') return false;
  g.fetch = nodeFetch;
  return true;
}
