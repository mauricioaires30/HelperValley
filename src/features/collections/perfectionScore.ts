import { gameData } from '@/data/gameData';
import type { Player, SaveData } from '@/save/model';
import { farmerLevel } from '@/features/player/progress';

/** One part of Utility.percentGameComplete: progress 0-1 and how many points it's worth. */
export interface PerfectionPart {
  key: string;
  weight: number;
  progress: number;
  /** "12/34"-style detail. */
  have: number;
  of: number;
  /** Page that helps with it. */
  to: string;
}

const STARDROP_FLAGS = ['CF_Fair', 'CF_Fish', 'CF_Mines', 'CF_Sewer', 'museumComplete', 'CF_Spouse', 'CF_Statue'];
const OBELISKS = ['Water Obelisk', 'Earth Obelisk', 'Desert Obelisk', 'Island Obelisk'];

const bare = (id: string) => id.replace(/^\(O\)/, '');

/** Per-farmer parts: in multiplayer the game takes the best farmer for each (GetFarmCompletion). */
function farmerParts(p: Player) {
  const data = gameData();
  const shippable = data.gameCollections.shipped;
  const shipped = shippable.filter((id) => (p.basicShipped[bare(id)] ?? 0) > 0).length;

  const npcs = Object.entries(data.npcs).filter(([, n]) => n.perfection);
  const maxed = npcs.filter(([id, n]) => (p.friendships[id]?.points ?? 0) >= (n.romance ? 8 : 10) * 250).length;

  const cookingRecipes = Object.entries(data.achievementGoals.cookingOutputs);
  const cooked = cookingRecipes.filter(([recipe, out]) => recipe in p.cookingRecipes && (p.recipesCooked[bare(out)] ?? 0) > 0).length;

  const craftingRecipes = Object.keys(data.gameCollections.ingredients.crafting).filter((r) => r !== 'Wedding Ring');
  const crafted = craftingRecipes.filter((r) => (p.craftingRecipes[r] ?? 0) > 0).length;

  const fish = data.achievementGoals.fish;
  const caught = fish.filter((id) => p.fishCaught[bare(id)] || p.fishCaught[id]).length;

  const mail = new Set(p.mailReceived);
  const stardrops = mail.has('gotMaxStamina') ? 7 : STARDROP_FLAGS.filter((f) => mail.has(f)).length;

  const slayer = data.gameCollections.slayer;
  const slain = slayer.filter((g) => g.targets.reduce((n, [id]) => n + (p.monstersKilled[id] ?? 0), 0) >= g.count).length;

  return {
    shipping: [shipped, shippable.length],
    friends: [maxed, npcs.length],
    level: [Math.min(farmerLevel(p), 25), 25],
    cooking: [cooked, cookingRecipes.length],
    crafting: [crafted, craftingRecipes.length],
    fish: [caught, fish.length],
    stardrops: [stardrops, 7],
    slayer: [slain, slayer.length],
  } as Record<string, [number, number]>;
}

/** Utility.percentGameComplete, part by part. */
export function perfection(save: SaveData): PerfectionPart[] {
  const per = save.players.map(farmerParts);
  const best = (key: string): [number, number] => per.reduce((a, b) => (b[key][0] / b[key][1] > a[0] / a[1] ? b[key] : a), per[0][key]);
  const built = new Set(save.farm.buildings.filter((b) => b.building <= 0).map((b) => b.type));
  const obelisks = OBELISKS.filter((o) => built.has(o)).length;
  const walnuts = Math.min(save.goldenWalnutsFound, 130);

  const ratio = ([h, o]: [number, number]) => (o ? h / o : 0);
  // Some parts only count when complete (all stardrops, every slayer goal, the Gold Clock).
  const all = ([h, o]: [number, number]) => (h >= o ? 1 : 0);
  const part = (key: string, weight: number, [have, of]: [number, number], progress: number, to: string): PerfectionPart => ({ key, weight, progress, have, of, to });

  return [
    part('shipping', 15, best('shipping'), ratio(best('shipping')), '/collections/shipped'),
    part('obelisks', 4, [obelisks, 4], obelisks / 4, '/farm/buildings'),
    part('goldClock', 10, [built.has('Gold Clock') ? 1 : 0, 1], built.has('Gold Clock') ? 1 : 0, '/farm/buildings'),
    part('slayer', 10, best('slayer'), all(best('slayer')), '/quests'),
    part('friends', 11, best('friends'), ratio(best('friends')), '/relationships'),
    part('level', 5, best('level'), ratio(best('level')), '/player'),
    part('stardrops', 10, best('stardrops'), all(best('stardrops')), '/collections/stardrops'),
    part('cooking', 10, best('cooking'), ratio(best('cooking')), '/collections/cooking'),
    part('crafting', 10, best('crafting'), ratio(best('crafting')), '/collections/crafting'),
    part('fish', 10, best('fish'), ratio(best('fish')), '/collections/fish'),
    part('walnuts', 5, [walnuts, 130], walnuts / 130, '/collections/walnuts'),
  ];
}

export const perfectionTotal = (parts: PerfectionPart[]) => parts.reduce((n, p) => n + p.progress * p.weight, 0);
