import { useTranslation } from 'react-i18next';
import { languageInfo } from '@marquee/shared';
import { useStatus } from '../../queries/hooks';
import { Row, Section } from './parts';

export function AboutTab() {
  const { t } = useTranslation();
  const { data } = useStatus();
  if (!data) return null;
  return (
    <Section>
      <Row title={t('settings.version')}><span className="tabular-nums text-fg-dim">{data.version}</span></Row>
      <Row title={t('settings.mode')}><span className="text-fg-dim">{data.mock ? t('settings.modeDemo') : t('settings.modeLive')}</span></Row>
      <Row title={t('settings.tmdb')}><span className="text-fg-dim">{data.tmdb ? t('settings.tmdbOn') : t('settings.tmdbOff')}</span></Row>
      {data.telegram.user && <Row title={t('settings.account')}><span className="text-fg-dim">{data.telegram.user.name}</span></Row>}
      <Row title={t('settings.metadataLangs')}>
        <span className="text-fg-dim">{data.languagesCached.map((l) => languageInfo(l).native).join(' · ')}</span>
      </Row>
    </Section>
  );
}
