import { unpackToContent } from 'xnb';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readRaw } from './raw.mjs';
import { parseTbin } from './npcPaths.mjs';

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
      // The night market repeats the beach's list.
      if (!id || !fish[id] || location === 'BeachNightMarket') continue;
      const seasons = entry.Season != null ? [SEASONS[entry.Season]] : seasonsFromCondition(entry.Condition);
      const where = location.startsWith('Farm_') ? 'Farm' : location;
      if (fish[id].locations.some((l) => l.location === where && l.area === (entry.FishAreaId ?? undefined))) continue;
      const near = entry.PlayerPosition ?? entry.BobberPosition;
      fish[id].locations.push({
        location: where,
        ...(seasons ? { seasons } : {}),
        ...(entry.FishAreaId ? { area: entry.FishAreaId } : {}),
        ...(near ? { near: [near.X, near.Y, near.Width, near.Height] } : {}),
      });
      // Legendaries ignore the usual rules: only what their entry says counts.
      if (entry.IgnoreFishDataRequirements) {
        fish[id].times = [[600, 2600]];
        fish[id].seasons = SEASONS;
        // The Legend needs rain on the mountain; its other entry doesn't undo that.
        fish[id].weather = /WEATHER Here Rain/.test(entry.Condition ?? '') || fish[id].ignoresRules === 'rainy' ? 'rainy' : 'both';
        fish[id].ignoresRules = fish[id].weather;
        fish[id].level = entry.MinFishingLevel ?? 0;
      }
    }
  }
  return fish;
}

/** Water tiles of a map's Back layer, with its size. */
function waterTiles(map) {
  const { w, h, tiles } = map.layers.Back;
  const water = new Set();
  for (let i = 0; i < w * h; i++) {
    const t = tiles[i];
    if (t && (t.props.Water !== undefined || map.sheets[t.sheet]?.[`@TileIndex@${t.index}@Water`] !== undefined)) water.add(i);
  }
  return { w, h, water };
}

/** The middle tile of the largest patch of water among these tiles. */
function middleOfWater(indexes, w) {
  const left = new Set(indexes);
  let best = [];
  for (const start of indexes) {
    if (!left.has(start)) continue;
    left.delete(start);
    const patch = [start];
    for (let k = 0; k < patch.length; k++) {
      const p = patch[k];
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (left.has(q) && Math.abs((q % w) - (p % w)) <= 1) {
          left.delete(q);
          patch.push(q);
        }
      }
    }
    if (patch.length > best.length) best = patch;
  }
  if (!best.length) return null;
  const cx = best.reduce((n, p) => n + p % w, 0) / best.length;
  const cy = best.reduce((n, p) => n + Math.floor(p / w), 0) / best.length;
  const middle = best.reduce((a, b) => (Math.hypot((a % w) - cx, Math.floor(a / w) - cy) <= Math.hypot((b % w) - cx, Math.floor(b / w) - cy) ? a : b));
  return [middle % w, Math.floor(middle / w)];
}

/**
 * Fills each fish location with `spots`: tiles in the water it really bites in. A fishing area is the
 * water inside its rectangle (or outside the others'); legendaries, the water near where you must stand.
 */
export async function addFishSpots(fish, gameDir) {
  const locations = readRaw('Data/Locations');
  const maps = new Map();
  const load = async (location) => {
    if (maps.has(location)) return maps.get(location);
    const mapPath = locations[location]?.CreateOnLoad?.MapPath?.split(/[\\/]/).pop() ?? location;
    const file = path.join(gameDir, 'Content', 'Maps', `${mapPath}.xnb`);
    let parsed = null;
    if (existsSync(file)) {
      const { log, info } = console;
      console.log = console.info = () => {};
      try {
        const result = await unpackToContent(await readFile(file));
        parsed = waterTiles(parseTbin(Buffer.from(result.content instanceof Blob ? await result.content.arrayBuffer() : result.content)));
      } finally {
        Object.assign(console, { log, info });
      }
    }
    maps.set(location, parsed);
    return parsed;
  };
  const inside = (i, w, r) => r && i % w >= r.X && i % w < r.X + r.Width && Math.floor(i / w) >= r.Y && Math.floor(i / w) < r.Y + r.Height;

  for (const entry of Object.values(fish)) {
    delete entry.ignoresRules;
    for (const l of entry.locations) {
      const near = l.near;
      delete l.near;
      if (l.location === 'Farm') continue; // Depends on the farm type: the map shows just one.
      const map = await load(l.location);
      if (!map?.water.size) continue;
      const { w, water } = map;
      const all = [...water];
      const areas = Object.entries(locations[l.location]?.FishAreas ?? {});
      const inArea = (id) => {
        const position = areas.find(([a]) => a === id)?.[1]?.Position;
        const rects = areas.map(([, a]) => a?.Position).filter(Boolean);
        return all.filter((i) => (position ? inside(i, w, position) : !rects.some((r) => inside(i, w, r))));
      };
      let groups;
      if (near) {
        const reach = { X: near[0] - 6, Y: near[1] - 6, Width: near[2] + 12, Height: near[3] + 12 };
        groups = [all.filter((i) => inside(i, w, reach))];
      } else if (l.area) groups = [inArea(l.area)];
      // No area named: everywhere in the location with real room to fish.
      else groups = areas.length ? areas.map(([id]) => inArea(id)).filter((g) => g.length >= 30) : [all];
      const spots = groups.map((g) => middleOfWater(g, w)).filter(Boolean);
      if (spots.length) l.spots = spots;
    }
  }
  return fish;
}
