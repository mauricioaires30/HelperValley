import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { FarmArea, SaveData } from '@/save/model';
import { ItemIcon, Tooltip } from '@/ui';
import { DAYS_IN_SEASON } from './profit';

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
    </section>
  );
}

function AnimalsCard({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const name = useGameName();
  const { animals } = gameData().farm;
  const { farm, date } = save;
  const byType = new Map<string, number>();
  for (const a of farm.animals) byType.set(a.type, (byType.get(a.type) ?? 0) + 1);

  // Every animal eats one hay a day when it can't graze (always in winter).
  const perDay = farm.animals.length;
  const capacity = farm.silos * SILO_CAPACITY;
  const daysOfHay = perDay ? Math.floor(farm.hay / perDay) : Infinity;
  const winterDaysLeft = date.season === 'winter' ? DAYS_IN_SEASON - date.day + 1 : DAYS_IN_SEASON;
  const needWinter = Math.max(0, perDay * winterDaysLeft - farm.hay);
  const toFill = Math.max(0, capacity - farm.hay);

  return (
    <section className="box farm-area">
      <h3>{t('farm.animalsTitle', { count: farm.animals.length })}</h3>
      <div className="farm-animals">
        {[...byType].map(([type, count]) => (
          <span key={type} className="farm-animal inset">
            {animals[type]?.produce[0] && <ItemIcon id={animals[type].produce[0]} tooltip={false} />}
            {name(animals[type]?.n) || type} ×{count}
          </span>
        ))}
      </div>
      <ul className="farm-facts">
        <li>
          <ItemIcon id="(O)178" tooltip={false} /> {t('farm.hay', { hay: farm.hay.toLocaleString(), capacity: capacity.toLocaleString(), silos: farm.silos })}
        </li>
        {perDay > 0 && <li>{t('farm.hayDays', { perDay, days: daysOfHay === Infinity ? '∞' : daysOfHay })}</li>}
        {perDay > 0 && needWinter > 0 && (
          <li className="farm-warn">
            {t('farm.hayWinter', { count: needWinter.toLocaleString(), cost: (needWinter * HAY_PRICE).toLocaleString() })}
          </li>
        )}
        {toFill > 0 && <li>{t('farm.hayFill', { count: toFill.toLocaleString(), cost: (toFill * HAY_PRICE).toLocaleString() })}</li>}
      </ul>
    </section>
  );
}

/** What the save says about the farm right now. */
export function FarmOverview({ save }: { save: SaveData }) {
  return (
    <div className="farm-grid">
      {save.farm.areas
        .filter((a) => a.tilled + a.pots > 0)
        .map((area) => (
          <AreaCard key={area.location} area={area} />
        ))}
      <AnimalsCard save={save} />
    </div>
  );
}
