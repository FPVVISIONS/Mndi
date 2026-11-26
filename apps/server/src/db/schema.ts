import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const sources = sqliteTable('sources', {
  chatId: text('chat_id').primaryKey(),
  title: text('title').notNull(),
  kind: text('kind', { enum: ['movies', 'series', 'live'] }).notNull(),
  lastMessageId: integer('last_message_id').notNull().default(0),
  scannedAt: integer('scanned_at'),
});

export const titles = sqliteTable('titles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind', { enum: ['movie', 'series'] }).notNull(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  year: integer('year').notNull().default(0),
  tmdbId: integer('tmdb_id'),
  locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
  popularity: real('popularity').notNull().default(0),
  addedAt: integer('added_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const episodes = sqliteTable('episodes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  titleId: integer('title_id').notNull(),
  season: integer('season').notNull(),
  episode: integer('episode').notNull(),
  addedAt: integer('added_at').notNull(),
});

export const files = sqliteTable('files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: text('chat_id').notNull(),
  messageId: integer('message_id').notNull(),
  name: text('name').notNull(),
  caption: text('caption'),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  duration: real('duration'),
  width: integer('width'),
  height: integer('height'),
  container: text('container').notNull(),
  quality: text('quality'),
  source: text('source'),
  codec: text('codec'),
  audioLangs: text('audio_langs').notNull().default('[]'),
  subLangs: text('sub_langs').notNull().default('[]'),
  titleId: integer('title_id'),
  episodeId: integer('episode_id'),
  date: integer('date').notNull(),
  probe: text('probe'),
  /** Local path for mock or directly served files. */
  localPath: text('local_path'),
  addedAt: integer('added_at').notNull(),
});

export const metaCache = sqliteTable(
  'meta_cache',
  {
    kind: text('kind').notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    lang: text('lang').notNull(),
    data: text('data').notNull(),
    fetchedAt: integer('fetched_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.tmdbId, t.lang] })],
);

export const seasonCache = sqliteTable(
  'season_cache',
  {
    tmdbId: integer('tmdb_id').notNull(),
    season: integer('season').notNull(),
    lang: text('lang').notNull(),
    data: text('data').notNull(),
    fetchedAt: integer('fetched_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.tmdbId, t.season, t.lang] })],
);

export const imageColors = sqliteTable('image_colors', {
  path: text('path').primaryKey(),
  color: text('color').notNull(),
});

export const profiles = sqliteTable('profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  color: text('color').notNull(),
  avatar: text('avatar').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const progress = sqliteTable(
  'progress',
  {
    profileId: integer('profile_id').notNull(),
    fileId: integer('file_id').notNull(),
    titleId: integer('title_id').notNull(),
    position: real('position').notNull(),
    duration: real('duration').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.fileId] })],
);

export const myList = sqliteTable(
  'my_list',
  {
    profileId: integer('profile_id').notNull(),
    titleId: integer('title_id').notNull(),
    addedAt: integer('added_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.titleId] })],
);

export const likes = sqliteTable(
  'likes',
  {
    profileId: integer('profile_id').notNull(),
    titleId: integer('title_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.titleId] })],
);

export const channels = sqliteTable('channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceId: text('source_id').notNull(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  logo: text('logo'),
  grp: text('grp').notNull().default(''),
  url: text('url').notNull(),
  tvgId: text('tvg_id'),
  addedAt: integer('added_at').notNull(),
});

export const favChannels = sqliteTable(
  'fav_channels',
  {
    profileId: integer('profile_id').notNull(),
    channelId: integer('channel_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.channelId] })],
);

export const epg = sqliteTable(
  'epg',
  {
    channelKey: text('channel_key').notNull(),
    start: integer('start').notNull(),
    stop: integer('stop').notNull(),
    title: text('title').notNull(),
  },
  (t) => [primaryKey({ columns: [t.channelKey, t.start] })],
);
