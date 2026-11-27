import { Radio, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChannelTile } from '../components/media/ChannelTile';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PillTabs } from '../components/ui/Segmented';
import { Skeleton } from '../components/ui/Skeleton';
import { staggerChildren, fadeUp, stagger } from '../design/motion';
import { titleKeyLite } from '../lib/text';
import { useChannels } from '../queries/hooks';

const ALL = '__all';
const FAV = '__fav';

export default function Live() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending } = useChannels();
  const [cat, setCat] = useState(ALL);
  const [q, setQ] = useState('');
  const channels = useMemo(() => data?.channels ?? [], [data?.channels]);

  const groups = useMemo(
    () => [...new Set(channels.map((c) => c.group).filter(Boolean))].sort(),
    [channels],
  );
  const shown = channels.filter(
    (c) =>
      (cat === ALL || (cat === FAV ? c.favourite : c.group === cat)) &&
      (!q.trim() || titleKeyLite(c.name).includes(titleKeyLite(q))),
  );

  return (
    <div className="page-x pt-[calc(var(--nav-h)+1.5rem)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-title-l">{t('live.title')}</h1>
        <label className="relative block w-full sm:w-72">
          <Search
            size={16}
            className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-fg-faint"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('live.search')}
            aria-label={t('live.search')}
            className="h-10 w-full rounded-full border border-line bg-surface-1 ps-10 pe-4 text-small outline-none transition-colors focus:border-fg-dim"
          />
        </label>
      </div>
      {channels.length > 0 && (
        <PillTabs
          label={t('live.title')}
          value={cat}
          onChange={setCat}
          className="mb-8"
          options={[
            { value: ALL, label: t('common.all') },
            { value: FAV, label: t('live.favourites') },
            ...groups.map((g) => ({ value: g, label: g })),
          ]}
        />
      )}
      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <EmptyState
          icon={<Radio size={26} />}
          title={t('live.noneTitle')}
          body={t('live.noneBody')}
          action={
            <Button variant="primary" onClick={() => navigate('/settings?tab=library')}>
              {t('browse.emptyAction')}
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Radio size={26} />}
          title={cat === FAV && !q ? t('live.noFavTitle') : t('live.noMatchTitle')}
          body={cat === FAV && !q ? t('live.noFavBody') : t('live.noMatchBody')}
        />
      ) : (
        <motion.ul
          variants={staggerChildren(stagger.list)}
          initial="hidden"
          animate="show"
          key={cat}
          className="grid gap-3 pb-20 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {shown.map((c) => (
            <motion.li key={c.id} variants={fadeUp} layout>
              <ChannelTile channel={c} />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
