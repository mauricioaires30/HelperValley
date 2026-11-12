import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CURSOR_IDLE_MS, CURSOR_MS } from './protocol';
import { locate, place, useCursors } from './cursors';
import { useShareStore } from './room';
import './share.css';

/** Tells the room which page this tab is on, and sends this mouse to whoever is on the same page. */
export function PresenceSync() {
  const { pathname } = useLocation();
  const inRoom = useShareStore((s) => !!s.role && s.status !== 'error');

  useEffect(() => {
    useShareStore.getState().setRoute(pathname);
  }, [pathname]);

  useEffect(() => {
    // Phones and tablets have no mouse to show.
    if (!inRoom || !window.matchMedia('(pointer: fine)').matches) return;
    let last = 0;
    let pending: number | null = null;
    let shown = false;
    let latest: { target: Element | null; x: number; y: number } | null = null;
    const flush = () => {
      pending = null;
      if (!latest) return;
      last = Date.now();
      const cursor = locate(latest.target, latest.x, latest.y);
      if (cursor) {
        shown = true;
        useShareStore.getState().sendCursor(cursor);
      } else if (shown) {
        shown = false;
        useShareStore.getState().sendCursor(null);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      latest = { target: e.target as Element | null, x: e.clientX, y: e.clientY };
      // At most 12 a second; the last position always goes out.
      const wait = CURSOR_MS - (Date.now() - last);
      if (wait <= 0) flush();
      else pending ??= window.setTimeout(flush, wait);
    };
    const onLeave = (e: MouseEvent) => {
      if (e.relatedTarget || !shown) return;
      shown = false;
      latest = null;
      useShareStore.getState().sendCursor(null);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('mouseout', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('mouseout', onLeave);
      if (pending !== null) window.clearTimeout(pending);
    };
  }, [inRoom]);

  return null;
}

/** Everyone else's mouse on this page, with their nickname. */
export function CursorLayer() {
  const cursors = useCursors((s) => s.cursors);
  const [, redraw] = useState(0);
  const ids = Object.keys(cursors);

  // Follow scrolling and the map moving, and drop cursors that stopped.
  useEffect(() => {
    if (ids.length === 0) return;
    let frame = requestAnimationFrame(function tick() {
      const now = Date.now();
      for (const [id, c] of Object.entries(useCursors.getState().cursors)) if (now - c.at > CURSOR_IDLE_MS) useCursors.getState().remove(id);
      redraw((n) => n + 1);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [ids.length]);

  return (
    <div className="cursor-layer" aria-hidden="true">
      {Object.entries(cursors).map(([id, { nick, cursor }]) => {
        const at = place(cursor);
        if (!at) return null;
        return (
          <div key={id} className="cursor" style={{ transform: `translate(${at.left}px, ${at.top}px)`, ['--hue' as string]: hue(id) }}>
            <svg width="16" height="20" viewBox="0 0 16 20" className="cursor__arrow">
              <path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" />
            </svg>
            <span className="cursor__name">{nick}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A steady color per person. */
function hue(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
