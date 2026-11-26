import Fastify from 'fastify';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChunkCache } from '../src/stream/chunkCache.js';
import { parseRange, serveRange } from '../src/stream/range.js';
import { CHUNK_SIZE, ChunkedSource, type ChunkFetcher } from '../src/stream/sources.js';

const SIZE = CHUNK_SIZE * 5 + 1234;
const data = Buffer.alloc(SIZE);
for (let i = 0; i < SIZE; i++) data[i] = (i * 7 + (i >> 8)) & 0xff;

let fetchCalls: { index: number; count: number }[] = [];
const fetcher: ChunkFetcher = async function* (index, count) {
  fetchCalls.push({ index, count });
  for (let i = index; i < index + count; i++) {
    yield data.subarray(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, SIZE));
  }
};

describe('parseRange', () => {
  it('returns null without a usable header', () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange('items=0-5', 100)).toBeNull();
    expect(parseRange('bytes=-', 100)).toBeNull();
  });
  it('parses explicit, open-ended and suffix ranges', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
  });
  it('clamps an end past the file size', () => {
    expect(parseRange('bytes=50-5000', 100)).toEqual({ start: 50, end: 99 });
  });
  it('flags unsatisfiable ranges', () => {
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=20-10', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=0-1', 0)).toBe('unsatisfiable');
  });
  it('serves only the first of several ranges', () => {
    expect(parseRange('bytes=0-1, 5-9', 100)).toEqual({ start: 0, end: 1 });
  });
});

describe('range streaming endpoint', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marquee-range-'));
  const app = Fastify();
  const cache = new ChunkCache(dir, 64);
  const source = new ChunkedSource('t1', SIZE, 'video/mp4', fetcher, cache);

  beforeAll(async () => {
    app.get('/s', (req, reply) => serveRange(req, reply, source));
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const get = (range?: string, method: 'GET' | 'HEAD' = 'GET') =>
    app.inject({ method, url: '/s', headers: range ? { range } : {} });

  it('streams the whole file with 200 and advertises ranges', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-length']).toBe(String(SIZE));
    expect(res.rawPayload.equals(data)).toBe(true);
  });

  it('answers HEAD without a body', async () => {
    const res = await get(undefined, 'HEAD');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-length']).toBe(String(SIZE));
    expect(res.rawPayload.length).toBe(0);
  });

  it('serves a range inside one chunk', async () => {
    const res = await get('bytes=100-199');
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 100-199/${SIZE}`);
    expect(res.rawPayload.equals(data.subarray(100, 200))).toBe(true);
  });

  it('serves a range that spans chunk boundaries', async () => {
    const start = CHUNK_SIZE - 10;
    const end = CHUNK_SIZE * 3 + 50;
    const res = await get(`bytes=${start}-${end}`);
    expect(res.statusCode).toBe(206);
    expect(res.rawPayload.equals(data.subarray(start, end + 1))).toBe(true);
  });

  it('serves suffix and open-ended ranges', async () => {
    const tail = await get('bytes=-1000');
    expect(tail.headers['content-range']).toBe(`bytes ${SIZE - 1000}-${SIZE - 1}/${SIZE}`);
    expect(tail.rawPayload.equals(data.subarray(SIZE - 1000))).toBe(true);
    const open = await get(`bytes=${SIZE - 5}-`);
    expect(open.rawPayload.equals(data.subarray(SIZE - 5))).toBe(true);
  });

  it('returns 416 with the size for an unsatisfiable range', async () => {
    const res = await get(`bytes=${SIZE}-`);
    expect(res.statusCode).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${SIZE}`);
  });

  it('only downloads what a seek needs, and reuses cached chunks', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'marquee-range2-'));
    fetchCalls = [];
    const fresh = new ChunkedSource('t2', SIZE, 'video/mp4', fetcher, new ChunkCache(dir2, 64));
    const app2 = Fastify();
    app2.get('/s', (req, reply) => serveRange(req, reply, fresh));
    const seek = CHUNK_SIZE * 4 + 5;
    const first = await app2.inject({ url: '/s', headers: { range: `bytes=${seek}-${seek + 9}` } });
    expect(first.rawPayload.equals(data.subarray(seek, seek + 10))).toBe(true);
    expect(fetchCalls[0]?.index).toBe(4);
    expect(fetchCalls.every((c) => c.index >= 4)).toBe(true);
    const calls = fetchCalls.length;
    await app2.inject({ url: '/s', headers: { range: `bytes=${seek + 20}-${seek + 29}` } });
    expect(fetchCalls.length).toBe(calls);
    await app2.close();
    rmSync(dir2, { recursive: true, force: true });
  });

  it('surfaces a failed download as an aborted body, not a hang', async () => {
    const dir3 = mkdtempSync(join(tmpdir(), 'marquee-range3-'));
    // eslint-disable-next-line require-yield
    const broken: ChunkFetcher = async function* () {
      throw new Error('FLOOD_WAIT');
    };
    const bad = new ChunkedSource('t3', SIZE, 'video/mp4', broken, new ChunkCache(dir3, 64));
    const app3 = Fastify();
    app3.get('/s', (req, reply) => serveRange(req, reply, bad));
    const res = await Promise.race([
      app3.inject({ url: '/s', headers: { range: 'bytes=0-9' } }).then(() => 'done'),
      new Promise((r) => setTimeout(() => r('hang'), 3000)),
    ]);
    expect(res).toBe('done');
    await app3.close();
    rmSync(dir3, { recursive: true, force: true });
  });
});
