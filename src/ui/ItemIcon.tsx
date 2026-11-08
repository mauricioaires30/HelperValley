import { gameData, getItem, type ItemData } from '@/data/gameData';
import type { ItemTint } from '@/save/model';
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
  /** Flavored goods: the colors the game draws them with. */
  tint?: ItemTint;
}

/** Smoked fish: the fish under a translucent dark brown copy (Color(80, 30, 10) * 0.6 in the game). */
const SMOKE: [number, number, number] = [80, 30, 10];

/** A ColoredObject as ColoredObject.drawInMenu draws it. */
function TintedSprite({ item, tint, scale, label }: { item: ItemData; tint: ItemTint; scale: number; label: string }) {
  const [sheet, index, w, h] = item.s;
  const base = itemRect(item);
  if (tint.same) return <Sprite sheet={sheet} x={base.x} y={base.y} w={w} h={h} scale={scale} label={label} tint={tint.rgb} />;
  // Overlay: the next sprite in the sheet, tinted; smoked fish reuse the fish sprite.
  const over = tint.smoked ? base : gridRect(sheet, index + 1, w, h);
  return (
    <span className="tinted" role="img" aria-label={label}>
      <Sprite sheet={sheet} x={base.x} y={base.y} w={w} h={h} scale={scale} />
      <Sprite sheet={sheet} x={over.x} y={over.y} w={w} h={h} scale={scale} tint={tint.smoked ? SMOKE : tint.rgb} className="tinted__over" style={tint.smoked ? { opacity: 0.6 } : undefined} />
    </span>
  );
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

export function ItemIcon({ id, scale = 2, slot, quality = 0, count, faded, tooltip = true, tint }: ItemIconProps) {
  const own = getItem(id);
  const name = useGameName();
  // Smoked fish show the fish sprite itself.
  const item = (tint?.smoked && getItem(tint.smoked)) || own;
  if (!item || !own) return null;

  const [sheet, , w, h] = item.s;
  const rect = itemRect(item);
  const label = name(own.n);
  // Every icon fits the same square (16px × scale), like inventory slots in the game:
  // big craftables, furniture and wallpaper shrink, tiny shirt icons grow.
  const box = 16 * scale;
  const ratio = box / Math.max(w, h);
  const drawScale = ratio >= 1 ? Math.floor(ratio) : ratio;
  const sprite = (
    <span className="item-box" style={{ width: box, height: box }}>
      {tint ? (
        <TintedSprite item={item} tint={tint} scale={drawScale} label={label} />
      ) : (
        <Sprite sheet={sheet} x={rect.x} y={rect.y} w={w} h={h} scale={drawScale} label={label} />
      )}
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
