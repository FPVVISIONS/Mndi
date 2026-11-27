import type { TitleKind } from '@marquee/shared';
import { pickImage } from './artwork.js';
import type { LocalizedMeta, RawDetails, SearchHit } from './types.js';

function yearOf(date: string | undefined): number | null {
  const y = Number(date?.slice(0, 4));
  return Number.isFinite(y) && y > 1800 ? y : null;
}

function certificationOf(raw: RawDetails): string | null {
  const movie = raw.release_dates?.results ?? [];
  const tv = raw.content_ratings?.results ?? [];
  for (const country of ['US', 'GB', 'DE']) {
    const m = movie.find((r) => r.iso_3166_1 === country);
    const cert = m?.release_dates.find((d) => d.certification)?.certification;
    if (cert) return cert;
    const t = tv.find((r) => r.iso_3166_1 === country)?.rating;
    if (t) return t;
  }
  return null;
}

function trailerOf(raw: RawDetails, lang: string): LocalizedMeta['trailer'] {
  const list = (raw.videos?.results ?? []).filter((v) => v.site === 'YouTube' || v.site === 'File');
  const rank = (v: (typeof list)[number]) =>
    (v.type === 'Trailer' ? 4 : v.type === 'Teaser' ? 2 : 0) +
    (v.official ? 1 : 0) +
    (v.iso_639_1 === lang ? 0.5 : 0);
  const best = list.filter((v) => rank(v) >= 2).sort((a, b) => rank(b) - rank(a))[0];
  return best ? { site: best.site === 'File' ? 'file' : 'YouTube', key: best.key } : null;
}

/**
 * Turn a raw TMDB payload into the UI shape for one language.
 * Text that TMDB has not translated comes back empty, so it is filled from the English payload.
 */
export function resolveMeta(
  kind: TitleKind,
  raw: RawDetails,
  english: RawDetails | null,
  lang: string,
): LocalizedMeta {
  const pick = <T>(a: T | undefined | null, b: T | undefined | null): T | undefined => {
    const empty = (v: unknown) =>
      v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    return !empty(a) ? (a as T) : !empty(b) ? (b as T) : undefined;
  };

  const title = pick(
    kind === 'movie' ? raw.title : raw.name,
    kind === 'movie' ? english?.title : english?.name,
  );
  const originalTitle = (kind === 'movie' ? raw.original_title : raw.original_name) ?? title ?? '';
  const images = raw.images ?? english?.images;
  const date = kind === 'movie' ? raw.release_date : raw.first_air_date;
  const runtime = kind === 'movie' ? raw.runtime : raw.episode_run_time?.[0];

  return {
    title: title ?? originalTitle,
    originalTitle,
    overview: pick(raw.overview, english?.overview) ?? '',
    // Taglines are copywriting; an English one under a Hebrew UI reads as a bug, so no fallback.
    tagline: raw.tagline ?? '',
    genres: (pick(raw.genres, english?.genres) ?? []).map((g) => g.name),
    year: yearOf(date),
    runtime: runtime && runtime > 0 ? runtime : null,
    rating: raw.vote_average ? Math.round(raw.vote_average * 10) / 10 : null,
    popularity: raw.popularity ?? 0,
    certification: certificationOf(raw),
    originalLanguage: raw.original_language ?? null,
    poster: pickImage(images?.posters, lang, 'poster'),
    backdrop: pickImage(images?.backdrops, lang, 'backdrop'),
    logo: pickImage(images?.logos, lang, 'logo'),
    cast: (raw.credits?.cast ?? [])
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
      .slice(0, 14)
      .map((c) => ({ name: c.name, role: c.character ?? '', photo: c.profile_path ?? null })),
    trailer: trailerOf(raw, lang) ?? trailerOf(english ?? { id: raw.id }, 'en'),
    seasons: (raw.seasons ?? [])
      .filter((s) => s.season_number > 0 && s.episode_count > 0)
      .map((s) => ({ season: s.season_number, name: s.name, episodes: s.episode_count })),
  };
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/** Dice coefficient over character bigrams, 0 to 1. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let shared = 0;
  for (const g of A) if (B.has(g)) shared++;
  return (2 * shared) / (A.size + B.size);
}

/** Score a TMDB search hit against a parsed title. `norm` should be the titleKey function. */
export function scoreCandidate(
  parsed: { title: string; year: number | null },
  hit: SearchHit,
  norm: (s: string) => string,
): number {
  const wanted = norm(parsed.title);
  const names = [hit.title, hit.originalTitle].map(norm);
  let score = Math.max(...names.map((n) => similarity(wanted, n)));
  if (parsed.year && hit.year) {
    const diff = Math.abs(parsed.year - hit.year);
    score += diff === 0 ? 0.15 : diff === 1 ? 0.05 : -0.25;
  }
  score += Math.min(hit.popularity, 100) / 2000;
  return score;
}
