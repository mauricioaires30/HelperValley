import type { Season } from '@/data/gameData';
import type { SaveData } from '@/save/model';
import type { ShopDay } from './stock';

/** A shop the page lists: Data/Shops id, the NPC whose head we show, and when it's around. */
export interface ShopInfo {
  id: string;
  npc?: string;
  /** Item with the shop's look when there's no NPC. */
  icon?: string;
  /** Whether the shop is open/around on a day; omitted = every day. */
  open?: (day: ShopDay, save: SaveData) => boolean;
  /** Stock changes from day to day (random picks). */
  rotates?: boolean;
}

/** Where a shop is, to group the tabs. */
export const SHOP_AREAS = ['town', 'farmLife', 'away', 'island', 'visitors', 'festivals'] as const;
export type ShopArea = (typeof SHOP_AREAS)[number];

const AREA: Record<string, ShopArea> = {
  SeedShop: 'town',
  Joja: 'town',
  Saloon: 'town',
  Hospital: 'town',
  Bookseller: 'town',
  BooksellerTrade: 'town',
  IceCreamStand: 'town',
  BoxOffice: 'town',
  AnimalShop: 'farmLife',
  Carpenter: 'farmLife',
  Blacksmith: 'farmLife',
  FishShop: 'farmLife',
  Wizard: 'farmLife',
  ShadowShop: 'away',
  Sandy: 'away',
  DesertTrade: 'away',
  Casino: 'away',
  Dwarf: 'away',
  AdventureShop: 'away',
  IslandTrade: 'island',
  ResortBar: 'island',
  VolcanoShop: 'island',
  QiGemShop: 'island',
  Traveler: 'visitors',
  Raccoon: 'visitors',
  HatMouse: 'visitors',
};
export const shopArea = (id: string): ShopArea => (id.startsWith('Festival_') ? 'festivals' : (AREA[id] ?? 'visitors'));

/** 0 = Monday ... 6 = Sunday. */
export const weekday = (day: ShopDay) => (day.day - 1) % 7;
const on = (season: Season, ...days: number[]) => (d: ShopDay) => d.season === season && days.includes(d.day);
/** Any player (or the farm) has this mail flag. */
export const hasFlag = (save: SaveData, flag: string) => save.players.some((p) => p.mailReceived.includes(flag)) || save.broadcastedMail.includes(flag);
const ccDone = (save: SaveData) => hasFlag(save, 'ccIsComplete');
/** JojaMart closes for good when the Community Center is restored, or once it's turned into the movie theater. */
export const jojaMartGone = (save: SaveData) => hasFlag(save, 'ccIsComplete') || hasFlag(save, 'ccMovieTheater');
/** On the Joja route, the Community Center becomes a Joja warehouse once every project is bought. */
export const ccIsWarehouse = (save: SaveData) =>
  hasFlag(save, 'JojaMember') && ['jojaBoilerRoom', 'jojaCraftsRoom', 'jojaFishTank', 'jojaPantry', 'jojaVault'].every((f) => hasFlag(save, f));

export const SHOPS: ShopInfo[] = [
  { id: 'SeedShop', npc: 'Pierre', rotates: true, open: (d, save) => weekday(d) !== 2 || ccDone(save) },
  { id: 'Joja', npc: 'Morris', rotates: true, open: (_, save) => !jojaMartGone(save) },
  { id: 'AnimalShop', npc: 'Marnie', open: (d) => ![0, 1].includes(weekday(d)) },
  { id: 'Carpenter', npc: 'Robin', rotates: true, open: (d) => weekday(d) !== 1 },
  { id: 'Blacksmith', npc: 'Clint' },
  { id: 'FishShop', npc: 'Willy' },
  { id: 'Saloon', npc: 'Gus', rotates: true },
  { id: 'Hospital', npc: 'Harvey' },
  { id: 'ShadowShop', npc: 'Krobus', rotates: true },
  { id: 'Sandy', npc: 'Sandy', rotates: true },
  { id: 'DesertTrade', icon: '(O)60', rotates: true },
  // The cart comes Fridays and Sundays, and to the Night Market and the Desert Festival.
  { id: 'Traveler', icon: '(O)347', rotates: true, open: (d) => [4, 6].includes(weekday(d)) || on('winter', 15, 16, 17)(d) || on('spring', 15, 16, 17)(d) },
  { id: 'Wizard', npc: 'Wizard' },
  { id: 'Dwarf', npc: 'Dwarf' },
  { id: 'AdventureShop', npc: 'Marlon' },
  { id: 'IslandTrade', icon: '(O)830', rotates: true },
  { id: 'ResortBar', npc: 'Gus' },
  { id: 'VolcanoShop', npc: 'Dwarf' },
  { id: 'QiGemShop', npc: 'MrQi' },
  { id: 'Casino', npc: 'MrQi' },
  { id: 'Bookseller', icon: '(O)Book_Trash' },
  { id: 'BooksellerTrade', icon: '(O)Book_Trash' },
  { id: 'Raccoon', icon: '(O)Book_WildSeeds' },
  { id: 'HatMouse', icon: '(H)0' },
  { id: 'IceCreamStand', icon: '(O)233', open: (d) => d.season === 'summer' },
  { id: 'BoxOffice', icon: '(O)809' },
  // Festival stalls, on their day only.
  { id: 'Festival_EggFestival_Pierre', npc: 'Pierre', open: on('spring', 13) },
  { id: 'Festival_FlowerDance_Pierre', npc: 'Pierre', open: on('spring', 24) },
  { id: 'Festival_Luau_Pierre', npc: 'Pierre', open: on('summer', 11) },
  { id: 'Festival_DanceOfTheMoonlightJellies_Pierre', npc: 'Pierre', open: on('summer', 28) },
  { id: 'Festival_StardewValleyFair_StarTokens', icon: '(O)PrizeTicket', open: on('fall', 16) },
  { id: 'Festival_SpiritsEve_Pierre', npc: 'Pierre', open: on('fall', 27) },
  { id: 'Festival_FestivalOfIce_TravelingMerchant', icon: '(O)347', open: on('winter', 8) },
  { id: 'Festival_NightMarket_DecorationBoat', icon: '(F)2000', open: on('winter', 15, 16, 17) },
  { id: 'Festival_NightMarket_MagicBoat_Day1', npc: 'Wizard', open: on('winter', 15) },
  { id: 'Festival_NightMarket_MagicBoat_Day2', npc: 'Wizard', open: on('winter', 16) },
  { id: 'Festival_NightMarket_MagicBoat_Day3', npc: 'Wizard', open: on('winter', 17) },
  { id: 'Festival_FeastOfTheWinterStar_Pierre', npc: 'Pierre', open: on('winter', 25) },
];
