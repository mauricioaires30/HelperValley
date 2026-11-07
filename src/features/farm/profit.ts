import { gameData, getItem, type CropData, type ItemSource, type Season } from '@/data/gameData';

export const DAYS_IN_SEASON = 28;
const CATEGORY_VEGETABLE = -75;
const CATEGORY_FRUIT = -79;
const CATEGORY_FLOWER = -80;
const HONEY_BASE = 100;

/** Growth speed bonus by fertilizer, and the profession that stacks with it. */
export const FERTILIZERS = { none: 0, speedGro: 0.1, deluxe: 0.25, hyper: 0.33 } as const;
export type Fertilizer = keyof typeof FERTILIZERS;

export interface PlanOptions {
  /** Season the crop must grow in; "any" for the greenhouse and the island. */
  season: Season | 'any';
  /** Days of growing time available (rest of the season, or a full season indoors). */
  days: number;
  fertilizer: Fertilizer;
  agriculturist: boolean;
  tiller: boolean;
  artisan: boolean;
  farmingLevel: number;
  /** Include seeds that can't be bought for gold (trades, seed maker, rewards). */
  includeUnbuyable: boolean;
}

export type Processing = 'raw' | 'keg' | 'jar';

export interface CropOption {
  crop: CropData;
  growDays: number;
  harvests: number;
  /** Seeds to plant per tile over the period (1 for regrowing crops). */
  plantings: number;
  yieldPerHarvest: number;
  /** Cheapest gold price for the seed in this season, or null if it can't be bought. */
  seedPrice: number | null;
  seedSource: ItemSource | null;
  /** Value of one harvested item, raw and after the best machine. */
  rawPrice: number;
  best: { method: Processing; price: number };
  /** Profit per tile over the period, raw and processed (seed cost deducted). */
  profitRaw: number;
  profitBest: number;
  perDayRaw: number;
  perDayBest: number;
  isFlower: boolean;
  /** Honey value when this flower is next to bee houses. */
  honeyPrice: number | null;
  /**
   * Won't be ready in the days left: profit figures are for a full season instead
   * (plant on day 1 next time).
   */
  late: boolean;
}

/** Growth days after speed bonuses (the game removes whole days from the phases). */
export function growDays(crop: CropData, options: Pick<PlanOptions, 'fertilizer' | 'agriculturist'>) {
  const total = crop.phases.reduce((a, b) => a + b, 0);
  const bonus = FERTILIZERS[options.fertilizer] + (options.agriculturist ? 0.1 : 0);
  return total - Math.ceil(total * bonus);
}

/** Harvests a tile gives within `days` days if planted today. */
export function harvestsIn(crop: CropData, grow: number, days: number) {
  if (grow > days) return 0;
  if (crop.regrow > 0) return 1 + Math.floor((days - grow) / crop.regrow);
  return Math.floor(days / grow);
}

/** Cheapest gold source for a seed available in the season (any season if "any"). */
export function cheapestSource(sources: ItemSource[], season: Season | 'any') {
  return sources
    .filter((s) => s.price && !s.currency && !s.trade && (season === 'any' || !s.seasons || s.seasons.includes(season)))
    .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0] ?? null;
}

/** Best sale value per item: raw, keg (wine/juice) or preserves jar (jelly/pickles). */
export function processedValues(harvest: string, options: Pick<PlanOptions, 'tiller' | 'artisan'>) {
  const item = getItem(harvest);
  const price = item?.p ?? 0;
  const category = item?.c;
  const tiller = options.tiller && [CATEGORY_VEGETABLE, CATEGORY_FRUIT, CATEGORY_FLOWER].includes(category ?? 0) ? 1.1 : 1;
  const artisan = options.artisan ? 1.4 : 1;
  const raw = Math.floor(price * tiller);
  const values: Array<{ method: Processing; price: number }> = [{ method: 'raw', price: raw }];
  if (category === CATEGORY_FRUIT) {
    values.push({ method: 'keg', price: Math.floor(price * 3 * artisan) });
    values.push({ method: 'jar', price: Math.floor((price * 2 + 50) * artisan) });
  } else if (category === CATEGORY_VEGETABLE) {
    values.push({ method: 'keg', price: Math.floor(price * 2.25 * artisan) });
    values.push({ method: 'jar', price: Math.floor((price * 2 + 50) * artisan) });
  }
  return { raw, best: values.sort((a, b) => b.price - a.price)[0] };
}

/** Average items per harvest, counting extra-harvest chances and farming-level bonuses. */
export function expectedYield(crop: CropData, farmingLevel: number) {
  const [min, max] = crop.stack;
  const levelBonus = crop.perLevel > 0 ? Math.floor(crop.perLevel * farmingLevel) : 0;
  const base = (min + Math.max(min, max + levelBonus)) / 2;
  // Each extra roll repeats with the same chance: expected extras = p / (1 - p).
  const extra = crop.extra > 0 && crop.extra < 1 ? crop.extra / (1 - crop.extra) : 0;
  return base + extra;
}

/** Profit options for every crop that can grow under these conditions, best first. */
export function cropOptions(options: PlanOptions): CropOption[] {
  const out: CropOption[] = [];
  for (const crop of gameData().farm.crops) {
    if (options.season !== 'any' && !crop.seasons.includes(options.season)) continue;
    if (!getItem(crop.harvest)) continue;
    const seedSource = cheapestSource(crop.sources, options.season);
    if (!seedSource && !options.includeUnbuyable) continue;

    const grow = growDays(crop, options);
    // Crops that can't finish in time are still listed, valued over a full season.
    const late = harvestsIn(crop, grow, options.days) === 0;
    const days = late ? DAYS_IN_SEASON : options.days;
    const harvests = harvestsIn(crop, grow, days);
    if (harvests === 0) continue;
    const plantings = crop.regrow > 0 ? 1 : harvests;
    const yieldPerHarvest = expectedYield(crop, options.farmingLevel);
    const { raw, best } = processedValues(crop.harvest, options);
    const seedCost = (seedSource?.price ?? 0) * plantings;
    const items = harvests * yieldPerHarvest;
    const profitRaw = Math.round(items * raw - seedCost);
    const profitBest = Math.round(items * best.price - seedCost);
    const isFlower = getItem(crop.harvest)?.c === CATEGORY_FLOWER;

    out.push({
      crop,
      growDays: grow,
      harvests,
      plantings,
      yieldPerHarvest,
      seedPrice: seedSource?.price ?? null,
      seedSource,
      rawPrice: raw,
      best,
      profitRaw,
      profitBest,
      perDayRaw: profitRaw / days,
      perDayBest: profitBest / days,
      isFlower,
      honeyPrice: isFlower ? HONEY_BASE + (getItem(crop.harvest)?.p ?? 0) * 2 : null,
      late,
    });
  }
  return out.sort((a, b) => Number(a.late) - Number(b.late) || b.perDayBest - a.perDayBest);
}

/** Days of growing time left: rest of the season outdoors, a full season indoors. */
export function daysAvailable(area: 'Farm' | 'Greenhouse' | 'IslandWest', day: number) {
  return area === 'Farm' ? DAYS_IN_SEASON - day : DAYS_IN_SEASON;
}
