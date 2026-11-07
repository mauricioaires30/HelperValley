import { getItem, type Season } from '@/data/gameData';
import type { Player, SaveData } from '@/save/model';
import { createIntervalRandom, type DotNetRandom, type SeedContext } from './random';

/**
 * Game state queries (GameStateQuery) as used by Data/Shops, evaluated against a save and a chosen day.
 * Results are tri-state: true, false, or null when the site can't know (e.g. a RANDOM roll on Game1.random).
 */

export const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export interface QueryContext {
  save: SaveData;
  player: Player;
  season: Season;
  day: number;
  year: number;
  seed: SeedContext;
  /** The RNG passed to the query (the shop's day random), or null when the game would use Game1.random. */
  random: DotNetRandom | null;
  /** Qualified id of the item being filtered (PerItemCondition), if any. */
  target?: string;
}

/** Splits "A x, !B \"y z\"" into queries, keeping quoted commas. */
export function splitQueries(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    if (c === ',' && !quoted) {
      out.push(current.trim());
      current = '';
    } else current += c;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Splits a query into arguments, honoring quotes. */
function args(query: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) out.push(m[1] ?? m[2]);
  return out;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const inRange = (value: number, min: string | undefined, max: string | undefined) =>
  value >= Number(min ?? -Infinity) && value <= (max === undefined ? Infinity : Number(max));

function players(ctx: QueryContext, who: string): Player[] {
  if (eq(who, 'Current') || eq(who, 'Target')) return [ctx.player];
  if (eq(who, 'Host')) return ctx.save.players.filter((p) => p.isHost);
  return ctx.save.players.filter((p) => eq(who, 'Any') || eq(who, 'All') || p.id === who);
}

/** PLAYER_* queries: true if any (or all, for "All") matching player passes. */
function anyPlayer(ctx: QueryContext, who: string, test: (p: Player) => boolean): boolean {
  const list = players(ctx, who);
  return eq(who, 'All') ? list.every(test) : list.some(test);
}

const mailOf = (ctx: QueryContext, p: Player) => new Set([...p.mailReceived, ...(p.isHost ? ctx.save.broadcastedMail : [])]);

/** Passive festivals by date (Data/PassiveFestivals). */
function passiveFestival(ctx: QueryContext, id: string): boolean | null {
  const { season, day } = ctx;
  switch (id.toLowerCase()) {
    case 'nightmarket':
      return season === 'winter' && day >= 15 && day <= 17;
    case 'desertfestival':
      return season === 'spring' && day >= 15 && day <= 17 ? null : false; // needs the bus repaired
    case 'troutderby':
      return season === 'summer' && (day === 20 || day === 21);
    case 'squidfest':
      return season === 'winter' && (day === 12 || day === 13);
    default:
      return null;
  }
}

/** RandomImpl: chance, optionally plus daily luck. */
function randomImpl(random: DotNetRandom | null, a: string[], from: number, ctx: QueryContext): boolean | null {
  if (!random) return null;
  let chance = Math.fround(Number(a[from]));
  if (a.slice(from + 1).some((x) => eq(x, '@addDailyLuck'))) chance += ctx.save.dailyLuck;
  return random.nextDouble() < chance;
}

function single(query: string, ctx: QueryContext): boolean | null {
  const a = args(query);
  const key = a[0]?.toUpperCase();
  const item = ctx.target ? getItem(ctx.target) : undefined;
  const dayOfWeek = (ctx.day - 1) % 7;
  switch (key) {
    case 'TRUE':
      return true;
    case 'FALSE':
      return false;
    case 'ANY': {
      let unknown = false;
      for (const sub of a.slice(1)) {
        const r = check(sub, ctx);
        if (r === true) return true;
        if (r === null) unknown = true;
      }
      return unknown ? null : false;
    }
    case 'SEASON':
      return a.slice(1).some((s) => eq(s, ctx.season));
    case 'DAY_OF_MONTH':
      return a.slice(1).some((d) => (eq(d, 'even') ? ctx.day % 2 === 0 : eq(d, 'odd') ? ctx.day % 2 === 1 : Number(d) === ctx.day));
    case 'DAY_OF_WEEK':
      return a.slice(1).some((d) => (/^\d+$/.test(d) ? Number(d) % 7 === (dayOfWeek + 1) % 7 : WEEKDAYS[dayOfWeek].startsWith(d.toLowerCase().slice(0, 3))));
    case 'SEASON_DAY':
      for (let i = 1; i + 1 < a.length; i += 2) if (eq(a[i], ctx.season) && Number(a[i + 1]) === ctx.day) return true;
      return false;
    case 'YEAR':
      return inRange(ctx.year, a[1], a[2]);
    case 'DAYS_PLAYED':
      return inRange(ctx.seed.daysPlayed, a[1], a[2]);
    case 'TIME':
      return true; // shops are checked while open
    case 'IS_MULTIPLAYER':
      return ctx.save.players.length > 1;
    case 'IS_HOST':
      return ctx.player.isHost;
    case 'IS_COMMUNITY_CENTER_COMPLETE':
      return ctx.save.players.some((p) => mailOf(ctx, p).has('ccIsComplete'));
    case 'IS_JOJA_MART_COMPLETE':
      return ctx.save.players.some((p) => ['jojaBoilerRoom', 'jojaCraftsRoom', 'jojaFishTank', 'jojaPantry', 'jojaVault'].every((m) => mailOf(ctx, p).has(m)));
    case 'IS_PASSIVE_FESTIVAL_TODAY':
      return passiveFestival(ctx, a[1] ?? '');
    case 'MINE_LOWEST_LEVEL_REACHED':
      return inRange(Math.max(...ctx.save.players.map((p) => p.deepestMineLevel)), a[1], a[2]);
    case 'MUSEUM_DONATIONS':
      return a.length <= 3 ? inRange(Object.keys(ctx.save.museum).length, a[1], a[2]) : null;
    case 'WORLD_STATE_FIELD': {
      const w = ctx.save.world;
      const fields: Record<string, number | boolean> = {
        goldenwalnutsfound: ctx.save.goldenWalnutsFound,
        goldenwalnuts: ctx.save.goldenWalnuts,
        goldencoconutcracked: w.goldenCoconutCracked,
        timesfedraccoons: w.timesFedRaccoons,
        visitsuntily1guarantee: w.visitsUntilY1Guarantee,
      };
      const v = fields[(a[1] ?? '').toLowerCase()];
      if (v === undefined) return null;
      if (typeof v === 'boolean') return String(v) === (a[2] ?? '').toLowerCase();
      return inRange(v, a[2], a[3]);
    }
    case 'SYNCED_RANDOM':
      return randomImpl(createIntervalRandom(ctx.seed, a[1] ?? '', a[2] ?? null), a, 3, ctx);
    case 'SYNCED_CHOICE': {
      const r = createIntervalRandom(ctx.seed, a[1] ?? '', a[2] ?? null);
      if (!r) return null;
      const pick = String(r.next(Number(a[3]), Number(a[4]) + 1));
      return a.slice(5).includes(pick);
    }
    case 'RANDOM':
      return randomImpl(ctx.random, a, 1, ctx);
    case 'PLAYER_HAS_MAIL':
      return anyPlayer(ctx, a[1], (p) => mailOf(ctx, p).has(a[2]));
    case 'PLAYER_HAS_SEEN_EVENT':
      return anyPlayer(ctx, a[1], (p) => a.slice(2).some((e) => p.eventsSeen.includes(e)));
    case 'PLAYER_HAS_ACHIEVEMENT':
      return anyPlayer(ctx, a[1], (p) => p.achievements.includes(Number(a[2])));
    case 'PLAYER_HAS_CRAFTING_RECIPE':
      return anyPlayer(ctx, a[1], (p) => a.slice(2).join(' ') in p.craftingRecipes);
    case 'PLAYER_HAS_COOKING_RECIPE':
      return anyPlayer(ctx, a[1], (p) => a.slice(2).join(' ') in p.cookingRecipes);
    case 'PLAYER_HAS_TOWN_KEY':
      return anyPlayer(ctx, a[1], (p) => p.mailReceived.includes('HasTownKey'));
    case 'PLAYER_HEARTS':
      return anyPlayer(ctx, a[1], (p) => {
        const npcs = eq(a[2], 'Any') ? Object.values(p.friendships) : [p.friendships[a[2]]].filter(Boolean);
        return npcs.some((f) => inRange(Math.floor(f.points / 250), a[3], a[4]));
      });
    case 'PLAYER_NPC_RELATIONSHIP':
      return anyPlayer(ctx, a[1], (p) => {
        const f = p.friendships[a[2]];
        return !!f && a.slice(3).some((s) => eq(s, f.status) || (eq(s, 'Friendly') && !['Married', 'Dating', 'Engaged', 'Roommate'].includes(f.status)));
      });
    case 'PLAYER_STAT':
      return anyPlayer(ctx, a[1], (p) => {
        const k = Object.keys(p.stats).find((s) => eq(s, a[2]));
        return inRange(k ? p.stats[k] : 0, a[3], a[4]);
      });
    case 'PLAYER_FARMHOUSE_UPGRADE':
      return anyPlayer(ctx, a[1], (p) => inRange(p.houseUpgradeLevel, a[2], a[3]));
    case 'PLAYER_BASE_FARMING_LEVEL':
    case 'PLAYER_FARMING_LEVEL':
      return anyPlayer(ctx, a[1], (p) => inRange(p.skills.farming, a[2], a[3]));
    case 'PLAYER_BASE_FISHING_LEVEL':
    case 'PLAYER_FISHING_LEVEL':
      return anyPlayer(ctx, a[1], (p) => inRange(p.skills.fishing, a[2], a[3]));
    case 'PLAYER_BASE_FORAGING_LEVEL':
      return anyPlayer(ctx, a[1], (p) => inRange(p.skills.foraging, a[2], a[3]));
    case 'PLAYER_BASE_MINING_LEVEL':
      return anyPlayer(ctx, a[1], (p) => inRange(p.skills.mining, a[2], a[3]));
    case 'PLAYER_BASE_COMBAT_LEVEL':
      return anyPlayer(ctx, a[1], (p) => inRange(p.skills.combat, a[2], a[3]));
    case 'PLAYER_HAS_ITEM':
      return anyPlayer(ctx, a[1], (p) => {
        const id = a[2].startsWith('(') ? a[2] : `(O)${a[2]}`;
        const count = p.inventory.filter((i) => i.id === id).reduce((n, i) => n + i.stack, 0);
        return inRange(count, a[3] ?? '1', a[4]);
      });
    // Item queries (PerItemCondition).
    case 'ITEM_ID':
      return !!ctx.target && a.slice(2).some((id) => eq(id, ctx.target!) || eq(id, ctx.target!.replace(/^\(\w+\)/, '')));
    case 'ITEM_CATEGORY': {
      const c = item?.c ?? 0;
      return a.length === 2 ? c < -1 : a.slice(2).some((x) => Number(x) === c);
    }
    case 'ITEM_HAS_EXPLICIT_OBJECT_CATEGORY':
      return !!ctx.target?.startsWith('(O)') && (item?.c ?? 0) < 0;
    case 'ITEM_OBJECT_TYPE':
      return !!item?.t && a.slice(2).some((x) => eq(x, item.t!));
    case 'ITEM_CONTEXT_TAG':
      return !!item && a.slice(2).every((tag) => (tag.startsWith('!') ? !item.tags?.includes(tag.slice(1)) : !!item.tags?.includes(tag)));
    default:
      return null;
  }
}

/** One query with its "!" negation. */
function check(query: string, ctx: QueryContext): boolean | null {
  const negated = query.startsWith('!');
  const r = single(negated ? query.slice(1) : query, ctx);
  return r === null ? null : negated ? !r : r;
}

/**
 * GameStateQuery.CheckConditions: every query must pass, stopping at the first failure
 * (later queries, and any random rolls in them, are not evaluated).
 */
export function checkConditions(text: string | undefined | null, ctx: QueryContext): boolean | null {
  if (!text || text === 'TRUE') return true;
  if (text === 'FALSE') return false;
  let unknown = false;
  for (const q of splitQueries(text)) {
    const r = check(q, ctx);
    if (r === false) return false;
    if (r === null) unknown = true;
  }
  return unknown ? null : true;
}
