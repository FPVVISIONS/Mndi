import { AnimatePresence, m } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { duration, spring } from '../../design/motion';
import { cn } from '../../lib/cn';
import { IconButton } from './Button';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, className }: Props) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[var(--z-modal)] grid items-end justify-items-center md:place-items-center md:p-4">
          <m.div
            className="absolute inset-0 bg-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.base }}
            onClick={onClose}
          />
          <m.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={spring.modal}
            className={cn(
              'relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-line bg-surface-1 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-modal)] md:rounded-xl md:p-6',
              className,
            )}
          >
            {title && (
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="font-display text-title-m">{title}</h2>
                <IconButton label={t('common.close')} onClick={onClose}>
                  <X size={20} />
                </IconButton>
              </div>
            )}
            {children}
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
