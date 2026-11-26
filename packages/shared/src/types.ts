import type { LanguageCode } from './languages.js';

export type SourceKind = 'movies' | 'series' | 'live';
export type TitleKind = 'movie' | 'series';

/** A reference to artwork. The web app turns it into a URL for the size it needs. */
export interface ImageRef {
  /** TMDB file path such as `/abc.jpg`, or `mock/...` for generated artwork. */
  id: string;
  /** Dominant colour, shown while the image loads. */
  color: string;
  /** Language the artwork is in; null when it is language-neutral. */
  lang: string | null;
}

export interface Progress {
  fileId: number;
  position: number;
  duration: number;
  episodeLabel?: string;
  updatedAt: number;
}

export interface TitleCard {
  id: number;
  kind: TitleKind;
  title: string;
  year: number | null;
  overview: string;
  genres: string[];
  rating: number | null;
  runtime: number | null;
  poster: ImageRef | null;
  backdrop: ImageRef | null;
  logo: ImageRef | null;
  addedAt: number;
  seasons: number | null;
  inList: boolean;
  liked: boolean;
  matched: boolean;
  /** True while localized metadata is still being fetched. */
  pending?: boolean;
  progress?: Progress;
}

export interface CastMember {
  name: string;
  role: string;
  photo: ImageRef | null;
}

export interface SeasonSummary {
  season: number;
  name: string;
  episodes: number;
}

export interface TitleDetail extends TitleCard {
  tagline: string;
  certification: string | null;
  originalLanguage: string | null;
  cast: CastMember[];
  trailer: { site: 'YouTube' | 'file'; key: string } | null;
  seasonList: SeasonSummary[];
  similar: TitleCard[];
  /** For movies: the file to play. For series: the episode to continue with. */
  playFileId: number | null;
  playLabel: string | null;
  versions: FileVersion[];
}

export interface FileVersion {
  id: number;
  label: string;
  quality: string;
  size: number;
  languages: string[];
  container: string;
}

export interface EpisodeItem {
  id: number;
  season: number;
  episode: number;
  name: string;
  overview: string;
  still: ImageRef | null;
  runtime: number | null;
  airDate: string | null;
  fileId: number | null;
  versions: number;
  progress?: Progress;
}

export type HomeRowId = 'continue' | 'myList' | 'recent' | 'trending' | 'newEpisodes' | 'genre';

export interface HomeRow {
  id: HomeRowId;
  /** Only for genre rows. */
  label?: string;
  items: TitleCard[];
}

export interface Channel {
  id: number;
  name: string;
  logo: string | null;
  group: string;
  favourite: boolean;
  nowPlaying: { title: string; start: number; end: number; next?: string } | null;
}

export interface HomePayload {
  hero: TitleCard[];
  rows: HomeRow[];
  live: Channel[];
  pending: boolean;
}

export interface AudioTrack {
  index: number;
  lang: string | null;
  label: string;
  codec: string;
  channels: number | null;
}

export interface SubtitleTrack {
  index: number;
  lang: string | null;
  label: string;
  forced: boolean;
}

export interface Chapter {
  start: number;
  end: number;
  title: string;
  kind: 'intro' | 'recap' | 'credits' | 'other';
}

export type PlayMode = 'direct' | 'remux' | 'transcode' | 'live-hls' | 'live-direct';

export interface PlaybackInfo {
  fileId: number | null;
  channelId: number | null;
  titleId: number | null;
  title: string;
  subtitle: string | null;
  duration: number;
  mode: PlayMode;
  url: string;
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  chapters: Chapter[];
  resume: number;
  next: { fileId: number; label: string; title: string } | null;
  versions: FileVersion[];
  thumbs: boolean;
  backdrop: ImageRef | null;
}

export interface Profile {
  id: number;
  name: string;
  color: string;
  avatar: string;
}

export type TelegramState =
  | 'unconfigured'
  | 'logged-out'
  | 'connecting'
  | 'ready'
  | 'reconnecting'
  | 'flood-wait'
  | 'error';

export interface AppStatus {
  mock: boolean;
  tmdb: boolean;
  version: string;
  telegram: {
    state: TelegramState;
    retryAt?: number;
    user?: { name: string };
  };
  onboarded: boolean;
  index: { scanning: boolean; scanned: number; items: number; titles: number; channels: number };
  languagesCached: LanguageCode[];
}

export type AuthStep = 'credentials' | 'phone' | 'code' | 'password' | 'qr' | 'done';

/** Error codes the UI translates; the server never sends raw Telegram messages. */
export type AuthErrorCode =
  | 'phone_invalid'
  | 'code_invalid'
  | 'code_expired'
  | 'password_invalid'
  | 'credentials_invalid'
  | 'flood'
  | 'no_account'
  | 'network'
  | 'unknown';

export interface AuthState {
  step: AuthStep;
  qr?: { svg: string; expiresAt: number };
  codeViaApp?: boolean;
  error?: AuthErrorCode;
  waitSeconds?: number;
  hint?: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  type: 'channel' | 'group' | 'user';
  members: number | null;
  kind: SourceKind | null;
  indexed: number;
}

export interface SourceInput {
  chatId: string;
  title: string;
  kind: SourceKind;
}

export interface SearchResults {
  movies: TitleCard[];
  series: TitleCard[];
  channels: Channel[];
}

export interface TmdbCandidate {
  tmdbId: number;
  title: string;
  year: number | null;
  overview: string;
  poster: ImageRef | null;
}

export interface CacheInfo {
  streamBytes: number;
  imageBytes: number;
  limitMb: number;
}
