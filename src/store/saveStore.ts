import { create } from 'zustand';
import type { Player, SaveData, SaveSummary } from '@/save/model';
import { parseSave } from '@/save/parse';
import { clearCache, readIndex, readSave as readCachedSave, writeSave, writeSummaries } from '@/save/cache';
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
  /** Startup finished: the cached save and a farmhand's room had their chance to load. */
  initialized: boolean;
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
  /** Folders with a parsed copy in the browser → when it was read. */
  cachedFolders: Record<string, number>;
  /** Set when a live folder reloads because the game wrote the save. */
  lastUpdate: { at: number; date: SaveData['date'] } | null;

  init(): Promise<void>;
  connectDirectory(): Promise<void>;
  reconnect(): Promise<void>;
  useFiles(files: FileList | File[]): Promise<void>;
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

  const rememberedPlayer = (save: SaveData) => {
    const remembered = storage.get(playerKey(save.uniqueId));
    return save.players.some((p) => p.id === remembered) ? remembered : save.players[0]?.id ?? null;
  };

  /** Reads and parses a save from the connected source, then caches it. */
  async function parseFromSource(source: SaveSource, folder: string) {
    const { xml, modified } = await source.readSave(folder);
    const save = await parseSave(xml, folder);
    const loadedAt = Date.now();
    await writeSave(save, xml, getState().summaries, loadedAt);
    setState((s) => ({ cachedFolders: { ...s.cachedFolders, [folder]: loadedAt } }));
    return { save, modified, loadedAt };
  }

  async function load(folder: string, background = false) {
    const { source } = getState();
    if (!source) return;
    if (!background) setState({ status: 'loading', folder, error: null });
    const { save, modified, loadedAt } = await parseFromSource(source, folder);
    lastModified = modified;
    storage.set(SELECTED_KEY, folder);
    setState({ save, folder, playerId: rememberedPlayer(save), status: 'ready', loadedAt, cachedAt: null });
    if (background) {
      // Lets the UI announce that the game just saved (usually a new day).
      const summaries = await source.listSaves();
      setState({ lastUpdate: { at: loadedAt, date: save.date }, summaries });
      void writeSummaries(summaries);
    }
  }

  /** Shows a save from the browser cache (no folder access needed). */
  async function loadCached(folder: string) {
    const cached = await readCachedSave(folder);
    if (!cached) return false;
    let save: SaveData;
    if ('save' in cached) save = cached.save;
    else {
      // Saved by an older version of the site: parse the stored file again.
      save = await parseSave(cached.xml, folder);
      await writeSave(save, null, getState().summaries, getState().cachedFolders[folder] ?? Date.now());
    }
    storage.set(SELECTED_KEY, folder);
    const at = getState().cachedFolders[folder] ?? Date.now();
    setState({ save, folder, playerId: rememberedPlayer(save), status: 'ready', loadedAt: at, cachedAt: at });
    return true;
  }

  async function useSource(source: SaveSource) {
    stopPolling();
    // Keep showing the cached save (if any) until the fresh one is parsed.
    setState({ source, pendingHandle: null, status: 'listing', error: null });
    const summaries = await source.listSaves();
    setState({ summaries, status: 'idle' });
    void writeSummaries(summaries);
    const remembered = storage.get(SELECTED_KEY);
    const folder = summaries.find((s) => s.folder === remembered)?.folder ?? summaries[0]?.folder ?? null;
    if (!folder) return;
    await load(folder);
    startPolling();
    if (!source.live) {
      // Picked files disappear on reload, so cache every save now to allow switching later.
      for (const s of summaries) {
        if (s.folder !== folder) await parseFromSource(source, s.folder).catch(() => undefined);
      }
    }
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
        cachedAt: null,
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
    loadedAt: null,
    cachedAt: null,
    cachedFolders: {},
    lastUpdate: null,

    async init() {
      try {
        // Show every known save and the last one opened right away, from the browser cache.
        const index = await readIndex();
        setState({ summaries: index.summaries, cachedFolders: index.cached });
        const remembered = storage.get(SELECTED_KEY);
        const hasCache = remembered ? await loadCached(remembered) : false;

        // Then go live if the folder is still allowed (Chrome/Edge "Allow on every visit").
        const restored = await restoreDirectory();
        if (!restored) return;
        if ('source' in restored) await useSource(restored.source);
        else {
          setState({ pendingHandle: restored.needsPermission, status: hasCache ? 'ready' : 'needs-permission' });
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

    async useFiles(files) {
      try {
        await useSource(fromFiles(files));
      } catch (e) {
        fail(e);
      }
    },

    async selectSave(folder) {
      try {
        // A click is a user gesture: use it to restore folder access first, if pending.
        if (!getState().source && getState().pendingHandle) {
          // useSource opens the remembered save, so remember this one first.
          storage.set(SELECTED_KEY, folder);
          await getState().reconnect();
          if (getState().source && getState().folder === folder && !getState().cachedAt) return;
        }
        if (getState().source) {
          await load(folder);
          startPolling();
        } else {
          await loadCached(folder);
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
      await Promise.all([forgetDirectory(), clearCache()]);
      setState({ source: null, summaries: [], folder: null, save: null, playerId: null, status: 'idle', pendingHandle: null, cachedAt: null, cachedFolders: {} });
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
