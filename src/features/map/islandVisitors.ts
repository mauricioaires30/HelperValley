import { gameData } from '@/data/gameData';
import { createRandomSeed, DotNetRandom } from '@/features/shops/random';
import type { SaveData } from '@/save/model';
import { WEEKDAYS, type Stop } from './schedule';

export type ResortState = 'open' | 'closed' | 'notBuilt' | 'rain' | 'festival';

export interface IslandDay {
  state: ResortState;
  /** Who the game picked for today, in the game's order. */
  visitors: string[];
  /** Each visitor's schedule for today, replacing the usual one. */
  schedules: Record<string, Stop[]>;
}

/** The groups the game prefers (IslandSouth.SetupIslandSchedules). */
const GROUPS = [
  ['Sebastian', 'Sam', 'Abigail'],
  ['Jodi', 'Kent', 'Vincent', 'Sam'],
  ['Jodi', 'Vincent', 'Sam'],
  ['Pierre', 'Caroline', 'Abigail'],
  ['Robin', 'Demetrius', 'Maru', 'Sebastian'],
  ['Lewis', 'Marnie'],
  ['Marnie', 'Shane', 'Jas'],
  ['Penny', 'Jas', 'Vincent'],
  ['Pam', 'Penny'],
  ['Caroline', 'Marnie', 'Robin', 'Jodi'],
  ['Haley', 'Penny', 'Leah', 'Emily', 'Maru', 'Abigail'],
  ['Alex', 'Sam', 'Sebastian', 'Elliott', 'Shane', 'Harvey'],
];

/** Villagers with a Characters/<name>_Beach sprite change clothes first. Lewis only after his lucky pants event. */
const BEACH_CLOTHES = new Set(['Abigail', 'Alex', 'Caroline', 'Clint', 'Demetrius', 'Elliott', 'Emily', 'Haley', 'Harvey', 'Jodi', 'Leah', 'Marnie', 'Maru', 'Pam', 'Penny', 'Pierre', 'Robin', 'Sam', 'Sebastian', 'Shane']);

/** Spots on the resort's beach (shore, towels, chairs, umbrellas of IslandActivityAssigments). */
const BEACH_SPOTS: Array<[number, number]> = [[14, 27], [17, 28], [20, 27], [23, 28], [26, 26], [28, 29], [10, 27], [20, 24], [30, 29], [9, 33], [13, 33], [17, 33], [24, 33]];

/** The game-state queries Data/Characters uses in CanVisitIsland. */
function canVisitByRule(rule: string | null | undefined, day: number, season: string) {
  if (rule == null) return true;
  return rule.split(',').every((part) => {
    const [query, ...args] = part.trim().split(/\s+/);
    const negated = query.startsWith('!');
    const name = negated ? query.slice(1) : query;
    let result = true;
    if (name === 'FALSE') result = false;
    else if (name === 'DAY_OF_WEEK') result = args.some((a) => a.slice(0, 3) === WEEKDAYS[(day - 1) % 7]);
    else if (name === 'SEASON_DAY') result = args[0] === season && Number(args[1]) === day;
    return negated ? !result : result;
  });
}

/** The day's resort state and the visitors, by the game's own seeded draw. */
export function islandDay(save: SaveData): IslandDay {
  const none = (state: ResortState): IslandDay => ({ state, visitors: [], schedules: {} });
  const { season, day } = save.date;
  const { calendar, schedules } = gameData();
  if (!save.resort.restored) return none('notBuilt');
  if (calendar.festivals.some((f) => f.season === season && day >= f.start && day <= f.end)) return none('festival');
  if (save.islandRaining) return none('rain');
  if (!save.resort.openToday) return none('closed');

  const canVisit = (npc: { name: string; location: string; invisible: boolean }) => {
    const data = schedules[npc.name];
    if (!data || npc.invisible || npc.location === 'Farm' || data.social === 'FALSE') return false;
    if (!canVisitByRule(data.island, day, season)) return false;
    // Utility.IsHospitalVisitDay: their schedule for today goes to the clinic.
    return !data.schedules[`${season}_${day}`]?.includes('Hospital');
  };
  const villagers = save.villagers.filter(canVisit);
  const ageOf = new Map(save.villagers.map((v) => [v.name, v.age]));
  const valid = villagers.map((v) => v.name);
  const daysPlayed = save.players[0]?.stats.daysPlayed ?? 0;
  const random = new DotNetRandom(createRandomSeed(Number(save.uniqueId) * 1.21, daysPlayed * 2.5, 0, 0, 0, save.world.legacyRandom));

  const list: string[] = [];
  const pick = () => {
    const npc = random.chooseFrom(valid);
    if (npc !== undefined && ageOf.get(npc) !== 2) {
      valid.splice(valid.indexOf(npc), 1);
      list.push(npc);
    }
  };
  if (random.nextDouble() < 0.4) {
    for (let i = 0; i < 5; i++) pick();
  } else {
    const group = GROUPS[random.next(GROUPS.length)];
    if (group.every((npc) => valid.includes(npc))) {
      for (const npc of group) {
        valid.splice(valid.indexOf(npc), 1);
        list.push(npc);
      }
    }
    // The game's loop re-reads the list's size each turn.
    for (let j = 0; j < 5 - list.length; j++) pick();
  }

  const out: Record<string, Stop[]> = {};
  list.forEach((npc, i) => {
    const data = schedules[npc];
    const dressing = { location: 'IslandSouth', x: data.female ? 22 : 24, y: 19 };
    const clothes = BEACH_CLOTHES.has(npc);
    const stops: Stop[] = [];
    if (clothes) stops.push({ time: 1150, ...dressing, arriveBy: true });
    [1200, 1400, 1600].forEach((time, k) => {
      const [x, y] = npc === 'Gus' ? [14, 21] : BEACH_SPOTS[(i * 3 + k) % BEACH_SPOTS.length];
      stops.push({ time, location: 'IslandSouth', x, y, ...(k === 0 && !clothes ? { arriveBy: true } : {}) });
    });
    if (clothes) stops.push({ time: 1730, ...dressing, arriveBy: true });
    const home = data.home ?? ['IslandSouth', 14, 27];
    if (npc === 'Gus') stops.push({ time: 1800, location: 'Saloon', x: 10, y: 18 }, { time: 2430, location: home[0], x: home[1], y: home[2] });
    else stops.push({ time: 1800, location: home[0], x: home[1], y: home[2] });
    out[npc] = stops;
  });
  return { state: 'open', visitors: list, schedules: out };
}
