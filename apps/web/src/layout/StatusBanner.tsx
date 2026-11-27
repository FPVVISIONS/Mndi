import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { spring } from '../design/motion';
import { useStatus } from '../queries/hooks';

/** Friendly Telegram and indexing state. Never shows raw errors. */
export function StatusBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data } = useStatus();
  const [, tick] = useState(0);
  const tg = data?.telegram;

  useEffect(() => {
    if (tg?.state !== 'flood-wait') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [tg?.state]);

  let message: string | null = null;
  let problem = false;
  if (data && tg && !data.mock) {
    switch (tg.state) {
      case 'connecting': message = t('status.connecting'); break;
      case 'reconnecting': message = t('status.reconnecting'); break;
      case 'flood-wait': message = t('status.floodWait', { seconds: Math.max(1, Math.ceil(((tg.retryAt ?? 0) - Date.now()) / 1000)) }); break;
      case 'error': message = t('status.error'); problem = true; break;
      case 'logged-out': message = t('status.loggedOut'); problem = true; break;
      case 'unconfigured': message = t('status.unconfigured'); problem = true; break;
    }
  }
  if (!message && data?.index.scanning) message = t('status.scanning');

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--nav-h)+0.5rem)] z-[calc(var(--z-nav)-1)] flex justify-center px-4">
      <AnimatePresence>
        {message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={spring.soft}
            role="status"
            className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-line-strong bg-surface-2/95 py-2 ps-3.5 pe-2 text-small shadow-[var(--shadow-pop)] backdrop-blur"
          >
            {problem ? <CircleAlert size={16} className="text-accent" /> : <LoaderCircle size={16} className="animate-spin text-fg-dim" />}
            <span>{message}</span>
            {problem && (
              <button type="button" onClick={() => navigate('/settings?tab=library')} className="rounded-full bg-fg px-3 py-1 text-caption font-bold text-bg">
                {t('status.fix')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
