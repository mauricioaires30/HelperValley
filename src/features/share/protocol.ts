/**
 * The multiplayer room protocol, shared by the site and the relay server (worker/).
 *
 * Text frames are JSON messages; binary frames are pieces of the host's save (gzipped JSON),
 * each with a 12-byte header: version, piece index, piece count (unsigned 32-bit, big-endian).
 * The plain text "ping" is answered "pong" by the server without waking the room.
 */

export const PING = 'ping';
export const PONG = 'pong';
/** Save pieces stay well under the WebSocket message limit. */
export const CHUNK_BYTES = 256 * 1024;
const HEADER = 12;

export type Role = 'host' | 'guest';

export interface Peer {
  clientId: string;
  nick: string;
  role: Role;
  /** The page they're on, like "/map". */
  route?: string;
}

export type Checks = { day: string | null; checked: Record<string, true> };

/**
 * Why the server refused or ended a connection (sent as the close reason, code 4000).
 * "host-left" (code 4002) closes the room for the farmhands once the host is gone.
 */
export type Refusal = 'nick-taken' | 'nick-invalid' | 'room-taken' | 'no-room' | 'bad-request' | 'origin' | 'host-left';
export const CLOSE_REFUSED = 4000;
export const CLOSE_REPLACED = 4001;
export const CLOSE_HOST_LEFT = 4002;
/** A host who drops without "stop sharing" (reload, network) has this long to come back before the room closes. */
export const HOST_GRACE_MS = 45_000;

/** A mouse position: `a` is what it's relative to (the page, or a part of it like the map), x/y are fractions. */
export type Cursor = { a: string; x: number; y: number };

/** Server → client. */
export type ServerMessage =
  | { type: 'welcome'; you: Peer; peers: Peer[]; hostOnline: boolean; checks: Checks; app: boolean }
  | { type: 'peer'; peer: Peer; online: boolean }
  | { type: 'host'; online: boolean }
  | { type: 'check'; day: string; key: string; on: boolean }
  | { type: 'checks'; day: string | null; checked: Record<string, true> }
  | { type: 'app'; live: boolean }
  | { type: 'route'; clientId: string; route: string }
  | ({ type: 'cur'; clientId: string } & (Cursor | { hide: true }));

/** Client → server. Only the host may send checks (the whole list), app and close. */
export type ClientMessage =
  | { type: 'check'; day: string; key: string; on: boolean }
  | { type: 'checks'; day: string | null; checked: Record<string, true> }
  | { type: 'app'; live: boolean }
  | { type: 'route'; route: string }
  | ({ type: 'cur' } & (Cursor | { hide: true }))
  | { type: 'close' };

/** Cursors go out at most this often (12 per second). */
export const CURSOR_MS = 1000 / 12;
/** A cursor that hasn't moved for this long is hidden. */
export const CURSOR_IDLE_MS = 6000;

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const newCode = (random: () => number = Math.random) =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)])
    .join('')
    .replace(/^(.{3})/, '$1-');

/** "abc 123" / "ABC-123" → "ABC-123"; null when it can't be a code. */
export const normalizeCode = (code: string) => {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length === 6 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : null;
};

export const NICK_MAX = 20;

/** Trimmed, single spaces, no control characters; null when empty or too long. */
export function cleanNick(nick: string): string | null {
  // eslint-disable-next-line no-control-regex
  const clean = nick.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return clean.length >= 1 && [...clean].length <= NICK_MAX ? clean : null;
}

/** Nicknames are unique in a room regardless of case. */
export const sameNick = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** A random id for this browser, also used as the host's room token. */
export const randomId = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export interface Chunk {
  version: number;
  index: number;
  total: number;
  data: Uint8Array;
}

/** Splits the packed save into binary frames. */
export function encodeChunks(version: number, packed: Uint8Array): ArrayBuffer[] {
  const total = Math.max(1, Math.ceil(packed.byteLength / CHUNK_BYTES));
  return Array.from({ length: total }, (_, index) => {
    const part = packed.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    const frame = new ArrayBuffer(HEADER + part.byteLength);
    const view = new DataView(frame);
    view.setUint32(0, version >>> 0);
    view.setUint32(4, index);
    view.setUint32(8, total);
    new Uint8Array(frame, HEADER).set(part);
    return frame;
  });
}

export function decodeChunk(frame: ArrayBuffer): Chunk | null {
  if (frame.byteLength < HEADER) return null;
  const view = new DataView(frame);
  const chunk = { version: view.getUint32(0), index: view.getUint32(4), total: view.getUint32(8), data: new Uint8Array(frame, HEADER) };
  return chunk.total >= 1 && chunk.total <= 400 && chunk.index < chunk.total ? chunk : null;
}

/** Collects pieces until the newest version is complete. */
export class ChunkAssembler {
  private version = -1;
  private parts: Uint8Array[] = [];
  private received = 0;

  /** The whole packed save once its last piece arrives; older versions are dropped. */
  add(chunk: Chunk): Uint8Array | null {
    if (chunk.version < this.version) return null;
    if (chunk.version > this.version) {
      this.version = chunk.version;
      this.parts = new Array<Uint8Array>(chunk.total);
      this.received = 0;
    }
    if (chunk.total !== this.parts.length || this.parts[chunk.index]) return null;
    this.parts[chunk.index] = chunk.data.slice();
    this.received += 1;
    if (this.received < chunk.total) return null;
    const size = this.parts.reduce((sum, p) => sum + p.byteLength, 0);
    const whole = new Uint8Array(size);
    let at = 0;
    for (const p of this.parts) {
      whole.set(p, at);
      at += p.byteLength;
    }
    return whole;
  }
}

/** Save versions: seconds since 2020, so a reloaded host still sends newer numbers. */
export const saveVersion = (now = Date.now()) => Math.floor((now - Date.UTC(2020, 0, 1)) / 1000);

/** Waits between reconnect attempts: 1 s, 2 s, 4 s… up to 30 s. */
export const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
