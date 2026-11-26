import type { TitleKind } from '@marquee/shared';

export interface TmdbImage {
  file_path: string;
  iso_639_1: string | null;
  vote_average: number;
  vote_count: number;
  width: number;
  height: number;
}

export interface TmdbImages {
  posters?: TmdbImage[];
  backdrops?: TmdbImage[];
  logos?: TmdbImage[];
}

/** The subset of TMDB's movie and TV detail payloads that Marquee reads. */
export interface RawDetails {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  tagline?: string;
  genres?: { id: number; name: string }[];
  release_date?: string;
  first_air_date?: string;
  runtime?: number | null;
  episode_run_time?: number[];
  vote_average?: number;
  popularity?: number;
  original_language?: string;
  images?: TmdbImages;
  credits?: { cast?: { name: string; character?: string; profile_path?: string | null; order?: number }[] };
  videos?: { results?: { site: string; type: string; key: string; iso_639_1?: string; official?: boolean }[] };
  release_dates?: {
    results?: { iso_3166_1: string; release_dates: { certification: string; type: number }[] }[];
  };
  content_ratings?: { results?: { iso_3166_1: string; rating: string }[] };
  seasons?: { season_number: number; name: string; episode_count: number }[];
}

export interface RawSeason {
  season_number: number;
  episodes: {
    episode_number: number;
    name: string;
    overview: string;
    still_path: string | null;
    runtime: number | null;
    air_date: string | null;
  }[];
}

export interface SearchHit {
  id: number;
  title: string;
  originalTitle: string;
  year: number | null;
  overview: string;
  posterPath: string | null;
  popularity: number;
}

export interface MetadataProvider {
  readonly name: string;
  search(kind: TitleKind, query: string, year: number | null, tmdbLang: string): Promise<SearchHit[]>;
  details(kind: TitleKind, id: number, tmdbLang: string, uiLang: string): Promise<RawDetails>;
  season(tvId: number, season: number, tmdbLang: string, uiLang: string): Promise<RawSeason>;
}

export interface ImagePick {
  path: string;
  lang: string | null;
}

/** Everything the UI needs for one title in one language. Cached per language. */
export interface LocalizedMeta {
  title: string;
  originalTitle: string;
  overview: string;
  tagline: string;
  genres: string[];
  year: number | null;
  runtime: number | null;
  rating: number | null;
  popularity: number;
  certification: string | null;
  originalLanguage: string | null;
  poster: ImagePick | null;
  backdrop: ImagePick | null;
  logo: ImagePick | null;
  cast: { name: string; role: string; photo: string | null }[];
  trailer: { site: 'YouTube' | 'file'; key: string } | null;
  seasons: { season: number; name: string; episodes: number }[];
}
