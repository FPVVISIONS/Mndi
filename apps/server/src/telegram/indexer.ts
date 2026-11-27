import { eq, sql } from 'drizzle-orm';
import { Api } from 'telegram';
import { NewMessage, type NewMessageEvent } from 'telegram/events/index.js';
import type { AppStatus, SourceKind } from '@marquee/shared';
import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';
import { ingestVideo, type IngestFile } from '../library/titles.js';
import type { LiveService } from '../live/service.js';
import type { MetadataService } from '../metadata/service.js';
import type { TelegramManager } from './manager.js';

const { sources, files, titles, channels } = schema;

const VIDEO_EXT = /\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|wmv|flv|mpg|mpeg)$/i;
const PLAYLIST_EXT = /\.m3u8?$/i;
const PAGE = 100;

interface Extracted {
  kind: 'video' | 'playlist';
  file: Omit<IngestFile, 'chatId' | 'messageId' | 'date'>;
}

function extract(msg: Api.Message): Extracted | null {
  const media = msg.media;
  if (!(media instanceof Api.MessageMediaDocument) || !(media.document instanceof Api.Document))
    return null;
  const doc = media.document;
  let name = '';
  let duration: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  for (const a of doc.attributes) {
    if (a instanceof Api.DocumentAttributeFilename) name = a.fileName;
    if (a instanceof Api.DocumentAttributeVideo) {
      duration = a.duration;
      width = a.w;
      height = a.h;
    }
  }
  const mime = doc.mimeType || 'application/octet-stream';
  const size = Number(doc.size);
  const base = {
    name: name || '',
    caption: msg.message || null,
    mime,
    size,
    duration,
    width,
    height,
  };
  if (PLAYLIST_EXT.test(name) || /mpegurl/i.test(mime)) return { kind: 'playlist', file: base };
  const isVideo =
    mime.startsWith('video/') || mime === 'application/x-matroska' || VIDEO_EXT.test(name);
  if (!isVideo) return null;
  return { kind: 'video', file: base };
}

export class Indexer {
  private scanning = false;
  private scanned = 0;
  private queue: string[] = [];
  private attached = false;

  constructor(
    private readonly db: Db,
    private readonly tg: TelegramManager,
    private readonly meta: MetadataService,
    private readonly live: LiveService,
  ) {}

  status(): AppStatus['index'] {
    const items = this.db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM files`)?.n ?? 0;
    const t = this.db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM titles`)?.n ?? 0;
    const c = this.db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM channels`)?.n ?? 0;
    return { scanning: this.scanning, scanned: this.scanned, items, titles: t, channels: c };
  }

  /** Called when Telegram becomes ready: start listening and catch up on every selected chat. */
  start(): void {
    this.attachListener();
    void this.scanAll();
  }

  private attachListener(): void {
    const client = this.tg.tg;
    if (!client || this.attached) return;
    this.attached = true;
    client.addEventHandler((e: NewMessageEvent) => void this.onMessage(e), new NewMessage({}));
  }

  private sourceKind(chatId: string): SourceKind | null {
    return this.db.select().from(sources).where(eq(sources.chatId, chatId)).get()?.kind ?? null;
  }

  private async onMessage(e: NewMessageEvent): Promise<void> {
    const chatId = e.chatId?.toString();
    if (!chatId) return;
    const kind = this.sourceKind(chatId);
    if (!kind) return;
    try {
      await this.handle(kind, chatId, e.message);
      this.db
        .update(sources)
        .set({ lastMessageId: e.message.id })
        .where(eq(sources.chatId, chatId))
        .run();
    } catch {
      // A single malformed message must never stop the listener.
    }
  }

  private async handle(kind: SourceKind, chatId: string, msg: Api.Message): Promise<void> {
    if (kind === 'live') {
      const x = extract(msg);
      if (x?.kind === 'playlist' && x.file.size < 8 * 1024 * 1024 && this.tg.tg) {
        const buf = await this.tg.call(() => this.tg.tg!.downloadMedia(msg, {}));
        if (Buffer.isBuffer(buf)) await this.live.ingestPlaylist(chatId, buf.toString('utf8'));
      }
      if (msg.message) await this.live.ingestMessageText(chatId, msg.message);
      return;
    }
    const x = extract(msg);
    if (x?.kind !== 'video') return;
    const result = ingestVideo(this.db, kind, {
      ...x.file,
      chatId,
      messageId: msg.id,
      date: msg.date,
    });
    if (result?.createdTitle) void this.meta.matchTitle(result.titleId);
  }

  /** Scan sources one after another. Safe to call repeatedly: a running scan picks up new sources. */
  async scanAll(rescan = false): Promise<void> {
    const all = this.db.select().from(sources).all();
    if (rescan) this.db.update(sources).set({ lastMessageId: 0 }).run();
    for (const s of all) if (!this.queue.includes(s.chatId)) this.queue.push(s.chatId);
    if (this.scanning) return;
    this.scanning = true;
    this.scanned = 0;
    try {
      for (let id = this.queue.shift(); id; id = this.queue.shift())
        await this.scanSource(id).catch(() => undefined);
    } finally {
      this.scanning = false;
      void this.matchPending();
    }
  }

  private async scanSource(chatId: string): Promise<void> {
    const client = this.tg.tg;
    const src = this.db.select().from(sources).where(eq(sources.chatId, chatId)).get();
    if (!client || !src) return;
    const entity = await this.tg.entity(chatId);
    let offsetId = 0;
    let newest = src.lastMessageId;
    for (;;) {
      const page = await this.tg.call(() =>
        client.getMessages(entity, { limit: PAGE, offsetId, minId: src.lastMessageId }),
      );
      if (!page.length) break;
      for (const msg of page) {
        newest = Math.max(newest, msg.id);
        try {
          await this.handle(src.kind, chatId, msg);
        } catch {
          // Skip a message that cannot be read and keep going.
        }
        this.scanned++;
      }
      offsetId = page[page.length - 1]!.id;
      if (page.length < PAGE) break;
    }
    this.db
      .update(sources)
      .set({ lastMessageId: newest, scannedAt: Math.floor(Date.now() / 1000) })
      .where(eq(sources.chatId, chatId))
      .run();
  }

  /** Match titles that have no TMDB id yet, a few at a time. */
  private async matchPending(): Promise<void> {
    if (!this.meta.enabled) return;
    const rows = this.db
      .select()
      .from(titles)
      .where(sql`tmdb_id IS NULL AND locked = 0`)
      .all();
    for (const r of rows) await this.meta.matchTitle(r.id).catch(() => undefined);
    this.meta.prefetch('en');
  }

  /** Remove everything indexed from a chat that is no longer selected. */
  forget(chatIds: string[]): void {
    for (const id of chatIds) {
      this.db.delete(files).where(eq(files.chatId, id)).run();
      this.db.delete(channels).where(eq(channels.sourceId, id)).run();
    }
    this.db.run(
      sql`DELETE FROM episodes WHERE id NOT IN (SELECT episode_id FROM files WHERE episode_id IS NOT NULL)`,
    );
    this.db.run(
      sql`DELETE FROM titles WHERE id NOT IN (SELECT title_id FROM files WHERE title_id IS NOT NULL)`,
    );
  }
}
