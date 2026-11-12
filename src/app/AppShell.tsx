import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '@/i18n';
import { ItemIcon, Sprite, UiIcon } from '@/ui';
import { SaveUpdatedToast } from '@/features/saves/LiveStatus';
import { SaveCard } from '@/features/saves/SaveCard';
import { Search } from '@/features/search/Search';
import { useSaveNotifications } from '@/features/saves/Notifications';
import { ThemeToggle } from './ThemeToggle';
import { ShareChip } from '@/features/share/SharePanel';
import { LiveBadge } from '@/features/share/LiveBadge';
import { useShareStore } from '@/features/share/room';
import { CursorLayer, PresenceSync } from '@/features/share/Presence';
import { useSaveStore } from '@/store/saveStore';
import './shell.css';

/** Menu icon: a game item, or a UI crop from public/sprites/ui. */
type NavIcon =
  | { item: string }
  | { ui: string; w: number; h: number; scale: number; className?: string }
  | { sheet: string; x: number; y: number; w: number; h: number; scale: number };

const NAV: Array<{ to: string; key: string; icon: NavIcon }> = [
  { to: '/player', key: 'player', icon: { sheet: 'Characters/Farmer/hats', x: 2, y: 3, w: 16, h: 14, scale: 2 } },
  { to: '/calendar', key: 'calendar', icon: { ui: 'nav-calendar', w: 14, h: 12, scale: 2 } },
  { to: '/relationships', key: 'relationships', icon: { ui: 'heart-full', w: 7, h: 6, scale: 4 } },
  { to: '/map', key: 'map', icon: { item: '(O)102' } },
  { to: '/quests', key: 'quests', icon: { item: '(O)842' } },
  { to: '/shops', key: 'shops', icon: { item: '(O)472' } },
  { to: '/farm', key: 'farmPlan', icon: { sheet: 'Buildings/Big Barn', x: 0, y: 0, w: 112, h: 112, scale: 0.3 } },
  { to: '/community', key: 'community', icon: { item: '(O)96' } },
  { to: '/collections', key: 'collections', icon: { ui: 'junimo', w: 16, h: 16, scale: 2, className: 'nav-junimo' } },
];

function NavIconView({ icon }: { icon: NavIcon }) {
  if ('sheet' in icon) {
    return (
      <span className="nav-icon">
        <Sprite sheet={icon.sheet} x={icon.x} y={icon.y} w={icon.w} h={icon.h} scale={icon.scale} />
      </span>
    );
  }
  if ('item' in icon) {
    // ItemIcon fits every item in a 32px box.
    return (
      <span className="nav-icon">
        <ItemIcon id={icon.item} scale={2} tooltip={false} />
      </span>
    );
  }
  return (
    <span className={`nav-icon ${icon.className ?? ''}`}>
      <UiIcon name={icon.ui} w={icon.w} h={icon.h} scale={icon.scale} />
    </span>
  );
}

/** Fixed sidebar (brand, save, player, menu, language) and the page using the rest of the screen. */
export function AppShell() {
  const { t, i18n } = useTranslation();
  useSaveNotifications();
  const hasSave = useSaveStore((s) => !!s.save);
  const initialized = useSaveStore((s) => s.initialized);
  const inRoom = useShareStore((s) => !!s.role);
  // Waiting for the click that restores the folder: stay on this page, it loads right after.
  const reconnecting = useSaveStore((s) => !!s.pendingHandle);
  const { pathname } = useLocation();
  // Without a save every other page is empty: only the Saves page is available.
  if (initialized && !hasSave && !inRoom && !reconnecting && pathname !== '/' && pathname !== '/kit') return <Navigate to="/" replace />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <ItemIcon id="(O)24" scale={2} tooltip={false} />
          <h1>{t('app.title')}</h1>
        </div>

        <SaveCard />
        {hasSave && <Search />}

        {hasSave && (
          <nav className="sidebar__nav" aria-label="Main">
            <ul className="side-tabs">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} end={item.to === '/'} className="side-tab">
                    <NavIconView icon={item.icon} />
                    <span>{t(`nav.${item.key}`)}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="sidebar__footer">
          <p className="sidebar__disclaimer">{t('app.disclaimer')}</p>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <LiveBadge />
          <ShareChip />
          <span className="topbar__spacer" />
          <label className="topbar__select box">
            <span className="visually-hidden">{t('common.language')}</span>
            <select value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <ThemeToggle />
        </header>
        <main className="content__main panel">
          <Outlet />
        </main>
      </div>
      <SaveUpdatedToast />
      <PresenceSync />
      <CursorLayer />
    </div>
  );
}
