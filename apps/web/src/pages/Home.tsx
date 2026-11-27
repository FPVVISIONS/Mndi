import { useQueries } from '@tanstack/react-query';
import { Film } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Hero } from '../components/media/Hero';
import { Row } from '../components/media/Row';
import { TitleCardView } from '../components/media/TitleCardView';
import { WideCard } from '../components/media/WideCard';
import { ChannelTile } from '../components/media/ChannelTile';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { api } from '../lib/api';
import { useHome, useScope } from '../queries/hooks';

function HomeSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="h-[34rem] w-full rounded-none sm:h-[40rem]" />
      <div className="page-x -mt-16 space-y-10">
        {[0, 1].map((i) => (
          <div key={i}>
            <Skeleton className="mb-3 h-6 w-48" />
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 8 }, (_, j) => (
                <Skeleton key={j} className="aspect-[2/3] w-[var(--card-w)] shrink-0" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isPending, isError } = useHome();
  const { key } = useScope();

  // Trailers live on the detail payload; fetch them for the few hero slides only.
  const heroIds = data?.hero.map((h) => h.id) ?? [];
  const details = useQueries({
    queries: heroIds.map((id) => ({ queryKey: ['title', ...key, id], queryFn: () => api.title(id), staleTime: 60_000 })),
  });
  const trailers = useMemo(() => new Map(details.map((q, i) => [heroIds[i], q.data?.trailer ?? null])), [details, heroIds]);

  if (isPending) return <HomeSkeleton />;
  if (isError || !data) {
    return <EmptyState icon={<Film size={26} />} title={t('error.title')} body={t('error.body')} action={<Button variant="primary" onClick={() => location.reload()}>{t('common.retry')}</Button>} />;
  }
  if (!data.hero.length && !data.rows.length) {
    return (
      <div className="pt-[var(--nav-h)]">
        <EmptyState icon={<Film size={26} />} title={t('browse.emptyTitle')} body={t('browse.emptyBody')} action={<Button variant="primary" onClick={() => navigate('/settings?tab=library')}>{t('browse.emptyAction')}</Button>} />
      </div>
    );
  }

  return (
    <div>
      <Hero items={data.hero} trailerFor={(id) => trailers.get(id)} />
      <div className="relative z-10 -mt-8 space-y-2 sm:-mt-12">
        {data.rows.map((row) => {
          const title = row.id === 'genre' ? (row.label ?? '') : t(`home.${row.id === 'continue' ? 'continueWatching' : row.id}`);
          const wide = row.id === 'continue' || row.id === 'newEpisodes';
          return (
            <Row key={`${row.id}-${row.label ?? ''}`} title={title}>
              {row.items.map((c) => (wide ? <WideCard key={c.id} card={c} /> : <TitleCardView key={c.id} card={c} />))}
            </Row>
          );
        })}
        {data.live.length > 0 && (
          <Row title={t('home.liveNow')}>
            {data.live.map((c) => (
              <ChannelTile key={c.id} channel={c} compact />
            ))}
          </Row>
        )}
      </div>
    </div>
  );
}
