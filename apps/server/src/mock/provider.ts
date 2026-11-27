import { languageInfo, type LanguageCode, type TitleKind } from '@marquee/shared';
import { titleKey } from '../parser/filename.js';
import { similarity } from '../metadata/localize.js';
import type {
  MetadataProvider,
  RawDetails,
  RawSeason,
  SearchHit,
  TmdbImage,
} from '../metadata/types.js';
import {
  CAST,
  EPISODE_NAMES,
  EPISODE_WORD,
  GENRES,
  MOCK_CATALOG,
  findMock,
  type MockTitle,
} from './catalog.js';

function images(t: MockTitle, kind: 'poster' | 'logo', langs: LanguageCode[]): TmdbImage[] {
  return langs.map((l, i) => ({
    file_path: `mock/${t.slug}/${kind}/${l}`,
    iso_639_1: l,
    vote_average: 6 - i * 0.1,
    vote_count: 20,
    width: kind === 'poster' ? 500 : 900,
    height: kind === 'poster' ? 750 : 300,
  }));
}

function toDetails(t: MockTitle, lang: LanguageCode): RawDetails {
  const date = `${t.year}-04-12`;
  const isMovie = t.kind === 'movie';
  return {
    id: t.id,
    [isMovie ? 'title' : 'name']: t.title[lang],
    [isMovie ? 'original_title' : 'original_name']: t.title.en,
    overview: t.overview[lang],
    // Taglines exist in English only, which exercises the fallback to English text.
    tagline: lang === 'en' ? t.tagline : '',
    genres: t.genres.map((g, i) => ({ id: i, name: GENRES[g][lang] })),
    [isMovie ? 'release_date' : 'first_air_date']: date,
    [isMovie ? 'runtime' : 'episode_run_time']: isMovie ? t.runtime : [t.runtime],
    vote_average: t.rating,
    popularity: t.popularity,
    original_language: 'en',
    images: {
      posters: images(t, 'poster', t.posterLangs),
      logos: images(t, 'logo', t.logoLangs),
      backdrops: [
        {
          file_path: `mock/${t.slug}/backdrop/0`,
          iso_639_1: null,
          vote_average: 6,
          vote_count: 20,
          width: 1280,
          height: 720,
        },
      ],
    },
    credits: {
      cast: CAST.map(([name, character], i) => ({
        name,
        character,
        profile_path: null,
        order: (i + t.id) % 10,
      })),
    },
    videos: {
      results: [
        {
          site: 'File',
          type: 'Trailer',
          key: `/api/mock/sample/${(t.id % 3) + 1}.webm`,
          official: true,
        },
      ],
    },
    release_dates: {
      results: [
        {
          iso_3166_1: 'US',
          release_dates: [{ certification: t.rating > 7.5 ? 'R' : 'PG-13', type: 3 }],
        },
      ],
    },
    content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] },
    seasons: t.seasons.map((n, i) => ({
      season_number: i + 1,
      name: `Season ${i + 1}`,
      episode_count: n,
    })),
  } as RawDetails;
}

export class MockProvider implements MetadataProvider {
  readonly name = 'mock';

  async search(kind: TitleKind, query: string): Promise<SearchHit[]> {
    const q = titleKey(query);
    return MOCK_CATALOG.filter((t) => t.kind === kind)
      .map((t) => ({ t, s: similarity(q, titleKey(t.title.en)) }))
      .filter(({ s }) => s > 0.2 || !q)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .map(({ t }) => ({
        id: t.id,
        title: t.title.en,
        originalTitle: t.title.en,
        year: t.year,
        overview: t.overview.en,
        posterPath: `mock/${t.slug}/poster/en`,
        popularity: t.popularity,
      }));
  }

  async details(
    kind: TitleKind,
    id: number,
    _tmdbLang: string,
    uiLang: string,
  ): Promise<RawDetails> {
    const t = findMock(id);
    if (!t) throw new Error(`Unknown mock title ${id}`);
    return toDetails(t, languageInfo(uiLang).code);
  }

  async season(
    tvId: number,
    season: number,
    _tmdbLang: string,
    uiLang: string,
  ): Promise<RawSeason> {
    const t = findMock(tvId);
    const count = t?.seasons[season - 1] ?? 0;
    const lang = languageInfo(uiLang).code;
    return {
      season_number: season,
      episodes: Array.from({ length: count }, (_, i) => ({
        episode_number: i + 1,
        name:
          lang === 'en'
            ? (EPISODE_NAMES[(i + season * 3) % EPISODE_NAMES.length] ?? `Episode ${i + 1}`)
            : `${EPISODE_WORD[lang]} ${i + 1}`,
        overview: lang === 'en' ? 'The crew follows a lead that was never meant to be found.' : '',
        still_path: `mock/${t?.slug ?? 'x'}/backdrop/0`,
        runtime: t?.runtime ?? 45,
        air_date: `${(t?.year ?? 2022) + season - 1}-0${(i % 9) + 1}-14`,
      })),
    };
  }
}
