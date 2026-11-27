import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Button } from './components/ui/Button';
import { EmptyState } from './components/ui/EmptyState';
import { Spinner } from './components/ui/Spinner';
import { Toaster } from './components/ui/Toaster';
import { AppShell } from './layout/AppShell';
import { Wordmark } from './layout/Wordmark';
import { ScrollRestoration } from './lib/scroll';
import { useProfiles, useStatus } from './queries/hooks';
import { useProfile } from './stores/profile';

const Home = lazy(() => import('./pages/Home'));
const Browse = lazy(() => import('./pages/Browse'));
const Live = lazy(() => import('./pages/Live'));
const Search = lazy(() => import('./pages/Search'));
const MyList = lazy(() => import('./pages/MyList'));
const Settings = lazy(() => import('./pages/Settings'));
const TitleDetail = lazy(() => import('./pages/TitleDetail'));
const ProfilePicker = lazy(() => import('./pages/ProfilePicker'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Watch = {
  File: lazy(() => import('./pages/Watch').then((m) => ({ default: m.WatchFile }))),
  Title: lazy(() => import('./pages/Watch').then((m) => ({ default: m.WatchTitle }))),
  Live: lazy(() => import('./pages/Watch').then((m) => ({ default: m.WatchLive }))),
};

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="flex flex-col items-center gap-6">
        <Wordmark />
        <Spinner />
      </motion.div>
    </div>
  );
}

function Shell() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}

function Offline() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh place-items-center">
      <EmptyState icon={<WifiOff size={26} />} title={t('error.offlineTitle')} body={t('error.offlineBody')} action={<Button variant="primary" onClick={() => location.reload()}>{t('common.retry')}</Button>} />
    </div>
  );
}

function NotFound() {
  const { t } = useTranslation();
  return <div className="pt-[var(--nav-h)]"><EmptyState icon={<WifiOff size={26} />} title={t('error.notFoundTitle')} body={t('error.notFoundBody')} action={<Button variant="primary" onClick={() => (location.href = '/')}>{t('nav.home')}</Button>} /></div>;
}

/** Decides what the person sees first: setup, who's watching, or the app. */
function useGate(): 'loading' | 'offline' | 'welcome' | 'profiles' | 'app' {
  const { data: status, isError } = useStatus();
  const { data: profiles } = useProfiles();
  const { profileId, confirmed, choose } = useProfile();
  const list = profiles?.profiles;
  const valid = Boolean(list?.some((p) => p.id === profileId));

  useEffect(() => {
    if (!list?.length) return;
    // One profile needs no question; an unknown stored profile falls back to the first.
    if (list.length === 1 && (!valid || !confirmed)) choose(list[0]!.id);
    else if (!valid && !confirmed) useProfile.setState({ profileId: list[0]!.id });
  }, [list, valid, confirmed, choose]);

  if (isError && !status) return 'offline';
  if (!status || !list) return 'loading';
  if (!status.onboarded) return 'welcome';
  if (list.length > 1 && !confirmed) return 'profiles';
  return valid || list.length === 1 ? 'app' : 'loading';
}

export default function App() {
  const location = useLocation();
  const gate = useGate();
  const background = (location.state as { background?: typeof location } | null)?.background;
  const path = location.pathname;

  if (gate === 'loading') return <Splash />;
  if (gate === 'offline') return <Offline />;
  if (gate === 'welcome' && path !== '/welcome') return <Navigate to="/welcome" replace />;
  if (gate === 'profiles' && path !== '/profiles') return <Navigate to="/profiles" replace state={{ from: path }} />;
  if (gate === 'app' && path === '/welcome') return <Navigate to="/" replace />;

  return (
    <>
      <ScrollRestoration />
      <Suspense fallback={<Splash />}>
        <Routes location={background ?? location}>
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/profiles" element={<ProfilePicker />} />
          <Route path="/watch/title/:titleId" element={<Watch.Title />} />
          <Route path="/watch/live/:channelId" element={<Watch.Live />} />
          <Route path="/watch/:fileId" element={<Watch.File />} />
          <Route element={<Shell />}>
            <Route path="/" element={<Home />} />
            <Route path="/movies" element={<Browse kind="movie" />} />
            <Route path="/series" element={<Browse kind="series" />} />
            <Route path="/live" element={<Live />} />
            <Route path="/search" element={<Search />} />
            <Route path="/list" element={<MyList />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/title/:id" element={<TitleDetail />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
        {background && (
          <Routes>
            <Route path="/title/:id" element={<TitleDetail />} />
          </Routes>
        )}
      </Suspense>
      <AnimatePresence>{null}</AnimatePresence>
      <Toaster />
    </>
  );
}
