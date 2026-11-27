import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** apps/server/src -> repository root, so relative paths mean the same thing however the app is started. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined && value !== '' ? n : fallback;
}

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  mock: boolean;
  apiId: number | null;
  apiHash: string | null;
  tmdbKey: string | null;
  sessionSecret: string | null;
  streamCacheMb: number;
  version: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = resolve(REPO_ROOT, env.DATA_DIR || './data');
  mkdirSync(dataDir, { recursive: true });
  const apiId = num(env.TELEGRAM_API_ID, 0);
  return {
    port: num(env.PORT, 8787),
    host: env.HOST || '127.0.0.1',
    dataDir,
    mock: env.MARQUEE_MOCK === '1' || env.MARQUEE_MOCK === 'true',
    apiId: apiId > 0 ? apiId : null,
    apiHash: env.TELEGRAM_API_HASH?.trim() || null,
    tmdbKey: env.TMDB_API_KEY?.trim() || null,
    sessionSecret: env.SESSION_SECRET?.trim() || null,
    streamCacheMb: num(env.STREAM_CACHE_MB, 512),
    version: '0.1.0',
  };
}
