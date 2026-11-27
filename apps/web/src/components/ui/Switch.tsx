import { motion } from 'framer-motion';
import { spring } from '../../design/motion';
import { cn } from '../../lib/cn';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

export function Switch({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors duration-200',
        checked ? 'bg-accent' : 'bg-surface-3',
      )}
    >
      <motion.span
        layout
        transition={spring.snappy}
        className={cn('size-5 rounded-full', checked ? 'bg-on-accent' : 'bg-fg-dim')}
        style={{ marginInlineStart: checked ? 'auto' : 0 }}
      />
    </button>
  );
}
