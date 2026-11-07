import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const MARGIN = 8;

/**
 * Hover/keyboard-focus tooltip drawn in the game's small box frame.
 * The bubble is placed in the page layer and kept inside the window: above the item when
 * there's room, below otherwise, shifted sideways near the edges. A mouse click doesn't pin it.
 */
export function Tooltip({ text, children }: { text: ReactNode; children: ReactNode }) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = () => anchorRef.current && setAnchor(anchorRef.current.getBoundingClientRect());
  const hide = () => {
    setAnchor(null);
    setPos(null);
  };

  useLayoutEffect(() => {
    if (!anchor || !bubbleRef.current) return;
    const b = bubbleRef.current.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(anchor.left + anchor.width / 2 - b.width / 2, window.innerWidth - b.width - MARGIN));
    let top = anchor.top - b.height - 4;
    if (top < MARGIN) top = Math.min(anchor.bottom + 4, window.innerHeight - b.height - MARGIN);
    setPos({ left, top: Math.max(MARGIN, top) });
  }, [anchor, text]);

  // Scrolling moves the item away from a fixed bubble; just close it.
  useEffect(() => {
    if (!anchor) return;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [anchor]);

  return (
    <span
      ref={anchorRef}
      className="tooltip"
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={(e) => e.currentTarget.matches(':focus-visible') && show()}
      onBlur={hide}
    >
      {children}
      {anchor &&
        createPortal(
          <span
            ref={bubbleRef}
            className="tooltip__bubble box"
            role="tooltip"
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}
