import { get, set, del, delMany, keys } from 'idb-keyval';
import type { SaveData, SaveSummary } from './model';

/**
 * Bump when SaveData's shape changes. Parsed copies from older versions are re-parsed from
 * the raw save kept next to them, so updating the site never loses a farm.
 */
const CACHE_VERSION = 16;
const INDEX_KEY = 'saves:index';
const saveKey = (folder: string) => `saves:data:${folder}`;
const xmlKey = (folder: string) => `saves:xml:${folder}`;

/** List of known saves plus which folders have a copy in the browser. */
export interface CacheIndex {
  summaries: SaveSummary[];
  /** Folder → when its copy was read from disk (ms). */
  cached: Record<string, number>;
}

interface StoredSave {
  version: number;
  save: SaveData;
}

export async function readIndex(): Promise<CacheIndex> {
  try {
    const index = await get<CacheIndex>(INDEX_KEY);
    return { summaries: index?.summaries ?? [], cached: index?.cached ?? {} };
  } catch {
    return { summaries: [], cached: {} };
  }
}

/**
 * Keeps every save (raw file and parsed copy) in IndexedDB so the site opens instantly and any
 * save can be switched to, even without folder access.
 */
export async function writeSave(save: SaveData, xml: string | null, summaries: SaveSummary[], loadedAt: number) {
  try {
    const index = await readIndex();
    await set(saveKey(save.folder), { version: CACHE_VERSION, save } satisfies StoredSave);
    if (xml) await set(xmlKey(save.folder), xml);
    await set(INDEX_KEY, {
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

/** The parsed save if it's current; otherwise the raw file to parse again (or null). */
export async function readSave(folder: string): Promise<{ save: SaveData } | { xml: string } | null> {
  try {
    const stored = await get<StoredSave>(saveKey(folder));
    if (stored?.version === CACHE_VERSION) return { save: stored.save };
    const xml = await get<string>(xmlKey(folder));
    return xml ? { xml } : null;
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
