import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameName } from '@/i18n';
import type { SharedPlan } from '@/features/share/protocol';
import { useShareStore } from '@/features/share/room';
import type { SaveData } from '@/save/model';
import { Progress } from '@/ui';
import { usePanZoom } from '@/ui/usePanZoom';
import { backgroundFor, BUILDING_SPAN, loadSheet, mapBounds, minTiles, planBuildingsToTopLeft, sheetImage, spriteBox, spriteFor, TILE, type Bounds, type SpriteRef } from './mapSprites';
import { CATEGORIES, comparePlan, farmEntries, fetchPlan, parsePlanJson, planApiUrl, planEntries, planId, plannerName, type ArtContext, type Category, type Comparison, type MapEntry, type PlannerPlan } from './planner';
import '@/features/map/map.css';

/** The two maps a plan can be for: the farm and the island farm. */
const SLOTS = [
  { id: 'farm', location: 'Farm' },
  { id: 'island', location: 'IslandWest' },
] as const;
type SlotId = (typeof SLOTS)[number]['id'];

const storageKey = (slot: string) => `hv-planner-${slot}`;
const OPTIONS_KEY = 'hv-planner-options';

/** compare: plan vs save (green/red). plan: the whole planned layout. farm: the whole farm as it is now. */
type ViewId = 'compare' | 'plan' | 'farm';
const VIEWS: ViewId[] = ['compare', 'plan', 'farm'];

interface Stored {
  link: string;
  plan: PlannerPlan;
}

interface Options {
  ignore: Category[];
  anyCrop: boolean;
  show: 'all' | 'missing' | 'done';
}

const load = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Too big or private mode: it still works until the page closes.
  }
};

/** A plan the host shared, as this page keeps it. */
const fromShared = (p: SharedPlan | undefined): Stored | null => {
  const plan = p ? parsePlanJson(p.data) : null;
  return p && plan ? { link: p.link, plan } : null;
};

/** The planned tiles over the map: green = done, red = to do, dots = your things outside the plan. Zoom and drag like the villager map. */
function PlanMap({ result, show, describe, bounds }: { result: Comparison; show: Options['show']; describe: (types: string[]) => string; bounds: Bounds }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const { view, viewport, handlers, zoomIn, zoomOut, reset } = usePanZoom();
  const [hover, setHover] = useState<{ x: number; y: number; px: number; py: number; vw: number; vh: number } | null>(null);
  const CELL = 8;
  const { minX, minY, w, h } = bounds;
  const cellAt = useMemo(() => new Map(result.cells.map((c) => [`${c.x},${c.y}`, c])), [result]);
  const extraAt = useMemo(() => new Map(result.extra.map((c) => [`${c[0]},${c[1]}`, c[2]])), [result]);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w * CELL, h * CELL);
    // A faint grid so tiles can be counted when zoomed in.
    ctx.fillStyle = 'rgba(91, 43, 21, 0.06)';
    for (let x = 0; x < w; x += 2) ctx.fillRect(x * CELL, 0, CELL, h * CELL);
    ctx.fillStyle = 'rgba(91, 43, 21, 0.3)';
    if (show === 'all') for (const [x, y] of result.extra) ctx.fillRect((x - minX) * CELL + 2, (y - minY) * CELL + 2, CELL - 4, CELL - 4);
    for (const c of result.cells) {
      if ((show === 'missing' && c.done) || (show === 'done' && !c.done)) continue;
      ctx.fillStyle = c.done ? '#3a8f2a' : '#c0392b';
      ctx.fillRect((c.x - minX) * CELL, (c.y - minY) * CELL, CELL - 1, CELL - 1);
    }
  }, [result, w, h, minX, minY, show]);

  const onMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * w) + minX;
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * h) + minY;
    const box = viewport.current?.getBoundingClientRect();
    setHover({ x, y, px: e.clientX - (box?.left ?? 0), py: e.clientY - (box?.top ?? 0), vw: box?.width ?? 0, vh: box?.height ?? 0 });
  };
  const cell = hover ? cellAt.get(`${hover.x},${hover.y}`) : undefined;
  const extra = hover ? extraAt.get(`${hover.x},${hover.y}`) : undefined;

  return (
    <div className="map-frame panel plan-frame">
      <div className="map-zoom">
        <button className="button" onClick={zoomIn} aria-label={t('map.zoomIn')}>
          +
        </button>
        <button className="button" onClick={zoomOut} aria-label={t('map.zoomOut')}>
          −
        </button>
        {view.zoom > 1 && (
          <button className="button" onClick={reset}>
            {t('map.zoomReset')}
          </button>
        )}
      </div>
      <div ref={viewport} className={view.zoom > 1 ? 'map-viewport map-viewport--zoomed' : 'map-viewport'} style={{ aspectRatio: `${w} / ${h}` }} {...handlers}>
        <div className="map-canvas" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
          <canvas ref={ref} className="plan-map" width={w * CELL} height={h * CELL} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </div>
        {hover && (cell || extra) && (
          <span className="plan-tip box" style={tipPosition(hover)}>
            <strong>
              ({hover.x}, {hover.y})
            </strong>
            {cell && <span>{t('planner.tipPlanned', { name: describe([cell.type]) })}</span>}
            {cell && <span>{cell.done ? t('planner.tipDone') : t('planner.tipHas', { name: cell.actual.length ? describe(cell.actual) : t('planner.nothing') })}</span>}
            {!cell && extra && <span>{t('planner.tipExtra', { name: describe(extra) })}</span>}
          </span>
        )}
      </div>
    </div>
  );
}

/** Keeps the tooltip inside the map: it opens toward the side with more room. */
function tipPosition(h: { px: number; py: number; vw: number; vh: number }): CSSProperties {
  return {
    ...(h.px > h.vw / 2 ? { right: h.vw - h.px + 12 } : { left: h.px + 12 }),
    ...(h.py > h.vh / 2 ? { bottom: h.vh - h.py + 12 } : { top: h.py + 12 }),
  };
}

/** Colors of the squares drawn where the game has no art for something, and of the legend. */
const FULL_COLORS: Record<string, string> = {
  soil: '#8b5a2b',
  grass: '#a8d672',
  floors: '#c9b79c',
  fences: '#8d6e63',
  crops: '#f0b429',
  terrain: '#7d7d7d',
  trees: '#2e7d32',
  decor: '#c678dd',
  machines: '#2f80ed',
  buildings: '#4e342e',
};
/** Drawn in this order, so buildings and machines sit on top of the ground. */
const FULL_ORDER = Object.keys(FULL_COLORS);
const WATER_COLOR = '#3f93b8';

/** One entry placed on the map: its art (if any), where it is drawn, and the tiles it covers. */
interface Placed {
  entry: MapEntry;
  ref: SpriteRef | null;
  x: number;
  y: number;
  w: number;
  h: number;
  foot: [number, number];
}

/** Where an entry is drawn: its art when there is some, else a square on its tiles. */
function place(entry: MapEntry): Placed {
  const sprite = spriteFor(entry);
  if (sprite) return { entry, ref: sprite, ...spriteBox(entry, sprite), foot: sprite.foot };
  const span = entry.building ? BUILDING_SPAN : 1;
  return { entry, ref: null, x: entry.x * TILE, y: entry.y * TILE, w: span * TILE - 1, h: span * TILE - 1, foot: [span, span] };
}

const byLayer = (a: MapEntry, b: MapEntry) => FULL_ORDER.indexOf(a.category) - FULL_ORDER.indexOf(b.category) || a.y - b.y || a.x - b.x;

/** Every object of a layout drawn with the game's own art, over the game's own ground when it is there. Zoom and drag like the other maps. */
function FullMap({
  entries,
  ignore,
  bounds,
  background,
  describe,
  label,
}: {
  entries: MapEntry[];
  ignore: Set<string>;
  bounds: Bounds;
  /** The game's map picture (ground, water, cliffs), when tools/extract has made it. */
  background?: string;
  describe: (types: string[]) => string;
  label: (category: string) => string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const { view, viewport, handlers, zoomIn, zoomOut, reset } = usePanZoom();
  const [hover, setHover] = useState<{ x: number; y: number; px: number; py: number; vw: number; vh: number } | null>(null);
  const [loaded, setLoaded] = useState(0);
  const { minX, minY, w, h } = bounds;
  const placed = useMemo(() => entries.filter((e) => !ignore.has(e.category)).sort(byLayer).map(place), [entries, ignore]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of placed) m.set(p.entry.category, (m.get(p.entry.category) ?? 0) + 1);
    return FULL_ORDER.filter((c) => m.has(c)).map((c) => ({ c, n: m.get(c)! }));
  }, [placed]);

  // Sprite sheets and the map picture load once; the map redraws when they are in.
  useEffect(() => {
    let alive = true;
    const sheets = new Set(placed.flatMap((p) => (p.ref ? [p.ref.sheet] : [])));
    if (background) sheets.add(background);
    void Promise.all([...sheets].map(loadSheet)).then(() => {
      if (alive) setLoaded((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [placed, background]);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w * TILE, h * TILE);
    const ox = minX * TILE;
    const oy = minY * TILE;
    const ground = background ? sheetImage(background) : undefined;
    if (ground) {
      ctx.drawImage(ground, -ox, -oy);
    } else {
      // No map picture: a faint grid so tiles can be counted when zoomed in.
      ctx.fillStyle = 'rgba(91, 43, 21, 0.06)';
      for (let x = 0; x < w; x += 2) ctx.fillRect(x * TILE, 0, TILE, h * TILE);
    }
    const draw = (p: Placed, alpha: number) => {
      const image = p.ref ? sheetImage(p.ref.sheet) : undefined;
      if (p.ref && image) {
        ctx.globalAlpha = alpha;
        if (p.ref.water) {
          ctx.fillStyle = WATER_COLOR;
          ctx.fillRect(p.x - ox + p.ref.water[0], p.y - oy + p.ref.water[1], p.ref.water[2], p.ref.water[3]);
        }
        if (p.ref.layers) {
          // A picture made of pieces (a full tree's trunk and crown).
          for (const [sx, sy, sw, sh, dx, dy] of p.ref.layers) ctx.drawImage(image, sx, sy, sw, sh, p.entry.x * TILE - ox + dx, p.entry.y * TILE - oy + dy, sw, sh);
        } else {
          ctx.drawImage(image, p.ref.x, p.ref.y, p.ref.w, p.ref.h, p.x - ox, p.y - oy, p.w, p.h);
        }
      } else if (!(ground && p.entry.category === 'grass')) {
        // No art (tilled soil, things the game files here don't have), or the sheet isn't in yet: a colored square on its tiles.
        ctx.globalAlpha = (p.entry.category === 'grass' ? 0.5 : 1) * alpha;
        ctx.fillStyle = FULL_COLORS[p.entry.category];
        ctx.fillRect(p.entry.x * TILE - ox, p.entry.y * TILE - oy, p.foot[0] * TILE - 1, p.foot[1] * TILE - 1);
      }
      ctx.globalAlpha = 1;
    };
    for (const p of placed) draw(p, 1);
  }, [placed, background, w, h, minX, minY, loaded]);

  const onMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * w) + minX;
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * h) + minY;
    const box = viewport.current?.getBoundingClientRect();
    setHover({ x, y, px: e.clientX - (box?.left ?? 0), py: e.clientY - (box?.top ?? 0), vw: box?.width ?? 0, vh: box?.height ?? 0 });
  };
  const covers = (p: Placed) => !!hover && hover.x >= p.entry.x && hover.x < p.entry.x + p.foot[0] && hover.y >= p.entry.y && hover.y < p.entry.y + p.foot[1];
  // Grass is left out of the tooltip, and soil too when something stands on it.
  const under = hover ? placed.filter((p) => p.entry.category !== 'grass' && covers(p)) : [];
  const here = under.some((p) => p.entry.category !== 'soil') ? under.filter((p) => p.entry.category !== 'soil') : under;

  return (
    <div className="planner-full">
      <div className="map-frame panel plan-frame">
        <div className="map-zoom">
          <button className="button" onClick={zoomIn} aria-label={t('map.zoomIn')}>
            +
          </button>
          <button className="button" onClick={zoomOut} aria-label={t('map.zoomOut')}>
            −
          </button>
          {view.zoom > 1 && (
            <button className="button" onClick={reset}>
              {t('map.zoomReset')}
            </button>
          )}
        </div>
        <div ref={viewport} className={view.zoom > 1 ? 'map-viewport map-viewport--zoomed' : 'map-viewport'} style={{ aspectRatio: `${w} / ${h}` }} {...handlers}>
          <div className="map-canvas" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            <canvas
              ref={ref}
              className="plan-map"
              style={{ imageRendering: 'pixelated' }}
              width={w * TILE}
              height={h * TILE}
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            />
          </div>
          {hover && here.length > 0 && (
            <span className="plan-tip box" style={tipPosition(hover)}>
              <strong>
                ({hover.x}, {hover.y})
              </strong>
              {here.map((p, i) => (
                <span key={i}>
                  {label(p.entry.category)}: {describe(p.entry.names)}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
      <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', listStyle: 'none', padding: 0, margin: '8px 0' }}>
        {counts.map(({ c, n }) => (
          <li key={c} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: FULL_COLORS[c] }} />
            {label(c)} · {n}
          </li>
        ))}
      </ul>
      <p className="cc-summary__hint">{t('planner.artNote')}</p>
    </div>
  );
}

function SlotView({ slot, saveData, stored, setStored, options, setOptions, readOnly }: {
  slot: (typeof SLOTS)[number];
  saveData: SaveData;
  stored: Stored | null;
  setStored: (s: Stored | null) => void;
  options: Options;
  setOptions: (o: Options) => void;
  /** Farmhands: they see the host's plan but can't load or change it. */
  readOnly: boolean;
}) {
  const { t, i18n } = useTranslation();
  const name = useGameName();
  const label = (type: string) => (type === 'planting-area' ? t('planner.plantingArea') : i18n.exists(`planner.names.${type}`) ? t(`planner.names.${type}`) : undefined);
  const describe = (types: string[]) => [...new Set(types.map((x) => plannerName(x, name, label)))].join(', ');
  const [input, setInput] = useState(stored?.link ?? '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'needsCopy' | 'error'>('idle');
  const [pasted, setPasted] = useState('');
  const [view, setView] = useState<ViewId>('compare');
  const id = planId(input);

  const keep = (plan: PlannerPlan, link: string) => {
    setStored({ link, plan });
    setStatus('idle');
  };

  const loadPlan = async () => {
    const direct = parsePlanJson(input);
    if (direct) return keep(direct, '');
    if (!id) return setStatus('error');
    setStatus('loading');
    try {
      keep(await fetchPlan(id), input.trim());
    } catch {
      // stardew.info doesn't let other sites read plans: open the data, copy it, and come back.
      setStatus('needsCopy');
    }
  };

  // Back from the plan's data page: read what was copied (the browser may ask once).
  useEffect(() => {
    if (status !== 'needsCopy') return;
    const onFocus = () => {
      void navigator.clipboard
        ?.readText()
        .then((text) => {
          const plan = parsePlanJson(text);
          if (plan) keep(plan, input.trim());
        })
        .catch(() => undefined);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  });

  const result = useMemo(
    () => (stored ? comparePlan(stored.plan, saveData.layouts[slot.location], { ignore: new Set(options.ignore), anyCrop: options.anyCrop }) : null),
    [stored, saveData, slot.location, options.ignore, options.anyCrop],
  );
  // The plan is lined up with the farm (the planner's map may be shifted a few tiles), so both sit on the same ground.
  const houseLevel = saveData.players[0]?.houseUpgradeLevel ?? 0;
  const season = Math.max(0, ['spring', 'summer', 'fall', 'winter'].indexOf(saveData.date.season));
  const art = useMemo<ArtContext>(() => ({ houseLevel, season }), [houseLevel, season]);
  const planMap = useMemo(() => (stored ? planBuildingsToTopLeft(planEntries(stored.plan, result?.offset, art)) : []), [stored, result, art]);
  const farmMap = useMemo(() => farmEntries(saveData.layouts[slot.location], art), [saveData, slot.location, art]);
  // One window for every view, so the map keeps its size when the view changes.
  const bounds = useMemo(
    () => mapBounds([...farmMap, ...planMap], result?.cells.map((c) => [c.x, c.y] as [number, number]) ?? [], minTiles(slot.id, saveData.farmType)),
    [farmMap, planMap, result, slot.id],
  );
  const background = backgroundFor(slot.id, saveData.farmType);
  const ignoreSet = useMemo(() => new Set<string>(options.ignore), [options.ignore]);
  const categoryLabel = (c: string) => t(`planner.cat.${c}`);
  // Without a loaded plan only the farm can be shown.
  const shownView: ViewId = view !== 'farm' && !result ? 'farm' : view;
  const toggleIgnore = (c: Category) => setOptions({ ...options, ignore: options.ignore.includes(c) ? options.ignore.filter((x) => x !== c) : [...options.ignore, c] });
  const missing = result?.types.filter((r) => r.inPlace < r.planned) ?? [];
  const done = result?.types.filter((r) => r.inPlace >= r.planned) ?? [];

  return (
    <div className="planner-slot">
      {readOnly ? (
        <p className="cc-summary__hint">{t('planner.viewOnly')}</p>
      ) : (
      <div className="planner-slot__load">
        <input className="shops__search" placeholder={t('planner.linkPlaceholder')} value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="button button--primary" onClick={() => void loadPlan()} disabled={status === 'loading'}>
          {status === 'loading' ? t('planner.loading') : t('planner.load')}
        </button>
        {stored && (
          <button
            className="button"
            onClick={() => {
              setStored(null);
              setInput('');
            }}
          >
            {t('planner.remove')}
          </button>
        )}
      </div>
      )}
      {status === 'error' && <p className="farm-warn">{t('planner.bad')}</p>}
      {status === 'needsCopy' && id && (
        <div className="box planner-paste">
          <p>{t('planner.copyHow')}</p>
          <a className="button button--primary" href={planApiUrl(id)} target="_blank" rel="noreferrer">
            {t('planner.openData')}
          </a>
          <details>
            <summary>{t('planner.pasteManual')}</summary>
            <textarea className="planner-paste__text" rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <button className="button" onClick={() => (parsePlanJson(pasted) ? keep(parsePlanJson(pasted)!, input.trim()) : setStatus('error'))}>
              {t('planner.usePasted')}
            </button>
          </details>
        </div>
      )}

      {!stored && status === 'idle' && <p className="cc-summary__hint">{t(readOnly ? 'planner.noPlanShared' : 'planner.empty')}</p>}

      <div className="planner-options">
        <span className="tab-group__label">{t('planner.view')}</span>
        {VIEWS.map((v) => (
          <button key={v} className={shownView === v ? 'button button--primary' : 'button'} disabled={v !== 'farm' && !result} onClick={() => setView(v)}>
            {t(`planner.viewOpt.${v}`)}
          </button>
        ))}
      </div>

      <div className="planner-options">
        <span className="tab-group__label">{t('planner.ignore')}</span>
        {CATEGORIES.map((c) => (
          <label key={c} className="cc__filter">
            <input type="checkbox" checked={options.ignore.includes(c)} onChange={() => toggleIgnore(c)} />
            {t(`planner.cat.${c}`)}
          </label>
        ))}
        {shownView === 'compare' && (
          <label className="cc__filter">
            <input type="checkbox" checked={options.anyCrop} onChange={(e) => setOptions({ ...options, anyCrop: e.target.checked })} />
            {t('planner.anyCrop')}
          </label>
        )}
      </div>

      {shownView === 'farm' && !result && <FullMap entries={farmMap} ignore={ignoreSet} bounds={bounds} background={background} describe={describe} label={categoryLabel} />}

      {result && (
        <>
          {shownView === 'compare' && (
            <div className="planner-options">
              <span className="tab-group__label">{t('planner.show')}</span>
              {(['all', 'missing', 'done'] as const).map((s) => (
                <button key={s} className={options.show === s ? 'button button--primary' : 'button'} onClick={() => setOptions({ ...options, show: s })}>
                  {t(`planner.showOpt.${s}`)}
                </button>
              ))}
            </div>
          )}
          {shownView !== 'plan' && (
            <>
              <p className="planner-summary">{t('planner.summary', { done: result.done, total: result.total, pct: result.total ? Math.round((result.done / result.total) * 100) : 0 })}</p>
              <Progress value={result.done} max={result.total || 1} />
            </>
          )}

          <div className="planner-result">
            {shownView === 'compare' ? (
              <PlanMap result={result} show={options.show} describe={describe} bounds={bounds} />
            ) : (
              <FullMap
                entries={shownView === 'farm' ? farmMap : planMap}
                ignore={ignoreSet}
                bounds={bounds}
                background={background}
                describe={describe}
                label={categoryLabel}
              />
            )}
            <div>
              <h4>{t('planner.missing', { count: missing.length })}</h4>
              <ul className="shop__items dashed-list planner-list">
                {missing.map((r) => (
                  <li key={r.type} className="planner-row">
                    <span>{plannerName(r.type, name, label)}</span>
                    <span>{t('planner.left', { count: r.planned - r.inPlace, have: r.have })}</span>
                  </li>
                ))}
              </ul>
              {result.buildings.length > 0 && (
                <>
                  <h4>{t('planner.buildings', { count: result.buildings.length })}</h4>
                  <ul className="shop__items dashed-list planner-list">
                    {result.buildings.map((b) => (
                      <li key={b.type} className={b.have >= b.planned ? 'planner-row planner-row--done' : 'planner-row'}>
                        <span>{plannerName(b.type, name, label)}</span>
                        <span>{t('planner.count', { have: b.have, planned: b.planned })}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {done.length > 0 && (
                <details>
                  <summary>{t('planner.doneList', { count: done.length })}</summary>
                  <ul className="shop__items dashed-list planner-list">
                    {done.map((r) => (
                      <li key={r.type} className="planner-row planner-row--done">
                        <span>{plannerName(r.type, name, label)}</span>
                        <span>{r.planned}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Compare Stardew Planner layouts (farm and island) with what's actually placed in the save. */
export function PlannerCompare({ save: saveData }: { save: SaveData }) {
  const { t } = useTranslation();
  const [slot, setSlot] = useState<SlotId>('farm');
  const [plans, setPlans] = useState<Record<SlotId, Stored | null>>(() => ({ farm: load(storageKey('farm'), null), island: load(storageKey('island'), null) }));
  const role = useShareStore((s) => s.role);
  const status = useShareStore((s) => s.status);
  const sharedPlans = useShareStore((s) => s.plans);
  const sharePlan = useShareStore((s) => s.sharePlan);
  const guest = role === 'guest';
  // Farmhands see the host's plans; their own come back when they leave the room.
  const shownPlans = useMemo<Record<SlotId, Stored | null>>(
    () => (guest ? { farm: fromShared(sharedPlans.farm), island: fromShared(sharedPlans.island) } : plans),
    [guest, sharedPlans, plans],
  );
  const [options, setOptionsState] = useState<Options>(() => ({ ignore: [], anyCrop: false, show: 'all', ...load<Partial<Options>>(OPTIONS_KEY, {}) }));
  const setOptions = (o: Options) => {
    setOptionsState(o);
    save(OPTIONS_KEY, o);
  };
  const setStored = (id: SlotId, s: Stored | null) => {
    setPlans((p) => ({ ...p, [id]: s }));
    save(storageKey(id), s);
    if (role === 'host') sharePlan(id, s ? { data: JSON.stringify(s.plan), link: s.link } : null);
  };

  // The host's plans go to the room once it's open, and again after a reconnect.
  useEffect(() => {
    if (role !== 'host' || status !== 'hosting') return;
    for (const s of SLOTS) {
      const p = plans[s.id];
      sharePlan(s.id, p ? { data: JSON.stringify(p.plan), link: p.link } : null);
    }
  }, [role, status]);

  const current = SLOTS.find((s) => s.id === slot)!;
  return (
    <div className="planner">
      <div className="planner-head">
        <div className="calendar__nav" role="tablist">
          {SLOTS.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === slot} className={s.id === slot ? 'button button--primary' : 'button'} onClick={() => setSlot(s.id)}>
              {t(`planner.slot.${s.id}`)}
              {shownPlans[s.id] ? ' ✓' : ''}
            </button>
          ))}
        </div>
      </div>
      <SlotView key={slot} slot={current} saveData={saveData} stored={shownPlans[slot]} setStored={(s) => setStored(slot, s)} options={options} setOptions={setOptions} readOnly={guest} />
    </div>
  );
}
