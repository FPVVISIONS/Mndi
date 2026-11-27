import { useTranslation } from 'react-i18next';
import { Segmented } from '../../components/ui/Segmented';
import { Switch } from '../../components/ui/Switch';
import { usePrefs, type QualityPref } from '../../stores/prefs';
import { Row, Section } from './parts';

export function PlaybackTab() {
  const { t } = useTranslation();
  const { quality, autoplayNext, heroPreview, skipIntro, set } = usePrefs();
  const options: { value: QualityPref; label: string }[] = [
    { value: 'best', label: t('settings.qualityBest') },
    { value: '1080p', label: '1080p' },
    { value: '720p', label: '720p' },
  ];
  return (
    <Section>
      <Row title={t('settings.quality')} hint={t('settings.qualityHint')}>
        <Segmented size="sm" label={t('settings.quality')} value={quality} options={options} onChange={(v) => set('quality', v)} />
      </Row>
      <Row title={t('settings.autoplayNext')} hint={t('settings.autoplayNextHint')}>
        <Switch label={t('settings.autoplayNext')} checked={autoplayNext} onChange={(v) => set('autoplayNext', v)} />
      </Row>
      <Row title={t('settings.skipIntro')} hint={t('settings.skipIntroHint')}>
        <Switch label={t('settings.skipIntro')} checked={skipIntro} onChange={(v) => set('skipIntro', v)} />
      </Row>
      <Row title={t('settings.heroPreview')} hint={t('settings.heroPreviewHint')}>
        <Switch label={t('settings.heroPreview')} checked={heroPreview} onChange={(v) => set('heroPreview', v)} />
      </Row>
    </Section>
  );
}
