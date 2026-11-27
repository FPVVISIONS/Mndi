import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { duration, ease } from '../../design/motion';
import { cn } from '../../lib/cn';

interface Props {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  className?: string;
  panelClassName?: string;
}

export function Popover({ trigger, children, align = 'end', side = 'bottom', className, panelClassName }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: side === 'bottom' ? -6 : 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: duration.fast } }}
            transition={{ duration: duration.base, ease: ease.out }}
            style={{ transformOrigin: `${side === 'bottom' ? 'top' : 'bottom'} ${align === 'end' ? 'right' : 'left'}` }}
            className={cn(
              'absolute z-50 min-w-48 rounded-lg border border-line bg-surface-2 p-1.5 shadow-[var(--shadow-pop)]',
              side === 'bottom' ? 'top-[calc(100%+0.5rem)]' : 'bottom-[calc(100%+0.5rem)]',
              align === 'end' ? 'end-0' : 'start-0',
              panelClassName,
            )}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ItemProps {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  icon?: ReactNode;
}

export function MenuItem({ children, onClick, active, icon }: ItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-body transition-colors hover:bg-white/8',
        active ? 'text-fg' : 'text-fg-dim hover:text-fg',
      )}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {active && <span className="size-1.5 rounded-full bg-accent" aria-hidden />}
    </button>
  );
}
