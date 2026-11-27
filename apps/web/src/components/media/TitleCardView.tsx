import type { TitleCard } from '@marquee/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { duration, ease, spring, stagger } from '../../design/motion';
import { useCanHover } from '../../lib/hooks';
import { Crossfade } from '../ui/Crossfade';
import { ProgressBar } from '../ui/ProgressBar';
import { ArtImage } from './ArtImage';
import { MetaLine } from './MetaLine';
import { PosterFallback } from './PosterFallback';
import { QuickActions } from './QuickActions';

interface Props {
  card: TitleCard;
  /** Tilt the card toward the end of the row so the hover panel does not clip. */
  className?: string;
}

const panelVariants = {
  hidden: { opacity: 0, y: -8 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.base,
      ease: ease.out,
      staggerChildren: stagger.actions,
      delayChildren: 0.04,
    },
  },
  exit: { opacity: 0, y: -4, transition: { duration: duration.fast } },
};
const item = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } };

/** Poster card. On hover or focus it lifts in place and opens an info panel with quick actions. */
export function TitleCardView({ card, className }: Props) {
  const location = useLocation();
  // Unique per card: the same title can appear in several rows, and shared ids would hide all but one.
  const art = useId();
  const canHover = useCanHover();
  const [open, setOpen] = useState(false);
  const timer = useRef<number>();
  const progress = card.progress ? card.progress.position / card.progress.duration : 0;

  const show = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <motion.div
      className={`relative shrink-0 snap-start ${className ?? ''}`}
      style={{ width: 'var(--card-w)', zIndex: open ? 30 : 0 }}
      animate={{ scale: open ? 1.1 : 1 }}
      transition={spring.soft}
      onPointerEnter={() => canHover && show(160)}
      onPointerLeave={hide}
      onFocus={() => canHover && show(0)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && hide()}
    >
      <Link
        to={`/title/${card.id}`}
        state={{ background: location, art }}
        aria-label={card.title}
        className="block overflow-hidden rounded-md outline-offset-4"
        draggable={false}
      >
        <motion.div
          layoutId={`art-${art}`}
          className="relative aspect-[2/3] overflow-hidden rounded-md bg-surface-2 shadow-[var(--shadow-card)]"
        >
          <ArtImage
            image={card.poster}
            size="w342"
            alt=""
            className="size-full"
            fallback={<PosterFallback title={card.title} />}
          />
          {progress > 0 && (
            <ProgressBar
              value={progress}
              className="absolute inset-x-0 bottom-0 h-[3px] rounded-none bg-black/50"
            />
          )}
        </motion.div>
      </Link>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="absolute -inset-x-2 top-full -mt-1 rounded-b-md bg-surface-2 p-3 shadow-[var(--shadow-pop)]"
          >
            <motion.div variants={item}>
              <QuickActions card={card} />
            </motion.div>
            <motion.div variants={item} className="mt-2.5 truncate text-small font-semibold">
              <Crossfade k={card.title}>{card.title}</Crossfade>
            </motion.div>
            <motion.div variants={item} className="mt-1">
              <MetaLine card={card} compact />
            </motion.div>
            {card.genres.length > 0 && (
              <motion.div variants={item} className="mt-1.5 truncate text-caption text-fg-faint">
                <Crossfade k={card.genres.join()}>{card.genres.slice(0, 3).join(' · ')}</Crossfade>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
