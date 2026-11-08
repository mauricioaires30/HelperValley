import { describe, expect, it } from 'vitest';
import { pointAlong, ROADS, roadRoute, routeLength, type Point } from '../roads';

/** Whether the route has a segment crossing the vertical line x between the two y values. */
const crosses = (route: Point[], x: number, y0: number, y1: number) =>
  route.slice(1).some((p, i) => {
    const q = route[i];
    if ((q[0] - x) * (p[0] - x) >= 0) return false;
    const y = q[1] + ((x - q[0]) / (p[0] - q[0])) * (p[1] - q[1]);
    return y > y0 && y < y1;
  });

describe('roads', () => {
  it('joins every road into one network', () => {
    for (const line of ROADS) expect(roadRoute([99, 75], line[0])).not.toBeNull();
  });

  it('crosses the east river only at a bridge', () => {
    // Pierre's to the blacksmith: x = 203 is the river; bridges are near y 86 and y 116.
    const route = roadRoute([177, 87], [215, 105])!;
    expect(crosses(route, 203, 90, 112)).toBe(false);
    expect(crosses(route, 203, 80, 120)).toBe(true);
  });

  it('reaches the beach over its bridge', () => {
    const route = roadRoute([177, 87], [211, 141])!;
    expect(route.some(([x, y]) => x === 187 && y === 121)).toBe(true);
  });

  it('starts and ends at the given points', () => {
    const route = roadRoute([177, 87], [103, 103])!;
    expect(route[0]).toEqual([177, 87]);
    expect(route[route.length - 1]).toEqual([103, 103]);
    expect(pointAlong(route, 0)).toEqual([177, 87]);
    expect(pointAlong(route, routeLength(route) + 1)).toEqual([103, 103]);
  });

  it('has no route to places without roads on this map', () => {
    expect(roadRoute([177, 87], [36, 20])).toBeNull();
  });
});
