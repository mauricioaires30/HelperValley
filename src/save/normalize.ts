import type { Season } from '@/data/gameData';
import type { CommunityCenter, Container, Friendship, ItemStack, Player, SaveData, SaveSummary } from './model';
import {
  arr,
  bool,
  dict,
  dictEntries,
  node,
  num,
  numbers,
  parseXml,
  strings,
  text,
  xsiType,
  type XmlNode,
  type XmlValue,
} from './xml';

const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];
const TOOL_TYPES = new Set(['Axe', 'Pickaxe', 'Hoe', 'WateringCan', 'FishingRod', 'Pan', 'MilkPail', 'Shears', 'Wand', 'GenericTool']);

function season(value: XmlValue): Season {
  const t = text(value)?.toLowerCase();
  if (t && (SEASONS as string[]).includes(t)) return t as Season;
  // Some fields store the season as an index.
  return SEASONS[num(value)] ?? 'spring';
}

/** Rebuilds the qualified id ("(O)24") that 1.6 items carry at runtime but don't serialize. */
export function qualifiedId(item: XmlNode): string {
  const id = text(item.itemId) ?? text(item.parentSheetIndex) ?? '';
  const type = xsiType(item) ?? 'Object';
  if (type === 'MeleeWeapon' || type === 'Slingshot') return `(W)${id}`;
  if (type === 'Hat') return `(H)${id}`;
  if (type === 'Boots') return `(B)${id}`;
  if (type === 'Furniture' || type.endsWith('Furniture')) return `(F)${id}`;
  if (type === 'Trinket') return `(TR)${id}`;
  if (type === 'Clothing') return `${num(item.clothesType) === 1 ? '(P)' : '(S)'}${id}`;
  if (type === 'Wallpaper') return `${bool(item.isFloor) ? '(FL)' : '(WP)'}${id}`;
  if (TOOL_TYPES.has(type)) return `(T)${id}`;
  return `${bool(item.bigCraftable) ? '(BC)' : '(O)'}${id}`;
}

function itemStack(value: XmlValue): ItemStack | null {
  const item = node(value);
  if (!item) return null; // empty inventory slots serialize as <Item xsi:nil="true" />
  if (text(item['@_xsi:nil']) === 'true') return null;
  const quality = num(item.quality);
  return {
    id: qualifiedId(item),
    name: text(item.name) ?? '',
    stack: Math.max(1, num(item.stack, 1)),
    quality: (quality === 1 || quality === 2 || quality === 4 ? quality : 0) as ItemStack['quality'],
  };
}

function itemList(value: XmlValue, tag = 'Item'): ItemStack[] {
  return arr(node(value)?.[tag]).flatMap((v) => itemStack(v) ?? []);
}

const toNumber = (v: XmlValue) => num(v);

function friendship(value: XmlValue): Friendship {
  const f = node(node(value)?.Friendship ?? value) ?? {};
  return {
    points: num(f.Points),
    giftsThisWeek: num(f.GiftsThisWeek),
    giftsToday: num(f.GiftsToday),
    talkedToday: bool(f.TalkedToToday),
    status: text(f.Status) ?? 'Friendly',
  };
}

function flattenStats(value: XmlValue): { stats: Record<string, number>; monstersKilled: Record<string, number> } {
  const s = node(value) ?? {};
  const stats: Record<string, number> = {};
  for (const [key, v] of Object.entries(s)) {
    if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) stats[key] = Number(v);
  }
  // 1.6 stores most counters in a Values dictionary.
  Object.assign(stats, dict(s.Values, toNumber));
  return { stats, monstersKilled: dict(s.specificMonstersKilled, toNumber) };
}

export function normalizePlayer(value: XmlValue, isHost: boolean): Player {
  const p = node(value) ?? {};
  const { stats, monstersKilled } = flattenStats(p.stats);
  const experience = numbers(p.experiencePoints);
  return {
    id: text(p.UniqueMultiplayerID) ?? '0',
    name: text(p.name) ?? '',
    isHost,
    farmName: text(p.farmName) ?? '',
    money: num(p.money),
    totalMoneyEarned: num(p.totalMoneyEarned),
    skills: {
      farming: num(p.farmingLevel),
      fishing: num(p.fishingLevel),
      foraging: num(p.foragingLevel),
      mining: num(p.miningLevel),
      combat: num(p.combatLevel),
      luck: num(p.luckLevel),
    },
    experience,
    professions: numbers(p.professions),
    spouse: text(p.spouse) || undefined,
    houseUpgradeLevel: num(p.houseUpgradeLevel),
    deepestMineLevel: num(p.deepestMineLevel),
    qiGems: num(p.qiGems),
    millisecondsPlayed: num(p.millisecondsPlayed),
    achievements: numbers(p.achievements),
    mailReceived: strings(p.mailReceived),
    eventsSeen: strings(p.eventsSeen),
    secretNotesSeen: numbers(p.secretNotesSeen),
    specialItems: strings(p.specialItems),
    cookingRecipes: dict(p.cookingRecipes, toNumber),
    recipesCooked: dict(p.recipesCooked, toNumber),
    craftingRecipes: dict(p.craftingRecipes, toNumber),
    basicShipped: dict(p.basicShipped, toNumber),
    fishCaught: dict(p.fishCaught, (v) => {
      const [count = 0, size = -1] = numbers(v);
      return [count, size] as [number, number];
    }),
    mineralsFound: dict(p.mineralsFound, toNumber),
    archaeologyFound: dict(p.archaeologyFound, (v) => numbers(v)[0] ?? num(v)),
    giftedItems: dict(p.giftedItems, (v) => dict(v, toNumber)),
    friendships: dict(p.friendshipData, friendship),
    stats,
    monstersKilled,
    inventory: itemList(p.items),
  };
}

/** Walks every location (including building interiors) depth-first. */
function* walkLocations(locations: XmlValue[]): Generator<XmlNode> {
  for (const value of locations) {
    const location = node(value);
    if (!location) continue;
    yield location;
    for (const building of arr(node(location.buildings)?.Building)) {
      const indoors = node(node(building)?.indoors);
      if (indoors && text(indoors['@_xsi:nil']) !== 'true') yield* walkLocations([indoors]);
    }
  }
}

function collectContainers(locations: XmlValue[], globalInventories: XmlValue): Container[] {
  const containers: Container[] = [];
  for (const location of walkLocations(locations)) {
    const name = text(location.uniqueName) || text(location.name) || '?';

    for (const [key, value] of dictEntries(location.objects)) {
      const object = node(value);
      if (!object) continue;
      const k = node(key);
      const tile: [number, number] = [num(k?.X), num(k?.Y)];
      const type = xsiType(object);
      if (type === 'Chest' && bool(object.playerChest)) {
        containers.push({ location: name, kind: 'chest', tile, color: text(node(object.playerChoiceColor)?.PackedValue), items: itemList(object.Items ?? object.items) });
      } else if (xsiType(object.heldObject) === 'Chest') {
        // Auto-grabbers keep their contents in a held chest.
        containers.push({ location: name, kind: 'grabber', tile, items: itemList(node(object.heldObject)?.Items ?? node(object.heldObject)?.items) });
      }
    }

    const fridge = node(location.fridge);
    if (fridge && (fridge.Items || fridge.items)) {
      containers.push({ location: name, kind: 'fridge', items: itemList(fridge.Items ?? fridge.items) });
    }
  }

  for (const [key, value] of dictEntries(globalInventories)) {
    containers.push({ location: text(key) ?? 'global', kind: 'global', items: arr(node(value)?.Item).flatMap((v) => itemStack(v) ?? []) });
  }
  return containers.filter((c) => c.items.length > 0);
}

function communityCenter(locations: XmlValue[], bundleData: XmlValue, host: Player): CommunityCenter {
  const cc = locations.map(node).find((l) => xsiType(l) === 'CommunityCenter' || text(l?.name) === 'CommunityCenter');
  const bundles: Record<string, boolean[]> = {};
  for (const [key, value] of dictEntries(cc?.bundles)) {
    bundles[text(key) ?? ''] = arr(node(value)?.boolean).map(bool);
  }
  const rewards: Record<string, boolean> = {};
  for (const [key, value] of dictEntries(cc?.bundleRewards)) rewards[text(key) ?? ''] = bool(value);
  return {
    bundles,
    rewards,
    areasComplete: arr(node(cc?.areasComplete)?.boolean).map(bool),
    bundleData: dict(bundleData, (v) => text(v) ?? ''),
    isJoja: host.mailReceived.includes('JojaMember'),
  };
}

function museum(locations: XmlValue[]): Record<string, string> {
  const library = locations.map(node).find((l) => xsiType(l) === 'LibraryMuseum');
  const pieces: Record<string, string> = {};
  for (const [key, value] of dictEntries(library?.museumPieces)) {
    const v = node(key);
    pieces[`${num(v?.X)},${num(v?.Y)}`] = text(value) ?? '';
  }
  return pieces;
}

/** Farmhands live in SaveGame/farmhands (1.6) or inside cabin buildings (1.5 and earlier). */
function farmhandNodes(save: XmlNode, locations: XmlValue[]): XmlValue[] {
  const modern = arr(node(save.farmhands)?.Farmer);
  if (modern.length) return modern;
  const legacy: XmlValue[] = [];
  for (const location of walkLocations(locations)) {
    const farmhand = node(location.farmhand);
    if (farmhand && text(farmhand.name)) legacy.push(farmhand);
  }
  return legacy;
}

export function normalizeSave(xml: string, folder: string): SaveData {
  const save = node(parseXml(xml).SaveGame);
  if (!save) throw new Error('Not a Stardew Valley save file');

  const locations = arr(node(save.locations)?.GameLocation);
  const host = normalizePlayer(save.player, true);
  const players = [host, ...farmhandNodes(save, locations).map((f) => normalizePlayer(f, false))].filter((p) => p.name);

  return {
    folder,
    uniqueId: text(save.uniqueIDForThisGame) ?? folder,
    gameVersion: text(save.gameVersion) ?? '',
    farmType: num(save.whichFarm),
    date: { season: season(save.currentSeason), day: num(save.dayOfMonth, 1), year: num(save.year, 1) },
    dailyLuck: num(save.dailyLuck),
    weatherTomorrow: text(save.weatherForTomorrow) ?? '',
    isRaining: bool(save.isRaining),
    goldenWalnuts: num(save.goldenWalnuts),
    goldenWalnutsFound: num(save.goldenWalnutsFound),
    lostBooksFound: num(save.lostBooksFound),
    players,
    communityCenter: communityCenter(locations, save.bundleData, host),
    museum: museum(locations),
    containers: collectContainers(locations, save.globalInventories),
    broadcastedMail: strings(save.broadcastedMail),
    completedSpecialOrders: dictEntries(save.completedSpecialOrders).map(([k]) => text(k) ?? '').filter(Boolean),
  };
}

/** Reads the small SaveGameInfo file (a serialized Farmer) for the save picker. */
export function normalizeSummary(xml: string, folder: string, modified: number): SaveSummary {
  const farmer = node(parseXml(xml).Farmer) ?? {};
  return {
    folder,
    farmName: text(farmer.farmName) ?? '',
    playerName: text(farmer.name) ?? '',
    season: season(farmer.seasonForSaveGame),
    day: num(farmer.dayOfMonthForSaveGame, 1),
    year: num(farmer.yearForSaveGame, 1),
    money: num(farmer.money),
    millisecondsPlayed: num(farmer.millisecondsPlayed),
    gameVersion: text(farmer.gameVersion) ?? '',
    modified,
  };
}
