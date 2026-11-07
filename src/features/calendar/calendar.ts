import type { Festival, NpcData, Season } from '@/data/gameData';

export const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];
export const DAYS_IN_SEASON = 28;

export interface CalendarDay {
  day: number;
  birthdays: string[];
  festivals: Festival[];
}

/** The 28 days of a season with villager birthdays and festivals. */
export function seasonDays(season: Season, npcs: Record<string, NpcData>, festivals: Festival[]): CalendarDay[] {
  return Array.from({ length: DAYS_IN_SEASON }, (_, i) => {
    const day = i + 1;
    return {
      day,
      birthdays: Object.entries(npcs)
        .filter(([, n]) => n.birth?.season === season && n.birth.day === day && n.social !== 3)
        .map(([key]) => key),
      festivals: festivals.filter((f) => f.season === season && day >= f.start && day <= f.end),
    };
  });
}

/** Absolute day index (0-based) within a year, for "in N days" math. */
export const dayOfYear = (season: Season, day: number) => SEASONS.indexOf(season) * DAYS_IN_SEASON + day - 1;

/** Days from `from` until the next occurrence of `to` (0 = same day), wrapping into next year. */
export function daysUntil(from: { season: Season; day: number }, to: { season: Season; day: number }) {
  const diff = dayOfYear(to.season, to.day) - dayOfYear(from.season, from.day);
  return diff >= 0 ? diff : diff + DAYS_IN_SEASON * 4;
}

/** The date `days` days after `from`, rolling over seasons and years. */
export function addDays(from: { season: Season; day: number; year: number }, days: number) {
  const index = (from.year - 1) * DAYS_IN_SEASON * 4 + dayOfYear(from.season, from.day) + days;
  const year = Math.floor(index / (DAYS_IN_SEASON * 4)) + 1;
  const inYear = index % (DAYS_IN_SEASON * 4);
  return { year, season: SEASONS[Math.floor(inYear / DAYS_IN_SEASON)], day: (inYear % DAYS_IN_SEASON) + 1 };
}
