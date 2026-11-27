import { describe, expect, it } from 'vitest';
import { languageOrder, pickImage } from './artwork.js';
import { resolveMeta, scoreCandidate } from './localize.js';
import type { RawDetails, SearchHit, TmdbImage } from './types.js';
import { titleKey } from '../parser/filename.js';

const img = (file: string, lang: string | null, vote = 5, count = 10, width = 1000): TmdbImage => ({
  file_path: file,
  iso_639_1: lang,
  vote_average: vote,
  vote_count: count,
  width,
  height: width * 1.5,
});

describe('pickImage', () => {
  const posters = [
    img('/en-low.jpg', 'en', 5.1),
    img('/en-high.jpg', 'en', 6.2),
    img('/he.jpg', 'he', 4.0),
    img('/he-best.jpg', 'he', 5.5),
    img('/neutral.jpg', null, 7.5),
  ];

  it('prefers the highest voted image in the chosen language', () => {
    expect(pickImage(posters, 'he', 'poster')?.path).toBe('/he-best.jpg');
  });

  it('falls back to English, then to language-neutral', () => {
    expect(pickImage(posters, 'fr', 'poster')?.path).toBe('/en-high.jpg');
    expect(
      pickImage(
        posters.filter((p) => p.iso_639_1 !== 'en'),
        'fr',
        'poster',
      )?.path,
    ).toBe('/neutral.jpg');
  });

  it('uses the English poster directly for English', () => {
    expect(pickImage(posters, 'en', 'poster')?.lang).toBe('en');
  });

  it('breaks ties on vote count, then width', () => {
    const tied = [
      img('/a.jpg', 'de', 5, 3),
      img('/b.jpg', 'de', 5, 9),
      img('/c.jpg', 'de', 5, 9, 2000),
    ];
    expect(pickImage(tied, 'de', 'poster')?.path).toBe('/c.jpg');
  });

  it('never returns a foreign logo, so the UI can typeset the title instead', () => {
    const logos = [img('/ja.png', 'ja', 9)];
    expect(pickImage(logos, 'es', 'logo')).toBeNull();
    expect(pickImage([], 'es', 'logo')).toBeNull();
    expect(pickImage(undefined, 'es', 'logo')).toBeNull();
  });

  it('uses any poster as a last resort', () => {
    expect(pickImage([img('/ja.jpg', 'ja')], 'es', 'poster')?.path).toBe('/ja.jpg');
  });

  it('prefers a textless backdrop over an English one', () => {
    const backdrops = [img('/en.jpg', 'en', 8), img('/none.jpg', null, 5)];
    expect(pickImage(backdrops, 'tr', 'backdrop')?.path).toBe('/none.jpg');
    expect(pickImage([...backdrops, img('/tr.jpg', 'tr', 1)], 'tr', 'backdrop')?.path).toBe(
      '/tr.jpg',
    );
  });

  it('builds de-duplicated language orders', () => {
    expect(languageOrder('poster', 'en')).toEqual(['en', null]);
    expect(languageOrder('poster', 'he')).toEqual(['he', 'en', null]);
    expect(languageOrder('backdrop', 'he')).toEqual(['he', null, 'en']);
  });
});

describe('resolveMeta', () => {
  const he: RawDetails = {
    id: 1,
    title: 'נמל',
    overview: '',
    genres: [{ id: 1, name: 'דרמה' }],
    release_date: '2019-05-01',
    runtime: 118,
    vote_average: 7.34,
    images: {
      posters: [img('/he.jpg', 'he'), img('/en.jpg', 'en')],
      logos: [img('/logo-en.png', 'en')],
    },
  };
  const en: RawDetails = {
    id: 1,
    title: 'Harbour',
    overview: 'A quiet port.',
    tagline: 'Hold the line.',
  };

  it('fills untranslated text from English, except taglines', () => {
    const m = resolveMeta('movie', he, en, 'he');
    expect(m.title).toBe('נמל');
    expect(m.overview).toBe('A quiet port.');
    expect(m.tagline).toBe('');
    expect(m.genres).toEqual(['דרמה']);
  });

  it('resolves artwork per language with fallbacks', () => {
    const m = resolveMeta('movie', he, en, 'he');
    expect(m.poster?.path).toBe('/he.jpg');
    expect(m.logo).toEqual({ path: '/logo-en.png', lang: 'en' });
    expect(m.year).toBe(2019);
    expect(m.rating).toBe(7.3);
  });

  it('reads TV fields', () => {
    const tv: RawDetails = {
      id: 2,
      name: 'Salt Line',
      first_air_date: '2021-03-03',
      episode_run_time: [48],
      seasons: [
        { season_number: 0, name: 'Specials', episode_count: 2 },
        { season_number: 1, name: 'Season 1', episode_count: 8 },
      ],
    };
    const m = resolveMeta('series', tv, null, 'en');
    expect(m).toMatchObject({ title: 'Salt Line', year: 2021, runtime: 48 });
    expect(m.seasons).toEqual([{ season: 1, name: 'Season 1', episodes: 8 }]);
  });

  it('picks a trailer and ignores clips', () => {
    const raw: RawDetails = {
      id: 3,
      title: 'X',
      videos: {
        results: [
          { site: 'YouTube', type: 'Clip', key: 'clip' },
          { site: 'YouTube', type: 'Trailer', key: 'trl', official: true },
        ],
      },
    };
    expect(resolveMeta('movie', raw, null, 'en').trailer).toEqual({ site: 'YouTube', key: 'trl' });
  });
});

describe('scoreCandidate', () => {
  const hit = (title: string, year: number, popularity = 10): SearchHit => ({
    id: 1,
    title,
    originalTitle: title,
    year,
    overview: '',
    posterPath: null,
    popularity,
  });
  const parsed = { title: 'The Long Harbour', year: 2019 };

  it('rewards exact title and year', () => {
    expect(scoreCandidate(parsed, hit('The Long Harbour', 2019), titleKey)).toBeGreaterThan(1);
  });
  it('penalises a wrong year', () => {
    const right = scoreCandidate(parsed, hit('The Long Harbour', 2019), titleKey);
    const wrong = scoreCandidate(parsed, hit('The Long Harbour', 1987), titleKey);
    expect(right - wrong).toBeGreaterThan(0.3);
  });
  it('scores unrelated titles low', () => {
    expect(scoreCandidate(parsed, hit('Desert Moon', 2019), titleKey)).toBeLessThan(0.5);
  });
});
