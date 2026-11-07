import { beforeAll, describe, expect, it } from 'vitest';
import { gameData } from '@/data/gameData';
import { loadTestGameData } from '@/test/gameData';
import { cheapestSource, cropOptions, growDays, harvestsIn, processedValues } from '../profit';

beforeAll(loadTestGameData);

const crop = (seed: string) => gameData().farm.crops.find((c) => c.seed === seed)!;
const base = { fertilizer: 'none', agriculturist: false } as const;

describe('farm profit', () => {
  it('computes growth days and harvests', () => {
    const parsnip = crop('(O)472');
    expect(growDays(parsnip, base)).toBe(4);
    expect(harvestsIn(parsnip, 4, 27)).toBe(6);
    const strawberry = crop('(O)745'); // 8 days, regrows every 4
    expect(growDays(strawberry, base)).toBe(8);
    expect(harvestsIn(strawberry, 8, 27)).toBe(5);
    expect(growDays(strawberry, { fertilizer: 'deluxe', agriculturist: true })).toBe(5);
  });

  it('uses the cheapest gold source in season', () => {
    expect(cheapestSource(crop('(O)472').sources, 'spring')?.price).toBe(20);
    expect(cheapestSource(crop('(O)499').sources, 'spring')).toBeNull(); // Ancient Seeds
  });

  it('values processing for fruit', () => {
    // Ancient Fruit sells for 550; wine is 3x.
    expect(processedValues('(O)454', { tiller: false, artisan: false })).toEqual({ raw: 550, best: { method: 'keg', price: 1650 } });
  });

  it('ranks crops and includes unbuyable seeds on request', () => {
    const opts = { season: 'any', days: 28, fertilizer: 'none', agriculturist: false, tiller: false, artisan: false, farmingLevel: 10 } as const;
    const buyable = cropOptions({ ...opts, includeUnbuyable: false });
    expect(buyable.some((o) => o.crop.seed === '(O)499')).toBe(false);
    const all = cropOptions({ ...opts, includeUnbuyable: true });
    expect(all.some((o) => o.crop.seed === '(O)499')).toBe(true);
    expect(all[0].perDayBest).toBeGreaterThanOrEqual(all.at(-1)!.perDayBest);
  });
});
