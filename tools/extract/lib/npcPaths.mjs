import { unpackToContent } from 'xnb';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readRaw } from './raw.mjs';

/** Reads a tBIN map: map properties, tile sheet properties, and every layer's tiles. */
export function parseTbin(buf) {
  let o = 6; // "tBIN10"
  const int = () => {
    const v = buf.readInt32LE(o);
    o += 4;
    return v;
  };
  const str = () => {
    const len = int();
    const s = buf.toString('utf8', o, o + len);
    o += len;
    return s;
  };
  const props = () => {
    const out = {};
    const count = int();
    for (let i = 0; i < count; i++) {
      const key = str();
      const type = buf.readUInt8(o++);
      if (type === 0) out[key] = buf.readUInt8(o++) !== 0;
      else if (type === 1) out[key] = int();
      else if (type === 2) {
        out[key] = buf.readFloatLE(o);
        o += 4;
      } else out[key] = str();
    }
    return out;
  };
  str(); // id
  str(); // description
  const properties = props();
  const sheets = {};
  const sheetCount = int();
  for (let i = 0; i < sheetCount; i++) {
    const id = str();
    str(); // description
    str(); // image source
    o += 8 * 4; // sheet size, tile size, margin, spacing
    sheets[id] = props();
  }
  const layers = {};
  const layerCount = int();
  for (let i = 0; i < layerCount; i++) {
    const id = str();
    o += 1; // visible
    str(); // description
    const w = int();
    const h = int();
    o += 2 * 4; // tile size
    props();
    const tiles = new Array(w * h).fill(null);
    let sheet = null;
    const staticTile = () => {
      const index = int();
      o += 1; // blend mode
      return { index, sheet, props: props() };
    };
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const c = String.fromCharCode(buf.readUInt8(o++));
        if (c === 'T') sheet = str();
        else if (c === 'N') x += int();
        else if (c === 'S') tiles[y * w + x++] = staticTile();
        else if (c === 'A') {
          o += 4; // frame interval
          const frames = int();
          let first = null;
          for (let done = 0; done < frames; ) {
            const f = String.fromCharCode(buf.readUInt8(o++));
            if (f === 'T') sheet = str();
            else if (f === 'S') {
              const frame = staticTile();
              first ??= frame;
              done++;
            } else throw new Error(`Bad animated tile "${f}" in layer ${id}`);
          }
          tiles[y * w + x++] = { index: first.index, sheet: first.sheet, props: props() };
        } else throw new Error(`Bad tile command "${c}" in layer ${id}`);
      }
    }
    layers[id] = { w, h, tiles };
  }
  return { properties, sheets, layers };
}

// GameLocation.loadPathsLayerObjectsInArea: trees (TryGetTreeIdForTile) and bushes with their widths.
const PATH_TREES = new Set([9, 10, 11, 12, 31, 32, 34]);
const PATH_BUSHES = { 24: 3, 25: 2, 26: 1, 33: 1 };
const TERRAIN = { stone: 's', wood: 'w', dirt: 'd', grass: 'g' };

/** The door warps of a map (GameLocation.updateDoors and getWarpPointTarget). */
function doorsOf(map, location) {
  const { w, h, tiles } = map.layers.Buildings;
  const doors = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const action = tiles[y * w + x]?.props.Action;
      if (typeof action !== 'string' || !action.includes('Warp')) continue;
      const parts = action.trim().split(/\s+/);
      if (parts[0] === 'WarpBoatTunnel') doors.push([x, y, 'BoatTunnel', 17, 43]);
      else if (parts[0] === 'WarpCommunityCenter') doors.push([x, y, 'CommunityCenter', 32, 23]);
      else if (parts[0] === 'Warp_Sunroom_Door') doors.push([x, y, 'Sunroom', 5, 13]);
      else if (parts[3] && !(location === 'Mountain' && x === 8 && y === 20)) doors.push([x, y, parts[3], Number(parts[1]), Number(parts[2])]);
    }
  }
  return doors;
}

/** The walking grid of a map, by PathFindController.isPositionImpassableForNPCSchedule. */
function gridOf(map, warps) {
  const { w, h } = map.layers.Back;
  const tileProp = (tile, name) => tile?.props[name] ?? (tile ? map.sheets[tile.sheet]?.[`@TileIndex@${tile.index}@${name}`] : undefined);
  const blocked = new Set(warps.map(([x, y]) => y * w + x));
  const paths = map.layers.Paths;
  if (paths) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const index = paths.tiles[y * w + x]?.index;
        if (PATH_TREES.has(index)) blocked.add(y * w + x);
        for (let i = 0; i < (PATH_BUSHES[index] ?? 0); i++) if (x + i < w) blocked.add(y * w + x + i);
      }
    }
  }
  const trees = String(map.properties.Trees ?? '').trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i + 2 < trees.length; i += 3) blocked.add(Number(trees[i + 1]) * w + Number(trees[i]));

  let cells = '';
  for (let i = 0; i < w * h; i++) {
    const building = map.layers.Buildings.tiles[i];
    const back = map.layers.Back.tiles[i];
    let stop = blocked.has(i);
    if (building && building.index !== -1) {
      const action = tileProp(building, 'Action');
      if (action !== undefined) stop ||= String(action).startsWith('LockedDoorWarp') || !(String(action).includes('Door') || String(action).includes('Passable'));
      else stop ||= tileProp(building, 'Passable') === undefined && tileProp(building, 'NPCPassable') === undefined;
    }
    stop ||= tileProp(back, 'NoPath') !== undefined;
    cells += stop ? '#' : (TERRAIN[String(tileProp(back, 'Type') ?? '').toLowerCase()] ?? '.');
  }
  return { w, h, cells };
}

/** Runs of the same cell, "3#2.": the grids are mostly long runs. */
const pack = (cells) => cells.replace(/(.)\1*/g, (run, c) => `${run.length}${c}`);

/** Every location NPCs can walk through: its walking grid, warps and doors. */
export async function buildNpcPaths(gameDir) {
  const locations = readRaw('Data/Locations');
  const { log, info } = console;
  const out = {};
  for (const [location, data] of Object.entries(locations)) {
    if (location === 'Default' || data.ExcludeFromNpcPathfinding) continue;
    const mapPath = data.CreateOnLoad?.MapPath?.split(/[\\/]/).pop() ?? location;
    const file = path.join(gameDir, 'Content', 'Maps', `${mapPath}.xnb`);
    if (!existsSync(file)) continue;
    console.log = console.info = () => {};
    let map;
    try {
      const result = await unpackToContent(await readFile(file));
      map = parseTbin(Buffer.from(result.content instanceof Blob ? await result.content.arrayBuffer() : result.content));
    } finally {
      Object.assign(console, { log, info });
    }
    if (!map.layers.Back || !map.layers.Buildings) continue;
    // NPCWarp comes before Warp, as in GameLocation.updateWarps.
    const words = [map.properties.NPCWarp, map.properties.Warp].flatMap((v) => (typeof v === 'string' ? v.trim().split(/\s+/) : []));
    const warps = [];
    for (let i = 0; i + 4 < words.length; i += 5) {
      const [x, y, target, tx, ty] = words.slice(i, i + 5);
      if ([x, y, tx, ty].every((n) => Number.isInteger(Number(n)))) warps.push([Number(x), Number(y), target, Number(tx), Number(ty)]);
    }
    const { w, h, cells } = gridOf(map, warps);
    out[location] = { w, h, cells: pack(cells), warps, doors: doorsOf(map, location) };
  }
  return out;
}
