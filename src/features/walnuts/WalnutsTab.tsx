import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import type { SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { useLocationName } from '@/features/fish/FishInfo';
import { ItemIcon, Progress } from '@/ui';

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

/** One-time walnut rewards (puzzles, quests, restorations) tracked by id in the save. */
const ONE_TIME = [
  'IslandGourmand1',
  'IslandGourmand2',
  'IslandGourmand3',
  'Mermaid',
  'TreeNut',
  'TreeNutShot',
  'SandDuggy',
  'IslandWestCavePuzzle',
  'IslandShrinePuzzle',
  'BananaShrine',
  'StardropPool',
  'IslandLeftPlantRestored',
  'IslandRightPlantRestored',
  'IslandSnakeRestored',
  'IslandFrogRestored',
  'IslandBatRestored',
  'IslandCenterSkeletonRestored',
];

function Walnuts({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const place = useLocationName();
  const collected = new Set(save.walnutsCollected);
  const spots = gameData().walnuts;
  const missingSpots = spots.filter((s) => !collected.has(s.id));

  return (
    <div>
      <h2>{t('walnuts.title')}</h2>
      <div className="museum__progress">
        <Progress value={save.goldenWalnutsFound} max={TOTAL_WALNUTS} />
        <p className="cc-summary__hint">{t('walnuts.hint')}</p>
      </div>

      <div className="farm-grid">
        <section className="box">
          <h3>{t('walnuts.spotsTitle', { missing: missingSpots.length, total: spots.length })}</h3>
          <p className="cc-summary__hint">{t('walnuts.spotsHint')}</p>
          <ul className="farm-facts">
            {missingSpots.map((s) => (
              <li key={s.id}>
                <ItemIcon id="(O)73" tooltip={false} />
                {t(`walnuts.kind.${s.kind}`)} · {place(s.location)} ({s.tile[0]}, {s.tile[1]})
              </li>
            ))}
            {missingSpots.length === 0 && <li>{t('walnuts.allSpots')}</li>}
          </ul>
        </section>

        <section className="box">
          <h3>{t('walnuts.dropsTitle')}</h3>
          <ul className="farm-facts">
            {DROPS.map(({ key, max }) => {
              const got = save.walnutDrops[key] ?? 0;
              const done = max !== undefined && got >= max;
              return (
                <li key={key} className={done ? 'rel__muted' : undefined}>
                  {done ? '✓' : '·'} {t(`walnuts.drop.${key}`)} — {max !== undefined ? `${got}/${max}` : got}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="box">
          <h3>{t('walnuts.oneTimeTitle')}</h3>
          <ul className="farm-facts">
            {ONE_TIME.map((key) => (
              <li key={key} className={collected.has(key) ? 'rel__muted' : undefined}>
                {collected.has(key) ? '✓' : '·'} {t(`walnuts.once.${key}`)}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export function WalnutsTab() {
  return <RequireSave>{(save) => <Walnuts save={save} />}</RequireSave>;
}
