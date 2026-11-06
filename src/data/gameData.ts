/** Localized name as [en, pt], matching the extractor output. */
export type LocalizedName = [string, string];

export interface ItemData {
  /** Names per language. */
  n: LocalizedName;
  /** Sprite: [sheet asset, index, width, height]. */
  s: [string, number, number, number];
  /** Object category. */
  c?: number;
  /** Base sell price. */
  p?: number;
  /** Object type (Basic, Arch, Minerals, Fish...). */
  t?: string;
  e?: number;
  tags?: string[];
  noShip?: boolean;
  noFish?: boolean;
  hat?: boolean;
  wt?: number;
  dmg?: [number, number];
  lvl?: number;
}

export type GiftTaste = 'love' | 'like' | 'dislike' | 'hate' | 'neutral';
export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export interface NpcData {
  n: LocalizedName;
  birth: { season: Season; day: number } | null;
  romance: boolean;
  gifts: Record<GiftTaste, string[]> | null;
  social: number;
  perfection: boolean;
  region: string;
}

export interface GameData {
  items: Record<string, ItemData>;
  npcs: Record<string, NpcData>;
  universalGifts: Record<GiftTaste, string[]>;
  sheets: Record<string, [number, number]>;
}

const DATASETS = ['items', 'npcs', 'universalGifts', 'sheets'] as const;

export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export const spriteUrl = (sheet: string) => assetUrl(`sprites/${sheet}.png`);

let data: GameData | null = null;
let loading: Promise<GameData> | null = null;

/** Loads all static game datasets once. */
export function loadGameData(): Promise<GameData> {
  loading ??= Promise.all(
    DATASETS.map((name) => fetch(assetUrl(`data/${name}.json`)).then((r) => r.json())),
  ).then((values) => {
    data = Object.fromEntries(DATASETS.map((name, i) => [name, values[i]])) as unknown as GameData;
    return data;
  });
  return loading;
}

/** Game data after `loadGameData` resolved; the app shell renders nothing before that. */
export function gameData(): GameData {
  if (!data) throw new Error('Game data not loaded yet');
  return data;
}

/**
 * Normalizes an item id to its qualified form. Saves and gift tastes often use bare object ids
 * ("24"), which mean "(O)24".
 */
export function qualifyItemId(id: string): string {
  return id.startsWith('(') ? id : `(O)${id}`;
}

export function getItem(id: string): ItemData | undefined {
  return gameData().items[qualifyItemId(id)];
}
