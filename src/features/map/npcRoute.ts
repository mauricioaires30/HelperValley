import { gameData } from '@/data/gameData';

/** One map of the walking data (tools/extract/lib/npcPaths.mjs). Warps and doors are [x, y, target, toX, toY]. */
export interface NpcPathMap {
  w: number;
  h: number;
  /** Runs of cells: # blocked, s stone, w wood, d dirt, g grass, . anything else. */
  cells: string;
  warps: Array<[number, number, string, number, number]>;
  doors: Array<[number, number, string, number, number]>;
}

export interface RouteTile {
  location: string;
  x: number;
  y: number;
}

/** Tiles an NPC walks per game minute: 2 pixels a tick on 64px tiles, 420 ticks every 10 game minutes. */
export const TILES_PER_MINUTE = 420 / 32 / 10;

/** Locations never routed through, and the boat tunnel leading to the island (WarpPathfindingCache). */
const IGNORE = new Set(['Backwoods', 'Cellar', 'Farm']);
const OVERRIDE: Record<string, string> = { BoatTunnel: 'IslandSouth' };
const DIRECTIONS = [[-1, 0], [1, 0], [0, 1], [0, -1]];
const PREFERENCE: Record<string, number> = { s: -7, w: -4, d: -2, g: -1 };
const LIMIT = 30000;

const unpacked = new Map<NpcPathMap, string>();
function cellsOf(map: NpcPathMap) {
  let cells = unpacked.get(map);
  if (!cells) {
    cells = map.cells.replace(/(\d+)(\D)/g, (_, n: string, c: string) => c.repeat(Number(n)));
    unpacked.set(map, cells);
  }
  return cells;
}

interface Node {
  x: number;
  y: number;
  g: number;
  parent: Node | null;
}

/** PathFindController.findPathForNPCSchedules: the same search, so the same way through the map. */
export function findTilePath(map: NpcPathMap, from: [number, number], to: [number, number]): Array<[number, number]> | null {
  const cells = cellsOf(map);
  const { w, h } = map;
  const buckets = new Map<number, Node[]>();
  const heads = new Map<number, number>();
  const keys: number[] = [];
  let size = 0;
  const enqueue = (node: Node, priority: number) => {
    let bucket = buckets.get(priority);
    if (!bucket) {
      bucket = [];
      buckets.set(priority, bucket);
      heads.set(priority, 0);
      keys.splice(keys.findIndex((k) => k > priority) === -1 ? keys.length : keys.findIndex((k) => k > priority), 0, priority);
    }
    bucket.push(node);
    size++;
  };
  const dequeue = (): Node => {
    for (const key of keys) {
      const bucket = buckets.get(key)!;
      const head = heads.get(key)!;
      if (head < bucket.length) {
        heads.set(key, head + 1);
        size--;
        return bucket[head];
      }
    }
    throw new Error('empty queue');
  };
  const queued = (x: number, y: number, priority: number) => {
    const bucket = buckets.get(priority);
    if (!bucket) return false;
    for (let i = heads.get(priority)!; i < bucket.length; i++) if (bucket[i].x === x && bucket[i].y === y) return true;
    return false;
  };

  const closed = new Set<number>();
  const start: Node = { x: from[0], y: from[1], g: 0, parent: null };
  enqueue(start, Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]));
  let previous = start;
  for (let count = 0; size > 0 && count < LIMIT; count++) {
    const node = dequeue();
    if (node.x === to[0] && node.y === to[1]) {
      const path: Array<[number, number]> = [];
      for (let n: Node | null = node; n; n = n.parent) path.unshift([n.x, n.y]);
      return path;
    }
    closed.add(node.x * 100000 + node.y);
    for (const [dx, dy] of DIRECTIONS) {
      const x = node.x + dx;
      const y = node.y + dy;
      if (closed.has(x * 100000 + y)) continue;
      const isEnd = x === to[0] && y === to[1];
      if (!isEnd && (x < 0 || y < 0 || x >= w || y >= h || cells[y * w + x] === '#')) continue;
      // The game keeps the step count in a byte.
      const g = (node.g + 1) & 255;
      const inBounds = x >= 0 && y >= 0 && x < w && y < h;
      const straight = (x === node.x && x === previous.x) || (y === node.y && y === previous.y);
      const priority = g + (inBounds ? (PREFERENCE[cells[y * w + x]] ?? 0) : 0) + Math.abs(to[0] - x) + Math.abs(to[1] - y) + (straight ? -2 : 0);
      if (!queued(x, y, priority)) enqueue({ x, y, g, parent: node }, priority);
    }
    previous = node;
  }
  return null;
}

/** Whether locations are joined by warps, before searching for the game's own route. */
function reachable(from: string, to: string) {
  const maps = gameData().npcPaths;
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const map = maps[stack.pop()!];
    for (const [, , raw] of [...(map?.warps ?? []), ...(map?.doors ?? [])]) {
      const next = OVERRIDE[raw] ?? raw;
      if (next === to) return true;
      if (!seen.has(next) && !IGNORE.has(next) && maps[next]) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

/** WarpPathfindingCache: the first route found exploring warps, then doors, in the map's order. */
export function locationRoute(from: string, to: string): string[] | null {
  const maps = gameData().npcPaths;
  if (!maps[to] || !reachable(from, to)) return null;
  const route: string[] = [];
  const explore = (location: string): boolean => {
    const map = maps[location];
    if (!map || route.includes(location)) return false;
    route.push(location);
    if (location === to) return true;
    const seen = new Set([location]);
    if (route.length > 1) seen.add(route[route.length - 2]);
    for (const [, , raw] of [...map.warps, ...map.doors]) {
      const next = OVERRIDE[raw] ?? raw;
      if (seen.has(next) || IGNORE.has(next)) continue;
      seen.add(next);
      if (explore(next)) return true;
    }
    route.pop();
    return false;
  };
  return explore(from) ? route : null;
}

/** GameLocation.getWarpPointTo and getWarpPointTarget. */
function warpBetween(map: NpcPathMap, target: string) {
  const matches = (raw: string) => raw === target || (raw === 'BoatTunnel' && target === 'IslandSouth');
  return map.warps.find((w) => matches(w[2])) ?? map.doors.find((d) => matches(d[2])) ?? null;
}

const cache = new Map<string, RouteTile[] | null>();

/** Every tile an NPC walks between two schedule stops (NPC.pathfindToNextScheduleLocation), or null without a way. */
export function npcRoute(from: RouteTile, to: RouteTile): RouteTile[] | null {
  const key = `${from.location},${from.x},${from.y}>${to.location},${to.x},${to.y}`;
  if (cache.has(key)) return cache.get(key)!;
  const maps = gameData().npcPaths;
  const compute = (): RouteTile[] | null => {
    const locations = from.location === to.location ? [from.location] : locationRoute(from.location, to.location);
    if (!locations) return null;
    const tiles: RouteTile[] = [];
    let point: [number, number] = [from.x, from.y];
    for (let i = 0; i < locations.length; i++) {
      const location = locations[i];
      const map = maps[location];
      if (!map) return null;
      const warp = i < locations.length - 1 ? warpBetween(map, locations[i + 1]) : null;
      if (i < locations.length - 1 && !warp) return null;
      const goal: [number, number] = warp ? [warp[0], warp[1]] : [to.x, to.y];
      const path = findTilePath(map, point, goal);
      if (!path) return null;
      for (const [x, y] of path) tiles.push({ location, x, y });
      if (warp) point = [warp[3], warp[4]];
    }
    return tiles;
  };
  const route = compute();
  cache.set(key, route);
  return route;
}

/** Game minutes a route takes on foot. */
export const routeMinutes = (route: RouteTile[]) => Math.max(0, route.length - 1) / TILES_PER_MINUTE;
