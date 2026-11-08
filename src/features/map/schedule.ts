import type { Season } from '@/data/gameData';

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface ScheduleData {
  /** [location, x, y] where the NPC starts the day. */
  home: [string, number, number] | null;
  island: string | null;
  /** Data/Characters CanSocialize. */
  social?: string | null;
  female?: boolean;
  schedules: Record<string, string>;
}

export interface DayConditions {
  season: Season;
  day: number;
  raining: boolean;
  /** Hearts with this NPC, for friendship-gated schedules. */
  hearts: number;
  /** The player is married to this NPC. */
  married: boolean;
}

export interface Stop {
  /** In-game time, e.g. 1330 (600 = 6am, 2600 = 2am). */
  time: number;
  location: string;
  x: number;
  y: number;
  /** "a1300": the time to arrive by, instead of the time to leave at. */
  arriveBy?: boolean;
}

export interface ScheduleResult {
  key: string | null;
  stops: Stop[];
}

const weekday = (day: number) => WEEKDAYS[(day - 1) % 7];

/**
 * Candidate schedule keys in the order the game tries them (NPC.TryLoadSchedule):
 * exact date, date with hearts, day of month, rain, season+weekday (with hearts), weekday,
 * season, then spring fallbacks.
 */
export function candidateKeys(c: DayConditions): string[] {
  const dow = weekday(c.day);
  const keys: string[] = [];
  if (c.married) {
    if (c.raining) keys.push('marriage_rain');
    keys.push(`marriage_${c.season}_${c.day}`, `marriage_${dow}`);
    return keys;
  }
  keys.push(`${c.season}_${c.day}`);
  for (let h = Math.floor(c.hearts); h > 0; h--) keys.push(`${c.day}_${h}`);
  keys.push(String(c.day));
  if (c.raining) keys.push('rain');
  for (let h = Math.floor(c.hearts); h > 0; h--) keys.push(`${c.season}_${dow}_${h}`);
  keys.push(`${c.season}_${dow}`);
  for (let h = Math.floor(c.hearts); h > 0; h--) keys.push(`${dow}_${h}`);
  keys.push(dow, c.season, `spring_${dow}`, 'spring');
  return keys;
}

/** Parses "900 SeedShop 9 5 0/a1300 Town 47 87 2 ..." into stops. */
export function parseStops(value: string): Stop[] {
  const stops: Stop[] = [];
  for (const part of value.split('/')) {
    const tokens = part.trim().split(/\s+/);
    const time = Number(tokens[0]?.replace(/^a/, ''));
    if (!Number.isFinite(time) || tokens.length < 4) continue;
    stops.push({ time, location: tokens[1], x: Number(tokens[2]), y: Number(tokens[3]), ...(tokens[0].startsWith('a') ? { arriveBy: true } : {}) });
  }
  return stops;
}

/**
 * Picks today's schedule, following GOTO redirects and skipping entries gated by
 * "NOT friendship <npc> <hearts>" when the player has that friendship.
 */
export function resolveSchedule(data: ScheduleData, c: DayConditions, npc: string): ScheduleResult {
  const tried = new Set<string>();
  const load = (key: string, depth = 0): Stop[] | null => {
    const raw = data.schedules[key];
    if (raw === undefined || depth > 4) return null;
    const first = raw.split('/')[0].trim();
    if (first.startsWith('GOTO')) {
      const target = first.split(/\s+/)[1];
      return target === 'season' ? load(c.season, depth + 1) : load(target, depth + 1);
    }
    if (first.startsWith('NOT friendship')) {
      const [, , who, hearts] = first.split(/\s+/);
      // "NOT friendship X 6": only applies while hearts with X are below 6.
      if (who === npc && c.hearts >= Number(hearts)) return null;
      return parseStops(raw.slice(raw.indexOf('/') + 1));
    }
    if (first.startsWith('MAIL')) return parseStops(raw.slice(raw.indexOf('/') + 1));
    return parseStops(raw);
  };

  for (const key of candidateKeys(c)) {
    if (tried.has(key)) continue;
    tried.add(key);
    const stops = load(key);
    if (stops && stops.length) return { key, stops };
  }
  return { key: null, stops: [] };
}

/** Where the NPC is at `time`: the last stop started at or before it, else home. */
export function positionAt(data: ScheduleData, schedule: ScheduleResult, time: number): Stop | null {
  let current: Stop | null = data.home ? { time: 600, location: data.home[0], x: data.home[1], y: data.home[2] } : null;
  for (const stop of schedule.stops) {
    if (stop.time <= time) current = stop;
    else break;
  }
  return current;
}

/** 1330 → "13:30"; 2500 → "01:00". */
export const formatTime = (time: number) => {
  const h = Math.floor(time / 100) % 24;
  const m = time % 100;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
