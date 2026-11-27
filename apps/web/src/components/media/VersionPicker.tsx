import type { FileVersion } from '@marquee/shared';
import { motion } from 'framer-motion';
import { Check, Film, MessageSquare, Play, Subtitles, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { stagger, fadeUp, staggerChildren } from '../../design/motion';
import { cn } from '../../lib/cn';
import { formatBytes } from '../../lib/format';
import { languageName } from '../../lib/hooks';
import { usePrefs } from '../../stores/prefs';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Skeleton } from '../ui/Skeleton';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  versions: FileVersion[] | undefined;
  /** Called with the version the person wants to play. */
  onPlay: (v: FileVersion) => void;
}

function qualityBadge(q: string): string {
  if (q === '2160p') return '4K';
  return q || 'SD';
}

/**
 * Chat groups often hold several releases of one title. This lists them the way media apps do,
 * so the right file (quality, language, size, source chat) can be picked before playing.
 */
export function VersionPicker({ open, onClose, title, subtitle, versions, onPlay }: Props) {
  const { t } = useTranslation();
  const lang = usePrefs((s) => s.language);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (open && versions) setSelected(versions.find((v) => v.chosen)?.id ?? versions[0]?.id ?? null);
  }, [open, versions]);

  const names = (codes: string[]) => codes.map((c) => languageName(c, lang)).join(', ');
  const current = versions?.find((v) => v.id === selected);

  return (
    <Modal open={open} onClose={onClose} title={t('detail.versions')} className="max-w-xl">
      <p className="-mt-3 mb-4 truncate text-small text-fg-dim">
        {title}
        {subtitle ? ` · ${subtitle}` : ''}
      </p>
      {!versions ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : (
        <motion.ul variants={staggerChildren(stagger.list)} initial="hidden" animate="show" role="radiogroup" aria-label={t('detail.versions')} className="space-y-2">
          {versions.map((v) => {
            const on = v.id === selected;
            return (
              <motion.li key={v.id} variants={fadeUp}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSelected(v.id)}
                  onDoubleClick={() => onPlay(v)}
                  className={cn(
                    'flex w-full items-start gap-4 rounded-lg border p-3.5 text-start transition-colors duration-150',
                    on ? 'border-accent bg-accent-dim/60' : 'border-line bg-surface-2 hover:border-line-strong',
                  )}
                >
                  <span className={cn('mt-0.5 grid h-9 min-w-12 place-items-center rounded-md px-2 text-small font-bold tracking-tight', on ? 'bg-accent text-on-accent' : 'bg-surface-3 text-fg')}>
                    {qualityBadge(v.quality)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-body font-semibold">
                      <span className="truncate">{v.label}</span>
                      {!v.native && <span className="shrink-0 rounded-xs bg-surface-3 px-1.5 py-0.5 text-caption font-medium text-fg-dim">{v.container.toUpperCase()}</span>}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-dim">
                      {v.languages.length > 0 && (
                        <span className="inline-flex items-center gap-1.5"><Volume2 size={13} aria-hidden />{names(v.languages)}</span>
                      )}
                      {v.subtitles.length > 0 && (
                        <span className="inline-flex items-center gap-1.5"><Subtitles size={13} aria-hidden />{names(v.subtitles)}</span>
                      )}
                      <span className="inline-flex items-center gap-1.5"><Film size={13} aria-hidden />{formatBytes(v.size)}{v.resolution ? ` · ${v.resolution}` : ''}</span>
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5 truncate text-caption text-fg-faint" title={v.name}>
                      <MessageSquare size={12} aria-hidden className="shrink-0" />
                      <span className="truncate">{v.chat ? `${v.chat} · ` : ''}{v.name}</span>
                    </span>
                  </span>
                  <span className={cn('mt-1 grid size-5 shrink-0 place-items-center rounded-full border', on ? 'border-accent bg-accent text-on-accent' : 'border-line-strong')}>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" disabled={!current} icon={<Play size={16} className="fill-current" />} onClick={() => current && onPlay(current)}>
          {t('common.play')}
        </Button>
      </div>
    </Modal>
  );
}
