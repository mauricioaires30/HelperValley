import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import type { FarmArea, SaveData } from '@/save/model';
import { ItemIcon, Tooltip } from '@/ui';
import { addDays } from '@/features/calendar/calendar';

const SILO_CAPACITY = 240;
const HAY_PRICE = 50;

/** Planted crops grouped by what they'll produce, soonest harvest first. */
function cropGroups(area: FarmArea) {
  const groups = new Map<string, { harvest: string; count: number; ready: number; dead: number; nextIn: number }>();
  for (const c of area.crops) {
    const g = groups.get(c.harvest) ?? { harvest: c.harvest, count: 0, ready: 0, dead: 0, nextIn: Infinity };
    g.count++;
    if (c.dead) g.dead++;
    else if (c.daysToHarvest === 0) g.ready++;
    else g.nextIn = Math.min(g.nextIn, c.daysToHarvest);
    groups.set(c.harvest, g);
  }
  return [...groups.values()].sort((a, b) => b.ready - a.ready || a.nextIn - b.nextIn);
}

/** Fruit trees by kind: how many, fruit hanging now, and the youngest still growing. */
function FruitTrees({ area }: { area: FarmArea }) {
  const { t } = useTranslation();
  const fruitOf = (sapling: string) => gameData().farm.fruitTrees.find((x) => x.sapling === sapling)?.fruit ?? sapling;
  const kinds = new Map<string, { count: number; fruits: number; growing: number; minDays: number }>();
  for (const tree of area.trees) {
    const k = kinds.get(tree.sapling) ?? { count: 0, fruits: 0, growing: 0, minDays: Infinity };
    k.count++;
    k.fruits += tree.fruits;
    if (tree.daysToMature > 0) {
      k.growing++;
      k.minDays = Math.min(k.minDays, tree.daysToMature);
    }
    kinds.set(tree.sapling, k);
  }
  return (
    <div>
      <h4 className="farm-subtitle">{t('farm.trees', { count: area.trees.length })}</h4>
      <div className="slot-grid">
        {[...kinds].map(([sapling, k]) => (
          <Tooltip
            key={sapling}
            text={
              <span className="slot-tooltip">
                <span>{t('farm.treeCount', { count: k.count })}</span>
                {k.fruits > 0 && <span>{t('farm.treeFruits', { count: k.fruits })}</span>}
                {k.growing > 0 && <span>{t('farm.treeGrowing', { count: k.growing, days: k.minDays })}</span>}
              </span>
            }
          >
            <span className={k.fruits ? 'slot-state slot-state--ready' : 'slot-state'}>
              <ItemIcon id={fruitOf(sapling)} slot count={k.count} tooltip={false} />
              <span className="farm-days">{k.fruits ? `+${k.fruits}` : k.growing ? `${k.minDays}d` : '—'}</span>
            </span>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function AreaCard({ area }: { area: FarmArea }) {
  const { t } = useTranslation();
  const groups = cropGroups(area);
  const empty = area.tilled + area.pots - area.crops.length;
  const coverage = area.tilled ? Math.min(100, Math.round((area.sprinklerTiles / area.tilled) * 100)) : 0;
  return (
    <section className="box farm-area">
      <h3>{t(`farm.area.${area.location}`)}</h3>
      <ul className="farm-facts">
        <li>{t('farm.tilled', { count: area.tilled })}</li>
        {area.pots > 0 && <li>{t('farm.pots', { count: area.pots })}</li>}
        <li>{t('farm.planted', { count: area.crops.length, empty: Math.max(0, empty) })}</li>
        {area.tilled > 0 && <li>{t('farm.sprinklers', { tiles: area.sprinklerTiles, percent: coverage })}</li>}
        {area.beeHouses > 0 && <li>{t('farm.beeHouses', { count: area.beeHouses })}</li>}
        {Object.entries(area.machines).map(([m, n]) => (
          <li key={m}>{t(`farm.machine.${m}`, { count: n })}</li>
        ))}
      </ul>
      {groups.length > 0 && (
        <div className="slot-grid">
          {groups.map((g) => (
            <Tooltip
              key={g.harvest}
              text={
                g.ready
                  ? t('farm.readyNow', { count: g.ready })
                  : g.nextIn === Infinity
                    ? t('farm.dead', { count: g.dead })
                    : t('farm.readyIn', { count: g.nextIn })
              }
            >
              <span className={g.ready ? 'slot-state slot-state--ready' : 'slot-state'}>
                <ItemIcon id={g.harvest} slot count={g.count} tooltip={false} />
                <span className="farm-days">{g.ready ? '✓' : g.nextIn === Infinity ? '✗' : `${g.nextIn}d`}</span>
              </span>
            </Tooltip>
          ))}
        </div>
      )}
      {area.trees.length > 0 && <FruitTrees area={area} />}
    </section>
  );
}

/** Hay in the silos and when to buy more (animals eat 1 a day when they can't graze). */
export function HayCard({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const { farm, date } = save;
  const perDay = farm.animals.length;
  const capacity = farm.silos * SILO_CAPACITY;
  const toFill = Math.max(0, capacity - farm.hay);
  const stockDays = perDay ? Math.floor(farm.hay / perDay) : 0;
  const fullDays = perDay ? Math.floor(capacity / perDay) : 0;
  const when = (days: number) => {
    const d = addDays(date, days);
    return t('saves.day', { day: d.day, season: t(`common.seasons.${d.season}`), year: d.year });
  };
  if (!perDay && !farm.silos) return null;

  return (
    <section className="box farm-area">
      <h3>
        <ItemIcon id="(O)178" tooltip={false} /> {t('farm.hayShort', { hay: farm.hay.toLocaleString(), capacity: capacity.toLocaleString(), days: perDay ? stockDays : '∞' })}
      </h3>
      <ul className="farm-facts">
        {perDay > 0 && <li className={stockDays < 7 ? 'farm-warn' : undefined}>{t('farm.hayStock', { perDay, days: stockDays, date: when(stockDays) })}</li>}
        {toFill > 0 && <li>{t('farm.hayFill', { count: toFill.toLocaleString(), cost: (toFill * HAY_PRICE).toLocaleString() })}</li>}
        {capacity > 0 && perDay > 0 && <li>{t('farm.hayCycle', { days: fullDays, date: when(fullDays) })}</li>}
      </ul>
    </section>
  );
}

/** What the save says about the farm right now. */
export function FarmOverview({ save }: { save: SaveData }) {
  return (
    <div className="farm-grid">
      {save.farm.areas
        .filter((a) => a.tilled + a.pots + a.trees.length > 0)
        .map((area) => (
          <AreaCard key={area.location} area={area} />
        ))}
    </div>
  );
}
