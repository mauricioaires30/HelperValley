import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { candidateKeys, parseStops, positionAt, resolveSchedule, type ScheduleData } from '../schedule';
import { toMapPixel, type WorldMapData } from '../worldMap';

const schedules = JSON.parse(readFileSync(new URL('../../../../public/data/schedules.json', import.meta.url), 'utf8')) as Record<string, ScheduleData>;
const world = JSON.parse(readFileSync(new URL('../../../../public/data/worldMap.json', import.meta.url), 'utf8')) as WorldMapData;

describe('NPC schedules', () => {
  it('orders candidate keys like the game', () => {
    const keys = candidateKeys({ season: 'spring', day: 4, raining: false, hearts: 2, married: false });
    expect(keys.slice(0, 4)).toEqual(['spring_4', '4_2', '4_1', '4']);
    expect(keys).toContain('Thu');
  });

  it('parses stops, including arrival times', () => {
    expect(parseStops('900 SeedShop 9 5 0/a1300 Town 47 87 2')).toEqual([
      { time: 900, location: 'SeedShop', x: 9, y: 5 },
      { time: 1300, location: 'Town', x: 47, y: 87 },
    ]);
  });

  it("uses Abigail's rain schedule on rainy days", () => {
    const day = { season: 'summer', day: 3, raining: true, hearts: 0, married: false } as const;
    const result = resolveSchedule(schedules.Abigail, day, 'Abigail');
    expect(result.key).toBe('rain');
    expect(positionAt(schedules.Abigail, result, 1200)?.location).toBe('SeedShop');
  });

  it('places outdoor tiles inside their map area', () => {
    const town = toMapPixel(world, 'Town', 47, 87);
    expect(town?.region).toBe('Valley');
    const area = world.regions.Valley.positions.find((p) => p.location === 'Town' && !p.tiles)!.pixels!;
    expect(town!.px).toBeGreaterThan(area[0]);
    expect(town!.px).toBeLessThan(area[0] + area[2]);
  });
});
