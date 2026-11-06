import { gameData, getItem, qualifyItemId, type GiftTaste } from '@/data/gameData';
import type { SaveData } from '@/save/model';

const ORDER: GiftTaste[] = ['love', 'like', 'neutral', 'dislike', 'hate'];

/** Bare id ("24", "Book_Void") used by gift taste lists. */
const bareId = (qualified: string) => qualified.replace(/^\(O\)/, '');

/**
 * How an NPC feels about an item. Mirrors the game's precedence closely enough for advice:
 * personal item ids, then universal item ids, then personal categories, then universal categories.
 */
export function giftTaste(npc: string, itemId: string): GiftTaste {
  const data = gameData();
  const personal = data.npcs[npc]?.gifts;
  const universal = data.universalGifts;
  const id = bareId(qualifyItemId(itemId));
  const category = getItem(itemId)?.c;
  const find = (lists: Record<GiftTaste, string[]> | null | undefined, key: string | undefined) =>
    key === undefined || !lists ? undefined : ORDER.find((taste) => lists[taste]?.includes(key));

  return (
    find(personal, id) ??
    find(universal, id) ??
    find(personal, category !== undefined ? String(category) : undefined) ??
    find(universal, category !== undefined ? String(category) : undefined) ??
    'neutral'
  );
}

/** Every object the farm currently owns (chests + backpacks), deduplicated. */
export function ownedObjectIds(save: SaveData): string[] {
  const ids = new Set<string>();
  for (const c of save.containers) for (const i of c.items) if (i.id.startsWith('(O)')) ids.add(i.id);
  for (const p of save.players) for (const i of p.inventory) if (i.id.startsWith('(O)')) ids.add(i.id);
  return [...ids];
}

/** Owned items an NPC loves (or likes, if nothing loved), cheapest first so you keep valuables. */
export function bestOwnedGifts(npc: string, owned: string[], limit = 6): { taste: GiftTaste; ids: string[] } {
  for (const taste of ['love', 'like'] as const) {
    const ids = owned
      .filter((id) => giftTaste(npc, id) === taste)
      .sort((a, b) => (getItem(a)?.p ?? 0) - (getItem(b)?.p ?? 0))
      .slice(0, limit);
    if (ids.length) return { taste, ids };
  }
  return { taste: 'neutral', ids: [] };
}
