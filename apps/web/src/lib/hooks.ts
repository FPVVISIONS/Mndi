import { useEffect, useRef, useState } from 'react';

/** True on devices with a real pointer. Touch screens skip hover-only UI. */
export function useCanHover(): boolean {
  const [can, setCan] = useState(
    () => window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const on = () => setCan(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return can;
}

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Becomes true once the element has been near the viewport. */
export function useSeen<T extends Element>(margin = '200px'): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen];
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useIsRtl(): boolean {
  return document.documentElement.dir === 'rtl';
}

export function languageName(code: string, uiLang: string): string {
  try {
    return new Intl.DisplayNames([uiLang], { type: 'language' }).of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/**
 * Scroll state for bars that tuck away: `down` turns true after scrolling down a little and false
 * as soon as the person scrolls back up; `top` is true near the top of the page.
 */
export function useScrollState(threshold = 8): { down: boolean; top: boolean } {
  const [state, setState] = useState({ down: false, top: true });
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = window.scrollY;
      const top = y < 24;
      const delta = y - last;
      if (Math.abs(delta) < threshold && !top) return;
      last = y;
      const down = !top && delta > 0;
      setState((s) => (s.down === down && s.top === top ? s : { down, top }));
    };
    const on = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => {
      window.removeEventListener('scroll', on);
      cancelAnimationFrame(frame);
    };
  }, [threshold]);
  return state;
}
