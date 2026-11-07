export type RegionId = 'Valley' | 'GingerIsland';

export interface WorldPosition {
  location: string;
  /** [x, y, w, h] in tiles, when only part of the location maps to this spot. */
  tiles: [number, number, number, number] | null;
  /** [x, y, w, h] in map pixels. */
  pixels: [number, number, number, number] | null;
  n: [string, string] | null;
}

export interface WorldMapData {
  regions: Record<RegionId, { texture: string; source: [number, number, number, number]; positions: WorldPosition[] }>;
  sizes: Record<string, [number, number] | null>;
}

/**
 * Converts a tile in a location to a pixel on the region map. Buildings map to a small
 * area (their door on the map); outdoor maps are scaled into their area.
 */
export function toMapPixel(map: WorldMapData, location: string, x: number, y: number): { region: RegionId; px: number; py: number } | null {
  for (const region of Object.keys(map.regions) as RegionId[]) {
    const candidates = map.regions[region].positions.filter((p) => p.location === location && p.pixels);
    // Prefer a position whose tile area contains the tile, then one covering the whole map.
    const pos =
      candidates.find((p) => p.tiles && x >= p.tiles[0] && x < p.tiles[0] + p.tiles[2] && y >= p.tiles[1] && y < p.tiles[1] + p.tiles[3]) ??
      candidates.find((p) => !p.tiles);
    if (!pos?.pixels) continue;
    const [px, py, pw, ph] = pos.pixels;
    const [tx, ty, tw, th] = pos.tiles ?? [0, 0, ...(map.sizes[location] ?? [0, 0])];
    if (!tw || !th) return { region, px: px + pw / 2, py: py + ph / 2 };
    return { region, px: px + ((x - tx + 0.5) / tw) * pw, py: py + ((y - ty + 0.5) / th) * ph };
  }
  return null;
}
