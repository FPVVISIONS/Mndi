import { motion } from 'framer-motion';
import { Clapperboard, Home, Radio, Search, Tv } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { spring } from '../design/motion';
import { cn } from '../lib/cn';

const TABS = [
  { to: '/', key: 'home', icon: Home, end: true },
  { to: '/movies', key: 'movies', icon: Clapperboard },
  { to: '/series', key: 'series', icon: Tv },
  { to: '/live', key: 'live', icon: Radio },
  { to: '/search', key: 'search', icon: Search },
] as const;

/** Thumb-reach navigation for phones and small tablets. */
export function BottomTabs() {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('nav.menu')}
      className="fixed inset-x-0 bottom-0 z-[var(--z-nav)] border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="grid h-[var(--tab-h)] grid-cols-5">
        {TABS.map(({ to, key, icon: Icon, ...rest }) => (
          <li key={to}>
            <NavLink to={to} end={'end' in rest} className="relative grid h-full place-items-center">
              {({ isActive }) => (
                <span className={cn('flex flex-col items-center gap-1 text-caption font-medium transition-colors', isActive ? 'text-fg' : 'text-fg-faint')}>
                  {isActive && <motion.span layoutId="tab-dot" transition={spring.snappy} className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
                  <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
                  {t(`nav.${key}`)}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
