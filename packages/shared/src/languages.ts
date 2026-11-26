export type LanguageCode = 'en' | 'he' | 'ar' | 'es' | 'fr' | 'de' | 'ru' | 'pt' | 'tr' | 'it';

export interface LanguageInfo {
  code: LanguageCode;
  /** Name in its own language, shown in the picker. */
  native: string;
  /** Locale passed to TMDB's `language` parameter. */
  tmdb: string;
  rtl: boolean;
}

/** Add a language here, add a locale file in apps/web, and it is supported end to end. */
export const LANGUAGES: readonly LanguageInfo[] = [
  { code: 'en', native: 'English', tmdb: 'en-US', rtl: false },
  { code: 'he', native: 'עברית', tmdb: 'he-IL', rtl: true },
  { code: 'ar', native: 'العربية', tmdb: 'ar-SA', rtl: true },
  { code: 'es', native: 'Español', tmdb: 'es-ES', rtl: false },
  { code: 'fr', native: 'Français', tmdb: 'fr-FR', rtl: false },
  { code: 'de', native: 'Deutsch', tmdb: 'de-DE', rtl: false },
  { code: 'ru', native: 'Русский', tmdb: 'ru-RU', rtl: false },
  { code: 'pt', native: 'Português', tmdb: 'pt-BR', rtl: false },
  { code: 'tr', native: 'Türkçe', tmdb: 'tr-TR', rtl: false },
  { code: 'it', native: 'Italiano', tmdb: 'it-IT', rtl: false },
];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && LANGUAGES.some((l) => l.code === value);
}

export function languageInfo(code: string): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]!;
}
