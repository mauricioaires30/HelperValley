import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameName } from '@/i18n';
import type { SaveData } from '@/save/model';
import { Progress } from '@/ui';
import { usePanZoom } from '@/ui/usePanZoom';
import { CATEGORIES, comparePlan, fetchPlan, parsePlanJson, planApiUrl, planId, plannerName, type Category, type Comparison, type PlannerPlan } from './planner';
import '@/features/map/map.css';

/** The two maps a plan can be for: the farm and the island farm. */
const SLOTS = [
  { id: 'farm', location: 'Farm' },
  { id: 'island', location: 'IslandWest' },
] as const;
type SlotId = (typeof SLOTS)[number]['id'];

const storageKey = (slot: string) => `hv-planner-${slot}`;
const OPTIONS_KEY = 'hv-planner-options';

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

/** Which slot a plan belongs to, from its map type. */
const slotOf = (plan: PlannerPlan): SlotId => (plan.options?.layout === 'ginger_island' ? 'island' : 'farm');

/** Bookmark to click on a stardew.info plan page: it reads the plan there and sends it to this site. */
function bookmarklet() {
  const target = `${window.location.origin}${import.meta.env.BASE_URL}#/farm/planner`;
  const code = `(async()=>{const id=location.pathname.split('/').filter(Boolean).pop();const d=await (await fetch('/api/'+id)).text();const w=window.open(${JSON.stringify(target)});let n=0;const t=setInterval(()=>{w&&w.postMessage({type:'hv-plan',link:location.href,data:d},'*');if(++n>30)clearInterval(t)},500)})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

/** The planned tiles over the map: green = done, red = to do, dots = your things outside the plan. Zoom and drag like the villager map. */
function PlanMap({ result, show, describe }: { result: Comparison; show: Options['show']; describe: (types: string[]) => string }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const { view, viewport, handlers, zoomIn, zoomOut, reset } = usePanZoom();
  const [hover, setHover] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const CELL = 8;
  const xs = [...result.cells.map((c) => c.x), ...result.extra.map((c) => c[0])];
  const ys = [...result.cells.map((c) => c.y), ...result.extra.map((c) => c[1])];
  const minX = Math.min(...xs, 0);
  const minY = Math.min(...ys, 0);
  const w = Math.max(...xs, 1) - minX + 1;
  const h = Math.max(...ys, 1) - minY + 1;
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
    setHover({ x, y, px: e.clientX - (box?.left ?? 0), py: e.clientY - (box?.top ?? 0) });
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
          <span className="plan-tip box" style={{ left: hover.px + 12, top: hover.py + 12 }}>
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

function SlotView({ slot, saveData, stored, setStored, options, setOptions }: {
  slot: (typeof SLOTS)[number];
  saveData: SaveData;
  stored: Stored | null;
  setStored: (s: Stored | null) => void;
  options: Options;
  setOptions: (o: Options) => void;
}) {
  const { t, i18n } = useTranslation();
  const name = useGameName();
  const label = (type: string) => (type === 'planting-area' ? t('planner.plantingArea') : i18n.exists(`planner.names.${type}`) ? t(`planner.names.${type}`) : undefined);
  const describe = (types: string[]) => [...new Set(types.map((x) => plannerName(x, name, label)))].join(', ');
  const [input, setInput] = useState(stored?.link ?? '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'needsCopy' | 'error'>('idle');
  const [pasted, setPasted] = useState('');
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
  const toggleIgnore = (c: Category) => setOptions({ ...options, ignore: options.ignore.includes(c) ? options.ignore.filter((x) => x !== c) : [...options.ignore, c] });
  const missing = result?.types.filter((r) => r.inPlace < r.planned) ?? [];
  const done = result?.types.filter((r) => r.inPlace >= r.planned) ?? [];

  return (
    <div className="planner-slot">
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

      {!stored && status === 'idle' && <p className="cc-summary__hint">{t('planner.empty')}</p>}

      {result && (
        <>
          <div className="planner-options">
            <span className="tab-group__label">{t('planner.ignore')}</span>
            {CATEGORIES.map((c) => (
              <label key={c} className="cc__filter">
                <input type="checkbox" checked={options.ignore.includes(c)} onChange={() => toggleIgnore(c)} />
                {t(`planner.cat.${c}`)}
              </label>
            ))}
            <label className="cc__filter">
              <input type="checkbox" checked={options.anyCrop} onChange={(e) => setOptions({ ...options, anyCrop: e.target.checked })} />
              {t('planner.anyCrop')}
            </label>
          </div>
          <div className="planner-options">
            <span className="tab-group__label">{t('planner.show')}</span>
            {(['all', 'missing', 'done'] as const).map((s) => (
              <button key={s} className={options.show === s ? 'button button--primary' : 'button'} onClick={() => setOptions({ ...options, show: s })}>
                {t(`planner.showOpt.${s}`)}
              </button>
            ))}
          </div>

          <p className="planner-summary">{t('planner.summary', { done: result.done, total: result.total, pct: result.total ? Math.round((result.done / result.total) * 100) : 0 })}</p>
          <Progress value={result.done} max={result.total || 1} />

          <div className="planner-result">
            <PlanMap result={result} show={options.show} describe={describe} />
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
  const [options, setOptionsState] = useState<Options>(() => ({ ignore: [], anyCrop: false, show: 'all', ...load<Partial<Options>>(OPTIONS_KEY, {}) }));
  const setOptions = (o: Options) => {
    setOptionsState(o);
    save(OPTIONS_KEY, o);
  };
  const setStored = (id: SlotId, s: Stored | null) => {
    setPlans((p) => ({ ...p, [id]: s }));
    save(storageKey(id), s);
  };

  // A plan sent by the bookmark from stardew.info.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://stardew.info' || e.data?.type !== 'hv-plan') return;
      const plan = parsePlanJson(String(e.data.data));
      if (!plan) return;
      const target = slotOf(plan);
      setStored(target, { link: String(e.data.link ?? ''), plan });
      setSlot(target);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });

  const current = SLOTS.find((s) => s.id === slot)!;
  return (
    <div className="planner">
      <div className="planner-head">
        <div className="calendar__nav" role="tablist">
          {SLOTS.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === slot} className={s.id === slot ? 'button button--primary' : 'button'} onClick={() => setSlot(s.id)}>
              {t(`planner.slot.${s.id}`)}
              {plans[s.id] ? ' ✓' : ''}
            </button>
          ))}
        </div>
        <a
          className="button planner-bookmark"
          // React won't render a javascript: href, so it's set on the element directly.
          ref={(el) => el?.setAttribute('href', bookmarklet())}
          onClick={(e) => e.preventDefault()}
          title={t('planner.bookmarkHint')}
        >
          {t('planner.bookmark')}
        </a>
      </div>
      <p className="cc-summary__hint">{t('planner.bookmarkHint')}</p>
      <SlotView key={slot} slot={current} saveData={saveData} stored={plans[slot]} setStored={(s) => setStored(slot, s)} options={options} setOptions={setOptions} />
    </div>
  );
}
