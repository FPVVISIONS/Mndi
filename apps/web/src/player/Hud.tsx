import { AnimatePresence, motion } from 'framer-motion';
import { FastForward, Gauge, Rewind, Volume1, Volume2, VolumeX } from 'lucide-react';
import type { ReactNode } from 'react';
import { spring } from '../design/motion';

export type HudEvent = { id: number; kind: 'seek' | 'volume' | 'speed'; value: number; muted?: boolean } | null;

/** Brief centre feedback for seek, volume and speed changes. Fades out on its own. */
export function Hud({ event }: { event: HudEvent }) {
  let icon: ReactNode = null;
  let label = '';
  if (event?.kind === 'seek') {
    icon = event.value < 0 ? <Rewind size={30} className="fill-fg" /> : <FastForward size={30} className="fill-fg" />;
    label = `${event.value > 0 ? '+' : '−'}${Math.abs(event.value)}s`;
  } else if (event?.kind === 'volume') {
    icon = event.muted || event.value === 0 ? <VolumeX size={30} /> : event.value < 0.5 ? <Volume1 size={30} /> : <Volume2 size={30} />;
    label = event.muted ? '0%' : `${Math.round(event.value * 100)}%`;
  } else if (event?.kind === 'speed') {
    icon = <Gauge size={30} />;
    label = `${event.value}×`;
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center" aria-hidden>
      <AnimatePresence>
        {event && (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05, transition: { duration: 0.35 } }}
            transition={spring.snappy}
            className="flex flex-col items-center gap-2 rounded-xl bg-black/65 px-7 py-5"
          >
            {icon}
            <span className="text-lead font-semibold tabular-nums">{label}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
