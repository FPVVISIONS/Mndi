export interface ParsedName {
  title: string;
  year: number | null;
  season: number | null;
  episode: number | null;
  /** Last episode of a multi-episode file such as S01E01-E02. */
  episodeEnd: number | null;
  quality: string | null;
  source: string | null;
  codec: string | null;
  audioLangs: string[];
  subLangs: string[];
  group: string | null;
  isSeries: boolean;
}

const VIDEO_EXT = /\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts|wmv|flv|mpg|mpeg|3gp)$/i;

const QUALITY = /\b(2160p|4k|uhd|1440p|1080[pi]|720p|576p|480p|360p)\b/i;
const SOURCE =
  /\b(blu-?ray|bdrip|brrip|bd-?remux|remux|web-?dl|web-?rip|webrip|hdtv|pdtv|dvdrip|dvd-?scr|hdrip|hdcam|hdts|cam|telesync|amzn|nf|dsnp|hmax|atvp)\b/i;
const CODEC = /\b(x264|x265|h\.?264|h\.?265|hevc|avc|av1|xvid|divx|vp9)\b/i;
const AUDIO_TECH =
  /\b(aac|ac3|eac3|dd5\.?1|ddp5\.?1|dts(?:-?hd)?|truehd|atmos|flac|opus|mp3|hdr10?\+?|hdr|dv|dolby|10bit|8bit|imax|extended|unrated|remastered|proper|repack|internal|multi|dual)\b/i;

const LANG_WORDS: Record<string, string> = {
  english: 'en',
  eng: 'en',
  hebrew: 'he',
  heb: 'he',
  hebrew_: 'he',
  arabic: 'ar',
  ara: 'ar',
  spanish: 'es',
  spa: 'es',
  french: 'fr',
  fre: 'fr',
  fra: 'fr',
  german: 'de',
  ger: 'de',
  deu: 'de',
  russian: 'ru',
  rus: 'ru',
  portuguese: 'pt',
  por: 'pt',
  turkish: 'tr',
  tur: 'tr',
  italian: 'it',
  ita: 'it',
  hindi: 'hi',
  japanese: 'ja',
  jpn: 'ja',
  korean: 'ko',
  kor: 'ko',
  chinese: 'zh',
  chi: 'zh',
};

const GENERIC_NAME = /^(video|vid|img|file|movie|clip|document|download|untitled|film)[\s_-]*\d*$/i;

function stripExt(name: string): string {
  return name.replace(VIDEO_EXT, '');
}

/** Replace dots and underscores that act as word separators. */
function dePunctuate(raw: string): string {
  let s = raw.replace(/_/g, ' ');
  const spaces = (s.match(/ /g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;
  if (dots > spaces) s = s.replace(/\.(?=\S)/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

interface Marker {
  index: number;
  length: number;
}

function firstIndex(s: string, ...patterns: RegExp[]): Marker | null {
  let best: Marker | null = null;
  for (const p of patterns) {
    const m = p.exec(s);
    if (m && (best === null || m.index < best.index))
      best = { index: m.index, length: m[0].length };
  }
  return best;
}

const SEASON_EP = [
  /\bs(\d{1,2})[ ._-]?e(\d{1,3})(?:[ ._-]?(?:e|-|–)[ ._-]?e?(\d{1,3}))?/i,
  /\b(\d{1,2})x(\d{2,3})(?:-(\d{2,3}))?\b/i,
  /\bseason[ ._-]?(\d{1,2})[ ._,-]*(?:episode|ep)[ ._-]?(\d{1,3})/i,
  /(?:עונה|موسم|сезон)[ ._-]?(\d{1,2})[ ._,-]*(?:פרק|حلقة|серия)[ ._-]?(\d{1,3})/i,
];
const SEASON_ONLY = /\b(?:season|s)[ ._-]?(\d{1,2})\b(?![ ._-]?e\d)/i;
const EPISODE_ONLY = [
  /\b(?:episode|ep|e)[ ._-]?(\d{1,3})\b/i,
  /(?:פרק|حلقة|серия)[ ._-]?(\d{1,3})/i,
  /\s-\s(\d{2,3})(?:\s|$|v\d)/,
];

export function parseFileName(input: string): ParsedName {
  const original = input.trim();
  let s = stripExt(original);
  let group: string | null = null;

  const groupMatch = /^\[([^\]]{2,30})\]\s*/.exec(s);
  if (groupMatch) {
    group = groupMatch[1] ?? null;
    s = s.slice(groupMatch[0].length);
  }
  const tail = /-([A-Za-z0-9]{2,12})$/.exec(s);
  if (!group && tail && /[. ]/.test(s)) group = tail[1] ?? null;

  s = dePunctuate(s);

  let season: number | null = null;
  let episode: number | null = null;
  let episodeEnd: number | null = null;
  let seMarker: Marker | null = null;

  for (const re of SEASON_EP) {
    const m = re.exec(s);
    if (m) {
      season = Number(m[1]);
      episode = Number(m[2]);
      if (m[3]) episodeEnd = Number(m[3]);
      seMarker = { index: m.index, length: m[0].length };
      break;
    }
  }
  if (!seMarker) {
    const so = SEASON_ONLY.exec(s);
    const eo = EPISODE_ONLY.map((re) => re.exec(s)).find((m) => m !== null) ?? null;
    if (so && (eo || /\b(complete|full)\b/i.test(s))) season = Number(so[1]);
    if (eo) {
      episode = Number(eo[1]);
      if (season === null) season = 1;
    }
    const hits = [season !== null ? so : null, eo].filter((m): m is RegExpExecArray => m !== null);
    if (hits.length) {
      seMarker = { index: Math.min(...hits.map((m) => m.index)), length: 0 };
    }
  }

  const quality = QUALITY.exec(s);
  const source = SOURCE.exec(s);
  const codec = CODEC.exec(s);

  const yearRe = /(?:^|[\s([\-.])((?:19|20)\d{2})(?=$|[\s)\]\-.])/g;
  let year: number | null = null;
  let yearIndex = -1;
  const stops = [quality, source, codec].filter((m): m is RegExpExecArray => m !== null);
  const stopAt = Math.min(...stops.map((m) => m.index), seMarker?.index ?? Infinity, s.length);
  for (const m of s.matchAll(yearRe)) {
    const idx = m.index + m[0].indexOf(m[1] ?? '');
    // A year at the very start is the title ("2012", "1917"), unless nothing else follows.
    if (idx === 0 && s.length > 8) continue;
    if (idx <= stopAt + 1) {
      year = Number(m[1]);
      yearIndex = idx;
    }
  }

  const cutPoints = [
    seMarker?.index,
    yearIndex >= 0 ? yearIndex : undefined,
    quality?.index,
    source?.index,
    codec?.index,
    firstIndex(s, AUDIO_TECH)?.index,
  ].filter((n): n is number => typeof n === 'number' && n > 0);
  let titlePart = cutPoints.length ? s.slice(0, Math.min(...cutPoints)) : s;
  titlePart = titlePart
    .replace(/[([{][^)\]}]*$/g, '')
    .replace(/[\s\-–—:,([{.]+$/g, '')
    .trim();
  if (!titlePart) titlePart = s.replace(/[([{].*$/, '').trim();

  const audioLangs = new Set<string>();
  const subLangs = new Set<string>();
  const subBefore = /\b([a-z]{3,10})[ ._-]?(?:subs?|subbed)\b/gi;
  const subAfter = /\bsubs?[ ._-]([a-z]{3,10})\b/gi;
  for (const m of s.matchAll(subBefore)) {
    const code = LANG_WORDS[(m[1] ?? '').toLowerCase()];
    if (code) subLangs.add(code);
  }
  for (const m of s.matchAll(subAfter)) {
    const code = LANG_WORDS[(m[1] ?? '').toLowerCase()];
    if (code) subLangs.add(code);
  }
  const audioScan = s.replace(subBefore, ' ').replace(subAfter, ' ');
  for (const w of audioScan.toLowerCase().split(/[\s\-+,/.]+/)) {
    const code = LANG_WORDS[w];
    if (code) audioLangs.add(code);
  }
  if (/\bdual[ ._-]?audio\b/i.test(s) && audioLangs.size === 0) audioLangs.add('en');

  const isSeries = season !== null || episode !== null;

  return {
    title: tidyTitle(titlePart),
    year,
    season,
    episode,
    episodeEnd: episodeEnd && episode && episodeEnd > episode ? episodeEnd : null,
    quality: quality ? normalizeQuality(quality[1] ?? '') : null,
    source: source ? source[1]!.toUpperCase().replace('-', '') : null,
    codec: codec ? normalizeCodec(codec[1] ?? '') : null,
    audioLangs: [...audioLangs],
    subLangs: [...subLangs],
    group,
    isSeries,
  };
}

function tidyTitle(t: string): string {
  const clean = t
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–_.]+/, '')
    .trim();
  // Cased letters only (they change between upper and lower case); works without ICU.
  const letters = [...clean].filter((ch) => ch.toLowerCase() !== ch.toUpperCase()).join('');
  const allLower = letters.length > 0 && letters === letters.toLowerCase();
  const allUpper = letters.length > 4 && letters === letters.toUpperCase();
  if (!(allLower || allUpper)) return clean;
  const small = new Set(['a', 'an', 'the', 'of', 'and', 'in', 'on', 'at', 'to', 'for', 'vs']);
  return clean
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function normalizeQuality(q: string): string {
  const l = q.toLowerCase();
  if (l === '4k' || l === 'uhd') return '2160p';
  if (l === '1080i') return '1080p';
  return l;
}

function normalizeCodec(c: string): string {
  const l = c.toLowerCase().replace('.', '');
  if (l === 'h265' || l === 'hevc' || l === 'x265') return 'hevc';
  if (l === 'h264' || l === 'avc' || l === 'x264') return 'h264';
  return l;
}

export interface MediaNameInput {
  fileName?: string | null;
  caption?: string | null;
}

function richness(p: ParsedName): number {
  return (
    (p.title.length > 1 ? 2 : 0) + (p.year ? 1 : 0) + (p.isSeries ? 1 : 0) + (p.quality ? 0.5 : 0)
  );
}

/** Parse a Telegram media message using its file name first and its caption as a fallback. */
export function parseMedia({ fileName, caption }: MediaNameInput): ParsedName {
  const fromFile =
    fileName && !GENERIC_NAME.test(stripExt(fileName)) ? parseFileName(fileName) : null;
  const firstLine = (caption ?? '').split('\n').find((l) => l.trim().length > 1) ?? '';
  const cleanCaption = firstLine.replace(/[*_`#]+/g, '').trim();
  const fromCaption = cleanCaption ? parseFileName(cleanCaption) : null;

  if (fromFile && fromCaption) {
    const best = richness(fromCaption) > richness(fromFile) ? fromCaption : fromFile;
    const other = best === fromFile ? fromCaption : fromFile;
    return {
      ...best,
      year: best.year ?? other.year,
      season: best.season ?? other.season,
      episode: best.episode ?? other.episode,
      quality: best.quality ?? other.quality,
      audioLangs: [...new Set([...best.audioLangs, ...other.audioLangs])],
      subLangs: [...new Set([...best.subLangs, ...other.subLangs])],
      isSeries: best.isSeries || other.isSeries,
    };
  }
  return fromFile ?? fromCaption ?? parseFileName(fileName ?? 'unknown');
}

/*
 * No Unicode property escapes (\p{...}) in this file: the Node.js inside the Android app is built
 * without ICU, where they are a syntax error. Explicit ranges and tables below work everywhere.
 */

/** Combining marks: Latin diacritics, Hebrew points and Arabic harakat. */
const COMBINING = /[\u0300-\u036f\u0591-\u05c7\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;

/** Accent folding for engines whose normalize() cannot decompose (no ICU). */
const ACCENTS: Record<string, string> = Object.fromEntries(
  [
    ['àáâãäåāăą', 'a'],
    ['çćčĉċ', 'c'],
    ['ďđ', 'd'],
    ['èéêëēĕėęě', 'e'],
    ['ğĝġģ', 'g'],
    ['ĥħ', 'h'],
    ['ìíîïĩīĭįı', 'i'],
    ['ĵ', 'j'],
    ['ķ', 'k'],
    ['ĺļľŀł', 'l'],
    ['ñńņňŉ', 'n'],
    ['òóôõöøōŏő', 'o'],
    ['ŕŗř', 'r'],
    ['śŝşšș', 's'],
    ['ţťŧț', 't'],
    ['ùúûüũūŭůűų', 'u'],
    ['ŵ', 'w'],
    ['ýÿŷ', 'y'],
    ['źżž', 'z'],
    ['æ', 'ae'],
    ['œ', 'oe'],
    ['ß', 'ss'],
    ['þ', 'th'],
  ].flatMap(([chars, base]) => [...chars!].map((c) => [c, base!])),
);
const DECOMPOSES = 'é'.normalize('NFD').length === 2;

/** Letters and digits of the scripts Marquee's languages use (plus CJK, Hangul and Thai). */
function isWordChar(ch: string): boolean {
  if (ch.toLowerCase() !== ch.toUpperCase()) return true; // cased letters: Latin, Cyrillic, Greek...
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x30 && c <= 0x39) || // 0-9
    (c >= 0x05d0 && c <= 0x05ea) || // Hebrew letters
    (c >= 0x0620 && c <= 0x064a) ||
    (c >= 0x0660 && c <= 0x0669) ||
    (c >= 0x0671 && c <= 0x06d3) || // Arabic
    (c >= 0x0900 && c <= 0x097f) || // Devanagari
    (c >= 0x0e00 && c <= 0x0e7f) || // Thai
    (c >= 0x3040 && c <= 0x30ff) || // Hiragana, Katakana
    (c >= 0x4e00 && c <= 0x9fff) || // CJK
    (c >= 0xac00 && c <= 0xd7af) // Hangul
  );
}

/** Stable key for grouping releases of the same title. */
export function titleKey(title: string): string {
  const lower = title.normalize('NFD').replace(COMBINING, '').toLowerCase();
  const folded = DECOMPOSES ? lower : [...lower].map((ch) => ACCENTS[ch] ?? ch).join('');
  const words = [...folded.replace(/^(the|a|an)\s+/, '').replace(/&/g, ' and ')]
    .map((ch) => (isWordChar(ch) ? ch : ' '))
    .join('');
  return words.replace(/\s+/g, ' ').trim();
}
