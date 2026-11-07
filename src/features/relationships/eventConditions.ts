import type { TFunction } from 'i18next';
import { gameData, getItem, type HeartEvent, type LocalizedName } from '@/data/gameData';

/** Above this many "not married to X" conditions, just say "while single". */
const SINGLE_THRESHOLD = 5;
const WEEKDAY_KEYS: Record<string, string> = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };

/** 1030 → "10:30"; 2400+ wraps past midnight. */
const clock = (time: string) => {
  const n = Number(time) % 2400;
  return `${String(Math.floor(n / 100)).padStart(2, '0')}:${String(n % 100).padStart(2, '0')}`;
};

/**
 * Human-readable "how to trigger" lines for a heart event, from the game's own
 * preconditions: where, when, weather, seasons, other friendships and prior events.
 */
export function describeEvent(event: HeartEvent, t: TFunction, name: (n: LocalizedName | undefined) => string): string[] {
  const { npcs, heartEvents } = gameData();
  const npcName = (key: string) => name(npcs[key]?.n) || key;
  const place = heartEvents.places[event.location]
    ? name(heartEvents.places[event.location])
    : t(`rel.place.${event.location}`, { defaultValue: event.location });

  const lines = [t('rel.when.place', { place })];
  const notMarried: string[] = [];
  const otherFriends: string[] = [];
  let priorEvents = 0;

  for (const [code, ...args] of event.conditions) {
    switch (code) {
      case 't':
        lines.push(t('rel.when.time', { from: clock(args[0]), to: clock(args[1]) }));
        break;
      case 'w':
        lines.push(t(`rel.when.weather.${args[0]}`, { defaultValue: args[0] }));
        break;
      case 'z':
        lines.push(t('rel.when.notSeason', { seasons: args.map((s) => t(`common.seasons.${s}`)).join(', ') }));
        break;
      case 'd':
        lines.push(t('rel.when.notDays', { days: args.map((d) => t(`calendar.weekdays.${WEEKDAY_KEYS[d] ?? d}`)).join(', ') }));
        break;
      case 'y':
        lines.push(args[0] === '1' ? t('rel.when.firstYear') : t('rel.when.fromYear', { year: args[0] }));
        break;
      case 'p':
        lines.push(t('rel.when.present', { name: npcName(args[0]) }));
        break;
      case 'f':
        otherFriends.push(t('rel.when.friend', { name: npcName(args[0]), hearts: Math.round(Number(args[1]) / 250) }));
        break;
      case 'O':
        lines.push(t('rel.when.married', { name: npcName(args[0]) }));
        break;
      case 'o':
        notMarried.push(npcName(args[0]));
        break;
      case 'D':
        lines.push(t('rel.when.dating', { name: npcName(args[0]) }));
        break;
      case 'L':
        lines.push(t('rel.when.house', { level: args[0] }));
        break;
      case 'M':
        lines.push(t('rel.when.money', { money: Number(args[0]).toLocaleString() }));
        break;
      case 'j':
        lines.push(t('rel.when.daysPlayed', { count: Number(args[0]) }));
        break;
      case 'i':
        lines.push(t('rel.when.item', { item: name(getItem(args[0])?.n) || args[0] }));
        break;
      case 'e':
        priorEvents += args.length;
        break;
      case 'n':
      case 'Hn':
        lines.push(t('rel.when.mail'));
        break;
    }
  }

  if (otherFriends.length) lines.push(otherFriends.join(', '));
  if (notMarried.length >= SINGLE_THRESHOLD) lines.push(t('rel.when.single'));
  else if (notMarried.length) lines.push(t('rel.when.notMarried', { names: notMarried.join(', ') }));
  if (priorEvents) lines.push(t('rel.when.priorEvents', { count: priorEvents }));
  // Several "mail" lines say the same thing.
  return [...new Set(lines)];
}
