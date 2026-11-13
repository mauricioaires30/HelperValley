import { beforeAll, describe, expect, it } from 'vitest';
import { loadTestGameData } from '@/test/gameData';
import { backgroundFor, mapBounds, minTiles, spriteBox, spriteFor } from '../mapSprites';
import type { MapEntry } from '../planner';

beforeAll(loadTestGameData);

const entry = (names: string[], category: string, building = false): MapEntry => ({ x: 10, y: 20, names, category, building });

describe('map sprites', () => {
  it('draws a machine from its own sheet, standing on its tile', () => {
    const keg = entry(['keg'], 'machines');
    const sprite = spriteFor(keg);
    expect(sprite).toMatchObject({ sheet: 'TileSheets/Craftables', anchor: 'bottom', foot: [1, 1] });
    // Two tiles tall: its feet are on tile y=20, its top one tile above.
    expect(spriteBox(keg, sprite!)).toMatchObject({ x: 160, y: 20 * 16 + 16 - sprite!.h });
  });

  it('shows a crop as what it gives, also when named by its seed', () => {
    const crop = spriteFor(entry(['parsnip'], 'crops'));
    expect(crop?.sheet).toBe('Maps/springobjects');
    expect(spriteFor(entry(['parsnip-seeds'], 'crops'))).toEqual(crop);
  });

  it('shows a tree as the seed or sapling that grows it', () => {
    expect(spriteFor(entry(['oak-tree'], 'trees'))).not.toBeNull();
    expect(spriteFor(entry(['apple-tree'], 'trees'))).not.toBeNull();
  });

  it('draws a barn from its sheet, rising from its footprint', () => {
    const barn = entry(['barn'], 'buildings', true);
    const sprite = spriteFor(barn);
    expect(sprite).toMatchObject({ sheet: 'Buildings/Barn', foot: [7, 4], anchor: 'bottom' });
    expect(spriteBox(barn, sprite!)).toMatchObject({ x: 160, y: (20 + 4) * 16 - sprite!.h, w: 112 });
  });

  it('leaves grass, tilled soil and unknown things without art', () => {
    expect(spriteFor(entry(['grass'], 'grass'))).toBeNull();
    expect(spriteFor(entry(['tilled-soil'], 'soil'))).toBeNull();
    expect(spriteFor(entry(['no-such-thing'], 'machines'))).toBeNull();
    expect(spriteFor(entry(['no-such-building'], 'buildings', true))).toBeNull();
  });
});

describe('map window and ground', () => {
  it('keeps the whole farm map, and grows only for what is drawn beyond it', () => {
    expect(mapBounds([entry(['keg'], 'machines')], [], [80, 65])).toMatchObject({ minX: 0, minY: 0, w: 80, h: 65 });
    // A keg on the top row is two tiles tall: its top is one tile above the map.
    expect(mapBounds([{ ...entry(['keg'], 'machines'), y: 0 }], [], [80, 65])).toMatchObject({ minY: -1, h: 66 });
    expect(mapBounds([], [[90, 70]], [80, 65])).toMatchObject({ w: 91, h: 71 });
  });

  it('picks the game map picture for the farm type', () => {
    expect(backgroundFor('farm', 0)).toBe('FarmMaps/Farm');
    expect(backgroundFor('farm', 1)).toBe('FarmMaps/Farm_Fishing');
    expect(backgroundFor('farm', 7)).toBe('FarmMaps/Farm_Ranching');
    expect(backgroundFor('farm', 99)).toBe('FarmMaps/Farm');
    expect(minTiles('farm', 5)).toEqual([80, 80]);
    expect(minTiles('farm', 99)).toEqual([80, 65]);
    expect(backgroundFor('island', 3)).toBe('FarmMaps/IslandWest');
  });
});

describe('building pictures', () => {
  const building = (name: string, variant = 0): MapEntry => ({ ...entry([name], 'buildings', true), variant });

  it('takes the Junimo Hut\'s first color, as wide as the building', () => {
    expect(spriteFor(building('junimo-hut'))).toMatchObject({ sheet: 'Buildings/Junimo Hut', x: 0, y: 0, w: 48, h: 64, foot: [3, 2] });
  });

  it('draws the farmhouse for its upgrade, a tile to the left of its footprint', () => {
    const house = spriteFor(building('house', 2))!;
    expect(house).toMatchObject({ sheet: 'Buildings/houses', y: 288, w: 160, h: 144, foot: [9, 5] });
    // Footprint 9x5 at tile (10, 20): the picture is nine tiles tall, standing on the footprint's bottom edge.
    expect(spriteBox(building('house', 2), house)).toMatchObject({ x: 10 * 16 - 16, y: (20 + 5) * 16 - 144 });
    expect(spriteFor(building('house', 9))?.y).toBe(288);
  });

  it('draws the repaired greenhouse from the lower half of its sheet', () => {
    expect(spriteFor(building('greenhouse-repaired'))).toMatchObject({ sheet: 'Buildings/Greenhouse', y: 160, w: 112, h: 160, foot: [7, 6] });
    expect(spriteFor(building('greenhouse'))).toMatchObject({ y: 0 });
  });

  it('draws a fish pond as its ring with water inside, and a pet bowl from its own frame', () => {
    expect(spriteFor(building('fish-pond'))).toMatchObject({ sheet: 'Buildings/Fish Pond', w: 80, h: 80, foot: [5, 5], water: [16, 16, 48, 48] });
    expect(spriteFor(building('pet-bowl'))).toMatchObject({ sheet: 'Buildings/Pet Bowl', x: 32, w: 32, h: 32, foot: [2, 2] });
  });

  it('draws cabins from their first skin', () => {
    expect(spriteFor(building('log-cabin'))).toMatchObject({ sheet: 'Buildings/Log Cabin', w: 80, h: 112, foot: [5, 3] });
  });
});
