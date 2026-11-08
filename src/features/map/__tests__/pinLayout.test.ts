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

  it('does not pull pins from far away', () => {
    const placed = layoutPins([{ key: 'a', px: 100, py: 50 }, { key: 'b', px: 130, py: 50 }], 3);
    expect(placed.get('a')).toEqual({ px: 100, py: 50, dx: 0, dy: 0, grouped: false });
    expect(placed.get('b')?.grouped).toBe(false);
  });

  it('moves close neighbours apart just enough, without joining them', () => {
    const placed = layoutPins([{ key: 'a', px: 100, py: 50 }, { key: 'b', px: 110, py: 50 }], 3);
    const [a, b] = [placed.get('a')!, placed.get('b')!];
    expect(a.grouped || b.grouped).toBe(false);
    expect(Math.abs(a.px - b.px) * 3).toBeGreaterThanOrEqual(PIN_SPACING - 1);
    expect(Math.abs(a.px - 100)).toBeLessThan(2);
  });

  it('leaves no pins on top of each other in a crowd', () => {
    const pins = Array.from({ length: 40 }, (_, i) => ({ key: `p${i}`, px: 100 + (i % 7) * 4, py: 50 + (i % 5) * 5 }));
    const spots = [...layoutPins(pins, 3).values()].map((p) => ({ x: p.px * 3 + p.dx, y: p.py * 3 + p.dy }));
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y)).toBeGreaterThan(20);
  });

  it('places every pin once', () => {
    expect(layoutPins(points(30), 3).size).toBe(30);
  });
});
