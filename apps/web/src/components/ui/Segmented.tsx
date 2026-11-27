import { motion } from 'framer-motion';
import { useId } from 'react';
import { spring } from '../../design/motion';
import { cn } from '../../lib/cn';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** A row of options with a pill that slides to the selected one. */
export function Segmented<T extends string>({ options, value, onChange, label, size = 'md', className }: Props<T>) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-full bg-surface-2 p-1', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative rounded-full font-semibold whitespace-nowrap transition-colors duration-150',
              size === 'sm' ? 'px-3 py-1.5 text-small' : 'px-4 py-2 text-body',
              on ? 'text-on-accent' : 'text-fg-dim hover:text-fg',
            )}
          >
            {on && (
              <motion.span layoutId={`seg-${id}`} transition={spring.snappy} className="absolute inset-0 rounded-full bg-fg" />
            )}
            <span className={cn('relative', on && 'text-bg')}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Filter pills for categories and genres: same slide, quieter look. */
export function PillTabs<T extends string>({ options, value, onChange, label, className }: Props<T>) {
  const id = useId();
  return (
    <div role="tablist" aria-label={label} className={cn('no-scrollbar flex gap-2 overflow-x-auto py-1', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative shrink-0 rounded-full border px-4 py-1.5 text-small font-semibold transition-colors duration-150',
              on ? 'border-transparent text-bg' : 'border-line text-fg-dim hover:border-line-strong hover:text-fg',
            )}
          >
            {on && <motion.span layoutId={`pill-${id}`} transition={spring.snappy} className="absolute inset-0 rounded-full bg-fg" />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
