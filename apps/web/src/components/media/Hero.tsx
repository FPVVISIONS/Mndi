import type { TitleCard } from '@marquee/shared';
import { AnimatePresence, m } from 'framer-motion';
import { Info, Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { blurUp, duration, staggerChildren, stagger } from '../../design/motion';
import { cn } from '../../lib/cn';
import { useMedia } from '../../lib/hooks';
import { useTitle } from '../../queries/hooks';
import { usePrefs } from '../../stores/prefs';
import { Crossfade } from '../ui/Crossfade';
import { Button } from '../ui/Button';
import { ArtImage } from './ArtImage';
import { MetaLine } from './MetaLine';
import { TitleLogo } from './TitleLogo';
import { watchPath } from './QuickActions';

/** How long each featured title stays up before the next one takes over while nobody is touching it. */
const ROTATE_MS = 7_000;
const PREVIEW_DELAY = 2600;

export function Hero({ items }: { items: TitleCard[] }) {
  return items.length ? <HeroSlides items={items} /> : null;
}

function HeroSlides({ items }: { items: TitleCard[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const preview = usePrefs((s) => s.heroPreview);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [muted, setMuted] = useState(true);
  const video = useRef<HTMLVideoElement>(null);
  const card = items[Math.min(index, items.length - 1)]!;

  // The outgoing slide stays underneath while the new one fades in, then is dropped.
  const [layers, setLayers] = useState<number[]>(() => [card.id]);
  useEffect(() => {
    setLayers((prev) =>
      prev[prev.length - 1] === card.id ? prev : [prev[prev.length - 1]!, card.id],
    );
    const id = window.setTimeout(() => setLayers([card.id]), duration.hero * 1000 + 100);
    return () => window.clearTimeout(id);
  }, [card.id]);

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS);
    return () => window.clearTimeout(id);
  }, [index, items.length, paused]);

  // Trailers live on the detail payload. Fetch it only for the visible slide, after the first paint.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(false);
    if (!preview) return;
    const id = window.setTimeout(() => setArmed(true), 1200);
    return () => window.clearTimeout(id);
  }, [card?.id, preview]);
  const { data: detail } = useTitle(card?.id ?? 0, preview && armed && Boolean(card));
  const trailer = detail?.id === card?.id ? detail?.trailer : null;
  const trailerKey = trailer?.key;
  useEffect(() => {
    setShowVideo(false);
    if (!preview || !trailerKey || usePrefs.getState().reduceMotion) return;
    const id = window.setTimeout(() => setShowVideo(true), PREVIEW_DELAY);
    return () => window.clearTimeout(id);
  }, [card?.id, trailerKey, preview]);

  const hasProgress = Boolean(card.progress);

  return (
    <section
      className="relative isolate min-h-[41rem] overflow-hidden sm:min-h-[44rem] lg:h-[min(52rem,88vh)]"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {/* Plain elements, not motion components: the first backdrop must be visible on the very first
          frame (it is the page's largest paint), before any animation code has loaded. */}
      {layers.map((id) => {
        const slide = items.find((it) => it.id === id);
        if (!slide) return null;
        const current = id === card.id;
        return (
          <div
            key={id}
            className={cn('absolute inset-0 -z-10', current && layers.length > 1 && 'hero-fade-in')}
          >
            <div className="kenburns size-full">
              <ArtImage image={slide.backdrop} size="w1280" eager className="size-full" />
            </div>
            {current && showVideo && trailer?.site === 'file' && (
              <m.video
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
            {current && showVideo && trailer?.site === 'YouTube' && (
              <m.iframe
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
          </div>
        );
      })}
      <div className="scrim-start absolute inset-0 -z-10" />
      <div className="scrim-fade-bg absolute inset-x-0 bottom-0 -z-10 h-1/3" />

      <div className="page-x relative flex h-full min-h-[inherit] flex-col justify-end pb-[12.5rem] pt-[calc(var(--nav-h)+3rem)] sm:pb-[15.5rem]">
        <AnimatePresence mode="wait">
          <m.div
            key={card.id}
            variants={staggerChildren(stagger.hero, 0.1)}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, transition: { duration: duration.fast } }}
            className="max-w-xl"
          >
            <m.div variants={blurUp} className="eyebrow mb-4 text-fg-dim">
              {card.kind === 'movie' ? t('nav.movies') : t('nav.series')}
            </m.div>
            <m.div variants={blurUp}>
              <TitleLogo logo={card.logo} title={card.title} height="clamp(5rem, 14vw, 9rem)" />
            </m.div>
            <m.div variants={blurUp} className="mt-5">
              <MetaLine card={card} />
            </m.div>
            <m.p
              variants={blurUp}
              className="mt-3 line-clamp-3 max-w-[34rem] text-lead text-fg/90 text-pretty"
            >
              <Crossfade k={card.overview}>{card.overview}</Crossfade>
            </m.p>
            <m.div variants={blurUp} className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                icon={<Play size={20} className="fill-current" />}
                onClick={() => navigate(watchPath(card))}
              >
                {hasProgress ? t('common.resume') : t('common.play')}
              </Button>
              <Link to={`/title/${card.id}`} state={{ background: location }} className="contents">
                <Button variant="secondary" size="lg" icon={<Info size={20} />} tabIndex={-1}>
                  {t('common.moreInfo')}
                </Button>
              </Link>
            </m.div>
          </m.div>
        </AnimatePresence>
      </div>

      <div className="absolute inset-x-0 bottom-4 z-10 sm:bottom-6">
        {showVideo && (
          <div className="page-x mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? t('player.unmute') : t('player.mute')}
              className="glass grid size-10 place-items-center rounded-full"
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>
        )}
        <Spotlight
          items={items}
          index={index}
          paused={paused}
          onSelect={setIndex}
          onOpen={(c) => navigate(`/title/${c.id}`, { state: { background: location } })}
        />
      </div>
    </section>
  );
}

/**
 * The strip under the featured title: a row of posters where the selected one opens into a wide
 * card with its logo. Left alone, it moves on to the next title by itself; tapping another poster
 * picks it, tapping the open card opens the title.
 */
function Spotlight({
  items,
  index,
  paused,
  onSelect,
  onOpen,
}: {
  items: TitleCard[];
  index: number;
  paused: boolean;
  onSelect: (i: number) => void;
  onOpen: (c: TitleCard) => void;
}) {
  const { t } = useTranslation();
  const wide = useMedia('(min-width: 48rem)');
  const h = wide ? 176 : 132;
  const narrow = Math.round((h * 2) / 3);
  const open = Math.round((h * 16) / 9);
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep the open card centred, scrolling the strip itself (never the page).
  useEffect(() => {
    const el = refs.current[index];
    const c = box.current;
    if (!el || !c) return;
    const t = window.setTimeout(() => {
      const a = el.getBoundingClientRect();
      const b = c.getBoundingClientRect();
      c.scrollBy({ left: a.left + a.width / 2 - (b.left + b.width / 2), behavior: 'smooth' });
    }, 60);
    return () => window.clearTimeout(t);
  }, [index, open]);

  return (
    <div
      ref={box}
      role="tablist"
      aria-label={t('home.featured')}
      className="no-scrollbar flex items-end gap-2.5 overflow-x-auto px-[var(--gutter)] py-2"
      style={{ height: h + 16 }}
    >
      {items.map((c, i) => {
        const on = i === index;
        return (
          <m.button
            key={c.id}
            ref={(el: HTMLButtonElement | null) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={c.title}
            onClick={() => (on ? onOpen(c) : onSelect(i))}
            initial={false}
            animate={{ width: on ? open : narrow, y: on ? -4 : 0 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26, mass: 0.9 }}
            className={cn(
              'relative shrink-0 overflow-hidden rounded-[1rem] bg-surface-2 shadow-[var(--shadow-card)]',
              on ? 'ring-2 ring-white/90' : 'opacity-90 hover:opacity-100',
            )}
            style={{ height: h }}
          >
            <ArtImage image={c.poster} size="w342" className="absolute inset-0 size-full" />
            <m.div
              className="absolute inset-0"
              initial={false}
              animate={{ opacity: on ? 1 : 0 }}
              transition={{ duration: 0.35 }}
            >
              <ArtImage image={c.backdrop} size="w780" className="absolute inset-0 size-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
              <div className="absolute inset-x-3 bottom-3 flex items-end">
                {c.logo ? (
                  <div className="h-9 w-32 sm:h-12 sm:w-44">
                    <ArtImage
                      image={c.logo}
                      size="w500"
                      fit="contain"
                      className="!bg-transparent size-full [&_img]:object-[var(--logo-pos,left)]"
                    />
                  </div>
                ) : (
                  <span className="line-clamp-2 text-start text-small font-bold text-white sm:text-body">
                    {c.title}
                  </span>
                )}
              </div>
              {on && (
                <m.span
                  key={`${index}-${paused}`}
                  className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-white [[dir=rtl]_&]:origin-right"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: paused ? 0 : ROTATE_MS / 1000, ease: 'linear' }}
                />
              )}
            </m.div>
          </m.button>
        );
      })}
    </div>
  );
}
