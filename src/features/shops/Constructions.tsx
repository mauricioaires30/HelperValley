import { useTranslation } from 'react-i18next';
import { gameData, getItem, type LocalizedName } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { ItemIcon, Sprite } from '@/ui';

export interface BuildingData {
  id: string;
  builder: 'Robin' | 'Wizard';
  n: LocalizedName;
  d: LocalizedName;
  cost: number;
  materials: Array<[string, number]>;
  days: number;
  condition?: string;
  texture: string;
  rect: [number, number, number, number] | null;
  size: [number, number];
  upgradeOf?: string;
}

export interface ShopAnimalData {
  id: string;
  n: LocalizedName;
  price: number;
  building?: string;
  condition?: string;
  texture: string;
  rect: [number, number, number, number];
}

const PICTURE = 72;

/** Sheets that pack several parts together: the rect of the building itself. */
const FIRST_FRAME: Record<string, [number, number, number, number]> = {
  'Fish Pond': [0, 0, 80, 80],
};

/** A sheet rect scaled down (or up) to fit a square picture box. */
function Picture({ sheet, rect }: { sheet: string; rect: [number, number, number, number] }) {
  const [x, y, w, h] = rect;
  const ratio = PICTURE / Math.max(w, h);
  const scale = ratio >= 1 ? Math.floor(ratio) : ratio;
  return (
    <span className="build-card__pic">
      <Sprite sheet={sheet} x={x} y={y} w={w} h={h} scale={scale} />
    </span>
  );
}

/** Materials as icons with amounts. */
function Materials({ list }: { list: Array<[string, number]> }) {
  const name = useGameName();
  return (
    <span className="build-card__materials">
      {list.map(([id, n]) => (
        <span key={id} className="build-card__material" title={name(getItem(id)?.n)}>
          <ItemIcon id={id} scale={1} tooltip={false} />×{n}
        </span>
      ))}
    </span>
  );
}

/** Robin's or the Wizard's buildings, with price, materials and build time. */
export function Constructions({ builder }: { builder: 'Robin' | 'Wizard' }) {
  const { t } = useTranslation();
  const name = useGameName();
  const all = (gameData().shops as { buildings: BuildingData[] }).buildings;
  const list = all.filter((b) => b.builder === builder);
  const nameOf = (id: string) => name(all.find((b) => b.id === id)?.n) || id;
  return (
    <section className="shop__group">
      <h3 className="shop__group-title">{t('shops.group.buildings')}</h3>
      <div className="build-grid">
        {list.map((b) => {
          // Buildings without a source rect use the first frame: width from the footprint, full height.
          const [sheetW, sheetH] = gameData().sheets[b.texture] ?? [b.size[0] * 16, 64];
          const rect = b.rect ?? FIRST_FRAME[b.id] ?? [0, 0, Math.min(sheetW, b.size[0] * 16), sheetH];
          return (
            <article key={b.id} className="build-card inset">
              <Picture sheet={b.texture} rect={rect} />
              <div className="build-card__body">
                <strong>{name(b.n)}</strong>
                <span className="build-card__price">{b.cost.toLocaleString()}g</span>
                {b.materials.length > 0 && <Materials list={b.materials} />}
                <small>
                  {b.days > 0 ? t('shops.build.days', { count: b.days }) : t('shops.build.instant')}
                  {b.upgradeOf && ` · ${t('shops.build.upgradeOf', { name: nameOf(b.upgradeOf) })}`}
                </small>
                <small className="build-card__desc">{name(b.d)}</small>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Animals Marnie sells, with the building each one needs. */
export function ShopAnimals() {
  const { t } = useTranslation();
  const name = useGameName();
  const { animals, buildings } = gameData().shops as { animals: ShopAnimalData[]; buildings: BuildingData[] };
  return (
    <section className="shop__group">
      <h3 className="shop__group-title">{t('shops.group.animals')}</h3>
      <div className="build-grid">
        {animals.map((a) => (
          <article key={a.id} className="build-card inset">
            <Picture sheet={a.texture} rect={a.rect} />
            <div className="build-card__body">
              <strong>{name(a.n)}</strong>
              <span className="build-card__price">{a.price.toLocaleString()}g</span>
              {a.building && <small>{t('shops.build.needs', { name: name(buildings.find((b) => b.id === a.building)?.n) || a.building })}</small>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Clint's tool upgrades: the same price and bars for every tool (ShopBuilder.GetToolUpgradeConventionalPrice). */
const TOOL_UPGRADES: Array<{ level: string; price: number; bar: string }> = [
  { level: 'copper', price: 2000, bar: '(O)334' },
  { level: 'steel', price: 5000, bar: '(O)335' },
  { level: 'gold', price: 10000, bar: '(O)336' },
  { level: 'iridium', price: 25000, bar: '(O)337' },
];

export function ToolUpgrades() {
  const { t } = useTranslation();
  return (
    <section className="shop__group">
      <h3 className="shop__group-title">{t('shops.group.upgrades')}</h3>
      <p className="cc-summary__hint">{t('shops.build.upgradeHint')}</p>
      <ul className="shop__items dashed-list">
        {TOOL_UPGRADES.map((u) => (
          <li key={u.level} className="shop-row">
            <ItemIcon id={u.bar} tooltip={false} />
            <span className="shop-row__name">
              <span>{t(`shops.build.level.${u.level}`)}</span>
              <small className="shop-row__stock">{t('shops.build.upgradeDays')}</small>
            </span>
            <span className="shop-row__price">
              {u.price.toLocaleString()}g + <ItemIcon id={u.bar} scale={1} tooltip={false} />×5
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
