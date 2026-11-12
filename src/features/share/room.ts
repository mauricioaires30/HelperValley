import { create } from 'zustand';
import type { SaveData } from '@/save/model';
import { useSaveStore } from '@/store/saveStore';
import { isAppLive } from '@/save/appStatus';
import { onLocalCheck, useChecks } from '@/features/today/checks';
import {
  backoff,
  ChunkAssembler,
  cleanNick,
  decodeChunk,
  encodeChunks,
  newCode,
  normalizeCode,
  PING,
  PONG,
  randomId,
  saveVersion,
  type Peer,
  type Refusal,
  type ServerMessage,
} from './protocol';

/**
 * Live multiplayer through HelperValley's relay (worker/, on Cloudflare). The host's browser sends its
 * parsed save to the room; the server keeps the latest one and passes it to every farmhand, on any network.
 * Farmhands join with the room code and a nickname, and only ever see the host's save.
 */

const RELAY = (import.meta.env.VITE_RELAY_URL as string | undefined) ?? (import.meta.env.DEV ? 'http://localhost:8787' : '');
export const relayAvailable = () => !!RELAY;

/** The host's code is kept for next time (friends can reuse it); being in a room is per tab. */
const CODE_KEY = 'hv-share-code';
const HOST_KEY = 'hv-share-host';
const GUEST_KEY = 'hv-share-guest';
const CLIENT_KEY = 'hv-client-id';
const NICK_KEY = 'hv-nick';
const tokenKey = (code: string) => `hv-room-token:${code}`;
const PING_MS = 20_000;

type Status = 'idle' | 'starting' | 'hosting' | 'joining' | 'joined' | 'hostAway' | 'reconnecting' | 'error';
export type ShareError = Refusal | 'replaced' | 'code' | 'nick' | 'unavailable' | null;

interface ShareState {
  status: Status;
  role: 'host' | 'guest' | null;
  code: string | null;
  /** Farmhands in the room. */
  peers: number;
  /** Everyone in the room, this browser included. */
  people: Peer[];
  /** For farmhands: the host's HelperValley app is running and copying. */
  hostApp: boolean;
  error: ShareError;
  host(): void;
  join(code: string, nick: string): void;
  stop(): void;
}

// Per tab: being in a room, and who this tab is (two tabs can be host and farmhand; a reload keeps both).
const store = (key: string) => (key === HOST_KEY || key === GUEST_KEY || key === CLIENT_KEY ? sessionStorage : localStorage);
export const remember = (key: string, value: string | null) => {
  try {
    if (value) store(key).setItem(key, value);
    else store(key).removeItem(key);
  } catch {
    // not remembered
  }
};
export const recall = (key: string) => {
  try {
    return store(key).getItem(key);
  } catch {
    return null;
  }
};

const clientId = () => {
  const known = recall(CLIENT_KEY);
  if (known) return known;
  const id = randomId();
  remember(CLIENT_KEY, id);
  return id;
};

export const savedNick = () => recall(NICK_KEY) ?? '';

/** The save travels gzipped: a few MB of JSON become a few hundred KB. */
async function pack(save: SaveData): Promise<Uint8Array> {
  const stream = new Blob([JSON.stringify(save)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unpack(data: Uint8Array): Promise<SaveData> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as SaveData;
}

let socket: WebSocket | null = null;
let pingTimer: number | null = null;
let appTimer: number | null = null;
let retryTimer: number | null = null;
let attempt = 0;
let unsubscribeSave: (() => void) | null = null;
let assembler = new ChunkAssembler();

// The Today list follows the save on screen, and a mark made here goes to the room.
const followDay = (save: SaveData | null) => {
  if (save) useChecks.getState().syncDay(save.uniqueId, save.date);
};
followDay(useSaveStore.getState().save);
useSaveStore.subscribe((s) => followDay(s.save));
onLocalCheck((message) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
});

// Leaving the page: close now so the others see it at once.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => socket?.close(1000, 'bye'));
}

export const useShareStore = create<ShareState>((set, get) => {
  const hostAppLive = () => {
    const app = useSaveStore.getState().app;
    return app ? isAppLive(app.status, app.modified, Date.now()) : false;
  };

  const send = (message: object) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const sendSave = async () => {
    const save = useSaveStore.getState().save;
    if (!save || useSaveStore.getState().folder === 'shared') return;
    const frames = encodeChunks(saveVersion(), await pack(save));
    for (const frame of frames) if (socket?.readyState === WebSocket.OPEN) socket.send(frame);
    const { day, checked } = useChecks.getState();
    send({ type: 'checks', day, checked });
  };

  let lastApp: boolean | null = null;
  const tellApp = (force = false) => {
    const live = hostAppLive();
    if (!force && live === lastApp) return;
    lastApp = live;
    send({ type: 'app', live });
  };

  const teardown = () => {
    if (pingTimer !== null) window.clearInterval(pingTimer);
    if (appTimer !== null) window.clearInterval(appTimer);
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    pingTimer = appTimer = retryTimer = null;
    unsubscribeSave?.();
    unsubscribeSave = null;
    const old = socket;
    socket = null;
    old?.close(1000, 'bye');
  };

  const onMessage = (m: ServerMessage) => {
    const { role } = get();
    if (m.type === 'welcome') {
      attempt = 0;
      set({ people: [m.you, ...m.peers], peers: m.peers.filter((p) => p.role === 'guest').length });
      if (role === 'host') {
        set({ status: 'hosting', error: null });
        lastApp = null;
        void sendSave();
        tellApp(true);
      } else {
        set({ status: m.hostOnline ? 'joined' : 'hostAway', hostApp: m.app, error: null });
        if (m.checks.day) useChecks.getState().adopt(m.checks.day, m.checks.checked);
      }
    } else if (m.type === 'peer') {
      const people = get().people.filter((p) => p.clientId !== m.peer.clientId);
      if (m.online) people.push(m.peer);
      set({ people, peers: people.filter((p) => p.role === 'guest').length });
    } else if (m.type === 'host') {
      set({ status: m.online ? 'joined' : 'hostAway', ...(m.online ? {} : { hostApp: false }) });
    } else if (m.type === 'check') {
      useChecks.getState().apply(m.day, m.key, m.on);
    } else if (m.type === 'checks') {
      if (m.day) useChecks.getState().adopt(m.day, m.checked);
    } else if (m.type === 'app') {
      set({ hostApp: m.live });
    }
  };

  const connect = (role: 'host' | 'guest', code: string, nick: string, retries = 3) => {
    teardown();
    assembler = new ChunkAssembler();
    const params = new URLSearchParams({ role, clientId: clientId(), nick });
    if (role === 'host') {
      let token = recall(tokenKey(code));
      if (!token) {
        token = randomId();
        remember(tokenKey(code), token);
      }
      params.set('token', token);
    }
    const ws = new WebSocket(`${RELAY.replace(/^http/, 'ws')}/rooms/${code}/ws?${params}`);
    ws.binaryType = 'arraybuffer';
    socket = ws;

    ws.onopen = () => {
      pingTimer = window.setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(PING), PING_MS);
      if (role === 'host') {
        remember(HOST_KEY, code);
        remember(CODE_KEY, code);
        // Every new save (the game saved, another farm opened...) goes to the room.
        let last = useSaveStore.getState().save;
        unsubscribeSave = useSaveStore.subscribe((s) => {
          if (s.save && s.save !== last) {
            last = s.save;
            void sendSave();
          }
        });
        appTimer = window.setInterval(() => tellApp(), 5_000);
      } else {
        remember(GUEST_KEY, code);
      }
    };

    ws.onmessage = (event) => {
      if (socket !== ws) return;
      if (typeof event.data === 'string') {
        if (event.data === PONG) return;
        try {
          onMessage(JSON.parse(event.data) as ServerMessage);
        } catch {
          // Not ours.
        }
        return;
      }
      const chunk = decodeChunk(event.data as ArrayBuffer);
      const whole = chunk && assembler.add(chunk);
      if (whole) void unpack(whole).then((save) => socket === ws && useSaveStore.getState().showShared(save));
    };

    ws.onclose = (event) => {
      if (socket !== ws) return; // Closed on purpose (left, or replaced by a new connection).
      socket = null;
      if (pingTimer !== null) window.clearInterval(pingTimer);
      if (appTimer !== null) window.clearInterval(appTimer);
      pingTimer = appTimer = null;
      unsubscribeSave?.();
      unsubscribeSave = null;
      const reason = event.reason as Refusal | 'replaced';
      if (event.code === 4000 && reason === 'room-taken' && role === 'host' && retries > 0) {
        // Someone else owns this code: pick another one.
        const fresh = newCode();
        set({ code: fresh });
        return connect(role, fresh, nick, retries - 1);
      }
      if (event.code === 4000 || event.code === 4001) {
        remember(role === 'host' ? HOST_KEY : GUEST_KEY, null);
        return set({ status: 'error', error: reason, people: [], peers: 0, hostApp: false });
      }
      // The network dropped or the server restarted: try again, waiting longer each time.
      set({ status: 'reconnecting', hostApp: false });
      retryTimer = window.setTimeout(() => connect(role, code, nick), backoff(attempt++));
    };
  };

  return {
    status: 'idle',
    role: null,
    code: null,
    peers: 0,
    people: [],
    hostApp: false,
    error: null,
    host() {
      if (!relayAvailable()) return set({ status: 'error', error: 'unavailable' });
      const { save, playerId } = useSaveStore.getState();
      const nick = cleanNick(save?.players.find((p) => p.id === playerId)?.name ?? save?.players[0]?.name ?? '') ?? 'Host';
      const code = recall(CODE_KEY) ?? newCode();
      attempt = 0;
      set({ status: 'starting', role: 'host', code, error: null, peers: 0, people: [] });
      connect('host', code, nick);
    },
    join(rawCode, rawNick) {
      if (!relayAvailable()) return set({ status: 'error', error: 'unavailable' });
      const code = normalizeCode(rawCode);
      if (!code) return set({ status: 'error', error: 'code' });
      const nick = cleanNick(rawNick);
      if (!nick) return set({ status: 'error', error: 'nick' });
      remember(NICK_KEY, nick);
      attempt = 0;
      set({ status: 'joining', role: 'guest', code, error: null, people: [] });
      connect('guest', code, nick);
    },
    stop() {
      const wasGuest = get().role === 'guest';
      teardown();
      remember(HOST_KEY, null);
      remember(GUEST_KEY, null);
      set({ status: 'idle', role: null, code: null, peers: 0, people: [], hostApp: false, error: null });
      // Back to this player's own saves.
      if (wasGuest) void useSaveStore.getState().init();
    },
  };
});

/** After a reload, rejoin the room this tab was in (host or guest). */
export function resumeShare() {
  const guest = recall(GUEST_KEY);
  if (guest) return useShareStore.getState().join(guest, savedNick());
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
