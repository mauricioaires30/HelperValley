import { readRaw } from './raw.mjs';

const SEASONS = ['spring', 'summer', 'fall', 'winter'];

/** "LOCATION_SEASON Here spring summer" → ["spring", "summer"]. */
const seasonsFromCondition = (condition) => {
  const m = condition?.match(/LOCATION_SEASON Here ([a-z ]+)/);
  return m ? m[1].trim().split(/\s+/) : null;
};

/**
 * Every fish with when it bites (times, seasons, weather, fishing level) and where:
 * locations from Data/Locations fish lists. Crab pot catches only say ocean or fresh water.
 */
export function buildFish() {
  const fishData = readRaw('Data/Fish');
  const locations = readRaw('Data/Locations');
  const fish = {};

  for (const [id, raw] of Object.entries(fishData)) {
    const f = raw.split('/');
    if (f[1] === 'trap') {
      fish[`(O)${id}`] = { trap: f[4] === 'ocean' ? 'ocean' : 'freshwater', locations: [] };
      continue;
    }
    const times = f[5].split(' ').map(Number);
    fish[`(O)${id}`] = {
      times: Array.from({ length: times.length / 2 }, (_, i) => [times[i * 2], times[i * 2 + 1]]),
      seasons: f[6].split(' '),
      weather: f[7], // sunny, rainy or both
      level: Number(f[12]) || 0,
      locations: [],
    };
  }

  for (const [location, data] of Object.entries(locations)) {
    // Minigame and scratch locations aren't real fishing spots.
    if (['Default', 'fishingGame', 'Temp'].includes(location)) continue;
    for (const entry of data.Fish ?? []) {
      const id = entry.ItemId;
      // Skip the Legendary Family special order versions (the normal ones say "!...LEGENDARY_FAMILY").
      const familyOnly = /(^|, )PLAYER_SPECIAL_ORDER_RULE_ACTIVE Current LEGENDARY_FAMILY/.test(entry.Condition ?? '');
      if (!id || !fish[id] || familyOnly) continue;
      const seasons = entry.Season != null ? [SEASONS[entry.Season]] : seasonsFromCondition(entry.Condition);
      const where = location.startsWith('Farm_') ? 'Farm' : location;
      if (fish[id].locations.some((l) => l.location === where)) continue;
      fish[id].locations.push({ location: where, ...(seasons ? { seasons } : {}), ...(entry.FishAreaId ? { area: entry.FishAreaId } : {}) });
    }
  }
  return fish;
}
