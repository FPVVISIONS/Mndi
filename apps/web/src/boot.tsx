import { QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import type { HomePayload } from '@marquee/shared';
import App from './App';
import { applyMotionVars } from './design/motion';
import { initI18n } from './i18n';
import { queryClient } from './queries/client';
import { api } from './lib/api';
import { usePrefs } from './stores/prefs';
import { useProfile } from './stores/profile';
import './styles/index.css';

applyMotionVars();

declare global {
  interface Window {
    __early?: { lang: string; profile: number | null; home: Promise<HomePayload | null> };
  }
}

const loadFeatures = () => import('./design/features').then((mod) => mod.default);

/** Start the first requests now, in parallel with loading the app code, instead of after it renders. */
function prefetch(): void {
  void queryClient.prefetchQuery({ queryKey: ['status'], queryFn: api.status });
  void queryClient
    .fetchQuery({ queryKey: ['profiles'], queryFn: api.profiles, staleTime: 5 * 60_000 })
    .then(({ profiles }) => {
      const store = useProfile.getState();
      let id = profiles.some((p) => p.id === store.profileId) ? store.profileId : null;
      if (profiles.length === 1) {
        id = profiles[0]!.id;
        store.choose(id);
      }
      if (id) {
        const lang = usePrefs.getState().language;
        const early = window.__early;
        // Reuse the response the inline script already started, when it was for this language and profile.
        const reuse =
          early && early.lang === lang && (early.profile === null || early.profile === id);
        void queryClient.prefetchQuery({
          queryKey: ['home', lang, id],
          queryFn: async () => (reuse ? await early.home : null) ?? api.home(),
        });
      }
    })
    .catch(() => undefined);
}
prefetch();

// Strings load before first render, so nothing ever paints untranslated.
void initI18n(usePrefs.getState().language).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <LazyMotion features={loadFeatures} strict>
          <MotionConfig reducedMotion="user">
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </MotionConfig>
        </LazyMotion>
      </QueryClientProvider>
    </StrictMode>,
  );
});
