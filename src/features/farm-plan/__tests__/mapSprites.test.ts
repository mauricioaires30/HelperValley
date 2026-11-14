import { beforeAll, describe, expect, it } from 'vitest';
import { loadTestGameData } from '@/test/gameData';
import { backgroundFor, mapBounds, minTiles, planBuildingsToTopLeft, spriteBox, spriteFor } from '../mapSprites';
import { farmEntries, joinNeighbors, type MapEntry } from '../planner';

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

  it('leaves unknown things without art', () => {
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

describe('trees', () => {
  const tree = (name: string, season = 0, stage?: number): MapEntry => ({ ...entry([name], 'trees'), variant: season, stage });

  it('draws a full wild tree as trunk and crown, in the season of the save', () => {
    const oak = spriteFor(tree('oak-tree', 1))!;
    expect(oak.sheet).toBe('TerrainFeatures/tree1_summer');
    expect(oak.layers).toHaveLength(2);
    // Tile (10, 20): the crown is 48x96, one tile to the left and five above the tile.
    expect(spriteBox(tree('oak-tree', 1), oak)).toEqual({ x: 10 * 16 - 16, y: 20 * 16 - 80, w: 48, h: 96 });
    expect(spriteFor(tree('pine-tree', 1))?.sheet).toBe('TerrainFeatures/tree3_spring');
    expect(spriteFor(tree('maple-tree', 3))?.sheet).toBe('TerrainFeatures/tree2_winter');
  });

  it('draws a young wild tree from its small pictures', () => {
    expect(spriteFor(tree('oak-tree', 0, 1))).toMatchObject({ x: 0, y: 128, w: 16, h: 16 });
    expect(spriteFor(tree('oak-tree', 0, 3))).toMatchObject({ x: 0, y: 96, w: 16, h: 32 });
  });

  it('draws fruit trees from their row: growth stages first, then the season', () => {
    expect(spriteFor(tree('apple-tree', 2))).toMatchObject({ sheet: 'TileSheets/fruitTrees', x: (4 + 2) * 48, y: 5 * 80, w: 48, h: 80, dx: -16 });
    expect(spriteFor(tree('apple-tree', 2, 1))).toMatchObject({ x: 48, y: 5 * 80 });
  });

  it('reads how grown a saved tree is', () => {
    const entries = farmEntries({ tiles: [[1, 2, 'tree:1:3'], [3, 4, 'fruit:633:4'], [5, 6, 'tree:2']], buildings: [] }, { houseLevel: 0, season: 2 });
    expect(entries.map((e) => [e.names[0], e.stage, e.variant])).toEqual([['oak-tree', 3, 2], ['apple-tree', 4, 2], ['maple-tree', undefined, 2]]);
  });
});

describe('plan buildings', () => {
  it('moves a plan building from its bottom row to its top row', () => {
    const at = (name: string, y: number): MapEntry => ({ x: 59, y, names: [name], category: 'buildings', building: true, bottomRow: true });
    // The planner puts a 9x5 farmhouse at y=16, which is rows 12 to 16; a 2x1 shipping bin stays where it is.
    const [house, bin] = planBuildingsToTopLeft([at('house', 16), at('shipping-bin', 14)]);
    expect(house.y).toBe(12);
    expect(bin.y).toBe(14);
    expect(planBuildingsToTopLeft([house])[0]).toBe(house);
  });
});

describe('ground, grass, crops and boulders', () => {
  const piece = (names: string[], category: string, extra: Partial<MapEntry> = {}): MapEntry => ({ ...entry(names, category), ...extra });

  it('picks the soil piece by the sides it joins, and the snowy set in winter', () => {
    // Sides: north 1, east 2, south 4, west 8. All four: the middle of the big block.
    expect(spriteFor(piece(['tilled-soil'], 'soil', { variant: 15 }))).toMatchObject({ sheet: 'TerrainFeatures/hoeDirt', x: 32, y: 16, w: 16, h: 16, anchor: 'top' });
    expect(spriteFor(piece(['tilled-soil'], 'soil', { variant: 0 }))).toMatchObject({ x: 0, y: 0 });
    // South only: the top end of the vertical strip. East and south: the block's top-left corner.
    expect(spriteFor(piece(['tilled-soil'], 'soil', { variant: 4 }))).toMatchObject({ x: 0, y: 16 });
    expect(spriteFor(piece(['tilled-soil'], 'soil', { variant: 6 }))).toMatchObject({ x: 16, y: 0 });
    expect(spriteFor(piece(['tilled-soil'], 'soil', { variant: 3 * 16 + 15 }))?.sheet).toBe('TerrainFeatures/hoeDirtSnow');
  });

  it('finds which sides a piece of soil or floor joins', () => {
    const soil = (x: number, y: number): MapEntry => ({ x, y, names: ['tilled-soil'], category: 'soil' });
    const joined = joinNeighbors([soil(1, 1), soil(2, 1), soil(2, 2)], 1);
    expect(joined.map((e) => e.variant! & 15)).toEqual([2, 12, 1]);
    expect(joined.map((e) => e.variant! >> 4)).toEqual([1, 1, 1]);
    // A floor only joins floors of its own kind.
    const floor = (x: number, y: number, name: string): MapEntry => ({ x, y, names: [name], category: 'floors' });
    expect(joinNeighbors([floor(0, 0, 'wooden-floor'), floor(1, 0, 'stone-floor')], 0).map((e) => e.variant! & 15)).toEqual([0, 0]);
  });

  it('draws floors from their set in the floors sheet', () => {
    // The wooden floor is set 0 and the gravel path set 5 (second row, second column of sets).
    expect(spriteFor(piece(['wooden-floor'], 'floors', { variant: 15 }))).toMatchObject({ sheet: 'TerrainFeatures/Flooring', x: 32, y: 16 });
    expect(spriteFor(piece(['gravel-path'], 'floors', { variant: 0 }))).toMatchObject({ x: 64, y: 64 });
    expect(spriteFor(piece(['wooden-floor'], 'floors', { variant: 3 * 16 }))?.sheet).toBe('TerrainFeatures/Flooring_winter');
  });

  it('draws grass as tufts from the season row the save gives', () => {
    const grass = spriteFor(piece(['grass'], 'grass', { stage: 3, variant: 20 }))!;
    expect(grass.sheet).toBe('TerrainFeatures/grass');
    expect(grass.layers).toHaveLength(3);
    expect(grass.layers!.every((layer) => layer[1] === 20 && layer[2] === 15 && layer[3] === 20)).toBe(true);
  });

  it('draws a crop by its row and growth phase, and a dead one from the dead pictures', () => {
    // Row 24 is on the left half, 12th pair of rows; phase 2 is the 4th picture.
    expect(spriteFor(piece(['ancient-seeds'], 'crops', { variant: 24, stage: 2 }))).toMatchObject({ sheet: 'TileSheets/crops', x: 48, y: 384, w: 16, h: 32 });
    // An odd row is on the right half.
    expect(spriteFor(piece(['ancient-seeds'], 'crops', { variant: 25, stage: 0 }))).toMatchObject({ x: 128 + 16, y: 384 });
    expect(spriteFor(piece(['ancient-seeds'], 'crops', { variant: 24, stage: -1 }))).toMatchObject({ x: 192, y: 384 });
    // Without a row and phase (an older save, or a plan) the harvest's icon stays.
    expect(spriteFor(piece(['parsnip'], 'crops'))?.sheet).toBe('Maps/springobjects');
  });

  it('draws boulders and stumps as a block of the objects sheet', () => {
    const stump = spriteFor(piece(['large-stump'], 'terrain', { variant: 600, size: [2, 2] }))!;
    expect(stump).toMatchObject({ sheet: 'Maps/springobjects', x: 0, y: 400, w: 32, h: 32, foot: [2, 2], anchor: 'top' });
  });

  it('reads crops, grass and boulders from the save keys', () => {
    const entries = farmEntries(
      { tiles: [[1, 1, 'crop:499:454:24:2:0'], [2, 1, 'hoedirt'], [3, 3, 'grass:2:40'], [5, 5, 'clump:600:2:2'], [7, 7, 'crop:499:454']], buildings: [] },
      { houseLevel: 0, season: 0 },
    );
    const crop = entries.find((e) => e.category === 'crops' && e.x === 1)!;
    expect([crop.variant, crop.stage]).toEqual([24, 2]);
    expect(entries.find((e) => e.category === 'grass')).toMatchObject({ stage: 2, variant: 40 });
    expect(entries.find((e) => e.category === 'terrain')).toMatchObject({ variant: 600, size: [2, 2] });
    // A crop stands on soil, and an older key (no row or phase) has no growth to draw.
    expect(entries.filter((e) => e.category === 'soil' && e.x === 1)).toHaveLength(1);
    expect(entries.find((e) => e.category === 'crops' && e.x === 7)?.stage).toBeUndefined();
  });
});
