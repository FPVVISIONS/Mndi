import { m } from 'framer-motion';
import { t } from '../../design/motion';
import { cn } from '../../lib/cn';

interface Props {
  value: number;
  className?: string;
  /** Name for assistive tech. Bars without one are decorative and hidden from it. */
  label?: string;
}

/** Fills with scaleX so it animates on the compositor. Fills from the reading-direction start. */
export function ProgressBar({ value, className, label }: Props) {
  const clamped = Math.max(0, Math.min(1, value));
  const a11y = label
    ? {
        role: 'progressbar',
        'aria-label': label,
        'aria-valuenow': Math.round(clamped * 100),
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      }
    : { 'aria-hidden': true };
  return (
    <div className={cn('h-1 overflow-hidden rounded-full bg-white/20', className)} {...a11y}>
      <m.div
        className="h-full origin-left rounded-full bg-accent [[dir=rtl]_&]:origin-right"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: clamped }}
        transition={{ ...t.slow, delay: 0.1 }}
      />
    </div>
  );
}
