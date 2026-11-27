import type { Profile } from '@marquee/shared';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileAvatar } from '../../components/profiles/ProfileAvatar';
import { ProfileEditor } from '../../components/profiles/ProfileEditor';
import { Button } from '../../components/ui/Button';
import { useProfiles } from '../../queries/hooks';
import { useProfile } from '../../stores/profile';
import { useToasts } from '../../stores/toasts';
import { Section } from './parts';

export function ProfilesTab() {
  const { t } = useTranslation();
  const { data } = useProfiles();
  const current = useProfile((s) => s.profileId);
  const push = useToasts((s) => s.push);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);
  const profiles = data?.profiles ?? [];

  const edit = (p: Profile | null) => {
    if (!p && profiles.length >= 6) return push(t('profiles.maxReached'), 'error');
    setEditing(p);
    setOpen(true);
  };

  return (
    <>
      <Section hint={t('settings.profilesHint')}>
        {profiles.map((p) => (
          <div key={p.id} className="flex items-center gap-4 p-4 sm:px-5">
            <ProfileAvatar profile={p} className="size-11" iconSize={22} />
            <span className="flex-1 truncate font-semibold">{p.name}{p.id === current && <span className="ms-3 size-1.5 inline-block rounded-full bg-accent align-middle" aria-hidden />}</span>
            <Button size="sm" variant="secondary" icon={<Pencil size={14} />} onClick={() => edit(p)} aria-label={t('profiles.edit', { name: p.name })}>{t('common.edit')}</Button>
          </div>
        ))}
        <div className="p-4 sm:px-5">
          <Button size="sm" variant="ghost" icon={<Plus size={15} />} onClick={() => edit(null)}>{t('profiles.create')}</Button>
        </div>
      </Section>
      <ProfileEditor open={open} onClose={() => setOpen(false)} profile={editing} canDelete={profiles.length > 1} />
    </>
  );
}
