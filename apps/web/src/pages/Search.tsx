import { Clock, Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChannelTile } from '../components/media/ChannelTile';
import { TitleCardView } from '../components/media/TitleCardView';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { fadeUp, staggerChildren, stagger } from '../design/motion';
import { useDebounced } from '../lib/hooks';
import { useSearch } from '../queries/hooks';
import { usePrefs } from '../stores/prefs';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.section variants={fadeUp} className="mb-10" aria-label={title}>
      <h2 className="mb-4 font-display text-title-s">{title}</h2>
      {children}
    </motion.section>
  );
}

export default function Search() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const debounced = useDebounced(q, 200);
  const input = useRef<HTMLInputElement>(null);
  const { recentSearches, addSearch, clearSearches } = usePrefs();
  const { data, isFetching } = useSearch(debounced);
  const empty = data && !data.movies.length && !data.series.length && !data.channels.length;

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (data && !empty) {
      const id = setTimeout(() => addSearch(debounced), 1200);
      return () => clearTimeout(id);
    }
  }, [data, empty, debounced, addSearch]);

  const setQ = (v: string) => setParams(v ? { q: v } : {}, { replace: true });

  return (
    <div className="page-x pt-[calc(var(--nav-h)+1.25rem)]">
      <div className="relative mb-10">
        <SearchIcon
          size={22}
          className="pointer-events-none absolute start-0 top-1/2 -translate-y-1/2 text-fg-faint"
        />
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('nav.search')}
          className="h-16 w-full border-0 border-b border-line bg-transparent ps-10 pe-12 font-display text-title-m outline-none transition-colors placeholder:text-fg-faint focus:border-fg-dim [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            type="button"
            aria-label={t('search.clearInput')}
            onClick={() => {
              setQ('');
              input.current?.focus();
            }}
            className="absolute end-0 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-fg-dim hover:bg-white/10 hover:text-fg"
          >
            <X size={20} />
          </button>
        )}
      </div>

      {!debounced.trim() ? (
        recentSearches.length > 0 ? (
          <section aria-label={t('search.recent')}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="eyebrow">{t('search.recent')}</h2>
              <button
                type="button"
                onClick={clearSearches}
                className="text-small font-semibold text-fg-dim hover:text-fg"
              >
                {t('search.clearRecent')}
              </button>
            </div>
            <ul className="flex flex-wrap gap-2">
              {recentSearches.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => setQ(s)}
                    className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-body text-fg-dim transition-colors hover:border-line-strong hover:text-fg"
                  >
                    <Clock size={14} aria-hidden />
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <EmptyState
            icon={<SearchIcon size={26} />}
            title={t('search.startTitle')}
            body={t('search.startBody')}
          />
        )
      ) : !data ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[2/3]" />
          ))}
        </div>
      ) : empty ? (
        <EmptyState
          icon={<SearchIcon size={26} />}
          title={t('search.noResultsTitle', { q: debounced })}
          body={t('search.noResultsBody')}
        />
      ) : (
        <motion.div
          variants={staggerChildren(stagger.row)}
          initial="hidden"
          animate="show"
          className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}
        >
          {data.movies.length > 0 && (
            <Group title={t('search.movies')}>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4 [--card-w:100%]">
                {data.movies.map((c) => (
                  <li key={c.id}>
                    <TitleCardView card={c} />
                  </li>
                ))}
              </ul>
            </Group>
          )}
          {data.series.length > 0 && (
            <Group title={t('search.series')}>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4 [--card-w:100%]">
                {data.series.map((c) => (
                  <li key={c.id}>
                    <TitleCardView card={c} />
                  </li>
                ))}
              </ul>
            </Group>
          )}
          {data.channels.length > 0 && (
            <Group title={t('search.channels')}>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.channels.map((c) => (
                  <li key={c.id}>
                    <ChannelTile channel={c} />
                  </li>
                ))}
              </ul>
            </Group>
          )}
        </motion.div>
      )}
    </div>
  );
}
