import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readRaw } from './raw.mjs';
import { CACHE_DIR, LANGUAGES } from './paths.mjs';
import { localize } from './strings.mjs';

const SEASONS = ['spring', 'summer', 'fall', 'winter'];

/** Festivals: the eight day festivals plus multi-day passive ones (Night Market, Desert Festival...). */
export function buildCalendar() {
  const festivals = [];
  for (const key of Object.keys(readRaw('Data/Festivals/FestivalDates'))) {
    const [, season, day] = key.match(/^([a-z]+)(\d+)$/);
    festivals.push({
      id: key,
      season,
      start: Number(day),
      end: Number(day),
      n: LANGUAGES.map(([, suffix]) => (readRaw('Data/Festivals/FestivalDates' + suffix) ?? readRaw('Data/Festivals/FestivalDates'))[key]),
    });
  }
  for (const [id, f] of Object.entries(readRaw('Data/PassiveFestivals'))) {
    festivals.push({
      id,
      season: SEASONS[f.Season],
      start: f.StartDay,
      end: f.EndDay,
      // Some passive festivals have no display name in data; the site translates those by id.
      n: f.DisplayName ? localize(f.DisplayName, id) : null,
      passive: true,
    });
  }
  return { festivals };
}

/**
 * Heart events: events whose preconditions require "f <NPC> <points>" friendship.
 * Used to show which cutscenes a player still hasn't seen.
 */
export function buildHeartEvents() {
  const dir = path.join(CACHE_DIR, 'Data/Events');
  const locations = readRaw('Data/Locations');
  const events = [];
  for (const file of readdirSync(dir).filter((f) => !/\.[a-z]{2}-[A-Z]{2}\.json$/.test(f))) {
    const location = file.replace(/\.json$/, '');
    for (const key of Object.keys(readRaw(`Data/Events/${location}`) ?? {})) {
      const match = key.match(/(?:^|\/)f ([A-Za-z]+) (\d+)/);
      // Below one heart these are introductions, not heart events.
      if (!match || Number(match[2]) < 250) continue;
      events.push({ id: key.split('/')[0], npc: match[1], hearts: Math.round(Number(match[2]) / 250), location });
    }
  }
  events.sort((a, b) => a.npc.localeCompare(b.npc) || a.hearts - b.hearts);

  const places = {};
  for (const location of new Set(events.map((e) => e.location))) {
    const name = locations[location]?.DisplayName;
    // Only simple tokens resolve cleanly; others fall back to the raw key on the site.
    if (name && !name.includes('[EscapedText')) places[location] = localize(name, location);
  }
  return { events, places };
}
