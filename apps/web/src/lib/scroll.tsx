import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const KEY = 'marquee.scroll';

function read(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** Remembers scroll per history entry: back returns to where you were, forward navigation starts at the top. */
export function ScrollRestoration() {
  const location = useLocation();
  const type = useNavigationType();
  const modal = Boolean((location.state as { background?: unknown } | null)?.background);

  useEffect(() => {
    if (modal) return;
    const saved = read()[location.key];
    window.scrollTo(0, type === 'POP' && saved ? saved : 0);
    // Content may still be loading on a back navigation; try once more after it renders.
    if (type === 'POP' && saved) {
      const id = setTimeout(() => window.scrollTo(0, saved), 250);
      return () => clearTimeout(id);
    }
  }, [location.key, location.pathname, modal, type]);

  useEffect(() => {
    let frame = 0;
    const save = () => {
      if (modal) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const all = read();
        all[location.key] = window.scrollY;
        sessionStorage.setItem(KEY, JSON.stringify(all));
      });
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [location.key, modal]);

  return null;
}
