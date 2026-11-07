import { describe, expect, it } from 'vitest';
import type { Player, SaveData } from '@/save/model';
import { candlesFor, grandpaPoints, masteryState, professionTree, skillProgress } from '../progress';

const player = (over: Partial<Player> = {}): Player =>
  ({
    skills: { farming: 10, fishing: 10, foraging: 10, mining: 10, combat: 10, luck: 0 },
    stats: {},
    mailReceived: [],
    achievements: [],
    friendships: {},
    totalMoneyEarned: 0,
    houseUpgradeLevel: 0,
    hasRustyKey: false,
    hasSkullKey: false,
    ...over,
  }) as Player;

const save = { broadcastedMail: [] } as unknown as SaveData;

describe('skills', () => {
  it('measures progress inside the current level', () => {
    expect(skillProgress(500, 2)).toEqual({ level: 2, into: 120, of: 390 });
    expect(skillProgress(20000, 10).level).toBe(10);
  });

  it('maps level 5 professions to their level 10 follow-ups', () => {
    expect(professionTree(0)).toEqual([
      { id: 0, next: [2, 3] },
      { id: 1, next: [4, 5] },
    ]);
    expect(professionTree(1)[1]).toEqual({ id: 7, next: [10, 11] });
  });
});

describe('mastery', () => {
  it('reads the level, claimed pedestals and what is left to claim', () => {
    const m = masteryState(player({ stats: { MasteryExp: 50000, masteryLevelsSpent: 1, mastery_2: 1 } }));
    expect(m.level).toBe(3);
    expect(m.toClaim).toBe(2);
    expect(m.claimed).toEqual([false, false, true, false, false]);
    expect(m.next).toEqual({ into: 5000, of: 25000 });
    expect(m.unlocked).toBe(true);
  });

  it('stays locked until every combat skill is 10', () => {
    expect(masteryState(player({ skills: { farming: 10, fishing: 9, foraging: 10, mining: 10, combat: 10, luck: 0 } })).unlocked).toBe(false);
  });
});

describe('grandpa', () => {
  it('scores like Utility.getGrandpaScore', () => {
    const points = grandpaPoints(save, player({ totalMoneyEarned: 1_000_000, hasRustyKey: true, mailReceived: ['ccIsComplete'] }));
    const score = points.reduce((s, p) => s + (p.done ? p.points : 0), 0);
    // 7 for money, 3 for the community center, 1 rusty key, 1 for farmer level 25 (5×10 / 2), 1 for level 15.
    expect(score).toBe(13);
    expect(candlesFor(score)).toBe(4);
    expect(points.reduce((s, p) => s + p.points, 0)).toBe(21);
  });

  it('converts scores to candles', () => {
    expect([0, 4, 8, 11, 12].map(candlesFor)).toEqual([1, 2, 3, 3, 4]);
  });
});
