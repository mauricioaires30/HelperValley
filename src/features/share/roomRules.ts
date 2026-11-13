import { cleanNick, GUEST_COLORS, HOST_COLOR, MAX_GUESTS, sameNick, type Checks, type ClientMessage, type Peer, type Refusal, type Role } from './protocol';

/**
 * The room server's rules (used by worker/src/room.ts), kept free of Cloudflare APIs so they're tested here.
 */

export interface JoinRequest {
  role: string | null;
  clientId: string | null;
  nick: string | null;
  /** The host's secret for this room, kept in its browser. */
  token: string | null;
  /** This browser (kept across tabs and visits), what bans apply to. */
  browser: string | null;
}

export interface RoomState {
  /** Set by the first host to open the room. */
  token: string | null;
  peers: Peer[];
  /** The host is connected, or dropped less than HOST_GRACE_MS ago. Without a host the room is closed. */
  hostPresent: boolean;
  /** The host stopped new farmhands from joining. */
  locked: boolean;
  /** Banned browsers. */
  bans: string[];
}

export type Admission = { peer: Peer; claim: boolean } | { refuse: Refusal };

const ID = /^[a-z0-9]{8,64}$/;

/** Who may enter: the room's own host (by token), or a guest with a free nickname once the host opened it. */
export function admit(request: JoinRequest, room: RoomState): Admission {
  const role = request.role as Role;
  if ((role !== 'host' && role !== 'guest') || !request.clientId || !ID.test(request.clientId)) return { refuse: 'bad-request' };
  const nick = cleanNick(request.nick ?? '');
  if (role === 'host') {
    if (!request.token || !ID.test(request.token)) return { refuse: 'bad-request' };
    if (room.token && room.token !== request.token) return { refuse: 'room-taken' };
    return { peer: { clientId: request.clientId, nick: nick ?? 'Host', role, color: HOST_COLOR }, claim: !room.token };
  }
  if (!room.token || !room.hostPresent) return { refuse: 'no-room' };
  if (request.browser && room.bans.includes(request.browser)) return { refuse: 'banned' };
  // The same tab reconnecting takes its own place (and color) back, even in a locked or full room.
  const returning = room.peers.find((p) => p.clientId === request.clientId);
  if (!returning) {
    if (room.locked) return { refuse: 'locked' };
    if (room.peers.filter((p) => p.role === 'guest').length >= MAX_GUESTS) return { refuse: 'room-full' };
  }
  if (!nick) return { refuse: 'nick-invalid' };
  if (room.peers.some((p) => p.clientId !== request.clientId && sameNick(p.nick, nick))) return { refuse: 'nick-taken' };
  return { peer: { clientId: request.clientId, nick, role, color: returning?.color ?? pickColor(room.peers) }, claim: false };
}

/** A random color nobody in the room has yet. */
export function pickColor(peers: Peer[], random: () => number = Math.random): string {
  const used = new Set(peers.map((p) => p.color));
  const free = GUEST_COLORS.filter((c) => !used.has(c));
  const from = free.length ? free : GUEST_COLORS;
  return from[Math.floor(random() * from.length)];
}

const isChecked = (value: unknown): value is Record<string, true> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((v) => v === true) && Object.keys(value).length <= 500;

/** A message this role may send, validated; null drops it. Only the host speaks for the whole room. */
export function accept(role: Role, raw: string): ClientMessage | null {
  // Plans are the biggest messages (a whole farm's tiles); everything else stays small.
  if (raw.length > 1024 * 1024) return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (m.type !== 'plan' && raw.length > 64 * 1024) return null;
  if (m.type === 'check' && typeof m.day === 'string' && typeof m.key === 'string' && typeof m.on === 'boolean' && m.key.length <= 200) {
    return { type: 'check', day: m.day, key: m.key, on: m.on };
  }
  if (m.type === 'route' && typeof m.route === 'string' && /^\/[\w/-]{0,63}$/.test(m.route)) return { type: 'route', route: m.route };
  if (m.type === 'cur') {
    if (m.hide === true) return { type: 'cur', hide: true };
    if (typeof m.a === 'string' && /^[\w-]{1,40}$/.test(m.a) && isFraction(m.x) && typeof m.y === 'number' && Number.isFinite(m.y) && Math.abs(m.y) < 100_000) {
      return { type: 'cur', a: m.a, x: round(m.x), y: round(m.y) };
    }
    return null;
  }
  if (role !== 'host') return null;
  if (m.type === 'plan' && (m.slot === 'farm' || m.slot === 'island') && (m.data === null || (typeof m.data === 'string' && m.data.length <= 512 * 1024)) && typeof m.link === 'string' && m.link.length <= 300) {
    return { type: 'plan', slot: m.slot, data: m.data, link: m.link };
  }
  if (m.type === 'checks' && (m.day === null || typeof m.day === 'string') && isChecked(m.checked)) return { type: 'checks', day: m.day, checked: m.checked };
  if (m.type === 'app' && typeof m.live === 'boolean') return { type: 'app', live: m.live };
  if (m.type === 'close') return { type: 'close' };
  if ((m.type === 'kick' || m.type === 'ban') && typeof m.clientId === 'string' && ID.test(m.clientId)) return { type: m.type, clientId: m.clientId };
  if (m.type === 'unban' && typeof m.browser === 'string' && ID.test(m.browser)) return { type: 'unban', browser: m.browser };
  if (m.type === 'lock' && typeof m.locked === 'boolean') return { type: 'lock', locked: m.locked };
  return null;
}

const isFraction = (v: unknown): v is number => typeof v === 'number' && v >= -0.5 && v <= 1.5;
const round = (v: number) => Math.round(v * 10_000) / 10_000;

/** A mark applied to the room's list; null when it's about another day (it isn't passed on). */
export function applyCheck(checks: Checks, day: string, key: string, on: boolean): Checks | null {
  if (checks.day !== day) return null;
  const checked = { ...checks.checked };
  if (on) checked[key] = true;
  else delete checked[key];
  return { day, checked };
}

/** Rooms are forgotten this long after the last person leaves. */
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;

/** Pages allowed to open rooms. */
export function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  // Local development of the site.
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
