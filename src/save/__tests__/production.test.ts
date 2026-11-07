import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeSave } from '../normalize';

const file = path.join(process.env.APPDATA ?? '', 'StardewValley', 'Saves', 'SóProgresso_371334640', 'SóProgresso_371334640');

describe.skipIf(!existsSync(file))('production on a real save', () => {
  it('reads machines, ponds and the field office', () => {
    const save = normalizeSave(readFileSync(file, 'utf8'), 'x');
    const { machines, ponds } = save.farm;
    expect(machines.some((m) => m.machine === '(BC)12')).toBe(true); // kegs
    expect(machines.some((m) => m.machine === '(BC)10')).toBe(true); // bee houses
    expect(ponds.length).toBe(7);
    // 11 fossils: snake (6-8) and frog (10) restored in this save, bat (9) not.
    expect(save.fieldOffice?.pieces).toHaveLength(11);
    expect(save.fieldOffice?.pieces.slice(6, 9)).toEqual([true, true, true]);
    expect(save.fieldOffice?.pieces[9]).toBe(false);
  });
});
