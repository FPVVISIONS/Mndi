import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

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
  const dataDir = resolve(env.DATA_DIR || './data');
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
