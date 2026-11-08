import type { Season } from '@/data/gameData';
import { readFarm } from './farm';
import type { QuestState } from './model';
import type { ChildState, Clothing, LayoutState, SlimeHutchState, CommunityCenter, Container, Friendship, ItemStack, Player, PlayerLook, SaveData, SaveSummary } from './model';
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

/** Pre-1.6 saves stored weather as an index; 1.6 uses ids like "Sun" or "Rain". */
const LEGACY_WEATHER = ['Sun', 'Rain', 'Wind', 'Storm', 'Festival', 'Snow', 'Wedding'];

function weather(value: XmlValue): string {
  const t = text(value) ?? '';
  return /^\d+$/.test(t) ? (LEGACY_WEATHER[Number(t)] ?? '') : t;
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

const qualify = (id: string | undefined) => (id ? (id.startsWith('(') ? id : `(O)${id}`) : undefined);

function questState(q: XmlNode): QuestState {
  const tileX = text(q.tileX);
  return {
    id: text(q.id) ?? '',
    type: xsiType(q) ?? 'Quest',
    title: text(q._questTitle) || text(q.questTitle) || '',
    description: text(q._questDescription) ?? '',
    objective: text(q._currentObjective) ?? '',
    daysLeft: num(q.daysLeft),
    reward: num(q.moneyReward),
    daily: bool(q.dailyQuest),
    completed: bool(q.completed),
    npc: text(q.target) || text(q.npcName) || undefined,
    item: qualify(text(q.ItemId) || text(q.item) || text(q.whichFish) || text(q.resource) || text(q.itemIndex) || undefined),
    count: num(q.numberToFish) || num(q.numberToKill) || num(q.number) || undefined,
    monster: text(q.monsterName) || undefined,
    location: text(q.locationOfItem) || text(q.whereToGo) || undefined,
    tile: tileX ? [num(q.tileX), num(q.tileY)] : undefined,
  };
}

/** XNA Color (<R><G><B>) to #rrggbb. */
function color(value: XmlValue, fallback = '#ffffff'): string {
  const c = node(value);
  if (!c || c.R === undefined) return fallback;
  return '#' + [c.R, c.G, c.B].map((v) => num(v).toString(16).padStart(2, '0')).join('');
}

function clothing(value: XmlValue): Clothing | undefined {
  const c = node(value);
  if (!c || text(c['@_xsi:nil']) === 'true') return undefined;
  return { id: text(c.itemId) ?? '', index: num(c.indexInTileSheet), color: color(c.clothesColor), prismatic: bool(c.isPrismatic) };
}

function look(p: XmlNode): PlayerLook {
  const gender = text(p.Gender);
  const hat = node(p.hat);
  const boots = node(p.boots);
  return {
    male: gender ? gender === 'Male' : text(p.isMale) !== 'false',
    skin: num(p.skin),
    hair: num(p.hair),
    hairColor: color(p.hairstyleColor, '#c15b32'),
    prismaticHair: bool(p.prismaticHair),
    eyeColor: color(p.newEyeColor, '#7a4434'),
    accessory: num(p.accessory, -1),
    shirt: clothing(p.shirtItem),
    pants: clothing(p.pantsItem),
    hat: hat && text(hat['@_xsi:nil']) !== 'true' ? text(hat.itemId) : undefined,
    shoeColor: boots && text(boots['@_xsi:nil']) !== 'true' ? num(boots.indexInColorSheet, 12) : 12,
  };
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
    daysUntilHouseUpgrade: num(p.daysUntilHouseUpgrade, -1),
    deepestMineLevel: num(p.deepestMineLevel),
    qiGems: num(p.qiGems),
    millisecondsPlayed: num(p.millisecondsPlayed),
    achievements: numbers(p.achievements),
    mailReceived: strings(p.mailReceived),
    // Serialized as <int> elements even though some ids are text ("festival_spring13").
    eventsSeen: [...strings(p.eventsSeen), ...strings(p.eventsSeen, 'int')],
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
    look: look(p),
    trashCanLevel: num(p.trashCanLevel),
    hasRustyKey: bool(p.hasRustyKey) || strings(p.mailReceived).includes('HasRustyKey'),
    hasSkullKey: bool(p.hasSkullKey) || strings(p.mailReceived).includes('HasSkullKey'),
    quests: arr(node(p.questLog)?.Quest).flatMap((q) => {
      const quest = node(q);
      return quest ? [questState(quest)] : [];
    }),
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
    const name = text(location.name) || '?';
    // Building interiors share a name ("Shed"); uniqueName adds a GUID that tells them apart.
    const locationId = text(location.uniqueName) || name;

    for (const [key, value] of dictEntries(location.objects)) {
      const object = node(value);
      if (!object) continue;
      const k = node(key);
      const tile: [number, number] = [num(k?.X), num(k?.Y)];
      const type = xsiType(object);
      if (type === 'Chest' && bool(object.playerChest)) {
        containers.push({ location: name, locationId, kind: 'chest', tile, color: text(node(object.playerChoiceColor)?.PackedValue), items: itemList(object.Items ?? object.items) });
      } else if (xsiType(object.heldObject) === 'Chest') {
        // Auto-grabbers keep their contents in a held chest.
        containers.push({ location: name, locationId, kind: 'grabber', tile, items: itemList(node(object.heldObject)?.Items ?? node(object.heldObject)?.items) });
      }
    }

    const fridge = node(location.fridge);
    if (fridge && (fridge.Items || fridge.items)) {
      containers.push({ location: name, locationId, kind: 'fridge', items: itemList(fridge.Items ?? fridge.items) });
    }
  }

  for (const [key, value] of dictEntries(globalInventories)) {
    containers.push({ location: text(key) ?? 'global', locationId: text(key) ?? 'global', kind: 'global', items: arr(node(value)?.Item).flatMap((v) => itemStack(v) ?? []) });
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
    weatherTomorrow: weather(save.weatherForTomorrow),
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
    farm: readFarm(locations),
    specialOrders: arr(node(save.specialOrders)?.SpecialOrder).flatMap((o) => {
      const order = node(o);
      if (!order) return [];
      return [
        {
          key: text(order.questKey) ?? '',
          requester: text(order.requester) ?? '',
          type: text(order.orderType) ?? '',
          dueDate: num(order.dueDate),
          state: text(order.questState) ?? '',
          objectives: arr(order.objectives).flatMap((v) => {
            const obj = node(v);
            return obj ? [{ description: text(obj.description) ?? '', current: num(obj.currentCount), max: num(obj.maxCount) }] : [];
          }),
        },
      ];
    }),
    walnutsCollected: strings(save.collectedNutTracker),
    walnutDrops: dict(save.limitedNutDrops, (v) => num(v)),
    fieldOffice: (() => {
      const office = locations.map(node).find((l) => xsiType(l) === 'IslandFieldOffice');
      if (!office) return null;
      return {
        pieces: arr(office.piecesDonated).flatMap((v) => (node(v)?.boolean ? arr(node(v)!.boolean) : [v])).map(bool),
        plantsLeft: bool(office.plantsRestoredLeft),
        plantsRight: bool(office.plantsRestoredRight),
      };
    })(),
    grandpaScore: num(locations.map(node).find((l) => xsiType(l) === 'Farm' || text(l?.name) === 'Farm')?.grandpaScore),
    children: findChildren(locations),
    slimeHutches: findSlimeHutches(locations),
    layouts: readLayouts(locations),
    world: {
      profitMargin: num(node(save.player)?.difficultyModifier, 1),
      dishOfTheDay: node(save.dishOfTheDay) && text(node(save.dishOfTheDay)!['@_xsi:nil']) !== 'true' ? qualifiedId(node(save.dishOfTheDay)!) : undefined,
      timesFedRaccoons: num(save.timesFedRaccoons),
      goldenCoconutCracked: bool(save.goldenCoconutCracked),
      visitsUntilY1Guarantee: num(save.visitsUntilY1Guarantee, -1),
      legacyRandom: bool(save.useLegacyRandom),
    },
    resort: (() => {
      const south = locations.map(node).find((l) => text(l?.name) === 'IslandSouth');
      return { restored: bool(south?.resortRestored), openToday: bool(south?.resortOpenToday) };
    })(),
  };
}

/** "Big Shed" → "big-shed", like the planner's names. */
const slug = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '-');

/** Building types named differently in the planner. */
const PLANNER_BUILDING: Record<string, string> = { Farmhouse: 'house', Greenhouse: 'greenhouse-repaired' };

/** Objects, furniture, terrain features and buildings of the farm and the island farm. */
function readLayouts(locations: XmlValue[]): Record<string, LayoutState> {
  const out: Record<string, LayoutState> = {};
  for (const value of locations) {
    const location = node(value);
    const name = text(location?.name);
    if (!location || (name !== 'Farm' && name !== 'IslandWest')) continue;
    const tiles: LayoutState['tiles'] = [];
    const at = (key: XmlValue) => [num(node(key)?.X), num(node(key)?.Y)] as const;
    for (const [key, v] of dictEntries(location.objects)) {
      const obj = node(v);
      const objName = text(obj?.name);
      if (objName) tiles.push([...at(key), slug(objName)]);
    }
    for (const [key, v] of dictEntries(location.terrainFeatures)) {
      const tf = node(v);
      const type = xsiType(tf);
      if (type === 'Tree') tiles.push([...at(key), `tree:${text(tf?.treeType) ?? ''}`]);
      else if (type === 'FruitTree') tiles.push([...at(key), `fruit:${text(tf?.treeId) ?? ''}`]);
      else if (type === 'Grass') tiles.push([...at(key), 'grass']);
      else if (type === 'Flooring') tiles.push([...at(key), `floor:${text(tf?.whichFloor) ?? ''}`]);
      else if (type === 'HoeDirt') {
        const crop = node(tf?.crop);
        if (crop) tiles.push([...at(key), `crop:${text(crop.netSeedIndex) ?? text(crop.seedIndex) ?? ''}:${text(crop.indexOfHarvest) ?? ''}`]);
      }
    }
    // Furniture placed outdoors (tubs of flowers, seasonal plants...).
    for (const f of arr(node(location.furniture)?.Furniture)) {
      const furniture = node(f);
      const fName = text(furniture?.name);
      if (fName) tiles.push([num(node(furniture?.tileLocation)?.X), num(node(furniture?.tileLocation)?.Y), slug(fName)]);
    }
    const buildings: LayoutState['buildings'] = arr(node(location.buildings)?.Building).flatMap((b) => {
      const building = node(b);
      const type = text(building?.buildingType);
      return type ? [[num(building!.tileX), num(building!.tileY), PLANNER_BUILDING[type] ?? slug(type)] as [number, number, string]] : [];
    });
    out[name] = { tiles, buildings };
  }
  return out;
}

/** Slime hutches: slimes, troughs, slime balls and the slime machines inside. */
function findSlimeHutches(locations: XmlValue[]): SlimeHutchState[] {
  const out: SlimeHutchState[] = [];
  for (const location of walkLocations(locations)) {
    if (xsiType(location) !== 'SlimeHutch') continue;
    const slimes = arr(node(location.characters)?.NPC).flatMap((c) => {
      const slime = node(c);
      return slime && xsiType(slime) === 'GreenSlime' ? [{ name: text(slime.name) ?? 'Green Slime', color: color(slime.color, '#5ac74a') }] : [];
    });
    const names = dictEntries(location.objects).map(([, v]) => text(node(v)?.name) ?? '');
    const count = (n: string) => names.filter((x) => x === n).length;
    out.push({
      slimes,
      water: arr(node(location.waterSpots)?.boolean).map(bool),
      sprinkler: names.some((n) => n.endsWith('Sprinkler')),
      balls: count('Slime Ball'),
      wickedStatue: count('Wicked Statue') > 0,
      incubators: count('Slime Incubator'),
      eggPresses: count('Slime Egg-Press'),
    });
  }
  return out;
}

/** Children live in the farmhouse (or a cabin) as Child NPCs. */
function findChildren(locations: XmlValue[]): ChildState[] {
  const out: ChildState[] = [];
  for (const location of walkLocations(locations)) {
    for (const c of arr(node(location.characters)?.NPC)) {
      const child = node(c);
      if (!child || xsiType(child) !== 'Child') continue;
      const gender = text(child.Gender) ?? text(child.gender);
      out.push({
        name: text(child.name) ?? '',
        male: gender ? gender === 'Male' || gender === '0' : true,
        age: num(child.age ?? child.Age),
        daysOld: num(child.daysOld),
        dark: bool(child.darkSkinned),
        parent: text(child.idOfParent) ?? '',
      });
    }
  }
  return out;
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
