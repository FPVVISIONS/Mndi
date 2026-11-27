import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { LanguageCode } from '@marquee/shared';
import type { Config } from './config.js';
import { createDb, schema, type Db } from './db/client.js';
import { ImageStore } from './images/store.js';
import { decrypt, encrypt, resolveKey } from './lib/crypto.js';
import { Library } from './library/queries.js';
import { LiveService } from './live/service.js';
import { MetadataService } from './metadata/service.js';
import { TmdbProvider } from './metadata/tmdb.js';
import { MockBackend } from './mock/backend.js';
import { ensureSampleMedia } from './mock/media.js';
import { MockProvider } from './mock/provider.js';
import { refreshMockEpg, seedMock } from './mock/seed.js';
import { ChunkCache } from './stream/chunkCache.js';
import type { TelegramBackend } from './telegram/backend.js';
import { Indexer } from './telegram/indexer.js';
import { TelegramManager } from './telegram/manager.js';

export interface Services {
  config: Config;
  db: Db;
  key: Buffer;
  images: ImageStore;
  chunkCache: ChunkCache;
  meta: MetadataService;
  library: Library;
  live: LiveService;
  tg: TelegramBackend;
  indexer: Indexer | null;
  samples: string[];
  /** Base URL ffmpeg uses to read files back from this server. */
  internalBase: () => string;
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;
  /** Validate, store (encrypted) and start using a TMDB key entered in the app. */
  setTmdbKey(value: string): Promise<boolean>;
}

export async function createServices(config: Config, dbFile?: string): Promise<Services> {
  const db = await createDb(dbFile ?? join(config.dataDir, config.mock ? 'demo.db' : 'marquee.db'));
  const key = resolveKey(config.dataDir, config.sessionSecret);
  const images = new ImageStore(join(config.dataDir, 'cache', 'images'));
  const getSetting = (k: string) =>
    db.select().from(schema.settings).where(eq(schema.settings.key, k)).get()?.value;
  const setSetting = (k: string, value: string) =>
    db
      .insert(schema.settings)
      .values({ key: k, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
      .run();

  // Every install needs at least one profile; people can rename it or add more from the app.
  if (!db.select().from(schema.profiles).get()) {
    db.insert(schema.profiles)
      .values({
        name: 'Me',
        color: '#E8913A',
        avatar: 'clapperboard',
        createdAt: Math.floor(Date.now() / 1000),
      })
      .run();
  }

  const limitMb = Number(getSetting('cache_limit_mb')) || config.streamCacheMb;
  const chunkCache = new ChunkCache(join(config.dataDir, 'cache', 'stream'), limitMb);
  // A TMDB key comes from .env on desktop, or is pasted into the app (stored encrypted) on a phone.
  const storedTmdb = (() => {
    const raw = getSetting('tmdb_key');
    try {
      return raw ? decrypt(raw, key) : null;
    } catch {
      return null;
    }
  })();
  const tmdbKey = config.tmdbKey ?? storedTmdb;
  const provider = config.mock ? new MockProvider() : tmdbKey ? new TmdbProvider(tmdbKey) : null;
  const meta = new MetadataService(db, provider, images);
  const library = new Library(db, meta);
  const live = new LiveService(db, key);
  const base: Omit<Services, 'tg' | 'indexer' | 'samples'> = {
    config,
    db,
    key,
    images,
    chunkCache,
    meta,
    library,
    live,
    internalBase: () => `http://127.0.0.1:${config.port}`,
    getSetting,
    setSetting,
    setTmdbKey: async (value: string) => {
      const next = new TmdbProvider(value.trim());
      if (!(await next.validate())) return false;
      setSetting('tmdb_key', encrypt(value.trim(), key));
      meta.setProvider(next);
      return true;
    },
  };

  if (config.mock) {
    const samples = await ensureSampleMedia(join(config.dataDir, 'mock'));
    const onboarded = process.env.MARQUEE_MOCK_ONBOARD !== '1';
    await seedMock(db, meta, samples, onboarded);
    refreshMockEpg(db);
    return { ...base, tg: new MockBackend(db, onboarded), indexer: null, samples };
  }

  const manager = new TelegramManager(config, db, key, chunkCache);
  const indexer = new Indexer(db, manager, meta, live);
  let started = false;
  manager.onChange(() => {
    if (manager.status().state === 'ready' && !started) {
      started = true;
      indexer.start();
    }
  });
  void manager.init();
  const svc = { ...base, tg: manager, indexer, samples: [] };
  const setTmdbKey = svc.setTmdbKey;
  // Once a key is added, match everything that was indexed without one.
  svc.setTmdbKey = async (value) =>
    (await setTmdbKey(value)) && (void indexer.matchPending(), true);
  return svc;
}

export type { LanguageCode };
