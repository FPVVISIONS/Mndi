import { Clapperboard, Tv } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { TitleCardView } from '../components/media/TitleCardView';
import { VirtualGrid } from '../components/media/VirtualGrid';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Popover, MenuItem } from '../components/ui/Popover';
import { PillTabs } from '../components/ui/Segmented';
import { Skeleton } from '../components/ui/Skeleton';
import { useTitles } from '../queries/hooks';
import { ArrowDownUp } from 'lucide-react';

type Sort = 'recent' | 'title' | 'rating' | 'year';

export default function Browse({ kind }: { kind: 'movie' | 'series' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const { data, isPending } = useTitles({ kind, genre: genre || undefined, sort });
  const Icon = kind === 'movie' ? Clapperboard : Tv;

  const sorts: { value: Sort; label: string }[] = [
    { value: 'recent', label: t('browse.sortRecent') },
    { value: 'title', label: t('browse.sortTitle') },
    { value: 'rating', label: t('browse.sortRating') },
    { value: 'year', label: t('browse.sortYear') },
  ];

  return (
    <div className="page-x pt-[calc(var(--nav-h)+1.5rem)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-title-l">{kind === 'movie' ? t('browse.movies') : t('browse.series')}</h1>
        <Popover
          trigger={({ toggle }) => (
            <Button variant="secondary" size="sm" onClick={toggle} icon={<ArrowDownUp size={15} />}>
              {sorts.find((s) => s.value === sort)?.label}
            </Button>
          )}
        >
          {(close) => sorts.map((s) => (
            <MenuItem key={s.value} active={s.value === sort} onClick={() => { setSort(s.value); close(); }}>{s.label}</MenuItem>
          ))}
        </Popover>
      </div>

      {data && data.genres.length > 0 && (
        <PillTabs
          label={t('detail.genres')}
          value={genre}
          onChange={setGenre}
          options={[{ value: '', label: t('browse.allGenres') }, ...data.genres.map((g) => ({ value: g, label: g }))]}
          className="mb-8"
        />
      )}

      {isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4">
          {Array.from({ length: 14 }, (_, i) => <Skeleton key={i} className="aspect-[2/3]" />)}
        </div>
      ) : data && data.items.length > 0 ? (
        <VirtualGrid
          items={data.items}
          minWidth={168}
          aspect={1.5}
          gap={16}
          keyOf={(c) => c.id}
          render={(c) => <TitleCardView card={c} />}
        />
      ) : genre ? (
        <EmptyState icon={<Icon size={26} />} title={t('browse.noMatchTitle')} body={t('browse.noMatchBody')} action={<Button onClick={() => setGenre('')}>{t('browse.allGenres')}</Button>} />
      ) : (
        <EmptyState icon={<Icon size={26} />} title={t('browse.emptyTitle')} body={t('browse.emptyBody')} action={<Button variant="primary" onClick={() => navigate('/settings?tab=library')}>{t('browse.emptyAction')}</Button>} />
      )}
    </div>
  );
}
