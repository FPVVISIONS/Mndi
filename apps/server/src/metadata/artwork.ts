import type { ImagePick, TmdbImage } from './types.js';

export type ArtworkKind = 'poster' | 'backdrop' | 'logo';

/** Highest voted first; vote count and resolution break ties. */
function byQuality(a: TmdbImage, b: TmdbImage): number {
  return b.vote_average - a.vote_average || b.vote_count - a.vote_count || b.width - a.width || 0;
}

function bestOf(images: TmdbImage[], match: (img: TmdbImage) => boolean): TmdbImage | null {
  return images.filter(match).sort(byQuality)[0] ?? null;
}

/**
 * Language preference per artwork kind.
 *
 * Posters and logos: chosen language, then English, then language-neutral.
 * Backdrops: chosen language, then language-neutral, then English. A backdrop with English
 * lettering would sit under a localized logo and print the title twice, so neutral wins there.
 */
export function languageOrder(kind: ArtworkKind, lang: string): (string | null)[] {
  const order = kind === 'backdrop' ? [lang, null, 'en'] : [lang, 'en', null];
  return order.filter((l, i) => order.indexOf(l) === i);
}

export function pickImage(
  images: TmdbImage[] | undefined,
  lang: string,
  kind: ArtworkKind,
): ImagePick | null {
  if (!images?.length) return null;
  for (const wanted of languageOrder(kind, lang)) {
    const hit = bestOf(images, (img) => (img.iso_639_1 ?? null) === wanted);
    if (hit) return { path: hit.file_path, lang: hit.iso_639_1 ?? null };
  }
  // A logo in an unrelated language is worse than a typeset title; a poster is not.
  if (kind === 'logo') return null;
  const any = bestOf(images, () => true);
  return any ? { path: any.file_path, lang: any.iso_639_1 ?? null } : null;
}
