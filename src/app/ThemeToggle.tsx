import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Theme = 'auto' | 'day' | 'night';
const KEY = 'hv-theme';

/** Applies the saved theme to <html data-theme>; "auto" follows the system. */
export function applyTheme(theme: Theme) {
  const night = theme === 'night' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = night ? 'night' : 'day';
}

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'day' || v === 'night' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** Day / night / follow the system, next to the language picker. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
    if (theme !== 'auto') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('auto');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);
  return (
    <label className="shell__lang box">
      <span className="visually-hidden">{t('theme.label')}</span>
      <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
        <option value="auto">{t('theme.auto')}</option>
        <option value="day">{t('theme.day')}</option>
        <option value="night">{t('theme.night')}</option>
      </select>
    </label>
  );
}
