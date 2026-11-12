import { describe, expect, it } from 'vitest';
import { ChunkAssembler, CHUNK_BYTES, cleanNick, decodeChunk, encodeChunks, normalizeCode, backoff } from '../protocol';
import { accept, admit, applyCheck, originAllowed } from '../roomRules';

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
  const host = { role: 'host', clientId: 'hostclient1', nick: 'Ana', token: 'secrettoken1' };
  const guest = { role: 'guest', clientId: 'guestclient1', nick: 'Bia', token: null };

  it('the first host claims the room, and only that host comes back', () => {
    expect(admit(host, { token: null, peers: [], hostPresent: true })).toEqual({ peer: { clientId: 'hostclient1', nick: 'Ana', role: 'host' }, claim: true });
    expect(admit(host, { token: 'secrettoken1', peers: [], hostPresent: true })).toMatchObject({ claim: false });
    expect(admit({ ...host, token: 'someoneelse1' }, { token: 'secrettoken1', peers: [], hostPresent: true })).toEqual({ refuse: 'room-taken' });
  });

  it('guests need an opened room and a free nickname', () => {
    expect(admit(guest, { token: null, peers: [], hostPresent: true })).toEqual({ refuse: 'no-room' });
    // The host left and didn't come back: the room is closed.
    expect(admit(guest, { token: 'secrettoken1', peers: [], hostPresent: false })).toEqual({ refuse: 'no-room' });
    const room = { token: 'secrettoken1', peers: [{ clientId: 'other1234', nick: 'bia', role: 'guest' as const }], hostPresent: true };
    expect(admit(guest, room)).toEqual({ refuse: 'nick-taken' });
    expect(admit({ ...guest, nick: '' }, room)).toEqual({ refuse: 'nick-invalid' });
    // The same browser reconnecting keeps its nickname.
    expect(admit({ ...guest, clientId: 'other1234' }, room)).toMatchObject({ peer: { nick: 'Bia' } });
  });

  it('refuses malformed requests', () => {
    expect(admit({ ...guest, role: 'admin' }, { token: 't', peers: [], hostPresent: true })).toEqual({ refuse: 'bad-request' });
    expect(admit({ ...guest, clientId: 'x' }, { token: 't', peers: [], hostPresent: true })).toEqual({ refuse: 'bad-request' });
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
