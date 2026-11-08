import { useTranslation } from 'react-i18next';
import { getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { ItemIcon } from '@/ui';
import { TOOL_UPGRADES } from '@/features/shops/toolUpgrades';

/** Tools Clint upgrades, by the id prefix used in Data/Tools ("CopperAxe", "IridiumPickaxe"...). */
const CLINT_TOOLS = ['Axe', 'Pickaxe', 'Hoe', 'WateringCan', 'Pan', 'TrashCan'] as const;
const LEVEL_PREFIX = ['', 'Copper', 'Steel', 'Gold', 'Iridium'];
/** Willy's rods in order, with their price at the Fish Shop (Data/Shops FishShop). */
const RODS: Array<{ id: string; price: number }> = [
  { id: '(T)BambooPole', price: 500 },
  { id: '(T)TrainingRod', price: 25 },
  { id: '(T)FiberglassRod', price: 1800 },
  { id: '(T)IridiumRod', price: 7500 },
  { id: '(T)AdvancedIridiumRod', price: 25000 },
];

/** Qualified tool id for a level; the base pan is already copper, the base trash can has no item. */
const toolId = (tool: string, level: number) => (tool === 'Pan' && level === 1 ? '(T)Pan' : `(T)${LEVEL_PREFIX[level]}${tool}`);

/** Each tool's best level, from the player's inventory and every chest (a tool may be stored away). */
function toolLevels(save: SaveData, player: Player) {
  const ids = new Set([...player.inventory, ...save.containers.flatMap((c) => c.items)].map((i) => i.id));
  const levels: Record<string, number> = {};
  for (const tool of CLINT_TOOLS) {
    if (tool === 'TrashCan') {
      levels[tool] = player.trashCanLevel;
      continue;
    }
    levels[tool] = -1;
    for (let lvl = 4; lvl >= 0; lvl--) {
      if (ids.has(toolId(tool, lvl)) || (lvl === 0 && ids.has(`(T)${tool}`))) {
        levels[tool] = lvl;
        break;
      }
    }
  }
  const rod = RODS.reduce((best, r, i) => (ids.has(r.id) ? i : best), -1);
  return { levels, rod };
}

/** The player's tools: level now and what the next upgrade costs. */
export function ToolsSection({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const { levels, rod } = toolLevels(save, player);
  return (
    <section className="panel player__section">
      <h2>{t('player.tools.title')}</h2>
      <ul className="shop__items dashed-list">
        {CLINT_TOOLS.map((tool) => {
          const level = levels[tool];
          // Upgrading from level N goes to N+1 (the pan starts at copper, so its first upgrade is steel).
          const next = level >= 0 && level < 4 ? TOOL_UPGRADES[level] : undefined;
          const icon = level >= 0 ? (tool === 'TrashCan' ? `(T)${LEVEL_PREFIX[Math.max(1, level)]}TrashCan` : toolId(tool, Math.max(0, level))) : null;
          return (
            <li key={tool} className="shop-row">
              {icon && getItem(icon) ? <ItemIcon id={icon} tooltip={false} /> : <span />}
              <span className="shop-row__name">
                <span>{t(`player.tools.${tool}`)}</span>
                <small className="shop-row__stock">{level < 0 ? t('player.tools.none') : t(`player.tools.level.${Math.min(level, 4)}`)}</small>
              </span>
              <span className="shop-row__price">
                {level >= 4 ? (
                  t('player.tools.max')
                ) : next ? (
                  <>
                    {next.price.toLocaleString()}g + <ItemIcon id={next.bar} scale={1} tooltip={false} />×5
                  </>
                ) : (
                  '—'
                )}
              </span>
            </li>
          );
        })}
        <li className="shop-row">
          {rod >= 0 ? <ItemIcon id={RODS[rod].id} tooltip={false} /> : <span />}
          <span className="shop-row__name">
            <span>{t('player.tools.rod')}</span>
            <small className="shop-row__stock">{rod >= 0 ? name(getItem(RODS[rod].id)?.n) : t('player.tools.none')}</small>
          </span>
          <span className="shop-row__price">
            {rod < RODS.length - 1 ? t('player.tools.nextRod', { name: name(getItem(RODS[rod + 1].id)?.n), price: RODS[rod + 1].price.toLocaleString() }) : t('player.tools.max')}
          </span>
        </li>
      </ul>
      <p className="cc-summary__hint">{t('player.tools.hint')}</p>
    </section>
  );
}
