import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Theme = 'auto' | 'day' | 'night';
const KEY = 'hv-theme';

const systemNight = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/** Applies the saved theme to <html data-theme>; with nothing saved it follows the system. */
export function applyTheme(theme: Theme) {
  const night = theme === 'night' || (theme === 'auto' && systemNight());
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

/** One button: a sun by day, a moon at night. Starts from the system setting until clicked. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(readTheme);
  const night = theme === 'night' || (theme === 'auto' && systemNight());

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'auto') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('auto');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const toggle = () => {
    const next: Theme = night ? 'day' : 'night';
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  };

  return (
    <button type="button" className="button theme-toggle" onClick={toggle} aria-label={night ? t('theme.toDay') : t('theme.toNight')} title={night ? t('theme.toDay') : t('theme.toNight')}>
      <span className={night ? 'theme-toggle__moon' : 'theme-toggle__sun'} aria-hidden="true" />
    </button>
  );
}
