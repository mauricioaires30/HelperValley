import { unpackToContent } from 'xnb';
import { PNG } from 'pngjs';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readRaw } from './raw.mjs';
import { localize } from './strings.mjs';

/**
 * Reads a map's size in tiles from its tBIN data (first layer's width/height).
 * Layout: "tBIN10", id, description, properties, tile sheets, then layers.
 */
function tbinSize(buf) {
  let o = 6;
  const int = () => {
    const v = buf.readInt32LE(o);
    o += 4;
    return v;
  };
  const str = () => {
    const len = int();
    o += len;
  };
  const props = () => {
    const count = int();
    for (let i = 0; i < count; i++) {
      str();
      const type = buf.readUInt8(o++);
      if (type === 0) o += 1; // bool
      else if (type === 1 || type === 2) o += 4; // int / float
      else str(); // string
    }
  };
  str(); // id
  str(); // description
  props();
  const sheets = int();
  for (let i = 0; i < sheets; i++) {
    str(); // id
    str(); // description
    str(); // image source
    o += 8 * 4; // sheet size, tile size, margin, spacing
    props();
  }
  int(); // layer count
  str(); // layer id
  o += 1; // visible
  str(); // description
  return [int(), int()];
}

async function mapSize(gameDir, location) {
  // Map asset names can differ from location names (IslandWest → Maps/Island_W).
  const mapPath = readRaw('Data/Locations')[location]?.CreateOnLoad?.MapPath?.split(/[\\/]/).pop() ?? location;
  const file = path.join(gameDir, 'Content', 'Maps', `${mapPath}.xnb`);
  if (!existsSync(file)) return null;
  const { log, info } = console;
  console.log = console.info = () => {};
  try {
    const result = await unpackToContent(await readFile(file));
    const buf = Buffer.from(result.content instanceof Blob ? await result.content.arrayBuffer() : result.content);
    return tbinSize(buf);
  } catch {
    return null;
  } finally {
    Object.assign(console, { log, info });
  }
}

const rect = (r) => (r && !r.IsEmpty ? [r.X, r.Y, r.Width, r.Height] : null);

/**
 * The game shows the whole desert as one pixel (36,20), but the map draws a wide sand area. Its tiles
 * go on that sand, with the bus stop tile (18,26) on the drawn road; buildings sit at their door tile (6,51).
 */
const DESERT_PIXELS = {
  Desert: [6, 4, 46, 36],
  DesertFestival: [6, 4, 46, 36],
  SkullCave: [12, 8, 2, 2],
  SandyHouse: [11, 34, 2, 2],
  SandyShop: [11, 34, 2, 2],
  Club: [14, 34, 2, 2],
};

/**
 * The in-game world maps (Valley and Ginger Island) and how each location's tiles land on
 * them, from Data/WorldMap. Outdoor locations without a tile area are scaled by map size.
 */
export async function buildWorldMap(gameDir, textures) {
  const data = readRaw('Data/WorldMap');
  const regions = {};
  for (const [regionId, region] of Object.entries(data)) {
    const base = region.BaseTexture?.[0];
    const texture = base.Texture.replace(/\\/g, '/');
    textures.add(texture);
    const positions = [];
    for (const area of region.MapAreas ?? []) {
      for (const p of area.WorldPositions ?? []) {
        const names = p.LocationNames?.length ? p.LocationNames : [p.LocationName];
        for (const location of names.filter(Boolean)) {
          positions.push({
            location,
            tiles: rect(p.TileArea),
            // Without its own pixel area, a position covers the whole map area.
            pixels: DESERT_PIXELS[location] ?? rect(p.MapPixelArea) ?? rect(area.PixelArea),
            n: p.ScrollText ? localize(p.ScrollText, location) : null,
          });
        }
      }
    }
    // Leo's tree house isn't on the game's map: it's up the mountain, where its warp leads (tile 16,8).
    if (regionId === 'Valley') positions.push({ location: 'LeoTreeHouse', tiles: null, pixels: [176, 29, 2, 2], n: null });
    regions[regionId] = { texture, source: rect(base.SourceRect), positions, water: await waterMask(gameDir, texture, rect(base.SourceRect)) };
  }

  // Locations mapped as a whole need their size to place tiles inside the pixel area.
  const sizes = {};
  for (const region of Object.values(regions)) {
    for (const p of region.positions) {
      if (!p.tiles && !(p.location in sizes)) sizes[p.location] = await mapSize(gameDir, p.location);
    }
  }
  return { regions, sizes };
}

/** Which pixels of a map texture are water (blue, in patches big enough not to be a roof), as runs of # and . */
async function waterMask(gameDir, texture, [sx, sy, w, h]) {
  const { log, info } = console;
  console.log = console.info = () => {};
  let png;
  try {
    const result = await unpackToContent(await readFile(path.join(gameDir, 'Content', `${texture}.xnb`)));
    png = PNG.sync.read(Buffer.from(await result.content.arrayBuffer()));
  } finally {
    Object.assign(console, { log, info });
  }
  const blue = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y + sy) * png.width + x + sx) * 4;
      const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
      if (b >= 130 && b - r >= 50 && b >= g - 10) blue[y * w + x] = 1;
    }
  }
  // Small blue patches are roofs and details, not water.
  const seen = new Uint8Array(w * h);
  const mask = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!blue[start] || seen[start]) continue;
    const patch = [start];
    seen[start] = 1;
    for (let k = 0; k < patch.length; k++) {
      const p = patch[k];
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || !blue[q]) continue;
        if (Math.abs((q % w) - (p % w)) > 1) continue;
        seen[q] = 1;
        patch.push(q);
      }
    }
    if (patch.length >= 40) for (const p of patch) mask[p] = 1;
  }
  const cells = [...mask].map((v) => (v ? '#' : '.')).join('');
  return { w, h, cells: cells.replace(/(.)\1*/g, (run, c) => `${run.length}${c}`) };
}

/** NPC schedules and home positions, stripped of dialogue text. */
export function buildSchedules() {
  const characters = readRaw('Data/Characters');
  const out = {};
  for (const [npc, c] of Object.entries(characters)) {
    const raw = readRaw(`Characters/schedules/${npc}`);
    if (!raw) continue;
    const schedules = {};
    for (const [key, value] of Object.entries(raw)) {
      // Drop quoted dialogue keys; keep "time location x y facing [animation]".
      schedules[key] = value.replace(/\s*"[^"]*"/g, '');
    }
    // Conditional homes come first in the data; the plain one is where they start.
    const place = (h) => [h.Location, h.Tile?.X ?? 0, h.Tile?.Y ?? 0];
    const home = c.Home?.find((h) => !h.Condition) ?? c.Home?.[0];
    const later = c.Home?.find((h) => /^PLAYER_HAS_MAIL Host \w+$/.test(h.Condition ?? ''));
    const laterSchedules = later && readRaw(`Characters/schedules/${npc}Mainland`);
    const strip = (entries) => Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, value.replace(/\s*"[^"]*"/g, '')]));
    out[npc] = {
      home: home ? place(home) : null,
      ...(laterSchedules ? { moved: { mail: later.Condition.split(' ').pop(), home: place(later), schedules: strip(laterSchedules) } } : {}),
      island: c.CanVisitIsland ?? null,
      social: c.CanSocialize ?? null,
      female: c.Gender === 1,
      schedules,
    };
  }
  return out;
}
