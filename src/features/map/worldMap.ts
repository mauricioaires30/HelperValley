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
  regions: Record<RegionId, { texture: string; source: [number, number, number, number]; positions: WorldPosition[]; water: { w: number; h: number; cells: string } }>;
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

/** An open area drawn on the map, as opposed to a building or cave that's just a spot on it. */
export function isOpenArea(map: WorldMapData, region: RegionId, location: string): boolean {
  const pixels = map.regions[region].positions.find((p) => p.location === location)?.pixels;
  return !!pixels && pixels[2] > 15;
}

const masks = new Map<RegionId, Uint8Array>();

/** Whether a map pixel is drawn as water. */
export function isWater(map: WorldMapData, region: RegionId, px: number, py: number): boolean {
  const { w, h, cells } = map.regions[region].water;
  let mask = masks.get(region);
  if (!mask) {
    mask = new Uint8Array(w * h);
    let at = 0;
    for (const [, n, c] of cells.matchAll(/(\d+)(\D)/g)) {
      if (c === '#') mask.fill(1, at, at + Number(n));
      at += Number(n);
    }
    masks.set(region, mask);
  }
  const [x, y] = [Math.floor(px), Math.floor(py)];
  return x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
}

/**
 * The closest pixel on water (or on land), within `radius`; the map is a drawing, so a scaled tile can
 * land a little off. Unchanged when it's already right or nothing is close enough.
 */
export function snapToMap<T extends { region: RegionId; px: number; py: number }>(map: WorldMapData, pixel: T, want: 'water' | 'land', radius: number): T {
  const ok = (x: number, y: number) => isWater(map, pixel.region, x, y) === (want === 'water');
  if (ok(pixel.px, pixel.py)) return pixel;
  for (let r = 1; r <= radius; r++) {
    let best: [number, number] | null = null;
    let bestDistance = Infinity;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !ok(pixel.px + dx, pixel.py + dy)) continue;
        const d = Math.hypot(dx, dy);
        if (d < bestDistance) {
          bestDistance = d;
          best = [dx, dy];
        }
      }
    }
    // A step further in, so the point isn't right on the shore.
    if (best) {
      const [dx, dy] = best;
      const inX = pixel.px + dx + Math.sign(dx);
      const inY = pixel.py + dy + Math.sign(dy);
      return { ...pixel, ...(ok(inX, inY) ? { px: inX, py: inY } : { px: pixel.px + dx, py: pixel.py + dy }) };
    }
  }
  return pixel;
}
