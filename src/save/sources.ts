import { get, set, del } from 'idb-keyval';
import { normalizeSummary } from './normalize';
import type { SaveSummary } from './model';
import { APP_STATUS_FILE, parseAppStatus, type AppStatus } from './appStatus';

const HANDLE_KEY = 'savesDirectory';

/** The connected saves folder. */
export interface SaveSource {
  listSaves(): Promise<SaveSummary[]>;
  /** Main save file contents and its lastModified. */
  readSave(folder: string): Promise<{ xml: string; modified: number }>;
  /** lastModified of the main save file, used to detect in-game saves. */
  modified(folder: string): Promise<number>;
  /** The HelperValley app's status file, when the folder is its copy. */
  appStatus(): Promise<{ status: AppStatus; modified: number } | null>;
}

export const supportsDirectoryAccess = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** A save folder holds "SaveGameInfo" plus a main file named after the folder. */
const isSaveFolder = (names: Set<string>, folder: string) => names.has('SaveGameInfo') && names.has(folder);

async function childNames(dir: FileSystemDirectoryHandle): Promise<Set<string>> {
  const names = new Set<string>();
  for await (const name of dir.keys()) names.add(name);
  return names;
}

class DirectorySource implements SaveSource {
  private folders = new Map<string, FileSystemDirectoryHandle>();

  constructor(private root: FileSystemDirectoryHandle) {}

  /** Accepts the StardewValley folder, its Saves folder, or a single save folder. */
  async listSaves(): Promise<SaveSummary[]> {
    this.folders.clear();
    let root = this.root;
    const names = await childNames(root);
    if (isSaveFolder(names, root.name)) {
      this.folders.set(root.name, root);
    } else {
      if (names.has('Saves')) root = await root.getDirectoryHandle('Saves');
      for await (const entry of root.values()) {
        if (entry.kind !== 'directory') continue;
        const dir = entry as FileSystemDirectoryHandle;
        if (isSaveFolder(await childNames(dir), dir.name)) this.folders.set(dir.name, dir);
      }
    }

    const summaries = await Promise.all(
      [...this.folders].map(async ([folder, dir]) => {
        const info = await (await dir.getFileHandle('SaveGameInfo')).getFile();
        return normalizeSummary(await info.text(), folder, await this.modified(folder));
      }),
    );
    return summaries.sort((a, b) => b.modified - a.modified);
  }

  /** The app writes its status next to the saves; also looked for inside a "Saves" folder picked one level up. */
  async appStatus(): Promise<{ status: AppStatus; modified: number } | null> {
    for (const dir of [this.root, await this.root.getDirectoryHandle('Saves').catch(() => null)]) {
      if (!dir) continue;
      try {
        const file = await (await dir.getFileHandle(APP_STATUS_FILE)).getFile();
        const status = parseAppStatus(await file.text());
        if (status) return { status, modified: file.lastModified };
      } catch {
        // Not here, or being replaced right now: try again on the next check.
      }
    }
    return null;
  }

  private async mainFile(folder: string): Promise<File> {
    const dir = this.folders.get(folder);
    if (!dir) throw new Error(`Save not found: ${folder}`);
    return (await dir.getFileHandle(folder)).getFile();
  }

  async readSave(folder: string) {
    const file = await this.mainFile(folder);
    return { xml: await file.text(), modified: file.lastModified };
  }

  async modified(folder: string) {
    return (await this.mainFile(folder)).lastModified;
  }
}

/** Asks the user for their saves folder and remembers it for next visits. */
export async function pickDirectory(): Promise<SaveSource> {
  const handle = await window.showDirectoryPicker!({ id: 'stardew-saves', mode: 'read' });
  await set(HANDLE_KEY, handle);
  return new DirectorySource(handle);
}

export type RestoreResult = { source: SaveSource } | { needsPermission: FileSystemDirectoryHandle } | null;

/** Restores the remembered folder. Browsers require a click before re-granting access. */
export async function restoreDirectory(): Promise<RestoreResult> {
  if (!supportsDirectoryAccess()) return null;
  const handle = await get<FileSystemDirectoryHandle>(HANDLE_KEY).catch(() => undefined);
  if (!handle) return null;
  const permission = await handle.queryPermission({ mode: 'read' });
  if (permission === 'granted') return { source: new DirectorySource(handle) };
  return { needsPermission: handle };
}

export async function grantDirectory(handle: FileSystemDirectoryHandle): Promise<SaveSource | null> {
  const permission = await handle.requestPermission({ mode: 'read' });
  return permission === 'granted' ? new DirectorySource(handle) : null;
}

export async function forgetDirectory() {
  await del(HANDLE_KEY);
}
