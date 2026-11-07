import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Golden walnut spots hidden in bushes or buried on Ginger Island. Their ids
 * ("Bush_IslandWest_15_3") are string literals in the game code, so they're read from
 * Stardew Valley.dll (UTF-16 user strings) and split into location and tile.
 */
export function buildWalnutSpots(gameDir) {
  const dll = readFileSync(path.join(gameDir, 'Stardew Valley.dll'));
  const found = new Set();
  // .NET user strings are UTF-16LE; try both byte alignments.
  for (const text of [dll.toString('utf16le'), dll.subarray(1).toString('utf16le')]) {
    for (const m of text.matchAll(/(Bush|Buried)_(Island[A-Za-z]+)_(\d+)_(\d+)/g)) found.add(m[0]);
  }
  return [...found].sort().map((id) => {
    const [kind, location, x, y] = id.split('_');
    return { id, kind: kind.toLowerCase(), location, tile: [Number(x), Number(y)] };
  });
}
