import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CommunityCenterPage } from '@/features/community-center/CommunityCenterPage';
import { MuseumPage } from '@/features/museum/MuseumPage';
import { FieldOfficeView } from './FieldOffice';

const TABS = ['cc', 'museum', 'island'] as const;
type Tab = (typeof TABS)[number];

/** Community Center, Museum and the island Field Office under one tab bar. */
export function CollectionsPage() {
  const { t } = useTranslation();
  const { tab } = useParams<{ tab: Tab }>();
  if (!tab || !TABS.includes(tab)) return <Navigate to="/collections/cc" replace />;

  return (
    <div>
      <nav className="calendar__nav collections__tabs" aria-label={t('nav.collections')}>
        {TABS.map((id) => (
          <NavLink key={id} to={`/collections/${id}`} className={({ isActive }) => (isActive ? 'button button--primary' : 'button')}>
            {t(`collections.tab.${id}`)}
          </NavLink>
        ))}
      </nav>
      {tab === 'cc' && <CommunityCenterPage />}
      {tab === 'museum' && <MuseumPage />}
      {tab === 'island' && <FieldOfficeView />}
    </div>
  );
}
