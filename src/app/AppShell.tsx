import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '@/i18n';
import { ItemIcon } from '@/ui';
import { PlayerSwitcher } from '@/features/saves/PlayerSwitcher';
import { SaveDateChip, SaveUpdatedToast } from '@/features/saves/LiveStatus';
import './shell.css';

const NAV = [
  { to: '/', key: 'home', icon: '(O)392' },
  { to: '/kit', key: 'kit', icon: '(O)74' },
];

export function AppShell() {
  const { t, i18n } = useTranslation();
  return (
    <div className="shell">
      <header className="shell__header">
        <div className="shell__brand">
          <ItemIcon id="(O)24" scale={3} tooltip={false} />
          <div>
            <h1>{t('app.title')}</h1>
            <p className="shell__tagline">{t('app.tagline')}</p>
          </div>
        </div>
        <div className="shell__controls">
        <SaveDateChip />
        <PlayerSwitcher />
        <label className="shell__lang box">
          <span className="visually-hidden">{t('common.language')}</span>
          <select value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        </div>
      </header>

      <nav className="shell__nav" aria-label="Main">
        <ul className="tabs">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end className="tab">
                <ItemIcon id={item.icon} scale={2} tooltip={false} />
                {t(`nav.${item.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="shell__main panel">
        <Outlet />
      </main>

      <footer className="shell__footer">{t('app.disclaimer')}</footer>
      <SaveUpdatedToast />
    </div>
  );
}
