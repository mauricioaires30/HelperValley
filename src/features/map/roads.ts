/**
 * Paths of the Valley world map, traced by hand over LooseSprites/map (in map pixels). Walking NPCs
 * follow them, so they cross rivers at the bridges instead of going straight through water and forest.
 * Polylines join where they share an exact point.
 */
export type Point = readonly [number, number];

export const ROADS: Point[][] = [
  // Farm: north exit, center, east exit along the bus stop to the town's west road.
  [[90, 50], [90, 62], [99, 75]],
  [[90, 56], [95, 58], [125, 58], [125, 73]],
  [[99, 75], [113, 74], [125, 73], [140, 74], [140, 85], [147, 86], [165, 86], [169, 86]],
  // Farm south exit (around the pond) to Marnie, Leah and the river bank into town.
  [[99, 75], [99, 90], [89, 94], [89, 106], [103, 108], [111, 110], [120, 110], [124, 118]],
  [[89, 106], [75, 103], [56, 105], [52, 109]],
  [[124, 118], [138, 117], [142, 116], [156, 116], [171, 121], [183, 122], [187, 121]],
  // Town square, north past the park and Community Center, up to the mountain.
  [[169, 86], [169, 80], [170, 72], [177, 66], [187, 66], [191, 67], [207, 67], [207, 49], [195, 41], [171, 40], [168, 38], [168, 28], [150, 24]],
  [[187, 66], [187, 61]],
  [[195, 41], [197, 30], [204, 29], [220, 30], [228, 31]],
  [[204, 29], [204, 26]],
  [[168, 28], [175, 30], [186, 30], [189, 30]],
  // Town square south: Sam and Haley, the manor, the bridge to the beach, the pier.
  [[169, 86], [169, 92], [169, 105], [169, 113], [152, 113]],
  [[169, 113], [171, 113], [171, 121]],
  [[169, 105], [182, 105], [182, 113], [187, 113], [187, 121], [186, 128], [187, 133], [195, 141], [204, 143], [211, 145], [211, 142]],
  [[204, 143], [204, 156]],
  // East side: the two bridges, Joja, the blacksmith and the museum.
  [[169, 92], [183, 92], [183, 98], [198, 98], [199, 110], [200, 113]],
  [[187, 113], [200, 113], [205, 116], [211, 116]],
  [[198, 98], [198, 86], [205, 86], [211, 86], [218, 86], [218, 84]],
  [[211, 86], [211, 107], [211, 113], [211, 116]],
  [[211, 107], [215, 107]],
  [[211, 113], [222, 113]],
];

/** Farther than this from every road (desert, summit, secret woods): no road leads there on this map. */
const MAX_SNAP = 30;

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const keyOf = (p: Point) => `${p[0]},${p[1]}`;

const SEGMENTS: Array<[Point, Point]> = ROADS.flatMap((line) => line.slice(1).map((p, i): [Point, Point] => [line[i], p]));

/** The closest point on any road, and the road segment it's on. */
function snap(p: Point) {
  let best: { at: Point; segment: [Point, Point]; d: number } | null = null;
  for (const segment of SEGMENTS) {
    const [a, b] = segment;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    const at: Point = [a[0] + dx * k, a[1] + dy * k];
    const d = dist(p, at);
    if (!best || d < best.d) best = { at, segment, d };
  }
  return best!;
}

/**
 * The way from `from` to `to` along the roads, as a polyline starting and ending at those points.
 * Null when one of them isn't near any road.
 */
export function roadRoute(from: Point, to: Point): Point[] | null {
  const a = snap(from);
  const b = snap(to);
  if (a.d > MAX_SNAP || b.d > MAX_SNAP) return null;

  // The road graph, plus the two snapped points joined to their segment's ends.
  const graph = new Map<string, Array<{ to: Point; d: number }>>();
  const link = (p: Point, q: Point) => {
    graph.set(keyOf(p), [...(graph.get(keyOf(p)) ?? []), { to: q, d: dist(p, q) }]);
    graph.set(keyOf(q), [...(graph.get(keyOf(q)) ?? []), { to: p, d: dist(p, q) }]);
  };
  for (const [p, q] of SEGMENTS) link(p, q);
  for (const s of [a, b]) {
    link(s.at, s.segment[0]);
    link(s.at, s.segment[1]);
  }
  if (a.segment === b.segment) link(a.at, b.at);

  // Dijkstra; the graph is small enough for a plain list.
  const best = new Map<string, number>([[keyOf(a.at), 0]]);
  const previous = new Map<string, Point>();
  const open = new Map<string, Point>([[keyOf(a.at), a.at]]);
  while (open.size) {
    const [key, point] = [...open].reduce((x, y) => (best.get(y[0])! < best.get(x[0])! ? y : x));
    open.delete(key);
    if (key === keyOf(b.at)) break;
    for (const edge of graph.get(key) ?? []) {
      const d = best.get(key)! + edge.d;
      const k = keyOf(edge.to);
      if (d < (best.get(k) ?? Infinity)) {
        best.set(k, d);
        previous.set(k, point);
        open.set(k, edge.to);
      }
    }
  }
  if (!best.has(keyOf(b.at))) return null;

  const path: Point[] = [b.at];
  for (let p = previous.get(keyOf(b.at)); p; p = previous.get(keyOf(p))) path.unshift(p);
  return [from, ...path, to];
}

export const routeLength = (route: readonly Point[]) => route.slice(1).reduce((sum, p, i) => sum + dist(route[i], p), 0);

/** The point `distance` pixels along a route. */
export function pointAlong(route: readonly Point[], distance: number): Point {
  let left = distance;
  for (let i = 1; i < route.length; i++) {
    const d = dist(route[i - 1], route[i]);
    if (left <= d && d > 0) {
      const k = left / d;
      return [route[i - 1][0] + (route[i][0] - route[i - 1][0]) * k, route[i - 1][1] + (route[i][1] - route[i - 1][1]) * k];
    }
    left -= d;
  }
  return route[route.length - 1];
}
