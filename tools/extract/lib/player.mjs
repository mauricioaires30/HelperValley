import { readRaw } from './raw.mjs';
import { localize } from './strings.mjs';

const FARMER = 'Characters/Farmer/';

/** Skills in the game's index order (experiencePoints, StatKeys.Mastery). */
const SKILLS = [
  ['farming', 'SkillsPage.cs.11604'],
  ['fishing', 'SkillsPage.cs.11607'],
  ['foraging', 'SkillsPage.cs.11606'],
  ['mining', 'SkillsPage.cs.11605'],
  ['combat', 'SkillsPage.cs.11608'],
  ['luck', 'SkillsPage.cs.11609'],
];

/** Profession ids 0-29, in LevelUpMenu order (Farmer.cs profession constants). */
const PROFESSIONS = [
  'Rancher', 'Tiller', 'Coopmaster', 'Shepherd', 'Artisan', 'Agriculturist',
  'Fisher', 'Trapper', 'Angler', 'Pirate', 'Mariner', 'Luremaster',
  'Forester', 'Gatherer', 'Lumberjack', 'Tapper', 'Botanist', 'Tracker',
  'Miner', 'Geologist', 'Blacksmith', 'Prospector', 'Excavator', 'Gemologist',
  'Fighter', 'Scout', 'Brute', 'Defender', 'Acrobat', 'Desperado',
];

/** Mastery cave pedestals (MasteryTrackerMenu): reward items/recipes and the perk text, per skill index 0-4. */
const MASTERY = [
  { rewards: ['(W)66', '(BC)StatueOfBlessings'], perk: 'Farming_Mastery' },
  { rewards: ['(T)AdvancedIridiumRod', '(O)ChallengeBait'], perk: 'Fishing_Mastery' },
  { rewards: ['(O)MysticTreeSeed', '(O)TreasureTotem'], perk: 'Foraging_Mastery' },
  { rewards: ['(BC)StatueOfTheDwarfKing', '(BC)HeavyFurnace'], perk: 'Mining_Mastery' },
  { rewards: ['(BC)Anvil', '(BC)MiniForge'], perk: 'Trinkets_Description' },
];

const tex = (name) => (name ? name.replace(/\\/g, '/') : null);

/**
 * Data to draw the farmer like the game (FarmerRenderer) and to label skills, professions and mastery.
 * Adds every farmer sheet to `textures`.
 */
export function buildPlayer(textures) {
  for (const sheet of ['farmer_base', 'farmer_girl_base', 'hairstyles', 'hairstyles2', 'accessories', 'pants', 'shirts', 'hats', 'skinColors', 'shoeColors']) {
    textures.add(FARMER + sheet);
  }

  // Hair ids >= 100 live in other sheets: "sheet/tileX/tileY/uniqueLeft/coveredIndex/...".
  const hair = {};
  for (const [id, value] of Object.entries(readRaw('Data/HairData') ?? {})) {
    const [sheet, x, y, left, covered] = value.split('/');
    hair[id] = [FARMER + sheet, Number(x), Number(y), left === 'true', Number(covered ?? -1)];
    textures.add(FARMER + sheet);
  }

  const shirts = {};
  for (const [id, s] of Object.entries(readRaw('Data/Shirts') ?? {})) {
    if (s.Texture) textures.add(tex(s.Texture));
    shirts[id] = [tex(s.Texture), s.SpriteIndex, s.HasSleeves, s.DefaultColor, s.IsPrismatic];
  }
  const pants = {};
  for (const [id, p] of Object.entries(readRaw('Data/Pants') ?? {})) {
    if (p.Texture) textures.add(tex(p.Texture));
    pants[id] = [tex(p.Texture), p.SpriteIndex, p.DefaultColor, p.IsPrismatic];
  }

  // Data/hats: name/description/showRealHair(true|false|hide)/ignoreHairstyleOffset/tags/displayName/spriteIndex/texture
  const hats = {};
  for (const [id, value] of Object.entries(readRaw('Data/hats') ?? {})) {
    const f = value.split('/');
    const draw = f[2] === 'hide' ? 2 : f[2] === 'true' ? 0 : 1;
    const sheet = f[7] ? tex(f[7]) : null;
    if (sheet) textures.add(sheet);
    hats[id] = [draw, f[3] === 'true', sheet, f[6] ? Number(f[6]) : Number(id)];
  }

  // Data/Boots: name/description/price/defense/immunity/colorIndex/...
  const boots = {};
  for (const [id, value] of Object.entries(readRaw('Data/Boots') ?? {})) boots[id] = Number(value.split('/')[5] ?? 12);

  return {
    skills: SKILLS.map(([id, key]) => ({ id, n: localize(`[LocalizedText Strings\\StringsFromCSFiles:${key}]`) })),
    professions: PROFESSIONS.map((p) => ({
      n: localize(`[LocalizedText Strings\\UI:LevelUp_ProfessionName_${p}]`),
      d: localize(`[LocalizedText Strings\\UI:LevelUp_ProfessionDescription_${p}]`),
    })),
    mastery: MASTERY.map((m, i) => ({
      title: localize(`[LocalizedText Strings\\1_6_Strings:${i}_Mastery]`),
      perk: localize(`[LocalizedText Strings\\1_6_Strings:${m.perk}]`),
      rewards: m.rewards,
    })),
    look: { hair, shirts, pants, hats, boots },
  };
}
