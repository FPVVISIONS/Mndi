import type { Profile } from '@marquee/shared';
import { m } from 'framer-motion';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ProfileAvatar } from '../components/profiles/ProfileAvatar';
import { ProfileEditor } from '../components/profiles/ProfileEditor';
import { Button } from '../components/ui/Button';
import { Crossfade } from '../components/ui/Crossfade';
import { fadeUp, spring, staggerChildren, stagger } from '../design/motion';
import { useProfiles } from '../queries/hooks';
import { useProfile } from '../stores/profile';
import { useToasts } from '../stores/toasts';

const MAX_PROFILES = 6;

/** "Who's watching?": pick a profile, or switch to manage mode to edit, add or remove them. */
export default function ProfilePicker() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [params] = useSearchParams();
  const { data } = useProfiles();
  const choose = useProfile((s) => s.choose);
  const push = useToasts((s) => s.push);
  const [managing, setManaging] = useState(params.get('manage') === '1');
  const [editing, setEditing] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);
  const profiles = data?.profiles ?? [];

  const pick = (p: Profile) => {
    if (managing) {
      setEditing(p);
      setOpen(true);
      return;
    }
    choose(p.id);
    navigate(from && from !== '/profiles' ? from : '/', { replace: true });
  };

  const add = () => {
    if (profiles.length >= MAX_PROFILES) return push(t('profiles.maxReached'), 'error');
    setEditing(null);
    setOpen(true);
  };

  return (
    <main className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-4xl text-center">
        <m.h1
          variants={fadeUp}
          initial="hidden"
          animate="show"
          className="font-display text-title-l sm:text-display-s"
        >
          <Crossfade k={managing ? 'm' : 'w'}>
            {managing ? t('profiles.manage') : t('profiles.who')}
          </Crossfade>
        </m.h1>
        {managing && <p className="mt-3 text-fg-dim">{t('profiles.manageHint')}</p>}

        <m.ul
          variants={staggerChildren(stagger.hero, 0.1)}
          initial="hidden"
          animate="show"
          className="mt-12 flex flex-wrap items-start justify-center gap-x-6 gap-y-10 sm:gap-x-10"
        >
          {profiles.map((p) => (
            <m.li key={p.id} variants={fadeUp} layout transition={spring.soft}>
              <button
                type="button"
                onClick={() => pick(p)}
                aria-label={managing ? t('profiles.edit', { name: p.name }) : p.name}
                className="group flex w-28 flex-col items-center gap-3 sm:w-36"
              >
                <span className="relative block">
                  <m.span
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.97 }}
                    transition={spring.soft}
                    className="relative block overflow-hidden rounded-lg ring-2 ring-transparent transition-shadow group-hover:ring-fg group-focus-visible:ring-fg"
                  >
                    <ProfileAvatar
                      profile={p}
                      className="size-28 rounded-lg sm:size-36"
                      iconSize={56}
                    />
                    {managing && (
                      <span className="absolute inset-0 grid place-items-center bg-black/55">
                        <Pencil size={32} />
                      </span>
                    )}
                  </m.span>
                </span>
                <span className="max-w-full truncate text-lead text-fg-dim transition-colors group-hover:text-fg group-focus-visible:text-fg">
                  {p.name}
                </span>
              </button>
            </m.li>
          ))}
          {(managing || profiles.length === 0) && profiles.length < MAX_PROFILES && (
            <m.li variants={fadeUp} layout transition={spring.soft}>
              <button
                type="button"
                onClick={add}
                className="group flex w-28 flex-col items-center gap-3 sm:w-36"
                aria-label={t('profiles.create')}
              >
                <m.span
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.97 }}
                  transition={spring.soft}
                  className="grid size-28 place-items-center rounded-lg border-2 border-dashed border-line-strong text-fg-dim group-hover:border-fg group-hover:text-fg sm:size-36"
                >
                  <Plus size={48} strokeWidth={1.5} />
                </m.span>
                <span className="text-lead text-fg-dim group-hover:text-fg">
                  {t('profiles.create')}
                </span>
              </button>
            </m.li>
          )}
        </m.ul>

        <div className="mt-14">
          <Button
            variant={managing ? 'primary' : 'secondary'}
            size="lg"
            onClick={() => setManaging((m) => !m)}
          >
            {managing ? t('profiles.done') : t('profiles.manage')}
          </Button>
        </div>
      </div>
      <ProfileEditor
        open={open}
        onClose={() => setOpen(false)}
        profile={editing}
        canDelete={profiles.length > 1}
      />
    </main>
  );
}
