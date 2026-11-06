import type { ReactNode } from 'react';

/** Hover/focus tooltip drawn in the game's small box frame. */
export function Tooltip({ text, children }: { text: ReactNode; children: ReactNode }) {
  return (
    <span className="tooltip" tabIndex={0}>
      {children}
      <span className="tooltip__bubble box" role="tooltip">
        {text}
      </span>
    </span>
  );
}
