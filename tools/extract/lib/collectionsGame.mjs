import { readRaw } from './raw.mjs';
import { LANGUAGES } from './paths.mjs';
import { localize } from './strings.mjs';

/**
 * Categories the game leaves out of the shipping collection (fertilizer, bait, tackle, saplings,
 * decor, trash), on top of object types that have their own collection tabs.
 */
const NOT_SHIPPED_CATEGORIES = new Set([-19, -21, -22, -74, -24, -20]);
const NOT_SHIPPED_TYPES = new Set(['Arch', 'Fish', 'Minerals', 'Cooking', 'Litter', 'Quest', 'asdf', 'interactive', 'Crafting', 'Ring', 'Seeds']);

/** Everything the in-game collections menu lists, plus where artisan goods come from. */
export function buildGameCollections() {
  const objects = readRaw('Data/Objects');

  const shipped = Object.entries(objects)
    .filter(([, o]) => !o.ExcludeFromShippingCollection && o.Category < 0 && !NOT_SHIPPED_TYPES.has(o.Type) && !NOT_SHIPPED_CATEGORIES.has(o.Category))
    .map(([id]) => `(O)${id}`);

  // Letters with a title ("...[#]A Gift From Robin") are the ones the collection shows.
  const letters = {};
  for (const key of Object.keys(readRaw('Data/mail'))) {
    const titles = LANGUAGES.map(([, suffix]) => (readRaw('Data/mail' + suffix) ?? readRaw('Data/mail'))[key]?.split('[#]')[1]?.trim());
    if (titles[0]) letters[key] = titles.map((t) => t || titles[0]);
  }

  // Which machine makes each item (kegs → wine, jars → jelly...).
  const madeBy = {};
  // "FLAVORED_ITEM Wine DROP_IN_ID" → the base Wine object (by id or name).
  const flavored = (type) => {
    if (objects[type]) return `(O)${type}`;
    const spaced = type.replace(/([a-z])([A-Z])/g, "$1 $2");
    const match = Object.entries(objects).find(([, o]) => [type, spaced, `${type}s`].includes(o.Name));
    return match ? `(O)${match[0]}` : null;
  };
  for (const [machine, data] of Object.entries(readRaw('Data/Machines'))) {
    for (const rule of data.OutputRules ?? []) {
      for (const out of rule.OutputItem ?? []) {
        const raw = out.ItemId ?? '';
        const id = raw.startsWith('FLAVORED_ITEM ') ? flavored(raw.split(' ')[1]) : raw.startsWith('(') ? raw : raw ? `(O)${raw}` : null;
        if (!id || id.includes('DROP_IN')) continue;
        (madeBy[id] ??= []).includes(machine) || madeBy[id].push(machine);
      }
    }
  }

  // Recipe ingredients: "id count id count/..."; negative ids are categories (-4 any fish, -5 egg, -6 milk...).
  const ingredientsOf = (asset) =>
    Object.fromEntries(
      Object.entries(readRaw(asset) ?? {}).map(([name, raw]) => {
        const parts = raw.split('/')[0].split(' ');
        const list = [];
        for (let i = 0; i + 1 < parts.length; i += 2) {
          const id = parts[i];
          const category = /^-\d+$/.test(id);
          list.push([category || id.startsWith('(') ? id : `(O)${id}`, Number(parts[i + 1])]);
        }
        return [name, list];
      }),
    );
  const ingredients = { cooking: ingredientsOf('Data/CookingRecipes'), crafting: ingredientsOf('Data/CraftingRecipes') };

  // Adventurer's Guild monster eradication goals; monster names localized from Data/Monsters (last field).
  const monsterName = (id) => LANGUAGES.map(([, suffix]) => (readRaw('Data/Monsters' + suffix) ?? readRaw('Data/Monsters'))?.[id]?.split('/').at(-1) || id);
  const slayer = Object.entries(readRaw('Data/MonsterSlayerQuests') ?? {}).map(([id, q]) => ({
    id,
    n: localize(q.DisplayName, id),
    targets: q.Targets.map((m) => [m, monsterName(m)]),
    count: q.Count,
    reward: q.RewardItemId ?? null,
  }));

  // Flavored goods names by Object.preserve value (Strings/Objects "<Kind>_Flavored_Name": "{0} Wine").
  const FLAVOR_KEYS = { Wine: 'Wine', Jelly: 'Jelly', Pickle: 'Pickles', Juice: 'Juice', Roe: 'Roe', AgedRoe: 'AgedRoe', Honey: 'Honey', DriedFruit: 'DriedFruit', DriedMushroom: 'DriedFruit', SmokedFish: 'SmokedFish', Bait: 'SpecificBait' };
  const flavorNames = Object.fromEntries(Object.entries(FLAVOR_KEYS).map(([kind, key]) => [kind, localize(`[LocalizedText Strings\\Objects:${key}_Flavored_Name]`, '{0}')]));

  return { shipped, letters, secretNotes: Object.keys(readRaw('Data/SecretNotes')).map(Number), madeBy, ingredients, slayer, flavorNames };
}
