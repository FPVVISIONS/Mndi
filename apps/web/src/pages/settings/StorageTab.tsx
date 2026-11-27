import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { api } from '../../lib/api';
import { formatBytes } from '../../lib/format';
import { useToasts } from '../../stores/toasts';
import { Row, Section, Select } from './parts';

const LIMITS = [256, 512, 1024, 2048, 5120, 10240];

export function StorageTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const { data } = useQuery({ queryKey: ['cache'], queryFn: api.cache });
  const limit = useMutation({ mutationFn: (mb: number) => api.setCacheLimit(mb), onSuccess: () => void qc.invalidateQueries({ queryKey: ['cache'] }) });
  const clear = useMutation({
    mutationFn: api.clearCache,
    onSuccess: () => { push(t('toast.cacheCleared')); void qc.invalidateQueries({ queryKey: ['cache'] }); },
  });

  const limitBytes = (data?.limitMb ?? 512) * 1024 * 1024;
  const options = [...new Set([...LIMITS, data?.limitMb ?? 512])].sort((a, b) => a - b).map((mb) => ({
    value: String(mb),
    label: mb >= 1024 ? `${mb / 1024} GB` : `${mb} MB`,
  }));

  return (
    <Section>
      <Row title={t('settings.streamCache')} hint={t('settings.streamCacheHint')} stack>
        <div className="flex items-center gap-4">
          <ProgressBar value={data ? data.streamBytes / limitBytes : 0} className="flex-1" />
          <span className="w-36 shrink-0 text-end text-small tabular-nums text-fg-dim">{data ? `${formatBytes(data.streamBytes)} / ${formatBytes(limitBytes)}` : ''}</span>
        </div>
      </Row>
      <Row title={t('settings.imageCache')}>
        <span className="text-small tabular-nums text-fg-dim">{data ? formatBytes(data.imageBytes) : ''}</span>
      </Row>
      <Row title={t('settings.cacheLimit')}>
        <Select label={t('settings.cacheLimit')} value={String(data?.limitMb ?? 512)} options={options} onChange={(v) => limit.mutate(Number(v))} />
      </Row>
      <Row title={t('settings.clearCache')}>
        <Button size="sm" variant="danger" icon={<Trash2 size={15} />} onClick={() => clear.mutate()}>{t('settings.clearCache')}</Button>
      </Row>
    </Section>
  );
}
