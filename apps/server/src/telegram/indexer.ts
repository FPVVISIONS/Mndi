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

const { sources, files, titles, channels, settings } = schema;

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
  private discovering = false;
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
    return {
      scanning: this.scanning,
      discovering: this.discovering,
      scanned: this.scanned,
      items,
      titles: t,
      channels: c,
    };
  }

  /** Called when Telegram becomes ready: start listening and catch up on every selected chat. */
  start(): void {
    this.attachListener();
    void this.scanAll();
    void this.discover();
  }

  private probed(): Set<string> {
    const row = this.db.select().from(settings).where(eq(settings.key, 'probed_chats')).get();
    try {
      return new Set<string>(row ? (JSON.parse(row.value) as string[]) : []);
    } catch {
      return new Set();
    }
  }

  private rememberProbed(set: Set<string>): void {
    const value = JSON.stringify([...set]);
    this.db
      .insert(settings)
      .values({ key: 'probed_chats', value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
  }

  /**
   * Looks through every group and channel on the account once, adds the ones that hold videos
   * (as movies and series, told apart per file) or live links, and starts reading them straight
   * away. A chat that was looked at is remembered, so removing one in Settings sticks.
   */
  async discover(): Promise<void> {
    if (this.discovering || !this.tg.ready) return;
    this.discovering = true;
    try {
      const known = new Set(
        this.db
          .select()
          .from(sources)
          .all()
          .map((s) => s.chatId),
      );
      const probed = this.probed();
      const chats = (await this.tg.listChats()).filter(
        (c) => !known.has(c.id) && !probed.has(c.id),
      );
      for (const chat of chats) {
        let verdict: 'live' | 'media' | 'empty' = 'empty';
        try {
          verdict = await this.tg.probeChat(chat.id);
        } catch {
          continue; // Try this chat again next time.
        }
        probed.add(chat.id);
        if (verdict === 'empty') continue;
        this.db
          .insert(sources)
          .values({
            chatId: chat.id,
            title: chat.title,
            kind: verdict === 'live' ? 'live' : 'movies',
            lastMessageId: 0,
          })
          .onConflictDoNothing()
          .run();
        this.rememberProbed(probed);
        this.enqueue(chat.id);
      }
      this.rememberProbed(probed);
    } finally {
      this.discovering = false;
    }
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
    await this.drain();
  }

  /** Add one chat to the scan queue and start reading it right away. */
  private enqueue(chatId: string): void {
    if (!this.queue.includes(chatId)) this.queue.push(chatId);
    void this.drain();
  }

  private async drain(): Promise<void> {
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
    let newest = src.lastMessageId;
    // Media chats read only videos and files, which skips the (often huge) text history. Live
    // chats also need text, because stream links are posted as plain messages.
    const filters =
      src.kind === 'live'
        ? [undefined]
        : [new Api.InputMessagesFilterVideo(), new Api.InputMessagesFilterDocument()];
    for (const filter of filters) {
      let offsetId = 0;
      for (;;) {
        const page = await this.tg.call(() =>
          client.getMessages(entity, {
            limit: PAGE,
            offsetId,
            minId: src.lastMessageId,
            ...(filter ? { filter } : {}),
          }),
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
    }
    this.db
      .update(sources)
      .set({ lastMessageId: newest, scannedAt: Math.floor(Date.now() / 1000) })
      .where(eq(sources.chatId, chatId))
      .run();
  }

  /** Match titles that have no TMDB id yet, a few at a time. */
  async matchPending(): Promise<void> {
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
