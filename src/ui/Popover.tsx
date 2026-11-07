import { useRef, type ReactNode } from 'react';

interface PopoverProps {
  /** The always-visible trigger (rendered as a button). */
  label: ReactNode;
  children: ReactNode;
  className?: string;
}

const MARGIN = 8;

/**
 * Opens above its button on hover or keyboard focus, no click needed. The panel stays
 * open while the pointer is over it, so items inside can show their own tooltips.
 * When opened it is nudged back inside the window (sideways, or below the button near the top).
 */
export function Popover({ label, children, className }: PopoverProps) {
  const panelRef = useRef<HTMLSpanElement>(null);

  const place = () =>
    requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      panel.style.left = '0px';
      panel.classList.remove('popover__panel--below');
      const r = panel.getBoundingClientRect();
      if (!r.width) return;
      let shift = 0;
      if (r.right > window.innerWidth - MARGIN) shift = window.innerWidth - MARGIN - r.right;
      if (r.left + shift < MARGIN) shift = MARGIN - r.left;
      panel.style.left = `${shift}px`;
      if (r.top < MARGIN) panel.classList.add('popover__panel--below');
    });

  return (
    <span className={className ? `popover ${className}` : 'popover'} onMouseEnter={place} onFocus={place}>
      <button type="button" className="button popover__trigger">
        {label}
      </button>
      <span ref={panelRef} className="popover__panel" role="dialog">
        <span className="popover__content box">{children}</span>
      </span>
    </span>
  );
}
