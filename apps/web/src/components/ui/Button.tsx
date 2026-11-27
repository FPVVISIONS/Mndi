import { m, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { press, spring } from '../../design/motion';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-fg text-bg hover:bg-white',
  accent: 'bg-accent text-on-accent hover:bg-accent-strong',
  secondary: 'bg-white/12 text-fg hover:bg-white/20',
  ghost: 'text-fg-dim hover:text-fg hover:bg-white/8',
  danger: 'bg-white/10 text-fg hover:bg-accent hover:text-on-accent',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-small gap-2',
  md: 'h-11 px-5 text-body gap-2.5',
  lg: 'h-12 px-7 text-lead gap-3',
};

interface Props extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className,
  type = 'button',
  ...rest
}: Props) {
  return (
    <m.button
      type={type}
      whileTap={rest.disabled ? undefined : press}
      transition={spring.snappy}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-semibold whitespace-nowrap transition-colors duration-150 disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </m.button>
  );
}

interface IconProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  label: string;
  children: ReactNode;
  active?: boolean;
  tone?: 'plain' | 'solid';
}

export function IconButton({
  label,
  children,
  active,
  tone = 'plain',
  className,
  type = 'button',
  ...rest
}: IconProps) {
  return (
    <m.button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      whileTap={press}
      transition={spring.snappy}
      className={cn(
        'inline-grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-150',
        tone === 'solid'
          ? 'border border-white/35 bg-black/40 text-fg hover:border-fg hover:bg-black/60'
          : 'text-fg-dim hover:bg-white/10 hover:text-fg',
        active && 'text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </m.button>
  );
}
