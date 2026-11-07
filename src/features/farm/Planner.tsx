import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData, getItem, type Season } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { ItemIcon } from '@/ui';
import { cheapestSource, cropOptions, DAYS_IN_SEASON, type CropOption } from './profit';
import { AREAS, newRowId, usePlans, type AreaId, type FarmPlans } from './plans';
import { SourceLabel, useDefaultOptions } from './Recommendations';

const HAY_PRICE = 50;
const SILO_CAPACITY = 240;

/** Profit options per seed for an area, keyed by seed id. */
function useOptionsByArea(save: SaveData, player: Player) {
  const defaults = useDefaultOptions(player);
  return useMemo(() => {
    const out = {} as Record<AreaId, Record<string, CropOption>>;
    for (const area of AREAS) {
      const indoor = area !== 'Farm';
      const options = cropOptions({
        ...defaults,
        season: indoor ? 'any' : save.date.season,
        days: indoor ? DAYS_IN_SEASON : DAYS_IN_SEASON - save.date.day,
        includeUnbuyable: true,
      });
      out[area] = Object.fromEntries(options.map((o) => [o.crop.seed, o]));
    }
    return out;
  }, [defaults, save.date]);
}

/** Crops that can be planted in an area (season-locked outdoors). */
function plantable(area: AreaId, season: Season) {
  return gameData().farm.crops.filter((c) => getItem(c.harvest) && (area !== 'Farm' || c.seasons.includes(season)));
}

function AreaPlanner({
  area,
  save,
  plans,
  update,
  options,
}: {
  area: AreaId;
  save: SaveData;
  plans: FarmPlans;
  update: ReturnType<typeof usePlans>['update'];
  options: Record<string, CropOption>;
}) {
  const { t } = useTranslation();
  const name = useGameName();
  const farmArea = save.farm.areas.find((a) => a.location === area);
  const fromSave = (farmArea?.tilled ?? 0) + (farmArea?.pots ?? 0);
  const plan = plans[area];
  const total = plan.total ?? fromSave;
  const used = plan.rows.reduce((n, r) => n + r.tiles, 0);
  // Most profitable first, so a new row starts with the best choice.
  const crops = plantable(area, save.date.season).sort(
    (x, y) => (options[y.seed]?.perDayBest ?? -Infinity) - (options[x.seed]?.perDayBest ?? -Infinity),
  );
  const profit = plan.rows.reduce((n, r) => n + (options[r.seed]?.profitBest ?? 0) * r.tiles, 0);

  return (
    <section className="box farm-plan">
      <header className="farm-plan__header">
        <h3>{t(`farm.area.${area}`)}</h3>
        <label>
          {t('farm.planTotal')}{' '}
          <input
            type="number"
            min={0}
            value={total}
            onChange={(e) => update(area, (p) => ({ ...p, total: Math.max(0, Number(e.target.value) || 0) }))}
          />
        </label>
        {plan.total !== null && plan.total !== fromSave && (
          <button className="button" onClick={() => update(area, (p) => ({ ...p, total: null }))}>
            {t('farm.useSave', { count: fromSave })}
          </button>
        )}
        <span className={used > total ? 'farm-warn' : 'cc-summary__hint'}>{t('farm.planFree', { free: total - used, total })}</span>
      </header>

      <table className="farm-table">
        <tbody>
          {plan.rows.map((row) => {
            const o = options[row.seed];
            return (
              <tr key={row.id}>
                <td>
                  <span className="farm-crop">
                    <ItemIcon id={gameData().farm.crops.find((c) => c.seed === row.seed)?.harvest ?? row.seed} tooltip={false} />
                    <select
                      value={row.seed}
                      onChange={(e) => update(area, (p) => ({ ...p, rows: p.rows.map((r) => (r.id === row.id ? { ...r, seed: e.target.value } : r)) }))}
                    >
                      {crops.map((c) => (
                        <option key={c.seed} value={c.seed}>
                          {name(getItem(c.harvest)?.n)}
                        </option>
                      ))}
                    </select>
                  </span>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={row.tiles}
                    aria-label={t('farm.tiles')}
                    onChange={(e) =>
                      update(area, (p) => ({ ...p, rows: p.rows.map((r) => (r.id === row.id ? { ...r, tiles: Math.max(0, Number(e.target.value) || 0) } : r)) }))
                    }
                  />{' '}
                  {t('farm.tiles')}
                </td>
                <td>
                  <input
                    className="farm-note"
                    placeholder={t('farm.notePlaceholder')}
                    value={row.note}
                    onChange={(e) => update(area, (p) => ({ ...p, rows: p.rows.map((r) => (r.id === row.id ? { ...r, note: e.target.value } : r)) }))}
                  />
                </td>
                <td className="num">{o ? `${Math.round(o.profitBest * row.tiles).toLocaleString()}g` : '—'}</td>
                <td>
                  <button
                    className="button"
                    aria-label={t('farm.remove')}
                    onClick={() => update(area, (p) => ({ ...p, rows: p.rows.filter((r) => r.id !== row.id) }))}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="farm-plan__footer">
        <button
          className="button"
          disabled={crops.length === 0}
          onClick={() =>
            update(area, (p) => ({ ...p, rows: [...p.rows, { id: newRowId(), seed: crops[0].seed, tiles: Math.max(0, total - used), note: '' }] }))
          }
        >
          + {t('farm.addRow')}
        </button>
        {plan.rows.length > 0 && <strong>{t('farm.planProfit', { profit: Math.round(profit).toLocaleString() })}</strong>}
      </div>
    </section>
  );
}

/** Seeds to buy for every planned row this season, plus hay for the animals. */
function ShoppingList({ save, plans }: { save: SaveData; plans: FarmPlans }) {
  const { t } = useTranslation();
  const name = useGameName();
  const lines = new Map<string, { seed: string; count: number }>();
  for (const area of AREAS) {
    for (const row of plans[area].rows) {
      const line = lines.get(row.seed) ?? { seed: row.seed, count: 0 };
      line.count += row.tiles;
      lines.set(row.seed, line);
    }
  }
  const { farm } = save;
  const hayToFill = Math.max(0, farm.silos * SILO_CAPACITY - farm.hay);
  let total = 0;

  return (
    <section className="box farm-plan">
      <h3>{t('farm.shoppingTitle')}</h3>
      <p className="cc-summary__hint">{t('farm.shoppingHint')}</p>
      <table className="farm-table">
        <tbody>
          {[...lines.values()].map((line) => {
            const crop = gameData().farm.crops.find((c) => c.seed === line.seed);
            const source = crop ? cheapestSource(crop.sources, save.date.season) ?? cheapestSource(crop.sources, 'any') : null;
            const cost = source?.price ? source.price * line.count : 0;
            total += cost;
            return (
              <tr key={line.seed}>
                <td>
                  <span className="farm-crop">
                    <ItemIcon id={line.seed} tooltip={false} />
                    {name(getItem(line.seed)?.n)} ×{line.count}
                  </span>
                </td>
                <td>{crop && <SourceLabel source={source ?? crop.sources.find((s) => s.trade || s.random) ?? null} seed={line.seed} />}</td>
                <td className="num">{cost ? `${cost.toLocaleString()}g` : '—'}</td>
              </tr>
            );
          })}
          {farm.animals.length > 0 && hayToFill > 0 && (
            <tr>
              <td>
                <span className="farm-crop">
                  <ItemIcon id="(O)178" tooltip={false} />
                  {name(getItem('(O)178')?.n)} ×{hayToFill}
                </span>
              </td>
              <td>
                <span className="farm-source">{t('farm.shop.AnimalShop')} · 50g</span>
              </td>
              <td className="num">{(hayToFill * HAY_PRICE).toLocaleString()}g</td>
            </tr>
          )}
        </tbody>
      </table>
      {lines.size === 0 && <p>{t('farm.shoppingEmpty')}</p>}
      {total > 0 && <strong>{t('farm.shoppingTotal', { total: (total + (farm.animals.length ? hayToFill * HAY_PRICE : 0)).toLocaleString() })}</strong>}
    </section>
  );
}

/** Saved plans per area ("10 tiles of Fairy Rose for honey...") and the shopping list. */
export function Planner({ save, player }: { save: SaveData; player: Player }) {
  const { plans, update } = usePlans(save.uniqueId);
  const options = useOptionsByArea(save, player);
  return (
    <div className="farm-grid farm-grid--wide">
      {AREAS.map((area) => (
        <AreaPlanner key={area} area={area} save={save} plans={plans} update={update} options={options[area]} />
      ))}
      <ShoppingList save={save} plans={plans} />
    </div>
  );
}
