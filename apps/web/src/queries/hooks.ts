import type { AppStatus, HomePayload, TitleCard } from '@marquee/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { api } from '../lib/api';
import { usePrefs } from '../stores/prefs';
import { useProfile } from '../stores/profile';

/** Query keys carry language and profile, so switching either serves cached data instantly. */
export function useScope() {
  const lang = usePrefs((s) => s.language);
  const profile = useProfile((s) => s.profileId);
  return { lang, profile, key: [lang, profile] as const };
}

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: api.status,
    refetchInterval: (q) => {
      const s = q.state.data;
      if (!s) return 3000;
      if (s.index.scanning || s.telegram.state !== 'ready') return 2500;
      return 12_000;
    },
  });
}

export function useProfiles() {
  return useQuery({ queryKey: ['profiles'], queryFn: api.profiles, staleTime: 5 * 60_000 });
}

/** Localized data that may still be arriving: poll briefly until the server reports it is complete. */
function pendingPoll<T extends { pending?: boolean }>() {
  return (q: { state: { data: T | undefined } }) => (q.state.data?.pending ? 1500 : false);
}

export function useHome() {
  const { key } = useScope();
  return useQuery({
    queryKey: ['home', ...key],
    queryFn: api.home,
    placeholderData: keepPreviousData,
    refetchInterval: pendingPoll<HomePayload>(),
  });
}

export function useTitles(params: { kind: 'movie' | 'series'; genre?: string; sort?: string }) {
  const { key } = useScope();
  return useQuery({
    queryKey: ['titles', ...key, params],
    queryFn: () => api.titles(params),
    placeholderData: keepPreviousData,
    refetchInterval: pendingPoll(),
  });
}

export function useTitle(id: number, enabled = true) {
  const { key } = useScope();
  return useQuery({
    queryKey: ['title', ...key, id],
    queryFn: () => api.title(id),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: pendingPoll(),
  });
}

export function useEpisodes(id: number, season: number) {
  const { key } = useScope();
  return useQuery({
    queryKey: ['episodes', ...key, id, season],
    queryFn: () => api.episodes(id, season),
    placeholderData: keepPreviousData,
  });
}

export function useMyList() {
  const { key } = useScope();
  return useQuery({
    queryKey: ['myList', ...key],
    queryFn: api.myList,
    placeholderData: keepPreviousData,
  });
}

export function useChannels() {
  const { key } = useScope();
  return useQuery({
    queryKey: ['channels', ...key],
    queryFn: api.channels,
    refetchInterval: 60_000,
  });
}

export function useSearch(q: string) {
  const { key } = useScope();
  return useQuery({
    queryKey: ['search', ...key, q],
    queryFn: () => api.search(q),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

type CardPatch = (c: TitleCard) => TitleCard;

/** Apply a change to every cached copy of a title card, so a toggle is reflected everywhere at once. */
function patchCards(qc: ReturnType<typeof useQueryClient>, id: number, patch: CardPatch) {
  const fix = (c: TitleCard) => (c.id === id ? patch(c) : c);
  qc.setQueriesData<HomePayload>(
    { queryKey: ['home'] },
    (d) =>
      d && {
        ...d,
        hero: d.hero.map(fix),
        rows: d.rows.map((r) => ({ ...r, items: r.items.map(fix) })),
      },
  );
  qc.setQueriesData<{ items: TitleCard[] }>(
    { queryKey: ['titles'] },
    (d) => d && { ...d, items: d.items.map(fix) },
  );
  qc.setQueriesData<{ items: TitleCard[] }>(
    { queryKey: ['myList'] },
    (d) => d && { ...d, items: d.items.map(fix) },
  );
  qc.setQueriesData<TitleCard & { similar: TitleCard[] }>(
    { queryKey: ['title'] },
    (d) =>
      d &&
      (d.id === id ? { ...patch(d), similar: d.similar } : { ...d, similar: d.similar.map(fix) }),
  );
  qc.setQueriesData<{ movies: TitleCard[]; series: TitleCard[] }>(
    { queryKey: ['search'] },
    (d) => d && { ...d, movies: d.movies.map(fix), series: d.series.map(fix) },
  );
}

export function useToggleList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => api.setList(id, on),
    onMutate: ({ id, on }) => patchCards(qc, id, (c) => ({ ...c, inList: on })),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['home'] });
      void qc.invalidateQueries({ queryKey: ['myList'] });
    },
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => api.setLike(id, on),
    onMutate: ({ id, on }) => patchCards(qc, id, (c) => ({ ...c, liked: on })),
  });
}

export function useToggleFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => api.setFavourite(id, on),
    onMutate: ({ id, on }) => {
      qc.setQueriesData<{ channels: { id: number; favourite: boolean }[] }>(
        { queryKey: ['channels'] },
        (d) =>
          d && { channels: d.channels.map((c) => (c.id === id ? { ...c, favourite: on } : c)) },
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['channels'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export function invalidateLibrary(qc: ReturnType<typeof useQueryClient>, extra: QueryKey[] = []) {
  for (const key of [
    ['home'],
    ['titles'],
    ['title'],
    ['myList'],
    ['search'],
    ['channels'],
    ['status'],
    ...extra,
  ]) {
    void qc.invalidateQueries({ queryKey: key });
  }
}

export type { AppStatus };
