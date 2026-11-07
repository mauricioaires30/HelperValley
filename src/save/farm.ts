import type { CropState, FarmAnimalState, FarmArea, FarmState } from './model';
import { arr, bool, dictEntries, node, num, numbers, text, xsiType, type XmlNode, type XmlValue } from './xml';

/** Locations whose tilled soil we track. */
const AREAS = ['Farm', 'Greenhouse', 'IslandWest'];

/** Sprinkler item id → [kind, tiles watered, tiles with a pressure nozzle]. */
const SPRINKLERS: Record<string, ['basic' | 'quality' | 'iridium', number, number]> = {
  '599': ['basic', 4, 8],
  '621': ['quality', 8, 24],
  '645': ['iridium', 24, 48],
};
const PRESSURE_NOZZLE = '915';
const BEE_HOUSE = '10';
/** Machines worth counting for planning (big craftable ids). */
const MACHINES: Record<string, string> = { '12': 'keg', '15': 'jar', '25': 'seedMaker', '105': 'tapper', '163': 'cask' };

/** Days until a crop can be harvested, from its serialized growth state. */
export function daysToHarvest(crop: XmlNode): number {
  if (bool(crop.dead)) return -1;
  const phases = numbers(crop.phaseDays);
  const current = num(crop.currentPhase);
  const day = num(crop.dayOfCurrentPhase);
  const last = phases.length - 1; // the final "phase" (99999) is the grown state
  if (current >= last) {
    // Regrowing crops count down in dayOfCurrentPhase once grown.
    return bool(crop.fullGrown) ? Math.max(0, day) : 0;
  }
  let days = Math.max(0, phases[current] - day);
  for (let i = current + 1; i < last; i++) days += phases[i];
  return days;
}

function cropState(dirt: XmlNode, inPot: boolean): CropState | null {
  const crop = node(dirt.crop);
  if (!crop || bool(crop.forageCrop)) return null;
  const seed = text(crop.netSeedIndex) ?? text(crop.seedIndex) ?? '';
  const harvest = text(crop.indexOfHarvest) ?? '';
  return {
    seed: seed.startsWith('(') ? seed : `(O)${seed}`,
    harvest: harvest.startsWith('(') ? harvest : `(O)${harvest}`,
    daysToHarvest: daysToHarvest(crop),
    dead: bool(crop.dead),
    regrowing: bool(crop.fullGrown),
    fertilizer: text(dirt.fertilizer) || undefined,
    inPot,
  };
}

function readArea(location: XmlNode): FarmArea {
  const area: FarmArea = {
    location: text(location.name) ?? '',
    tilled: 0,
    pots: 0,
    crops: [],
    sprinklers: { basic: 0, quality: 0, iridium: 0, nozzles: 0 },
    sprinklerTiles: 0,
    beeHouses: 0,
    machines: {},
  };

  for (const [, value] of dictEntries(location.terrainFeatures)) {
    const feature = node(value);
    if (xsiType(feature) !== 'HoeDirt' || !feature) continue;
    area.tilled++;
    const crop = cropState(feature, false);
    if (crop) area.crops.push(crop);
  }

  for (const [, value] of dictEntries(location.objects)) {
    const object = node(value);
    if (!object) continue;
    const id = text(object.itemId) ?? text(object.parentSheetIndex) ?? '';
    const big = bool(object.bigCraftable);
    if (xsiType(object) === 'IndoorPot') {
      area.pots++;
      const dirt = node(object.hoeDirt);
      const crop = dirt ? cropState(dirt, true) : null;
      if (crop) area.crops.push(crop);
    } else if (!big && SPRINKLERS[id]) {
      const [kind, tiles, nozzleTiles] = SPRINKLERS[id];
      const nozzle = text(node(object.heldObject)?.itemId) === PRESSURE_NOZZLE;
      area.sprinklers[kind]++;
      if (nozzle) area.sprinklers.nozzles++;
      area.sprinklerTiles += nozzle ? nozzleTiles : tiles;
    } else if (big && id === BEE_HOUSE) {
      area.beeHouses++;
    } else if (big && MACHINES[id]) {
      area.machines[MACHINES[id]] = (area.machines[MACHINES[id]] ?? 0) + 1;
    }
  }
  return area;
}

function readAnimals(location: XmlNode, building: string): FarmAnimalState[] {
  return dictEntries(location.animals).flatMap(([, value]) => {
    const animal = node(node(value)?.FarmAnimal ?? value);
    if (!animal) return [];
    return [{ type: text(animal.type) ?? '', name: text(animal.name) ?? '', friendship: num(animal.friendshipTowardFarmer), building }];
  });
}

/** Planting areas, animals, silos and hay for the farm planner. */
export function readFarm(locations: XmlValue[]): FarmState {
  const state: FarmState = { areas: [], animals: [], silos: 0, hay: 0 };
  for (const value of locations) {
    const location = node(value);
    if (!location) continue;
    const name = text(location.name) ?? '';
    if (AREAS.includes(name)) state.areas.push(readArea(location));
    if (name === 'Farm') state.hay = num(location.piecesOfHay);

    for (const b of arr(node(location.buildings)?.Building)) {
      const building = node(b);
      const type = text(building?.buildingType) ?? '';
      if (type === 'Silo') state.silos++;
      const indoors = node(building?.indoors);
      if (indoors) state.animals.push(...readAnimals(indoors, type));
    }
    // Animals currently outside on the farm.
    if (name === 'Farm') state.animals.push(...readAnimals(location, 'Farm'));
  }
  return state;
}
