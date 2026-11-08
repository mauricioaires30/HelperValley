import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { normalizeSave } from '@/save/normalize';
import { loadTestGameData } from '@/test/gameData';
import { comparePlan, parsePlanJson, planId, saveKeys } from '../planner';

beforeAll(loadTestGameData);

const fixture = (name: string) => parsePlanJson(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))!;

describe('planner', () => {
  it('reads plan links and data', () => {
    expect(planId('https://stardew.info/planner/7-dead-gerbils-danced-easily')).toBe('7-dead-gerbils-danced-easily');
    expect(planId('https://stardew.info/planner/10-bad-newts-listened-easily/')).toBe('10-bad-newts-listened-easily');
    expect(fixture('farm-plan.json').options?.layout).toBe('regular');
    expect(fixture('island-plan.json').options?.layout).toBe('ginger_island');
  });

  it('names save tiles like the planner', () => {
    expect(saveKeys('tree:1')).toEqual(['oak-tree']);
    expect(saveKeys('floor:0')).toEqual(['wooden-floor']);
    expect(saveKeys('crop:499:454')).toEqual(['ancient-seeds', 'ancient-fruit']);
    expect(saveKeys('stone-gate')).toEqual(['gate']);
  });

  it('finds a plan matched by a layout shifted a few tiles', () => {
    const plan = { tiles: [{ type: 'keg', x: 160, y: 160 }, { type: 'keg', x: 176, y: 160 }, { type: 'bee-house', x: 160, y: 176 }], buildings: [], flooring: [] };
    const layout = { tiles: [[12, 13, 'keg'], [13, 13, 'keg']] as Array<[number, number, string]>, buildings: [] };
    const r = comparePlan(plan, layout);
    expect(r.offset).toEqual([2, 3]);
    expect(r.done).toBe(2);
    expect(r.types.find((t) => t.type === 'bee-house')?.inPlace).toBe(0);
  });
});

// The developer's real save against their own plans (skipped when the saves aren't there).
const dir = process.env.STARDEW_SAVES_DIR ?? (process.env.APPDATA ? path.join(process.env.APPDATA, 'StardewValley', 'Saves') : '');
const folder = existsSync(dir) ? readdirSync(dir).find((f) => f.startsWith('SóProgresso') && statSync(path.join(dir, f)).isDirectory()) : undefined;

describe.skipIf(!folder)('planner vs real save', () => {
  it('compares both plans', () => {
    const save = normalizeSave(readFileSync(path.join(dir, folder!, folder!), 'utf8'), folder!);
    for (const [file, location] of [
      ['farm-plan.json', 'Farm'],
      ['island-plan.json', 'IslandWest'],
    ] as const) {
      const r = comparePlan(fixture(file), save.layouts[location]);
      console.log(location, 'offset', r.offset, `${r.done}/${r.total}`, r.types.slice(0, 8).map((x) => `${x.type} ${x.inPlace}/${x.planned} (have ${x.have})`).join(', '), '| buildings', r.buildings.map((b) => `${b.type} ${b.have}/${b.planned}`).join(', '));
      expect(r.total).toBeGreaterThan(0);
    }
  });
});
