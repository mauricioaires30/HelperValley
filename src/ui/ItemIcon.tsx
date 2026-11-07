import { gameData, getItem, type ItemData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { Sprite, gridRect } from './Sprite';
import { QualityStar, type Quality } from './QualityStar';
import { Tooltip } from './Tooltip';

interface ItemIconProps {
  /** Qualified ("(O)24") or bare object id ("24"). */
  id: string;
  scale?: number;
  /** Draw inside an inventory slot frame. */
  slot?: boolean;
  quality?: Quality;
  count?: number;
  /** Greyed out, e.g. not collected yet. */
  faded?: boolean;
  /** Show the item name on hover. */
  tooltip?: boolean;
}

/** Where an item's icon sits in its sheet. */
export function itemRect(item: ItemData) {
  const [sheet, index, w, h] = item.s;
  if (item.r) return { x: item.r[0], y: item.r[1] };
  if (item.f) {
    const [sheetW] = gameData().sheets[sheet] ?? [512];
    return { x: (index * 16) % sheetW, y: Math.floor((index * 16) / sheetW) * 16 };
  }
  // Hats are 20x80 cells (four facings); the icon is the top frame.
  return item.hat ? gridRect(sheet, index, 20, 80) : gridRect(sheet, index, w, h);
}

export function ItemIcon({ id, scale = 2, slot, quality = 0, count, faded, tooltip = true }: ItemIconProps) {
  const item = getItem(id);
  const name = useGameName();
  if (!item) return null;

  const [sheet, , w, h] = item.s;
  const rect = itemRect(item);
  const label = name(item.n);
  // Every icon fits the same square (16px × scale), like inventory slots in the game:
  // big craftables, furniture and wallpaper shrink, tiny shirt icons grow.
  const box = 16 * scale;
  const ratio = box / Math.max(w, h);
  const drawScale = ratio >= 1 ? Math.floor(ratio) : ratio;
  const sprite = (
    <span className="item-box" style={{ width: box, height: box }}>
      <Sprite sheet={sheet} x={rect.x} y={rect.y} w={w} h={h} scale={drawScale} label={label} />
    </span>
  );

  const content = slot ? (
    <span className={faded ? 'slot slot--faded' : 'slot'}>
      {sprite}
      {quality > 0 && (
        <span className="slot__quality">
          <QualityStar quality={quality} />
        </span>
      )}
      {count != null && count > 1 && <span className="slot__count">{count}</span>}
    </span>
  ) : (
    sprite
  );

  return tooltip ? <Tooltip text={label}>{content}</Tooltip> : content;
}
