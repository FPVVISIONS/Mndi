import { m } from 'framer-motion';
import { Search, Settings, UserRoundCog, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { MenuItem, Popover } from '../components/ui/Popover';
import { ProfileAvatar } from '../components/profiles/ProfileAvatar';
import { spring } from '../design/motion';
import { cn } from '../lib/cn';
import { useProfiles } from '../queries/hooks';
import { useProfile } from '../stores/profile';
import { Wordmark } from './Wordmark';

export const NAV_ITEMS = [
  { to: '/', key: 'home', end: true },
  { to: '/movies', key: 'movies' },
  { to: '/series', key: 'series' },
  { to: '/live', key: 'live' },
  { to: '/list', key: 'myList' },
] as const;

export function Navbar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [solid, setSolid] = useState(false);
  const { data } = useProfiles();
  const { profileId, choose } = useProfile();
  const profiles = data?.profiles ?? [];
  const current = profiles.find((p) => p.id === profileId) ?? profiles[0];

  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-[var(--z-nav)] h-[var(--nav-h)] transition-colors duration-300',
        solid
          ? 'bg-bg/92 shadow-[0_1px_0_var(--color-line)] backdrop-blur-md'
          : 'bg-gradient-to-b from-bg/85 to-transparent',
      )}
    >
      <div className="page-x flex h-full items-center gap-8">
        <Wordmark />
        <nav aria-label={t('nav.menu')} className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className="relative px-3 py-2 text-body font-medium"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'transition-colors duration-150',
                      isActive ? 'text-fg' : 'text-fg-dim hover:text-fg',
                    )}
                  >
                    {t(`nav.${item.key}`)}
                  </span>
                  {isActive && (
                    <m.span
                      layoutId="nav-underline"
                      transition={spring.snappy}
                      className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-accent"
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1.5">
          <Link
            to="/search"
            state={{ from: location.pathname }}
            aria-label={t('search.open')}
            className="grid size-10 place-items-center rounded-full text-fg-dim transition-colors hover:bg-white/10 hover:text-fg"
          >
            <Search size={20} />
          </Link>
          {current && (
            <Popover
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={t('nav.profiles')}
                  aria-expanded={open}
                  className="ms-1 flex items-center rounded-md outline-offset-4"
                >
                  <ProfileAvatar profile={current} className="size-8" />
                </button>
              )}
              panelClassName="w-60"
            >
              {(close) => (
                <>
                  <div className="space-y-0.5 pb-1.5">
                    {profiles
                      .filter((p) => p.id !== current.id)
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          aria-label={t('profiles.switchTo', { name: p.name })}
                          onClick={() => {
                            choose(p.id);
                            close();
                          }}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-body text-fg-dim transition-colors hover:bg-white/8 hover:text-fg"
                        >
                          <ProfileAvatar profile={p} className="size-7 rounded-sm" iconSize={15} />
                          <span className="truncate">{p.name}</span>
                        </button>
                      ))}
                  </div>
                  <div className="border-t border-line pt-1.5">
                    <MenuItem
                      icon={<UserRoundCog size={17} />}
                      onClick={() => {
                        close();
                        navigate('/profiles?manage=1');
                      }}
                    >
                      {t('profiles.manage')}
                    </MenuItem>
                    <MenuItem
                      icon={<Users size={17} />}
                      onClick={() => {
                        close();
                        navigate('/profiles');
                      }}
                    >
                      {t('nav.profiles')}
                    </MenuItem>
                    <MenuItem
                      icon={<Settings size={17} />}
                      onClick={() => {
                        close();
                        navigate('/settings');
                      }}
                    >
                      {t('nav.settings')}
                    </MenuItem>
                  </div>
                </>
              )}
            </Popover>
          )}
        </div>
      </div>
    </header>
  );
}
