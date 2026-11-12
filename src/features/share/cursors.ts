import { create } from 'zustand';
import type { Cursor } from './protocol';

/** Other people's mice on this page, kept apart from the room store so moving them re-renders only the overlay. */
interface CursorsState {
  cursors: Record<string, { nick: string; cursor: Cursor; at: number }>;
  move(clientId: string, nick: string, cursor: Cursor): void;
  remove(clientId: string): void;
  clear(): void;
}

export const useCursors = create<CursorsState>((set, get) => ({
  cursors: {},
  move(clientId, nick, cursor) {
    set({ cursors: { ...get().cursors, [clientId]: { nick, cursor, at: Date.now() } } });
  },
  remove(clientId) {
    if (!(clientId in get().cursors)) return;
    const cursors = { ...get().cursors };
    delete cursors[clientId];
    set({ cursors });
  },
  clear() {
    if (Object.keys(get().cursors).length) set({ cursors: {} });
  },
}));

/**
 * Where a mouse is, in terms everyone's screen understands. Inside a part marked data-cursor-anchor
 * (like the map, which each person zooms and pans), x and y are fractions of that part, so the cursor
 * lands on the same spot of the map. Elsewhere it's relative to the page area: x as a fraction of
 * its width, y in pixels from its top (pages get taller, not wider, on smaller screens).
 */
export function locate(target: Element | null, clientX: number, clientY: number): Cursor | null {
  const anchor = target?.closest<HTMLElement>('[data-cursor-anchor]');
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { a: anchor.dataset.cursorAnchor!, x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  }
  const main = document.querySelector<HTMLElement>('.content__main');
  if (!main || !target || !main.contains(target)) return null;
  const r = main.getBoundingClientRect();
  return { a: 'main', x: (clientX - r.left) / r.width, y: clientY - r.top };
}

/** The screen point for someone else's cursor, or null when that part isn't on this screen right now. */
export function place(cursor: Cursor): { left: number; top: number } | null {
  if (cursor.a === 'main') {
    const main = document.querySelector<HTMLElement>('.content__main');
    if (!main) return null;
    const r = main.getBoundingClientRect();
    return { left: r.left + cursor.x * r.width, top: r.top + cursor.y };
  }
  const anchor = document.querySelector<HTMLElement>(`[data-cursor-anchor="${CSS.escape(cursor.a)}"]`);
  if (!anchor) return null;
  const r = anchor.getBoundingClientRect();
  const point = { left: r.left + cursor.x * r.width, top: r.top + cursor.y * r.height };
  // A zoomed map shows only part of itself: hide cursors outside the visible window.
  const frame = anchor.closest<HTMLElement>('[data-cursor-frame]')?.getBoundingClientRect();
  if (frame && (point.left < frame.left || point.left > frame.right || point.top < frame.top || point.top > frame.bottom)) return null;
  return point;
}
