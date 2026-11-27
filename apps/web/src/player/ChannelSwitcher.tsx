import { AnimatePresence, m } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { titleKeyLite } from '../lib/text';
import { useChannels } from '../queries/hooks';
import { spring } from '../design/motion';
import { IconButton } from '../components/ui/Button';

interface Props {
  open: boolean;
  currentId: number | null;
  onClose: () => void;
  onPick: (id: number) => void;
}

/** Side panel over live video: arrow keys move through channels, Enter switches. */
export function ChannelSwitcher({ open, currentId, onClose, onPick }: Props) {
  const { t } = useTranslation();
  const { data } = useChannels();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const channels = useMemo(
    () =>
      (data?.channels ?? []).filter(
        (c) => !q.trim() || titleKeyLite(c.name).includes(titleKeyLite(q)),
      ),
    [data, q],
  );

  useEffect(() => {
    if (!open) return;
    setQ('');
    setActive(
      Math.max(
        0,
        (data?.channels ?? []).findIndex((c) => c.id === currentId),
      ),
    );
  }, [open, currentId, data]);

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(channels.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && channels[active]) {
      onPick(channels[active]!.id);
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <m.aside
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={spring.soft}
          onKeyDown={onKey}
          className="absolute inset-y-0 end-0 z-30 flex w-80 max-w-[85vw] flex-col border-s border-line bg-bg/92 backdrop-blur-md rtl:!translate-x-0"
          aria-label={t('player.channels')}
        >
          <div className="flex items-center gap-2 p-4">
            <label className="relative flex-1">
              <Search
                size={15}
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-fg-faint"
              />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                placeholder={t('player.searchChannels')}
                aria-label={t('player.searchChannels')}
                className="h-10 w-full rounded-full border border-line bg-surface-1 ps-9 pe-3 text-small outline-none focus:border-fg-dim"
              />
            </label>
            <IconButton label={t('common.close')} onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
          <ul ref={list} className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4" role="listbox">
            {channels.map((c, i) => (
              <li key={c.id} role="option" aria-selected={c.id === currentId}>
                <button
                  type="button"
                  onClick={() => onPick(c.id)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-start transition-colors',
                    i === active ? 'bg-white/10' : 'hover:bg-white/5',
                  )}
                >
                  {c.logo ? (
                    <img
                      src={c.logo}
                      alt=""
                      className="size-9 shrink-0 rounded-sm object-contain"
                    />
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-surface-3 text-caption font-bold">
                      {c.name.slice(0, 2)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 truncate text-body font-medium">
                      {c.id === currentId && (
                        <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                      )}
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="block truncate text-caption text-fg-faint">
                      {c.nowPlaying?.title ?? c.group}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </m.aside>
      )}
    </AnimatePresence>
  );
}
