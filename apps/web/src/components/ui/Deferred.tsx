import type { ReactNode } from 'react';
import { useSeen } from '../../lib/hooks';

/**
 * Renders its children only once it is near the viewport. Until then it reserves the same height,
 * so rows far below the fold cost nothing at startup and never move the page when they appear.
 */
export function Deferred({ height, children }: { height: string; children: ReactNode }) {
  const [ref, seen] = useSeen<HTMLDivElement>('700px');
  return (
    <div ref={ref} style={seen ? undefined : { minHeight: height }}>
      {seen ? children : null}
    </div>
  );
}
