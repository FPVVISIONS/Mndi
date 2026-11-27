import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props<T> {
  items: T[];
  /** Card width and the aspect of the card plus its caption, as height / width. */
  minWidth: number;
  aspect: number;
  gap: number;
  render: (item: T) => ReactNode;
  keyOf: (item: T) => string | number;
}

/**
 * Window-scrolled virtual grid: only rows near the viewport are in the DOM,
 * so a library of thousands of titles scrolls as smoothly as one of twenty.
 */
export function VirtualGrid<T>({ items, minWidth, aspect, gap, render, keyOf }: Props<T>) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState({ top: 0, height: 0 });

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = root.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRange({ top: -r.top, height: window.innerHeight });
    };
    const on = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      cancelAnimationFrame(frame);
    };
  }, [items.length, width]);

  const cols = Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
  const cardW = cols > 0 && width > 0 ? (width - gap * (cols - 1)) / cols : minWidth;
  const rowH = cardW * aspect + gap;
  const rows = Math.ceil(items.length / cols);
  const buffer = 2;
  const first = Math.max(0, Math.floor(range.top / rowH) - buffer);
  const last = Math.min(rows - 1, Math.ceil((range.top + range.height) / rowH) + buffer);
  const visible = items.slice(first * cols, (last + 1) * cols);

  return (
    <div ref={root} style={{ height: rows * rowH, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          insetInline: 0,
          top: first * rowH,
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap,
          ['--card-w' as string]: `${cardW}px`,
        }}
      >
        {visible.map((item) => (
          <div key={keyOf(item)}>{render(item)}</div>
        ))}
      </div>
    </div>
  );
}
