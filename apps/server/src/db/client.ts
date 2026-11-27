import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as schema from './schema.js';

/** Both drivers are synchronous SQLite under Drizzle, so the rest of the app sees one type. */
export type Db = BaseSQLiteDatabase<'sync', unknown, typeof schema> & { flush?: () => void };

const DDL = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sources (
  chat_id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL,
  last_message_id INTEGER NOT NULL DEFAULT 0, scanned_at INTEGER);
CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, key TEXT NOT NULL, name TEXT NOT NULL,
  year INTEGER NOT NULL DEFAULT 0, tmdb_id INTEGER, locked INTEGER NOT NULL DEFAULT 0,
  popularity REAL NOT NULL DEFAULT 0, added_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(kind, key, year));
CREATE INDEX IF NOT EXISTS titles_tmdb ON titles(tmdb_id);
CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title_id INTEGER NOT NULL, season INTEGER NOT NULL,
  episode INTEGER NOT NULL, added_at INTEGER NOT NULL, UNIQUE(title_id, season, episode));
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, message_id INTEGER NOT NULL,
  name TEXT NOT NULL, caption TEXT, mime TEXT NOT NULL, size INTEGER NOT NULL, duration REAL,
  width INTEGER, height INTEGER, container TEXT NOT NULL, quality TEXT, source TEXT, codec TEXT,
  audio_langs TEXT NOT NULL DEFAULT '[]', sub_langs TEXT NOT NULL DEFAULT '[]',
  title_id INTEGER, episode_id INTEGER, date INTEGER NOT NULL, probe TEXT, local_path TEXT,
  added_at INTEGER NOT NULL, UNIQUE(chat_id, message_id));
CREATE INDEX IF NOT EXISTS files_title ON files(title_id);
CREATE INDEX IF NOT EXISTS files_episode ON files(episode_id);
CREATE TABLE IF NOT EXISTS meta_cache (
  kind TEXT NOT NULL, tmdb_id INTEGER NOT NULL, lang TEXT NOT NULL, data TEXT NOT NULL,
  fetched_at INTEGER NOT NULL, PRIMARY KEY(kind, tmdb_id, lang));
CREATE TABLE IF NOT EXISTS season_cache (
  tmdb_id INTEGER NOT NULL, season INTEGER NOT NULL, lang TEXT NOT NULL, data TEXT NOT NULL,
  fetched_at INTEGER NOT NULL, PRIMARY KEY(tmdb_id, season, lang));
CREATE TABLE IF NOT EXISTS image_colors (path TEXT PRIMARY KEY, color TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, color TEXT NOT NULL,
  avatar TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS progress (
  profile_id INTEGER NOT NULL, file_id INTEGER NOT NULL, title_id INTEGER NOT NULL,
  position REAL NOT NULL, duration REAL NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL, PRIMARY KEY(profile_id, file_id));
CREATE TABLE IF NOT EXISTS my_list (
  profile_id INTEGER NOT NULL, title_id INTEGER NOT NULL, added_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id, title_id));
CREATE TABLE IF NOT EXISTS likes (
  profile_id INTEGER NOT NULL, title_id INTEGER NOT NULL, PRIMARY KEY(profile_id, title_id));
CREATE TABLE IF NOT EXISTS version_choice (
  profile_id INTEGER NOT NULL, scope TEXT NOT NULL, ref_id INTEGER NOT NULL, file_id INTEGER NOT NULL,
  PRIMARY KEY(profile_id, scope, ref_id));
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL, key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL, logo TEXT, grp TEXT NOT NULL DEFAULT '', url TEXT NOT NULL, tvg_id TEXT,
  added_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS fav_channels (
  profile_id INTEGER NOT NULL, channel_id INTEGER NOT NULL, PRIMARY KEY(profile_id, channel_id));
CREATE TABLE IF NOT EXISTS epg (
  channel_key TEXT NOT NULL, start INTEGER NOT NULL, stop INTEGER NOT NULL, title TEXT NOT NULL,
  PRIMARY KEY(channel_key, start));
`;

/**
 * Open the database. Desktop uses better-sqlite3 (native, durable, fast). Where native modules
 * cannot load, such as the Android app, it falls back to sql.js: SQLite compiled to WebAssembly,
 * kept in memory and written back to the same file shortly after every change.
 */
export async function createDb(file: string): Promise<Db> {
  if (process.env.MARQUEE_SQLITE !== 'wasm') {
    try {
      const { default: Database } = await import('better-sqlite3');
      const { drizzle } = await import('drizzle-orm/better-sqlite3');
      const sqlite = new Database(file);
      sqlite.pragma('journal_mode = WAL');
      sqlite.pragma('synchronous = NORMAL');
      sqlite.pragma('foreign_keys = ON');
      sqlite.exec(DDL);
      return drizzle(sqlite, { schema }) as unknown as Db;
    } catch (err) {
      if (process.env.MARQUEE_SQLITE === 'native') throw err;
    }
  }
  return createWasmDb(file);
}

/**
 * SQLite as WebAssembly (the inline build carries its binary, so bundles need no extra file).
 * Some Android Node builds run V8 without a JIT and therefore without WebAssembly; there the
 * pure-JavaScript build of the same SQLite takes over.
 */
async function loadSqlJs() {
  const hasWasm = typeof (globalThis as { WebAssembly?: unknown }).WebAssembly === 'object';
  if (hasWasm) {
    try {
      const { default: init } = await import('sql.js/dist/sql-wasm-inline.js');
      return await init();
    } catch (err) {
      console.error('SQLite WebAssembly failed, using the JavaScript build:', err);
    }
  }
  const { default: init } = await import('sql.js/dist/sql-asm-memory-growth.js');
  return init();
}

async function createWasmDb(file: string): Promise<Db> {
  const { drizzle } = await import('drizzle-orm/sql-js');
  const SQL = await loadSqlJs();
  const memory = file !== ':memory:';
  const sqlite =
    memory && existsSync(file) ? new SQL.Database(readFileSync(file)) : new SQL.Database();
  sqlite.run('PRAGMA foreign_keys = ON');
  sqlite.exec(DDL);

  let saved = -1;
  const changes = () => Number(sqlite.exec('SELECT total_changes()')[0]?.values[0]?.[0] ?? 0);
  let lastFlush = 0;
  const flush = () => {
    if (!memory) return;
    const now = changes();
    if (now === saved) return;
    // Write to a temporary file and rename, so a crash mid-write never corrupts the database.
    writeFileSync(`${file}.tmp`, sqlite.export());
    renameSync(`${file}.tmp`, file);
    // export() resets the connection; re-apply settings and remember the new baseline.
    sqlite.run('PRAGMA foreign_keys = ON');
    saved = changes();
    lastFlush = Date.now();
  };
  flush();
  // Exporting the whole database is costly, so write at most every few seconds, and only after changes.
  // On a phone the database can be tens of megabytes while the library is indexing, and writing it
  // out blocks everything else. So: at most once every 30 seconds, and on shutdown.
  setInterval(() => {
    if (Date.now() - lastFlush >= 30_000) flush();
  }, 5000).unref();
  for (const sig of ['SIGINT', 'SIGTERM', 'beforeExit'] as const) process.once(sig, flush);

  const db = drizzle(sqlite, { schema }) as unknown as Db;
  db.flush = flush;
  return db;
}

export { schema };
