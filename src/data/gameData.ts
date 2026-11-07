import type { WorldMapData } from '@/features/map/worldMap';
import type { ScheduleData } from '@/features/map/schedule';
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
  /** Texture name under Characters/ and Portraits/ (usually the NPC key). */
  tex: string;
  /** Overworld sprite frame size. */
  size: [number, number];
  /** First visible row of the first frame (top of the head). */
  head?: number;
}

export interface BundleStrings {
  /** English bundle name → [en, pt] display name. */
  names: Record<string, LocalizedName>;
  /** "{0} Bundle" per language. */
  format: LocalizedName;
  /** Community Center areas in areasComplete order. */
  areas: Array<{ id: string; n: LocalizedName }>;
}

export interface AchievementData {
  n: LocalizedName;
  d: LocalizedName;
  /** Visible in the collections tab before being earned. */
  shown: boolean;
  /** Prerequisite achievement id, or -1. */
  pre: number;
}

export interface AchievementGoals {
  /** Cooking recipe names. */
  cooking: string[];
  /** Crafting recipe names that count for Craft Master. */
  crafting: string[];
  /** Qualified ids of fish in the collection. */
  fish: string[];
  /** Harvest item ids counting for Polyculture / Monoculture. */
  polyculture: string[];
  monoculture: string[];
  /** Recipe name → qualified output item. */
  cookingOutputs: Record<string, string>;
  craftingOutputs: Record<string, string>;
  /** Recipe name → how it's learned, as [kind, ...args] (see tools/extract/lib/collections.mjs). */
  recipeSources: { cooking: Record<string, Array<Array<string | number | null>>>; crafting: Record<string, Array<Array<string | number | null>>> };
}

export interface Festival {
  id: string;
  season: Season;
  start: number;
  end: number;
  /** Null for passive festivals without a display name in data (translated by id). */
  n: LocalizedName | null;
  passive?: boolean;
}

export interface HeartEvent {
  id: string;
  npc: string;
  hearts: number;
  location: string;
  /** Other preconditions as [code, ...args], e.g. ["t", "1000", "1600"] or ["w", "rainy"]. */
  conditions: string[][];
}

/** Where an item can be bought or traded for. currency: 0 gold, 1 star tokens, 2 Qi coins, 4 Qi gems. */
export interface ItemSource {
  shop: string;
  price?: number;
  trade?: [string, number];
  random?: boolean;
  seasons?: Season[];
  currency?: number;
}

export interface CropData {
  seed: string;
  harvest: string;
  seasons: Season[];
  phases: number[];
  /** Days to regrow after harvest, or -1. */
  regrow: number;
  stack: [number, number];
  perLevel: number;
  extra: number;
  paddy: boolean;
  trellis: boolean;
  noPots: boolean;
  sources: ItemSource[];
}

export interface FarmData {
  crops: CropData[];
  fruitTrees: Array<{ sapling: string; fruit: string; seasons: Season[]; sources: ItemSource[] }>;
  animals: Record<string, { n: LocalizedName; house: string; produce: string[]; days: number; price: number; sprite: [string, number, number] }>;
  hay: ItemSource[];
  /** Pet type → name and breed id → sprite sheet. */
  pets: Record<string, { n: LocalizedName; breeds: Record<string, string> }>;
}

export interface MuseumData {
  artifacts: string[];
  minerals: string[];
  /** Item → geodes that can contain it and places it can be dug up. */
  sources: Record<string, { geodes: string[]; dig: string[] }>;
  descriptions: Record<string, LocalizedName>;
  /** Dig spot location key → display name. "Farm" and "Island" are translated by the site. */
  places: Record<string, LocalizedName>;
}

export interface GameData {
  items: Record<string, ItemData>;
  npcs: Record<string, NpcData>;
  universalGifts: Record<GiftTaste, string[]>;
  sheets: Record<string, [number, number]>;
  bundles: BundleStrings;
  achievements: Record<string, AchievementData>;
  achievementGoals: AchievementGoals;
  museum: MuseumData;
  calendar: { festivals: Festival[] };
  heartEvents: { events: HeartEvent[]; places: Record<string, LocalizedName> };
  farm: FarmData;
  worldMap: WorldMapData;
  schedules: Record<string, ScheduleData>;
  fish: Record<string, FishData>;
  walnuts: WalnutSpot[];
}

export interface FishData {
  /** Crab pot catch: "ocean" or "freshwater". */
  trap?: 'ocean' | 'freshwater';
  times?: Array<[number, number]>;
  seasons?: Season[];
  weather?: 'sunny' | 'rainy' | 'both';
  level?: number;
  locations: Array<{ location: string; seasons?: Season[]; area?: string }>;
}

export interface WalnutSpot {
  id: string;
  kind: 'bush' | 'buried';
  location: string;
  tile: [number, number];
}

const DATASETS = ['items', 'npcs', 'universalGifts', 'sheets', 'bundles', 'achievements', 'achievementGoals', 'museum', 'calendar', 'heartEvents', 'farm', 'worldMap', 'schedules', 'fish', 'walnuts'] as const;

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

/** Injects datasets directly (unit tests read the JSON files from disk). */
export function setGameData(value: GameData) {
  data = value;
}
