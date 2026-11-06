import type { Season } from '@/data/gameData';

/** Lightweight info shown in the save picker (from the small SaveGameInfo file). */
export interface SaveSummary {
  /** Save folder name, e.g. "MyFarm_123456789". */
  folder: string;
  farmName: string;
  playerName: string;
  season: Season;
  day: number;
  year: number;
  money: number;
  millisecondsPlayed: number;
  gameVersion: string;
  /** lastModified of the main save file (ms). */
  modified: number;
}

export interface ItemStack {
  /** Qualified item id, e.g. "(O)24". */
  id: string;
  name: string;
  stack: number;
  quality: 0 | 1 | 2 | 4;
}

/** Any item container: chests, fridges, auto-grabbers, Junimo chests, player inventory. */
export interface Container {
  /** Location name, e.g. "Farm", "FarmHouse", "Barn7". */
  location: string;
  /** Unique id when several buildings share a name. */
  locationId: string;
  kind: 'chest' | 'fridge' | 'grabber' | 'global' | 'other';
  tile?: [number, number];
  /** Player-chosen chest color index, when set. */
  color?: string;
  items: ItemStack[];
}

export interface Friendship {
  points: number;
  giftsThisWeek: number;
  giftsToday: number;
  talkedToday: boolean;
  /** Friendly, Dating, Engaged, Married, Divorced, Roommate. */
  status: string;
}

export interface Skills {
  farming: number;
  fishing: number;
  foraging: number;
  mining: number;
  combat: number;
  luck: number;
}

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  farmName: string;
  money: number;
  totalMoneyEarned: number;
  skills: Skills;
  experience: number[];
  professions: number[];
  spouse?: string;
  houseUpgradeLevel: number;
  deepestMineLevel: number;
  qiGems: number;
  millisecondsPlayed: number;
  achievements: number[];
  mailReceived: string[];
  eventsSeen: string[];
  secretNotesSeen: number[];
  specialItems: string[];
  /** Known cooking recipes by name → times cooked (legacy counter, usually 0). */
  cookingRecipes: Record<string, number>;
  /** Cooked dishes by item id → count. */
  recipesCooked: Record<string, number>;
  /** Known crafting recipes by name → times crafted. */
  craftingRecipes: Record<string, number>;
  /** Shipped items by item id → count. */
  basicShipped: Record<string, number>;
  /** Fish by qualified id → [count, largest size]. */
  fishCaught: Record<string, [number, number]>;
  mineralsFound: Record<string, number>;
  archaeologyFound: Record<string, number>;
  /** NPC name → item id → times gifted. */
  giftedItems: Record<string, Record<string, number>>;
  friendships: Record<string, Friendship>;
  /** Flattened stats (e.g. "stepsTaken", "monstersKilled") plus monster kill counts. */
  stats: Record<string, number>;
  monstersKilled: Record<string, number>;
  inventory: ItemStack[];
}

export interface CommunityCenter {
  /** Bundle index → completed slot flags. */
  bundles: Record<string, boolean[]>;
  /** Bundle index → reward collected. */
  rewards: Record<string, boolean>;
  /** Area index → room completed. */
  areasComplete: boolean[];
  /** Bundle definitions for this save ("Room/index" → raw definition), randomized bundles included. */
  bundleData: Record<string, string>;
  isJoja: boolean;
}

export interface SaveData {
  folder: string;
  uniqueId: string;
  gameVersion: string;
  farmType: number;
  date: { season: Season; day: number; year: number };
  dailyLuck: number;
  weatherTomorrow: string;
  isRaining: boolean;
  goldenWalnuts: number;
  goldenWalnutsFound: number;
  lostBooksFound: number;
  players: Player[];
  communityCenter: CommunityCenter;
  /** Museum tile "x,y" → donated item id. */
  museum: Record<string, string>;
  containers: Container[];
  /** Mail flags shared by the whole farm (team), e.g. "ccBoilerRoom" for Joja. */
  broadcastedMail: string[];
  completedSpecialOrders: string[];
}
