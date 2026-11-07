import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AchievementsPage } from '@/features/achievements/AchievementsPage';
import { WalnutsTab } from '@/features/walnuts/WalnutsTab';
import { GameCollectionTab, LettersTab, NotesTab, type GameTab } from './GameCollections';
import './collections.css';

/** Same tabs as the game's collections menu, then the bigger trackers. */
const GAME_TABS = ['shipped', 'fish', 'artifacts', 'minerals', 'cooking', 'achievements', 'letters', 'notes'] as const;
const EXTRA_TABS = ['walnuts'] as const;
type Tab = (typeof GAME_TABS)[number] | (typeof EXTRA_TABS)[number];

const isGrid = (tab: Tab): tab is GameTab => ['shipped', 'fish', 'artifacts', 'minerals', 'cooking'].includes(tab);

export function CollectionsPage() {
  const { t } = useTranslation();
  const { tab } = useParams<{ tab: Tab }>();
  const all: readonly string[] = [...GAME_TABS, ...EXTRA_TABS];
  if (!tab || !all.includes(tab)) return <Navigate to="/collections/shipped" replace />;

  const link = (id: string) => (
    <NavLink key={id} to={`/collections/${id}`} className={({ isActive }) => (isActive ? 'button button--primary' : 'button')}>
      {t(`collections.tab.${id}`)}
    </NavLink>
  );

  return (
    <div>
      <nav className="collections__tabs" aria-label={t('nav.collections')}>
        <div className="calendar__nav">{GAME_TABS.map(link)}</div>
        <div className="calendar__nav">{EXTRA_TABS.map(link)}</div>
      </nav>
      {isGrid(tab) && <GameCollectionTab tab={tab} />}
      {tab === 'achievements' && <AchievementsPage />}
      {tab === 'letters' && <LettersTab />}
      {tab === 'notes' && <NotesTab />}
      {tab === 'walnuts' && <WalnutsTab />}
    </div>
  );
}
