import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArtImage } from '../../components/media/ArtImage';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { api } from '../../lib/api';
import { useDebounced } from '../../lib/hooks';
import { invalidateLibrary } from '../../queries/hooks';
import { useToasts } from '../../stores/toasts';

interface Props {
  open: boolean;
  onClose: () => void;
  titleId: number;
  fileName: string;
  matched: boolean;
}

/** Pick the right TMDB entry by hand when automatic matching got it wrong. */
export function MatchModal({ open, onClose, titleId, fileName, matched }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const push = useToasts((s) => s.push);
  const [q, setQ] = useState(fileName);
  const debounced = useDebounced(q, 300);
  useEffect(() => {
    if (open) setQ(fileName);
  }, [open, fileName]);

  const { data, isFetching } = useQuery({
    queryKey: ['matches', titleId, debounced],
    queryFn: () => api.matches(titleId, debounced),
    enabled: open && debounced.trim().length > 0,
  });

  const apply = useMutation({
    mutationFn: (tmdbId: number | null) => api.setMatch(titleId, tmdbId),
    onSuccess: (res) => {
      invalidateLibrary(qc);
      push(t('detail.matchSaved'));
      onClose();
      if (res.id !== titleId) navigate(`/title/${res.id}`, { replace: true });
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={t('detail.matchTitle')} className="max-w-xl">
      <p className="-mt-2 mb-4 text-small text-fg-dim">{t('detail.matchHint')}</p>
      <label className="relative block">
        <Search
          size={17}
          className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-fg-faint"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('detail.matchSearch')}
          aria-label={t('detail.matchSearch')}
          className="h-11 w-full rounded-md border border-line bg-surface-2 ps-11 pe-4 outline-none transition-colors focus:border-fg-dim"
        />
      </label>
      <ul className="mt-4 max-h-[22rem] space-y-1.5 overflow-y-auto pe-1">
        {isFetching &&
          !data &&
          Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        {data?.matches.map((m) => (
          <li key={m.tmdbId}>
            <button
              type="button"
              onClick={() => apply.mutate(m.tmdbId)}
              className="flex w-full gap-3 rounded-lg border border-transparent p-2 text-start transition-colors hover:border-line-strong hover:bg-surface-2"
            >
              <ArtImage
                image={m.poster}
                size="w154"
                className="aspect-[2/3] w-14 shrink-0 rounded-sm"
              />
              <span className="min-w-0">
                <span className="block font-semibold">
                  {m.title}
                  {m.year ? <span className="ms-2 font-normal text-fg-dim">{m.year}</span> : null}
                </span>
                <span className="mt-1 line-clamp-2 text-small text-fg-dim">{m.overview}</span>
              </span>
            </button>
          </li>
        ))}
        {data && data.matches.length === 0 && (
          <li className="py-8 text-center text-fg-dim">{t('detail.noMatches')}</li>
        )}
      </ul>
      {matched && (
        <div className="mt-4 border-t border-line pt-4">
          <Button variant="ghost" size="sm" onClick={() => apply.mutate(null)}>
            {t('detail.unlink')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
