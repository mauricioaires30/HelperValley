import type { ReactNode } from 'react';

interface PopoverProps {
  /** The always-visible trigger (rendered as a button). */
  label: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Opens above its button on hover or keyboard focus, no click needed. The panel stays
 * open while the pointer is over it, so items inside can show their own tooltips.
 */
export function Popover({ label, children, className }: PopoverProps) {
  return (
    <span className={className ? `popover ${className}` : 'popover'}>
      <button type="button" className="button popover__trigger">
        {label}
      </button>
      <span className="popover__panel" role="dialog">
        <span className="popover__content box">{children}</span>
      </span>
    </span>
  );
}
