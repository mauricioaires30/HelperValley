import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getItem, type ItemSource, type Season } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { ItemIcon, SeasonIcon, Tooltip } from '@/ui';
import { SEASONS } from '@/features/calendar/calendar';
import { cropOptions, DAYS_IN_SEASON, FERTILIZERS, type CropOption, type Fertilizer, type PlanOptions } from './profit';
import type { AreaId } from './plans';

/** Profession ids from the save (Farmer.professions). */
const TILLER = 1;
const ARTISAN = 4;
const AGRICULTURIST = 5;

/** Where a seed comes from, short: "Pierre 20g", "trade 1× Taro Tuber"... */
export function SourceLabel({ source, seed }: { source: ItemSource | null; seed: string }) {
  const { t } = useTranslation();
  const name = useGameName();
  if (!source) return <span className="farm-source farm-source--none">{t(`farm.unbuyable.${seed}`, { defaultValue: t('farm.unbuyable.default') })}</span>;
  const shop = t(`farm.shop.${source.shop}`, { defaultValue: source.shop });
  if (source.trade) return <span className="farm-source">{t('farm.trade', { shop, count: source.trade[1], item: name(getItem(source.trade[0])?.n) })}</span>;
  if (source.random) return <span className="farm-source">{t('farm.random', { shop })}</span>;
  return (
    <span className="farm-source">
      {shop} · {source.price?.toLocaleString()}
      {source.currency === 1 ? ` ${t('farm.starTokens')}` : 'g'}
    </span>
  );
}

/** Options from the player's professions and level, editable on the page. */
export function useDefaultOptions(player: Player): Omit<PlanOptions, 'season' | 'days'> {
  return useMemo(
    () => ({
      fertilizer: 'none',
      agriculturist: player.professions.includes(AGRICULTURIST),
      tiller: player.professions.includes(TILLER),
      artisan: player.professions.includes(ARTISAN),
      farmingLevel: player.skills.farming,
      includeUnbuyable: true,
    }),
    [player],
  );
}

function OptionRow({ row, mode }: { row: CropOption; mode: 'raw' | 'best' }) {
  const { t } = useTranslation();
  const name = useGameName();
  const item = getItem(row.crop.harvest);
  const profit = mode === 'raw' ? row.profitRaw : row.profitBest;
  const perDay = mode === 'raw' ? row.perDayRaw : row.perDayBest;
  return (
    <tr>
      <td>
        <span className="farm-crop">
          <ItemIcon id={row.crop.harvest} tooltip={false} />
          <span>
            <strong>{name(item?.n)}</strong>
            <span className="farm-tags">
              {row.crop.regrow > 0 && <span className="farm-tag">{t('farm.regrows', { count: row.crop.regrow })}</span>}
              {row.crop.trellis && <span className="farm-tag">{t('farm.trellis')}</span>}
              {row.crop.paddy && <span className="farm-tag">{t('farm.paddy')}</span>}
              {row.isFlower && <span className="farm-tag farm-tag--honey">{t('farm.honey', { price: row.honeyPrice })}</span>}
            </span>
          </span>
        </span>
      </td>
      <td>
        <span className="farm-crop">
          <ItemIcon id={row.crop.seed} />
          {/* No gold price: show the trade or random stock instead, if any. */}
          <SourceLabel source={row.seedSource ?? row.crop.sources[0] ?? null} seed={row.crop.seed} />
        </span>
      </td>
      <td className="num">{t('farm.daysShort', { count: row.growDays })}</td>
      <td className="num">{row.harvests}×</td>
      <td className="num">
        <Tooltip text={t(`farm.method.${mode === 'raw' ? 'raw' : row.best.method}`, { price: mode === 'raw' ? row.rawPrice : row.best.price })}>
          <span>{(mode === 'raw' ? row.rawPrice : row.best.price).toLocaleString()}g</span>
        </Tooltip>
      </td>
      <td className="num">
        <strong>{profit.toLocaleString()}g</strong>
      </td>
      <td className="num">{Math.round(perDay).toLocaleString()}g</td>
    </tr>
  );
}

/** Best crops to plant for an area, ranked by profit per tile per day. */
export function Recommendations({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const defaults = useDefaultOptions(player);
  const [area, setArea] = useState<AreaId>('Farm');
  const [season, setSeason] = useState<Season>(save.date.season);
  const [fertilizer, setFertilizer] = useState<Fertilizer>(defaults.fertilizer);
  const [includeUnbuyable, setIncludeUnbuyable] = useState(true);
  const [mode, setMode] = useState<'raw' | 'best'>('best');
  const [onlyFlowers, setOnlyFlowers] = useState(false);

  const indoor = area !== 'Farm';
  // Planting today in the current season leaves the rest of it; other seasons start fresh.
  const days = indoor || season !== save.date.season ? DAYS_IN_SEASON : DAYS_IN_SEASON - save.date.day;
  const rows = useMemo(
    () => cropOptions({ ...defaults, season: indoor ? 'any' : season, days, fertilizer, includeUnbuyable }),
    [defaults, indoor, season, days, fertilizer, includeUnbuyable],
  );
  const sorted = [...rows]
    .filter((r) => !onlyFlowers || r.isFlower)
    .sort((a, b) => (onlyFlowers ? (b.honeyPrice ?? 0) - (a.honeyPrice ?? 0) : mode === 'raw' ? b.perDayRaw - a.perDayRaw : b.perDayBest - a.perDayBest));

  return (
    <div className="farm-recs">
      <div className="farm-controls">
        <div className="calendar__nav">
          {(['Farm', 'Greenhouse', 'IslandWest'] as AreaId[]).map((a) => (
            <button key={a} className={a === area ? 'button button--primary' : 'button'} onClick={() => setArea(a)}>
              {t(`farm.area.${a}`)}
            </button>
          ))}
        </div>
        {!indoor && (
          <div className="calendar__nav">
            {SEASONS.map((s) => (
              <button key={s} className={s === season ? 'button button--primary' : 'button'} onClick={() => setSeason(s)}>
                <SeasonIcon season={s} />
                {t(`common.seasons.${s}`)}
              </button>
            ))}
          </div>
        )}
        <div className="farm-toggles">
          <label className="box">
            {t('farm.fertilizer')}
            <select value={fertilizer} onChange={(e) => setFertilizer(e.target.value as Fertilizer)}>
              {Object.keys(FERTILIZERS).map((f) => (
                <option key={f} value={f}>
                  {t(`farm.fert.${f}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="cc__filter">
            <input type="checkbox" checked={mode === 'best'} onChange={(e) => setMode(e.target.checked ? 'best' : 'raw')} />
            {t('farm.useMachines')}
          </label>
          <label className="cc__filter">
            <input type="checkbox" checked={includeUnbuyable} onChange={(e) => setIncludeUnbuyable(e.target.checked)} />
            {t('farm.includeUnbuyable')}
          </label>
          <label className="cc__filter">
            <input type="checkbox" checked={onlyFlowers} onChange={(e) => setOnlyFlowers(e.target.checked)} />
            {t('farm.onlyFlowers')}
          </label>
        </div>
        <p className="cc-summary__hint">
          {t('farm.assumptions', {
            days,
            level: defaults.farmingLevel,
            professions: [defaults.tiller && t('farm.prof.tiller'), defaults.agriculturist && t('farm.prof.agriculturist'), defaults.artisan && t('farm.prof.artisan')]
              .filter(Boolean)
              .join(', ') || t('farm.prof.none'),
          })}
        </p>
      </div>

      <div className="farm-table-wrap">
        <table className="farm-table">
          <thead>
            <tr>
              <th>{t('farm.col.crop')}</th>
              <th>{t('farm.col.seed')}</th>
              <th className="num">{t('farm.col.grow')}</th>
              <th className="num">{t('farm.col.harvests')}</th>
              <th className="num">{t('farm.col.price')}</th>
              <th className="num">{t('farm.col.profit')}</th>
              <th className="num">{t('farm.col.perDay')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <OptionRow key={row.crop.seed} row={row} mode={mode} />
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && <p>{t('farm.nothing')}</p>}
      </div>
    </div>
  );
}
