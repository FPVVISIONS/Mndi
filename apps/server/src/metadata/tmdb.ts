import type { TitleKind } from '@marquee/shared';
import { createLimiter, sleep } from '../lib/async.js';
import type { MetadataProvider, RawDetails, RawSeason, SearchHit } from './types.js';

const BASE = 'https://api.themoviedb.org/3';

interface SearchRow {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  popularity?: number;
}

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class TmdbProvider implements MetadataProvider {
  readonly name = 'tmdb';
  private readonly limit = createLimiter(6);

  constructor(
    private readonly key: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(BASE + path);
    const headers: Record<string, string> = { accept: 'application/json' };
    // v4 read tokens are JWTs; v3 keys are 32 hex characters.
    if (this.key.length > 40) headers.authorization = `Bearer ${this.key}`;
    else url.searchParams.set('api_key', this.key);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    return this.limit(async () => {
      for (let attempt = 0; ; attempt++) {
        const res = await this.fetchImpl(url, { headers });
        if (res.status === 429 && attempt < 4) {
          const wait = Number(res.headers.get('retry-after')) || 2 ** attempt;
          await sleep(wait * 1000);
          continue;
        }
        if (res.status >= 500 && attempt < 2) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        if (!res.ok) throw new TmdbError(`TMDB ${res.status} for ${path}`, res.status);
        return (await res.json()) as T;
      }
    });
  }

  /** True when TMDB accepts the key. */
  async validate(): Promise<boolean> {
    try {
      await this.get('/configuration', {});
      return true;
    } catch {
      return false;
    }
  }

  async search(
    kind: TitleKind,
    query: string,
    year: number | null,
    lang: string,
  ): Promise<SearchHit[]> {
    const params: Record<string, string> = { query, language: lang, include_adult: 'false' };
    if (year) params[kind === 'movie' ? 'year' : 'first_air_date_year'] = String(year);
    const data = await this.get<{ results: SearchRow[] }>(
      `/search/${kind === 'movie' ? 'movie' : 'tv'}`,
      params,
    );
    return data.results.slice(0, 12).map((r) => ({
      id: r.id,
      title: (kind === 'movie' ? r.title : r.name) ?? '',
      originalTitle: (kind === 'movie' ? r.original_title : r.original_name) ?? '',
      year: Number((kind === 'movie' ? r.release_date : r.first_air_date)?.slice(0, 4)) || null,
      overview: r.overview ?? '',
      posterPath: r.poster_path ?? null,
      popularity: r.popularity ?? 0,
    }));
  }

  details(kind: TitleKind, id: number, lang: string, uiLang: string): Promise<RawDetails> {
    const append =
      kind === 'movie'
        ? 'credits,images,videos,release_dates'
        : 'credits,images,videos,content_ratings';
    return this.get<RawDetails>(`/${kind === 'movie' ? 'movie' : 'tv'}/${id}`, {
      language: lang,
      append_to_response: append,
      include_image_language: `${uiLang},en,null`,
      include_video_language: `${uiLang},en,null`,
    });
  }

  season(tvId: number, season: number, lang: string): Promise<RawSeason> {
    return this.get<RawSeason>(`/tv/${tvId}/season/${season}`, { language: lang });
  }
}
