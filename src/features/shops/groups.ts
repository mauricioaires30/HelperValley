import { getItem } from '@/data/gameData';
import type { StockEntry } from './stock';

/** Shop sections, in display order. */
export const GROUPS = [
  'seeds',
  'saplings',
  'produce',
  'food',
  'ingredients',
  'animal',
  'artisan',
  'fish',
  'farming',
  'fishing',
  'materials',
  'crafting',
  'tools',
  'weapons',
  'boots',
  'rings',
  'hats',
  'clothing',
  'furniture',
  'decor',
  'books',
  'recipes',
  'other',
] as const;
export type Group = (typeof GROUPS)[number];

/** Items whose category doesn't say what they are. */
const EXTRA: Record<string, Group> = {
  '(O)245': 'ingredients', // sugar
  '(O)246': 'ingredients', // wheat flour
  '(O)247': 'ingredients', // oil
  '(O)419': 'ingredients', // vinegar
  '(O)423': 'ingredients', // rice
  '(O)535': 'materials', // geodes
  '(O)536': 'materials',
  '(O)537': 'materials',
  '(O)749': 'materials',
  '(O)275': 'materials', // artifact trove
  '(O)710': 'fishing', // crab pot
  '(O)297': 'farming', // grass starter
};

/** Which section an item goes in, from its type prefix and object category. */
export function groupOf(entry: StockEntry): Group {
  if (entry.recipe) return 'recipes';
  const type = /^\((\w+)\)/.exec(entry.id)?.[1] ?? 'O';
  switch (type) {
    case 'W':
      return 'weapons';
    case 'B':
      return 'boots';
    case 'H':
      return 'hats';
    case 'S':
    case 'P':
      return 'clothing';
    case 'F':
    case 'M':
      return 'furniture';
    case 'WP':
    case 'FL':
      return 'decor';
    case 'T':
      return 'tools';
    case 'TR':
      return 'rings';
    case 'BC':
      return 'crafting';
  }
  const item = getItem(entry.id);
  if (item?.t === 'Ring') return 'rings';
  if (item?.c === -102 || item?.c === -103) return 'books';
  // Slingshot ammo sits with the weapons.
  if (entry.id === '(O)441') return 'weapons';
  if (EXTRA[entry.id]) return EXTRA[entry.id];
  switch (item?.c) {
    case -74:
      return /sapling/i.test(item.n[0]) ? 'saplings' : 'seeds';
    case -75:
    case -79:
    case -80:
    case -81:
    case -17:
      return 'produce';
    case -7:
      return 'food';
    case -5:
    case -6:
    case -18:
      return 'animal';
    case -26:
    case -27:
      return 'artisan';
    case -4:
    case -23:
      return 'fish';
    case -19:
      return 'farming';
    case -21:
    case -22:
      return 'fishing';
    case -28:
    case -2:
    case -12:
    case -15:
    case -16:
      return 'materials';
    case -8:
    case -9:
      return 'crafting';
    case -96:
      return 'rings';
    case -24:
      return 'decor';
    default:
      return 'other';
  }
}

/** Stock split into sections, keeping the shop's order inside each one. */
export function groupStock(items: StockEntry[]): Array<[Group, StockEntry[]]> {
  const by = new Map<Group, StockEntry[]>();
  for (const e of items) {
    const g = groupOf(e);
    by.set(g, [...(by.get(g) ?? []), e]);
  }
  return GROUPS.filter((g) => by.has(g)).map((g) => [g, by.get(g)!]);
}
