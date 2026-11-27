import type { Chapter } from '@marquee/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { formatDuration } from '../lib/format';
import { useDebounced } from '../lib/hooks';

interface Props {
  time: number;
  duration: number;
  /** Buffered ranges in absolute seconds. */
  buffered: [number, number][];
  chapters: Chapter[];
  fileId: number | null;
  thumbs: boolean;
  onSeek: (t: number) => void;
  onScrub: (active: boolean) => void;
}

/** Seek bar with buffer ranges, chapter gaps, a drag handle and a thumbnail preview on hover. */
export function Scrubber({
  time,
  duration,
  buffered,
  chapters,
  fileId,
  thumbs,
  onSeek,
  onScrub,
}: Props) {
  const { t } = useTranslation();
  const track = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [thumbReady, setThumbReady] = useState(false);
  const bucket = hover === null ? null : Math.floor(hover / 10) * 10;
  const thumbAt = useDebounced(bucket, 120);

  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const rtl = document.documentElement.dir === 'rtl';
    const x = rtl ? r.right - clientX : clientX - r.left;
    return Math.max(0, Math.min(1, x / r.width)) * duration;
  };

  useEffect(() => setThumbReady(false), [thumbAt]);

  const shown = drag ?? time;
  const pct = duration > 0 ? (shown / duration) * 100 : 0;
  const preview = drag ?? hover;
  const chapter =
    preview !== null ? chapters.find((c) => preview >= c.start && preview < c.end) : undefined;
  const showThumb = thumbs && fileId !== null && thumbAt !== null && preview !== null;

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={t('player.seek')}
      aria-valuemin={0}
      aria-valuemax={Math.floor(duration)}
      aria-valuenow={Math.floor(shown)}
      aria-valuetext={formatDuration(shown)}
      className="group/scrub relative flex h-6 cursor-pointer touch-none items-center"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(at(e.clientX));
        onScrub(true);
      }}
      onPointerMove={(e) => {
        const v = at(e.clientX);
        setHover(v);
        if (drag !== null) setDrag(v);
      }}
      onPointerUp={(e) => {
        if (drag !== null) onSeek(at(e.clientX));
        setDrag(null);
        onScrub(false);
      }}
      onPointerLeave={() => setHover(null)}
    >
      <div className="relative h-1 w-full rounded-full bg-white/25 transition-[height] duration-150 group-hover/scrub:h-[7px]">
        {buffered.map(([a, b], i) => (
          <span
            key={i}
            className="absolute inset-y-0 rounded-full bg-white/30"
            style={{
              insetInlineStart: `${(a / duration) * 100}%`,
              width: `${((b - a) / duration) * 100}%`,
            }}
          />
        ))}
        <span
          className="absolute inset-y-0 start-0 origin-left rounded-full bg-accent transition-transform duration-200 ease-linear [[dir=rtl]_&]:origin-right"
          style={{ width: '100%', transform: `scaleX(${pct / 100})` }}
        />
        {chapters.slice(1).map((c) => (
          <span
            key={c.start}
            className="absolute inset-y-0 w-[2px] bg-bg/80"
            style={{ insetInlineStart: `${(c.start / duration) * 100}%` }}
            aria-hidden
          />
        ))}
        <span
          className={cn(
            'absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-accent shadow transition-transform duration-150',
            drag !== null ? 'scale-125' : 'scale-0 group-hover/scrub:scale-100',
          )}
          style={{ insetInlineStart: `calc(${pct}% - 7px)` }}
        />
      </div>

      {preview !== null && (
        <div
          className="pointer-events-none absolute bottom-7 z-10 -translate-x-1/2 text-center [[dir=rtl]_&]:translate-x-1/2"
          style={{
            insetInlineStart: `clamp(5.5rem, ${(preview / duration) * 100}%, calc(100% - 5.5rem))`,
          }}
        >
          {showThumb && (
            <div className="relative mb-1.5 aspect-video w-44 overflow-hidden rounded-md border border-white/20 bg-surface-3 shadow-[var(--shadow-pop)]">
              <img
                key={thumbAt}
                src={`/api/stream/${fileId}/thumb?t=${thumbAt}`}
                alt=""
                onLoad={() => setThumbReady(true)}
                onError={() => setThumbReady(false)}
                className={cn(
                  'size-full object-cover transition-opacity duration-150',
                  thumbReady ? 'opacity-100' : 'opacity-0',
                )}
              />
            </div>
          )}
          {chapter?.title && (
            <div className="mb-0.5 max-w-44 truncate text-caption text-fg-dim">{chapter.title}</div>
          )}
          <span className="rounded bg-black/70 px-2 py-0.5 text-small font-semibold tabular-nums">
            {formatDuration(preview)}
          </span>
        </div>
      )}
    </div>
  );
}
