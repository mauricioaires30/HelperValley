import { del, delMany, keys } from 'idb-keyval';

/** Earlier versions kept copies of the saves in the browser. The site is live-only now: remove them. */
export async function removeOldCopies() {
  try {
    const all = await keys();
    await delMany(all.filter((k) => typeof k === 'string' && k.startsWith('saves:')));
    await del('lastSave');
  } catch {
    // Nothing to remove.
  }
}
