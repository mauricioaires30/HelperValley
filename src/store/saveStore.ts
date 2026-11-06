import { create } from 'zustand';
import type { Player, SaveData, SaveSummary } from '@/save/model';
import { parseSave } from '@/save/parse';
import { clearCache, readCache, writeCache } from '@/save/cache';
import {
  forgetDirectory,
  fromFiles,
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
  status: SaveStatus;
  error: string | null;
  source: SaveSource | null;
  pendingHandle: FileSystemDirectoryHandle | null;
  summaries: SaveSummary[];
  folder: string | null;
  save: SaveData | null;
  playerId: string | null;
  loadedAt: number | null;
  /** Set while showing the save cached in the browser instead of one read from disk. */
  cachedAt: number | null;
  /** Set when a live folder reloads because the game wrote the save. */
  lastUpdate: { at: number; date: SaveData['date'] } | null;

  init(): Promise<void>;
  connectDirectory(): Promise<void>;
  reconnect(): Promise<void>;
  useFiles(files: FileList | File[]): Promise<void>;
  selectSave(folder: string): Promise<void>;
  selectPlayer(id: string): void;
  disconnect(): Promise<void>;
}

let pollTimer: number | undefined;
let lastModified = 0;

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
    if (!source?.live || !folder) return;
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
    if (!source?.live || !folder) return;
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

  async function load(folder: string, background = false) {
    const { source } = getState();
    if (!source) return;
    if (!background) setState({ status: 'loading', folder, error: null });
    const { xml, modified } = await source.readSave(folder);
    lastModified = modified;
    const save = await parseSave(xml, folder);
    const remembered = storage.get(playerKey(save.uniqueId));
    const playerId = save.players.some((p) => p.id === remembered) ? remembered : save.players[0]?.id ?? null;
    storage.set(SELECTED_KEY, folder);
    const loadedAt = Date.now();
    setState({ save, folder, playerId, status: 'ready', loadedAt, cachedAt: null });
    if (background) {
      // Lets the UI announce that the game just saved (usually a new day).
      setState({ lastUpdate: { at: loadedAt, date: save.date }, summaries: await source.listSaves() });
    }
    void writeCache(save, getState().summaries, loadedAt);
  }

  async function useSource(source: SaveSource) {
    stopPolling();
    // Keep showing the cached save (if any) until the fresh one is parsed.
    setState({ source, pendingHandle: null, status: 'listing', error: null });
    const summaries = await source.listSaves();
    setState({ summaries, status: 'idle' });
    const remembered = storage.get(SELECTED_KEY);
    const folder = summaries.find((s) => s.folder === remembered)?.folder ?? (summaries.length === 1 ? summaries[0].folder : null);
    if (folder) {
      await load(folder);
      startPolling();
    }
  }

  return {
    status: 'idle',
    error: null,
    source: null,
    pendingHandle: null,
    summaries: [],
    folder: null,
    save: null,
    playerId: null,
    loadedAt: null,
    cachedAt: null,
    lastUpdate: null,

    async init() {
      try {
        // Show the last save right away; the folder (if still allowed) refreshes it below.
        const cached = await readCache();
        if (cached) {
          const remembered = storage.get(playerKey(cached.save.uniqueId));
          const playerId = cached.save.players.some((p) => p.id === remembered) ? remembered : cached.save.players[0]?.id ?? null;
          setState({
            save: cached.save,
            summaries: cached.summaries,
            folder: cached.save.folder,
            playerId,
            loadedAt: cached.loadedAt,
            cachedAt: cached.loadedAt,
            status: 'ready',
          });
        }
        const restored = await restoreDirectory();
        if (!restored) return;
        if ('source' in restored) await useSource(restored.source);
        else {
          setState({ pendingHandle: restored.needsPermission, status: cached ? 'ready' : 'needs-permission' });
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

    async reconnect() {
      const handle = getState().pendingHandle;
      if (!handle) return;
      try {
        const source = await grantDirectory(handle);
        if (source) await useSource(source);
      } catch (e) {
        fail(e);
      }
    },

    async useFiles(files) {
      try {
        await useSource(fromFiles(files));
      } catch (e) {
        fail(e);
      }
    },

    async selectSave(folder) {
      try {
        await load(folder);
        startPolling();
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
      await Promise.all([forgetDirectory(), clearCache()]);
      setState({ source: null, summaries: [], folder: null, save: null, playerId: null, status: 'idle', pendingHandle: null, cachedAt: null });
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
