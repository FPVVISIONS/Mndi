import type { EpisodeItem, SeasonSummary } from '@marquee/shared';
import { motion } from 'framer-motion';
import { ChevronDown, Layers, Play } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArtImage } from '../../components/media/ArtImage';
import { MenuItem, Popover } from '../../components/ui/Popover';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Skeleton } from '../../components/ui/Skeleton';
import { fadeUp, staggerChildren, stagger } from '../../design/motion';
import { useEpisodes } from '../../queries/hooks';
import type { VersionTarget } from './VersionHost';

interface Props {
  titleId: number;
  titleName: string;
  seasons: SeasonSummary[];
  initialSeason: number;
  onPickVersion: (t: VersionTarget) => void;
}

function EpisodeRow({ ep, titleName, onPickVersion }: { ep: EpisodeItem; titleName: string; onPickVersion: Props['onPickVersion'] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const p = ep.progress;
  const label = `S${ep.season}:E${ep.episode}`;
  const name = ep.name || t('common.episode', { n: ep.episode });

  return (
    <motion.li variants={fadeUp} className="group/ep flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-2 sm:gap-5 sm:p-3">
      <span className="w-6 shrink-0 text-center font-display text-title-s text-fg-faint sm:w-8">{ep.episode}</span>
      <button
        type="button"
        disabled={!ep.fileId}
        onClick={() => ep.fileId && navigate(`/watch/${ep.fileId}`)}
        aria-label={t(p ? 'detail.resumeEpisode' : 'detail.playEpisode', { label })}
        className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-md bg-surface-3 sm:w-44"
      >
        <ArtImage image={ep.still} size="w342" className="size-full" />
        <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity group-hover/ep:opacity-100">
          <span className="grid size-10 place-items-center rounded-full border border-white/70 bg-black/50"><Play size={17} className="fill-fg" /></span>
        </span>
        {p && <ProgressBar value={p.position / p.duration} className="absolute inset-x-0 bottom-0 h-[3px] rounded-none bg-black/50" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="truncate text-body font-semibold">{name}</h3>
          {ep.runtime ? <span className="shrink-0 text-small text-fg-dim">{t('common.minutes', { count: ep.runtime })}</span> : null}
        </div>
        {ep.overview && <p className="mt-1 line-clamp-2 text-small text-fg-dim">{ep.overview}</p>}
        {ep.versions > 1 && (
          <button
            type="button"
            onClick={() => onPickVersion({ scope: 'episode', refId: ep.id, title: titleName, subtitle: `${label} · ${name}` })}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-caption font-semibold text-fg-dim transition-colors hover:border-fg-dim hover:text-fg"
          >
            <Layers size={13} aria-hidden />
            {t('detail.versions')} · {ep.versions}
          </button>
        )}
      </div>
    </motion.li>
  );
}

export function EpisodeList({ titleId, titleName, seasons, initialSeason, onPickVersion }: Props) {
  const { t } = useTranslation();
  const [season, setSeason] = useState(initialSeason);
  const { data, isPending } = useEpisodes(titleId, season);

  return (
    <section aria-label={t('detail.episodes')}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-display text-title-m">{t('detail.episodes')}</h2>
        {seasons.length > 0 && (
          <Popover
            align="end"
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className="inline-flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3.5 py-2 text-small font-semibold transition-colors hover:border-line-strong">
                {t('common.season', { n: season })}
                <ChevronDown size={15} className="text-fg-dim" />
              </button>
            )}
          >
            {(close) => seasons.map((s) => (
              <MenuItem key={s.season} active={s.season === season} onClick={() => { setSeason(s.season); close(); }}>
                {t('common.season', { n: s.season })}
              </MenuItem>
            ))}
          </Popover>
        )}
      </div>
      {isPending ? (
        <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : data && data.episodes.length ? (
        <motion.ul key={season} variants={staggerChildren(stagger.list)} initial="hidden" animate="show">
          {data.episodes.map((ep) => <EpisodeRow key={ep.id} ep={ep} titleName={titleName} onPickVersion={onPickVersion} />)}
        </motion.ul>
      ) : (
        <p className="py-10 text-center text-fg-dim">{t('detail.noEpisodes')}</p>
      )}
    </section>
  );
}
