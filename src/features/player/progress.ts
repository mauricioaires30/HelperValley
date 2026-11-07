import type { Player, SaveData } from '@/save/model';

/** Farmer.checkForLevelGain: total XP needed for levels 1-10. */
export const SKILL_XP = [100, 380, 770, 1300, 2150, 3300, 4800, 6900, 10000, 15000];

/** MasteryTrackerMenu.getMasteryExpNeededForLevel. */
export const MASTERY_XP = [0, 10000, 25000, 45000, 70000, 100000];

/** Skill keys in the game's index order (experiencePoints, mastery_N stats). */
export const SKILL_ORDER = ['farming', 'fishing', 'foraging', 'mining', 'combat', 'luck'] as const;

/** Level 5 profession ids per skill index; each has two level 10 follow-ups (2·id+2, 2·id+3 within the skill). */
export function professionTree(skill: number): Array<{ id: number; next: [number, number] }> {
  const first = skill * 6;
  return [
    { id: first, next: [first + 2, first + 3] },
    { id: first + 1, next: [first + 4, first + 5] },
  ];
}

export function skillProgress(xp: number, level: number) {
  if (level >= 10) return { level, into: 1, of: 1 };
  const from = level > 0 ? SKILL_XP[level - 1] : 0;
  const to = SKILL_XP[level];
  return { level, into: Math.max(0, xp - from), of: to - from };
}

export function masteryState(player: Player) {
  const xp = player.stats.MasteryExp ?? 0;
  let level = 0;
  for (let i = 1; i < MASTERY_XP.length; i++) if (xp >= MASTERY_XP[i]) level = i;
  const spent = player.stats.masteryLevelsSpent ?? 0;
  const claimed = [0, 1, 2, 3, 4].map((i) => (player.stats[`mastery_${i}`] ?? 0) > 0);
  // The cave opens once farming, fishing, foraging, mining and combat are all level 10.
  const unlocked = SKILL_ORDER.slice(0, 5).every((s) => player.skills[s] >= 10);
  const next = level < 5 ? { into: xp - MASTERY_XP[level], of: MASTERY_XP[level + 1] - MASTERY_XP[level] } : null;
  return { xp, level, spent, toClaim: Math.max(0, level - spent), claimed, unlocked, next };
}

/** Farmer.Level: half the sum of the six skill levels. */
export const farmerLevel = (p: Player) => Math.floor(SKILL_ORDER.reduce((sum, s) => sum + p.skills[s], 0) / 2);

export interface GrandpaPoint {
  key: string;
  points: number;
  done: boolean;
  /** Extra values for the label (amounts, counts). */
  values?: Record<string, number>;
}

const CC_ROOMS = ['ccBoilerRoom', 'ccCraftsRoom', 'ccPantry', 'ccFishTank', 'ccVault', 'ccBulletin'];

/** Utility.getGrandpaScore, item by item, for the host player. 21 points max. */
export function grandpaPoints(save: SaveData, p: Player): GrandpaPoint[] {
  const mail = new Set([...p.mailReceived, ...save.broadcastedMail]);
  const earned = p.totalMoneyEarned;
  const ccOpen = mail.has('ccIsComplete');
  const ccDone = ccOpen || CC_ROOMS.every((r) => mail.has(r));
  const friends = Object.values(p.friendships).filter((f) => f.points >= 1975).length;
  const level = farmerLevel(p);
  const money = (amount: number, points = 1): GrandpaPoint => ({ key: 'money', points, done: earned >= amount, values: { amount } });
  return [
    money(50000),
    money(100000),
    money(200000),
    money(300000),
    money(500000),
    money(1000000, 2),
    { key: 'achievement', points: 1, done: p.achievements.includes(5), values: { id: 5 } },
    { key: 'skullKey', points: 1, done: p.hasSkullKey },
    { key: 'ccDone', points: 1, done: ccDone },
    { key: 'ccCeremony', points: 2, done: ccOpen },
    { key: 'house', points: 1, done: !!p.spouse && p.houseUpgradeLevel >= 2 },
    { key: 'rustyKey', points: 1, done: p.hasRustyKey },
    { key: 'achievement', points: 1, done: p.achievements.includes(26), values: { id: 26 } },
    { key: 'achievement', points: 1, done: p.achievements.includes(34), values: { id: 34 } },
    { key: 'friends', points: 1, done: friends >= 5, values: { count: 5, have: friends } },
    { key: 'friends', points: 1, done: friends >= 10, values: { count: 10, have: friends } },
    { key: 'level', points: 1, done: level >= 15, values: { count: 15, have: level } },
    { key: 'level', points: 1, done: level >= 25, values: { count: 25, have: level } },
    { key: 'pet', points: 1, done: mail.has('petLoveMessage') },
  ];
}

/** Utility.getGrandpaCandlesFromScore. */
export const candlesFor = (score: number) => (score >= 12 ? 4 : score >= 8 ? 3 : score >= 4 ? 2 : 1);
