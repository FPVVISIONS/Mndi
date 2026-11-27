import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { applyMotionVars } from './design/motion';
import { initI18n } from './i18n';
import { queryClient } from './queries/client';
import { usePrefs } from './stores/prefs';
import './styles/index.css';

applyMotionVars();

// Strings load before first render, so nothing ever paints untranslated.
void initI18n(usePrefs.getState().language).then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </MotionConfig>
      </QueryClientProvider>
    </StrictMode>,
  );
});
