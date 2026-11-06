import { readRaw } from './raw.mjs';
import { LANGUAGES } from './paths.mjs';
import { localize } from './strings.mjs';

const perLanguage = (asset, key) => LANGUAGES.map(([, suffix]) => (readRaw(asset + suffix) ?? readRaw(asset))?.[key] ?? key);

/** Community Center room ids in the game's area order (areasComplete index). */
const CC_AREAS = ['Pantry', 'CraftsRoom', 'FishTank', 'BoilerRoom', 'Vault', 'BulletinBoard', 'AbandonedJojaMart'];

/**
 * Bundle/room display strings. Bundle definitions themselves come from each save's bundleData,
 * since remixed bundles differ per save.
 */
export function buildBundles() {
  const names = {};
  // Remixed bundle names.
  for (const key of Object.keys(readRaw('Strings/BundleNames'))) names[key] = perLanguage('Strings/BundleNames', key);
  // Standard bundles: the localized display name is the last field of each definition.
  for (const key of Object.keys(readRaw('Data/Bundles'))) {
    const rows = LANGUAGES.map(([, suffix]) => (readRaw('Data/Bundles' + suffix) ?? readRaw('Data/Bundles'))[key].split('/'));
    names[rows[0][0]] ??= rows.map((r) => r.at(-1) || r[0]);
  }
  return {
    names,
    format: perLanguage('Strings/UI', 'JunimoNote_BundleName'),
    areas: CC_AREAS.map((id) => ({ id, n: perLanguage('Strings/Locations', `CommunityCenter_AreaName_${id}`) })),
  };
}

/** Achievements: [en, pt] names and descriptions, prerequisite and visibility. */
export function buildAchievements() {
  const out = {};
  for (const id of Object.keys(readRaw('Data/Achievements'))) {
    const rows = LANGUAGES.map(([, suffix]) => (readRaw('Data/Achievements' + suffix) ?? readRaw('Data/Achievements'))[id].split('^'));
    out[id] = {
      n: rows.map((r) => r[0]),
      d: rows.map((r) => r[1]),
      shown: rows[0][2] === 'true',
      pre: Number(rows[0][3]),
    };
  }
  return out;
}

/** Geode-like containers whose drop tables list museum items. */
const GEODES = ['(O)535', '(O)536', '(O)537', '(O)749', '(O)275', '(O)791'];
/** Omni geodes also roll the regular, frozen and magma geode tables. */
const OMNI_INCLUDES = ['(O)535', '(O)536', '(O)537'];

/**
 * Items that can be donated to the museum (artifacts and minerals), in collection order,
 * with where to find them: geodes that drop them and locations where they can be dug up.
 */
export function buildMuseum() {
  const objects = readRaw('Data/Objects');
  const ids = (type) =>
    Object.entries(objects)
      .filter(([, o]) => o.Type === type)
      .map(([id]) => `(O)${id}`);
  const artifacts = ids('Arch');
  const minerals = ids('Minerals');
  const museumItems = new Set([...artifacts, ...minerals]);

  const sources = {};
  const addSource = (item, kind, value) => {
    if (!museumItems.has(item)) return;
    sources[item] ??= { geodes: [], dig: [] };
    if (!sources[item][kind].includes(value)) sources[item][kind].push(value);
  };

  const geodeDrops = (geode) =>
    (objects[geode.slice(3)]?.GeodeDrops ?? []).flatMap((d) => [d.ItemId, ...(d.RandomItemId ?? [])]).filter(Boolean);
  for (const geode of GEODES) {
    const drops = new Set(geodeDrops(geode));
    if (geode === '(O)749') OMNI_INCLUDES.forEach((g) => geodeDrops(g).forEach((d) => drops.add(d)));
    drops.forEach((item) => addSource(item, 'geodes', geode));
  }

  for (const [key, location] of Object.entries(readRaw('Data/Locations'))) {
    // Farm types and island areas collapse into one entry each.
    const where = key.startsWith('Farm_') ? 'Farm' : key.startsWith('Island') ? 'Island' : key;
    for (const spot of location.ArtifactSpots ?? []) {
      for (const item of [spot.ItemId, ...(spot.RandomItemId ?? [])]) if (item) addSource(item, 'dig', where);
    }
  }

  const descriptions = {};
  for (const id of museumItems) descriptions[id] = localize(objects[id.slice(3)].Description);

  const places = {};
  for (const key of ['Town', 'Beach', 'Mountain', 'Forest', 'BusStop', 'Desert', 'Woods', 'Railroad', 'Backwoods']) {
    places[key] = localize(readRaw('Data/Locations')[key].DisplayName, key);
  }

  return { artifacts, minerals, sources, descriptions, places };
}
