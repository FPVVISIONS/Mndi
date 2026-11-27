import type {
  AppStatus, AuthState, CacheInfo, Channel, ChatSummary, EpisodeItem, FileVersion, HomePayload, PlaybackInfo,
  Profile, SearchResults, SourceInput, TitleCard, TitleDetail, TmdbCandidate,
} from '@marquee/shared';
import { usePrefs } from '../stores/prefs';
import { useProfile } from '../stores/profile';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit & { json?: unknown; lang?: boolean } = {}): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (init.lang !== false) url.searchParams.set('lang', usePrefs.getState().language);
  const headers = new Headers(init.headers);
  const profile = useProfile.getState().profileId;
  if (profile) headers.set('x-profile', String(profile));
  headers.set('x-quality', usePrefs.getState().quality);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, body });
  } catch {
    throw new ApiError(0, 'offline');
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, data.error ?? 'error');
  }
  return (await res.json()) as T;
}

const get = <T>(path: string) => request<T>(path);
const send = <T>(method: string, path: string, json?: unknown) => request<T>(path, { method, json });

export const api = {
  status: () => request<AppStatus>('/api/status', { lang: false }),
  completeOnboarding: () => send<AppStatus>('POST', '/api/onboarding/complete'),
  resetOnboarding: () => send<AppStatus>('POST', '/api/dev/reset-onboarding'),

  auth: () => request<AuthState>('/api/auth', { lang: false }),
  saveCredentials: (apiId: number, apiHash: string) => send<AuthState>('POST', '/api/auth/credentials', { apiId, apiHash }),
  sendPhone: (phone: string) => send<AuthState>('POST', '/api/auth/phone', { phone }),
  sendCode: (code: string) => send<AuthState>('POST', '/api/auth/code', { code }),
  sendPassword: (password: string) => send<AuthState>('POST', '/api/auth/password', { password }),
  startQr: () => send<AuthState>('POST', '/api/auth/qr'),
  cancelAuth: () => send<AuthState>('POST', '/api/auth/cancel'),
  logout: () => send<AppStatus>('POST', '/api/auth/logout'),

  chats: () => get<{ chats: ChatSummary[] }>('/api/chats'),
  saveSources: (sources: SourceInput[]) => send<{ ok: boolean }>('PUT', '/api/sources', { sources }),
  sources: () => get<{ sources: { chatId: string; title: string; kind: SourceInput['kind'] }[] }>('/api/sources'),
  scan: (rescan = false) => send<AppStatus['index']>('POST', '/api/library/scan', { rescan }),
  prefetch: (lang: string) => send<{ ok: boolean }>('POST', '/api/library/prefetch', { lang }),

  home: () => get<HomePayload>('/api/home'),
  titles: (params: { kind?: 'movie' | 'series'; genre?: string; sort?: string }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return get<{ items: TitleCard[]; genres: string[]; pending: boolean }>(`/api/titles?${q}`);
  },
  title: (id: number) => get<TitleDetail>(`/api/titles/${id}`),
  titleVersions: (id: number) => get<{ versions: FileVersion[] }>(`/api/titles/${id}/versions`),
  episodeVersions: (id: number) => get<{ versions: FileVersion[] }>(`/api/episodes/${id}/versions`),
  chooseVersion: (scope: 'title' | 'episode', refId: number, fileId: number) =>
    send<{ ok: boolean }>('PUT', '/api/versions/choice', { scope, refId, fileId }),
  episodes: (id: number, season: number) => get<{ episodes: EpisodeItem[] }>(`/api/titles/${id}/episodes?season=${season}`),
  search: (q: string) => get<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`),
  myList: () => get<{ items: TitleCard[] }>('/api/my-list'),
  setList: (id: number, on: boolean) => send<{ ok: boolean }>(on ? 'PUT' : 'DELETE', `/api/my-list/${id}`),
  setLike: (id: number, on: boolean) => send<{ ok: boolean }>(on ? 'PUT' : 'DELETE', `/api/likes/${id}`),
  matches: (id: number, q: string) => get<{ matches: TmdbCandidate[] }>(`/api/titles/${id}/matches?q=${encodeURIComponent(q)}`),
  setMatch: (id: number, tmdbId: number | null) => send<{ id: number }>('POST', `/api/titles/${id}/match`, { tmdbId }),

  playback: (fileId: number, opts: { audio?: number; transcode?: boolean; hevc?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (opts.audio) q.set('audio', String(opts.audio));
    if (opts.transcode) q.set('transcode', '1');
    if (opts.hevc) q.set('hevc', '1');
    return get<PlaybackInfo>(`/api/playback/${fileId}?${q}`);
  },
  livePlayback: (id: number) => get<PlaybackInfo>(`/api/live/${id}/playback`),
  saveProgress: (fileId: number, position: number, duration: number) =>
    send<{ ok: boolean }>('POST', '/api/progress', { fileId, position, duration }),
  clearProgress: (titleId: number) => send<{ ok: boolean }>('DELETE', `/api/progress/${titleId}`),

  channels: () => get<{ channels: Channel[] }>('/api/live/channels'),
  setFavourite: (id: number, on: boolean) => send<{ ok: boolean }>(on ? 'PUT' : 'DELETE', `/api/live/favourites/${id}`),

  profiles: () => request<{ profiles: Profile[] }>('/api/profiles', { lang: false }),
  createProfile: (p: Omit<Profile, 'id'>) => send<Profile>('POST', '/api/profiles', p),
  updateProfile: (id: number, p: Partial<Omit<Profile, 'id'>>) => send<Profile>('PATCH', `/api/profiles/${id}`, p),
  deleteProfile: (id: number) => send<{ ok: boolean }>('DELETE', `/api/profiles/${id}`),

  cache: () => request<CacheInfo>('/api/cache', { lang: false }),
  setCacheLimit: (limitMb: number) => send<{ ok: boolean }>('PUT', '/api/cache', { limitMb }),
  clearCache: () => send<{ ok: boolean }>('DELETE', '/api/cache'),
};
