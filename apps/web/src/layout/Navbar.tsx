import { m } from 'framer-motion';
import { Search, Settings, UserRoundCog, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { MenuItem, Popover } from '../components/ui/Popover';
import { ProfileAvatar } from '../components/profiles/ProfileAvatar';
import { press, spring } from '../design/motion';
import { useLiquidGlass } from '../lib/glass';
import { useScrollState } from '../lib/hooks';
import { LiquidLens } from './LiquidLens';
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
  const { down, top } = useScrollState();
  const { data } = useProfiles();
  const { profileId, choose } = useProfile();
  const profiles = data?.profiles ?? [];
  const current = profiles.find((p) => p.id === profileId) ?? profiles[0];
  const capsule = useLiquidGlass<HTMLElement>();
  const searchGlass = useLiquidGlass<HTMLAnchorElement>();

  return (
    <m.header
      className="pointer-events-none fixed inset-x-0 top-0 z-[var(--z-nav)] pt-[env(safe-area-inset-top)]"
      initial={false}
      animate={{ y: down ? '-110%' : '0%' }}
      transition={spring.soft}
    >
      {/* A soft fade behind the bar instead of a hard edge, stronger once the page scrolls. */}
      <div
        className="absolute inset-x-0 top-0 h-[calc(var(--nav-h)+2.5rem)] bg-gradient-to-b from-bg/90 via-bg/45 to-transparent transition-opacity duration-500"
        style={{ opacity: top ? 0.55 : 1 }}
      />
      <div className="page-x relative flex h-[var(--nav-h)] items-center gap-6">
        <div className="pointer-events-auto">
          <Wordmark />
        </div>
        <nav
          ref={capsule}
          aria-label={t('nav.menu')}
          className="glass pointer-events-auto absolute start-1/2 hidden -translate-x-1/2 items-center gap-0.5 rounded-full p-1 md:flex rtl:translate-x-1/2"
        >
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className="relative rounded-full px-4 py-1.5 text-body font-semibold"
            >
              {({ isActive }) => (
                <>
                  {isActive && <LiquidLens layoutId="nav-lens" pulse={item.to} />}
                  <span
                    className={cn(
                      'relative transition-colors duration-200',
                      isActive ? 'text-fg' : 'text-fg-dim hover:text-fg',
                    )}
                  >
                    {t(`nav.${item.key}`)}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="pointer-events-auto ms-auto flex items-center gap-2">
          <m.div whileTap={press} whileHover={{ scale: 1.06 }} transition={spring.liquid}>
            <Link
              ref={searchGlass}
              to="/search"
              state={{ from: location.pathname }}
              aria-label={t('search.open')}
              className="glass hidden size-10 place-items-center rounded-full text-fg md:grid"
            >
              <Search size={18} strokeWidth={2.2} />
            </Link>
          </m.div>
          {current && (
            <Popover
              trigger={({ open, toggle }) => (
                <m.button
                  type="button"
                  onClick={toggle}
                  aria-label={t('nav.profiles')}
                  aria-expanded={open}
                  whileTap={press}
                  whileHover={{ scale: 1.06 }}
                  transition={spring.liquid}
                  className="ms-1 flex items-center rounded-full outline-offset-4"
                >
                  <ProfileAvatar profile={current} className="size-9 rounded-full" />
                </m.button>
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
    </m.header>
  );
}
