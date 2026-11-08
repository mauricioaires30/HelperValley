import { useEffect, useRef, useState, type PointerEvent } from 'react';

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

/** Zoom with the wheel or buttons; drag to move around once zoomed in. */
export function usePanZoom() {
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);

  const clamp = (zoom: number, x: number, y: number) => {
    const rect = viewport.current?.getBoundingClientRect();
    if (!rect) return { zoom, x, y };
    // Keep the map covering the viewport: no empty space past its edges.
    const minX = rect.width - rect.width * zoom;
    const minY = rect.height - rect.height * zoom;
    return { zoom, x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
  };

  const zoomAt = (factor: number, cx?: number, cy?: number) =>
    setView((v) => {
      const rect = viewport.current?.getBoundingClientRect();
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const px = cx ?? (rect ? rect.width / 2 : 0);
      const py = cy ?? (rect ? rect.height / 2 : 0);
      // Zoom around the pointer: the point under it stays put.
      const x = px - ((px - v.x) * zoom) / v.zoom;
      const y = py - ((py - v.y) * zoom) / v.zoom;
      return clamp(zoom, x, y);
    });

  // React wheel listeners are passive; a native one can stop the page from scrolling.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const handlers = {
    onPointerDown: (e: PointerEvent) => {
      if (view.zoom === 1) return;
      drag.current = { x: e.clientX, y: e.clientY, startX: view.x, startY: view.y };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: PointerEvent) => {
      const d = drag.current;
      if (d) setView((v) => clamp(v.zoom, d.startX + e.clientX - d.x, d.startY + e.clientY - d.y));
    },
    onPointerUp: () => {
      drag.current = null;
    },
  };

  return { view, viewport, handlers, zoomIn: () => zoomAt(1.5), zoomOut: () => zoomAt(1 / 1.5), reset: () => setView({ zoom: 1, x: 0, y: 0 }) };
}

