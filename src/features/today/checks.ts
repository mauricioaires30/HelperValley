import { create } from 'zustand';

/**
 * What's checked on the Today list, for one game day. Keys are `farm:<todo>` for chores of the whole
 * farm and `player:<id>:<todo>` for one character's, so everyone viewing them sees the same marks.
 * In a live share room the host's copy wins (see features/share/room.ts).
 */
export type CheckMessage = { type: 'check'; day: string; key: string; on: boolean };

interface ChecksState {
  /** `uniqueId:year-season-day`: a new game day starts a clean list. */
  day: string | null;
  checked: Record<string, true>;
  /** Marks or unmarks here and tells the rest of the room. */
  toggle(key: string): void;
  /** A mark from someone else; false when it's about another day. */
  apply(day: string, key: string, on: boolean): boolean;
  /** The host's whole list, for joining a room or a new day. */
  adopt(day: string, checked: Record<string, true>): void;
  /** Follows the save on screen: the same day keeps its marks, another one starts clean. */
  syncDay(uniqueId: string, date: { year: number; season: string; day: number }): void;
}

let listener: ((message: CheckMessage) => void) | null = null;
/** The live share listens here; the list itself knows nothing about the room. */
export const onLocalCheck = (fn: (message: CheckMessage) => void) => {
  listener = fn;
};

const storageKey = (day: string) => `hv-checks-${day.split(':')[0]}`;

function remember(day: string, checked: Record<string, true>) {
  try {
    localStorage.setItem(storageKey(day), JSON.stringify({ day, checked }));
  } catch {
    // only lasts until the page closes
  }
}

function recall(day: string): Record<string, true> {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(day)) ?? 'null') as { day: string; checked: Record<string, true> } | null;
    return stored?.day === day ? stored.checked : {};
  } catch {
    return {};
  }
}

export const useChecks = create<ChecksState>((set, get) => {
  const change = (key: string, on: boolean) => {
    const { day, checked } = get();
    if (!day) return;
    const next = { ...checked };
    if (on) next[key] = true;
    else delete next[key];
    set({ checked: next });
    remember(day, next);
  };
  return {
    day: null,
    checked: {},
    toggle(key) {
      const { day, checked } = get();
      if (!day) return;
      const on = !checked[key];
      change(key, on);
      listener?.({ type: 'check', day, key, on });
    },
    apply(day, key, on) {
      if (day !== get().day) return false;
      change(key, on);
      return true;
    },
    adopt(day, checked) {
      set({ day, checked });
      remember(day, checked);
    },
    syncDay(uniqueId, date) {
      const day = `${uniqueId}:${date.year}-${date.season}-${date.day}`;
      if (day !== get().day) set({ day, checked: recall(day) });
    },
  };
});
