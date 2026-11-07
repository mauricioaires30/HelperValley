import { beforeAll, describe, expect, it } from 'vitest';
import type { Player, SaveData } from '@/save/model';
import { loadTestGameData } from '@/test/gameData';
import { checkConditions, splitQueries, type QueryContext } from '../conditions';
import { DotNetRandom } from '../random';
import { shiftDay } from '../stock';

beforeAll(loadTestGameData);

const player = {
  id: '1',
  isHost: true,
  mailReceived: ['JojaMember'],
  eventsSeen: ['100'],
  achievements: [5],
  friendships: { Abigail: { points: 2600, status: 'Dating' } },
  stats: { daysPlayed: 50 },
  skills: { farming: 10, fishing: 4, foraging: 0, mining: 0, combat: 0, luck: 0 },
  inventory: [{ id: '(O)24', stack: 3 }],
  craftingRecipes: {},
  cookingRecipes: {},
  deepestMineLevel: 80,
  houseUpgradeLevel: 1,
} as unknown as Player;

const save = {
  players: [player],
  broadcastedMail: [],
  museum: {},
  goldenWalnuts: 0,
  goldenWalnutsFound: 101,
  dailyLuck: 0,
  world: { goldenCoconutCracked: true, timesFedRaccoons: 3, visitsUntilY1Guarantee: 0, profitMargin: 1, legacyRandom: false },
} as unknown as SaveData;

const ctx = (over: Partial<QueryContext> = {}): QueryContext => ({
  save,
  player,
  season: 'summer',
  day: 19, // a Friday
  year: 2,
  seed: { daysPlayed: 50, gameId: 123456, legacyRandom: false, season: 'summer', year: 2 },
  random: null,
  ...over,
});

describe('game state queries', () => {
  it('splits on commas outside quotes', () => {
    expect(splitQueries('ANY "A x, B" "C", !D')).toEqual(['ANY "A x, B" "C"', '!D']);
  });

  it('checks dates, mail, hearts and world state', () => {
    expect(checkConditions('SEASON spring summer, DAY_OF_WEEK Friday, YEAR 2', ctx())).toBe(true);
    expect(checkConditions('DAY_OF_WEEK Monday', ctx())).toBe(false);
    expect(checkConditions('!PLAYER_HAS_MAIL Current JojaMember', ctx())).toBe(false);
    expect(checkConditions('PLAYER_HEARTS Current Abigail 10', ctx())).toBe(true);
    expect(checkConditions('WORLD_STATE_FIELD GoldenWalnutsFound 100', ctx())).toBe(true);
    expect(checkConditions('WORLD_STATE_FIELD VisitsUntilY1Guarantee 0 0', ctx())).toBe(true);
    expect(checkConditions('MINE_LOWEST_LEVEL_REACHED 120', ctx())).toBe(false);
    expect(checkConditions('ANY "PLAYER_BASE_FISHING_LEVEL Current 8" "PLAYER_HAS_ACHIEVEMENT Current 5"', ctx())).toBe(true);
  });

  it("can't know RANDOM rolls without the shop random", () => {
    expect(checkConditions('RANDOM 0.5', ctx())).toBeNull();
    expect(checkConditions('DAY_OF_WEEK Monday, RANDOM 0.5', ctx())).toBe(false);
    const r = new DotNetRandom(0);
    // First NextDouble for seed 0 is 0.726...; a 0.9 chance passes.
    expect(checkConditions('RANDOM 0.9', ctx({ random: r }))).toBe(true);
  });

  it('is deterministic for SYNCED_RANDOM', () => {
    const a = checkConditions('SYNCED_RANDOM day cart_fez 0.5', ctx());
    expect(a).not.toBeNull();
    expect(checkConditions('SYNCED_RANDOM day cart_fez 0.5', ctx())).toBe(a);
  });

  it('checks item queries', () => {
    expect(checkConditions('ITEM_CATEGORY Target -999', ctx({ target: '(O)0' }))).toBe(true);
    expect(checkConditions('ITEM_OBJECT_TYPE Target Fish', ctx({ target: '(O)128' }))).toBe(true);
  });
});

describe('calendar', () => {
  it('rolls over seasons and years', () => {
    expect(shiftDay({ season: 'winter', day: 27, year: 1, daysPlayed: 111 }, 3)).toEqual({ season: 'spring', day: 2, year: 2, daysPlayed: 114 });
  });
});
