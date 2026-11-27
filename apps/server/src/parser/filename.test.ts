import { describe, expect, it } from 'vitest';
import { parseFileName, parseMedia, titleKey } from './filename.js';

describe('parseFileName: movies', () => {
  it('parses a dotted scene release', () => {
    const p = parseFileName('The.Long.Harbour.2019.1080p.BluRay.x264-GRP.mkv');
    expect(p).toMatchObject({
      title: 'The Long Harbour',
      year: 2019,
      quality: '1080p',
      source: 'BLURAY',
      codec: 'h264',
      isSeries: false,
    });
  });

  it('parses spaces and parentheses', () => {
    const p = parseFileName('Glass Orchard (2021) 2160p WEB-DL HEVC.mp4');
    expect(p).toMatchObject({
      title: 'Glass Orchard',
      year: 2021,
      quality: '2160p',
      codec: 'hevc',
    });
  });

  it('treats a leading year as part of the title', () => {
    const p = parseFileName('1917.2019.720p.WEBRip.mkv');
    expect(p).toMatchObject({ title: '1917', year: 2019, quality: '720p' });
  });

  it('keeps numbers inside titles', () => {
    const p = parseFileName('Apollo 13 1995 1080p BluRay.mkv');
    expect(p).toMatchObject({ title: 'Apollo 13', year: 1995 });
  });

  it('normalises 4K and UHD', () => {
    expect(parseFileName('Some.Film.2020.4K.HDR.mkv').quality).toBe('2160p');
    expect(parseFileName('Some.Film.2020.UHD.mkv').quality).toBe('2160p');
  });

  it('title-cases all-lowercase names', () => {
    expect(parseFileName('the_last_signal_2018_720p.mp4').title).toBe('The Last Signal');
  });

  it('handles a name with no metadata at all', () => {
    const p = parseFileName('Quiet Rooms.mp4');
    expect(p).toMatchObject({ title: 'Quiet Rooms', year: null, isSeries: false, quality: null });
  });

  it('reads languages and subtitles', () => {
    const p = parseFileName('Night.Bus.2017.1080p.WEB-DL.Hebrew.English.HebSubs.mkv');
    expect(p.audioLangs).toEqual(expect.arrayContaining(['he', 'en']));
    expect(p.subLangs).toContain('he');
  });

  it('reads dual-audio releases', () => {
    expect(parseFileName('Neon.Quarter.2022.DUAL.AUDIO.1080p.mkv').audioLangs).toContain('en');
  });

  it('works with non-latin titles', () => {
    const p = parseFileName('חוף השקט 2020 1080p WEB-DL.mkv');
    expect(p).toMatchObject({ title: 'חוף השקט', year: 2020 });
  });
});

describe('parseFileName: series', () => {
  it('parses SxxExx', () => {
    const p = parseFileName('Salt.Line.S02E05.1080p.WEB-DL.DDP5.1.x264-GRP.mkv');
    expect(p).toMatchObject({ title: 'Salt Line', season: 2, episode: 5, isSeries: true });
  });

  it('parses lowercase s01e01 with spaces', () => {
    const p = parseFileName('night shift s01e10 720p.mkv');
    expect(p).toMatchObject({ title: 'Night Shift', season: 1, episode: 10 });
  });

  it('parses multi-episode files', () => {
    const p = parseFileName('Salt.Line.S01E01-E02.720p.mkv');
    expect(p).toMatchObject({ season: 1, episode: 1, episodeEnd: 2 });
  });

  it('parses 1x05', () => {
    const p = parseFileName('Harbor Lights 3x07.avi');
    expect(p).toMatchObject({ title: 'Harbor Lights', season: 3, episode: 7 });
  });

  it('parses "Season 2 Episode 3"', () => {
    const p = parseFileName('Paper Moons Season 2 Episode 3.mp4');
    expect(p).toMatchObject({ title: 'Paper Moons', season: 2, episode: 3 });
  });

  it('keeps the year of a series when present', () => {
    const p = parseFileName('Lowtide.2022.S01E03.1080p.mkv');
    expect(p).toMatchObject({ title: 'Lowtide', year: 2022, season: 1, episode: 3 });
  });

  it('parses anime-style names', () => {
    const p = parseFileName('[Group] Sky Archive - 07 [1080p].mkv');
    expect(p).toMatchObject({ title: 'Sky Archive', episode: 7, group: 'Group', isSeries: true });
  });

  it('parses Hebrew season and episode words', () => {
    const p = parseFileName('הכוכב עונה 2 פרק 4.mp4');
    expect(p).toMatchObject({ title: 'הכוכב', season: 2, episode: 4 });
  });
});

describe('parseMedia', () => {
  it('falls back to the caption when the file name is generic', () => {
    const p = parseMedia({ fileName: 'video_123.mp4', caption: 'Glass Orchard (2021) 1080p' });
    expect(p).toMatchObject({ title: 'Glass Orchard', year: 2021, quality: '1080p' });
  });

  it('prefers the richer of file name and caption', () => {
    const p = parseMedia({ fileName: 'x.mkv', caption: 'Salt Line S01E02' });
    expect(p).toMatchObject({ title: 'Salt Line', season: 1, episode: 2 });
  });

  it('uses only the first non-empty caption line', () => {
    const p = parseMedia({ fileName: null, caption: '\n**Quiet Rooms** 2020\nJoin our channel' });
    expect(p).toMatchObject({ title: 'Quiet Rooms', year: 2020 });
  });
});

describe('titleKey', () => {
  it('ignores case, articles and punctuation', () => {
    expect(titleKey('The Long Harbour!')).toBe(titleKey('long harbour'));
  });
  it('strips diacritics', () => {
    expect(titleKey('Amélie')).toBe('amelie');
  });
  it('keeps non-latin scripts', () => {
    expect(titleKey('חוף השקט')).toBe('חוף השקט');
  });
});
