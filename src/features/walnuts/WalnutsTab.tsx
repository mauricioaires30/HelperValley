import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import type { SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { useLocationName } from '@/features/fish/FishInfo';
import { ItemIcon, Progress } from '@/ui';
import { ONE_TIME_GUIDE } from './walnutGuide';

export const TOTAL_WALNUTS = 130;

/**
 * Repeatable walnut sources and their caps, as counted in the save's limitedNutDrops.
 * Keys without a known cap just show the count.
 */
const DROPS: Array<{ key: string; max?: number }> = [
  { key: 'IslandFishing', max: 5 },
  { key: 'IslandFarming', max: 5 },
  { key: 'MusselStone', max: 5 },
  { key: 'VolcanoMining', max: 5 },
  { key: 'VolcanoMonsterDrop', max: 5 },
  { key: 'VolcanoBarrel', max: 5 },
  { key: 'Birdie', max: 5 },
  { key: 'Darts', max: 3 },
  { key: 'TigerSlimeNut', max: 1 },
  { key: 'Island_N_BuriedTreasureNut', max: 1 },
  { key: 'Island_W_BuriedTreasureNut', max: 1 },
  { key: 'Island_W_BuriedTreasureNut2', max: 1 },
  { key: 'VolcanoNormalChest' },
];

function Walnuts({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const place = useLocationName();
  const collected = new Set(save.walnutsCollected);
  const spots = gameData().walnuts;
  const missingSpots = spots.filter((s) => !collected.has(s.id));

  // What's left, by kind of source.
  const drops = DROPS.map((d) => ({ ...d, got: save.walnutDrops[d.key] ?? 0 }));
  const dropsLeft = drops.filter((d) => d.max !== undefined && d.got < d.max);
  const puzzlesLeft = ONE_TIME_GUIDE.filter((g) => !collected.has(g.key));
  const left = {
    spots: missingSpots.length,
    drops: dropsLeft.reduce((n, d) => n + (d.max! - d.got), 0),
    puzzles: puzzlesLeft.reduce((n, g) => n + g.total, 0),
  };

  // Missing spots grouped by island area.
  const byArea = new Map<string, typeof missingSpots>();
  for (const s of missingSpots) byArea.set(s.location, [...(byArea.get(s.location) ?? []), s]);

  return (
    <div className="walnuts">
      <header className="cc__header">
        <h2>{t('walnuts.title')}</h2>
        <Link className="button button--primary" to="/map?show=walnuts">
          {t('walnuts.onMap')}
        </Link>
      </header>
      <div className="museum__progress">
        <Progress value={save.goldenWalnutsFound} max={TOTAL_WALNUTS} />
      </div>
      <div className="prod-summary">
        <span className="box">{t('walnuts.leftTotal', { count: Math.max(0, TOTAL_WALNUTS - save.goldenWalnutsFound) })}</span>
        <span className="box">{t('walnuts.leftSpots', { count: left.spots })}</span>
        <span className="box">{t('walnuts.leftDrops', { count: left.drops })}</span>
        <span className="box">{t('walnuts.leftPuzzles', { count: left.puzzles })}</span>
      </div>

      <section className="walnuts__section">
        <h3>{t('walnuts.puzzlesTitle', { count: puzzlesLeft.length })}</h3>
        {puzzlesLeft.length === 0 ? (
          <p className="cc-summary__hint">{t('walnuts.allPuzzles')}</p>
        ) : (
          <div className="walnut-cards">
            {puzzlesLeft.map(({ key, total, pin }) => (
              <article key={key} className="inset walnut-card">
                <header>
                  <strong>{t(`walnuts.once.${key}`)}</strong>
                  <span className="walnut-total">+{total}</span>
                </header>
                <span>{t(`walnuts.how.${key}`)}</span>
                {pin && <span className="cc-summary__hint">{place(pin.location)}</span>}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="walnuts__section">
        <h3>{t('walnuts.dropsTitle')}</h3>
        <div className="walnut-cards">
          {drops
            .filter((d) => d.max === undefined || d.got < d.max)
            .map(({ key, max, got }) => (
              <article key={key} className="inset walnut-card">
                <header>
                  <strong>{t(`walnuts.drop.${key}`)}</strong>
                  {max === undefined && <span className="walnut-total">{got}</span>}
                </header>
                {max !== undefined && <Progress value={got} max={max} />}
                <span>{t(`walnuts.dropHow.${key}`, { defaultValue: '' })}</span>
              </article>
            ))}
        </div>
      </section>

      <section className="walnuts__section">
        <h3>{t('walnuts.spotsTitle', { missing: missingSpots.length, total: spots.length })}</h3>
        <p className="cc-summary__hint">{t('walnuts.spotsHint')}</p>
        {missingSpots.length === 0 ? (
          <p className="cc-summary__hint">{t('walnuts.allSpots')}</p>
        ) : (
          <div className="walnut-cards">
            {[...byArea].map(([area, list]) => (
              <article key={area} className="inset walnut-card">
                <header>
                  <strong>{place(area)}</strong>
                  <span className="walnut-total">{list.length}</span>
                </header>
                <ul className="walnut-spots">
                  {list.map((s) => (
                    <li key={s.id}>
                      <ItemIcon id="(O)73" scale={1} tooltip={false} />
                      {t(`walnuts.kind.${s.kind}`)} · ({s.tile[0]}, {s.tile[1]})
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <details className="walnuts__done">
        <summary>{t('walnuts.doneTitle')}</summary>
        <ul className="farm-facts">
          {ONE_TIME_GUIDE.filter((g) => collected.has(g.key)).map(({ key, total }) => (
            <li key={key}>
              <span className="check check--on" aria-hidden="true" /> {t(`walnuts.once.${key}`)} <span className="walnut-total">+{total}</span>
            </li>
          ))}
          {drops
            .filter((d) => d.max !== undefined && d.got >= d.max)
            .map(({ key, max }) => (
              <li key={key}>
                <span className="check check--on" aria-hidden="true" /> {t(`walnuts.drop.${key}`)} <span className="walnut-total">{max}</span>
              </li>
            ))}
        </ul>
      </details>
    </div>
  );
}

export function WalnutsTab() {
  return <RequireSave>{(save) => <Walnuts save={save} />}</RequireSave>;
}
