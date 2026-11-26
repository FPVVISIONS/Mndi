import type { ImageRef } from '@marquee/shared';

export type ArtSize = 'w154' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original';

/** TMDB and generated demo art both go through the server, which caches them on disk. */
export function imageUrl(ref: ImageRef, size: ArtSize): string {
  return `/api/img/${size}/${ref.id.replace(/^\//, '')}`;
}
