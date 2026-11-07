import { gameData, getItem, type Season } from '@/data/gameData';
import type { Player, SaveData } from '@/save/model';
import { checkConditions, SEASONS, type QueryContext } from './conditions';
import { createDaySaveRandom, type DotNetRandom, type SeedContext } from './random';

/**
 * ShopBuilder.GetShopStock, step by step, so the day random is consumed in the same order as the game:
 * item condition → random item id → item query (RANDOM_ITEMS shuffles the whole pool) → stack →
 * shop price modifiers → item price modifiers → stock modifiers.
 */

export interface QuantityModifier {
  Condition?: string;
  Modification: number;
  Amount: number;
  RandomAmount?: number[];
}

export interface ShopItemData {
  Id: string;
  ItemId?: string;
  RandomItemId?: string[];
  Condition?: string;
  PerItemCondition?: string;
  MaxItems?: number;
  AvoidRepeat?: boolean;
  Price?: number;
  TradeItemId?: string;
  TradeItemAmount?: number;
  UseObjectDataPrice?: boolean;
  IgnoreShopPriceModifiers?: boolean;
  ApplyProfitMargins?: boolean;
  PriceModifiers?: QuantityModifier[];
  PriceModifierMode?: number;
  AvailableStock?: number;
  AvailableStockLimit?: number;
  AvailableStockModifiers?: QuantityModifier[];
  AvailableStockModifierMode?: number;
  IsRecipe?: boolean;
  MinStack?: number;
  MaxStack?: number;
  StackModifiers?: QuantityModifier[];
  StackModifierMode?: number;
  QualityModifiers?: QuantityModifier[];
  QualityModifierMode?: number;
}

export interface ShopData {
  currency: number;
  applyProfitMargins?: boolean;
  priceModifiers?: QuantityModifier[];
  priceModifierMode?: number;
  owners: Array<{ name: string; condition?: string; closed: boolean }>;
  items: ShopItemData[];
}

export interface ShopsData {
  shops: Record<string, ShopData>;
  pools: {
    /** [id, price, category, type, excludeFromRandomSale] */
    O: Array<[string, number, number, string, number]>;
    /** [id, price, offLimits] */
    F: Array<[string, number, number]>;
    S: Array<[string, number]>;
    WP: string[];
    FL: string[];
  };
  prices: { BC: Record<string, number>; P: Record<string, number>; B: Record<string, number>; T: Record<string, number> };
  saplings: string[];
}

export interface StockEntry {
  /** Qualified item id. */
  id: string;
  price: number;
  /** Trade item (qualified) and amount, for barter shops. */
  trade?: { id: string; amount: number };
  /** Units available today; null = unlimited. */
  stock: number | null;
  stack: number;
  recipe: boolean;
  /** The item's condition couldn't be checked from the save (e.g. a hidden random roll). */
  maybe: boolean;
}

export interface ShopStock {
  items: StockEntry[];
  /** Something before the end consumed randomness we couldn't follow; later random picks may differ. */
  uncertainFrom: number | null;
}

/** The day being simulated. */
export interface ShopDay {
  season: Season;
  day: number;
  year: number;
  daysPlayed: number;
}

const QUALIFIED = /^\((\w+)\)/;
const qualify = (id: string) => (QUALIFIED.test(id) ? id : `(O)${id}`);

/** QuantityModifier.Apply. */
function applyModification(value: number, mod: number, amount: number): number {
  switch (mod) {
    case 0:
      return value + amount;
    case 1:
      return value - amount;
    case 2:
      return value * amount;
    case 3:
      return value / amount;
    case 4:
      return amount;
    default:
      return value;
  }
}

/** Utility.ApplyQuantityModifiers (float math like the game). */
function applyQuantityModifiers(
  value: number,
  modifiers: QuantityModifier[] | undefined,
  mode: number | undefined,
  ctx: QueryContext,
  flagUnknown: () => void,
): number {
  if (!modifiers?.length) return value;
  const f = Math.fround;
  let result: number | null = null;
  for (const m of modifiers) {
    let amount = f(m.Amount);
    if (m.RandomAmount?.length) amount = f(ctx.random!.chooseFrom(m.RandomAmount)!);
    const pass = checkConditions(m.Condition, ctx);
    if (pass === null) flagUnknown();
    if (!pass) continue;
    if (mode === 1 || mode === 2) {
      // Minimum / Maximum: each modifier applies to the original value; keep the lowest / highest.
      const candidate = f(applyModification(value, m.Modification, amount));
      if (result === null || (mode === 1 ? candidate < result : candidate > result)) result = candidate;
    } else {
      // Stack: modifiers apply one after another.
      result = f(applyModification(result ?? value, m.Modification, amount));
    }
  }
  return result ?? value;
}

/** The sale price the game falls back to when a shop entry has no price (Item.salePrice(ignoreProfitMargins: true)). */
function salePrice(id: string, data: ShopsData, year: number, useObjectDataPrice: boolean): number {
  const [, type] = QUALIFIED.exec(id) ?? [, 'O'];
  const bare = id.replace(QUALIFIED, '');
  const item = getItem(id);
  switch (type) {
    case 'O': {
      const price = item?.p ?? 0;
      if (useObjectDataPrice) return price;
      const yearly: Record<string, [number, number]> = { '388': [10, 50], '390': [20, 100], '382': [120, 250], '378': [80, 160], '380': [150, 250], '384': [350, 750] };
      if (yearly[bare]) return yearly[bare][year <= 1 ? 0 : 1];
      return price * 2;
    }
    case 'BC':
      return (data.prices.BC[bare] ?? 0) * 2;
    case 'F':
      return data.pools.F.find(([f]) => f === bare)?.[1] ?? 0;
    case 'S':
      return data.pools.S.find(([s]) => s === bare)?.[1] ?? 0;
    case 'P':
      return data.prices.P[bare] ?? 0;
    case 'B':
      return data.prices.B[bare] ?? 0;
    case 'T':
      return data.prices.T[bare] ?? -1;
    case 'WP':
    case 'FL':
      return 100;
    default:
      return -1;
  }
}

/** Object.appliesProfitMargins: seeds (-74) and saplings. Other item types don't. */
function appliesProfitMargins(id: string, data: ShopsData): boolean {
  if (!id.startsWith('(O)')) return false;
  return getItem(id)?.c === -74 || data.saplings.includes(id.slice(3));
}

/** RANDOM_ITEMS <type> [min] [max] [@flags]: the whole pool ordered by one Random.Next() each, then filtered. */
function randomItems(argsText: string, ctx: QueryContext, data: ShopsData): string[] {
  const parts = argsText.split(/\s+/).filter(Boolean);
  const type = parts[0].replace(/[()]/g, '');
  let i = 1;
  let min = -Infinity;
  let max = Infinity;
  if (parts[i] && /^-?\d+$/.test(parts[i])) {
    min = Number(parts[i++]);
    if (parts[i] && /^-?\d+$/.test(parts[i])) max = Number(parts[i++]);
  }
  const flags = parts.slice(i).map((p) => p.toLowerCase());
  const randomSale = flags.includes('@israndomsale');
  const requirePrice = flags.includes('@requireprice');
  const hasRange = min !== -Infinity || max !== Infinity;

  type Entry = { id: string; price: number; exclude: boolean };
  let pool: Entry[];
  switch (type) {
    case 'O':
      pool = data.pools.O.map(([id, price, , , ex]) => ({ id, price: price * 2, exclude: !!ex }));
      break;
    case 'F':
      pool = data.pools.F.map(([id, price, off]) => ({ id, price, exclude: !!off }));
      break;
    case 'S':
      pool = data.pools.S.map(([id, price]) => ({ id, price, exclude: false }));
      break;
    case 'WP':
      pool = data.pools.WP.map((id) => ({ id, price: 100, exclude: id.startsWith('MoreWalls') }));
      break;
    case 'FL':
      pool = data.pools.FL.map((id) => ({ id, price: 100, exclude: false }));
      break;
    default:
      return [];
  }
  // LINQ OrderBy: keys are drawn for every element first, then a stable sort.
  const keyed = pool.map((entry, index) => ({ entry, index, key: ctx.random!.next() }));
  keyed.sort((a, b) => a.key - b.key || a.index - b.index);
  return keyed
    .filter(({ entry }) => {
      if (randomSale && entry.exclude) return false;
      if (hasRange) {
        if (!/^-?\d+$/.test(entry.id)) return false;
        const n = Number(entry.id);
        if (n < min || n > max) return false;
      }
      return !requirePrice || entry.price > 0;
    })
    .map(({ entry }) => `(${type})${entry.id}`);
}

/** The id the shop shows for an item (Object vs. TrackSeenItems key). */
const seenKey = (id: string, recipe: boolean) => (recipe ? `${id}#Recipe` : id);

export function seedContext(save: SaveData, day: ShopDay): SeedContext {
  return {
    daysPlayed: day.daysPlayed,
    gameId: Number(save.uniqueId) || 0,
    legacyRandom: save.world.legacyRandom,
    season: day.season,
    year: day.year,
  };
}

/** Builds one shop's stock for a day, like the game does when the shop opens. */
export function shopStock(shopId: string, save: SaveData, player: Player, day: ShopDay): ShopStock {
  const data = gameData().shops as ShopsData;
  const shop = data.shops[shopId];
  const items: StockEntry[] = [];
  let uncertainFrom: number | null = null;
  if (!shop) return { items, uncertainFrom };

  const seed = seedContext(save, day);
  const random: DotNetRandom = createDaySaveRandom(seed);
  const base: QueryContext = { save, player, season: day.season, day: day.day, year: day.year, seed, random: null };
  const withRandom: QueryContext = { ...base, random };
  const markUncertain = () => {
    if (uncertainFrom === null) uncertainFrom = items.length;
  };
  // Every item the shop already holds (ShopBuilder's stockedItemIds).
  const stocked = new Set<string>();
  const profitMargin = save.world.profitMargin;
  const pierreList = shopId === 'SeedShop' && save.players.some((p) => p.isHost && p.mailReceived.includes('PierreStocklist'));

  for (const entry of shop.items) {
    // CheckItemCondition: no RNG passed, so RANDOM here rolls on Game1.random.
    let pass = checkConditions(entry.Condition, base);
    let outOfSeason = false;
    if (pass === false && pierreList) {
      // Pierre's Missing Stock List ignores the SEASON part (GameStateQuery.SeasonQueryKeys).
      const withoutSeason = entry.Condition?.split(',').filter((q) => !/^\s*!?SEASON\b/i.test(q)).join(',');
      if (withoutSeason !== entry.Condition && checkConditions(withoutSeason, base) !== false) {
        pass = true;
        outOfSeason = true;
      }
    }
    if (pass === false) continue;
    const maybe = pass === null;
    // A "maybe" entry may or may not draw from the day random.
    const consumes = !!(entry.RandomItemId?.length || /RANDOM_ITEMS/.test(entry.ItemId ?? '') || (entry.MaxStack ?? -1) > 1 || entry.PriceModifiers?.length || entry.AvailableStockModifiers?.length || (!entry.IgnoreShopPriceModifiers && shop.priceModifiers?.some((m) => m.RandomAmount?.length || /RANDOM/.test(m.Condition ?? ''))));
    if (maybe && consumes) markUncertain();

    // ItemQueryResolver.TryResolve(ISpawnItemData).
    let selected = entry.ItemId ?? '';
    if (entry.RandomItemId?.length) {
      const options = entry.AvoidRepeat ? entry.RandomItemId.filter((x) => !stocked.has(qualify(x))) : entry.RandomItemId;
      selected = random.chooseFrom(options) ?? '';
      if (!selected) continue;
    }
    let results: string[];
    const [queryKey, ...rest] = selected.split(' ');
    if (queryKey === 'RANDOM_ITEMS') {
      results = randomItems(rest.join(' '), withRandom, data);
      const dupes = new Set<string>();
      results = results.filter((id) => {
        if (entry.AvoidRepeat && (stocked.has(id) || dupes.has(id))) return false;
        if (entry.AvoidRepeat) dupes.add(id);
        const ok = checkConditions(entry.PerItemCondition, { ...base, target: id });
        return ok !== false;
      });
      if (entry.MaxItems !== undefined) results = results.slice(0, entry.MaxItems);
    } else if (/^[A-Z_]+$/.test(queryKey) && queryKey !== selected.replace(QUALIFIED, '')) {
      // Other item queries (dish of the day, tool upgrades, flavored items...).
      if (queryKey === 'DISH_OF_THE_DAY' && save.world.dishOfTheDay) results = [save.world.dishOfTheDay];
      else continue;
    } else {
      const id = qualify(selected);
      if (entry.AvoidRepeat && stocked.has(id)) continue;
      results = [id];
    }

    // ApplyItemFields runs for every result inside TryResolve, before the shop prices any of them.
    const stacks = results.map(() => {
      let stack = 1;
      if (!entry.IsRecipe && (entry.MaxStack ?? -1) > 1) {
        const min = Math.max(entry.MinStack ?? 1, 1);
        stack = random.next(min, Math.max(entry.MaxStack!, min) + 1);
      } else if (!entry.IsRecipe && (entry.MinStack ?? -1) > 1) stack = entry.MinStack!;
      if (!entry.IsRecipe) stack = Math.trunc(applyQuantityModifiers(stack, entry.StackModifiers, entry.StackModifierMode, withRandom, markUncertain));
      applyQuantityModifiers(0, entry.QualityModifiers, entry.QualityModifierMode, withRandom, markUncertain);
      return stack;
    });

    for (const [n, id] of results.entries()) {
      const stack = stacks[n];
      // ShopBuilder.GetBasePrice.
      let price = entry.Price ?? -1;
      if (price < 0) price = entry.TradeItemId ? 0 : salePrice(id, data, day.year, !!entry.UseObjectDataPrice);
      if (entry.IsRecipe && price < 0) price = 0;
      if (entry.ApplyProfitMargins ?? shop.applyProfitMargins ?? appliesProfitMargins(id, data)) price *= profitMargin;
      if (outOfSeason) price *= 1.5;
      price = Math.trunc(Math.fround(price));

      let stock = entry.AvailableStock ?? -1;
      if (entry.IsRecipe) stock = 1;
      let value = price;
      if (!entry.IgnoreShopPriceModifiers) value = applyQuantityModifiers(value, shop.priceModifiers, shop.priceModifierMode, withRandom, markUncertain);
      value = applyQuantityModifiers(value, entry.PriceModifiers, entry.PriceModifierMode, withRandom, markUncertain);
      if (!entry.IsRecipe) stock = Math.trunc(applyQuantityModifiers(stock, entry.AvailableStockModifiers, entry.AvailableStockModifierMode, withRandom, markUncertain));

      const key = seenKey(id, !!entry.IsRecipe);
      const seen = stocked.has(key);
      stocked.add(key);
      if (seen && entry.AvoidRepeat) continue;
      items.push({
        id,
        price: Math.trunc(value),
        trade: entry.TradeItemId ? { id: qualify(entry.TradeItemId), amount: entry.TradeItemAmount ?? 1 } : undefined,
        stock: stock < 0 ? null : stock,
        stack,
        recipe: !!entry.IsRecipe,
        maybe,
      });
    }
  }
  return { items, uncertainFrom };
}

/** Day after `from` + offset days, with the game's 28-day seasons and 4-season years. */
export function shiftDay(from: ShopDay, offset: number): ShopDay {
  const absolute = (from.year - 1) * 112 + SEASONS.indexOf(from.season) * 28 + (from.day - 1) + offset;
  return {
    year: Math.floor(absolute / 112) + 1,
    season: SEASONS[Math.floor((absolute % 112) / 28)],
    day: (absolute % 28) + 1,
    daysPlayed: from.daysPlayed + offset,
  };
}
