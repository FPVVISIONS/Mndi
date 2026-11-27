import type { FileVersion } from '@marquee/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { VersionPicker } from '../../components/media/VersionPicker';
import { api } from '../../lib/api';
import { invalidateLibrary } from '../../queries/hooks';

export interface VersionTarget {
  scope: 'title' | 'episode';
  refId: number;
  title: string;
  subtitle?: string | null;
}

/** Loads the releases for a movie or episode and, once one is picked, remembers it and starts playback. */
export function VersionHost({
  target,
  onClose,
  onPlayed,
}: {
  target: VersionTarget | null;
  onClose: () => void;
  onPlayed?: (fileId: number) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['versions', target?.scope, target?.refId],
    queryFn: () =>
      target!.scope === 'title'
        ? api.titleVersions(target!.refId)
        : api.episodeVersions(target!.refId),
    enabled: Boolean(target),
    staleTime: 0,
  });

  const play = async (v: FileVersion) => {
    if (!target) return;
    await api.chooseVersion(target.scope, target.refId, v.id).catch(() => undefined);
    invalidateLibrary(qc, [['episodes'], ['versions']]);
    onClose();
    if (onPlayed) onPlayed(v.id);
    else navigate(`/watch/${v.id}`);
  };

  return (
    <VersionPicker
      open={Boolean(target)}
      onClose={onClose}
      title={target?.title ?? ''}
      subtitle={target?.subtitle}
      versions={data?.versions}
      onPlay={(v) => void play(v)}
    />
  );
}
