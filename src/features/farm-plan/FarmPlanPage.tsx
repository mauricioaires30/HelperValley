import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RequireSave } from '@/features/saves/RequireSave';
import { FarmOverview } from '@/features/farm/FarmOverview';
import { Planner } from '@/features/farm/Planner';
import { PondsView, ProductionView } from '@/features/farm/ProductionView';
import { AnimalsView } from '@/features/farm/AnimalsView';
import { SlimesView } from '@/features/farm/SlimesView';
import { Recommendations } from '@/features/farm/Recommendations';
import { FarmBuildings } from './Buildings';
import { PlannerCompare } from './PlannerCompare';
import '@/features/farm/farm.css';
import '@/features/shops/shops.css';

/** One Farm page, its tabs grouped: what the farm makes, the land, and building. */
const GROUPS = [
  { id: 'production', tabs: ['producing', 'animals', 'ponds', 'slimes'] },
  { id: 'land', tabs: ['crops', 'recommendations', 'plans'] },
  { id: 'build', tabs: ['buildings', 'planner'] },
] as const;
type Tab = (typeof GROUPS)[number]['tabs'][number];
const TABS: readonly string[] = GROUPS.flatMap((g) => g.tabs);

export function FarmPlanPage() {
  const { t } = useTranslation();
  const { tab } = useParams<{ tab: Tab }>();
  if (!tab || !TABS.includes(tab)) return <Navigate to="/farm/producing" replace />;
  return (
    <div className="farm">
      <nav className="tab-groups" aria-label={t('nav.farmPlan')}>
        {GROUPS.map((g) => (
          <div key={g.id} className="tab-group">
            <span className="tab-group__label">{t(`farmPlan.group.${g.id}`)}</span>
            <div className="calendar__nav">
              {g.tabs.map((id) => (
                <NavLink key={id} to={`/farm/${id}`} className={({ isActive }) => (isActive ? 'button button--primary' : 'button')}>
                  {t(`farmPlan.tab.${id}`)}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <RequireSave>
        {(save, player) => (
          <>
            {tab === 'producing' && <ProductionView save={save} />}
            {tab === 'animals' && <AnimalsView save={save} />}
            {tab === 'ponds' && <PondsView save={save} />}
            {tab === 'slimes' && <SlimesView save={save} />}
            {tab === 'crops' && <FarmOverview save={save} />}
            {tab === 'recommendations' && <Recommendations save={save} player={player} />}
            {tab === 'plans' && <Planner save={save} player={player} />}
            {tab === 'buildings' && <FarmBuildings save={save} player={player} />}
            {tab === 'planner' && <PlannerCompare save={save} />}
          </>
        )}
      </RequireSave>
    </div>
  );
}
