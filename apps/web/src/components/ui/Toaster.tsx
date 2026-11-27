import { AnimatePresence, m } from 'framer-motion';
import { Check, CircleAlert } from 'lucide-react';
import { spring } from '../../design/motion';
import { useToasts } from '../../stores/toasts';

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-h)+env(safe-area-inset-bottom)+0.75rem)] z-[var(--z-toast)] flex flex-col items-center gap-2 md:bottom-8"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <m.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 30, scale: 0.6, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 10, scale: 0.8, filter: 'blur(6px)' }}
            transition={spring.liquid}
            className="glass glass-strong pointer-events-auto flex items-center gap-2.5 rounded-full py-2.5 ps-3.5 pe-5 text-small font-semibold"
          >
            {t.tone === 'error' ? (
              <CircleAlert size={16} className="text-accent" />
            ) : (
              <Check size={16} className="text-accent" />
            )}
            {t.message}
          </m.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
