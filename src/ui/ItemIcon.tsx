import { getItem } from '@/data/gameData';
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

export function ItemIcon({ id, scale = 2, slot, quality = 0, count, faded, tooltip = true }: ItemIconProps) {
  const item = getItem(id);
  const name = useGameName();
  if (!item) return null;

  const [sheet, index, w, h] = item.s;
  // Hats are 20x80 cells (four facings); the icon is the top frame.
  const rect = item.hat ? gridRect(sheet, index, 20, 80) : gridRect(sheet, index, w, h);
  const label = name(item.n);
  // Big craftables are 16x32; shrink them to fit a slot like the game does.
  const drawScale = slot && h > 16 ? Math.max(1, scale / 2) : scale;
  const sprite = <Sprite sheet={sheet} x={rect.x} y={rect.y} w={w} h={h} scale={drawScale} label={label} />;

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
