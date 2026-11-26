import { createReadStream, statSync } from 'node:fs';
import type { ByteSource } from './range.js';
import type { ChunkCache } from './chunkCache.js';

export class LocalFileSource implements ByteSource {
  readonly size: number;
  constructor(
    private readonly path: string,
    readonly mime: string,
  ) {
    this.size = statSync(path).size;
  }

  async *read(start: number, end: number, signal: AbortSignal): AsyncIterable<Buffer> {
    const stream = createReadStream(this.path, { start, end, highWaterMark: 256 * 1024 });
    signal.addEventListener('abort', () => stream.destroy());
    for await (const chunk of stream) yield chunk as Buffer;
  }
}

/** Downloads `count` aligned chunks starting at `index`, yielding each as it arrives. */
export type ChunkFetcher = (index: number, count: number, signal: AbortSignal) => AsyncIterable<Buffer>;

export const CHUNK_SIZE = 512 * 1024;
const RUN = 8;

interface Pending {
  promise: Promise<Buffer>;
  resolve: (b: Buffer) => void;
  reject: (e: unknown) => void;
}

/**
 * A file served in aligned chunks from a remote fetcher.
 * Reads are satisfied from the cache; misses start a run of consecutive chunks (read-ahead),
 * so sequential playback issues few requests and a seek only pays for the chunk it lands on.
 */
export class ChunkedSource implements ByteSource {
  private readonly pending = new Map<number, Pending>();
  private readonly runAbort = new Map<number, AbortController>();

  constructor(
    private readonly id: string,
    readonly size: number,
    readonly mime: string,
    private readonly fetchChunks: ChunkFetcher,
    private readonly cache: ChunkCache,
  ) {}

  private key(index: number): string {
    return `${this.id}-${index}`;
  }

  private get chunkCount(): number {
    return Math.ceil(this.size / CHUNK_SIZE);
  }

  private startRun(index: number): void {
    const last = Math.min(this.chunkCount - 1, index + RUN - 1);
    let count = 0;
    for (let i = index; i <= last; i++) {
      if (this.cache.get(this.key(i)) || this.pending.has(i)) break;
      let resolve!: Pending['resolve'];
      let reject!: Pending['reject'];
      const promise = new Promise<Buffer>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      promise.catch(() => undefined);
      this.pending.set(i, { promise, resolve, reject });
      count++;
    }
    if (count === 0) return;

    const abort = new AbortController();
    this.runAbort.set(index, abort);
    void (async () => {
      let next = index;
      try {
        for await (const buf of this.fetchChunks(index, count, abort.signal)) {
          this.cache.set(this.key(next), buf);
          this.pending.get(next)?.resolve(buf);
          this.pending.delete(next);
          next++;
        }
        if (next < index + count) throw new Error('Download ended early');
      } catch (err) {
        for (let i = next; i < index + count; i++) {
          this.pending.get(i)?.reject(err);
          this.pending.delete(i);
        }
      } finally {
        this.runAbort.delete(index);
      }
    })();
  }

  private async chunk(index: number): Promise<Buffer> {
    const cached = this.cache.get(this.key(index));
    if (cached) return cached;
    if (!this.pending.has(index)) this.startRun(index);
    const p = this.pending.get(index);
    if (!p) return this.cache.get(this.key(index)) ?? this.chunk(index);
    return p.promise;
  }

  async *read(start: number, end: number, signal: AbortSignal): AsyncIterable<Buffer> {
    const first = Math.floor(start / CHUNK_SIZE);
    const last = Math.floor(end / CHUNK_SIZE);
    for (let i = first; i <= last; i++) {
      if (signal.aborted) return;
      const buf = await this.chunk(i);
      // Keep one run ahead of the reader so the next chunks are already in flight.
      if (i + 2 <= Math.min(last + RUN, this.chunkCount - 1)) {
        const ahead = i + 2;
        if (!this.cache.get(this.key(ahead)) && !this.pending.has(ahead)) this.startRun(ahead);
      }
      const from = i === first ? start - i * CHUNK_SIZE : 0;
      const to = i === last ? end - i * CHUNK_SIZE + 1 : buf.length;
      yield buf.subarray(from, to);
    }
  }
}
