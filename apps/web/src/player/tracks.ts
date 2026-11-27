import type { AudioTrack, SubtitleTrack } from '@marquee/shared';
import type { AudioPref, SubtitlePref } from '../stores/prefs';

/** Which audio track to start with, from the audio preference. Index into the file's audio tracks. */
export function pickAudio(tracks: AudioTrack[], pref: AudioPref, uiLang: string): number {
  if (pref === 'original' || tracks.length < 2) return 0;
  const wanted = pref === 'ui' ? uiLang : pref;
  const i = tracks.findIndex((t) => t.lang === wanted);
  return i >= 0 ? i : 0;
}

/**
 * Which subtitle track to show, or null for none.
 * "auto" shows subtitles in the interface language only when the audio is in a different language.
 */
export function pickSubtitle(
  subs: SubtitleTrack[],
  audioLang: string | null,
  pref: SubtitlePref,
  uiLang: string,
): number | null {
  if (pref === 'off' || !subs.length) return null;
  const wanted = pref === 'auto' || pref === 'ui' ? uiLang : pref;
  if (pref === 'auto' && audioLang === uiLang) return null;
  const i = subs.findIndex((s) => s.lang === wanted && !s.forced);
  if (i >= 0) return subs[i]!.index;
  return pref === 'auto' ? null : (subs.find((s) => s.lang === wanted)?.index ?? null);
}
