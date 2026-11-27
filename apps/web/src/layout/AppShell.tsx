import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { t as tokens } from '../design/motion';
import { BottomTabs } from './BottomTabs';
import { Navbar } from './Navbar';
import { StatusBanner } from './StatusBanner';

function SkipLabel() {
  return <>{useTranslation().t('nav.skip')}</>;
}

/** Enter-only page transition: the page never waits for an exit animation. */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <motion.div key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={tokens.base}>
      {children}
    </motion.div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-fg focus:px-4 focus:py-2 focus:text-bg">
        <SkipLabel />
      </a>
      <Navbar />
      <StatusBanner />
      <main id="main" className="min-h-dvh pb-[calc(var(--tab-h)+2rem)] md:pb-16">
        <PageTransition>{children}</PageTransition>
      </main>
      <BottomTabs />
    </>
  );
}
