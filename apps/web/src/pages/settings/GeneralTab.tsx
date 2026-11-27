import { LANGUAGES, type LanguageCode } from '@marquee/shared';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { spring } from '../../design/motion';
import { cn } from '../../lib/cn';
import { setLanguage } from '../../lib/language';
import { languageName } from '../../lib/hooks';
import { usePrefs, type AudioPref, type SubtitlePref } from '../../stores/prefs';
import { Row, Section, Select } from './parts';

export function GeneralTab() {
  const { t } = useTranslation();
  const { language, audio, subtitles, set } = usePrefs();
  const id = useId();

  const audioOptions: { value: AudioPref; label: string }[] = [
    { value: 'original', label: t('settings.audioOriginal') },
    { value: 'ui', label: t('settings.audioUi') },
    ...LANGUAGES.map((l) => ({
      value: l.code as AudioPref,
      label: languageName(l.code, language),
    })),
  ];
  const subOptions: { value: SubtitlePref; label: string }[] = [
    { value: 'auto', label: t('settings.subAuto') },
    { value: 'off', label: t('common.off') },
    { value: 'ui', label: t('settings.subUi') },
    ...LANGUAGES.map((l) => ({
      value: l.code as SubtitlePref,
      label: languageName(l.code, language),
    })),
  ];

  return (
    <>
      <Section title={t('settings.language')} hint={t('settings.languageHint')}>
        <div
          className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:p-4 lg:grid-cols-5"
          role="radiogroup"
          aria-label={t('settings.language')}
        >
          {LANGUAGES.map((l) => {
            const on = l.code === language;
            return (
              <button
                key={l.code}
                type="button"
                role="radio"
                aria-checked={on}
                lang={l.code}
                dir={l.rtl ? 'rtl' : 'ltr'}
                onClick={() => void setLanguage(l.code as LanguageCode)}
                className={cn(
                  'relative flex h-14 items-center justify-between rounded-md border px-4 text-lead font-medium transition-colors',
                  on
                    ? 'border-transparent'
                    : 'border-line text-fg-dim hover:border-line-strong hover:text-fg',
                )}
              >
                {on && (
                  <motion.span
                    layoutId={`lang-${id}`}
                    transition={spring.snappy}
                    className="absolute inset-0 rounded-md bg-fg"
                  />
                )}
                <span className={cn('relative', on && 'text-bg')}>{l.native}</span>
                {on && <Check size={17} className="relative text-bg" />}
              </button>
            );
          })}
        </div>
      </Section>

      <Section>
        <Row title={t('settings.audioLang')} hint={t('settings.audioLangHint')}>
          <Select
            label={t('settings.audioLang')}
            value={audio}
            onChange={(v) => set('audio', v)}
            options={audioOptions}
          />
        </Row>
        <Row title={t('settings.subLang')} hint={t('settings.subLangHint')}>
          <Select
            label={t('settings.subLang')}
            value={subtitles}
            onChange={(v) => set('subtitles', v)}
            options={subOptions}
          />
        </Row>
      </Section>
    </>
  );
}
