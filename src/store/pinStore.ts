import { create } from 'zustand';

const KEY = 'helpervalley.pins';

interface Pins {
  /** Quest ids and special order keys marked on the map. */
  quests: string[];
  /** Fish item ids marked on the map. */
  fish: string[];
}

interface PinState extends Pins {
  toggle(kind: keyof Pins, id: string): void;
}

function load(): Pins {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { quests: raw.quests ?? [], fish: raw.fish ?? [] };
  } catch {
    return { quests: [], fish: [] };
  }
}

/** What the player chose to mark on the map; kept in this browser. */
export const usePinStore = create<PinState>((set, get) => ({
  ...load(),
  toggle(kind, id) {
    const list = get()[kind];
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    set({ [kind]: next } as Partial<Pins>);
    try {
      localStorage.setItem(KEY, JSON.stringify({ quests: get().quests, fish: get().fish }));
    } catch {
      // Pins just won't survive a reload.
    }
  },
}));
