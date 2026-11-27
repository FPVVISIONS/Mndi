import { AnimatePresence, m } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { duration, spring } from '../../design/motion';
import { useMedia } from '../../lib/hooks';
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
  const phone = useMedia('(max-width: 47.99rem)');

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
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(10px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            transition={{ duration: duration.base }}
            onClick={onClose}
          />
          <m.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={phone ? { y: '100%' } : { opacity: 0, scale: 0.85, y: 24 }}
            animate={phone ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={phone ? { y: '100%' } : { opacity: 0, scale: 0.9, y: 12 }}
            transition={spring.modal}
            // On phones the sheet follows the finger and closes when pulled down far or fast.
            drag={phone ? 'y' : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.8 }}
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            className={cn(
              'glass glass-strong relative max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] [--glass-tint:rgb(22_22_26/0.82)] md:rounded-[2rem] md:p-6',
              className,
            )}
          >
            {phone && (
              <div className="mx-auto -mt-1 mb-4 h-1.5 w-10 rounded-full bg-white/25" aria-hidden />
            )}
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
