import { m } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { popIn, staggerChildren, stagger } from '../../design/motion';
import { Crossfade } from '../ui/Crossfade';

interface Props {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}

/**
 * A horizontally scrolling row: snap points, edge arrows on hover, mouse drag, native touch scroll.
 * The room below the cards is reserved so hover panels are never clipped.
 */
/** Cards mounted straight away; the rest follow when the browser is idle. */
const FIRST_BATCH = 6;

export function Row({ title, children, action }: Props) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);
  const [count, setCount] = useState(FIRST_BATCH);

  useEffect(() => {
    if (count >= items.length) return;
    const finish = () => setCount(items.length);
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(finish, { timeout: 800 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(finish, 300);
    return () => window.clearTimeout(id);
  }, [count, items.length]);
  const drag = useRef({ active: false, moved: false, x: 0, left: 0 });

  const page = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const rtl = document.documentElement.dir === 'rtl';
    el.scrollBy({ left: dir * (rtl ? -1 : 1) * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = {
      active: true,
      moved: false,
      x: e.clientX,
      left: scroller.current?.scrollLeft ?? 0,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || !scroller.current) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 6) d.moved = true;
    if (d.moved) {
      scroller.current.style.scrollSnapType = 'none';
      scroller.current.scrollLeft = d.left - dx;
    }
  };
  const end = () => {
    drag.current.active = false;
    if (scroller.current) scroller.current.style.scrollSnapType = '';
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const links = [...(scroller.current?.querySelectorAll<HTMLElement>('a[href]') ?? [])];
    const i = links.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const rtl = document.documentElement.dir === 'rtl';
    const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
    const next = links[i + step];
    if (next) {
      e.preventDefault();
      next.focus();
      next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  };

  return (
    <m.section
      aria-label={title}
      variants={staggerChildren(stagger.row)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      className="group/row relative"
    >
      <div className="page-x mb-1 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-title-s sm:text-title-m">
          <Crossfade k={title}>{title}</Crossfade>
        </h2>
        {action}
      </div>
      <div className="relative">
        <button
          type="button"
          aria-label={t('home.sectionScrollBack')}
          onClick={() => page(-1)}
          className="absolute inset-y-4 start-0 z-40 hidden w-[var(--gutter)] min-w-10 items-center justify-center bg-gradient-to-r from-bg/80 to-transparent text-fg opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-fine:flex rtl:bg-gradient-to-l"
        >
          <ChevronLeft size={28} className="flip-rtl" />
        </button>
        <div
          ref={scroller}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={end}
          onPointerLeave={end}
          onClickCapture={(e) => {
            if (drag.current.moved) {
              e.preventDefault();
              e.stopPropagation();
              drag.current.moved = false;
            }
          }}
          onKeyDown={onKeyDown}
          className="no-scrollbar -mb-24 flex snap-x snap-proximity gap-2.5 overflow-x-auto scroll-px-[var(--gutter)] px-[var(--gutter)] pt-5 pb-28 sm:gap-3"
        >
          {items.slice(0, count).map((child, i) => (
            <m.div key={i} variants={popIn} className="shrink-0">
              {child}
            </m.div>
          ))}
        </div>
        <button
          type="button"
          aria-label={t('home.sectionScrollForward')}
          onClick={() => page(1)}
          className="absolute inset-y-4 end-0 z-40 hidden w-[var(--gutter)] min-w-10 items-center justify-center bg-gradient-to-l from-bg/80 to-transparent text-fg opacity-0 transition-opacity duration-200 group-hover/row:opacity-100 focus-visible:opacity-100 pointer-fine:flex rtl:bg-gradient-to-r"
        >
          <ChevronRight size={28} className="flip-rtl" />
        </button>
      </div>
    </m.section>
  );
}
