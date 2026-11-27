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
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },
  /** Cards, panels. */
  soft: { type: 'spring', stiffness: 300, damping: 30, mass: 0.9 },
  /** Modals and shared-element morphs. */
  modal: { type: 'spring', stiffness: 340, damping: 36, mass: 1 },
} as const satisfies Record<string, Transition>;

export const stagger = {
  row: 0.045,
  list: 0.03,
  hero: 0.09,
  actions: 0.035,
} as const;

export const t = {
  fast: { duration: duration.fast, ease: ease.out },
  base: { duration: duration.base, ease: ease.out },
  slow: { duration: duration.slow, ease: ease.out },
  fade: { duration: duration.base, ease: ease.inOut },
} as const satisfies Record<string, Transition>;

/** Shared entrance variants. Opacity and transform only. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: t.base },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: t.fade },
};

export const staggerChildren = (gap: number = stagger.list, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

export const press = { scale: 0.96 } as const;

/** Mirror tokens into CSS so plain CSS transitions use the same curves. */
export function applyMotionVars(root: HTMLElement = document.documentElement): void {
  const bez = (c: readonly number[]) => `cubic-bezier(${c.join(',')})`;
  root.style.setProperty('--ease-out', bez(ease.out));
  root.style.setProperty('--ease-inout', bez(ease.inOut));
  root.style.setProperty('--ease-in', bez(ease.in));
  for (const [k, v] of Object.entries(duration))
    root.style.setProperty(`--dur-${k}`, `${v * 1000}ms`);
}
