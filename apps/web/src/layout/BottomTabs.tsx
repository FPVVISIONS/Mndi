import { m } from 'framer-motion';
import { Clapperboard, Home, Radio, Search, Tv } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { spring } from '../design/motion';
import { cn } from '../lib/cn';
import { useLiquidGlass } from '../lib/glass';
import { useScrollState } from '../lib/hooks';
import { LiquidLens } from './LiquidLens';

const TABS = [
  { to: '/', key: 'home', icon: Home, end: true },
  { to: '/movies', key: 'movies', icon: Clapperboard },
  { to: '/series', key: 'series', icon: Tv },
  { to: '/live', key: 'live', icon: Radio },
  { to: '/search', key: 'search', icon: Search },
] as const;

/**
 * Thumb-reach navigation for phones: a floating glass capsule. Scrolling down shrinks it to icons
 * only, scrolling up brings the labels back, and a liquid drop marks the current tab.
 */
export function BottomTabs() {
  const { t } = useTranslation();
  const { down } = useScrollState();
  const glass = useLiquidGlass<HTMLElement>();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-nav)] flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:hidden">
      <m.nav
        ref={glass}
        aria-label={t('nav.menu')}
        layout
        transition={spring.liquid}
        className="glass glass-strong pointer-events-auto rounded-full p-1"
        style={{ borderRadius: 999 }}
      >
        <ul className="flex items-center">
          {TABS.map(({ to, key, icon: Icon, ...rest }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={'end' in rest}
                aria-label={t(`nav.${key}`)}
                className="relative block rounded-full"
              >
                {({ isActive }) => (
                  <m.span
                    layout
                    transition={spring.liquid}
                    whileTap={{ scale: 0.88 }}
                    className={cn(
                      'relative flex flex-col items-center justify-center rounded-full transition-colors',
                      down ? 'h-11 w-12' : 'h-[3.25rem] w-[4.1rem] gap-0.5',
                      isActive ? 'text-fg' : 'text-fg-dim',
                    )}
                  >
                    {isActive && <LiquidLens layoutId="tab-lens" pulse={to} />}
                    <m.span layout="position" className="relative">
                      <Icon size={21} strokeWidth={isActive ? 2.3 : 1.9} />
                    </m.span>
                    {!down && (
                      <m.span
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="relative text-[0.6875rem] leading-none font-semibold"
                      >
                        {t(`nav.${key}`)}
                      </m.span>
                    )}
                  </m.span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </m.nav>
    </div>
  );
}
