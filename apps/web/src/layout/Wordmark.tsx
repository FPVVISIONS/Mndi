import { Link } from 'react-router-dom';

/** The name set in the system font's heaviest weight, like an app title on iOS or macOS. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`inline-flex items-center ${className}`} aria-label="Marquee">
      <span
        className="text-[1.375rem] leading-none font-extrabold text-fg"
        style={{ letterSpacing: '-0.035em' }}
      >
        Marquee
      </span>
    </Link>
  );
}
