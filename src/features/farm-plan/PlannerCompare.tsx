import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameName } from '@/i18n';
import type { SaveData } from '@/save/model';
import { Progress } from '@/ui';
import { comparePlan, fetchPlan, parsePlanJson, planApiUrl, planId, plannerName, type Comparison, type PlannerPlan } from './planner';

/** The two maps a plan can be for: the farm and the island farm. */
const SLOTS = [
  { id: 'farm', location: 'Farm' },
  { id: 'island', location: 'IslandWest' },
] as const;

const storageKey = (slot: string) => `hv-planner-${slot}`;

interface Stored {
  link: string;
  plan: PlannerPlan;
}

function readStored(slot: string): Stored | null {
  try {
    const raw = localStorage.getItem(storageKey(slot));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

/** Planned tiles over the map: green = done, red = still to do, dots = things you placed outside the plan. */
function PlanMap({ result }: { result: Comparison }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const CELL = 6;
  const xs = [...result.cells.map((c) => c[0]), ...result.extra.map((c) => c[0])];
  const ys = [...result.cells.map((c) => c[1]), ...result.extra.map((c) => c[1])];
  const minX = Math.min(...xs, 0);
  const minY = Math.min(...ys, 0);
  const w = Math.max(...xs, 1) - minX + 1;
  const h = Math.max(...ys, 1) - minY + 1;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w * CELL, h * CELL);
    ctx.fillStyle = 'rgba(91, 43, 21, 0.25)';
    for (const [x, y] of result.extra) ctx.fillRect((x - minX) * CELL + 2, (y - minY) * CELL + 2, CELL - 4, CELL - 4);
    for (const [x, y, ok] of result.cells) {
      ctx.fillStyle = ok ? '#3a8f2a' : '#c0392b';
      ctx.fillRect((x - minX) * CELL, (y - minY) * CELL, CELL - 1, CELL - 1);
    }
  }, [result, w, h, minX, minY]);
  return <canvas ref={ref} className="plan-map inset" width={w * CELL} height={h * CELL} />;
}

function Slot({ slot, save }: { slot: (typeof SLOTS)[number]; save: SaveData }) {
  const { t, i18n } = useTranslation();
  const name = useGameName();
  const label = (type: string) => (i18n.exists(`planner.names.${type}`) ? t(`planner.names.${type}`) : undefined);
  const [stored, setStored] = useState<Stored | null>(() => readStored(slot.id));
  const [input, setInput] = useState(stored?.link ?? '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'needsPaste' | 'error'>('idle');
  const [pasted, setPasted] = useState('');
  const id = planId(input);

  const keep = (plan: PlannerPlan, link: string) => {
    const value = { link, plan };
    setStored(value);
    setStatus('idle');
    try {
      localStorage.setItem(storageKey(slot.id), JSON.stringify(value));
    } catch {
      // Too big or private mode: it still works until the page closes.
    }
  };

  const load = async () => {
    const direct = parsePlanJson(input);
    if (direct) return keep(direct, '');
    if (!id) return setStatus('error');
    setStatus('loading');
    try {
      keep(await fetchPlan(id), input.trim());
    } catch {
      // stardew.info doesn't let other sites read plans, so the user pastes the plan's data instead.
      setStatus('needsPaste');
    }
  };

  const usePasted = () => {
    const plan = parsePlanJson(pasted);
    if (plan) keep(plan, input.trim());
    else setStatus('error');
  };

  const result = useMemo(() => (stored ? comparePlan(stored.plan, save.layouts[slot.location]) : null), [stored, save, slot.location]);

  return (
    <section className="shop__group planner-slot">
      <h3 className="shop__group-title">{t(`planner.slot.${slot.id}`)}</h3>
      <div className="planner-slot__load">
        <input className="shops__search" placeholder={t('planner.linkPlaceholder')} value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="button button--primary" onClick={() => void load()} disabled={status === 'loading'}>
          {t('planner.load')}
        </button>
        {stored && (
          <button
            className="button"
            onClick={() => {
              setStored(null);
              setInput('');
              try {
                localStorage.removeItem(storageKey(slot.id));
              } catch {
                // nothing stored
              }
            }}
          >
            {t('planner.remove')}
          </button>
        )}
      </div>
      {status === 'error' && <p className="farm-warn">{t('planner.bad')}</p>}
      {status === 'needsPaste' && id && (
        <div className="box planner-paste">
          <p>
            {t('planner.pasteStep1')}{' '}
            <a href={planApiUrl(id)} target="_blank" rel="noreferrer">
              {planApiUrl(id)}
            </a>
          </p>
          <p>{t('planner.pasteStep2')}</p>
          <textarea className="planner-paste__text" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <button className="button button--primary" onClick={usePasted}>
            {t('planner.usePasted')}
          </button>
        </div>
      )}

      {result && (
        <>
          <p className="cc-summary__hint">{t('planner.summary', { done: result.done, total: result.total, pct: result.total ? Math.round((result.done / result.total) * 100) : 0 })}</p>
          <Progress value={result.done} max={result.total || 1} />
          <div className="planner-result">
            <PlanMap result={result} />
            <div>
              {result.buildings.length > 0 && (
                <>
                  <h4>{t('planner.buildings')}</h4>
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
              <h4>{t('planner.items')}</h4>
              <ul className="shop__items dashed-list planner-list">
                {result.types.map((r) => (
                  <li key={r.type} className={r.inPlace >= r.planned ? 'planner-row planner-row--done' : 'planner-row'}>
                    <span>{plannerName(r.type, name, label)}</span>
                    <span>{t('planner.inPlace', { inPlace: r.inPlace, planned: r.planned, have: r.have })}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="cc-summary__hint">{t('planner.legend')}</p>
        </>
      )}
    </section>
  );
}

/** Compare Stardew Planner layouts (farm and island) with what's actually placed in the save. */
export function PlannerCompare({ save }: { save: SaveData }) {
  return (
    <div>
      {SLOTS.map((slot) => (
        <Slot key={slot.id} slot={slot} save={save} />
      ))}
    </div>
  );
}
