import { languageInfo, type LanguageCode } from '@marquee/shared';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

type Bundle = Record<string, unknown>;

// Every other language is its own chunk, fetched the first time it is chosen.
const loaders = import.meta.glob<{ default: Bundle }>('./locales/*.json');

async function loadBundle(code: LanguageCode): Promise<Bundle> {
  if (code === 'en') return en;
  const load = loaders[`./locales/${code}.json`];
  return load ? (await load()).default : en;
}

/** Hebrew, Arabic and Cyrillic faces are only fetched when one of those languages is in use. */
const fontLoaders: Partial<Record<LanguageCode, () => Promise<unknown>>> = {
  he: () => import('@fontsource-variable/noto-sans-hebrew/index.css'),
  ar: () => import('@fontsource-variable/noto-sans-arabic/index.css'),
  ru: () => import('@fontsource-variable/noto-sans/index.css'),
};

function loadFonts(code: LanguageCode): void {
  void fontLoaders[code]?.().catch(() => undefined);
}

export function applyDocumentLanguage(code: LanguageCode): void {
  const info = languageInfo(code);
  document.documentElement.lang = info.code;
  document.documentElement.dir = info.rtl ? 'rtl' : 'ltr';
}

export async function initI18n(code: LanguageCode): Promise<void> {
  const bundle = await loadBundle(code);
  await i18n.use(initReactI18next).init({
    lng: code,
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      ...(code !== 'en' ? { [code]: { translation: bundle } } : {}),
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  applyDocumentLanguage(code);
  loadFonts(code);
}

/** Load the language's strings first, then switch, so nothing renders half-translated. */
export async function switchI18n(code: LanguageCode): Promise<void> {
  if (!i18n.hasResourceBundle(code, 'translation'))
    i18n.addResourceBundle(code, 'translation', await loadBundle(code));
  await i18n.changeLanguage(code);
  applyDocumentLanguage(code);
  loadFonts(code);
}

export { i18n };
