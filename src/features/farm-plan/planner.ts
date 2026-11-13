import { gameData, getItem } from '@/data/gameData';
import type { LayoutState } from '@/save/model';

/** A Stardew Planner (stardew.info/planner) layout as its API returns it: positions in pixels (16 per tile). */
export interface PlannerPlan {
  tiles: Array<{ type: string; x: number; y: number }>;
  buildings: Array<{ type: string; x: number; y: number }>;
  flooring: Array<{ type: string; x: number; y: number }>;
  options?: { layout?: string };
}

const API = 'https://stardew.info/api/';

/** "https://stardew.info/planner/7-dead-gerbils-danced-easily" → "7-dead-gerbils-danced-easily". */
export function planId(input: string): string | null {
  const m = /planner\/([a-z0-9-]+)/i.exec(input.trim()) ?? /^([0-9]+-[a-z-]+)$/i.exec(input.trim());
  return m ? m[1] : null;
}

export const planApiUrl = (id: string) => API + id;

/** Text pasted by the user: either the plan JSON or a link. */
export function parsePlanJson(text: string): PlannerPlan | null {
  try {
    const data = JSON.parse(text);
    if (data && Array.isArray(data.tiles)) return { tiles: data.tiles, buildings: data.buildings ?? [], flooring: data.flooring ?? [], options: data.options };
  } catch {
    // not JSON
  }
  return null;
}

/** Tries to load the plan straight from stardew.info (works only if the site allows cross-site reads). */
export async function fetchPlan(id: string): Promise<PlannerPlan> {
  const res = await fetch(planApiUrl(id), { headers: { 'Content-Type': 'application/json' } });
  const plan = parsePlanJson(await res.text());
  if (!plan) throw new Error('not a plan');
  return plan;
}

/** Wild tree types (Tree.treeType) and flooring ids (Data/FloorsAndPaths) in the planner's words. */
const TREE: Record<string, string> = { '1': 'oak-tree', '2': 'maple-tree', '3': 'pine-tree', '6': 'palm-tree', '9': 'palm-tree', '7': 'mushroom-tree', '8': 'mahogany-tree' };
const FLOOR: Record<string, string> = {
  '0': 'wooden-floor',
  '1': 'stone-floor',
  '2': 'weathered-floor',
  '3': 'crystal-floor',
  '4': 'straw-floor',
  '5': 'gravel-path',
  '6': 'wooden-path',
  '7': 'crystal-path',
  '8': 'cobblestone',
  '9': 'steppingstone-path',
  '10': 'brick-floor',
  '11': 'rustic-plank-floor',
  '12': 'stone-walkway-floor',
};
/** Same thing, different names. */
const ALIASES: Record<string, string> = { 'stone-gate': 'gate', 'wood-gate': 'gate' };

const slug = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '-');
const canon = (type: string) => ALIASES[type] ?? type;

/** Every planner-style name a save tile can match (a crop matches its seed or its harvest). */
export function saveKeys(key: string): string[] {
  const [kind, a, b] = key.split(':');
  switch (kind) {
    case 'tree':
      return TREE[a] ? [TREE[a]] : [];
    case 'floor':
      return FLOOR[a] ? [FLOOR[a]] : [];
    case 'fruit': {
      const sapling = getItem(`(O)${a}`)?.n[0];
      return sapling ? [slug(sapling).replace(/-sapling$/, '-tree')] : [];
    }
    case 'crop': {
      const seed = getItem(`(O)${a}`)?.n[0];
      const harvest = getItem(`(O)${b}`)?.n[0];
      return [seed, harvest].filter(Boolean).map((n) => slug(n!));
    }
    default:
      return [canon(key)];
  }
}

export interface TypeResult {
  type: string;
  planned: number;
  /** Planned tiles that have it in the save, at the same spot. */
  inPlace: number;
  /** How many the save has on this map, anywhere. */
  have: number;
}

export interface PlanCell {
  x: number;
  y: number;
  type: string;
  done: boolean;
  /** What the save has on that tile (planner-style names). */
  actual: string[];
}

export interface Comparison {
  /** Shift applied to the plan to line it up with the save (in tiles). */
  offset: [number, number];
  types: TypeResult[];
  buildings: TypeResult[];
  /** Planned tiles in save coordinates. */
  cells: PlanCell[];
  /** Your things outside the plan: x, y, names. */
  extra: Array<[number, number, string[]]>;
  done: number;
  total: number;
}

/** Kinds of planned things, so the user can leave some out of the comparison. */
export const CATEGORIES = ['crops', 'fences', 'grass', 'floors', 'trees', 'decor', 'machines'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface CompareOptions {
  /** Categories left out entirely. */
  ignore?: Set<Category>;
  /** Count any crop or tilled soil where the plan has a crop (keeps the planting areas, not the exact crop). */
  anyCrop?: boolean;
}

/** Slugs of every seed and harvest, to tell crops apart from other things. */
function cropSlugs(): Set<string> {
  const out = new Set<string>();
  for (const c of gameData().farm.crops) {
    for (const id of [c.seed, c.harvest]) {
      const n = getItem(id)?.n[0];
      if (n) out.add(slug(n));
    }
  }
  return out;
}

/** Which category a planner type belongs to. */
export function categoryOf(type: string, crops = cropSlugs()): Category {
  if (crops.has(type)) return 'crops';
  if (type.endsWith('-fence') || type === 'gate') return 'fences';
  if (type === 'grass') return 'grass';
  if (TYPE_ITEM[type] || Object.values(FLOOR).includes(type)) return 'floors';
  if (type.endsWith('-tree')) return 'trees';
  for (const [id, item] of Object.entries(gameData().items)) if (id.startsWith('(F)') && slug(item.n[0]) === type) return 'decor';
  if (['tub-o\'-flowers', 'seasonal-decor', 'seasonal-plant', 'stardew-hero-trophy', 'solid-gold-lewis'].includes(type)) return 'decor';
  return 'machines';
}

/** Lines the plan up with the save (the planner's map may be shifted a few tiles) and compares. */
export function comparePlan(plan: PlannerPlan, layout: LayoutState | undefined, options: CompareOptions = {}): Comparison {
  const crops = cropSlugs();
  const saved = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  for (const [x, y, key] of layout?.tiles ?? []) {
    const keys = saveKeys(key);
    // Any crop or tilled soil can stand for a planned crop when only the planting areas matter.
    if (options.anyCrop && (key === 'hoedirt' || key.startsWith('crop:'))) keys.push('planting-area');
    const set = saved.get(`${x},${y}`) ?? new Set<string>();
    for (const k of keys) {
      set.add(k);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    saved.set(`${x},${y}`, set);
  }
  const category = new Map<string, Category>();
  const cat = (type: string) => {
    if (!category.has(type)) category.set(type, categoryOf(type, crops));
    return category.get(type)!;
  };
  const planned = [...plan.tiles, ...plan.flooring]
    .map((t) => ({ x: Math.round(t.x / 16), y: Math.round(t.y / 16), type: canon(t.type) }))
    .filter((p) => !options.ignore?.has(cat(p.type)))
    .map((p) => (options.anyCrop && cat(p.type) === 'crops' ? { ...p, type: 'planting-area' } : p));

  // Pick the shift with the most matches (ties keep the smallest shift).
  let best: [number, number] = [0, 0];
  let bestScore = -1;
  for (let dx = -10; dx <= 10; dx++) {
    for (let dy = -10; dy <= 10; dy++) {
      let score = 0;
      for (const p of planned) if (saved.get(`${p.x + dx},${p.y + dy}`)?.has(p.type)) score++;
      if (score > bestScore || (score === bestScore && Math.abs(dx) + Math.abs(dy) < Math.abs(best[0]) + Math.abs(best[1]))) {
        bestScore = score;
        best = [dx, dy];
      }
    }
  }

  // Some things are drawn from a different corner in the planner (trees by the top of their sprite),
  // so each type may need its own small extra shift on top of the global one.
  const typeShift = new Map<string, [number, number]>();
  for (const type of new Set(planned.map((p) => p.type))) {
    const list = planned.filter((p) => p.type === type);
    const score = (sx: number, sy: number) => list.filter((p) => saved.get(`${p.x + best[0] + sx},${p.y + best[1] + sy}`)?.has(type)).length;
    let top = score(0, 0);
    let shift: [number, number] = [0, 0];
    for (let sx = -3; sx <= 3; sx++) {
      for (let sy = -6; sy <= 6; sy++) {
        const s = score(sx, sy);
        if (s > top) {
          top = s;
          shift = [sx, sy];
        }
      }
    }
    typeShift.set(type, shift);
  }

  const [dx, dy] = best;
  const byType = new Map<string, TypeResult>();
  const cells: Comparison['cells'] = [];
  const plannedSpots = new Set<string>();
  for (const p of planned) {
    const [sx, sy] = typeShift.get(p.type) ?? [0, 0];
    const x = p.x + dx + sx;
    const y = p.y + dy + sy;
    const here = saved.get(`${x},${y}`);
    const ok = !!here?.has(p.type);
    cells.push({ x, y, type: p.type, done: ok, actual: [...(here ?? [])].filter((k) => k !== 'planting-area') });
    plannedSpots.add(`${x},${y}`);
    const r = byType.get(p.type) ?? { type: p.type, planned: 0, inPlace: 0, have: counts.get(p.type) ?? 0 };
    r.planned++;
    if (ok) r.inPlace++;
    byType.set(p.type, r);
  }
  const extra = (layout?.tiles ?? [])
    .filter(([x, y, key]) => key !== 'grass' && key !== 'hoedirt' && !plannedSpots.has(`${x},${y}`))
    .map(([x, y, key]) => [x, y, saveKeys(key)] as [number, number, string[]]);

  const builtCounts = new Map<string, number>();
  for (const [, , type] of layout?.buildings ?? []) builtCounts.set(type, (builtCounts.get(type) ?? 0) + 1);
  const plannedBuildings = new Map<string, number>();
  for (const b of plan.buildings) plannedBuildings.set(b.type, (plannedBuildings.get(b.type) ?? 0) + 1);
  const buildings = [...plannedBuildings].map(([type, n]) => ({ type, planned: n, inPlace: Math.min(n, builtCounts.get(type) ?? 0), have: builtCounts.get(type) ?? 0 }));

  const types = [...byType.values()].sort((a, b) => b.planned - b.inPlace - (a.planned - a.inPlace) || b.planned - a.planned);
  return { offset: best, types, buildings, cells, extra, done: cells.filter((c) => c.done).length, total: cells.length };
}

/** Planner floors and paths named differently from their items. */
export const TYPE_ITEM: Record<string, string> = {
  cobblestone: '(O)411',
  'steppingstone-path': '(O)415',
  'wooden-floor': '(O)328',
  'wooden-path': '(O)405',
  'stone-floor': '(O)329',
  'weathered-floor': '(O)331',
  'crystal-floor': '(O)333',
  'straw-floor': '(O)401',
  'gravel-path': '(O)407',
  'crystal-path': '(O)409',
  'brick-floor': '(O)293',
  'rustic-plank-floor': '(O)840',
  'stone-walkway-floor': '(O)841',
};

/** A readable name for a planner type: a known label, the game item with that name, else the type itself. */
export function plannerName(type: string, name: (n: [string, string] | undefined) => string, label?: (type: string) => string | undefined): string {
  const known = label?.(type);
  if (known) return known;
  if (TYPE_ITEM[type]) return name(getItem(TYPE_ITEM[type])?.n);
  const items = gameData().items;
  for (const item of Object.values(items)) if (slug(item.n[0]) === type) return name(item.n);
  const buildings = (gameData().shops as { buildings: Array<{ id: string; n: [string, string] }> }).buildings;
  const b = buildings.find((x) => slug(x.id) === type);
  if (b) return name(b.n);
  return type.replace(/-/g, ' ');
}

/** One thing on a map: a tile, or a building's top-left tile (building: true). */
export interface MapEntry {
  x: number;
  y: number;
  /** Planner-style names, for the tooltip. */
  names: string[];
  /** A Category, or 'soil' (tilled ground) / 'buildings'. */
  category: string;
  building?: boolean;
}

/** Category per name, looked up once per name (the lookup scans every item). */
function categoryMemo() {
  const memo = new Map<string, string>();
  return (name: string) => {
    let c = memo.get(name);
    if (c === undefined) {
      c = categoryOf(name);
      memo.set(name, c);
    }
    return c;
  };
}

/** Everything in a planner layout, as it is drawn (no comparison with the save). */
export function planEntries(plan: PlannerPlan, offset: [number, number] = [0, 0]): MapEntry[] {
  const category = categoryMemo();
  const out: MapEntry[] = [];
  for (const t of [...plan.tiles, ...plan.flooring]) {
    const type = canon(t.type);
    out.push({ x: Math.round(t.x / 16) + offset[0], y: Math.round(t.y / 16) + offset[1], names: [type], category: category(type) });
  }
  for (const b of plan.buildings) out.push({ x: Math.round(b.x / 16) + offset[0], y: Math.round(b.y / 16) + offset[1], names: [b.type], category: 'buildings', building: true });
  return out;
}

/** The planned things that aren't there yet, where the plan puts them in the save (shown faded on the farm). */
export function missingEntries(result: Comparison): MapEntry[] {
  const category = categoryMemo();
  return result.cells.filter((c) => !c.done).map((c) => ({ x: c.x, y: c.y, names: [c.type], category: category(c.type) }));
}

/** Everything in the save's layout, as it is drawn. */
export function farmEntries(layout: LayoutState | undefined): MapEntry[] {
  const category = categoryMemo();
  const out: MapEntry[] = [];
  for (const [x, y, key] of layout?.tiles ?? []) {
    if (key === 'hoedirt') {
      out.push({ x, y, names: ['tilled-soil'], category: 'soil' });
      continue;
    }
    const names = saveKeys(key);
    out.push({ x, y, names: names.length ? names : [key], category: names.length ? category(names[0]) : 'machines' });
  }
  for (const [x, y, type] of layout?.buildings ?? []) out.push({ x, y, names: [type], category: 'buildings', building: true });
  return out;
}
