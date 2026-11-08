export interface PinPoint {
  key: string;
  px: number;
  py: number;
}

export interface PinPlace {
  /** Map pixel the pin is drawn at: its own point, or the middle of its group. */
  px: number;
  py: number;
  /** Screen pixels from there: the pin's cell in the group's grid. */
  dx: number;
  dy: number;
  grouped: boolean;
}

/** Screen pixels between pins in a group, enough for a face or a pin icon. */
export const PIN_SPACING = 34;
/** Screen pixels: pins closer than this count as the same spot and form a grid. */
const SAME_SPOT = 24;

const gridOf = (n: number) => {
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
};

/**
 * Keeps every pin visible: pins at one spot gather into a compact grid there, and groups that would
 * still touch move apart just enough, so each stays as close as possible to its real place.
 * `scale` is screen pixels per map pixel, so groups open up as the map zooms in.
 */
export function layoutPins(pins: PinPoint[], scale: number): Map<string, PinPlace> {
  const groups = [...pins].sort((a, b) => a.px - b.px || a.py - b.py || a.key.localeCompare(b.key)).map((p) => ({ members: [p], cx: p.px, cy: p.py }));

  // Same spot: every pin of a group is close to all the others.
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < groups.length && !merged; i++) {
      for (let j = i + 1; j < groups.length && !merged; j++) {
        const [a, b] = [groups[i], groups[j]];
        if (a.members.some((p) => b.members.some((q) => Math.hypot(p.px - q.px, p.py - q.py) * scale >= SAME_SPOT))) continue;
        const members = [...a.members, ...b.members];
        groups[i] = { members, cx: members.reduce((s, p) => s + p.px, 0) / members.length, cy: members.reduce((s, p) => s + p.py, 0) / members.length };
        groups.splice(j, 1);
        merged = true;
      }
    }
  }

  // Everything else that would touch steps aside, along the shorter way out.
  for (let round = 0; round < 300; round++) {
    let moved = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const [a, b] = [groups[i], groups[j]];
        const [ga, gb] = [gridOf(a.members.length), gridOf(b.members.length)];
        const overX = ((ga.cols + gb.cols) / 2) * PIN_SPACING - Math.abs(a.cx - b.cx) * scale;
        const overY = ((ga.rows + gb.rows) / 2) * PIN_SPACING - Math.abs(a.cy - b.cy) * scale;
        if (overX <= 0.5 || overY <= 0.5) continue;
        moved = true;
        if (overX < overY) {
          const push = (overX / scale) * (a.cx <= b.cx ? 0.5 : -0.5);
          a.cx -= push;
          b.cx += push;
        } else {
          const push = (overY / scale) * (a.cy <= b.cy ? 0.5 : -0.5);
          a.cy -= push;
          b.cy += push;
        }
      }
    }
    if (!moved) break;
  }

  const out = new Map<string, PinPlace>();
  for (const { members, cx, cy } of groups) {
    if (members.length === 1) {
      out.set(members[0].key, { px: cx, py: cy, dx: 0, dy: 0, grouped: false });
      continue;
    }
    const { cols, rows } = gridOf(members.length);
    // Keeps pins near their real side: top rows hold the northernmost, each row runs west to east.
    const byRow = [...members].sort((a, b) => a.py - b.py || a.key.localeCompare(b.key));
    for (let row = 0; row < rows; row++) {
      const line = byRow.slice(row * cols, (row + 1) * cols).sort((a, b) => a.px - b.px || a.key.localeCompare(b.key));
      line.forEach((p, col) => {
        out.set(p.key, { px: cx, py: cy, dx: (col - (line.length - 1) / 2) * PIN_SPACING, dy: (row - (rows - 1) / 2) * PIN_SPACING, grouped: true });
      });
    }
  }
  return out;
}
