import { AnimatePresence, motion } from 'framer-motion';
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
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={spring.soft}
            className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-line-strong bg-surface-3 py-2.5 ps-3.5 pe-5 text-small font-medium shadow-[var(--shadow-pop)]"
          >
            {t.tone === 'error' ? <CircleAlert size={16} className="text-accent" /> : <Check size={16} className="text-accent" />}
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
