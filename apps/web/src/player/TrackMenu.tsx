import type { AudioTrack, SubtitleTrack } from '@marquee/shared';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { languageName } from '../lib/hooks';
import { usePrefs } from '../stores/prefs';
import { cn } from '../lib/cn';

interface Props {
  audio: AudioTrack[];
  subtitles: SubtitleTrack[];
  audioIndex: number;
  subtitleIndex: number | null;
  onAudio: (i: number) => void;
  onSubtitle: (i: number | null) => void;
}

function Item({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitemradio" aria-checked={on} onClick={onClick} className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-body transition-colors hover:bg-white/10', on ? 'text-fg' : 'text-fg-dim')}>
      <span className="grid size-4 shrink-0 place-items-center">{on && <Check size={15} className="text-accent" strokeWidth={3} />}</span>
      <span className="truncate">{children}</span>
    </button>
  );
}

export function TrackMenu({ audio, subtitles, audioIndex, subtitleIndex, onAudio, onSubtitle }: Props) {
  const { t } = useTranslation();
  const lang = usePrefs((s) => s.language);
  const name = (x: { lang: string | null; label: string; index: number }) =>
    x.label || (x.lang ? languageName(x.lang, lang) : t('player.unknownTrack', { n: x.index + 1 }));
  return (
    <div className="flex max-h-72 min-w-64 gap-2 overflow-y-auto" role="menu">
      {audio.length > 1 && (
        <div className="flex-1">
          <div className="eyebrow px-3 pt-1 pb-1.5">{t('player.audio')}</div>
          {audio.map((a) => (
            <Item key={a.index} on={a.index === audioIndex} onClick={() => onAudio(a.index)}>
              {name(a)}{a.channels && a.channels > 2 ? ` · ${a.channels - 1}.1` : ''}
            </Item>
          ))}
        </div>
      )}
      {subtitles.length > 0 && (
        <div className="flex-1">
          <div className="eyebrow px-3 pt-1 pb-1.5">{t('player.subtitles')}</div>
          <Item on={subtitleIndex === null} onClick={() => onSubtitle(null)}>{t('player.subtitlesOff')}</Item>
          {subtitles.map((s) => (
            <Item key={s.index} on={s.index === subtitleIndex} onClick={() => onSubtitle(s.index)}>{name(s)}</Item>
          ))}
        </div>
      )}
    </div>
  );
}
