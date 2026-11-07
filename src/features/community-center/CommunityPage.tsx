import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RequireSave } from '@/features/saves/RequireSave';
import { MuseumPage } from '@/features/museum/MuseumPage';
import { FieldOfficeView } from '@/features/collections/FieldOffice';
import { CommunityCenterPage, JojaView } from './CommunityCenterPage';
import '@/features/collections/collections.css';

/** Donation projects in their own tab: Community Center (or Joja), museum and the island field office. */
const TABS = ['cc', 'joja', 'museum', 'island'] as const;
type Tab = (typeof TABS)[number];

export function CommunityPage() {
  const { t } = useTranslation();
  const { tab } = useParams<{ tab: Tab }>();
  if (!tab || !(TABS as readonly string[]).includes(tab)) return <Navigate to="/community/cc" replace />;

  return (
    <div>
      <nav className="collections__tabs" aria-label={t('nav.community')}>
        <div className="calendar__nav">
          {TABS.map((id) => (
            <NavLink key={id} to={`/community/${id}`} className={({ isActive }) => (isActive ? 'button button--primary' : 'button')}>
              {t(`community.tab.${id}`)}
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
