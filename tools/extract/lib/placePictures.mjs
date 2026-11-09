import { unpackToContent } from 'xnb';
import { PNG } from 'pngjs';
import { crc32, deflateSync } from 'node:zlib';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { readRaw } from './raw.mjs';
import { parseTbin } from './npcPaths.mjs';
import { ROOT } from './paths.mjs';

const OUT = path.join(ROOT, 'public/places');
const TILE = 16;
const CROP = { w: 14, h: 9 };

/** Outdoor maps drawn right from the map files. Caves, the volcano, the sewer and the submarine depend on the game's code. */
const LOCATIONS = ['Town', 'Forest', 'Mountain', 'Beach', 'BusStop', 'Railroad', 'Desert', 'Woods', 'BugLand', 'IslandSouth', 'IslandSouthEast', 'IslandWest', 'IslandNorth', 'IslandShrine'];

/** Buildings whose door is worth showing: shops and the places of Stardrops. */
const DOOR_TARGETS = new Set(['SeedShop', 'JojaMart', 'AnimalShop', 'ScienceHouse', 'Blacksmith', 'FishShop', 'Saloon', 'Hospital', 'SandyHouse', 'AdventureGuild', 'ArchaeologyHouse', 'Mine']);

/** Things that are part of the map itself. The Traveling Cart, Desert Trader and Bookseller are drawn at runtime, so a picture would show empty ground. */
const FIXED_SPOTS = [['Forest', 32, 94]]; // Hat Mouse

// GameLocation.loadPathsLayerObjectsInArea: map trees, drawn from their spring textures.
const TREES = { 9: 'tree1_spring', 10: 'tree2_spring', 11: 'tree3_spring' };

async function quietly(fn) {
  const { log, info } = console;
  console.log = console.info = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, info });
  }
}

const textures = new Map();
async function texture(gameDir, relative) {
  if (textures.has(relative)) return textures.get(relative);
  const file = path.join(gameDir, 'Content', `${relative}.xnb`);
  let image = null;
  if (existsSync(file)) {
    const result = await quietly(async () => unpackToContent(await readFile(file)));
    if (result.content instanceof Blob) image = PNG.sync.read(Buffer.from(await result.content.arrayBuffer()));
  }
  textures.set(relative, image);
  return image;
}

/** Draws part of a texture over the picture, with alpha. */
function blit(target, source, sx, sy, w, h, dx, dy) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [tx, ty] = [dx + x, dy + y];
      if (tx < 0 || ty < 0 || tx >= target.width || ty >= target.height) continue;
      const s = ((sy + y) * source.width + sx + x) * 4;
      const alpha = source.data[s + 3];
      if (!alpha) continue;
      const t = (ty * target.width + tx) * 4;
      const a = alpha / 255;
      for (let c = 0; c < 3; c++) target.data[t + c] = Math.round(source.data[s + c] * a + target.data[t + c] * (1 - a));
      target.data[t + 3] = 255;
    }
  }
}

/** The whole map as pixels: ground, buildings, trees, treetops. */
async function renderMap(gameDir, map) {
  const { w, h } = map.layers.Back;
  const png = new PNG({ width: w * TILE, height: h * TILE });
  png.data.fill(0);
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255;
  const drawLayer = async (name) => {
    const layer = map.layers[name];
    if (!layer) return;
    for (let i = 0; i < w * h; i++) {
      const tile = layer.tiles[i];
      if (!tile || tile.index < 0) continue;
      const source = map.images[tile.sheet];
      const image = source && (await texture(gameDir, source));
      if (!image) continue;
      const cols = Math.floor(image.width / TILE);
      blit(png, image, (tile.index % cols) * TILE, Math.floor(tile.index / cols) * TILE, TILE, TILE, (i % w) * TILE, Math.floor(i / w) * TILE);
    }
  };
  await drawLayer('Back');
  await drawLayer('Buildings');
  const paths = map.layers.Paths;
  if (paths) {
    for (let i = 0; i < w * h; i++) {
      const name = TREES[paths.tiles[i]?.index];
      const image = name && (await texture(gameDir, `TerrainFeatures/${name}`));
      if (!image) continue;
      const [x, y] = [(i % w) * TILE, Math.floor(i / w) * TILE];
      blit(png, image, 32, 96, 16, 32, x, y - 16);
      blit(png, image, 0, 0, 48, 96, x - 16, y - 80);
    }
  }
  await drawLayer('Front');
  await drawLayer('AlwaysFront');
  return png;
}

/** A PNG chunk. */
function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([head, body, tail]);
}

/** Pixel art has few colors: an indexed PNG is a fraction of the size. */
function encodePng(rgb, w, h) {
  const palette = new Map();
  const indexes = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const color = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
      if (!palette.has(color)) palette.set(color, palette.size);
      if (palette.size > 256) {
        const png = new PNG({ width: w, height: h, colorType: 2 });
        for (let p = 0; p < w * h; p++) {
          png.data[p * 4] = rgb[p * 3];
          png.data[p * 4 + 1] = rgb[p * 3 + 1];
          png.data[p * 4 + 2] = rgb[p * 3 + 2];
          png.data[p * 4 + 3] = 255;
        }
        return PNG.sync.write(png, { colorType: 2, deflateLevel: 9 });
      }
      indexes[y * (w + 1) + 1 + x] = palette.get(color);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // indexed color
  const plte = Buffer.alloc(palette.size * 3);
  for (const [color, i] of palette) {
    plte[i * 3] = color >> 16;
    plte[i * 3 + 1] = (color >> 8) & 255;
    plte[i * 3 + 2] = color & 255;
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', deflateSync(indexes, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** A crop around a tile, with the spot marked. */
/** Too dark to see anything: caves, map edges and shaded jungle. */
function tooDark(png, tileX, tileY) {
  let black = 0;
  let total = 0;
  let light = 0;
  const [w, h] = [CROP.w * TILE, CROP.h * TILE];
  const left = Math.max(0, Math.min(png.width - w, tileX * TILE + TILE / 2 - w / 2));
  const top = Math.max(0, Math.min(png.height - h, tileY * TILE + TILE / 2 - h / 2));
  for (let y = top; y < Math.min(png.height, top + h); y++) {
    for (let x = left; x < Math.min(png.width, left + w); x++) {
      const i = (y * png.width + x) * 4;
      const sum = png.data[i] + png.data[i + 1] + png.data[i + 2];
      total++;
      light += sum / 3;
      if (sum < 90) black++;
    }
  }
  return black / total > 0.06 || light / total < 62;
}

function crop(png, tileX, tileY) {
  const [w, h] = [CROP.w * TILE, CROP.h * TILE];
  const [fw, fh] = [Math.min(w, png.width), Math.min(h, png.height)];
  const left = Math.max(0, Math.min(png.width - fw, tileX * TILE + TILE / 2 - fw / 2));
  const top = Math.max(0, Math.min(png.height - fh, tileY * TILE + TILE / 2 - fh / 2));
  const rgb = Buffer.alloc(fw * fh * 3);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const s = ((y + top) * png.width + x + left) * 4;
      const d = (y * fw + x) * 3;
      rgb[d] = png.data[s];
      rgb[d + 1] = png.data[s + 1];
      rgb[d + 2] = png.data[s + 2];
    }
  }
  {
    // A ring around the tile: white outside, red inside, readable on any ground.
    const [mx, my] = [tileX * TILE - left, tileY * TILE - top];
    const ring = (pad, [r, g, b]) => {
      for (let y = my - pad; y < my + TILE + pad; y++) {
        for (let x = mx - pad; x < mx + TILE + pad; x++) {
          const edge = x === mx - pad || x === mx + TILE + pad - 1 || y === my - pad || y === my + TILE + pad - 1;
          if (!edge || x < 0 || y < 0 || x >= fw || y >= fh) continue;
          const d = (y * fw + x) * 3;
          rgb[d] = r;
          rgb[d + 1] = g;
          rgb[d + 2] = b;
        }
      }
    };
    ring(4, [255, 255, 255]);
    ring(3, [224, 40, 60]);
    ring(2, [224, 40, 60]);
    ring(1, [255, 255, 255]);
  }
  return encodePng(rgb, fw, fh);
}

/**
 * Real pictures of specific spots, from the game's own maps and tilesheets: rare and legendary fish,
 * walnuts, the Hat Mouse and the door of each shop. Returns what exists, for the hover cards.
 */
export async function buildPlacePictures(gameDir, datasets) {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const locations = readRaw('Data/Locations');

  const wanted = new Map(LOCATIONS.map((l) => [l, new Set()]));
  const add = (location, x, y) => wanted.get(location)?.add(`${x}_${y}`);
  for (const fish of Object.values(datasets.fish)) for (const l of fish.locations) if (l.specific) for (const [x, y] of l.spots ?? []) add(l.location, x, y);
  for (const w of datasets.walnuts) add(w.location, w.tile[0], w.tile[1]);
  for (const [l, x, y] of FIXED_SPOTS) add(l, x, y);

  // Buildings: their door on the first outdoor map that leads to them.
  const doors = {};
  for (const location of LOCATIONS) {
    const paths = datasets.npcPaths[location];
    for (const [x, y, target] of [...(paths?.doors ?? []), ...(paths?.warps ?? [])]) {
      if (!DOOR_TARGETS.has(target) || doors[target] || x < 0 || y < 0) continue;
      doors[target] = `${location}_${x}_${y}`;
      add(location, x, y);
    }
  }

  const spots = [];
  for (const [location, tiles] of wanted) {
    const mapPath = locations[location]?.CreateOnLoad?.MapPath?.split(/[\\/]/).pop() ?? location;
    const file = path.join(gameDir, 'Content', 'Maps', `${mapPath}.xnb`);
    if (!existsSync(file)) continue;
    const result = await quietly(async () => unpackToContent(await readFile(file)));
    const map = parseTbin(Buffer.from(result.content instanceof Blob ? await result.content.arrayBuffer() : result.content));
    const png = await renderMap(gameDir, map);
    for (const tile of tiles) {
      const [x, y] = tile.split('_').map(Number);
      // Doors are open views of a building, where a dark roof is fine.
      if (!Object.values(doors).includes(`${location}_${tile}`) && tooDark(png, x, y)) continue;
      await writeFile(path.join(OUT, `${location}_${tile}.png`), crop(png, x, y));
      spots.push(`${location}_${tile}`);
    }
  }
  // A door whose picture was rejected has nothing to show.
  for (const [target, key] of Object.entries(doors)) if (!spots.includes(key)) delete doors[target];
  return { spots, doors };
}
