import { Crossfade } from '../ui/Crossfade';

/** Shown when a title has no artwork yet: its name, set in the display face. */
export function PosterFallback({ title }: { title: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-surface-2 p-4 text-center">
      <div>
        <div className="font-display text-title-s leading-tight text-balance text-fg">
          <Crossfade k={title}>{title}</Crossfade>
        </div>
        <div className="mx-auto mt-3 h-0.5 w-6 bg-accent" />
      </div>
    </div>
  );
}
