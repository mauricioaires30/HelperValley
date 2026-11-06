import { qualifyItemId } from '@/data/gameData';
import type { SaveData } from './model';

export interface ItemLocation {
  /** Location name ("Farm", "Shed", "FarmHouse"...) or player name for inventories. */
  where: string;
  kind: 'chest' | 'fridge' | 'grabber' | 'global' | 'other' | 'inventory';
  count: number;
}

/**
 * Where the farm holds an item: every container plus each player's backpack,
 * counting only stacks with at least `minQuality`.
 */
export function findItem(save: SaveData, id: string, minQuality = 0): ItemLocation[] {
  const target = qualifyItemId(id);
  const found = new Map<string, ItemLocation>();
  const add = (where: string, kind: ItemLocation['kind'], count: number) => {
    const key = `${kind}:${where}`;
    const entry = found.get(key) ?? { where, kind, count: 0 };
    entry.count += count;
    found.set(key, entry);
  };

  for (const c of save.containers) {
    for (const item of c.items) if (item.id === target && item.quality >= minQuality) add(c.location, c.kind, item.stack);
  }
  for (const p of save.players) {
    for (const item of p.inventory) if (item.id === target && item.quality >= minQuality) add(p.name, 'inventory', item.stack);
  }
  return [...found.values()].sort((a, b) => b.count - a.count);
}

export const totalCount = (locations: ItemLocation[]) => locations.reduce((n, l) => n + l.count, 0);
