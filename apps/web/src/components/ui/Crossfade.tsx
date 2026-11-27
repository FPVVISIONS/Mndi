import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { duration, ease } from '../../design/motion';

interface Props {
  /** Changes when the content should fade, for example the text itself. */
  k: string | number;
  children: ReactNode;
  className?: string;
}

/** Fades old content out and new content in. Used wherever text swaps on a language change. */
export function Crossfade({ k, children, className }: Props) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={k}
        className={className}
        style={{ display: 'block' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: duration.slow, ease: ease.out } }}
        exit={{ opacity: 0, transition: { duration: duration.fast } }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
