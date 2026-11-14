import { gameData, getItem, spriteUrl, type ItemData } from '@/data/gameData';
import { gridRect } from '@/ui/Sprite';
import { FLOOR, TYPE_ITEM, type MapEntry } from './planner';

const SEASONS = ['spring', 'summer', 'fall', 'winter'];

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
  /** Pixels the picture sits left (negative) or right of its footprint. */
  dx?: number;
  /** A picture made of pieces of the sheet (a full tree: trunk and crown): source x, y, w, h, then where it goes from the tile's top-left corner. */
  layers?: Array<[number, number, number, number, number, number]>;
  /** With layers: the whole picture's box from the tile's top-left corner, x, y, w, h. */
  box?: [number, number, number, number];
  /** Water behind the picture, as x, y, w, h inside it (a fish pond's ring is open in the middle). */
  water?: [number, number, number, number];
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

/** Wild trees by the planner's name; winter and some trees have a sheet of their own. */
function wildTreeSheet(name: string, season: number): string | null {
  const s = SEASONS[season] ?? 'spring';
  switch (name) {
    case 'oak-tree':
      return `TerrainFeatures/tree1_${s}`;
    case 'maple-tree':
      return `TerrainFeatures/tree2_${s}`;
    // The game has no summer pine picture: it uses the spring one.
    case 'pine-tree':
      return `TerrainFeatures/tree3_${s === 'summer' ? 'spring' : s}`;
    case 'mahogany-tree':
      return `TerrainFeatures/tree8_${s}`;
    case 'palm-tree':
      return 'TerrainFeatures/tree_palm';
    case 'mushroom-tree':
      return 'TerrainFeatures/mushroom_tree';
    default:
      return null;
  }
}

/** A wild tree: small pictures while it grows, then the trunk and the crown (as Tree.draw puts them). */
function wildTreeSprite(name: string, stage: number | undefined, season: number): SpriteRef | null {
  const sheet = wildTreeSheet(name, season);
  if (!sheet) return null;
  if (stage !== undefined && stage < 5) {
    const [x, y, w, h] = stage <= 0 ? [32, 128, 16, 16] : stage === 1 ? [0, 128, 16, 16] : stage === 2 ? [16, 128, 16, 16] : [0, 96, 16, 32];
    return { sheet, x, y, w, h, foot: [1, 1], anchor: 'bottom' };
  }
  return {
    sheet,
    x: 0,
    y: 0,
    w: 48,
    h: 96,
    foot: [1, 1],
    anchor: 'bottom',
    layers: [
      [32, 96, 16, 32, 0, -16],
      [0, 0, 48, 96, -16, -80],
    ],
    box: [-16, -80, 48, 96],
  };
}

/** The row of each fruit tree (by sapling) in the fruit trees sheet: 48x80 pictures, four growth stages then spring to winter. */
const FRUIT_ROW: Record<string, number> = { '(O)628': 0, '(O)629': 1, '(O)630': 2, '(O)631': 3, '(O)632': 4, '(O)633': 5, '(O)69': 7, '(O)835': 8 };

function fruitTreeSprite(name: string, stage: number | undefined, season: number): SpriteRef | null {
  const sapling = name.endsWith('-tree') ? itemBySlug(name.replace(/-tree$/, '-sapling')) : undefined;
  const row = sapling ? FRUIT_ROW[sapling] : undefined;
  if (row === undefined) return null;
  const column = stage !== undefined && stage < 4 ? Math.max(0, stage) : 4 + (season % 4);
  return { sheet: 'TileSheets/fruitTrees', x: column * 48, y: row * 80, w: 48, h: 80, foot: [1, 1], anchor: 'bottom', dx: -TILE };
}

function objectSprite(name: string, category: string, entry: MapEntry): SpriteRef | null {
  if (category === 'trees') {
    const tree = wildTreeSprite(name, entry.stage, entry.variant ?? 0) ?? fruitTreeSprite(name, entry.stage, entry.variant ?? 0);
    if (tree) return tree;
  }
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

/** A building's picture: the sheet, the frame in it, and the tiles it stands on. */
interface BuildingArt {
  sheet: string;
  rect: [number, number, number, number];
  foot: [number, number];
  dx?: number;
  water?: [number, number, number, number];
}

const titleOf = (name: string) =>
  name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const CABINS = ['stone', 'log', 'plank', 'rustic', 'beach', 'trailer', 'neighbor'];

/** Buildings the shops don't list, or whose sheet holds more than the building: the frames are the game's own. */
function fixedArt(name: string, variant: number): BuildingArt | null {
  // The farmhouse: 9x5 tiles, drawn from a 160x144 picture one tile wider to the left; three pictures for its upgrades.
  if (name === 'house') return { sheet: 'Buildings/houses', rect: [0, 144 * Math.min(2, variant), 160, 144], foot: [9, 5], dx: -TILE };
  // The greenhouse sheet has the broken one on top and the repaired one below.
  if (name === 'greenhouse-repaired') return { sheet: 'Buildings/Greenhouse', rect: [0, 160, 112, 160], foot: [7, 6] };
  if (name === 'greenhouse') return { sheet: 'Buildings/Greenhouse', rect: [0, 0, 112, 160], foot: [7, 6] };
  // The pond is a stone ring, open in the middle: the water is drawn by the game, here a flat blue.
  if (name === 'fish-pond') return { sheet: 'Buildings/Fish Pond', rect: [0, 0, 80, 80], foot: [5, 5], water: [16, 16, 48, 48] };
  // Cabins: three skins side by side, 80x112 each.
  if (name.endsWith('-cabin') && CABINS.includes(name.slice(0, -'-cabin'.length))) return { sheet: `Buildings/${titleOf(name)}`, rect: [0, 0, 80, 112], foot: [5, 3] };
  if (name === 'hay-pet-bowl' || name === 'stone-pet-bowl') return { sheet: `Buildings/${titleOf(name)}`, rect: [32, 0, 32, 32], foot: [2, 2] };
  return null;
}

interface ShopBuilding {
  id: string;
  texture: string;
  rect: [number, number, number, number] | null;
  size: [number, number];
}

/** Buildings the shops list, with the texture, frame and size from the game's Data/Buildings. */
function shopArt(name: string): BuildingArt | null {
  const buildings = (gameData().shops as unknown as { buildings: ShopBuilding[] }).buildings;
  const info = buildings.find((b) => slug(b.id) === name);
  if (!info) return null;
  const dims = gameData().sheets[info.texture];
  // Without a frame the game uses the sheet; a sheet with several colors (Junimo Hut) shows its first, as wide as the building.
  const rect = info.rect ?? (dims ? ([0, 0, Math.min(dims[0], info.size[0] * TILE), dims[1]] as [number, number, number, number]) : null);
  return rect ? { sheet: info.texture, rect, foot: info.size } : null;
}

function buildingSprite(name: string, variant: number): SpriteRef | null {
  const art = fixedArt(name, variant) ?? shopArt(name);
  if (!art) return null;
  const [x, y, w, h] = art.rect;
  return { sheet: art.sheet, x, y, w, h, foot: art.foot, anchor: 'bottom', dx: art.dx, water: art.water };
}

/**
 * Soil and floors come as a 4x4 set of 16px pieces, one for each way a piece joins its neighbors.
 * Sides: north 1, east 2, south 4, west 8. The value is the piece's column and row in the set.
 */
const JOINED: Record<number, [number, number]> = {
  0: [0, 0],
  4: [0, 1],
  5: [0, 2],
  1: [0, 3],
  2: [1, 3],
  10: [2, 3],
  8: [3, 3],
  6: [1, 0],
  14: [2, 0],
  12: [3, 0],
  7: [1, 1],
  15: [2, 1],
  13: [3, 1],
  3: [1, 2],
  11: [2, 2],
  9: [3, 2],
};

/** A piece of a joined set; `variant` is the season times 16 plus the joined sides (see joinNeighbors). */
function joinedPiece(sheet: string, originX: number, originY: number, variant: number): SpriteRef {
  const [col, row] = JOINED[variant & 15] ?? [2, 1];
  return { sheet, x: originX + col * TILE, y: originY + row * TILE, w: TILE, h: TILE, foot: [1, 1], anchor: 'top' };
}

const isWinter = (variant: number) => variant >> 4 === 3;

const soilSprite = (variant: number) => joinedPiece(isWinter(variant) ? 'TerrainFeatures/hoeDirtSnow' : 'TerrainFeatures/hoeDirt', 0, 0, variant);

/** The floors sheet holds 4x4 sets of pieces, four sets to a row, in the order of the game's floor numbers. */
function floorSprite(name: string, variant: number): SpriteRef | null {
  const number = Object.entries(FLOOR).find(([, floor]) => floor === name)?.[0];
  if (number === undefined) return null;
  const n = Number(number);
  return joinedPiece(isWinter(variant) ? 'TerrainFeatures/Flooring_winter' : 'TerrainFeatures/Flooring', (n % 4) * 4 * TILE, Math.floor(n / 4) * 4 * TILE, variant);
}

/** Where each grass tuft stands on its tile (the tuft is 15x20, so most reach above the tile). */
const TUFTS: Array<[number, number]> = [
  [-4, -8],
  [5, -8],
  [-5, -3],
  [6, -3],
];

/** Grass: up to four tufts. `row` is the pixel row of the season's tufts in the grass sheet. */
function grassSprite(tufts: number, row: number): SpriteRef {
  const count = Math.max(1, Math.min(4, tufts));
  return {
    sheet: 'TerrainFeatures/grass',
    x: 0,
    y: row,
    w: 15,
    h: 20,
    foot: [1, 1],
    anchor: 'bottom',
    layers: TUFTS.slice(0, count).map(([dx, dy], i) => [(i % 3) * 15, row, 15, 20, dx, dy]),
    box: [-5, -8, 26, 25],
  };
}

/**
 * A growing crop. The crops sheet has two columns of eight 16x32 pictures (even rows on the left, odd on the right),
 * one picture per growth phase, and a few dead ones at the bottom.
 */
function cropSprite(entry: MapEntry): SpriteRef | null {
  if (entry.stage === undefined || entry.variant === undefined) return null;
  const row = entry.variant;
  const dead = entry.stage < 0;
  const x = dead ? 192 + (row % 4) * 16 : Math.min(7, entry.stage + 1) * 16 + (row % 2 ? 128 : 0);
  const y = dead ? 384 : Math.floor(row / 2) * 32;
  return { sheet: 'TileSheets/crops', x, y, w: 16, h: 32, foot: [1, 1], anchor: 'bottom' };
}

/** Big stumps, logs and boulders: a block of the objects sheet, drawn from the tile's top-left corner. */
function clumpSprite(entry: MapEntry): SpriteRef | null {
  if (entry.variant === undefined) return null;
  const [w, h] = entry.size ?? [2, 2];
  const { x, y } = gridRect('Maps/springobjects', entry.variant, TILE, TILE);
  return { sheet: 'Maps/springobjects', x, y, w: w * TILE, h: h * TILE, foot: [w, h], anchor: 'top' };
}

function pictureFor(entry: MapEntry): SpriteRef | null {
  if (entry.building) return buildingSprite(entry.names[0], entry.variant ?? 0);
  switch (entry.category) {
    case 'soil':
      return soilSprite(entry.variant ?? 0);
    case 'grass':
      return grassSprite(entry.stage ?? 4, entry.variant ?? 0);
    case 'terrain':
      return clumpSprite(entry);
    case 'floors':
      return floorSprite(entry.names[0], entry.variant ?? 0) ?? objectSprite(entry.names[0], entry.category, entry);
    case 'crops':
      return cropSprite(entry) ?? objectSprite(entry.names[0], entry.category, entry);
    default:
      return objectSprite(entry.names[0], entry.category, entry);
  }
}

const cache = new Map<string, SpriteRef | null>();

/** The game's own art for a map entry, or null when there is none (it is drawn as a colored square then). */
export function spriteFor(entry: MapEntry): SpriteRef | null {
  const key = `${entry.building ? 'building' : entry.category}:${entry.names[0]}:${entry.variant ?? 0}:${entry.stage ?? ''}:${entry.size?.join('x') ?? ''}`;
  if (!cache.has(key)) cache.set(key, pictureFor(entry));
  return cache.get(key) ?? null;
}

/** Where a sprite is drawn, in pixels of the map. */
export function spriteBox(entry: MapEntry, ref: SpriteRef) {
  if (ref.box) return { x: entry.x * TILE + ref.box[0], y: entry.y * TILE + ref.box[1], w: ref.box[2], h: ref.box[3] };
  return {
    x: entry.x * TILE + (ref.dx ?? 0),
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

/** A building without a picture is drawn as a square this many tiles wide. */
export const BUILDING_SPAN = 3;

/** The map's window, in tiles. */
export interface Bounds {
  minX: number;
  minY: number;
  w: number;
  h: number;
}

/** Size in tiles of each farm map (by the save's whichFarm), and of the island farm. */
const FARM_TILES: Array<[number, number]> = [[80, 65], [80, 65], [80, 65], [80, 65], [80, 65], [80, 80], [110, 110], [100, 75]];
export const minTiles = (slot: 'farm' | 'island', farmType: number): [number, number] => (slot === 'island' ? [110, 110] : (FARM_TILES[farmType] ?? [80, 65]));

/**
 * The tiles every view of a slot covers, so switching views never changes the map's size: the whole map
 * plus anything drawn beyond it (tall sprites reach above their tile).
 */
export function mapBounds(entries: MapEntry[], points: Array<[number, number]>, min: [number, number]): Bounds {
  let x0 = 0;
  let y0 = 0;
  let x1 = min[0] * TILE;
  let y1 = min[1] * TILE;
  const grow = (x: number, y: number, w: number, h: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + w);
    y1 = Math.max(y1, y + h);
  };
  for (const e of entries) {
    const sprite = spriteFor(e);
    if (sprite) {
      const box = spriteBox(e, sprite);
      grow(box.x, box.y, box.w, box.h);
    } else {
      const size = (e.building ? BUILDING_SPAN : 1) * TILE;
      grow(e.x * TILE, e.y * TILE, size, size);
    }
  }
  for (const [x, y] of points) grow(x * TILE, y * TILE, TILE, TILE);
  const minX = Math.floor(x0 / TILE);
  const minY = Math.floor(y0 / TILE);
  return { minX, minY, w: Math.max(Math.ceil(x1 / TILE) - minX, 1), h: Math.max(Math.ceil(y1 / TILE) - minY, 1) };
}

/** Farm type (the save's whichFarm) → the game's map file. */
const FARM_MAP_FILES = ['Farm', 'Farm_Fishing', 'Farm_Foraging', 'Farm_Mining', 'Farm_Combat', 'Farm_FourCorners', 'Farm_Island', 'Farm_Ranching'];

/**
 * The sheet name of the game's own map picture (ground, water, cliffs) for a slot. tools/extract draws these
 * into public/sprites/FarmMaps; until it has, the file isn't there and the map simply has no background.
 */
export const backgroundFor = (slot: 'farm' | 'island', farmType: number) => `FarmMaps/${slot === 'island' ? 'IslandWest' : (FARM_MAP_FILES[farmType] ?? 'Farm')}`;

/**
 * The planner gives a building's bottom row (its y) and its left column; the map draws from the top row.
 * A farmhouse 5 tiles tall at y=16 in the plan stands on rows 12 to 16.
 */
export function planBuildingsToTopLeft(entries: MapEntry[]): MapEntry[] {
  return entries.map((e) => {
    if (!e.building || !e.bottomRow) return e;
    const sprite = spriteFor(e);
    const rows = sprite ? sprite.foot[1] : BUILDING_SPAN;
    return { ...e, y: e.y - (rows - 1), bottomRow: false };
  });
}
