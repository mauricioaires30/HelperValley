import { readRaw } from './raw.mjs';
import { LANGUAGES } from './paths.mjs';

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

/** Items that can be donated to the museum (artifacts and minerals), in collection order. */
export function buildMuseum() {
  const objects = readRaw('Data/Objects');
  const ids = (type) =>
    Object.entries(objects)
      .filter(([, o]) => o.Type === type)
      .map(([id]) => `(O)${id}`);
  return { artifacts: ids('Arch'), minerals: ids('Minerals') };
}
