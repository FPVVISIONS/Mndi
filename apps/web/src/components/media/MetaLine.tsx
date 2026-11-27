import type { TitleCard } from '@marquee/shared';
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';

export function useRuntime() {
  const { t } = useTranslation();
  return (minutes: number) =>
    minutes >= 60 ? t('common.hoursMinutes', { h: Math.floor(minutes / 60), m: minutes % 60 }) : t('common.minutes', { count: minutes });
}

interface Props {
  card: Pick<TitleCard, 'kind' | 'year' | 'runtime' | 'seasons' | 'rating'> & { certification?: string | null };
  className?: string;
  /** Single row, no wrapping: for tight spaces such as the hover panel. */
  compact?: boolean;
}

/** Year, rating, length: the quiet line under a title. */
export function MetaLine({ card, className, compact }: Props) {
  const { t } = useTranslation();
  const runtime = useRuntime();
  const parts: React.ReactNode[] = [];
  if (card.rating) {
    parts.push(
      <span key="r" className="inline-flex items-center gap-1 font-semibold text-fg">
        <Star size={12} className="fill-accent text-accent" aria-hidden />
        {card.rating.toFixed(1)}
      </span>,
    );
  }
  if (card.year) parts.push(<span key="y">{card.year}</span>);
  if (card.certification) parts.push(<span key="c" className="rounded-xs border border-fg-faint px-1 text-caption leading-4">{card.certification}</span>);
  if (card.kind === 'series' && card.seasons) parts.push(<span key="s">{t('common.seasonsCount', { count: card.seasons })}</span>);
  else if (card.runtime) parts.push(<span key="t">{runtime(card.runtime)}</span>);
  return (
    <div className={cn('flex items-center text-small text-fg-dim', compact ? 'flex-nowrap gap-x-2 overflow-hidden whitespace-nowrap' : 'flex-wrap gap-x-2.5 gap-y-1', className)}>
      {parts.map((p, i) => (
        <span key={i} className={cn('inline-flex shrink-0 items-center', compact ? 'gap-2' : 'gap-2.5')}>
          {i > 0 && <span className="size-[3px] rounded-full bg-fg-faint" aria-hidden />}
          {p}
        </span>
      ))}
    </div>
  );
}
