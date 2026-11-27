import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { invalidateLibrary, useStatus } from '../queries/hooks';
import { useToasts } from '../stores/toasts';
import { Button } from './ui/Button';

/** Paste a TMDB key inside the app. It is checked with TMDB before it is saved. */
export function TmdbKeyForm({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const { data: status } = useStatus();
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const save = useMutation({
    mutationFn: () => api.setTmdbKey(value.trim()),
    onSuccess: () => {
      setValue('');
      setError(false);
      push(t('settings.tmdbSaved'));
      invalidateLibrary(qc);
    },
    onError: (err) => setError(err instanceof ApiError && err.status === 422),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim().length >= 16) save.mutate();
      }}
      className={compact ? 'space-y-2' : 'space-y-3'}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative block flex-1">
          <KeyRound
            size={16}
            className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-fg-faint"
          />
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            placeholder={
              status?.tmdb
                ? `${t('settings.tmdbConnected')} ••••••••`
                : t('settings.tmdbKeyPlaceholder')
            }
            aria-label={t('settings.tmdbKey')}
            autoComplete="off"
            spellCheck={false}
            className="h-11 w-full rounded-md border border-line bg-surface-2 ps-10 pe-4 outline-none transition-colors focus:border-fg-dim"
          />
        </label>
        <Button
          type="submit"
          variant={status?.tmdb ? 'secondary' : 'primary'}
          disabled={value.trim().length < 16 || save.isPending}
          icon={status?.tmdb && !value ? <Check size={16} /> : undefined}
        >
          {t('common.save')}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-small text-accent">
          {t('settings.tmdbInvalid')}
        </p>
      )}
    </form>
  );
}
