import { describe, expect, it } from 'vitest';
import { layoutPins, PIN_SPACING } from '../pinLayout';

const points = (n: number, px = 100, py = 50) => Array.from({ length: n }, (_, i) => ({ key: `p${i}`, px, py }));

describe('layoutPins', () => {
  it('leaves a lone pin at its own point', () => {
    expect(layoutPins(points(1), 3).get('p0')).toEqual({ px: 100, py: 50, dx: 0, dy: 0, grouped: false });
  });

  it('gathers pins at the same point in a centered grid without overlap', () => {
    const placed = [...layoutPins(points(5), 3).values()];
    expect(placed.every((p) => p.grouped && p.px === 100 && p.py === 50)).toBe(true);
    for (const a of placed) for (const b of placed) if (a !== b) expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeGreaterThanOrEqual(PIN_SPACING);
    // Compact: 5 pins take a 3x2 grid around the point.
    expect(Math.max(...placed.map((p) => Math.abs(p.dx)))).toBeLessThanOrEqual(PIN_SPACING);
    expect(Math.max(...placed.map((p) => Math.abs(p.dy)))).toBeLessThanOrEqual(PIN_SPACING / 2);
  });

  it('opens groups as the map zooms in', () => {
    const pins = [{ key: 'a', px: 100, py: 50 }, { key: 'b', px: 106, py: 50 }];
    expect(layoutPins(pins, 3).get('a')?.grouped).toBe(true);
    expect(layoutPins(pins, 18).get('a')?.grouped).toBe(false);
  });

  it('keeps left and right order inside a group', () => {
    const placed = layoutPins([{ key: 'east', px: 104, py: 50 }, { key: 'west', px: 100, py: 50 }], 3);
    expect(placed.get('west')!.dx).toBeLessThan(placed.get('east')!.dx);
  });

  it('keeps full groups from sitting on each other', () => {
    const pins = [...points(12).map((p) => ({ ...p, key: `a${p.key}` })), ...points(12, 110).map((p) => ({ ...p, key: `b${p.key}` }))];
    const placed = [...layoutPins(pins, 3).values()].map((p) => ({ x: p.px * 3 + p.dx, y: p.py * 3 + p.dy }));
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y)).toBeGreaterThanOrEqual(PIN_SPACING - 1);
  });

  it('places every pin once', () => {
    expect(layoutPins(points(30), 3).size).toBe(30);
  });
});
