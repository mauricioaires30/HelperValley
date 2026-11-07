import { readRaw } from './raw.mjs';
import { localize } from './strings.mjs';

const SEASONS = ['spring', 'summer', 'fall', 'winter'];

/** Shops that sell seeds, saplings or hay, and how the site labels them. */
const SEED_SHOPS = ['SeedShop', 'Joja', 'Sandy', 'Traveler', 'IslandTrade', 'Raccoon', 'Festival_EggFestival_Pierre', 'Festival_FlowerDance_Pierre', 'Festival_Luau_Pierre', 'Festival_DanceOfTheMoonlightJellies_Pierre', 'Festival_StardewValleyFair_StarTokens', 'Festival_SpiritsEve_Pierre', 'Festival_FeastOfTheWinterStar_Pierre', 'Festival_NightMarket_MagicBoat_Day1', 'Festival_NightMarket_MagicBoat_Day2', 'Festival_NightMarket_MagicBoat_Day3', 'AnimalShop', 'VolcanoShop', 'QiGemShop'];

/** Shop modifier: 0 add, 1 subtract, 2 multiply, 3 divide, 4 set. */
function applyModifiers(price, modifiers) {
  for (const m of modifiers ?? []) {
    // Conditional markups (e.g. Joja's non-member markup) are applied as the common case.
    if (m.RandomAmount) return null; // random prices (traveling cart) have no fixed value
    if (m.Modification === 0) price += m.Amount;
    else if (m.Modification === 1) price -= m.Amount;
    else if (m.Modification === 2) price *= m.Amount;
    else if (m.Modification === 3) price /= m.Amount;
    else if (m.Modification === 4) price = m.Amount;
  }
  return Math.round(price);
}

const seasonsFromCondition = (condition) => {
  const match = condition?.match(/SEASON ([a-z ]+)/);
  return match ? match[1].trim().split(/\s+/) : null;
};

/** Every place that sells or trades an item: { shop, price | trade, seasons }. */
function buildSources(objects) {
  const shops = readRaw('Data/Shops');
  const sources = {};
  for (const shopId of SEED_SHOPS) {
    const shop = shops[shopId];
    if (!shop) continue;
    for (const item of shop.Items ?? []) {
      const id = item.ItemId;
      if (!id?.startsWith('(O)') && !id?.startsWith('(BC)')) continue;
      const base = objects[id.replace('(O)', '')];
      const raw = item.Price >= 0 ? item.Price : base ? base.Price * 2 : null;
      let price = raw;
      if (price !== null && !item.IgnoreShopPriceModifiers) price = applyModifiers(price, shop.PriceModifiers);
      if (price !== null && item.PriceModifiers) price = applyModifiers(price, item.PriceModifiers);
      const entry = {
        shop: shopId,
        ...(item.TradeItemId ? { trade: [item.TradeItemId, item.TradeItemAmount] } : price !== null && price > 0 ? { price } : { random: true }),
        ...(seasonsFromCondition(item.Condition) ? { seasons: seasonsFromCondition(item.Condition) } : {}),
        // 0 gold, 1 star tokens, 2 Qi coins, 4 Qi gems.
        ...(shop.Currency ? { currency: shop.Currency } : {}),
      };
      (sources[id] ??= []).push(entry);
    }
  }
  return sources;
}

/**
 * Crops, fruit trees, animals and seed sources for the farm planner.
 * Prices come from the game's shop data, so they match the installed version.
 */
export function buildFarm(textures) {
  const objects = readRaw('Data/Objects');
  const sources = buildSources(objects);

  const crops = Object.entries(readRaw('Data/Crops')).map(([seed, c]) => {
    const harvest = `(O)${c.HarvestItemId}`;
    const seedId = `(O)${seed}`;
    return {
      seed: seedId,
      harvest,
      seasons: c.Seasons.map((s) => SEASONS[s]),
      phases: c.DaysInPhase,
      regrow: c.RegrowDays,
      stack: [c.HarvestMinStack, c.HarvestMaxStack],
      perLevel: c.HarvestMaxIncreasePerFarmingLevel,
      extra: c.ExtraHarvestChance,
      paddy: c.IsPaddyCrop,
      trellis: c.IsRaised,
      noPots: (c.PlantableLocationRules ?? []).some((r) => r.PlantedIn === 2 && r.Result === 2),
      sources: sources[seedId] ?? [],
    };
  });

  const fruitTrees = Object.entries(readRaw('Data/FruitTrees')).map(([sapling, t]) => ({
    sapling: `(O)${sapling}`,
    fruit: t.Fruit?.[0]?.ItemId?.startsWith('(') ? t.Fruit[0].ItemId : `(O)${t.Fruit?.[0]?.ItemId}`,
    seasons: t.Seasons.map((s) => SEASONS[s]),
    sources: sources[`(O)${sapling}`] ?? [],
  }));

  const animals = Object.fromEntries(
    Object.entries(readRaw('Data/FarmAnimals')).map(([type, a]) => [
      type,
      {
        n: localize(a.DisplayName, type),
        house: a.House,
        produce: (a.ProduceItemIds ?? []).map((p) => (p.ItemId.startsWith('(') ? p.ItemId : `(O)${p.ItemId}`)),
        days: a.DaysToProduce,
        price: a.PurchasePrice,
        // Overworld sprite: [sheet, frame width, frame height]; the first frame faces down.
        sprite: (() => {
          const sheet = a.Texture.replace(/\\/g, '/');
          textures.add(sheet);
          return [sheet, a.SpriteWidth, a.SpriteHeight];
        })(),
      },
    ]),
  );

  return {
    crops,
    fruitTrees,
    animals,
    hay: sources['(O)178'] ?? [],
    shopNames: Object.fromEntries(SEED_SHOPS.map((s) => [s, s])),
  };
}
