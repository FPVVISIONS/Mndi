import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ImageRef } from '@marquee/shared';
import { imageUrl, type ArtSize } from '../../lib/images';
import { cn } from '../../lib/cn';

interface Layer {
  src: string;
  loaded: boolean;
}

interface Props {
  image: ImageRef | null | undefined;
  size: ArtSize;
  alt?: string;
  fit?: 'cover' | 'contain';
  eager?: boolean;
  className?: string;
  imgClassName?: string;
  fallback?: ReactNode;
}

/**
 * Artwork with a dominant-colour placeholder. When the source changes (a language switch),
 * the new image loads on top of the old one and fades in, so nothing flashes empty.
 */
export function ArtImage({
  image,
  size,
  alt = '',
  fit = 'cover',
  eager,
  className,
  imgClassName,
  fallback,
}: Props) {
  const src = image ? imageUrl(image, size) : null;
  const [layers, setLayers] = useState<Layer[]>(() => (src ? [{ src, loaded: false }] : []));
  const prune = useRef<number>();

  useEffect(() => {
    setLayers((prev) => {
      if (!src) return [];
      if (prev[prev.length - 1]?.src === src) return prev;
      return [...prev.filter((l) => l.loaded).slice(-1), { src, loaded: false }];
    });
  }, [src]);

  const onLoad = (loadedSrc: string) => {
    setLayers((prev) => prev.map((l) => (l.src === loadedSrc ? { ...l, loaded: true } : l)));
    window.clearTimeout(prune.current);
    prune.current = window.setTimeout(() => setLayers((prev) => prev.slice(-1)), 500);
  };

  useEffect(() => () => window.clearTimeout(prune.current), []);

  return (
    <div
      className={cn('relative overflow-hidden bg-surface-2', className)}
      style={{ backgroundColor: image?.color }}
    >
      {!src && fallback}
      {layers.map((l, i) => (
        <img
          key={l.src}
          src={l.src}
          alt={i === layers.length - 1 ? alt : ''}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => onLoad(l.src)}
          className={cn(
            'absolute inset-0 size-full transition-opacity duration-[var(--dur-slow)] ease-[var(--ease-out)]',
            fit === 'cover' ? 'object-cover' : 'object-contain',
            l.loaded ? 'opacity-100' : 'opacity-0',
            imgClassName,
          )}
        />
      ))}
    </div>
  );
}
