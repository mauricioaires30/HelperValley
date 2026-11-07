import { readRaw, readRawKeys } from './raw.mjs';
import { localize } from './strings.mjs';

/** Entries in the game's dictionary order (see readRawKeys). */
const ordered = (asset) => {
  const data = readRaw(asset) ?? {};
  return readRawKeys(asset).map((id) => [id, data[id]]);
};

/** Item fields the shop simulation reads (ShopBuilder.GetShopStock + ItemQueryResolver). */
const ITEM_FIELDS = [
  'Id',
  'ItemId',
  'RandomItemId',
  'Condition',
  'PerItemCondition',
  'MaxItems',
  'AvoidRepeat',
  'Price',
  'TradeItemId',
  'TradeItemAmount',
  'UseObjectDataPrice',
  'IgnoreShopPriceModifiers',
  'ApplyProfitMargins',
  'PriceModifiers',
  'PriceModifierMode',
  'AvailableStock',
  'AvailableStockLimit',
  'AvailableStockModifiers',
  'AvailableStockModifierMode',
  'IsRecipe',
  'MinStack',
  'MaxStack',
  'Quality',
  'StackModifiers',
  'StackModifierMode',
  'QualityModifiers',
  'QualityModifierMode',
];

/** Drops nulls, empty lists and the defaults so the dataset stays small. */
function compact(item) {
  const out = {};
  for (const key of ITEM_FIELDS) {
    const v = item[key];
    if (v == null || v === false || (Array.isArray(v) && !v.length)) continue;
    if (
      (key === 'PriceModifierMode' || key === 'AvailableStockModifierMode' || key === 'StackModifierMode' || key === 'QualityModifierMode') &&
      v === 0
    )
      continue;
    if ((key === 'MinStack' || key === 'MaxStack' || key === 'Price' || key === 'Quality' || key === 'AvailableStock') && v === -1) continue;
    if (key === 'TradeItemAmount' && v === 1) continue;
    if (key === 'AvailableStockLimit' && v === 0) continue;
    out[key] = Array.isArray(v) && typeof v[0] === 'object' ? v.map(modifier) : v;
  }
  // Defaults that differ from "missing": price and stock -1.
  if (item.Price === -1) out.Price = -1;
  if (item.AvailableStock === -1) out.AvailableStock = -1;
  return out;
}

const modifier = (m) => ({
  Condition: m.Condition ?? undefined,
  Modification: m.Modification,
  Amount: m.Amount,
  RandomAmount: m.RandomAmount ?? undefined,
});

/**
 * Data/Shops plus, for RANDOM_ITEMS, every item of each type in the game's data order:
 * the game shuffles the whole list with one Random.Next() per entry, so the order and count matter.
 */
export function buildShops(textures) {
  const shops = {};
  for (const [id, s] of ordered('Data/Shops')) {
    shops[id] = {
      currency: s.Currency,
      applyProfitMargins: s.ApplyProfitMargins ?? undefined,
      priceModifiers: s.PriceModifiers?.map(modifier),
      priceModifierMode: s.PriceModifierMode || undefined,
      owners: (s.Owners ?? []).map((o) => ({
        name: o.Name,
        condition: o.Condition ?? undefined,
        closed: !!o.ClosedMessage,
      })),
      items: (s.Items ?? []).map(compact),
    };
  }

  // (O): [id, price, category, type, excludeFromRandomSale]
  const objects = ordered('Data/Objects').map(([id, o]) => [id, o.Price, o.Category, o.Type, o.ExcludeFromRandomSale ? 1 : 0]);
  // (F): [id, price, offLimitsForRandomSale] — "name/type/size/box/rotations/price/placement/display/sprite/texture/offLimits"
  const furniture = ordered('Data/Furniture').map(([id, raw]) => {
    const f = raw.split('/');
    return [id, Number(f[5]), f[10] === 'true' ? 1 : 0];
  });
  // (S): [id, price]
  const shirts = ordered('Data/Shirts').map(([id, s]) => [id, s.Price]);
  // (WP)/(FL): legacy sheets plus additional sets, in WallpaperDataDefinition/FlooringDataDefinition order.
  const extra = readRaw('Data/AdditionalWallpaperFlooring') ?? [];
  const sets = (floor, legacy) => [
    ...Array.from({ length: legacy }, (_, i) => String(i)),
    ...extra.filter((s) => !!s.IsFlooring === floor).flatMap((s) => Array.from({ length: s.Count }, (_, i) => `${s.Id}:${i}`)),
  ];
  // Fruit tree saplings get profit margins like seeds (Object.isSapling).
  const saplings = Object.keys(readRaw('Data/FruitTrees') ?? {});
  const bigCraftables = Object.fromEntries(Object.entries(readRaw('Data/BigCraftables') ?? {}).map(([id, b]) => [id, b.Price]));
  const pants = Object.fromEntries(Object.entries(readRaw('Data/Pants') ?? {}).map(([id, p]) => [id, p.Price]));
  // Boots.salePrice: (defense + immunity) × 100.
  const boots = Object.fromEntries(
    Object.entries(readRaw('Data/Boots') ?? {}).map(([id, b]) => {
      const f = b.split('/');
      return [id, (Number(f[3]) + Number(f[4])) * 100];
    }),
  );
  const tools = Object.fromEntries(Object.entries(readRaw('Data/Tools') ?? {}).map(([id, t]) => [id, t.SalePrice]));

  // Robin's and the Wizard's constructions (Data/Buildings with a Builder).
  const buildings = Object.entries(readRaw('Data/Buildings') ?? {})
    .filter(([, b]) => b.Builder === 'Robin' || b.Builder === 'Wizard')
    .map(([id, b]) => {
      const texture = b.Texture.replace(/\\/g, '/');
      textures.add(texture);
      const r = b.SourceRect && !b.SourceRect.IsEmpty ? [b.SourceRect.X, b.SourceRect.Y, b.SourceRect.Width, b.SourceRect.Height] : null;
      return {
        id,
        builder: b.Builder,
        n: localize(b.Name, id),
        d: localize(b.Description, ''),
        cost: b.BuildCost,
        materials: (b.BuildMaterials ?? []).map((m) => [m.ItemId, m.Amount]),
        days: b.BuildDays,
        condition: b.BuildCondition ?? undefined,
        texture,
        rect: r,
        size: [b.Size.X, b.Size.Y],
        upgradeOf: b.BuildingToUpgrade ?? undefined,
      };
    });

  // Marnie's animals (Data/FarmAnimals with a purchase price).
  const animals = Object.entries(readRaw('Data/FarmAnimals') ?? {})
    .filter(([, a]) => a.PurchasePrice > 0)
    .map(([id, a]) => {
      const texture = (a.ShopTexture ?? 'LooseSprites/Cursors').replace(/\\/g, '/');
      textures.add(texture);
      const r = a.ShopSourceRect;
      return {
        id,
        n: localize(a.ShopDisplayName ?? a.DisplayName, id),
        price: a.PurchasePrice,
        building: a.RequiredBuilding ?? undefined,
        condition: a.UnlockCondition ?? undefined,
        texture,
        rect: [r.X, r.Y, r.Width, r.Height],
      };
    });

  return {
    shops,
    buildings,
    animals,
    pools: {
      O: objects,
      F: furniture,
      S: shirts,
      WP: sets(false, 112),
      FL: sets(true, 88),
    },
    prices: { BC: bigCraftables, P: pants, B: boots, T: tools },
    saplings,
  };
}
