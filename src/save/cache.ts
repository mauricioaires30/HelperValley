import { get, set, del, delMany, keys } from 'idb-keyval';
import type { SaveData, SaveSummary } from './model';

/** Bump when SaveData's shape changes so stale caches are ignored. */
const CACHE_VERSION = 4;
const INDEX_KEY = 'saves:index';
const saveKey = (folder: string) => `saves:data:${folder}`;

/** List of known saves plus which folders have a parsed copy in the browser. */
export interface CacheIndex {
  version: number;
  summaries: SaveSummary[];
  /** Folder → when its cached copy was read from disk (ms). */
  cached: Record<string, number>;
}

const emptyIndex = (): CacheIndex => ({ version: CACHE_VERSION, summaries: [], cached: {} });

export async function readIndex(): Promise<CacheIndex> {
  try {
    const index = await get<CacheIndex>(INDEX_KEY);
    return index?.version === CACHE_VERSION ? index : emptyIndex();
  } catch {
    return emptyIndex();
  }
}

/**
 * Keeps every parsed save in IndexedDB so the site opens instantly, and any save can be
 * switched to, even before folder access is granted again.
 */
export async function writeSave(save: SaveData, summaries: SaveSummary[], loadedAt: number) {
  try {
    const index = await readIndex();
    await set(saveKey(save.folder), save);
    await set(INDEX_KEY, {
      version: CACHE_VERSION,
      summaries: summaries.length ? summaries : index.summaries,
      cached: { ...index.cached, [save.folder]: loadedAt },
    } satisfies CacheIndex);
  } catch {
    // Storage full or unavailable: the site still works, it just won't open offline.
  }
}

export async function writeSummaries(summaries: SaveSummary[]) {
  try {
    const index = await readIndex();
    await set(INDEX_KEY, { ...index, summaries } satisfies CacheIndex);
  } catch {
    // Ignore; see writeSave.
  }
}

export async function readSave(folder: string): Promise<SaveData | null> {
  try {
    return (await get<SaveData>(saveKey(folder))) ?? null;
  } catch {
    return null;
  }
}

export async function clearCache() {
  try {
    const all = await keys();
    await delMany(all.filter((k) => typeof k === 'string' && k.startsWith('saves:')));
    await del('lastSave'); // pre-v3 single-save cache
  } catch {
    // Nothing to clear.
  }
}
