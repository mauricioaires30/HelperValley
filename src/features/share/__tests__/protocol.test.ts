import { describe, expect, it } from 'vitest';
import { ChunkAssembler, CHUNK_BYTES, cleanNick, decodeChunk, encodeChunks, normalizeCode, backoff, GUEST_COLORS, HOST_COLOR, MAX_GUESTS, type Peer } from '../protocol';
import { accept, admit, applyCheck, originAllowed, pickColor } from '../roomRules';

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);

describe('save pieces', () => {
  it('splits and puts back a save, in any order', () => {
    const packed = bytes(CHUNK_BYTES * 2 + 1000);
    const frames = encodeChunks(7, packed);
    expect(frames).toHaveLength(3);
    const assembler = new ChunkAssembler();
    const chunks = frames.map((f) => decodeChunk(f)!);
    expect(assembler.add(chunks[2])).toBeNull();
    expect(assembler.add(chunks[0])).toBeNull();
    expect(assembler.add(chunks[1])).toEqual(packed);
  });

  it('keeps the newest save and ignores an older one arriving late', () => {
    const assembler = new ChunkAssembler();
    const [newer] = encodeChunks(9, bytes(10)).map((f) => decodeChunk(f)!);
    const [older] = encodeChunks(8, bytes(20)).map((f) => decodeChunk(f)!);
    expect(assembler.add(newer)).toEqual(bytes(10));
    expect(assembler.add(older)).toBeNull();
  });

  it('a new version drops the unfinished one', () => {
    const assembler = new ChunkAssembler();
    const first = encodeChunks(1, bytes(CHUNK_BYTES + 5)).map((f) => decodeChunk(f)!);
    const second = encodeChunks(2, bytes(3)).map((f) => decodeChunk(f)!);
    expect(assembler.add(first[0])).toBeNull();
    expect(assembler.add(second[0])).toEqual(bytes(3));
    expect(assembler.add(first[1])).toBeNull();
  });

  it('rejects broken frames', () => {
    expect(decodeChunk(new ArrayBuffer(4))).toBeNull();
    const frame = encodeChunks(1, bytes(4))[0];
    new DataView(frame).setUint32(4, 5);
    expect(decodeChunk(frame)).toBeNull();
  });
});

describe('codes and nicknames', () => {
  it('normalizes codes', () => {
    expect(normalizeCode('abc 123')).toBe('ABC-123');
    expect(normalizeCode('ab')).toBeNull();
  });

  it('cleans nicknames', () => {
    expect(cleanNick('  Ana   Maria ')).toBe('Ana Maria');
    expect(cleanNick('   ')).toBeNull();
    expect(cleanNick('x'.repeat(21))).toBeNull();
    expect(cleanNick('a\u0007b')).toBe('ab');
  });

  it('waits longer after each failed reconnect, up to 30 s', () => {
    expect([0, 1, 2, 10].map(backoff)).toEqual([1000, 2000, 4000, 30000]);
  });
});

describe('who may enter a room', () => {
  const host = { role: 'host', clientId: 'hostclient1', nick: 'Ana', token: 'secrettoken1', browser: 'hostbrowser1' };
  const guest = { role: 'guest', clientId: 'guestclient1', nick: 'Bia', token: null, browser: 'guestbrowser1' };
  const open = { token: 'secrettoken1', peers: [] as Peer[], hostPresent: true, locked: false, bans: [] as string[] };
  const farmhand = (n: number): Peer => ({ clientId: `farmhand${n}xx`, nick: `F${n}`, role: 'guest', color: GUEST_COLORS[n] });

  it('the first host claims the room, and only that host comes back', () => {
    expect(admit(host, { ...open, token: null })).toEqual({ peer: { clientId: 'hostclient1', nick: 'Ana', role: 'host', color: HOST_COLOR }, claim: true });
    expect(admit(host, open)).toMatchObject({ claim: false });
    expect(admit({ ...host, token: 'someoneelse1' }, open)).toEqual({ refuse: 'room-taken' });
  });

  it('guests need an opened room and a free nickname', () => {
    expect(admit(guest, { ...open, token: null })).toEqual({ refuse: 'no-room' });
    // The host left and didn't come back: the room is closed.
    expect(admit(guest, { ...open, hostPresent: false })).toEqual({ refuse: 'no-room' });
    const room = { ...open, peers: [{ clientId: 'other1234', nick: 'bia', role: 'guest' as const, color: '#e5484d' }] };
    expect(admit(guest, room)).toEqual({ refuse: 'nick-taken' });
    expect(admit({ ...guest, nick: '' }, room)).toEqual({ refuse: 'nick-invalid' });
    // The same tab reconnecting keeps its nickname and color.
    expect(admit({ ...guest, clientId: 'other1234' }, room)).toMatchObject({ peer: { nick: 'Bia', color: '#e5484d' } });
  });

  it('takes at most 7 farmhands, like the game', () => {
    const full = { ...open, peers: Array.from({ length: MAX_GUESTS }, (_, i) => farmhand(i)) };
    expect(admit(guest, full)).toEqual({ refuse: 'room-full' });
    // Someone already inside can still reconnect.
    expect(admit({ ...guest, clientId: 'farmhand0xx', nick: 'F0' }, full)).toMatchObject({ peer: { nick: 'F0' } });
  });

  it('a locked room takes nobody new, and a banned browser never', () => {
    expect(admit(guest, { ...open, locked: true })).toEqual({ refuse: 'locked' });
    expect(admit({ ...guest, clientId: 'farmhand1xx' }, { ...open, locked: true, peers: [farmhand(1)] })).toMatchObject({ peer: { clientId: 'farmhand1xx' } });
    expect(admit(guest, { ...open, bans: ['guestbrowser1'] })).toEqual({ refuse: 'banned' });
    // Another tab of the banned browser too.
    expect(admit({ ...guest, clientId: 'newtab12345' }, { ...open, bans: ['guestbrowser1'] })).toEqual({ refuse: 'banned' });
  });

  it('gives each farmhand a color nobody else has', () => {
    const peers = GUEST_COLORS.slice(0, -1).map((color, i) => ({ ...farmhand(i), color }));
    expect(pickColor(peers, () => 0)).toBe(GUEST_COLORS[GUEST_COLORS.length - 1]);
    expect(GUEST_COLORS).not.toContain(HOST_COLOR);
  });

  it('refuses malformed requests', () => {
    expect(admit({ ...guest, role: 'admin' }, open)).toEqual({ refuse: 'bad-request' });
    expect(admit({ ...guest, clientId: 'x' }, open)).toEqual({ refuse: 'bad-request' });
  });
});

describe('what each one may send', () => {
  it('guests can only mark the list; the host can also send the whole list and the app status', () => {
    const check = JSON.stringify({ type: 'check', day: 'd', key: 'farm:water', on: true });
    const all = JSON.stringify({ type: 'checks', day: 'd', checked: { a: true } });
    const app = JSON.stringify({ type: 'app', live: true });
    expect(accept('guest', check)).toEqual({ type: 'check', day: 'd', key: 'farm:water', on: true });
    expect(accept('guest', all)).toBeNull();
    expect(accept('guest', app)).toBeNull();
    expect(accept('host', all)).toEqual({ type: 'checks', day: 'd', checked: { a: true } });
    expect(accept('host', app)).toEqual({ type: 'app', live: true });
    expect(accept('host', 'not json')).toBeNull();
  });

  it('everyone can say where they are and move a cursor; only the host can close the room', () => {
    expect(accept('guest', JSON.stringify({ type: 'route', route: '/map' }))).toEqual({ type: 'route', route: '/map' });
    expect(accept('guest', JSON.stringify({ type: 'route', route: 'javascript:alert(1)' }))).toBeNull();
    expect(accept('guest', JSON.stringify({ type: 'cur', a: 'map', x: 0.123456, y: 0.5 }))).toEqual({ type: 'cur', a: 'map', x: 0.1235, y: 0.5 });
    expect(accept('guest', JSON.stringify({ type: 'cur', a: 'main', x: 0.5, y: 1200 }))).toEqual({ type: 'cur', a: 'main', x: 0.5, y: 1200 });
    expect(accept('guest', JSON.stringify({ type: 'cur', a: 'map', x: 9, y: 0 }))).toBeNull();
    expect(accept('guest', JSON.stringify({ type: 'cur', hide: true }))).toEqual({ type: 'cur', hide: true });
    expect(accept('guest', JSON.stringify({ type: 'close' }))).toBeNull();
    expect(accept('host', JSON.stringify({ type: 'close' }))).toEqual({ type: 'close' });
  });

  it('only the host can kick, ban, unban and lock', () => {
    const kick = JSON.stringify({ type: 'kick', clientId: 'guestclient1' });
    expect(accept('guest', kick)).toBeNull();
    expect(accept('host', kick)).toEqual({ type: 'kick', clientId: 'guestclient1' });
    expect(accept('host', JSON.stringify({ type: 'ban', clientId: 'guestclient1' }))).toEqual({ type: 'ban', clientId: 'guestclient1' });
    expect(accept('host', JSON.stringify({ type: 'unban', browser: 'guestbrowser1' }))).toEqual({ type: 'unban', browser: 'guestbrowser1' });
    expect(accept('host', JSON.stringify({ type: 'lock', locked: true }))).toEqual({ type: 'lock', locked: true });
    expect(accept('host', JSON.stringify({ type: 'kick', clientId: '../x' }))).toBeNull();
  });

  it('applies a mark only to the same day', () => {
    expect(applyCheck({ day: 'd', checked: {} }, 'd', 'k', true)).toEqual({ day: 'd', checked: { k: true } });
    expect(applyCheck({ day: 'd', checked: { k: true } }, 'd', 'k', false)).toEqual({ day: 'd', checked: {} });
    expect(applyCheck({ day: 'd', checked: {} }, 'other', 'k', true)).toBeNull();
  });

  it('lets in only the site and local development', () => {
    const allowed = ['https://mauricioaires30.github.io'];
    expect(originAllowed('https://mauricioaires30.github.io', allowed)).toBe(true);
    expect(originAllowed('http://localhost:5173', allowed)).toBe(true);
    expect(originAllowed('https://evil.example', allowed)).toBe(false);
    expect(originAllowed(null, allowed)).toBe(false);
  });
});
