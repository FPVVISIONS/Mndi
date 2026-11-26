import { mkdirSync, readdirSync, rmSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createDeduper } from '../lib/async.js';

const SIZES = new Set(['w92', 'w154', 'w185', 'w300', 'w342', 'w500', 'w780', 'w1280', 'h632', 'original']);
const PATH_RE = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;

export function isValidTmdbImage(size: string, path: string): boolean {
  return SIZES.has(size) && PATH_RE.test(path);
}

export class ImageStore {
  private readonly dedupe = createDeduper<string | null>();

  constructor(
    readonly dir: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  /** Path of the cached file for a TMDB image, downloading it on first use. */
  get(size: string, path: string): Promise<string | null> {
    if (!isValidTmdbImage(size, path)) return Promise.resolve(null);
    const file = join(this.dir, `${size}${path.replace('/', '_')}`);
    if (existsSync(file)) return Promise.resolve(file);
    return this.dedupe(file, async () => {
      try {
        const res = await this.fetchImpl(`https://image.tmdb.org/t/p/${size}${path}`, {
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) return null;
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        return file;
      } catch {
        return null;
      }
    });
  }

  /** Average colour of an image, pulled toward the app background so it works as a placeholder. */
  async dominantColor(path: string): Promise<string | null> {
    const file = await this.get('w92', path);
    if (!file) return null;
    try {
      const { data } = await sharp(file).resize(1, 1, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const bg = [11, 11, 12];
      const mix = (c: number, i: number) => Math.round(c * 0.6 + (bg[i] ?? 0) * 0.4);
      return `#${[0, 1, 2].map((i) => mix(data[i] ?? 0, i).toString(16).padStart(2, '0')).join('')}`;
    } catch {
      return null;
    }
  }

  bytes(): number {
    try {
      return readdirSync(this.dir).reduce((n, f) => n + statSync(join(this.dir, f)).size, 0);
    } catch {
      return 0;
    }
  }

  clear(): void {
    for (const f of readdirSync(this.dir)) rmSync(join(this.dir, f), { force: true });
  }
}
