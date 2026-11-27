import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Two-level chunk cache: a small in-memory LRU in front of a size-capped directory on disk.
 * Disk entries are evicted oldest first when the cap is exceeded.
 */
export class ChunkCache {
  private readonly mem = new Map<string, Buffer>();
  private memBytes = 0;
  private diskBytes = 0;
  private limitBytes: number;

  constructor(
    private readonly dir: string,
    limitMb: number,
    private readonly memLimitBytes = 32 * 1024 * 1024,
  ) {
    mkdirSync(dir, { recursive: true });
    this.limitBytes = limitMb * 1024 * 1024;
    this.diskBytes = this.scan().reduce((n, f) => n + f.size, 0);
  }

  private scan(): { name: string; size: number; mtime: number }[] {
    return readdirSync(this.dir).flatMap((name) => {
      try {
        const s = statSync(join(this.dir, name));
        return [{ name, size: s.size, mtime: s.mtimeMs }];
      } catch {
        return [];
      }
    });
  }

  get(key: string): Buffer | null {
    const hit = this.mem.get(key);
    if (hit) {
      this.mem.delete(key);
      this.mem.set(key, hit);
      return hit;
    }
    try {
      const buf = readFileSync(join(this.dir, key));
      this.remember(key, buf);
      return buf;
    } catch {
      return null;
    }
  }

  set(key: string, buf: Buffer): void {
    this.remember(key, buf);
    try {
      writeFileSync(join(this.dir, key), buf);
      this.diskBytes += buf.length;
      if (this.diskBytes > this.limitBytes) this.prune();
    } catch {
      // A full disk must never break playback; the memory copy still serves this request.
    }
  }

  private remember(key: string, buf: Buffer): void {
    if (this.mem.has(key)) return;
    this.mem.set(key, buf);
    this.memBytes += buf.length;
    for (const [k, v] of this.mem) {
      if (this.memBytes <= this.memLimitBytes) break;
      this.mem.delete(k);
      this.memBytes -= v.length;
    }
  }

  private prune(): void {
    const files = this.scan().sort((a, b) => a.mtime - b.mtime);
    let total = files.reduce((n, f) => n + f.size, 0);
    for (const f of files) {
      if (total <= this.limitBytes * 0.9) break;
      rmSync(join(this.dir, f.name), { force: true });
      this.mem.delete(f.name);
      total -= f.size;
    }
    this.diskBytes = total;
  }

  setLimit(limitMb: number): void {
    this.limitBytes = limitMb * 1024 * 1024;
    if (this.diskBytes > this.limitBytes) this.prune();
  }

  get bytes(): number {
    return this.diskBytes;
  }

  clear(): void {
    this.mem.clear();
    this.memBytes = 0;
    for (const f of this.scan()) rmSync(join(this.dir, f.name), { force: true });
    this.diskBytes = 0;
  }
}
