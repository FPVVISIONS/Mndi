import type { TitleDetail as Detail } from '@marquee/shared';
import { motion } from 'framer-motion';
import { Check, Layers, Link2Off, Play, Plus, ThumbsUp, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArtImage } from '../components/media/ArtImage';
import { MetaLine } from '../components/media/MetaLine';
import { TitleCardView } from '../components/media/TitleCardView';
import { TitleLogo } from '../components/media/TitleLogo';
import { Button, IconButton } from '../components/ui/Button';
import { Crossfade } from '../components/ui/Crossfade';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { duration, ease, fadeUp, spring, staggerChildren, stagger } from '../design/motion';
import { languageName } from '../lib/hooks';
import { useTitle, useToggleLike, useToggleList } from '../queries/hooks';
import { usePrefs } from '../stores/prefs';
import { useToasts } from '../stores/toasts';
import { EpisodeList } from './title/EpisodeList';
import { MatchModal } from './title/MatchModal';
import { VersionHost, type VersionTarget } from './title/VersionHost';

function Body({ d }: { d: Detail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lang = usePrefs((s) => s.language);
  const push = useToasts((s) => s.push);
  const toggleList = useToggleList();
  const toggleLike = useToggleLike();
  const [target, setTarget] = useState<VersionTarget | null>(null);
  const [matching, setMatching] = useState(false);

  const resuming = Boolean(d.progress);
  const playLabel = d.playLabel
    ? t(resuming ? 'detail.resumeEpisode' : 'detail.playEpisode', { label: d.playLabel })
    : t(resuming ? 'common.resume' : 'common.play');
  const initialSeason = d.seasonList.find((s) => d.playLabel?.startsWith(`S${s.season}:`))?.season ?? d.seasonList[0]?.season ?? 1;

  return (
    <>
      <motion.div variants={staggerChildren(stagger.list, 0.12)} initial="hidden" animate="show" className="relative z-10 -mt-32 px-5 pb-12 sm:px-10">
        <motion.div variants={fadeUp}>
          <TitleLogo logo={d.logo} title={d.title} height="clamp(4.5rem, 12vw, 7.5rem)" />
        </motion.div>
        <motion.div variants={fadeUp} className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" disabled={!d.playFileId} icon={<Play size={20} className="fill-current" />} onClick={() => d.playFileId && navigate(`/watch/${d.playFileId}`)}>
            {playLabel}
          </Button>
          {d.kind === 'movie' && d.versions.length > 1 && (
            <Button variant="secondary" size="lg" icon={<Layers size={19} />} onClick={() => setTarget({ scope: 'title', refId: d.id, title: d.title })}>
              {t('detail.versions')} · {d.versions.length}
            </Button>
          )}
          <IconButton
            tone="solid"
            label={d.inList ? t('common.removeFromList') : t('common.addToList')}
            onClick={() => { toggleList.mutate({ id: d.id, on: !d.inList }); push(d.inList ? t('toast.removed') : t('toast.added')); }}
            className="size-12"
          >
            <motion.span key={String(d.inList)} initial={{ scale: 0.4, rotate: -60, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={spring.snappy} className="grid">
              {d.inList ? <Check size={22} /> : <Plus size={22} />}
            </motion.span>
          </IconButton>
          <IconButton tone="solid" label={d.liked ? t('common.liked') : t('common.like')} onClick={() => toggleLike.mutate({ id: d.id, on: !d.liked })} className="size-12">
            <ThumbsUp size={20} className={d.liked ? 'fill-fg' : ''} />
          </IconButton>
        </motion.div>

        <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_16rem] md:gap-12">
          <motion.div variants={fadeUp}>
            <MetaLine card={d} />
            {d.tagline && <p className="mt-4 font-display text-title-s text-fg-dim italic"><Crossfade k={d.tagline}>{d.tagline}</Crossfade></p>}
            <p className="mt-3 max-w-[40rem] text-lead text-fg/90 text-pretty">
              <Crossfade k={d.overview}>{d.overview || (d.matched ? '' : t('detail.unmatchedHint'))}</Crossfade>
            </p>
          </motion.div>
          <motion.div variants={fadeUp} className="space-y-4 text-small">
            {d.cast.length > 0 && (
              <div>
                <div className="eyebrow">{t('detail.cast')}</div>
                <p className="mt-1 text-fg-dim">{d.cast.slice(0, 5).map((c) => c.name).join(', ')}</p>
              </div>
            )}
            {d.genres.length > 0 && (
              <div>
                <div className="eyebrow">{t('detail.genres')}</div>
                <p className="mt-1 text-fg-dim"><Crossfade k={d.genres.join()}>{d.genres.join(', ')}</Crossfade></p>
              </div>
            )}
            {d.originalLanguage && (
              <div>
                <div className="eyebrow">{t('detail.originalLanguage')}</div>
                <p className="mt-1 text-fg-dim">{languageName(d.originalLanguage, lang)}</p>
              </div>
            )}
            <div>
              <button type="button" onClick={() => setMatching(true)} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-1.5 font-semibold text-fg-dim transition-colors hover:border-fg-dim hover:text-fg">
                {d.matched ? <Wrench size={14} /> : <Link2Off size={14} className="text-accent" />}
                {d.matched ? t('detail.fixMatch') : t('detail.unmatched')}
              </button>
            </div>
          </motion.div>
        </div>

        {d.kind === 'series' && (
          <motion.div variants={fadeUp} className="mt-12">
            <EpisodeList titleId={d.id} titleName={d.title} seasons={d.seasonList} initialSeason={initialSeason} onPickVersion={setTarget} />
          </motion.div>
        )}

        {d.cast.length > 5 && (
          <motion.section variants={fadeUp} className="mt-12" aria-label={t('detail.cast')}>
            <h2 className="mb-4 font-display text-title-m">{t('detail.cast')}</h2>
            <ul className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
              {d.cast.map((c) => (
                <li key={c.name} className="w-24 shrink-0 text-center">
                  <span className="mx-auto grid size-20 place-items-center overflow-hidden rounded-full bg-surface-3 font-display text-title-s text-fg-dim">
                    {c.photo ? <ArtImage image={c.photo} size="w154" className="size-full" /> : c.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </span>
                  <span className="mt-2 block truncate text-small font-medium">{c.name}</span>
                  <span className="block truncate text-caption text-fg-faint">{c.role}</span>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        {d.similar.length > 0 && (
          <motion.section variants={fadeUp} className="mt-12" aria-label={t('detail.moreLikeThis')}>
            <h2 className="mb-4 font-display text-title-m">{t('detail.moreLikeThis')}</h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3 pb-24 [--card-w:100%]">
              {d.similar.slice(0, 8).map((c) => <li key={c.id}><TitleCardView card={c} /></li>)}
            </ul>
          </motion.section>
        )}
      </motion.div>

      <VersionHost target={target} onClose={() => setTarget(null)} />
      <MatchModal open={matching} onClose={() => setMatching(false)} titleId={d.id} fileName={d.title} matched={d.matched} />
    </>
  );
}

/** Title details. Opens as a sheet over the page you came from, or as a plain page on a direct visit. */
export default function TitleDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const nav = location.state as { background?: unknown; art?: string } | null;
  const modal = Boolean(nav?.background);
  const { data: d, isError, isPending } = useTitle(Number(id));

  const close = () => (modal ? navigate(-1) : navigate('/'));

  useEffect(() => {
    if (!modal) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && navigate(-1);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [modal, navigate]);

  const sheet = (
    <motion.div
      initial={modal ? { opacity: 0, y: 40, scale: 0.97 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20 }}
      transition={spring.modal}
      className="relative mx-auto w-full max-w-[60rem] overflow-hidden bg-surface-1 shadow-[var(--shadow-modal)] md:rounded-xl"
      role="dialog"
      aria-modal={modal}
      aria-label={d?.title}
    >
      {isError || (!isPending && !d) ? (
        <div className="pt-12">
          <EmptyState icon={<X size={26} />} title={t('detail.notFound')} body={t('detail.notFoundBody')} action={<Button variant="primary" onClick={close}>{t('common.back')}</Button>} />
        </div>
      ) : (
        <>
          <motion.div layoutId={nav?.art ? `art-${nav.art}` : undefined} className="relative aspect-[16/10] max-h-[34rem] w-full overflow-hidden bg-surface-2 sm:aspect-video" transition={spring.modal}>
            {d ? <ArtImage image={d.backdrop} size="w1280" eager className="size-full" /> : <Skeleton className="size-full rounded-none" />}
            <div className="scrim-bottom absolute inset-0" />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-surface-1 to-transparent" />
          </motion.div>
          <IconButton label={t('common.close')} tone="solid" onClick={close} className="absolute end-4 top-4 z-20">
            <X size={20} />
          </IconButton>
          {d ? <Body d={d} /> : <div className="relative z-10 -mt-24 space-y-4 px-10 pb-12"><Skeleton className="h-16 w-72" /><Skeleton className="h-12 w-64" /><Skeleton className="h-24 w-full" /></div>}
        </>
      )}
    </motion.div>
  );

  if (!modal) return <div className="pt-[var(--nav-h)] md:px-6 md:pt-[calc(var(--nav-h)+1rem)]">{sheet}</div>;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] overflow-y-auto" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <motion.div className="fixed inset-0 bg-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: duration.base, ease: ease.out }} aria-hidden />
      <div className="relative min-h-full md:px-6 md:py-10" onPointerDown={(e) => e.target === e.currentTarget && close()}>
        {sheet}
      </div>
    </div>
  );
}
