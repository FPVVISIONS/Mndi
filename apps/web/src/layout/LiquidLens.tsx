import { m } from 'framer-motion';
import { spring } from '../design/motion';
import { cn } from '../lib/cn';

/**
 * The bright drop behind the selected tab. It slides to the new tab with a liquid spring and
 * squashes as it lands (the inner element replays the squash whenever `pulse` changes).
 */
export function LiquidLens({
  layoutId,
  pulse,
  className,
}: {
  layoutId: string;
  pulse: string;
  className?: string;
}) {
  return (
    <m.span
      layoutId={layoutId}
      transition={spring.liquid}
      className={cn('absolute inset-0 rounded-full', className)}
      aria-hidden
    >
      <m.span
        key={pulse}
        className="glass-lens absolute inset-0 rounded-full"
        initial={{ scaleX: 1.18, scaleY: 0.84 }}
        animate={{ scaleX: 1, scaleY: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 14, mass: 0.7 }}
      />
    </m.span>
  );
}
