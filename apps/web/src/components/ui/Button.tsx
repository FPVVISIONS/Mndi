import { m, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { press, spring, squish } from '../../design/motion';
import { useLiquidGlass } from '../../lib/glass';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary:
    'bg-fg text-bg hover:bg-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.12),0_8px_24px_-10px_rgb(255_255_255/0.35)]',
  accent: 'bg-accent text-on-accent hover:bg-accent-strong',
  secondary: 'glass text-fg',
  ghost: 'text-fg-dim hover:text-fg hover:bg-white/8',
  danger: 'glass text-fg hover:text-accent',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-small gap-2',
  md: 'h-11 px-5 text-body gap-2.5',
  lg: 'h-[3.25rem] px-7 text-lead gap-2.5',
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
  const glassy = variant === 'secondary' || variant === 'danger';
  const ref = useLiquidGlass<HTMLButtonElement>();
  return (
    <m.button
      ref={glassy ? ref : undefined}
      type={type}
      whileTap={rest.disabled ? undefined : glassy ? squish : press}
      whileHover={rest.disabled ? undefined : { scale: 1.03 }}
      transition={spring.liquid}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap transition-colors duration-150 disabled:opacity-40',
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
      whileTap={tone === 'solid' ? squish : press}
      whileHover={{ scale: 1.08 }}
      transition={spring.liquid}
      className={cn(
        'inline-grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-150',
        tone === 'solid' ? 'glass text-fg' : 'text-fg-dim hover:bg-white/10 hover:text-fg',
        active && 'text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </m.button>
  );
}
