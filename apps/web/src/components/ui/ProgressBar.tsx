import { motion } from 'framer-motion';
import { t } from '../../design/motion';
import { cn } from '../../lib/cn';

/** Fills with scaleX so it animates on the compositor. Fills from the reading-direction start. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className={cn('h-1 overflow-hidden rounded-full bg-white/20', className)} role="progressbar" aria-valuenow={Math.round(clamped * 100)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className="h-full origin-[var(--origin,left)] rounded-full bg-accent [[dir=rtl]_&]:origin-right"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: clamped }}
        transition={{ ...t.slow, delay: 0.1 }}
      />
    </div>
  );
}
