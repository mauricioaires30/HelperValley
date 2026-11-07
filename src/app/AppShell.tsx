import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '@/i18n';
import { ItemIcon } from '@/ui';
import { PlayerSwitcher } from '@/features/saves/PlayerSwitcher';
import { SaveDateChip, SaveUpdatedToast } from '@/features/saves/LiveStatus';
import { CachedBanner } from '@/features/saves/CachedBanner';
import './shell.css';

const NAV = [
  { to: '/', key: 'home', icon: '(O)392' },
  { to: '/calendar', key: 'calendar', icon: '(O)221' },
  { to: '/relationships', key: 'relationships', icon: '(O)458' },
  { to: '/farm', key: 'farm', icon: '(O)472' },
  { to: '/cc', key: 'cc', icon: '(O)24' },
  { to: '/museum', key: 'museum', icon: '(O)96' },
  { to: '/achievements', key: 'achievements', icon: '(O)74' },
];

/** Fixed sidebar (brand, save, player, menu, language) and the page using the rest of the screen. */
export function AppShell() {
  const { t, i18n } = useTranslation();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <ItemIcon id="(O)24" scale={2} tooltip={false} />
          <h1>{t('app.title')}</h1>
        </div>

        <div className="sidebar__save">
          <SaveDateChip />
          <PlayerSwitcher />
        </div>

        <nav className="sidebar__nav" aria-label="Main">
          <ul className="side-tabs">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end className="side-tab">
                  <ItemIcon id={item.icon} scale={2} tooltip={false} />
                  <span>{t(`nav.${item.key}`)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar__footer">
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
          <p className="sidebar__disclaimer">{t('app.disclaimer')}</p>
        </div>
      </aside>

      <div className="content">
        <CachedBanner />
        <main className="content__main panel">
          <Outlet />
        </main>
      </div>
      <SaveUpdatedToast />
    </div>
  );
}
