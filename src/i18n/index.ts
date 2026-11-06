import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import en from './en.json';
import pt from './pt.json';
import type { LocalizedName } from '@/data/gameData';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'helpervalley.lang';

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'pt') return saved;
  } catch {
    // Storage can be unavailable (private mode); fall back to the browser language.
  }
  return navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pt: { translation: pt } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng === 'pt' ? 'pt-BR' : 'en';
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // Ignore: the choice just won't persist.
  }
});
document.documentElement.lang = i18n.language === 'pt' ? 'pt-BR' : 'en';

/** Picks the current language from a game name tuple. */
export function useGameName() {
  const { i18n: instance } = useTranslation();
  const index = instance.language === 'pt' ? 1 : 0;
  return (name: LocalizedName | undefined) => (name ? name[index] || name[0] : '');
}

export default i18n;
