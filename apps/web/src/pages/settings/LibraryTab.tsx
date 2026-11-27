import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChatPicker, tagsFromChats, type Tags } from '../../components/ChatPicker';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { api } from '../../lib/api';
import { invalidateLibrary, useStatus } from '../../queries/hooks';
import { useToasts } from '../../stores/toasts';
import { Row, Section } from './parts';

export function LibraryTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const push = useToasts((s) => s.push);
  const { data: status } = useStatus();
  const { data: sources } = useQuery({ queryKey: ['sources'], queryFn: api.sources });
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tags, setTags] = useState<Tags>({});
  const ready = status?.telegram.state === 'ready';
  const chats = useQuery({ queryKey: ['chats'], queryFn: api.chats, enabled: editing && ready });

  useEffect(() => {
    if (chats.data) setTags(tagsFromChats(chats.data.chats));
  }, [chats.data]);

  const save = useMutation({
    mutationFn: () =>
      api.saveSources(
        (chats.data?.chats ?? []).flatMap((c) => {
          const kind = tags[c.id];
          return kind && kind !== 'skip' ? [{ chatId: c.id, title: c.title, kind }] : [];
        }),
      ),
    onSuccess: () => {
      setEditing(false);
      push(t('toast.scanStarted'));
      void qc.invalidateQueries({ queryKey: ['sources'] });
      invalidateLibrary(qc);
    },
  });

  const rescan = useMutation({
    mutationFn: () => api.scan(true),
    onSuccess: () => { push(t('toast.scanStarted')); void qc.invalidateQueries({ queryKey: ['status'] }); },
  });

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => { setConfirm(false); void qc.invalidateQueries({ queryKey: ['status'] }); navigate('/welcome'); },
  });

  const kindLabel = { movies: t('settings.kindMovies'), series: t('settings.kindSeries'), live: t('settings.kindLive') };
  const idx = status?.index;

  return (
    <>
      <Section title={t('settings.sources')} hint={t('settings.sourcesHint')}>
        {!sources ? (
          <div className="p-4"><Skeleton className="h-12" /></div>
        ) : (
          sources.sources.map((s) => (
            <div key={s.chatId} className="flex items-center justify-between gap-4 p-4 sm:px-5">
              <span className="truncate font-semibold">{s.title}</span>
              <span className="shrink-0 rounded-full bg-surface-3 px-3 py-1 text-caption font-semibold text-fg-dim">{kindLabel[s.kind]}</span>
            </div>
          ))
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
          <span className="text-small text-fg-dim">{idx && t('settings.counts', { items: idx.items, titles: idx.titles, channels: idx.channels })}</span>
          <Button size="sm" variant="secondary" icon={<SlidersHorizontal size={15} />} disabled={!ready} onClick={() => setEditing(true)}>{t('settings.editSources')}</Button>
        </div>
      </Section>

      <Section>
        <Row title={t('settings.rescan')} hint={idx?.scanning ? t('settings.scanning', { count: idx.scanned }) : t('settings.rescanHint')}>
          <Button size="sm" variant="secondary" disabled={!ready || idx?.scanning} icon={<RefreshCw size={15} className={idx?.scanning ? 'animate-spin' : ''} />} onClick={() => rescan.mutate()}>
            {t('settings.rescan')}
          </Button>
        </Row>
        <Row title={t('settings.disconnect')} hint={t('settings.disconnectHint')}>
          <Button size="sm" variant="danger" icon={<LogOut size={15} />} onClick={() => setConfirm(true)}>{t('settings.disconnect')}</Button>
        </Row>
      </Section>

      <Modal open={editing} onClose={() => setEditing(false)} title={t('settings.editSources')} className="max-w-2xl">
        {chats.isPending ? <Skeleton className="h-40" /> : <ChatPicker chats={chats.data?.chats ?? []} tags={tags} onChange={setTags} />}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>{t('common.save')}</Button>
        </div>
      </Modal>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={t('settings.disconnect')}>
        <p className="-mt-2 text-fg-dim">{t('settings.disconnectHint')}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => logout.mutate()}>{t('settings.disconnectConfirm')}</Button>
        </div>
      </Modal>
    </>
  );
}
