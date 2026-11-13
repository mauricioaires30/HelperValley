import { unpackToContent } from 'xnb';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseTbin } from './npcPaths.mjs';
import { encodePng, quietly, renderMap } from './placePictures.mjs';
import { SPRITES_OUT } from './paths.mjs';

/** One map per farm type (Game1.whichFarm 0-7) and the island farm. Files a game version doesn't have are skipped. */
const MAPS = ['Farm', 'Farm_Fishing', 'Farm_Foraging', 'Farm_Mining', 'Farm_Combat', 'Farm_FourCorners', 'Farm_Island', 'Farm_Meadowlands', 'IslandWest'];

/**
 * Draws each farm map's ground, water and cliffs to public/sprites/FarmMaps/<name>.png, for the planner's
 * "farm now" view. Trees are left out: the save has the real ones.
 */
export async function buildFarmMaps(gameDir) {
  const out = path.join(SPRITES_OUT, 'FarmMaps');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const written = [];
  for (const name of MAPS) {
    const file = path.join(gameDir, 'Content', 'Maps', `${name}.xnb`);
    if (!existsSync(file)) continue;
    const result = await quietly(async () => unpackToContent(await readFile(file)));
    const map = parseTbin(Buffer.from(result.content instanceof Blob ? await result.content.arrayBuffer() : result.content));
    const png = await renderMap(gameDir, map, { trees: false });
    const rgb = Buffer.alloc(png.width * png.height * 3);
    for (let i = 0; i < png.width * png.height; i++) {
      rgb[i * 3] = png.data[i * 4];
      rgb[i * 3 + 1] = png.data[i * 4 + 1];
      rgb[i * 3 + 2] = png.data[i * 4 + 2];
    }
    await writeFile(path.join(out, `${name}.png`), encodePng(rgb, png.width, png.height));
    written.push(name);
  }
  return written;
}
