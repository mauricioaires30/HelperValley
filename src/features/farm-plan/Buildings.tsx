import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { buildingRect, Materials, Picture, type BuildingData } from '@/features/shops/Constructions';
import { useLocationName } from '@/features/fish/FishInfo';

/** Farmhouse upgrades from Robin (FarmHouse upgrade levels 1-3). */
const HOUSE_UPGRADES: Array<{ level: number; price: number; materials: Array<[string, number]> }> = [
  { level: 1, price: 10000, materials: [['(O)388', 450]] },
  { level: 2, price: 65000, materials: [['(O)709', 100]] },
  { level: 3, price: 100000, materials: [] },
];

function BuildingCard({ b, title, extra }: { b: BuildingData; title?: string; extra?: string }) {
  const { t } = useTranslation();
  const name = useGameName();
  return (
    <article className="build-card inset" title={extra}>
      <Picture sheet={b.texture} rect={buildingRect(b)} />
      <div className="build-card__body">
        <strong>{title ?? name(b.n)}</strong>
        <span className="build-card__price">{b.cost.toLocaleString()}g</span>
        {b.materials.length > 0 && <Materials list={b.materials} />}
        <small>{b.days > 0 ? t('shops.build.days', { count: b.days }) : t('shops.build.instant')}</small>
      </div>
    </article>
  );
}

/** What's on the farm, what's being built, and what Robin and the Wizard can still do. */
export function FarmBuildings({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const place = useLocationName();
  const all = (gameData().shops as { buildings: BuildingData[] }).buildings;
  const byId = new Map(all.map((b) => [b.id, b]));
  const built = save.farm.buildings.filter((b) => byId.has(b.type) || b.type === 'Farmhouse');

  // Built, grouped by type.
  const counts = new Map<string, number>();
  for (const b of built) if (byId.has(b.type)) counts.set(b.type, (counts.get(b.type) ?? 0) + 1);
  const inProgress = built.filter((b) => b.building > 0 || b.upgrading > 0);

  // Next upgrade for each built building that has one (Coop → Big Coop → Deluxe Coop...).
  const upgrades = [...counts].flatMap(([type, n]) => all.filter((b) => b.upgradeOf === type).map((next) => ({ next, from: type, n })));
  // Never built, from either builder (base buildings, not upgrades).
  const missingRobin = all.filter((b) => b.builder === 'Robin' && !b.upgradeOf && !counts.has(b.id) && !isUpgradeBuilt(b.id, counts, all));
  const missingWizard = all.filter((b) => b.builder === 'Wizard' && !counts.has(b.id));

  const house = player.houseUpgradeLevel;
  const nextHouse = HOUSE_UPGRADES.find((u) => u.level === house + 1);

  return (
    <div className="farm-buildings">
      <section className="shop__group">
        <h3 className="shop__group-title">{t('farmPlan.house')}</h3>
        <div className="build-grid">
          <article className="build-card inset">
            {/* Buildings/houses stacks the farmhouse levels 0, 1 and 2+ in 144px rows. */}
            <Picture sheet="Buildings/houses" rect={[0, Math.min(house, 2) * 144, 160, 144]} />
            <div className="build-card__body">
              <strong>{t('farmPlan.houseLevel', { level: house })}</strong>
              {player.daysUntilHouseUpgrade > 0 && <small>{t('farmPlan.houseUpgrading', { count: player.daysUntilHouseUpgrade })}</small>}
              {nextHouse ? (
                <>
                  <span>{t(`farmPlan.houseNext.${nextHouse.level}`)}</span>
                  <span className="build-card__price">{nextHouse.price.toLocaleString()}g</span>
                  {nextHouse.materials.length > 0 && <Materials list={nextHouse.materials} />}
                </>
              ) : (
                <span>{t('farmPlan.houseMax')}</span>
              )}
            </div>
          </article>
        </div>
      </section>

      {inProgress.length > 0 && (
        <section className="shop__group">
          <h3 className="shop__group-title">{t('farmPlan.inProgress')}</h3>
          <ul className="shop__items dashed-list">
            {inProgress.map((b, i) => (
              <li key={i}>
                {name(byId.get(b.type)?.n) || b.type} · {b.building > 0 ? t('farmPlan.daysBuild', { count: b.building }) : t('farmPlan.daysUpgrade', { count: b.upgrading })}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="shop__group">
        <h3 className="shop__group-title">{t('farmPlan.built', { count: [...counts.values()].reduce((a, b) => a + b, 0) })}</h3>
        <div className="build-grid">
          {[...counts].map(([type, n]) => {
            const b = byId.get(type)!;
            const where = [...new Set(built.filter((x) => x.type === type).map((x) => x.location))];
            return (
              <article key={type} className="build-card inset" title={name(b.d)}>
                <Picture sheet={b.texture} rect={buildingRect(b)} />
                <div className="build-card__body">
                  <strong>
                    {name(b.n)} ×{n}
                  </strong>
                  <small>{where.map((w) => place(w)).join(', ')}</small>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {upgrades.length > 0 && (
        <section className="shop__group">
          <h3 className="shop__group-title">{t('farmPlan.upgrades', { count: upgrades.length })}</h3>
          <div className="build-grid">
            {upgrades.map(({ next, from, n }) => (
              <BuildingCard key={next.id} b={next} extra={t('farmPlan.upgradeFrom', { count: n, name: name(byId.get(from)?.n) })} />
            ))}
          </div>
        </section>
      )}

      <section className="shop__group">
        <h3 className="shop__group-title">{t('farmPlan.missingRobin', { count: missingRobin.length })}</h3>
        {missingRobin.length === 0 ? (
          <p className="cc-summary__hint">{t('farmPlan.allBuilt')}</p>
        ) : (
          <div className="build-grid">
            {missingRobin.map((b) => (
              <BuildingCard key={b.id} b={b} extra={name(b.d)} />
            ))}
          </div>
        )}
      </section>

      <section className="shop__group">
        <h3 className="shop__group-title">{t('farmPlan.wizard', { count: missingWizard.length })}</h3>
        <div className="build-grid">
          {missingWizard.map((b) => (
            <BuildingCard key={b.id} b={b} extra={name(b.d)} />
          ))}
        </div>
      </section>
    </div>
  );
}

/** A base building counts as built when one of its upgrades is (a Deluxe Coop means you had a Coop). */
function isUpgradeBuilt(id: string, counts: Map<string, number>, all: BuildingData[]): boolean {
  return all.some((b) => b.upgradeOf === id && (counts.has(b.id) || isUpgradeBuilt(b.id, counts, all)));
}
