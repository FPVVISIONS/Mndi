import { DEFAULT_LANGUAGE, type LanguageCode } from '@marquee/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AudioPref = 'original' | 'ui' | LanguageCode;
export type SubtitlePref = 'off' | 'auto' | 'ui' | LanguageCode;
export type QualityPref = 'best' | '1080p' | '720p';

export interface Prefs {
  language: LanguageCode;
  /** Which audio track to start with: the file's default, the UI language, or a specific one. */
  audio: AudioPref;
  /** Subtitles: off, only when the audio is in a different language than the UI, or always in a language. */
  subtitles: SubtitlePref;
  quality: QualityPref;
  autoplayNext: boolean;
  heroPreview: boolean;
  skipIntro: boolean;
  /** Calmer interface: no springs, parallax or glass refraction. Off by default. */
  reduceMotion: boolean;
  recentSearches: string[];
  set: <K extends keyof Omit<Prefs, 'set' | 'addSearch' | 'clearSearches'>>(
    key: K,
    value: Prefs[K],
  ) => void;
  addSearch: (q: string) => void;
  clearSearches: () => void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set, get) => ({
      language: DEFAULT_LANGUAGE,
      audio: 'original',
      subtitles: 'auto',
      quality: 'best',
      autoplayNext: true,
      heroPreview: true,
      skipIntro: false,
      reduceMotion: false,
      recentSearches: [],
      set: (key, value) => set({ [key]: value } as Partial<Prefs>),
      addSearch: (q) => {
        const clean = q.trim();
        if (clean.length < 2) return;
        const next = [
          clean,
          ...get().recentSearches.filter((s) => s.toLowerCase() !== clean.toLowerCase()),
        ];
        set({ recentSearches: next.slice(0, 8) });
      },
      clearSearches: () => set({ recentSearches: [] }),
    }),
    {
      name: 'marquee.prefs',
      version: 1,
      partialize: (s) => ({
        language: s.language,
        audio: s.audio,
        subtitles: s.subtitles,
        quality: s.quality,
        autoplayNext: s.autoplayNext,
        heroPreview: s.heroPreview,
        skipIntro: s.skipIntro,
        reduceMotion: s.reduceMotion,
        recentSearches: s.recentSearches,
      }),
    },
  ),
);
