import { gameData, getItem, qualifyItemId, type GiftTaste } from '@/data/gameData';
import type { SaveData } from '@/save/model';

export const TASTES: GiftTaste[] = ['love', 'like', 'neutral', 'dislike', 'hate'];

/** Bare id ("24", "Book_Void") used by gift taste lists. */
const bareId = (qualified: string) => qualified.replace(/^\(O\)/, '');
const isCategory = (entry: string) => /^-\d+$/.test(entry);
/** Entries that are neither categories nor known items are context tags ("book_item"). */
const isTag = (entry: string) => !isCategory(entry) && !gameData().items[qualifyItemId(entry)];

type Lists = Record<GiftTaste, string[]> | null | undefined;

const findIn = (lists: Lists, match: (entry: string) => boolean) =>
  lists ? TASTES.find((taste) => lists[taste]?.some(match)) : undefined;

/**
 * How an NPC feels about an item, following the game's precedence closely enough for advice:
 * personal item id, universal item id, personal then universal context tags, then categories.
 */
export function giftTaste(npc: string, itemId: string): GiftTaste {
  const data = gameData();
  const personal = data.npcs[npc]?.gifts;
  const universal = data.universalGifts;
  const item = getItem(itemId);
  const id = bareId(qualifyItemId(itemId));
  const tags = new Set(item?.tags ?? []);
  const category = item?.c !== undefined ? String(item.c) : undefined;
  const byTag = (entry: string) => isTag(entry) && tags.has(entry);

  return (
    findIn(personal, (e) => e === id) ??
    findIn(universal, (e) => e === id) ??
    findIn(personal, byTag) ??
    findIn(universal, byTag) ??
    (category ? findIn(personal, (e) => e === category) ?? findIn(universal, (e) => e === category) : undefined) ??
    'neutral'
  );
}

export interface TasteGroup {
  /** Specific items, already resolved against overrides. */
  items: string[];
  /** Whole categories ("-75") and context tags ("book_item"). */
  groups: string[];
}

/** Everything an NPC explicitly reacts to, grouped by the taste that actually applies. */
export function tasteGroups(npc: string): Record<GiftTaste, TasteGroup> {
  const data = gameData();
  const personal = data.npcs[npc]?.gifts;
  const universal = data.universalGifts;
  const result = Object.fromEntries(TASTES.map((t) => [t, { items: [], groups: [] }])) as unknown as Record<GiftTaste, TasteGroup>;
  const seenItems = new Set<string>();
  const seenGroups = new Set<string>();

  for (const lists of [personal, universal]) {
    for (const taste of TASTES) {
      for (const entry of lists?.[taste] ?? []) {
        if (isCategory(entry) || isTag(entry)) {
          // A personal entry for the same group wins over the universal one.
          if (seenGroups.has(entry)) continue;
          seenGroups.add(entry);
          result[taste].groups.push(entry);
        } else {
          const id = qualifyItemId(entry);
          if (seenItems.has(id)) continue;
          seenItems.add(id);
          result[giftTaste(npc, id)].items.push(id);
        }
      }
    }
  }
  return result;
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
