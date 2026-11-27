import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { languageInfo, LANGUAGES, type LanguageCode, type TitleKind } from '@marquee/shared';
import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';
import type { ImageStore } from '../images/store.js';
import { createDeduper, createLimiter } from '../lib/async.js';
import { mergeTitles } from '../library/titles.js';
import { mockColor } from '../mock/art.js';
import { titleKey } from '../parser/filename.js';
import { resolveMeta, scoreCandidate } from './localize.js';
import type { LocalizedMeta, MetadataProvider, RawDetails, RawSeason, SearchHit } from './types.js';

const { metaCache, seasonCache, titles, imageColors } = schema;

const MATCH_THRESHOLD = 0.8;

function hashColor(path: string): string {
  let h = 0;
  for (let i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  // A dark, desaturated tone derived from the path, so placeholders differ without shouting.
  const s = 0.18;
  const l = 0.14;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${[f(0), f(8), f(4)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export class MetadataService {
  private readonly dedupe = createDeduper<LocalizedMeta | null>();
  private readonly colors = new Map<string, string>();
  private readonly colorQueue = createLimiter(2);
  private readonly colorPending = new Set<string>();
  readonly prefetching = new Set<string>();

  constructor(
    private readonly db: Db,
    private provider: MetadataProvider | null,
    private readonly images: ImageStore,
  ) {
    for (const row of db.select().from(imageColors).all()) this.colors.set(row.path, row.color);
  }

  /** Swap the metadata source at runtime, e.g. when a TMDB key is added from the app. */
  setProvider(provider: MetadataProvider | null): void {
    this.provider = provider;
  }

  get enabled(): boolean {
    return this.provider !== null;
  }

  peek(kind: TitleKind, tmdbId: number, lang: string): LocalizedMeta | null {
    const row = this.db
      .select()
      .from(metaCache)
      .where(and(eq(metaCache.kind, kind), eq(metaCache.tmdbId, tmdbId), eq(metaCache.lang, lang)))
      .get();
    return row ? (JSON.parse(row.data) as LocalizedMeta) : null;
  }

  peekMany(kind: TitleKind, ids: number[], lang: string): Map<number, LocalizedMeta> {
    const out = new Map<number, LocalizedMeta>();
    if (!ids.length) return out;
    const rows = this.db
      .select()
      .from(metaCache)
      .where(
        and(eq(metaCache.kind, kind), eq(metaCache.lang, lang), inArray(metaCache.tmdbId, ids)),
      )
      .all();
    for (const r of rows) out.set(r.tmdbId, JSON.parse(r.data) as LocalizedMeta);
    return out;
  }

  private store(kind: TitleKind, id: number, lang: string, meta: LocalizedMeta): void {
    const values = { kind, tmdbId: id, lang, data: JSON.stringify(meta), fetchedAt: Date.now() };
    this.db
      .insert(metaCache)
      .values(values)
      .onConflictDoUpdate({
        target: [metaCache.kind, metaCache.tmdbId, metaCache.lang],
        set: values,
      })
      .run();
    this.db
      .update(titles)
      .set({ popularity: meta.popularity })
      .where(and(eq(titles.kind, kind), eq(titles.tmdbId, id)))
      .run();
  }

  /** Cached metadata, fetching it from the provider the first time a language is requested. */
  ensure(kind: TitleKind, id: number, lang: LanguageCode): Promise<LocalizedMeta | null> {
    const cached = this.peek(kind, id, lang);
    if (cached) return Promise.resolve(cached);
    const provider = this.provider;
    if (!provider) return Promise.resolve(null);
    return this.dedupe(`${kind}:${id}:${lang}`, async () => {
      try {
        const tmdbLang = languageInfo(lang).tmdb;
        const raw: RawDetails = await provider.details(kind, id, tmdbLang, lang);
        const missingText = !(raw.overview && (raw.title || raw.name));
        let english: RawDetails | null = null;
        if (lang !== 'en' && missingText) {
          english = await provider.details(kind, id, 'en-US', 'en');
          this.store(kind, id, 'en', resolveMeta(kind, english, null, 'en'));
        }
        const meta = resolveMeta(kind, raw, english, lang);
        this.store(kind, id, lang, meta);
        return meta;
      } catch {
        return null;
      }
    });
  }

  async season(tmdbId: number, season: number, lang: LanguageCode): Promise<RawSeason | null> {
    const row = this.db
      .select()
      .from(seasonCache)
      .where(
        and(
          eq(seasonCache.tmdbId, tmdbId),
          eq(seasonCache.season, season),
          eq(seasonCache.lang, lang),
        ),
      )
      .get();
    if (row) return JSON.parse(row.data) as RawSeason;
    if (!this.provider) return null;
    try {
      const data = await this.provider.season(tmdbId, season, languageInfo(lang).tmdb, lang);
      const values = { tmdbId, season, lang, data: JSON.stringify(data), fetchedAt: Date.now() };
      this.db
        .insert(seasonCache)
        .values(values)
        .onConflictDoUpdate({
          target: [seasonCache.tmdbId, seasonCache.season, seasonCache.lang],
          set: values,
        })
        .run();
      return data;
    } catch {
      return null;
    }
  }

  async search(kind: TitleKind, query: string, year: number | null = null): Promise<SearchHit[]> {
    if (!this.provider) return [];
    try {
      return await this.provider.search(kind, query, year, 'en-US');
    } catch {
      return [];
    }
  }

  /** Auto-match a title row to TMDB. Returns the id of the surviving title row. */
  async matchTitle(titleId: number): Promise<number> {
    const row = this.db.select().from(titles).where(eq(titles.id, titleId)).get();
    if (!row || row.locked || row.tmdbId || !this.provider) return titleId;
    let hits = await this.search(row.kind, row.name, row.year || null);
    if (!hits.length && row.year) hits = await this.search(row.kind, row.name);
    const scored = hits
      .map((h) => ({
        h,
        s: scoreCandidate({ title: row.name, year: row.year || null }, h, titleKey),
      }))
      .sort((a, b) => b.s - a.s);
    const best = scored[0];
    if (!best || best.s < MATCH_THRESHOLD) return titleId;
    return this.setMatch(titleId, best.h.id, false);
  }

  /** Link a title to a TMDB id, merging it into an existing row for that id if there is one. */
  setMatch(titleId: number, tmdbId: number, locked: boolean): number {
    const row = this.db.select().from(titles).where(eq(titles.id, titleId)).get();
    if (!row) return titleId;
    const other = this.db
      .select()
      .from(titles)
      .where(and(eq(titles.kind, row.kind), eq(titles.tmdbId, tmdbId)))
      .get();
    this.db
      .update(titles)
      .set({ tmdbId, locked, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(titles.id, titleId))
      .run();
    if (other && other.id !== titleId) {
      const keep = other.id < titleId ? other.id : titleId;
      const drop = keep === titleId ? other.id : titleId;
      mergeTitles(this.db, drop, keep);
      return keep;
    }
    return titleId;
  }

  clearMatch(titleId: number): void {
    this.db.update(titles).set({ tmdbId: null, locked: false }).where(eq(titles.id, titleId)).run();
  }

  /** Fetch and cache metadata for every matched title in one language, in the background. */
  prefetch(lang: LanguageCode): void {
    if (!this.provider || this.prefetching.has(lang)) return;
    this.prefetching.add(lang);
    const rows = this.db.select().from(titles).where(isNotNull(titles.tmdbId)).all();
    void (async () => {
      try {
        const todo = rows.filter((r) => r.tmdbId && !this.peek(r.kind, r.tmdbId, lang));
        const queue = [...todo];
        await Promise.all(
          Array.from({ length: 3 }, async () => {
            for (let r = queue.shift(); r; r = queue.shift())
              await this.ensure(r.kind, r.tmdbId!, lang);
          }),
        );
      } finally {
        this.prefetching.delete(lang);
      }
    })();
  }

  languagesCached(): LanguageCode[] {
    const rows = this.db.selectDistinct({ lang: metaCache.lang }).from(metaCache).all();
    const have = new Set(rows.map((r) => r.lang));
    return LANGUAGES.map((l) => l.code).filter((c) => have.has(c));
  }

  /** Placeholder colour for an image. Unknown images get a stable tone and are measured in the background. */
  colorFor(path: string | null | undefined): string {
    if (!path) return '#161618';
    if (path.startsWith('mock/')) return mockColor(path) ?? '#161618';
    const known = this.colors.get(path);
    if (known) return known;
    if (!this.colorPending.has(path)) {
      this.colorPending.add(path);
      void this.colorQueue(async () => {
        const color = await this.images.dominantColor(path);
        if (color) {
          this.colors.set(path, color);
          this.db.insert(imageColors).values({ path, color }).onConflictDoNothing().run();
        }
      });
    }
    return hashColor(path);
  }
}
