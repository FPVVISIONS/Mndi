import { Link } from 'react-router-dom';

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`group inline-flex items-baseline gap-0.5 ${className}`}
      aria-label="Marquee"
    >
      <span
        className="font-display text-[1.65rem] leading-none tracking-tight [html[lang=he]_&]:font-semibold"
        style={{ fontFamily: 'Instrument Serif, Georgia, serif', fontWeight: 400 }}
      >
        Marquee
      </span>
      <span
        className="size-1.5 translate-y-[-1px] rounded-full bg-accent transition-transform duration-300 group-hover:scale-150"
        aria-hidden
      />
    </Link>
  );
}
