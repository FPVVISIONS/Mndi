import type { TitleCard } from '@marquee/shared';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { spring } from '../../design/motion';
import { formatDuration } from '../../lib/format';
import { Crossfade } from '../ui/Crossfade';
import { ProgressBar } from '../ui/ProgressBar';
import { ArtImage } from './ArtImage';
import { PosterFallback } from './PosterFallback';
import { TitleLogo } from './TitleLogo';
import { watchPath } from './QuickActions';

/** Landscape card for Continue watching and New episodes. Click resumes; the info link opens details. */
export function WideCard({ card }: { card: TitleCard }) {
  const { t } = useTranslation();
  const location = useLocation();
  const p = card.progress;
  const left = p ? p.duration - p.position : 0;

  return (
    <motion.div
      className="relative shrink-0 snap-start"
      style={{ width: 'var(--card-w-wide)' }}
      whileHover={{ y: -4 }}
      transition={spring.soft}
    >
      <Link
        to={watchPath(card)}
        aria-label={t('card.play', { title: card.title })}
        className="group/wide block outline-offset-4"
        draggable={false}
      >
        <div className="relative aspect-video overflow-hidden rounded-md bg-surface-2 shadow-[var(--shadow-card)]">
          <ArtImage
            image={card.backdrop}
            size="w500"
            className="size-full"
            fallback={<PosterFallback title={card.title} />}
          />
          <div className="scrim-bottom absolute inset-0" />
          <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
            <TitleLogo
              logo={card.logo}
              title={card.title}
              height="2.25rem"
              className="[&_h1]:text-title-s"
              textClassName="!text-title-s"
            />
          </div>
          <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-200 group-hover/wide:opacity-100 group-focus-visible/wide:opacity-100">
            <span className="grid size-12 place-items-center rounded-full border border-white/70 bg-black/50">
              <Play size={20} className="fill-fg" />
            </span>
          </span>
          {p && (
            <ProgressBar
              value={p.position / p.duration}
              className="absolute inset-x-0 bottom-0 h-[3px] rounded-none bg-black/50"
            />
          )}
        </div>
      </Link>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-small font-semibold">
            <Crossfade k={card.title}>{card.title}</Crossfade>
          </div>
          <div className="truncate text-caption text-fg-faint">
            {p?.episodeLabel && <span>{p.episodeLabel} · </span>}
            {p
              ? t('common.left', { time: formatDuration(left) })
              : card.genres.slice(0, 2).join(' · ')}
          </div>
        </div>
        <Link
          to={`/title/${card.id}`}
          state={{ background: location }}
          className="shrink-0 rounded-sm px-1.5 py-0.5 text-caption font-semibold text-fg-dim hover:text-fg"
          aria-label={t('card.details', { title: card.title })}
        >
          {t('common.moreInfo')}
        </Link>
      </div>
    </motion.div>
  );
}
