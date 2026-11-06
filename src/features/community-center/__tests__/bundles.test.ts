import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeSave } from '@/save/normalize';
import bundleStrings from '../../../../public/data/bundles.json';
import { buildRooms } from '../bundles';

const xml = readFileSync(new URL('../../../save/__tests__/fixtures/mini-save.xml', import.meta.url), 'utf8');

describe('buildRooms', () => {
  it('maps bundle definitions, completion flags and owned items', () => {
    const save = normalizeSave(xml, 'Test');
    // Put a parsnip in a chest so the missing slot can be found.
    save.containers[0].items.push({ id: '(O)24', name: 'Parsnip', stack: 3, quality: 0 });
    const rooms = buildRooms(save, bundleStrings as never);
    const pantry = rooms.find((r) => r.id === 'Pantry')!;
    expect(pantry.complete).toBe(true); // areasComplete[0] in the fixture
    const bundle = pantry.bundles[0];
    expect(bundle.name).toEqual(['Spring Crops', 'Plantações de Primavera']);
    expect(bundle.reward).toEqual({ id: '(O)465', count: 20 });
    expect(bundle.slots[0]).toMatchObject({ id: '(O)24', count: 1, done: true });
    expect(bundle.slots[0].owned.map((o) => [o.where, o.count])).toEqual([
      ['Host', 12],
      ['Farm', 3],
    ]);
  });
});
