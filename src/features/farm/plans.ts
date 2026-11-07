import { useCallback, useEffect, useState } from 'react';
import { get, set } from 'idb-keyval';

export type AreaId = 'Farm' | 'Greenhouse' | 'IslandWest';
export const AREAS: AreaId[] = ['Farm', 'Greenhouse', 'IslandWest'];

/** One slice of an area: e.g. 10 tiles of Fairy Rose for honey. */
export interface PlanRow {
  id: string;
  /** Seed id, e.g. "(O)595". */
  seed: string;
  tiles: number;
  note: string;
}

export interface AreaPlan {
  /** Tiles to plan for; null = use what the save has tilled right now. */
  total: number | null;
  rows: PlanRow[];
}

export type FarmPlans = Record<AreaId, AreaPlan>;

const emptyPlans = (): FarmPlans => ({
  Farm: { total: null, rows: [] },
  Greenhouse: { total: null, rows: [] },
  IslandWest: { total: null, rows: [] },
});

const key = (uniqueId: string) => `plans:${uniqueId}`;

/**
 * Planting plans saved in the browser per farm. They don't change when tiles disappear in the
 * game, so a plan survives harvests, winter and re-tilling.
 */
export function usePlans(uniqueId: string) {
  const [plans, setPlans] = useState<FarmPlans>(emptyPlans);

  useEffect(() => {
    let alive = true;
    get<FarmPlans>(key(uniqueId))
      .then((stored) => alive && setPlans({ ...emptyPlans(), ...stored }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [uniqueId]);

  const update = useCallback(
    (area: AreaId, change: (plan: AreaPlan) => AreaPlan) => {
      setPlans((current) => {
        const next = { ...current, [area]: change(current[area]) };
        void set(key(uniqueId), next).catch(() => undefined);
        return next;
      });
    },
    [uniqueId],
  );

  return { plans, update };
}

export const newRowId = () => Math.random().toString(36).slice(2, 10);
