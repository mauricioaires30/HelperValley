import Peer, { type DataConnection } from 'peerjs';
import { create } from 'zustand';
import type { SaveData } from '@/save/model';
import { useSaveStore } from '@/store/saveStore';

/**
 * Live multiplayer share: the host's browser sends its parsed save to the farmhands' browsers
 * over WebRTC (PeerJS). PeerJS's free public server only introduces the browsers; the save goes
 * browser to browser. It works while the host has the site open.
 */

const PREFIX = 'helpervalley-live-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** The host's code is kept for next time (friends can reuse it); being in a room is per tab. */
const CODE_KEY = 'hv-share-code';
const HOST_KEY = 'hv-share-host';
const GUEST_KEY = 'hv-share-guest';

type Status = 'idle' | 'starting' | 'hosting' | 'joining' | 'joined' | 'hostAway' | 'error';

interface ShareState {
  status: Status;
  role: 'host' | 'guest' | null;
  code: string | null;
  /** Farmhands connected to this host. */
  peers: number;
  error: string | null;
  host(): void;
  join(code: string): void;
  stop(): void;
}

const newCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('').replace(/^(.{3})/, '$1-');
/** "abc 123" / "ABC-123" → "ABC-123". */
export const normalizeCode = (code: string) => {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length === 6 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : null;
};

const remember = (key: string, value: string | null) => {
  const store = key === CODE_KEY ? localStorage : sessionStorage;
  try {
    if (value) store.setItem(key, value);
    else store.removeItem(key);
  } catch {
    // not remembered
  }
};
const recall = (key: string) => {
  try {
    return (key === CODE_KEY ? localStorage : sessionStorage).getItem(key);
  } catch {
    return null;
  }
};

/** The save travels gzipped: a few MB of JSON become a few hundred KB. */
async function pack(save: SaveData): Promise<ArrayBuffer> {
  const stream = new Blob([JSON.stringify(save)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}
async function unpack(data: ArrayBuffer | Uint8Array): Promise<SaveData> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as SaveData;
}

let peer: Peer | null = null;
const connections = new Set<DataConnection>();
let unsubscribe: (() => void) | null = null;

export const useShareStore = create<ShareState>((set, get) => {
  const teardown = () => {
    unsubscribe?.();
    unsubscribe = null;
    for (const c of connections) c.close();
    connections.clear();
    peer?.destroy();
    peer = null;
  };

  const sendTo = async (conns: Iterable<DataConnection>) => {
    const save = useSaveStore.getState().save;
    if (!save || save.uniqueId === undefined) return;
    const data = await pack(save);
    for (const c of conns) if (c.open) c.send({ type: 'save', data });
  };

  const startHost = (code: string, retries = 3) => {
    teardown();
    set({ status: 'starting', role: 'host', code, error: null, peers: 0 });
    peer = new Peer(PREFIX + code);
    peer.on('open', () => {
      set({ status: 'hosting' });
      remember(HOST_KEY, code);
      remember(CODE_KEY, code);
      // Every new save (the game saved, another player chosen...) goes to everyone connected.
      let last = useSaveStore.getState().save;
      unsubscribe = useSaveStore.subscribe((s) => {
        if (s.save && s.save !== last) {
          last = s.save;
          void sendTo(connections);
        }
      });
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        connections.add(conn);
        set({ peers: connections.size });
        void sendTo([conn]);
      });
      conn.on('close', () => {
        connections.delete(conn);
        set({ peers: connections.size });
      });
    });
    peer.on('error', (e) => {
      // Someone else already uses this code: pick another one.
      if ((e as { type?: string }).type === 'unavailable-id' && retries > 0) startHost(newCode(), retries - 1);
      else set({ status: 'error', error: String((e as Error).message ?? e) });
    });
  };

  const startGuest = (code: string) => {
    teardown();
    set({ status: 'joining', role: 'guest', code, error: null });
    peer = new Peer();
    peer.on('open', () => {
      const conn = peer!.connect(PREFIX + code, { reliable: true });
      conn.on('open', () => {
        set({ status: 'joined' });
        remember(GUEST_KEY, code);
      });
      conn.on('data', (msg) => {
        const m = msg as { type?: string; data?: ArrayBuffer | Uint8Array };
        if (m.type === 'save' && m.data) void unpack(m.data).then((save) => useSaveStore.getState().showShared(save));
      });
      conn.on('close', () => set({ status: 'hostAway' }));
    });
    peer.on('error', (e) => {
      const type = (e as { type?: string }).type;
      // The host isn't online (yet): keep the last copy and say so.
      set({ status: type === 'peer-unavailable' ? 'hostAway' : 'error', error: String((e as Error).message ?? e) });
    });
  };

  return {
    status: 'idle',
    role: null,
    code: null,
    peers: 0,
    error: null,
    host() {
      startHost(recall(CODE_KEY) ?? newCode());
    },
    join(code: string) {
      const clean = normalizeCode(code);
      if (!clean) return set({ status: 'error', error: 'code' });
      startGuest(clean);
    },
    stop() {
      const wasGuest = get().role === 'guest';
      teardown();
      remember(HOST_KEY, null);
      remember(GUEST_KEY, null);
      set({ status: 'idle', role: null, code: null, peers: 0, error: null });
      // Back to this player's own saves.
      if (wasGuest) void useSaveStore.getState().init();
    },
  };
});

/** After a reload, rejoin the room this browser was in (host or guest). */
export function resumeShare() {
  const guest = recall(GUEST_KEY);
  if (guest) return useShareStore.getState().join(guest);
  if (recall(HOST_KEY)) {
    // Wait for the local save before sharing it.
    const stop = useSaveStore.subscribe((s) => {
      if (s.save) {
        stop();
        useShareStore.getState().host();
      }
    });
  }
}
