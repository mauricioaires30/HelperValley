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

/** A quest in the player's journal. Text fields are in the save's language. */
export interface QuestState {
  id: string;
  /** Serialized quest class: ItemDeliveryQuest, FishingQuest, SlayMonsterQuest, LostItemQuest... */
  type: string;
  title: string;
  description: string;
  objective: string;
  /** Days left for timed quests (0 = no limit). */
  daysLeft: number;
  reward: number;
  daily: boolean;
  completed: boolean;
  /** Who asked / who to bring it to. */
  npc?: string;
  /** Item, fish or resource involved (qualified id). */
  item?: string;
  count?: number;
  monster?: string;
  /** Where to go or where the lost item is. */
  location?: string;
  tile?: [number, number];
}

/** A special order from the town board or Mr. Qi (shared by the farm). */
export interface SpecialOrderState {
  key: string;
  requester: string;
  type: string;
  dueDate: number;
  state: string;
  objectives: Array<{ description: string; current: number; max: number }>;
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
  quests: QuestState[];
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
  farm: FarmState;
  /** Ginger Island resort: built, and open to villagers today. */
  resort: { restored: boolean; openToday: boolean };
  fieldOffice: FieldOfficeState | null;
  specialOrders: SpecialOrderState[];
  /** Golden walnut ids already collected (e.g. "Bush_IslandEast_17_37"). */
  walnutsCollected: string[];
  /** Repeatable walnut sources found so far, e.g. { IslandFishing: 5, Darts: 3 }. */
  walnutDrops: Record<string, number>;
}

/** A crop growing on a tile or in a garden pot. */
export interface CropState {
  seed: string;
  harvest: string;
  /** 0 = ready to harvest today; -1 for dead crops. */
  daysToHarvest: number;
  dead: boolean;
  /** Harvested before and now regrowing. */
  regrowing: boolean;
  fertilizer?: string;
  inPot: boolean;
}

/** A planting area: the farm, the greenhouse or the island farm. */
export interface FarmArea {
  location: string;
  /** Hoed tiles, planted or not (garden pots counted separately). */
  tilled: number;
  pots: number;
  crops: CropState[];
  sprinklers: { basic: number; quality: number; iridium: number; nozzles: number };
  /** Tiles watered by sprinklers (overlaps not removed). */
  sprinklerTiles: number;
  beeHouses: number;
  machines: Record<string, number>;
  trees: FruitTreeState[];
}

export interface FruitTreeState {
  /** Sapling id, e.g. "(O)633" for an apple tree. */
  sapling: string;
  /** Days left to grow up (0 when mature). */
  daysToMature: number;
  /** Fruit hanging on the tree right now. */
  fruits: number;
  fruit?: string;
}

export interface FarmAnimalState {
  type: string;
  name: string;
  /** 0–1000; 200 per heart. */
  friendship: number;
  /** 0–255. */
  happiness: number;
  /** An auto-petter covers it: no need to pet by hand. */
  autoPet: boolean;
  ateAnimalCracker: boolean;
  /** Building it lives in, e.g. "Deluxe Barn". */
  building: string;
}

/** A machine with something inside: kegs, jars, bee houses, crab pots, tappers... */
export interface MachineState {
  /** Qualified machine id, e.g. "(BC)12" for a keg or "(O)710" for a crab pot. */
  machine: string;
  /** Qualified id of what it's making. */
  output: string;
  ready: boolean;
  /** Game minutes left until ready (0 when ready). */
  minutes: number;
  location: string;
}

export interface FishPondState {
  fish: string;
  count: number;
  max: number;
  /** Item waiting to be collected, if any. */
  output: string | null;
}

export interface FarmState {
  areas: FarmArea[];
  animals: FarmAnimalState[];
  silos: number;
  hay: number;
  machines: MachineState[];
  ponds: FishPondState[];
  pets: Array<{ name: string; type: string; breed: string; friendship: number }>;
  horses: string[];
  /** Pet bowls and whether each has water today. */
  bowls: boolean[];
}

/** Ginger Island field office: 11 fossil pieces and the two plant surveys. */
export interface FieldOfficeState {
  pieces: boolean[];
  plantsLeft: boolean;
  plantsRight: boolean;
}
