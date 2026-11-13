import { gameData, getItem, spriteUrl, type ItemData } from '@/data/gameData';
import { gridRect } from '@/ui/Sprite';
import { TYPE_ITEM, type MapEntry } from './planner';

/** Pixels per tile in the game's sprite sheets. */
export const TILE = 16;

/** A piece of a game sprite sheet and how it stands on its tile. */
export interface SpriteRef {
  sheet: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tiles it occupies (hover and overlap use this). */
  foot: [number, number];
  /** "bottom": stands on its footprint and grows upward (objects, buildings). "top": drawn from the tile's top-left corner (furniture). */
  anchor: 'bottom' | 'top';
}

const slug = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '-');

/** On a shared name, big craftables win over objects, objects over furniture. */
const PREFERENCE = ['(BC)', '(O)', '(F)'];
let itemIds: Map<string, string> | null = null;

/** The item with this planner-style name ("keg", "wood-fence"). */
function itemBySlug(name: string): string | undefined {
  if (!itemIds) {
    const ids = new Map<string, string>();
    const rank = (id: string) => {
      const i = PREFERENCE.findIndex((p) => id.startsWith(p));
      return i < 0 ? PREFERENCE.length : i;
    };
    for (const [id, item] of Object.entries(gameData().items)) {
      const key = slug(item.n[0]);
      const known = ids.get(key);
      if (!known || rank(id) < rank(known)) ids.set(key, id);
    }
    itemIds = ids;
  }
  return itemIds.get(name);
}

/** Where an item's picture sits in its sheet (the same rule ItemIcon follows; that file pulls in the UI, so it isn't imported here). */
function itemRect(item: ItemData) {
  const [sheet, index, w, h] = item.s;
  if (item.r) return { x: item.r[0], y: item.r[1] };
  if (item.f) {
    const [sheetW] = gameData().sheets[sheet] ?? [512];
    return { x: (index * TILE) % sheetW, y: Math.floor((index * TILE) / sheetW) * TILE };
  }
  return item.hat ? gridRect(sheet, index, 20, 80) : gridRect(sheet, index, w, h);
}

function itemSprite(id: string): SpriteRef | null {
  const item = getItem(id);
  if (!item) return null;
  const [sheet, , w, h] = item.s;
  const { x, y } = itemRect(item);
  const furniture = id.startsWith('(F)');
  return {
    sheet,
    x,
    y,
    w,
    h,
    foot: furniture ? [Math.max(1, Math.ceil(w / TILE)), Math.max(1, Math.ceil(h / TILE))] : [1, 1],
    anchor: furniture ? 'top' : 'bottom',
  };
}

/** Trees have no sprite sheet of their own here, so they show the seed or sapling that grows them. */
const WILD_TREE_ITEM: Record<string, string> = {
  'oak-tree': 'acorn',
  'maple-tree': 'maple-seed',
  'pine-tree': 'pine-cone',
  'mahogany-tree': 'mahogany-seed',
  'palm-tree': 'coconut',
  'mushroom-tree': 'mushroom-tree-seed',
};

function objectSprite(name: string, category: string): SpriteRef | null {
  if (category === 'crops') {
    // A crop shows what it gives; a seed name stands for its crop.
    const id = itemBySlug(name);
    const crop = id ? gameData().farm.crops.find((c) => c.seed === id) : undefined;
    const shown = crop?.harvest ?? id;
    return shown ? itemSprite(shown) : null;
  }
  const wild = WILD_TREE_ITEM[name];
  const id = wild
    ? itemBySlug(wild)
    : name.endsWith('-tree')
      ? itemBySlug(name.replace(/-tree$/, '-sapling'))
      : (TYPE_ITEM[name] ?? itemBySlug(name));
  return id ? itemSprite(id) : null;
}

/** Tiles wide and high of the buildings whose sheet is a single picture (the others stay squares). */
const BUILDINGS: Record<string, [number, number]> = {
  Barn: [7, 4],
  'Big Barn': [7, 4],
  'Deluxe Barn': [7, 4],
  Coop: [6, 3],
  'Big Coop': [6, 3],
  'Deluxe Coop': [6, 3],
  Shed: [7, 3],
  'Big Shed': [7, 3],
  Silo: [3, 3],
  Stable: [4, 2],
  Well: [3, 2],
  'Shipping Bin': [2, 1],
  'Stone Cabin': [5, 3],
  'Earth Obelisk': [3, 2],
  'Water Obelisk': [3, 2],
  'Desert Obelisk': [3, 2],
  'Island Obelisk': [3, 2],
  'Gold Clock': [3, 2],
};

function buildingSprite(name: string): SpriteRef | null {
  const title = name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const size = BUILDINGS[title];
  const sheet = `Buildings/${title}`;
  const dims = gameData().sheets[sheet];
  if (!size || !dims) return null;
  return { sheet, x: 0, y: 0, w: size[0] * TILE, h: dims[1], foot: size, anchor: 'bottom' };
}

const cache = new Map<string, SpriteRef | null>();

/** The game's own art for a map entry, or null when there is none (it is drawn as a colored square then). */
export function spriteFor(entry: MapEntry): SpriteRef | null {
  if (entry.category === 'grass' || entry.category === 'soil') return null;
  const key = `${entry.building ? 'building' : entry.category}:${entry.names[0]}`;
  if (!cache.has(key)) cache.set(key, entry.building ? buildingSprite(entry.names[0]) : objectSprite(entry.names[0], entry.category));
  return cache.get(key) ?? null;
}

/** Where a sprite is drawn, in pixels of the map. */
export function spriteBox(entry: MapEntry, ref: SpriteRef) {
  return {
    x: entry.x * TILE,
    y: ref.anchor === 'top' ? entry.y * TILE : (entry.y + ref.foot[1]) * TILE - ref.h,
    w: ref.w,
    h: ref.h,
  };
}

const images = new Map<string, HTMLImageElement>();
const loading = new Map<string, Promise<void>>();

/** Loads a sprite sheet once; a sheet that fails to load is simply left out. */
export function loadSheet(sheet: string): Promise<void> {
  let pending = loading.get(sheet);
  if (!pending) {
    pending = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        images.set(sheet, img);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = encodeURI(spriteUrl(sheet));
    });
    loading.set(sheet, pending);
  }
  return pending;
}

export const sheetImage = (sheet: string) => images.get(sheet);
