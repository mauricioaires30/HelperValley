import { get, set, del } from 'idb-keyval';
import type { SaveData, SaveSummary } from './model';

const CACHE_KEY = 'lastSave';
/** Bump when SaveData's shape changes so stale caches are ignored. */
const CACHE_VERSION = 2;

export interface CachedSave {
  version: number;
  save: SaveData;
  summaries: SaveSummary[];
  /** When the save was read from disk (ms). */
  loadedAt: number;
}

/** Keeps the last parsed save in IndexedDB so the site opens instantly next visit. */
export async function writeCache(save: SaveData, summaries: SaveSummary[], loadedAt: number) {
  try {
    await set(CACHE_KEY, { version: CACHE_VERSION, save, summaries, loadedAt } satisfies CachedSave);
  } catch {
    // Storage full or unavailable: the site still works, it just won't open offline.
  }
}

export async function readCache(): Promise<CachedSave | null> {
  try {
    const cached = await get<CachedSave>(CACHE_KEY);
    return cached?.version === CACHE_VERSION ? cached : null;
  } catch {
    return null;
  }
}

export async function clearCache() {
  await del(CACHE_KEY).catch(() => undefined);
}
