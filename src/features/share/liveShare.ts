import Peer, { type DataConnection } from 'peerjs';
import { create } from 'zustand';
import type { SaveData } from '@/save/model';
import { useSaveStore } from '@/store/saveStore';
import { isAppLive } from '@/save/appStatus';
import { onLocalCheck, useChecks, type CheckMessage } from '@/features/today/checks';

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
  /** For farmhands: the host's HelperValley app is running and copying. */
  hostApp: boolean;
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
/** Farmhands ping every few seconds; a closed tab often never closes its connection, so silence means gone. */
const PING_MS = 4000;
const GONE_MS = 13000;
const lastSeen = new Map<DataConnection, number>();
let timer: number | null = null;
let timerApp: number | null = null;

// The Today list follows the save on screen, and a mark made here goes to the room:
// a farmhand tells the host, the host tells everyone.
const followDay = (save: SaveData | null) => {
  if (save) useChecks.getState().syncDay(save.uniqueId, save.date);
};
followDay(useSaveStore.getState().save);
useSaveStore.subscribe((s) => followDay(s.save));
onLocalCheck((message) => {
  for (const c of connections) if (c.open) c.send(message);
});

// Closing or leaving the page: say goodbye so the other side doesn't wait for a timeout.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const c of connections) if (c.open) c.send({ type: 'bye' });
    peer?.destroy();
  });
}

export const useShareStore = create<ShareState>((set, get) => {
  const teardown = () => {
    unsubscribe?.();
    unsubscribe = null;
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    if (timerApp !== null) window.clearInterval(timerApp);
    timerApp = null;
    lastSeen.clear();
    for (const c of connections) c.close();
    connections.clear();
    peer?.destroy();
    peer = null;
  };

  const sendTo = async (conns: Iterable<DataConnection>) => {
    const save = useSaveStore.getState().save;
    if (!save || save.uniqueId === undefined) return;
    const data = await pack(save);
    const { day, checked } = useChecks.getState();
    for (const c of conns) {
      if (!c.open) continue;
      c.send({ type: 'save', data });
      c.send({ type: 'checks', day, checked });
      c.send({ type: 'app', live: hostAppLive() });
    }
  };

  /** The host's own app status, as farmhands should see it. */
  const hostAppLive = () => {
    const app = useSaveStore.getState().app;
    return app ? isAppLive(app.status, app.modified, Date.now()) : false;
  };
  let lastApp: boolean | null = null;
  const tellApp = () => {
    const live = hostAppLive();
    if (live === lastApp) return;
    lastApp = live;
    for (const c of connections) if (c.open) c.send({ type: 'app', live });
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
      lastApp = null;
      timerApp = window.setInterval(tellApp, 5_000);
      unsubscribe = useSaveStore.subscribe((s) => {
        if (s.save && s.save !== last) {
          last = s.save;
          void sendTo(connections);
        }
      });
    });
    const drop = (conn: DataConnection) => {
      if (!connections.delete(conn)) return;
      lastSeen.delete(conn);
      conn.close();
      set({ peers: connections.size });
    };
    timer = window.setInterval(() => {
      const now = Date.now();
      for (const c of connections) if (now - (lastSeen.get(c) ?? now) > GONE_MS) drop(c);
    }, PING_MS);
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        connections.add(conn);
        lastSeen.set(conn, Date.now());
        set({ peers: connections.size });
        void sendTo([conn]);
        // The browser noticed the other side vanished.
        conn.peerConnection?.addEventListener('iceconnectionstatechange', () => {
          if (['disconnected', 'failed', 'closed'].includes(conn.peerConnection.iceConnectionState)) drop(conn);
        });
      });
      conn.on('data', (msg) => {
        const m = msg as { type?: string } & Partial<Omit<CheckMessage, 'type'>>;
        if (m.type === 'bye') return drop(conn);
        lastSeen.set(conn, Date.now());
        // A farmhand's mark: keep it and pass it on to the others.
        if (m.type === 'check' && useChecks.getState().apply(m.day!, m.key!, m.on!)) {
          for (const c of connections) if (c !== conn && c.open) c.send(msg);
        }
      });
      conn.on('close', () => drop(conn));
      conn.on('error', () => drop(conn));
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
        connections.add(conn);
        set({ status: 'joined' });
        remember(GUEST_KEY, code);
        timer = window.setInterval(() => conn.open && conn.send({ type: 'ping' }), PING_MS);
      });
      conn.on('data', (msg) => {
        const m = msg as { type?: string; data?: ArrayBuffer | Uint8Array; day?: string; checked?: Record<string, true> } & Partial<Omit<CheckMessage, 'type' | 'day'>>;
        if (m.type === 'save' && m.data) void unpack(m.data).then((save) => useSaveStore.getState().showShared(save));
        else if (m.type === 'bye') set({ status: 'hostAway' });
        else if (m.type === 'check') useChecks.getState().apply(m.day!, m.key!, m.on!);
        else if (m.type === 'checks' && m.day) useChecks.getState().adopt(m.day, m.checked ?? {});
        else if (m.type === 'app') set({ hostApp: (m as { live?: boolean }).live === true });
      });
      conn.on('close', () => {
        connections.delete(conn);
        set({ status: 'hostAway', hostApp: false });
      });
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
    hostApp: false,
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
      set({ status: 'idle', role: null, code: null, peers: 0, hostApp: false, error: null });
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
