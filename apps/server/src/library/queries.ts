import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  Channel,
  EpisodeItem,
  FileVersion,
  HomePayload,
  HomeRow,
  ImageRef,
  LanguageCode,
  Progress,
  SearchResults,
  TitleCard,
  TitleDetail,
} from '@marquee/shared';
import type { Db } from '../db/client.js';
import { schema } from '../db/client.js';
import { listChannels } from '../live/channels.js';
import type { MetadataService } from '../metadata/service.js';
import type { ImagePick, LocalizedMeta } from '../metadata/types.js';
import { titleKey } from '../parser/filename.js';
import { QUALITY_RANK } from './titles.js';

const { titles, episodes, files, progress, myList, likes, versionChoice, sources } = schema;

type TitleRow = typeof titles.$inferSelect;
type FileRow = typeof files.$inferSelect;

export interface Ctx {
  lang: LanguageCode;
  profileId: number;
  /** Preferred maximum quality from settings. */
  quality?: 'best' | '1080p' | '720p';
}

const COMPLETE_RATIO = 0.92;

export function episodeLabel(season: number, episode: number): string {
  return `S${season}:E${episode}`;
}

const QUALITY_CAP: Record<string, number> = { best: 99, '1080p': 3, '720p': 2 };
const NATIVE = new Set(['mp4', 'm4v', 'mov', 'webm']);

/** The file Play should use: the person's saved choice, else the best release within their quality cap. */
export function bestFile(
  list: FileRow[],
  opts: { chosen?: number; quality?: string } = {},
): FileRow | undefined {
  const chosen = opts.chosen ? list.find((f) => f.id === opts.chosen) : undefined;
  if (chosen) return chosen;
  const rank = (f: FileRow) => QUALITY_RANK[f.quality ?? ''] ?? 2;
  const cap = QUALITY_CAP[opts.quality ?? 'best'] ?? 99;
  const within = list.filter((f) => rank(f) <= cap);
  const pool = within.length ? within : list;
  return [...pool].sort((a, b) => rank(b) - rank(a) || b.size - a.size)[0];
}

const SOURCE_LABEL: Record<string, string> = {
  BLURAY: 'BluRay',
  BDRIP: 'BDRip',
  BRRIP: 'BRRip',
  BDREMUX: 'Remux',
  REMUX: 'Remux',
  WEBDL: 'WEB-DL',
  WEBRIP: 'WEBRip',
  HDTV: 'HDTV',
  PDTV: 'PDTV',
  DVDRIP: 'DVDRip',
  HDRIP: 'HDRip',
  CAM: 'CAM',
  HDCAM: 'CAM',
};

export function toVersion(f: FileRow, chat: string, chosen: boolean): FileVersion {
  const res = f.width && f.height ? `${f.width}×${f.height}` : null;
  return {
    id: f.id,
    label:
      [
        f.quality,
        f.source ? (SOURCE_LABEL[f.source] ?? f.source) : null,
        f.codec === 'hevc' ? 'HEVC' : f.codec === 'h264' ? 'H.264' : f.codec,
      ]
        .filter(Boolean)
        .join(' · ') || f.container.toUpperCase(),
    quality: f.quality ?? '',
    source: f.source,
    codec: f.codec,
    resolution: res,
    size: f.size,
    languages: JSON.parse(f.audioLangs) as string[],
    subtitles: JSON.parse(f.subLangs) as string[],
    container: f.container,
    chat,
    name: f.name,
    date: f.date,
    chosen,
    native: NATIVE.has(f.container),
  };
}

export class Library {
  constructor(
    private readonly db: Db,
    readonly meta: MetadataService,
  ) {}

  private ref(pick: ImagePick | null | undefined): ImageRef | null {
    return pick ? { id: pick.path, color: this.meta.colorFor(pick.path), lang: pick.lang } : null;
  }

  private metaFor(
    rows: TitleRow[],
    lang: LanguageCode,
  ): Map<number, { meta: LocalizedMeta; exact: boolean }> {
    const out = new Map<number, { meta: LocalizedMeta; exact: boolean }>();
    // Fetching details for a whole library on one request floods the network and the database,
    // so only the first batch is asked for now; prefetch() brings in the rest in the background.
    let budget = 60;
    for (const kind of ['movie', 'series'] as const) {
      const ids = rows.filter((r) => r.kind === kind && r.tmdbId).map((r) => r.tmdbId!);
      const exact = this.meta.peekMany(kind, ids, lang);
      const fallback = lang === 'en' ? exact : this.meta.peekMany(kind, ids, 'en');
      for (const r of rows.filter((x) => x.kind === kind && x.tmdbId)) {
        const e = exact.get(r.tmdbId!);
        const f = fallback.get(r.tmdbId!);
        if (e) out.set(r.id, { meta: e, exact: true });
        else {
          if (f) out.set(r.id, { meta: f, exact: false });
          if (budget-- > 0) void this.meta.ensure(kind, r.tmdbId!, lang);
        }
      }
    }
    return out;
  }

  cards(rows: TitleRow[], ctx: Ctx, extra?: Map<number, Progress>): TitleCard[] {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const metas = this.metaFor(rows, ctx.lang);
    const inList = new Set(
      this.db
        .select()
        .from(myList)
        .where(eq(myList.profileId, ctx.profileId))
        .all()
        .map((r) => r.titleId),
    );
    const liked = new Set(
      this.db
        .select()
        .from(likes)
        .where(eq(likes.profileId, ctx.profileId))
        .all()
        .map((r) => r.titleId),
    );
    const seasonCounts = new Map<number, number>(
      this.db
        .all<{ id: number; n: number }>(
          sql`SELECT title_id AS id, COUNT(DISTINCT season) AS n FROM episodes WHERE title_id IN (${sql.join(
            ids.map((i) => sql`${i}`),
            sql`,`,
          )}) GROUP BY title_id`,
        )
        .map((r) => [r.id, r.n]),
    );

    return rows.map<TitleCard>((r) => {
      const m = metas.get(r.id);
      const meta = m?.meta;
      return {
        id: r.id,
        kind: r.kind,
        title: meta?.title || r.name,
        year: meta?.year ?? (r.year || null),
        overview: meta?.overview ?? '',
        genres: meta?.genres ?? [],
        rating: meta?.rating ?? null,
        runtime: meta?.runtime ?? null,
        poster: this.ref(meta?.poster),
        backdrop: this.ref(meta?.backdrop),
        logo: this.ref(meta?.logo),
        addedAt: r.addedAt,
        seasons: r.kind === 'series' ? (seasonCounts.get(r.id) ?? null) : null,
        inList: inList.has(r.id),
        liked: liked.has(r.id),
        matched: Boolean(r.tmdbId),
        pending: Boolean(r.tmdbId && this.meta.enabled && !m?.exact) || undefined,
        progress: extra?.get(r.id),
      };
    });
  }

  private allTitles(): TitleRow[] {
    return this.db.select().from(titles).all();
  }

  private progressRows(ctx: Ctx) {
    return this.db
      .select({ p: progress, f: files, e: episodes })
      .from(progress)
      .innerJoin(files, eq(files.id, progress.fileId))
      .leftJoin(episodes, eq(episodes.id, files.episodeId))
      .where(eq(progress.profileId, ctx.profileId))
      .orderBy(desc(progress.updatedAt))
      .all();
  }

  continueWatching(ctx: Ctx): TitleCard[] {
    const seen = new Set<number>();
    const picks: { row: TitleRow; prog: Progress }[] = [];
    for (const { p, e } of this.progressRows(ctx)) {
      if (seen.has(p.titleId) || p.completed || p.position < 5) continue;
      const row = this.db.select().from(titles).where(eq(titles.id, p.titleId)).get();
      if (!row) continue;
      seen.add(p.titleId);
      picks.push({
        row,
        prog: {
          fileId: p.fileId,
          position: p.position,
          duration: p.duration,
          updatedAt: p.updatedAt,
          episodeLabel: e ? episodeLabel(e.season, e.episode) : undefined,
        },
      });
    }
    return this.cards(
      picks.map((p) => p.row),
      ctx,
      new Map(picks.map((p) => [p.row.id, p.prog])),
    );
  }

  home(ctx: Ctx): HomePayload {
    const all = this.allTitles();
    const now = Math.floor(Date.now() / 1000);

    // Build cards only for titles a home row can show. Turning a whole library of thousands into
    // cards on every request was what made the home screen slow on a phone.
    const fresh = this.db.all<{ id: number }>(
      sql`SELECT title_id AS id FROM episodes WHERE added_at > ${now - 14 * 86400} GROUP BY title_id ORDER BY MAX(added_at) DESC LIMIT 20`,
    );
    const list = this.db
      .select()
      .from(myList)
      .where(eq(myList.profileId, ctx.profileId))
      .orderBy(desc(myList.addedAt))
      .all();
    const wanted = new Set<number>([
      ...[...all]
        .sort((a, b) => b.addedAt - a.addedAt)
        .slice(0, 150)
        .map((r) => r.id),
      ...[...all]
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 80)
        .map((r) => r.id),
      ...fresh.map((f) => f.id),
      ...list.map((l) => l.titleId),
    ]);
    const cards = this.cards(
      all.filter((r) => wanted.has(r.id)),
      ctx,
    );
    const byId = new Map(cards.map((c) => [c.id, c]));
    const rows: HomeRow[] = [];

    const cont = this.continueWatching(ctx);
    if (cont.length) rows.push({ id: 'continue', items: cont });

    const listCards = list
      .map((l) => byId.get(l.titleId))
      .filter((c): c is TitleCard => Boolean(c));
    if (listCards.length) rows.push({ id: 'myList', items: listCards });

    const recent = [...cards].sort((a, b) => b.addedAt - a.addedAt).slice(0, 20);
    if (recent.length) rows.push({ id: 'recent', items: recent });

    const popularity = new Map(all.map((r) => [r.id, r.popularity]));
    const trending = [...cards]
      .sort((a, b) => (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0))
      .slice(0, 20);
    if (trending.some((c) => (popularity.get(c.id) ?? 0) > 0))
      rows.push({ id: 'trending', items: trending });

    const freshCards = fresh.map((f) => byId.get(f.id)).filter((c): c is TitleCard => Boolean(c));
    if (freshCards.length) rows.push({ id: 'newEpisodes', items: freshCards });

    const genreCount = new Map<string, TitleCard[]>();
    for (const c of cards)
      for (const g of c.genres) genreCount.set(g, [...(genreCount.get(g) ?? []), c]);
    [...genreCount.entries()]
      .filter(([, items]) => items.length >= 3)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 4)
      .forEach(([label, items]) => rows.push({ id: 'genre', label, items: items.slice(0, 20) }));

    const hero = [...cards]
      .filter((c) => c.backdrop)
      .sort((a, b) => {
        const score = (c: TitleCard) =>
          (popularity.get(c.id) ?? 0) + Math.max(0, 30 - (now - c.addedAt) / 86400);
        return score(b) - score(a);
      })
      .slice(0, 8);

    const live = listChannels(this.db, ctx.profileId)
      .sort((a, b) => Number(b.favourite) - Number(a.favourite))
      .slice(0, 14);

    return { hero, rows, live, pending: cards.some((c) => c.pending) };
  }

  list(
    opts: {
      kind?: 'movie' | 'series';
      genre?: string;
      sort?: 'recent' | 'title' | 'rating' | 'year';
    },
    ctx: Ctx,
  ): { items: TitleCard[]; genres: string[]; pending: boolean } {
    const rows = this.allTitles().filter((r) => !opts.kind || r.kind === opts.kind);
    const cards = this.cards(rows, ctx);
    const genres = [...new Set(cards.flatMap((c) => c.genres))].sort((a, b) =>
      a.localeCompare(b, ctx.lang),
    );
    let items = opts.genre ? cards.filter((c) => c.genres.includes(opts.genre!)) : cards;
    const sort = opts.sort ?? 'recent';
    items = [...items].sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title, ctx.lang)
        : sort === 'rating'
          ? (b.rating ?? 0) - (a.rating ?? 0)
          : sort === 'year'
            ? (b.year ?? 0) - (a.year ?? 0)
            : b.addedAt - a.addedAt,
    );
    return { items, genres, pending: cards.some((c) => c.pending) };
  }

  myList(ctx: Ctx): TitleCard[] {
    const list = this.db
      .select()
      .from(myList)
      .where(eq(myList.profileId, ctx.profileId))
      .orderBy(desc(myList.addedAt))
      .all();
    const rows = list
      .map((l) => this.db.select().from(titles).where(eq(titles.id, l.titleId)).get())
      .filter((r): r is TitleRow => Boolean(r));
    return this.cards(rows, ctx);
  }

  filesFor(titleId: number): FileRow[] {
    return this.db.select().from(files).where(eq(files.titleId, titleId)).all();
  }

  private chatNames(): Map<string, string> {
    return new Map(
      this.db
        .select()
        .from(sources)
        .all()
        .map((c) => [c.chatId, c.title]),
    );
  }

  /** The file Play uses for a movie (scope "title") or an episode (scope "episode"). */
  pick(list: FileRow[], ctx: Ctx, scope: 'title' | 'episode', refId: number): FileRow | undefined {
    const saved = this.db
      .select()
      .from(versionChoice)
      .where(
        and(
          eq(versionChoice.profileId, ctx.profileId),
          eq(versionChoice.scope, scope),
          eq(versionChoice.refId, refId),
        ),
      )
      .get();
    return bestFile(list, { chosen: saved?.fileId, quality: ctx.quality });
  }

  /** Every release of a movie or episode, best first, with the one Play will use marked. */
  versionsOf(scope: 'title' | 'episode', refId: number, ctx: Ctx): FileVersion[] {
    const list =
      scope === 'title'
        ? this.filesFor(refId)
        : this.db.select().from(files).where(eq(files.episodeId, refId)).all();
    const chosen = this.pick(list, ctx, scope, refId)?.id;
    const chats = this.chatNames();
    return [...list]
      .sort(
        (a, b) =>
          (QUALITY_RANK[b.quality ?? ''] ?? 2) - (QUALITY_RANK[a.quality ?? ''] ?? 2) ||
          b.size - a.size,
      )
      .map((f) => toVersion(f, chats.get(f.chatId) ?? '', f.id === chosen));
  }

  setChoice(ctx: Ctx, scope: 'title' | 'episode', refId: number, fileId: number): void {
    const values = { profileId: ctx.profileId, scope, refId, fileId };
    this.db
      .insert(versionChoice)
      .values(values)
      .onConflictDoUpdate({
        target: [versionChoice.profileId, versionChoice.scope, versionChoice.refId],
        set: { fileId },
      })
      .run();
  }

  /** The file a Play button should start: the resume point, the next unseen episode, or the first one. */
  playTarget(row: TitleRow, ctx: Ctx): { fileId: number; label: string | null } | null {
    if (row.kind === 'movie') {
      const f = this.pick(this.filesFor(row.id), ctx, 'title', row.id);
      return f ? { fileId: f.id, label: null } : null;
    }
    const eps = this.db
      .select()
      .from(episodes)
      .where(eq(episodes.titleId, row.id))
      .orderBy(episodes.season, episodes.episode)
      .all();
    if (!eps.length) return null;
    const fileOf = (epId: number) =>
      this.pick(
        this.db.select().from(files).where(eq(files.episodeId, epId)).all(),
        ctx,
        'episode',
        epId,
      );
    const mine = this.progressRows(ctx).filter((r) => r.p.titleId === row.id && r.e);
    const inProgress = mine.find((r) => !r.p.completed && r.p.position >= 5);
    let target = eps[0]!;
    if (inProgress?.e) {
      target = eps.find((e) => e.id === inProgress.e!.id) ?? target;
    } else if (mine.length) {
      // Everything seen so far is finished: continue after the furthest finished episode.
      const furthest = Math.max(...mine.map((r) => eps.findIndex((e) => e.id === r.e!.id)));
      target = eps[furthest + 1] ?? eps[0]!;
    }
    const f = fileOf(target.id);
    return f ? { fileId: f.id, label: episodeLabel(target.season, target.episode) } : null;
  }

  similar(row: TitleRow, card: TitleCard, ctx: Ctx): TitleCard[] {
    const others = this.allTitles().filter((r) => r.id !== row.id);
    const cards = this.cards(others, ctx);
    return cards
      .map((c) => ({ c, overlap: c.genres.filter((g) => card.genres.includes(g)).length }))
      .filter((x) => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || (b.c.rating ?? 0) - (a.c.rating ?? 0))
      .slice(0, 12)
      .map((x) => x.c);
  }

  detail(id: number, ctx: Ctx): TitleDetail | null {
    const row = this.db.select().from(titles).where(eq(titles.id, id)).get();
    if (!row) return null;
    const card = this.cards([row], ctx)[0]!;
    // Everything beyond the basics comes from TMDB's data. A title still opens, with less detail,
    // if some part of that data has an unexpected shape.
    const safe = <T>(fn: () => T, fallback: T): T => {
      try {
        return fn();
      } catch (err) {
        console.error(`detail(${id}):`, err);
        return fallback;
      }
    };
    const m = safe(
      () =>
        row.tmdbId
          ? (this.meta.peek(row.kind, row.tmdbId, ctx.lang) ??
            this.meta.peek(row.kind, row.tmdbId, 'en'))
          : null,
      null,
    );
    const target = safe(() => this.playTarget(row, ctx), null);
    const seasonRows = this.db.all<{ season: number; n: number }>(
      sql`SELECT season, COUNT(*) AS n FROM episodes WHERE title_id = ${id} GROUP BY season ORDER BY season`,
    );
    const prog = safe(
      () =>
        target
          ? this.progressRows(ctx).find(
              (r) => r.p.fileId === target.fileId && !r.p.completed && r.p.position >= 5,
            )
          : undefined,
      undefined,
    );
    return {
      ...card,
      progress: prog
        ? {
            fileId: prog.p.fileId,
            position: prog.p.position,
            duration: prog.p.duration,
            updatedAt: prog.p.updatedAt,
          }
        : undefined,
      tagline: m?.tagline ?? '',
      certification: m?.certification ?? null,
      originalLanguage: m?.originalLanguage ?? null,
      cast: safe(
        () =>
          (m?.cast ?? []).map((c) => ({
            name: c.name,
            role: c.role,
            photo: c.photo ? { id: c.photo, color: this.meta.colorFor(c.photo), lang: null } : null,
          })),
        [],
      ),
      trailer: m?.trailer ?? null,
      seasonList: seasonRows.map((s) => ({ season: s.season, name: '', episodes: s.n })),
      similar: safe(() => this.similar(row, card, ctx), []),
      playFileId: target?.fileId ?? null,
      playLabel: target?.label ?? null,
      versions: safe(() => (row.kind === 'movie' ? this.versionsOf('title', id, ctx) : []), []),
    };
  }

  async episodeList(titleId: number, season: number, ctx: Ctx): Promise<EpisodeItem[]> {
    const row = this.db.select().from(titles).where(eq(titles.id, titleId)).get();
    if (!row) return [];
    const eps = this.db
      .select()
      .from(episodes)
      .where(and(eq(episodes.titleId, titleId), eq(episodes.season, season)))
      .orderBy(episodes.episode)
      .all();
    const info = row.tmdbId ? await this.meta.season(row.tmdbId, season, ctx.lang) : null;
    const prog = new Map(
      this.progressRows(ctx)
        .filter((r) => r.p.titleId === titleId)
        .map((r) => [r.p.fileId, r.p]),
    );
    return eps.map<EpisodeItem>((e) => {
      const versions = this.db.select().from(files).where(eq(files.episodeId, e.id)).all();
      const best = this.pick(versions, ctx, 'episode', e.id);
      const raw = info?.episodes.find((x) => x.episode_number === e.episode);
      const p = best ? prog.get(best.id) : undefined;
      return {
        id: e.id,
        season: e.season,
        episode: e.episode,
        name: raw?.name || '',
        overview: raw?.overview ?? '',
        still: raw?.still_path
          ? { id: raw.still_path, color: this.meta.colorFor(raw.still_path), lang: null }
          : null,
        runtime: raw?.runtime ?? (best?.duration ? Math.round(best.duration / 60) : null),
        airDate: raw?.air_date ?? null,
        fileId: best?.id ?? null,
        versions: versions.length,
        progress: p
          ? { fileId: p.fileId, position: p.position, duration: p.duration, updatedAt: p.updatedAt }
          : undefined,
      };
    });
  }

  search(q: string, ctx: Ctx): SearchResults {
    const needle = titleKey(q);
    if (!needle) return { movies: [], series: [], channels: [] };
    const all = this.allTitles();
    // Rank on names alone, then build cards only for the few that will be shown. Building a card
    // for every title in the library on each keystroke is far too slow on a phone.
    const metas = this.metaFor(all, ctx.lang);
    const rank = (row: TitleRow): number => {
      const names = [titleKey(metas.get(row.id)?.meta.title ?? ''), titleKey(row.name)];
      if (names.some((n) => n === needle)) return 3;
      if (names.some((n) => n.startsWith(needle))) return 2;
      if (names.some((n) => n.includes(needle))) return 1;
      return 0;
    };
    const scored = all
      .map((row) => ({ row, s: rank(row), r: metas.get(row.id)?.meta.rating ?? 0 }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || b.r - a.r);
    const top = (kind: 'movie' | 'series') =>
      this.cards(
        scored
          .filter((x) => x.row.kind === kind)
          .slice(0, 14)
          .map((x) => x.row),
        ctx,
      );
    const hits = { movies: top('movie'), series: top('series') };
    const channels: Channel[] = listChannels(this.db, ctx.profileId)
      .filter((c) => titleKey(c.name).includes(needle) || titleKey(c.group).includes(needle))
      .slice(0, 12);
    return { movies: hits.movies, series: hits.series, channels };
  }

  // --- profile state -------------------------------------------------------------------------

  setList(ctx: Ctx, titleId: number, on: boolean): void {
    if (on)
      this.db
        .insert(myList)
        .values({ profileId: ctx.profileId, titleId, addedAt: Math.floor(Date.now() / 1000) })
        .onConflictDoNothing()
        .run();
    else
      this.db
        .delete(myList)
        .where(and(eq(myList.profileId, ctx.profileId), eq(myList.titleId, titleId)))
        .run();
  }

  setLike(ctx: Ctx, titleId: number, on: boolean): void {
    if (on)
      this.db
        .insert(likes)
        .values({ profileId: ctx.profileId, titleId })
        .onConflictDoNothing()
        .run();
    else
      this.db
        .delete(likes)
        .where(and(eq(likes.profileId, ctx.profileId), eq(likes.titleId, titleId)))
        .run();
  }

  saveProgress(profileId: number, fileId: number, position: number, duration: number): void {
    const f = this.db.select().from(files).where(eq(files.id, fileId)).get();
    if (!f?.titleId || !(duration > 0)) return;
    const completed = position / duration >= COMPLETE_RATIO || duration - position < 45;
    const values = {
      profileId,
      fileId,
      titleId: f.titleId,
      position,
      duration,
      completed,
      updatedAt: Math.floor(Date.now() / 1000),
    };
    this.db
      .insert(progress)
      .values(values)
      .onConflictDoUpdate({ target: [progress.profileId, progress.fileId], set: values })
      .run();
  }

  clearProgress(profileId: number, titleId: number): void {
    this.db
      .delete(progress)
      .where(and(eq(progress.profileId, profileId), eq(progress.titleId, titleId)))
      .run();
  }

  resumeFor(profileId: number, fileId: number): number {
    const p = this.db
      .select()
      .from(progress)
      .where(and(eq(progress.profileId, profileId), eq(progress.fileId, fileId)))
      .get();
    return p && !p.completed ? p.position : 0;
  }
}
