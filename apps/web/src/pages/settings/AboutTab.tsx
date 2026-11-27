import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { languageInfo } from '@marquee/shared';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { useStatus } from '../../queries/hooks';
import { Row, Section } from './parts';

/** What the app noticed (slow screens, errors), to copy and send when something does not work. */
function Report() {
  const { t } = useTranslation();
  const { data, refetch } = useQuery({
    queryKey: ['diagnostics'],
    queryFn: api.diagnostics,
    refetchInterval: 10_000,
  });
  if (!data) return null;
  const text = [
    `Marquee ${data.version} | Telegram ${data.telegram} | up ${data.uptimeSeconds}s | ${data.rssMb} MB`,
    data.index
      ? `index: ${data.index.items} files, ${data.index.titles} titles, scanning=${data.index.scanning}, discovering=${data.index.discovering}`
      : '',
    ...data.entries.map((e) => `${e.agoSeconds}s ago [${e.kind}] ${e.text}`),
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <Section title={t('settings.report')} hint={t('settings.reportHint')}>
      <div className="space-y-3 p-4">
        <pre
          dir="ltr"
          className="max-h-64 overflow-auto rounded-md bg-black/30 p-3 text-caption whitespace-pre-wrap text-fg-dim"
        >
          {text}
        </pre>
        <div className="flex gap-3">
          <Button size="sm" onClick={() => void navigator.clipboard?.writeText(text)}>
            {t('settings.copyReport')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    </Section>
  );
}

export function AboutTab() {
  const { t } = useTranslation();
  const { data } = useStatus();
  if (!data) return null;
  return (
    <>
      <Section>
        <Row title={t('settings.version')}>
          <span className="tabular-nums text-fg-dim">{data.version}</span>
        </Row>
        <Row title={t('settings.mode')}>
          <span className="text-fg-dim">
            {data.mock ? t('settings.modeDemo') : t('settings.modeLive')}
          </span>
        </Row>
        <Row title={t('settings.tmdb')}>
          <span className="text-fg-dim">
            {data.tmdb ? t('settings.tmdbOn') : t('settings.tmdbOff')}
          </span>
        </Row>
        {data.telegram.user && (
          <Row title={t('settings.account')}>
            <span className="text-fg-dim">{data.telegram.user.name}</span>
          </Row>
        )}
        <Row title={t('settings.metadataLangs')}>
          <span className="text-fg-dim">
            {data.languagesCached.map((l) => languageInfo(l).native).join(' · ')}
          </span>
        </Row>
      </Section>
      <Report />
    </>
  );
}
