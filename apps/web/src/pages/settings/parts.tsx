import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Section({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      {title && <h2 className="font-display text-title-s">{title}</h2>}
      {hint && <p className="mt-1 mb-4 text-small text-fg-dim">{hint}</p>}
      <div className={cn('divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-1', title && !hint && 'mt-4')}>{children}</div>
    </section>
  );
}

export function Row({ title, hint, children, stack }: { title: string; hint?: string; children: ReactNode; stack?: boolean }) {
  return (
    <div className={cn('flex gap-4 p-4 sm:p-5', stack ? 'flex-col' : 'items-center justify-between')}>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        {hint && <div className="mt-0.5 text-small text-fg-dim text-pretty">{hint}</div>}
      </div>
      <div className={cn(!stack && 'shrink-0')}>{children}</div>
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-10 min-w-44 cursor-pointer rounded-md border border-line bg-surface-2 px-3 text-body text-fg outline-none transition-colors hover:border-line-strong focus:border-fg-dim"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-surface-2">{o.label}</option>
      ))}
    </select>
  );
}
