import type { Profile } from '@marquee/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useProfile } from '../../stores/profile';
import { useToasts } from '../../stores/toasts';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { AVATARS, PROFILE_COLORS, ProfileAvatar } from './ProfileAvatar';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Null to create a new profile. */
  profile: Profile | null;
  canDelete: boolean;
}

export function ProfileEditor({ open, onClose, profile, canDelete }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROFILE_COLORS[0]!);
  const [avatar, setAvatar] = useState('clapperboard');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(profile?.name ?? '');
    setColor(profile?.color ?? PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)]!);
    setAvatar(profile?.avatar ?? Object.keys(AVATARS)[Math.floor(Math.random() * Object.keys(AVATARS).length)]!);
    setConfirmDelete(false);
  }, [open, profile]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), color, avatar };
      return profile ? api.updateProfile(profile.id, body) : api.createProfile(body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      push(t('profiles.saved'));
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteProfile(profile!.id),
    onSuccess: () => {
      if (useProfile.getState().profileId === profile!.id) useProfile.getState().forget();
      void qc.invalidateQueries({ queryKey: ['profiles'] });
      onClose();
    },
  });

  const valid = name.trim().length > 0;

  return (
    <Modal open={open} onClose={onClose} title={profile ? t('profiles.editTitle') : t('profiles.createTitle')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <div className="flex items-center gap-5">
          <ProfileAvatar profile={{ color, avatar, name }} className="size-24 shrink-0 rounded-lg" iconSize={44} />
          <label className="block flex-1">
            <span className="eyebrow">{t('profiles.namePlaceholder')}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              placeholder={t('profiles.newName')}
              className="mt-2 h-12 w-full rounded-md border border-line bg-surface-2 px-4 text-lead outline-none transition-colors focus:border-fg-dim"
            />
          </label>
        </div>

        <fieldset className="mt-6">
          <legend className="eyebrow mb-3">{t('profiles.color')}</legend>
          <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={t('profiles.color')}>
            {PROFILE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={c}
                onClick={() => setColor(c)}
                className={cn('grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-surface-1 transition-shadow', c === color && 'ring-2 ring-fg')}
                style={{ backgroundColor: c }}
              >
                {c === color && <Check size={16} className="text-bg" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="eyebrow mb-3">{t('profiles.icon')}</legend>
          <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label={t('profiles.icon')}>
            {Object.entries(AVATARS).map(([key, Icon]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={key === avatar}
                aria-label={key}
                onClick={() => setAvatar(key)}
                className={cn('grid h-12 place-items-center rounded-md border transition-colors', key === avatar ? 'border-fg bg-surface-3 text-fg' : 'border-line text-fg-dim hover:border-line-strong hover:text-fg')}
              >
                <Icon size={20} />
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-7 flex items-center justify-between gap-3">
          {profile && canDelete ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="max-w-48 text-small text-fg-dim">{t('profiles.deleteConfirm', { name: profile.name })}</span>
                <Button variant="danger" size="sm" onClick={() => remove.mutate()}>{t('common.delete')}</Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>{t('profiles.delete')}</Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" disabled={!valid || save.isPending}>{t('common.save')}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
