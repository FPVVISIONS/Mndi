import type { TitleCard } from '@marquee/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { duration, ease, fadeUp, staggerChildren, stagger } from '../../design/motion';
import { cn } from '../../lib/cn';
import { usePrefs } from '../../stores/prefs';
import { Crossfade } from '../ui/Crossfade';
import { Button } from '../ui/Button';
import { ArtImage } from './ArtImage';
import { MetaLine } from './MetaLine';
import { TitleLogo } from './TitleLogo';
import { watchPath } from './QuickActions';

const ROTATE_MS = 10_000;
const PREVIEW_DELAY = 2600;

interface Props {
  items: TitleCard[];
  /** The detail payload is not needed on home; trailers come from a lazy fetch per slide. */
  trailerFor: (id: number) => { site: 'YouTube' | 'file'; key: string } | null | undefined;
}

export function Hero({ items, trailerFor }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const preview = usePrefs((s) => s.heroPreview);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [muted, setMuted] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const card = items[Math.min(index, items.length - 1)];

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => window.clearTimeout(id);
  }, [index, items.length, paused]);

  const trailer = card ? trailerFor(card.id) : null;
  useEffect(() => {
    setShowVideo(false);
    if (!preview || !trailer || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setTimeout(() => setShowVideo(true), PREVIEW_DELAY);
    return () => window.clearTimeout(id);
  }, [card?.id, trailer?.key, preview]);

  if (!card) return null;
  const hasProgress = Boolean(card.progress);

  return (
    <section
      className="relative isolate min-h-[34rem] overflow-hidden sm:min-h-[40rem] lg:h-[min(52rem,86vh)]"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={card.id}
          className="absolute inset-0 -z-10"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1, transition: { duration: duration.hero, ease: ease.out } }}
          exit={{ opacity: 0, transition: { duration: duration.hero } }}
        >
          <ArtImage image={card.backdrop} size="w1280" eager className="size-full" />
          {showVideo && trailer?.site === 'file' && (
            <motion.video
              ref={video}
              src={trailer.key}
              autoPlay
              muted={muted}
              loop
              playsInline
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2 }}
              className="absolute inset-0 size-full object-cover"
            />
          )}
          {showVideo && trailer?.site === 'YouTube' && (
            <motion.iframe
              title=""
              aria-hidden
              tabIndex={-1}
              src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${trailer.key}&modestbranding=1&playsinline=1&rel=0`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2 }}
              className="pointer-events-none absolute left-1/2 top-1/2 aspect-video min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 border-0"
              allow="autoplay; encrypted-media"
            />
          )}
        </motion.div>
      </AnimatePresence>
      <div className="scrim-start absolute inset-0 -z-10" />
      <div className="scrim-fade-bg absolute inset-x-0 bottom-0 -z-10 h-1/3" />

      <div className="page-x relative flex h-full min-h-[inherit] flex-col justify-end pb-24 pt-[calc(var(--nav-h)+3rem)] sm:pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={card.id}
            variants={staggerChildren(stagger.hero, 0.1)}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: duration.fast } }}
            className="max-w-xl"
          >
            <motion.div variants={fadeUp} className="eyebrow mb-4 text-fg-dim">
              {card.kind === 'movie' ? t('nav.movies') : t('nav.series')}
            </motion.div>
            <motion.div variants={fadeUp}>
              <TitleLogo logo={card.logo} title={card.title} height="clamp(5rem, 14vw, 9rem)" />
            </motion.div>
            <motion.div variants={fadeUp} className="mt-5">
              <MetaLine card={card} />
            </motion.div>
            <motion.p variants={fadeUp} className="mt-3 line-clamp-3 max-w-[34rem] text-lead text-fg/90 text-pretty">
              <Crossfade k={card.overview}>{card.overview}</Crossfade>
            </motion.p>
            <motion.div variants={fadeUp} className="mt-7 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" icon={<Play size={20} className="fill-current" />} onClick={() => navigate(watchPath(card))}>
                {hasProgress ? t('common.resume') : t('common.play')}
              </Button>
              <Link to={`/title/${card.id}`} state={{ background: location }} className="contents">
                <Button variant="secondary" size="lg" icon={<Info size={20} />} tabIndex={-1}>
                  {t('common.moreInfo')}
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="page-x absolute inset-x-0 bottom-8 flex items-center justify-between sm:bottom-12">
        <div className="flex items-center gap-2" role="tablist">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={t('home.heroGo', { title: it.title })}
              onClick={() => setIndex(i)}
              className="group grid h-6 place-items-center px-0.5"
            >
              <span className={cn('relative block h-[3px] overflow-hidden rounded-full bg-white/30 transition-[width] duration-300', i === index ? 'w-10' : 'w-5 group-hover:bg-white/50')}>
                {i === index && (
                  <motion.span
                    key={`${index}-${paused}`}
                    className="absolute inset-0 origin-left bg-fg [[dir=rtl]_&]:origin-right"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: paused ? 1 : 1 }}
                    transition={{ duration: paused ? 0 : ROTATE_MS / 1000, ease: 'linear' }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
        {showVideo && (
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? t('player.unmute') : t('player.mute')}
            className="grid size-10 place-items-center rounded-full border border-white/40 bg-black/40 hover:border-fg"
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        )}
      </div>
    </section>
  );
}
