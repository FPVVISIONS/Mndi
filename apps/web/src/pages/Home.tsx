import { Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Hero } from '../components/media/Hero';
import { Row } from '../components/media/Row';
import { TitleCardView } from '../components/media/TitleCardView';
import { WideCard } from '../components/media/WideCard';
import { ChannelTile } from '../components/media/ChannelTile';
import { Button } from '../components/ui/Button';
import { Deferred } from '../components/ui/Deferred';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useHome } from '../queries/hooks';

/** Approximate height of one row, used to reserve space for rows that have not mounted yet. */
const ROW_HEIGHT = 'calc(var(--card-w) * 1.5 + 5rem)';

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

  if (isPending) return <HomeSkeleton />;
  if (isError || !data) {
    return (
      <EmptyState
        icon={<Film size={26} />}
        title={t('error.title')}
        body={t('error.body')}
        action={
          <Button variant="primary" onClick={() => location.reload()}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  }
  if (!data.hero.length && !data.rows.length) {
    return (
      <div className="pt-[var(--nav-h)]">
        <EmptyState
          icon={<Film size={26} />}
          title={t('browse.emptyTitle')}
          body={t('browse.emptyBody')}
          action={
            <Button variant="primary" onClick={() => navigate('/settings?tab=library')}>
              {t('browse.emptyAction')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <Hero items={data.hero} />
      <div className="relative z-10 mt-2 space-y-2 sm:mt-4">
        {data.rows.map((row, rowIndex) => {
          const title =
            row.id === 'genre'
              ? (row.label ?? '')
              : t(`home.${row.id === 'continue' ? 'continueWatching' : row.id}`);
          const wide = row.id === 'continue' || row.id === 'newEpisodes';
          const rowEl = (
            <Row title={title}>
              {row.items.map((c) =>
                wide ? (
                  <WideCard key={c.id} card={c} eager={rowIndex === 0} />
                ) : (
                  <TitleCardView key={c.id} card={c} eager={rowIndex === 0} />
                ),
              )}
            </Row>
          );
          return rowIndex < 2 ? (
            <div key={`${row.id}-${row.label ?? ''}`}>{rowEl}</div>
          ) : (
            <Deferred key={`${row.id}-${row.label ?? ''}`} height={ROW_HEIGHT}>
              {rowEl}
            </Deferred>
          );
        })}
        {data.live.length > 0 && (
          <Deferred height="12rem">
            <Row title={t('home.liveNow')}>
              {data.live.map((c) => (
                <ChannelTile key={c.id} channel={c} compact />
              ))}
            </Row>
          </Deferred>
        )}
      </div>
    </div>
  );
}
