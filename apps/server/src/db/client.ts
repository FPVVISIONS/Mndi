import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { join } from 'node:path';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>;

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

export function createDb(file: string) {
  const sqlite = new Database(file === ':memory:' ? file : join(file));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}

export { schema };
