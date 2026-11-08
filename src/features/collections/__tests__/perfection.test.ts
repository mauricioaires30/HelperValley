import { beforeAll, describe, expect, it } from 'vitest';
import type { SaveData } from '@/save/model';
import { loadTestGameData } from '@/test/gameData';
import { perfection, perfectionTotal } from '../perfectionScore';

beforeAll(loadTestGameData);

const player = {
  id: '1',
  isHost: true,
  skills: { farming: 10, fishing: 10, foraging: 10, mining: 10, combat: 10, luck: 0 },
  basicShipped: {},
  friendships: {},
  cookingRecipes: {},
  recipesCooked: {},
  craftingRecipes: {},
  fishCaught: {},
  mailReceived: ['gotMaxStamina'],
  monstersKilled: {},
};

describe('perfection', () => {
  it('weighs the parts like Utility.percentGameComplete (100 in total)', () => {
    const save = { players: [player], farm: { buildings: [{ type: 'Gold Clock', location: 'Farm', building: 0, upgrading: 0 }] }, goldenWalnutsFound: 130 } as unknown as SaveData;
    const parts = perfection(save);
    expect(parts.reduce((n, p) => n + p.weight, 0)).toBe(100);
    // Level 25 (5), all stardrops (10), Gold Clock (10) and every walnut (5).
    expect(perfectionTotal(parts)).toBeCloseTo(30);
  });
});
