import { cleanNick, sameNick, type Checks, type ClientMessage, type Peer, type Refusal, type Role } from './protocol';

/**
 * The room server's rules (used by worker/src/room.ts), kept free of Cloudflare APIs so they're tested here.
 */

export interface JoinRequest {
  role: string | null;
  clientId: string | null;
  nick: string | null;
  /** The host's secret for this room, kept in its browser. */
  token: string | null;
}

export interface RoomState {
  /** Set by the first host to open the room. */
  token: string | null;
  peers: Peer[];
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
    return { peer: { clientId: request.clientId, nick: nick ?? 'Host', role }, claim: !room.token };
  }
  if (!room.token) return { refuse: 'no-room' };
  if (!nick) return { refuse: 'nick-invalid' };
  // The same browser reconnecting takes its own place back.
  if (room.peers.some((p) => p.clientId !== request.clientId && sameNick(p.nick, nick))) return { refuse: 'nick-taken' };
  return { peer: { clientId: request.clientId, nick, role }, claim: false };
}

const isChecked = (value: unknown): value is Record<string, true> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((v) => v === true) && Object.keys(value).length <= 500;

/** A message this role may send, validated; null drops it. Only the host speaks for the whole room. */
export function accept(role: Role, raw: string): ClientMessage | null {
  if (raw.length > 64 * 1024) return null;
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (m.type === 'check' && typeof m.day === 'string' && typeof m.key === 'string' && typeof m.on === 'boolean' && m.key.length <= 200) {
    return { type: 'check', day: m.day, key: m.key, on: m.on };
  }
  if (role !== 'host') return null;
  if (m.type === 'checks' && (m.day === null || typeof m.day === 'string') && isChecked(m.checked)) return { type: 'checks', day: m.day, checked: m.checked };
  if (m.type === 'app' && typeof m.live === 'boolean') return { type: 'app', live: m.live };
  return null;
}

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
