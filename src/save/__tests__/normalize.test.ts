import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeSave } from '../normalize';

const xml = readFileSync(new URL('./fixtures/mini-save.xml', import.meta.url), 'utf8');
const save = normalizeSave(xml, 'Test_999');

describe('normalizeSave', () => {
  it('reads world state', () => {
    expect(save.uniqueId).toBe('999');
    expect(save.date).toEqual({ season: 'fall', day: 9, year: 2 });
    expect(save.weatherTomorrow).toBe('Rain');
    expect(save.goldenWalnutsFound).toBe(12);
  });

  it('reads host and farmhands', () => {
    expect(save.players.map((p) => [p.name, p.isHost])).toEqual([
      ['Host', true],
      ['Guest', false],
    ]);
    const host = save.players[0];
    expect(host.skills.farming).toBe(10);
    expect(host.professions).toEqual([1, 4]);
    expect(host.achievements).toEqual([0, 5]);
    expect(host.basicShipped).toEqual({ '24': 40 });
    expect(host.fishCaught['(O)145']).toEqual([3, 12]);
    expect(host.friendships.Abigail).toMatchObject({ points: 1500, status: 'Dating', talkedToday: true });
    expect(host.stats.daysPlayed).toBe(30);
    expect(host.monstersKilled['Green Slime']).toBe(7);
  });

  it('qualifies item ids and skips empty slots', () => {
    expect(save.players[0].inventory).toEqual([
      { id: '(W)4', name: 'Galaxy Sword', stack: 1, quality: 0 },
      { id: '(O)24', name: 'Parsnip', stack: 12, quality: 2 },
    ]);
  });

  it('collects chests from locations, building interiors and global inventories', () => {
    expect(save.containers.map((c) => [c.location, c.kind, c.items[0].id])).toEqual([
      ['Farm', 'chest', '(BC)12'],
      ['Shed1', 'chest', '(H)0'],
      ['JunimoChests', 'global', '(O)388'],
    ]);
  });

  it('reads community center and museum', () => {
    expect(save.communityCenter.bundles['0']).toEqual([true, false]);
    expect(save.communityCenter.rewards['0']).toBe(true);
    expect(save.communityCenter.areasComplete).toEqual([true, false]);
    expect(save.communityCenter.bundleData['Pantry/0']).toContain('Spring Crops');
    expect(save.museum).toEqual({ '42,16': '96' });
  });
});
