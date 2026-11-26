import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';
import { parseMedia, titleKey, type ParsedName } from '../parser/filename.js';

const { titles, episodes, files } = schema;

export interface IngestFile {
  chatId: string;
  messageId: number;
  name: string;
  caption: string | null;
  mime: string;
  size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  date: number;
  localPath?: string | null;
}

export interface IngestResult {
  fileId: number;
  titleId: number;
  createdTitle: boolean;
}

function extOf(name: string, mime: string): string {
  const m = /\.([a-z0-9]{2,4})$/i.exec(name);
  if (m) return (m[1] ?? '').toLowerCase();
  if (mime.includes('matroska')) return 'mkv';
  if (mime.includes('webm')) return 'webm';
  return 'mp4';
}

function qualityFromHeight(h: number | null): string | null {
  if (!h) return null;
  if (h >= 2000) return '2160p';
  if (h >= 1000) return '1080p';
  if (h >= 700) return '720p';
  return '480p';
}

export const QUALITY_RANK: Record<string, number> = { '2160p': 5, '1440p': 4, '1080p': 3, '720p': 2, '576p': 1, '480p': 1, '360p': 0 };

/** Insert or update one video message, grouping it into a title (and an episode for series). */
export function ingestVideo(
  db: Db,
  sourceKind: 'movies' | 'series',
  f: IngestFile,
  now = Math.floor(Date.now() / 1000),
): IngestResult | null {
  const parsed: ParsedName = parseMedia({ fileName: f.name, caption: f.caption });
  if (!parsed.title) return null;
  const isSeries = parsed.isSeries && (parsed.episode !== null || sourceKind === 'series');
  const kind = isSeries ? 'series' : 'movie';
  const key = titleKey(parsed.title);
  if (!key) return null;

  let createdTitle = false;
  let title = isSeries
    ? db.select().from(titles).where(and(eq(titles.kind, 'series'), eq(titles.key, key))).get()
    : (parsed.year
        ? db.select().from(titles).where(and(eq(titles.kind, 'movie'), eq(titles.key, key), eq(titles.year, parsed.year))).get()
        : undefined) ??
      db.select().from(titles).where(and(eq(titles.kind, 'movie'), eq(titles.key, key))).get();

  if (!title) {
    title = db
      .insert(titles)
      .values({ kind, key, name: parsed.title, year: parsed.year ?? 0, addedAt: now, updatedAt: now })
      .returning()
      .get();
    createdTitle = true;
  } else if (!title.year && parsed.year && !title.locked) {
    db.update(titles).set({ year: parsed.year }).where(eq(titles.id, title.id)).run();
  }

  let episodeId: number | null = null;
  if (isSeries) {
    const season = parsed.season ?? 1;
    const episode = parsed.episode ?? 1;
    const existing = db
      .select()
      .from(episodes)
      .where(and(eq(episodes.titleId, title.id), eq(episodes.season, season), eq(episodes.episode, episode)))
      .get();
    episodeId =
      existing?.id ??
      db.insert(episodes).values({ titleId: title.id, season, episode, addedAt: now }).returning().get().id;
  }

  const ext = extOf(f.name, f.mime);
  const values = {
    chatId: f.chatId,
    messageId: f.messageId,
    name: f.name,
    caption: f.caption,
    mime: f.mime,
    size: f.size,
    duration: f.duration,
    width: f.width,
    height: f.height,
    container: ext,
    quality: parsed.quality ?? qualityFromHeight(f.height),
    source: parsed.source,
    codec: parsed.codec,
    audioLangs: JSON.stringify(parsed.audioLangs),
    subLangs: JSON.stringify(parsed.subLangs),
    titleId: title.id,
    episodeId,
    date: f.date,
    localPath: f.localPath ?? null,
    addedAt: now,
  };
  const row = db
    .insert(files)
    .values(values)
    .onConflictDoUpdate({
      target: [files.chatId, files.messageId],
      set: { ...values, addedAt: sql`${files.addedAt}` },
    })
    .returning()
    .get();
  db.update(titles).set({ updatedAt: now }).where(eq(titles.id, title.id)).run();
  return { fileId: row.id, titleId: title.id, createdTitle };
}

/** Remove a deleted message and any title or episode left empty by it. */
export function removeFile(db: Db, chatId: string, messageId: number): void {
  const f = db.select().from(files).where(and(eq(files.chatId, chatId), eq(files.messageId, messageId))).get();
  if (!f) return;
  db.delete(files).where(eq(files.id, f.id)).run();
  if (f.episodeId) {
    const left = db.select({ n: sql<number>`count(*)` }).from(files).where(eq(files.episodeId, f.episodeId)).get();
    if (!left?.n) db.delete(episodes).where(eq(episodes.id, f.episodeId)).run();
  }
  if (f.titleId) {
    const left = db.select({ n: sql<number>`count(*)` }).from(files).where(eq(files.titleId, f.titleId)).get();
    if (!left?.n) db.delete(titles).where(eq(titles.id, f.titleId)).run();
  }
}

/** Move everything from one title row into another, used when two rows turn out to be the same title. */
export function mergeTitles(db: Db, fromId: number, intoId: number): void {
  if (fromId === intoId) return;
  db.transaction((tx) => {
    const fromEps = tx.select().from(episodes).where(eq(episodes.titleId, fromId)).all();
    for (const ep of fromEps) {
      const clash = tx
        .select()
        .from(episodes)
        .where(and(eq(episodes.titleId, intoId), eq(episodes.season, ep.season), eq(episodes.episode, ep.episode)))
        .get();
      if (clash) {
        tx.update(files).set({ episodeId: clash.id }).where(eq(files.episodeId, ep.id)).run();
        tx.delete(episodes).where(eq(episodes.id, ep.id)).run();
      } else {
        tx.update(episodes).set({ titleId: intoId }).where(eq(episodes.id, ep.id)).run();
      }
    }
    tx.update(files).set({ titleId: intoId }).where(eq(files.titleId, fromId)).run();
    for (const table of ['progress', 'my_list', 'likes'] as const) {
      tx.run(sql.raw(`UPDATE OR IGNORE ${table} SET title_id = ${intoId} WHERE title_id = ${fromId}`));
      tx.run(sql.raw(`DELETE FROM ${table} WHERE title_id = ${fromId}`));
    }
    tx.delete(titles).where(eq(titles.id, fromId)).run();
  });
}
