import { qualifyItemId, type MuseumData } from '@/data/gameData';
import type { SaveData } from '@/save/model';
import { findItem, type ItemLocation } from '@/save/inventory';

export type MuseumStatus = 'donated' | 'owned' | 'found' | 'missing';

export interface MuseumEntry {
  id: string;
  kind: 'artifact' | 'mineral';
  status: MuseumStatus;
  owned: ItemLocation[];
}

/**
 * Museum progress for the whole farm (donations are shared):
 * donated, owned but not donated (ready to donate), found before but not kept, or never found.
 */
export function buildMuseum(save: SaveData, data: MuseumData): MuseumEntry[] {
  const donated = new Set(Object.values(save.museum).map(qualifyItemId));
  const found = new Set(
    save.players.flatMap((p) => [...Object.keys(p.archaeologyFound), ...Object.keys(p.mineralsFound)]).map(qualifyItemId),
  );

  const entry = (id: string, kind: MuseumEntry['kind']): MuseumEntry => {
    if (donated.has(id)) return { id, kind, status: 'donated', owned: [] };
    const owned = findItem(save, id);
    return { id, kind, status: owned.length ? 'owned' : found.has(id) ? 'found' : 'missing', owned };
  };

  return [...data.artifacts.map((id) => entry(id, 'artifact')), ...data.minerals.map((id) => entry(id, 'mineral'))];
}
