import type { ChatSummary, SourceKind } from '@marquee/shared';
import { motion } from 'framer-motion';
import { Megaphone, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fadeUp, stagger, staggerChildren } from '../design/motion';
import { cn } from '../lib/cn';
import { Segmented } from './ui/Segmented';

export type Tags = Record<string, SourceKind | 'skip'>;

interface Props {
  chats: ChatSummary[];
  tags: Tags;
  onChange: (tags: Tags) => void;
}

/** Lists the account's groups and channels and lets each one be tagged Movies, Series, Live TV or skipped. */
export function ChatPicker({ chats, tags, onChange }: Props) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return chats
      .filter((c) => !q || c.title.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number((tags[b.id] ?? 'skip') !== 'skip') - Number((tags[a.id] ?? 'skip') !== 'skip'),
      );
  }, [chats, filter, tags]);

  const options: { value: SourceKind | 'skip'; label: string }[] = [
    { value: 'skip', label: t('onboarding.skip') },
    { value: 'movies', label: t('settings.kindMovies') },
    { value: 'series', label: t('settings.kindSeries') },
    { value: 'live', label: t('settings.kindLive') },
  ];

  return (
    <div>
      <label className="relative mb-4 block">
        <Search
          size={17}
          className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-fg-faint"
        />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('onboarding.filter')}
          aria-label={t('onboarding.filter')}
          className="h-11 w-full rounded-md border border-line bg-surface-1 ps-11 pe-4 outline-none transition-colors focus:border-fg-dim"
        />
      </label>
      <motion.ul
        variants={staggerChildren(stagger.list)}
        initial="hidden"
        animate="show"
        className="space-y-2"
      >
        {shown.map((c) => {
          const tag = tags[c.id] ?? 'skip';
          return (
            <motion.li
              key={c.id}
              variants={fadeUp}
              layout
              className={cn(
                'flex flex-col gap-3 rounded-lg border p-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between',
                tag === 'skip' ? 'border-line bg-surface-1' : 'border-line-strong bg-surface-2',
              )}
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-3 text-fg-dim">
                  {c.type === 'channel' ? <Megaphone size={18} /> : <Users size={18} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{c.title}</span>
                  {c.members !== null && (
                    <span className="block text-caption text-fg-faint">
                      {t('onboarding.members', { count: c.members })}
                    </span>
                  )}
                </span>
              </div>
              <Segmented
                size="sm"
                label={c.title}
                value={tag}
                options={options}
                onChange={(v) => onChange({ ...tags, [c.id]: v })}
                className="self-start sm:self-auto"
              />
            </motion.li>
          );
        })}
      </motion.ul>
      {chats.length === 0 && (
        <p className="py-12 text-center text-fg-dim">{t('onboarding.noChats')}</p>
      )}
    </div>
  );
}

export function tagsFromChats(chats: ChatSummary[]): Tags {
  return Object.fromEntries(chats.map((c) => [c.id, c.kind ?? 'skip']));
}
