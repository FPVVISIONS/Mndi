import type { Transition, Variants } from 'framer-motion';

/**
 * The single source of truth for motion. Every animation in the app reads from here,
 * so durations, curves and springs stay related. CSS variables are mirrored at startup.
 */
export const duration = {
  instant: 0.08,
  fast: 0.16,
  base: 0.26,
  slow: 0.44,
  hero: 0.8,
} as const;

export const ease = {
  /** Fast start, soft landing. Default for things entering. */
  out: [0.22, 1, 0.36, 1],
  /** Symmetrical, for things that move between two resting places. */
  inOut: [0.65, 0, 0.35, 1],
  /** For things leaving. */
  in: [0.5, 0, 0.9, 0.4],
} as const;

export const spring = {
  /** Small controls, pills, toggles. */
  snappy: { type: 'spring', stiffness: 480, damping: 30, mass: 0.7 },
  /** Cards, panels. */
  soft: { type: 'spring', stiffness: 260, damping: 24, mass: 0.9 },
  /** Modals and shared-element morphs. */
  modal: { type: 'spring', stiffness: 300, damping: 28, mass: 1 },
  /** Liquid glass: a little overshoot, so the drop wobbles into place. */
  liquid: { type: 'spring', stiffness: 380, damping: 20, mass: 0.9 },
} as const satisfies Record<string, Transition>;

export const stagger = {
  row: 0.05,
  list: 0.045,
  hero: 0.1,
  actions: 0.04,
} as const;

export const t = {
  fast: { duration: duration.fast, ease: ease.out },
  base: { duration: duration.base, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.out },
  fade: { duration: duration.base, ease: ease.inOut },
} as const satisfies Record<string, Transition>;

/** Shared entrance variants. Opacity and transform only. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { ...spring.soft, opacity: t.base } },
};

/** Text that comes into focus as it rises: used for headlines over artwork. */
export const blurUp: Variants = {
  hidden: { opacity: 0, y: 26, filter: 'blur(12px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { ...spring.soft, opacity: t.slow, filter: t.slow },
  },
};

/** Cards and tiles pop in with a slight scale. */
export const popIn: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.94 },
  show: { opacity: 1, y: 0, scale: 1, transition: { ...spring.soft, opacity: t.base } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: t.fade },
};

export const staggerChildren = (gap: number = stagger.list, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

export const press = { scale: 0.95 } as const;

/** Liquid press: the glass squashes like a drop under the finger. */
export const squish = { scaleX: 1.07, scaleY: 0.9 } as const;

/** Mirror tokens into CSS so plain CSS transitions use the same curves. */
export function applyMotionVars(root: HTMLElement = document.documentElement): void {
  const bez = (c: readonly number[]) => `cubic-bezier(${c.join(',')})`;
  root.style.setProperty('--ease-out', bez(ease.out));
  root.style.setProperty('--ease-inout', bez(ease.inOut));
  root.style.setProperty('--ease-in', bez(ease.in));
  for (const [k, v] of Object.entries(duration))
    root.style.setProperty(`--dur-${k}`, `${v * 1000}ms`);
}
