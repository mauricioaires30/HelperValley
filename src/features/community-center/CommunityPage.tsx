import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RequireSave } from '@/features/saves/RequireSave';
import { MuseumPage } from '@/features/museum/MuseumPage';
import { FieldOfficeView } from '@/features/collections/FieldOffice';
import { CommunityCenterPage, JojaView } from './CommunityCenterPage';
import { useCurrentSave } from '@/store/saveStore';
import { ccIsWarehouse, jojaMartGone } from '@/features/shops/catalog';
import '@/features/collections/collections.css';
import { PresenceDots } from '@/features/share/Presence';

/** Donation projects in their own tab: Community Center (or Joja), museum and the island field office. */
const TABS = ['cc', 'joja', 'museum', 'island'] as const;
type Tab = (typeof TABS)[number];

export function CommunityPage() {
  const { t } = useTranslation();
  const { tab } = useParams<{ tab: Tab }>();
  const { save } = useCurrentSave();
  // Tabs for places that no longer exist in this save go away: Joja once it's the movie theater,
  // the Community Center once it's a Joja warehouse.
  const tabs = TABS.filter((id) => !save || (id === 'joja' ? !jojaMartGone(save) : id === 'cc' ? !ccIsWarehouse(save) : true));
  if (!tab || !(tabs as readonly string[]).includes(tab)) return <Navigate to={`/community/${tabs[0]}`} replace />;

  return (
    <div>
      <nav className="collections__tabs" aria-label={t('nav.community')}>
        <div className="calendar__nav">
          {tabs.map((id) => (
            <NavLink key={id} to={`/community/${id}`} className={({ isActive }) => (isActive ? 'button button--primary' : 'button')}>
              {t(`community.tab.${id}`)}
              <PresenceDots to={`/community/${id}`} exact />
            </NavLink>
          ))}
        </div>
      </nav>
      {tab === 'cc' && <CommunityCenterPage />}
      {tab === 'joja' && <RequireSave>{(save) => <JojaView save={save} />}</RequireSave>}
      {tab === 'museum' && <MuseumPage />}
      {tab === 'island' && <FieldOfficeView />}
    </div>
  );
}
