import { languageInfo, type LanguageCode } from '@marquee/shared';
import { i18n, switchI18n } from '../i18n';
import { usePrefs } from '../stores/prefs';
import { useToasts } from '../stores/toasts';
import { api } from './api';

/** Switch the interface and the metadata language together, without a reload. */
export async function setLanguage(code: LanguageCode, announce = true): Promise<void> {
  if (usePrefs.getState().language === code) return;
  await switchI18n(code);
  usePrefs.getState().set('language', code);
  void api.prefetch(code).catch(() => undefined);
  if (announce) useToasts.getState().push(i18n.t('toast.language', { name: languageInfo(code).native }));
}
