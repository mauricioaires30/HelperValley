import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData, spriteUrl, type Season } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { useCurrentSave } from '@/store/saveStore';
import type { Player } from '@/save/model';
import { NpcHead, SeasonIcon, Tooltip, UiIcon } from '@/ui';
import { SEASONS } from '@/features/calendar/calendar';
import { describeEvent } from '@/features/relationships/eventConditions';
import { formatTime, resolveSchedule, WEEKDAYS, type ScheduleData, type ScheduleResult, type Stop } from './schedule';
import { toMapPixel, type RegionId } from './worldMap';
import './map.css';

/** 6:00 to 2:00 in 10-minute steps, like the game clock. */
const STEPS = Array.from({ length: 20 * 6 + 1 }, (_, i) => 600 + Math.floor(i / 6) * 100 + (i % 6) * 10);
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface Placed {
  npc: string;
  location: string;
  since: number;
  walking: boolean;
  region: RegionId | null;
  px: number;
  py: number;
}

/** Minutes between two game times (1350 → 1410 is 20 minutes). */
const minutesBetween = (a: number, b: number) => (Math.floor(b / 100) * 60 + (b % 100)) - (Math.floor(a / 100) * 60 + (a % 100));

/** Villagers who keep a schedule (shown in the social tab). */
function scheduledNpcs() {
  const { npcs, schedules } = gameData();
  return Object.keys(schedules).filter((npc) => npcs[npc] && npcs[npc].social !== 3);
}

/**
 * Where an NPC is at `time`. After leaving a stop they walk toward the next one, so the
 * position is interpolated for the minutes the trip takes (about one map pixel per minute).
 */
function placeAt(data: ScheduleData, schedule: ScheduleResult, time: number, married: boolean) {
  const start: Stop | null = data.home ? { time: 600, location: data.home[0], x: data.home[1], y: data.home[2] } : null;
  let from = start;
  let to = start;
  for (const stop of schedule.stops) {
    if (stop.time > time) break;
    from = to;
    to = stop;
  }
  if (!to) return null;
  // A spouse without a schedule today stays at the farmhouse.
  const location = married && !schedule.key ? 'Farm' : to.location;
  const end = toMapPixel(gameData().worldMap, location, to.x, to.y);
  if (!end) return { location, since: to.time, walking: false, pixel: null };
  const origin = from && from !== to ? toMapPixel(gameData().worldMap, from.location, from.x, from.y) : null;
  if (origin && origin.region === end.region) {
    const distance = Math.hypot(end.px - origin.px, end.py - origin.py);
    const elapsed = minutesBetween(to.time, time);
    if (elapsed < distance) {
      const k = elapsed / distance;
      return { location, since: to.time, walking: true, pixel: { region: end.region, px: origin.px + (end.px - origin.px) * k, py: origin.py + (end.py - origin.py) * k } };
    }
  }
  return { location, since: to.time, walking: false, pixel: end };
}

/** Heart events this player can trigger on the chosen day and time, from their preconditions. */
function availableEvents(player: Player | null, season: Season, day: number, time: number, raining: boolean) {
  if (!player) return [];
  const { heartEvents } = gameData();
  const seen = new Set(player.eventsSeen);
  const dow = WEEKDAYS[(day - 1) % 7];
  return heartEvents.events.filter((e) => {
    if (seen.has(e.id)) return false;
    const hearts = Math.floor((player.friendships[e.npc]?.points ?? 0) / 250);
    if (hearts < e.hearts) return false;
    return e.conditions.every(([code, ...args]) => {
      if (code === 't') return time >= Number(args[0]) && time < Number(args[1]);
      if (code === 'w') return args[0] === 'rainy' ? raining : !raining;
      if (code === 'z') return !args.includes(season);
      if (code === 'd') return !args.includes(dow);
      if (code === 'O') return player.spouse === args[0];
      if (code === 'o') return player.spouse !== args[0];
      // Earlier events that must have been seen, or must not have been.
      if (code === 'e') return args.every((id) => seen.has(id));
      if (code === 'k') return !args.some((id) => seen.has(id));
      // Letters / story flags the player must have received.
      if (code === 'n' || code === 'Hn') return player.mailReceived.includes(args[0]);
      if (code === 'f') return Math.floor((player.friendships[args[0]]?.points ?? 0) / 250) >= Number(args[1]) / 250;
      return true;
    });
  });
}

/** Zoom with the wheel or buttons; drag to move around once zoomed in. */
function usePanZoom() {
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);

  const clamp = (zoom: number, x: number, y: number) => {
    const rect = viewport.current?.getBoundingClientRect();
    if (!rect) return { zoom, x, y };
    // Keep the map covering the viewport: no empty space past its edges.
    const minX = rect.width - rect.width * zoom;
    const minY = rect.height - rect.height * zoom;
    return { zoom, x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
  };

  const zoomAt = (factor: number, cx?: number, cy?: number) =>
    setView((v) => {
      const rect = viewport.current?.getBoundingClientRect();
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const px = cx ?? (rect ? rect.width / 2 : 0);
      const py = cy ?? (rect ? rect.height / 2 : 0);
      // Zoom around the pointer: the point under it stays put.
      const x = px - ((px - v.x) * zoom) / v.zoom;
      const y = py - ((py - v.y) * zoom) / v.zoom;
      return clamp(zoom, x, y);
    });

  const handlers = {
    onWheel: (e: WheelEvent) => {
      const rect = viewport.current!.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - rect.left, e.clientY - rect.top);
    },
    onPointerDown: (e: PointerEvent) => {
      if (view.zoom === 1) return;
      drag.current = { x: e.clientX, y: e.clientY, startX: view.x, startY: view.y };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: PointerEvent) => {
      const d = drag.current;
      if (d) setView((v) => clamp(v.zoom, d.startX + e.clientX - d.x, d.startY + e.clientY - d.y));
    },
    onPointerUp: () => {
      drag.current = null;
    },
  };

  return { view, viewport, handlers, zoomIn: () => zoomAt(1.5), zoomOut: () => zoomAt(1 / 1.5), reset: () => setView({ zoom: 1, x: 0, y: 0 }) };
}

/**
 * Where every villager is at a chosen time, from their schedules and the day's conditions
 * (season, day, rain, hearts, marriage), plus heart events you can trigger right now.
 */
export function MapPage() {
  const { t } = useTranslation();
  const name = useGameName();
  const { save, player } = useCurrentSave();
  const [region, setRegion] = useState<RegionId>('Valley');
  const [season, setSeason] = useState<Season>(save?.date.season ?? 'spring');
  const [day, setDay] = useState(save?.date.day ?? 1);
  const [step, setStep] = useState(STEPS.indexOf(1200));
  const [raining, setRaining] = useState(save?.isRaining ?? false);
  const [resort, setResort] = useState(save?.resort.openToday ?? false);
  const [layers, setLayers] = useState({ npcs: true, events: true });
  const { view, viewport, handlers, zoomIn, zoomOut, reset } = usePanZoom();
  const time = STEPS[step];

  // Follow the save when it changes (new day, other save).
  useEffect(() => {
    if (!save) return;
    setSeason(save.date.season);
    setDay(save.date.day);
    setRaining(save.isRaining);
    setResort(save.resort.openToday);
  }, [save]);

  const { worldMap, schedules, npcs } = gameData();
  const places = useMemo(() => {
    const out: Placed[] = [];
    for (const npc of scheduledNpcs()) {
      const friendship = player?.friendships[npc];
      const married = player?.spouse === npc;
      const conditions = { season, day, raining, hearts: friendship ? Math.floor(friendship.points / 250) : 0, married };
      const schedule = resolveSchedule(schedules[npc], conditions, npc);
      const place = placeAt(schedules[npc], schedule, time, married);
      if (!place) continue;
      out.push({ npc, location: place.location, since: place.since, walking: place.walking, region: place.pixel?.region ?? null, px: place.pixel?.px ?? 0, py: place.pixel?.py ?? 0 });
    }
    return out;
  }, [player, season, day, raining, time, schedules]);

  const events = useMemo(() => availableEvents(player, season, day, time, raining), [player, season, day, time, raining]);

  const { texture, source } = worldMap.regions[region];
  const [, , mapW, mapH] = source;
  const [sheetW, sheetH] = gameData().sheets[texture] ?? [mapW, mapH];
  const locationName = (location: string) => {
    for (const r of Object.values(worldMap.regions)) {
      const pos = r.positions.find((p) => p.location === location && p.n);
      if (pos?.n) return name(pos.n);
    }
    const known = gameData().museum.places[location] ?? gameData().heartEvents.places[location];
    return known ? name(known) : t(`map.location.${location}`, { defaultValue: location });
  };

  // NPCs standing still in the same building share a spot; fan them out in a small grid.
  const groups = new Map<string, Placed[]>();
  for (const p of places.filter((x) => x.region === region)) {
    const key = p.walking ? p.npc : `${Math.round(p.px)}:${Math.round(p.py)}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const eventPins = events
    .map((e) => ({ e, pixel: toMapPixel(worldMap, e.location, ...(worldMap.sizes[e.location]?.map((n) => n / 2) as [number, number] ?? [0, 0])) }))
    .filter((x) => x.pixel?.region === region);
  const resortVisitors = Object.entries(schedules)
    .filter(([npc, s]) => npcs[npc] && s.island !== 'FALSE' && npcs[npc].social !== 3 && npcs[npc].region === 'Town')
    .map(([npc]) => npc);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  // Pins keep their size while the map zooms.
  const unscale = `scale(${1 / view.zoom})`;

  return (
    <div className="map-page">
      <header className="cc__header">
        <h2>{t('map.title')}</h2>
        <div className="calendar__nav">
          {(['Valley', 'GingerIsland'] as RegionId[]).map((r) => (
            <button key={r} className={r === region ? 'button button--primary' : 'button'} onClick={() => setRegion(r)}>
              {t(`map.region.${r}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="map-controls box">
        <label className="map-time">
          <span>
            {t('map.time')} <strong>{formatTime(time)}</strong>
          </span>
          <input type="range" min={0} max={STEPS.length - 1} step={1} value={step} onChange={(e) => setStep(Number(e.target.value))} />
        </label>
        <div className="calendar__nav">
          {SEASONS.map((s) => (
            <button key={s} className={s === season ? 'button button--primary' : 'button'} onClick={() => setSeason(s)} aria-label={t(`common.seasons.${s}`)}>
              <SeasonIcon season={s} />
            </button>
          ))}
          <label className="cc__filter">
            {t('map.day')}
            <input className="map-day" type="number" min={1} max={28} value={day} onChange={(e) => setDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))} />
            <span className="cc-summary__hint">{t(`calendar.weekdays.${WEEKDAYS[(day - 1) % 7].toLowerCase()}`)}</span>
          </label>
        </div>
        <label className="cc__filter">
          <input type="checkbox" checked={raining} onChange={(e) => setRaining(e.target.checked)} />
          {t('map.raining')}
        </label>
      </div>

      <div className="map-layout">
        <div className="map-frame panel">
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
          <div
            ref={viewport}
            className={view.zoom > 1 ? 'map-viewport map-viewport--zoomed' : 'map-viewport'}
            style={{ aspectRatio: `${mapW} / ${mapH}` }}
            {...handlers}
          >
            <div
              className="map-canvas"
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                backgroundImage: `url("${encodeURI(spriteUrl(texture))}")`,
                // The texture also holds overlays below the base map; show only the map rect.
                backgroundSize: `${(sheetW / mapW) * 100}% ${(sheetH / mapH) * 100}%`,
              }}
            >
              {layers.events &&
                eventPins.map(({ e, pixel }) => (
                  <span key={e.id} className="map-pin" style={{ left: pct(pixel!.px, mapW), top: pct(pixel!.py, mapH), transform: `translate(-50%, -100%) ${unscale}` }}>
                    <Tooltip
                      text={
                        <span className="slot-tooltip">
                          <strong>{t('map.eventPin', { name: name(npcs[e.npc]?.n), hearts: e.hearts })}</strong>
                          <span>{describeEvent(e, t, name).join(' · ')}</span>
                        </span>
                      }
                    >
                      <span className="map-pin__icon">
                        <UiIcon name="heart-full" w={7} h={6} scale={3} />
                      </span>
                    </Tooltip>
                  </span>
                ))}
              {layers.npcs &&
                [...groups.values()].flatMap((group) =>
                  group.map((p, i) => {
                    const cols = Math.ceil(Math.sqrt(group.length));
                    const dx = (i % cols) - (cols - 1) / 2;
                    const dy = Math.floor(i / cols) - (Math.ceil(group.length / cols) - 1) / 2;
                    return (
                      <span
                        key={p.npc}
                        className={p.walking ? 'map-npc map-npc--walking' : 'map-npc'}
                        style={{ left: pct(p.px, mapW), top: pct(p.py, mapH), transform: `translate(-50%, -50%) ${unscale} translate(${dx * 34}px, ${dy * 34}px)` }}
                      >
                        <Tooltip
                          text={
                            <span className="slot-tooltip">
                              <strong>{name(npcs[p.npc]?.n)}</strong>
                              <span>{p.walking ? t('map.walkingTo', { place: locationName(p.location) }) : locationName(p.location)}</span>
                              <span>{t('map.since', { time: formatTime(p.since) })}</span>
                            </span>
                          }
                        >
                          <span className="map-npc__face">
                            <NpcHead npc={p.npc} scale={2} />
                          </span>
                        </Tooltip>
                      </span>
                    );
                  }),
                )}
            </div>
          </div>
        </div>

        <aside className="map-side box">
          <h3>{t('map.show')}</h3>
          <label className="cc__filter">
            <input type="checkbox" checked={layers.npcs} onChange={(e) => setLayers({ ...layers, npcs: e.target.checked })} />
            {t('map.layer.npcs')}
          </label>
          <label className="cc__filter">
            <input type="checkbox" checked={layers.events} onChange={(e) => setLayers({ ...layers, events: e.target.checked })} />
            {t('map.layer.events', { count: events.length })}
          </label>
          <label className="cc__filter">
            <input type="checkbox" checked={resort} onChange={(e) => setResort(e.target.checked)} />
            {t('map.resort')}
          </label>
          {save && <p className="cc-summary__hint">{save.resort.restored ? (save.resort.openToday ? t('map.resortOpen') : t('map.resortClosed')) : t('map.resortNotBuilt')}</p>}
          {resort && (
            <>
              <p className="cc-summary__hint">{t('map.resortHint')}</p>
              <div className="slot-grid">
                {resortVisitors.map((npc) => (
                  <Tooltip key={npc} text={name(npcs[npc]?.n)}>
                    <NpcHead npc={npc} />
                  </Tooltip>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>

      <section className="box map-list-box">
        <h3>{t('map.listTitle', { time: formatTime(time) })}</h3>
        <ul className="map-list">
          {[...places]
            .sort((a, b) => name(npcs[a.npc]?.n).localeCompare(name(npcs[b.npc]?.n)))
            .map((p) => (
              <li key={p.npc} className={p.region === region ? undefined : 'rel__muted'}>
                <NpcHead npc={p.npc} />
                <span>
                  <strong>{name(npcs[p.npc]?.n)}</strong> · {p.walking ? t('map.walkingTo', { place: locationName(p.location) }) : locationName(p.location)}
                  {p.region && p.region !== region && ` (${t(`map.region.${p.region}`)})`}
                </span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
