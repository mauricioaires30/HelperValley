import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RequireSave } from '@/features/saves/RequireSave';
import { FarmOverview } from '@/features/farm/FarmOverview';
import { Planner } from '@/features/farm/Planner';
import { FarmBuildings } from './Buildings';
import '@/features/farm/farm.css';
import '@/features/shops/shops.css';

const TABS = ['buildings', 'crops', 'plans', 'planner'] as const;
type Tab = (typeof TABS)[number];

/** The farm itself: buildings, what's planted, saved plans and (later) Stardew Planner imports. */
export function FarmPlanPage() {
  const { t } = useTranslation();
  const { tab } = useParams<{ tab: Tab }>();
  if (!tab || !(TABS as readonly string[]).includes(tab)) return <Navigate to="/farm/buildings" replace />;
  return (
    <div className="farm">
      <nav className="calendar__nav" aria-label={t('nav.farm')}>
        {TABS.map((id) => (
          <NavLink key={id} to={`/farm/${id}`} className={({ isActive }) => (isActive ? 'button button--primary' : 'button')}>
            {t(`farmPlan.tab.${id}`)}
          </NavLink>
        ))}
      </nav>
      <RequireSave>
        {(save, player) => (
          <>
            {tab === 'buildings' && <FarmBuildings save={save} player={player} />}
            {tab === 'crops' && <FarmOverview save={save} />}
            {tab === 'plans' && <Planner save={save} player={player} />}
            {tab === 'planner' && (
              <section className="box farm-planner-soon">
                <h3>{t('farmPlan.plannerTitle')}</h3>
                <p>{t('farmPlan.plannerSoon')}</p>
              </section>
            )}
          </>
        )}
      </RequireSave>
    </div>
  );
}
