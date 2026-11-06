import { qualifyItemId, type AchievementGoals } from '@/data/gameData';
import type { Player, SaveData } from '@/save/model';

export interface AchievementProgress {
  id: string;
  earned: boolean;
  /** Numeric progress when the game tracks one; null for one-off events. */
  value: number | null;
  goal: number | null;
}

const heartsOf = (points: number) => Math.floor(points / 250);

/**
 * Progress toward each achievement for one player. Thresholds mirror the game's checks
 * (Game1/Farmer achievement logic); museum and Community Center are farm-wide.
 */
export function achievementProgress(save: SaveData, player: Player, goals: AchievementGoals, ids: string[]): AchievementProgress[] {
  const hearts = Object.values(player.friendships).map((f) => heartsOf(f.points));
  const friendsAt = (h: number) => hearts.filter((x) => x >= h).length;
  const cooked = Object.keys(player.recipesCooked).length;
  const crafted = goals.crafting.filter((name) => (player.craftingRecipes[name] ?? 0) > 0).length;
  const fishCaught = new Set(Object.keys(player.fishCaught).map(qualifyItemId));
  const species = goals.fish.filter((id) => fishCaught.has(id)).length;
  const donated = Object.keys(save.museum).length;
  const shipped = (id: string) => player.basicShipped[id] ?? 0;
  const polyculture = goals.polyculture.filter((id) => shipped(id) >= 15).length;
  const monoculture = Math.max(0, ...goals.monoculture.map(shipped));
  const quests = player.stats.questsCompleted ?? 0;
  const totalFish = player.stats.fishCaught ?? 0;

  const numeric: Record<string, [number, number]> = {
    0: [player.totalMoneyEarned, 15_000],
    1: [player.totalMoneyEarned, 50_000],
    2: [player.totalMoneyEarned, 250_000],
    3: [player.totalMoneyEarned, 1_000_000],
    4: [player.totalMoneyEarned, 10_000_000],
    5: [donated, 95],
    6: [friendsAt(5), 1],
    7: [friendsAt(10), 1],
    9: [friendsAt(10), 8],
    11: [friendsAt(5), 4],
    12: [friendsAt(5), 10],
    13: [friendsAt(5), 20],
    15: [cooked, 10],
    16: [cooked, 25],
    17: [cooked, goals.cooking.length],
    18: [player.houseUpgradeLevel, 1],
    19: [player.houseUpgradeLevel, 2],
    20: [crafted, 15],
    21: [crafted, 30],
    22: [crafted, goals.crafting.length],
    24: [species, 10],
    25: [species, 24],
    26: [species, goals.fish.length],
    27: [totalFish, 100],
    28: [donated, 40],
    29: [quests, 10],
    30: [quests, 40],
    31: [polyculture, goals.polyculture.length],
    32: [monoculture, 300],
  };

  return ids.map((id) => {
    const earned = player.achievements.includes(Number(id));
    const [value, goal] = numeric[id] ?? [null, null];
    return { id, earned, value: value === null ? null : Math.min(value, goal ?? value), goal };
  });
}
