import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { setGameData, type GameData } from '@/data/gameData';
import { findTilePath, locationRoute, npcRoute, routeMinutes, type NpcPathMap } from '../npcRoute';

const paths = JSON.parse(readFileSync('public/data/npcPaths.json', 'utf8')) as Record<string, NpcPathMap>;
const cells = (location: string) => paths[location].cells.replace(/(\d+)(\D)/g, (_, n: string, c: string) => c.repeat(Number(n)));

describe('NPC routes from the game maps', () => {
  beforeAll(() => setGameData({ npcPaths: paths } as unknown as GameData));

  it('goes through the connected locations, like the game', () => {
    expect(locationRoute('SeedShop', 'Saloon')).toEqual(['SeedShop', 'Town', 'Saloon']);
    expect(locationRoute('Town', 'Beach')).toEqual(['Town', 'Beach']);
    // The bus stop's warp leads to the desert.
    expect(locationRoute('SeedShop', 'Desert')).toEqual(['SeedShop', 'Town', 'BusStop', 'Desert']);
    expect(locationRoute('SeedShop', 'Nowhere')).toBeNull();
  });

  it('walks only on passable tiles, one step at a time', () => {
    const route = npcRoute({ location: 'SeedShop', x: 6, y: 28 }, { location: 'Beach', x: 30, y: 20 })!;
    const town = cells('Town');
    const inTown = route.filter((t) => t.location === 'Town');
    expect(inTown.length).toBeGreaterThan(20);
    // The ends are the door and the warp, which the game also allows.
    for (const t of inTown.slice(1, -1)) expect(town[t.y * paths.Town.w + t.x]).not.toBe('#');
    for (let i = 1; i < inTown.length; i++) expect(Math.abs(inTown[i].x - inTown[i - 1].x) + Math.abs(inTown[i].y - inTown[i - 1].y)).toBe(1);
  });

  it('crosses the river to the blacksmith over a bridge', () => {
    // Town's river runs between the square and the blacksmith; only bridges are passable there.
    const path = findTilePath(paths.Town, [44, 57], [94, 82])!;
    expect(path.length).toBeGreaterThan(50);
    const town = cells('Town');
    for (const [x, y] of path.slice(0, -1)) expect(town[y * paths.Town.w + x]).not.toBe('#');
  });

  it('takes as long as the game says: about 13 tiles per 10 minutes', () => {
    const route = Array.from({ length: 132 }, (_, x) => ({ location: 'Town', x, y: 0 }));
    expect(routeMinutes(route)).toBeCloseTo(100, 0);
  });
});
