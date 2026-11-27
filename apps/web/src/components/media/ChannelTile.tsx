import type { Channel } from '@marquee/shared';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { press, spring } from '../../design/motion';
import { cn } from '../../lib/cn';
import { useToggleFavourite } from '../../queries/hooks';
import { ProgressBar } from '../ui/ProgressBar';

function Logo({ channel, className }: { channel: Channel; className?: string }) {
  return channel.logo ? (
    <img
      src={channel.logo}
      alt=""
      loading="lazy"
      className={cn('rounded-md object-contain', className)}
    />
  ) : (
    <span
      className={cn(
        'grid place-items-center rounded-md bg-surface-3 font-display text-title-s',
        className,
      )}
    >
      {channel.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** A channel with its logo and what is on now. `compact` is the home-row variant. */
export function ChannelTile({ channel, compact }: { channel: Channel; compact?: boolean }) {
  const { t } = useTranslation();
  const fav = useToggleFavourite();
  const np = channel.nowPlaying;
  const now = Date.now() / 1000;
  const pct = np ? (now - np.start) / (np.end - np.start) : 0;

  return (
    <motion.div
      className="relative shrink-0 snap-start"
      style={{ width: compact ? 'var(--card-w-wide)' : undefined }}
      whileHover={{ y: -3 }}
      transition={spring.soft}
    >
      <Link
        to={`/watch/live/${channel.id}`}
        className="flex items-center gap-4 rounded-lg border border-line bg-surface-1 p-4 pe-12 transition-colors hover:border-line-strong hover:bg-surface-2"
        draggable={false}
      >
        <Logo channel={channel} className="size-14 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <span className="truncate text-body font-semibold">{channel.name}</span>
          </span>
          <span className="mt-0.5 block truncate text-small text-fg-dim">
            {np ? np.title : t('live.noGuide')}
          </span>
          {np && <ProgressBar value={pct} className="mt-2 h-[3px]" />}
        </span>
      </Link>
      <motion.button
        type="button"
        whileTap={press}
        aria-label={
          channel.favourite
            ? t('live.removeFav', { name: channel.name })
            : t('live.addFav', { name: channel.name })
        }
        aria-pressed={channel.favourite}
        onClick={() => fav.mutate({ id: channel.id, on: !channel.favourite })}
        className="absolute end-3 top-3 grid size-8 place-items-center rounded-full text-fg-dim transition-colors hover:text-fg"
      >
        <Heart
          size={17}
          className={cn('transition-colors', channel.favourite && 'fill-accent text-accent')}
        />
      </motion.button>
    </motion.div>
  );
}
