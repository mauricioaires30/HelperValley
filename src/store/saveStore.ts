import { create } from 'zustand';
import type { Player, SaveData, SaveSummary } from '@/save/model';
import type { AppStatus } from '@/save/appStatus';
import { parseSave } from '@/save/parse';
import { removeOldCopies } from '@/save/cache';
import {
  forgetDirectory,
  grantDirectory,
  pickDirectory,
  restoreDirectory,
  type SaveSource,
} from '@/save/sources';

const SELECTED_KEY = 'helpervalley.selectedSave';
const playerKey = (uniqueId: string) => `helpervalley.player.${uniqueId}`;
/** How often to check whether the game wrote the save (it saves when you sleep). */
const POLL_MS = 4000;

const storage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not persisted; fine.
    }
  },
};

export type SaveStatus = 'idle' | 'needs-permission' | 'listing' | 'loading' | 'ready' | 'error';

interface SaveState {
  /** Startup finished: the remembered folder and a farmhand's room had their chance to load. */
  initialized: boolean;
  status: SaveStatus;
  error: string | null;
  source: SaveSource | null;
  pendingHandle: FileSystemDirectoryHandle | null;
  summaries: SaveSummary[];
  folder: string | null;
  save: SaveData | null;
  playerId: string | null;
  /** The HelperValley app's last status, read from the connected folder. */
  app: { status: AppStatus; modified: number } | null;
  loadedAt: number | null;
  /** Set when a live folder reloads because the game wrote the save. */
  lastUpdate: { at: number; date: SaveData['date'] } | null;

  init(): Promise<void>;
  connectDirectory(): Promise<void>;
  reconnect(): Promise<void>;
  selectSave(folder: string): Promise<void>;
  selectPlayer(id: string): void;
  disconnect(): Promise<void>;
  /** Shows a save received from a multiplayer host (live share), instead of a local one. */
  showShared(save: SaveData): void;
}

let pollTimer: number | undefined;
let lastModified = 0;
let reconnecting: Promise<void> | null = null;

export const useSaveStore = create<SaveState>((setState, getState) => {
  const fail = (e: unknown) => {
    // The user closing the picker is not an error.
    if (e instanceof DOMException && e.name === 'AbortError') return;
    setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  };

  const stopPolling = () => {
    window.clearInterval(pollTimer);
    document.removeEventListener('visibilitychange', checkNow);
  };

  async function check() {
    const { source, folder } = getState();
    if (!source || !folder) return;
    void source.appStatus().then((app) => getState().source === source && setState({ app }));
    try {
      const modified = await source.modified(folder);
      if (modified > lastModified) await load(folder, true);
    } catch {
      // Folder temporarily unavailable (the game may be writing); try again next tick.
    }
  }

  // Background tabs poll slowly, so check as soon as the tab is visible again.
  function checkNow() {
    if (document.visibilityState === 'visible') void check();
  }

  const startPolling = () => {
    stopPolling();
    const { source, folder } = getState();
    if (!source || !folder) return;
    pollTimer = window.setInterval(() => void check(), POLL_MS);
    document.addEventListener('visibilitychange', checkNow);
  };

  /**
   * Browsers only re-grant folder access after a user gesture, so the first click anywhere
   * on the page asks for it. In Chrome/Edge, "Allow on every visit" makes this permanent.
   */
  const reconnectOnFirstClick = () => {
    const handler = () => {
      document.removeEventListener('pointerdown', handler, true);
      if (getState().pendingHandle) void getState().reconnect();
    };
    document.addEventListener('pointerdown', handler, true);
  };

  const rememberedPlayer = (save: SaveData) => {
    const remembered = storage.get(playerKey(save.uniqueId));
    return save.players.some((p) => p.id === remembered) ? remembered : save.players[0]?.id ?? null;
  };

  async function load(folder: string, background = false) {
    const { source } = getState();
    if (!source) return;
    if (!background) setState({ status: 'loading', folder, error: null });
    const { xml, modified } = await source.readSave(folder);
    const save = await parseSave(xml, folder);
    const loadedAt = Date.now();
    lastModified = modified;
    storage.set(SELECTED_KEY, folder);
    setState({ save, folder, playerId: rememberedPlayer(save), status: 'ready', loadedAt });
    if (background) {
      // Lets the UI announce that the game just saved (usually a new day).
      const summaries = await source.listSaves();
      setState({ lastUpdate: { at: loadedAt, date: save.date }, summaries });
    }
  }

  async function useSource(source: SaveSource) {
    stopPolling();
    setState({ source, pendingHandle: null, status: 'listing', error: null });
    const summaries = await source.listSaves();
    setState({ summaries, status: 'idle' });
    void source.appStatus().then((app) => setState({ app }));
    const remembered = storage.get(SELECTED_KEY);
    const folder = summaries.find((s) => s.folder === remembered)?.folder ?? summaries[0]?.folder ?? null;
    if (!folder) return;
    await load(folder);
    startPolling();
  }

  return {
    showShared(save: SaveData) {
      stopPolling();
      const previous = getState().save;
      const now = Date.now();
      setState({
        save,
        folder: 'shared',
        playerId: getState().save?.uniqueId === save.uniqueId ? getState().playerId : rememberedPlayer(save),
        status: 'ready',
        loadedAt: now,
        // A new day from the host shows the same "the game saved" toast as a local save.
        lastUpdate: previous && previous.uniqueId === save.uniqueId && JSON.stringify(previous.date) !== JSON.stringify(save.date) ? { at: now, date: save.date } : getState().lastUpdate,
      });
    },

    initialized: false,
    status: 'idle',
    error: null,
    source: null,
    pendingHandle: null,
    summaries: [],
    folder: null,
    save: null,
    playerId: null,
    app: null,
    loadedAt: null,
    lastUpdate: null,

    async init() {
      try {
        void removeOldCopies();
        // The folder comes back by itself with "Allow on every visit"; otherwise the first click asks.
        const restored = await restoreDirectory();
        if (!restored) return;
        if ('source' in restored) await useSource(restored.source);
        else {
          setState({ pendingHandle: restored.needsPermission, status: 'needs-permission' });
          reconnectOnFirstClick();
        }
      } catch (e) {
        fail(e);
      }
    },

    async connectDirectory() {
      try {
        await useSource(await pickDirectory());
      } catch (e) {
        fail(e);
      }
    },

    reconnect() {
      const handle = getState().pendingHandle;
      if (!handle) return Promise.resolve();
      // The page-wide first-click listener and a button can both ask; share one prompt.
      reconnecting ??= (async () => {
        try {
          const source = await grantDirectory(handle);
          if (source) await useSource(source);
        } catch (e) {
          fail(e);
        } finally {
          reconnecting = null;
        }
      })();
      return reconnecting;
    },

    async selectSave(folder) {
      try {
        if (getState().source) {
          await load(folder);
          startPolling();
        }
      } catch (e) {
        fail(e);
      }
    },

    selectPlayer(id) {
      const { save } = getState();
      if (save) storage.set(playerKey(save.uniqueId), id);
      setState({ playerId: id });
    },

    async disconnect() {
      stopPolling();
      await forgetDirectory();
      setState({ source: null, summaries: [], folder: null, save: null, playerId: null, app: null, status: 'idle', pendingHandle: null });
    },
  };
});

/** The loaded save and the currently selected player (host by default). */
export function useCurrentSave(): { save: SaveData | null; player: Player | null } {
  const save = useSaveStore((s) => s.save);
  const playerId = useSaveStore((s) => s.playerId);
  const player = save?.players.find((p) => p.id === playerId) ?? save?.players[0] ?? null;
  return { save, player };
}
