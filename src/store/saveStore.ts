import { create } from 'zustand';
import type { Player, SaveData, SaveSummary } from '@/save/model';
import { parseSave } from '@/save/parse';
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

  const stopPolling = () => window.clearInterval(pollTimer);

  const startPolling = () => {
    stopPolling();
    const { source, folder } = getState();
    if (!source?.live || !folder) return;
    pollTimer = window.setInterval(async () => {
      try {
        const modified = await source.modified(folder);
        if (modified > lastModified) await load(folder, true);
      } catch {
        // Folder temporarily unavailable (the game may be writing); try again next tick.
      }
    }, POLL_MS);
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
    setState({ save, folder, playerId, status: 'ready', loadedAt: Date.now() });
    if (background) setState({ summaries: await source.listSaves() });
  }

  async function useSource(source: SaveSource) {
    stopPolling();
    setState({ source, pendingHandle: null, status: 'listing', error: null, save: null });
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

    async init() {
      try {
        const restored = await restoreDirectory();
        if (!restored) return;
        if ('source' in restored) await useSource(restored.source);
        else setState({ status: 'needs-permission', pendingHandle: restored.needsPermission });
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
      await forgetDirectory();
      setState({ source: null, summaries: [], folder: null, save: null, playerId: null, status: 'idle', pendingHandle: null });
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
