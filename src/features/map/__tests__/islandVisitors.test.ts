import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { setGameData, type GameData } from '@/data/gameData';
import type { SaveData } from '@/save/model';
import { islandDay } from '../islandVisitors';
import { npcRoute } from '../npcRoute';

const load = (name: string) => JSON.parse(readFileSync(`public/data/${name}.json`, 'utf8'));

const NAMES = ['Abigail', 'Alex', 'Caroline', 'Clint', 'Demetrius', 'Elliott', 'Emily', 'Gus', 'Haley', 'Harvey', 'Jas', 'Jodi', 'Kent', 'Leah', 'Lewis', 'Marnie', 'Maru', 'Pam', 'Penny', 'Pierre', 'Robin', 'Sam', 'Sebastian', 'Shane', 'Vincent', 'Willy', 'George'];
const base = (overrides: Partial<SaveData> = {}) =>
  ({
    uniqueId: '123456789',
    date: { year: 2, season: 'summer', day: 3 },
    resort: { restored: true, openToday: true },
    islandRaining: false,
    world: { legacyRandom: false },
    players: [{ stats: { daysPlayed: 200 } }],
    villagers: NAMES.map((name) => ({ name, location: 'Town', age: ['Jas', 'Vincent'].includes(name) ? 2 : 0, invisible: false })),
    ...overrides,
  }) as unknown as SaveData;

describe('island visitors', () => {
  beforeAll(() => setGameData({ calendar: load('calendar'), schedules: load('schedules'), npcPaths: load('npcPaths') } as unknown as GameData));

  it('says why nobody goes', () => {
    expect(islandDay(base({ resort: { restored: false, openToday: false } })).state).toBe('notBuilt');
    expect(islandDay(base({ resort: { restored: true, openToday: false } })).state).toBe('closed');
    expect(islandDay(base({ islandRaining: true })).state).toBe('rain');
    expect(islandDay(base({ date: { year: 2, season: 'spring', day: 13 } } as Partial<SaveData>)).state).toBe('festival');
  });

  it('draws the same people for the same day, and others on another day', () => {
    const a = islandDay(base());
    expect(a.state).toBe('open');
    expect(a.visitors.length).toBeGreaterThan(0);
    expect(islandDay(base()).visitors).toEqual(a.visitors);
    const days = new Set(Array.from({ length: 12 }, (_, i) => islandDay(base({ players: [{ stats: { daysPlayed: 200 + i } }] } as unknown as Partial<SaveData>)).visitors.join()));
    expect(days.size).toBeGreaterThan(3);
  });

  it('never picks who cannot go', () => {
    for (let i = 0; i < 40; i++) {
      const { visitors } = islandDay(base({ players: [{ stats: { daysPlayed: 300 + i * 7 } }] } as unknown as Partial<SaveData>));
      expect(visitors).not.toContain('Willy');
      expect(visitors).not.toContain('George');
    }
  });

  it('gives them a route to the resort and back home', () => {
    const { visitors, schedules } = islandDay(base());
    const npc = visitors[0];
    const home = load('schedules')[npc].home;
    const stops = schedules[npc];
    expect(stops.some((s) => s.location === 'IslandSouth')).toBe(true);
    const route = npcRoute({ location: home[0], x: home[1], y: home[2] }, stops[0])!;
    expect(route).not.toBeNull();
    expect(route[route.length - 1].location).toBe('IslandSouth');
    expect(stops[stops.length - 1].location).toBe(home[0]);
  });
});
