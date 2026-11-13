import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { gameData, getItem, spriteUrl, type Season } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { useCurrentSave } from '@/store/saveStore';
import type { Player } from '@/save/model';
import { ItemIcon, NpcHead, SeasonIcon, Tooltip, UiIcon, Sprite } from '@/ui';
import { usePinStore } from '@/store/pinStore';
import { FishPicker } from './FishPicker';
import { ONE_TIME_GUIDE } from '@/features/walnuts/walnutGuide';
import { SHOPS, openAt } from '@/features/shops/catalog';
import { SEASONS } from '@/features/calendar/calendar';
import { describeEvent } from '@/features/relationships/eventConditions';
import { formatTime, resolveSchedule, WEEKDAYS, type ScheduleData, type ScheduleResult, type Stop, currentData } from './schedule';
import { layoutPins } from './pinLayout';
import { islandDay } from './islandVisitors';
import { PlacePicture } from './PlacePicture';
import shopLocations from './shopLocations.json';
import { STARDROP_ITEM, STARDROPS } from '@/features/collections/stardrops';
import { npcRoute, routeMinutes, TILES_PER_MINUTE, type RouteTile } from './npcRoute';
import { isOpenArea, isWater, snapToMap, toMapPixel, type RegionId } from './worldMap';
import { usePanZoom } from '@/ui/usePanZoom';
import './map.css';
import { FishWhere } from '@/features/fish/FishInfo';

const LAYERS_KEY = 'hv-map-layers';
const DEFAULT_LAYERS = { npcs: true, events: true, quests: true, fish: true, stardrops: true, walnuts: false, shops: false, donations: false };

/** The layers chosen last time, so coming back to the map keeps them. */
function loadLayers(): typeof DEFAULT_LAYERS {
  try {
    return { ...DEFAULT_LAYERS, ...(JSON.parse(localStorage.getItem(LAYERS_KEY) ?? '{}') as Partial<typeof DEFAULT_LAYERS>) };
  } catch {
    return DEFAULT_LAYERS;
  }
}

/** Screen pixels from a teardrop pin's tip to its middle. */
const PIN_LIFT = 15;

/** 6:00 to 2:00 in 10-minute steps, like the game clock. */
const STEPS = Array.from({ length: 20 * 6 + 1 }, (_, i) => 600 + Math.floor(i / 6) * 100 + (i % 6) * 10);

/** Where each shop is on the world map (Data/Shops id → location, plus the tile for shops outdoors). */
const SHOP_LOCATIONS = shopLocations as unknown as Record<string, string | [string, [number, number]]>;

/** Where to look for each island fossil (see collections.fossil texts). */
const FOSSIL_LOCATIONS: Record<string, string> = {
  '(O)820': 'Blacksmith',
  '(O)821': 'IslandNorth',
  '(O)822': 'IslandNorth',
  '(O)823': 'IslandNorth',
  '(O)824': 'IslandSouth',
  '(O)825': 'IslandWest',
  '(O)826': 'IslandWest',
  '(O)827': 'Caldera',
  '(O)828': 'IslandEast',
};
/** IslandFieldOffice.piecesDonated order. */
const FOSSIL_PIECES = ['(O)820', '(O)821', '(O)822', '(O)823', '(O)823', '(O)824', '(O)825', '(O)826', '(O)826', '(O)827', '(O)828'];

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

/** Adds game minutes to a time (1350 + 20 is 1410). */
const addMinutes = (time: number, minutes: number) => {
  const total = Math.floor(time / 100) * 60 + (time % 100) + minutes;
  return Math.floor(total / 60) * 100 + (total % 60);
};

/**
 * Where an NPC is at `time`. At each stop's time they leave the previous one and walk the game's own
 * route to it, tile by tile, at the game's speed. Stops marked "a" are arrival times: they leave
 * early enough, rounded to 10 minutes like NPC.parseMasterSchedule does.
 */
function placeAt(data: ScheduleData, schedule: ScheduleResult, time: number, married: boolean) {
  const map = gameData().worldMap;
  const start: Stop | null = data.home ? { time: 600, location: data.home[0], x: data.home[1], y: data.home[2] } : null;
  let from = start;
  let to = start;
  let leftAt = start?.time ?? 600;
  let previousLeft = leftAt;
  for (const stop of schedule.stops) {
    let leaves = stop.time;
    if (stop.arriveBy && to) {
      const trip = npcRoute(to, stop);
      const tiles = trip ? Math.max(0, trip.length - 1) : 0;
      leaves = Math.max(addMinutes(stop.time, -Math.round((tiles * 32) / 420) * 10), previousLeft);
    }
    if (leaves > time) break;
    from = to;
    to = stop;
    leftAt = leaves;
    previousLeft = leaves;
  }
  if (!to) return null;
  // A spouse without a schedule today stays at the farmhouse.
  const location = married && !schedule.key ? 'Farm' : to.location;
  const end = toMapPixel(map, location, to.x, to.y);
  if (from && from !== to) {
    const route: RouteTile[] | null = npcRoute(from, to);
    const elapsed = minutesBetween(leftAt, time);
    if (route && elapsed < routeMinutes(route)) {
      // Between two tiles of a map it glides; warps jump, as in the game.
      const at = elapsed * TILES_PER_MINUTE;
      const i = Math.floor(at);
      for (let k = i; k >= 0; k--) {
        const here = toMapPixel(map, route[k].location, route[k].x, route[k].y);
        if (!here) continue; // Places missing from the world map: they still show at the last known spot.
        const next = k === i && route[i + 1]?.location === route[i].location ? toMapPixel(map, route[i + 1].location, route[i + 1].x, route[i + 1].y) : null;
        const f = at - i;
        const pixel = next ? { region: here.region, px: here.px + (next.px - here.px) * f, py: here.py + (next.py - here.py) * f } : here;
        return { location, since: leftAt, walking: true, pixel: isOpenArea(map, pixel.region, route[k].location) ? snapToMap(map, pixel, 'land', 6) : pixel };
      }
    }
  }
  return { location, since: leftAt, walking: false, pixel: end && isOpenArea(map, end.region, location) ? snapToMap(map, end, 'land', 6) : end };
}

/** Heart events this player can trigger on the chosen day and time, from their preconditions. */
export function availableEvents(player: Player | null, season: Season, day: number, time: number, raining: boolean) {
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

/**
 * Where every villager is at a chosen time, from their schedules and the day's conditions
 * (season, day, rain, hearts, marriage), plus heart events you can trigger right now.
 */
export function MapPage() {
  const { t } = useTranslation();
  const name = useGameName();
  const { save, player } = useCurrentSave();
  // ?show=walnuts (from the walnuts tab) opens the island with that layer on.
  const [params] = useSearchParams();
  const showLayer = params.get('show');
  const [region, setRegion] = useState<RegionId>(showLayer === 'walnuts' ? 'GingerIsland' : 'Valley');
  const [season, setSeason] = useState<Season>(save?.date.season ?? 'spring');
  const [day, setDay] = useState(save?.date.day ?? 1);
  const [step, setStep] = useState(0); // starts at 6:00, when the day begins
  const [layers, setLayers] = useState(() => {
    const stored = loadLayers();
    // A link that opens a layer (?show=) turns it on.
    return showLayer && showLayer in stored ? { ...stored, [showLayer]: true } : stored;
  });
  useEffect(() => {
    try {
      localStorage.setItem(LAYERS_KEY, JSON.stringify(layers));
    } catch {
      // They just won't be remembered.
    }
  }, [layers]);
  const navigate = useNavigate();
  const pinnedQuests = usePinStore((s) => s.quests);
  const pinnedFish = usePinStore((s) => s.fish);
  const pinnedStardrops = usePinStore((s) => s.stardrops);
  const { view, viewport, handlers, focus, zoomIn, zoomOut, reset } = usePanZoom();
  // The map's width on screen decides which pins would overlap.
  const [mapWidth, setMapWidth] = useState(900);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setMapWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewport]);
  const time = STEPS[step];

  // Follow the save when it changes (new day, other save).
  useEffect(() => {
    if (!save) return;
    setSeason(save.date.season);
    setDay(save.date.day);
  }, [save]);

  // The weather comes from the save: today's, tomorrow's forecast, otherwise unknown (shown dry).
  const isToday = !!save && season === save.date.season && day === save.date.day;
  const isTomorrow = !!save && !isToday && (save.date.day < 28 ? season === save.date.season && day === save.date.day + 1 : false);
  const raining = isToday ? !!save?.isRaining : isTomorrow && /rain|storm/i.test(save?.weatherTomorrow ?? '');
  const island = useMemo(() => (save && isToday ? islandDay(save) : null), [save, isToday]);

  const { worldMap, schedules, npcs } = gameData();
  const places = useMemo(() => {
    const out: Placed[] = [];
    for (const npc of scheduledNpcs()) {
      const friendship = player?.friendships[npc];
      const married = player?.spouse === npc;
      const conditions = { season, day, raining, hearts: friendship ? Math.floor(friendship.points / 250) : 0, married };
      // Today's island visitors follow the schedule the game gave them.
      const visit = island?.schedules[npc];
      const data = currentData(schedules[npc], save?.players[0]?.mailReceived ?? []);
      const schedule = visit ? { key: 'island', stops: visit } : resolveSchedule(data, conditions, npc);
      const place = placeAt(data, schedule, time, married);
      if (!place) continue;
      out.push({ npc, location: place.location, since: place.since, walking: place.walking, region: place.pixel?.region ?? null, px: place.pixel?.px ?? 0, py: place.pixel?.py ?? 0 });
    }
    return out;
  }, [player, season, day, raining, time, schedules, island, save]);

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

  const regionPlaces = places.filter((x) => x.region === region);
  const eventPins = events
    .map((e) => {
      const middle = toMapPixel(worldMap, e.location, ...((worldMap.sizes[e.location]?.map((n) => n / 2) as [number, number]) ?? [0, 0]));
      return { e, pixel: middle && isOpenArea(worldMap, middle.region, e.location) ? snapToMap(worldMap, middle, 'land', 30) : middle };
    })
    .filter((x) => x.pixel?.region === region);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  /** Pin at a location's middle (or a given tile), on this region only. */
  const pinAt = (location: string, tile?: [number, number]) => {
    const size = worldMap.sizes[location];
    const [x, y] = tile ?? (size ? [size[0] / 2, size[1] / 2] : [0, 0]);
    const pixel = toMapPixel(worldMap, location, x, y);
    if (!pixel || pixel.region !== region) return null;
    return tile || !isOpenArea(worldMap, region, location) ? pixel : snapToMap(worldMap, pixel, 'land', 30);
  };

  // Marked quests: the lost item's spot, the place to go, or wherever the NPC is right now.
  const questPins = (player?.quests ?? [])
    .filter((q) => pinnedQuests.includes(q.id) && !q.completed)
    .flatMap((q) => {
      // A lost item already found goes back to its owner: pin the NPC instead.
      if (q.location && !q.found) {
        const p = pinAt(q.location, q.tile);
        return p ? [{ key: `q-${q.id}`, ...p, q }] : [];
      }
      const npcPlace = q.npc ? places.find((x) => x.npc === q.npc && x.region === region) : null;
      return npcPlace ? [{ key: `q-${q.id}`, px: npcPlace.px, py: npcPlace.py, region, q }] : [];
    });

  // Marked fish (and fish from marked fishing quests), at each spot where they bite.
  const fishIds = new Set([
    ...pinnedFish,
    ...(player?.quests ?? []).filter((q) => pinnedQuests.includes(q.id) && q.type === 'FishingQuest' && q.item).map((q) => q.item!),
  ]);
  const fishPins = [...fishIds].flatMap((id) =>
    (gameData().fish[id]?.locations ?? []).flatMap((l) => {
      const size = worldMap.sizes[l.location];
      const tiles: Array<[number, number]> = l.spots ?? [size ? [size[0] / 2, size[1] / 2] : [0, 0]];
      const place = l.location === 'UndergroundMine' ? 'Mines' : l.location;
      return tiles.flatMap((tile, i) => {
        const pixel = toMapPixel(worldMap, place, tile[0], tile[1]);
        if (!pixel || pixel.region !== region) return [];
        // Buildings and caves show at their door; real water goes on the drawn water.
        if (!isOpenArea(worldMap, pixel.region, place)) return [{ key: `f-${id}-${l.location}-${l.area ?? ''}-${i}`, ...pixel, id, place: l.location, tile, specific: l.specific }];
        const onWater = snapToMap(worldMap, pixel, 'water', 15);
        // Water the map doesn't draw (the backwoods' pond): no pin on dry land. The desert is all drawn blank.
        return place === 'Desert' || isWater(worldMap, onWater.region, onWater.px, onWater.py) ? [{ key: `f-${id}-${l.location}-${l.area ?? ''}-${i}`, ...onWater, id, place: l.location, tile, specific: l.specific }] : [];
      });
    }),
  );

  const collectedNuts = new Set(save?.walnutsCollected ?? []);
  const walnutPins = gameData()
    .walnuts.filter((w) => !collectedNuts.has(w.id))
    .flatMap((w) => {
      const p = pinAt(w.location, w.tile);
      return p ? [{ key: w.id, ...p, w }] : [];
    });
  // Puzzles and rewards not done yet, pinned at their area.
  const puzzlePins = ONE_TIME_GUIDE.filter((g) => g.pin && !collectedNuts.has(g.key)).flatMap((g) => {
    const p = pinAt(g.pin!.location);
    return p ? [{ key: g.key, ...p, location: g.pin!.location }] : [];
  });
  // Shops on the chosen day, open or not (festival stalls only on their day); clicking one opens its tab on the Shops page.
  const shopDay = { season, day, year: save?.date.year ?? 1, daysPlayed: 0 };
  const shopPins = save
    ? SHOPS.filter((s) => SHOP_LOCATIONS[s.id] && !(s.id.startsWith('Festival_') && s.open && !s.open(shopDay, save))).flatMap((s) => {
        const where = SHOP_LOCATIONS[s.id];
        const p = typeof where === 'string' ? pinAt(where) : pinAt(where[0], where[1]);
        const today = !s.open || s.open(shopDay, save);
        return p ? [{ key: `s-${s.id}`, ...p, shop: s, today, now: today && openAt(s, time) }] : [];
      })
    : [];
  // Stardrops marked in Collections, until they're eaten.
  const stardropPins = STARDROPS.filter((s) => s.place && pinnedStardrops.includes(s.id) && !player?.mailReceived.includes(s.flag)).flatMap((s) => {
    const p = pinAt(s.place!.location, s.place!.tile);
    return p ? [{ key: `sd-${s.id}`, ...p, id: s.id, location: s.place!.location, tile: s.place!.tile }] : [];
  });

  // Missing donations: museum pieces you can dig up somewhere, and island fossils for Professor Snail.
  const donated = new Set(Object.values(save?.museum ?? {}).map((id) => (id.startsWith('(') ? id : `(O)${id}`)));
  const museumData = gameData().museum;
  const needByPlace = new Map<string, string[]>();
  for (const id of [...museumData.artifacts, ...museumData.minerals]) {
    if (donated.has(id)) continue;
    for (const place of museumData.sources[id]?.dig ?? []) needByPlace.set(place, [...(needByPlace.get(place) ?? []), id]);
  }
  FOSSIL_PIECES.forEach((id, i) => {
    if (save?.fieldOffice && !save.fieldOffice.pieces[i]) {
      const place = FOSSIL_LOCATIONS[id];
      if (!needByPlace.get(place)?.includes(id)) needByPlace.set(place, [...(needByPlace.get(place) ?? []), id]);
    }
  });
  const donationPins = [...needByPlace].flatMap(([place, ids]) => {
    const p = pinAt(place);
    return p ? [{ key: `d-${place}`, ...p, place, ids }] : [];
  });

  // Pins keep their size while the map zooms.
  const unscale = `scale(${1 / view.zoom})`;

  // Everything standing at one spot gathers into a small grid there. Walking NPCs pass by on their own.
  const mapScale = (mapWidth / mapW) * view.zoom;
  // Teardrop pins hang above their point, so the layout works with where they really show.
  const lifted = ({ key, px, py }: { key: string; px: number; py: number }) => ({ key, px, py: py - PIN_LIFT / mapScale });
  const pinLayout = layoutPins(
    [
      ...(layers.events ? eventPins.map(({ e, pixel }) => lifted({ key: e.id, px: pixel!.px, py: pixel!.py })) : []),
      ...(layers.walnuts ? walnutPins.map(({ key, px, py }) => ({ key, px, py })) : []),
      ...(layers.walnuts ? puzzlePins.map(lifted) : []),
      ...(layers.fish ? fishPins.map(lifted) : []),
      ...(layers.quests ? questPins.map(lifted) : []),
      ...(layers.shops ? shopPins.map(lifted) : []),
      ...(layers.donations ? donationPins.map(lifted) : []),
      ...(layers.stardrops ? stardropPins.map(lifted) : []),
      ...(layers.npcs ? regionPlaces.filter((p) => !p.walking).map((p) => ({ key: p.npc, px: p.px, py: p.py })) : []),
    ],
    mapScale,
  );
  /** Position of a pin; alone it hangs from its point (`anchor`), in a group it's centered on its cell. */
  const pinStyle = (key: string, px: number, py: number, anchor: '-100%' | '-50%') => {
    const at = pinLayout.get(key);
    if (!at?.grouped) {
      const y = at ? at.py + (anchor === '-100%' ? PIN_LIFT / mapScale : 0) : py;
      return { left: pct(at?.px ?? px, mapW), top: pct(y, mapH), transform: `translate(-50%, ${anchor}) ${unscale}` };
    }
    return { left: pct(at.px, mapW), top: pct(at.py, mapH), transformOrigin: '50% 50%', transform: `translate(-50%, -50%) ${unscale} translate(${at.dx}px, ${at.dy}px)` };
  };

  /** Shows someone from the list up close on the map. */
  const showPerson = (p: Placed) => {
    if (!p.region) return;
    const [, , w, h] = worldMap.regions[p.region].source;
    setRegion(p.region);
    setLayers((l) => ({ ...l, npcs: true }));
    focus(p.px / w, p.py / h, 4);
    viewport.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="map-page">
      <header className="cc__header">
        <h2>{t('map.title')}</h2>
        <div className="map-status">
          <span className="map-status__chip box">
            {(isToday || isTomorrow) && <Sprite sheet="LooseSprites/Cursors" x={raining ? 365 : 341} y={421} w={12} h={8} scale={3} />}
            {isToday || isTomorrow ? (raining ? t('map.weather.rain') : t('map.weather.sun')) : t('map.weather.unknown')}
          </span>
          {island && (
            <span className={island.state === 'open' ? 'map-status__chip map-status__chip--open box' : 'map-status__chip box'}>
              <ItemIcon id="(O)832" scale={2} tooltip={false} />
              {t(`map.resortState.${island.state}`)}
            </span>
          )}
        </div>
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
            <button key={s} className={s === season ? 'button button--primary' : 'button'} onClick={() => setSeason(s)}>
              <SeasonIcon season={s} />
              {t(`common.seasons.${s}`)}
            </button>
          ))}
          <label className="cc__filter">
            {t('map.day')}
            <input className="map-day" type="number" min={1} max={28} value={day} onChange={(e) => setDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))} />
            <span className="cc-summary__hint">{t(`calendar.weekdays.${WEEKDAYS[(day - 1) % 7].toLowerCase()}`)}</span>
          </label>
        </div>
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
            data-cursor-frame
            {...handlers}
          >
            {/* Cursors in a shared room are placed on the map itself, so they follow each person's zoom. */}
            <div
              className="map-canvas"
              data-cursor-anchor="map"
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                backgroundImage: `url("${encodeURI(spriteUrl(texture))}")`,
                // The texture also holds overlays below the base map; show only the map rect.
                backgroundSize: `${(sheetW / mapW) * 100}% ${(sheetH / mapH) * 100}%`,
              }}
            >
              {layers.events &&
                eventPins.map(({ e, pixel }) => (
                  <span key={e.id} className="map-pin" style={pinStyle(e.id, pixel!.px, pixel!.py, '-100%')}>
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
              {layers.walnuts &&
                walnutPins.map((p) => (
                  <span key={p.key} className="map-pin" style={pinStyle(p.key, p.px, p.py, '-50%')}>
                    <Tooltip
                      text={
                        <span className="slot-tooltip">
                          <strong>{t(`walnuts.kind.${p.w.kind}`)}</strong>
                          <PlacePicture location={p.w.location} tile={p.w.tile} />
                        </span>
                      }
                    >
                      <ItemIcon id="(O)73" tooltip={false} />
                    </Tooltip>
                  </span>
                ))}
              {layers.walnuts &&
                puzzlePins.map((p) => (
                  <span key={p.key} className="map-pin" style={pinStyle(p.key, p.px, p.py, '-100%')}>
                    <Tooltip
                      text={
                        <span className="slot-tooltip">
                          <strong>{t(`walnuts.once.${p.key}`)}</strong>
                          <span>{t(`walnuts.how.${p.key}`)}</span>
                        </span>
                      }
                    >
                      <span className="map-pin__icon map-pin__icon--quest">
                        <ItemIcon id="(O)73" tooltip={false} />
                      </span>
                    </Tooltip>
                  </span>
                ))}
              {layers.fish &&
                fishPins.map((p) => (
                  <span key={p.key} className="map-pin" style={pinStyle(p.key, p.px, p.py, '-100%')}>
                    <Tooltip
                      text={
                        <span className="slot-tooltip">
                          <strong>{name(gameData().items[p.id]?.n)}</strong>
                          <FishWhere id={p.id} now={{ season, time, raining: isToday || isTomorrow ? raining : null, location: p.place }} />
                          {p.specific && <PlacePicture location={p.place} tile={p.tile} />}
                        </span>
                      }
                    >
                      <span className="map-pin__icon map-pin__icon--fish">
                        <ItemIcon id={p.id} tooltip={false} />
                      </span>
                    </Tooltip>
                  </span>
                ))}
              {layers.quests &&
                questPins.map((p) => (
                  <span key={p.key} className="map-pin" style={pinStyle(p.key, p.px, p.py, '-100%')}>
                    <Tooltip
                      text={
                        <span className="slot-tooltip">
                          <strong>{t('map.questPin', { title: p.q.title })}</strong>
                          {p.q.objective && <span>{p.q.objective}</span>}
                          {p.q.location && p.q.tile && !p.q.found && <PlacePicture location={p.q.location} tile={p.q.tile} />}
                        </span>
                      }
                    >
                      <span className="map-pin__icon map-pin__icon--quest">
                        <ItemIcon id={p.q.item ?? '(O)842'} tooltip={false} />
                      </span>
                    </Tooltip>
                  </span>
                ))}
              {layers.stardrops &&
                stardropPins.map((p) => (
                  <span key={p.key} className="map-pin" style={pinStyle(p.key, p.px, p.py, '-100%')}>
                    <Tooltip
                      text={
                        <span className="slot-tooltip">
                          <strong>{t(`stardrops.${p.id}.title`)}</strong>
                          <span>{t(`stardrops.${p.id}.how`)}</span>
                          <PlacePicture location={p.location} tile={p.tile} />
                        </span>
                      }
                    >
                      <span className="map-pin__icon map-pin__icon--stardrop">
                        <ItemIcon id={STARDROP_ITEM} scale={1} tooltip={false} />
                      </span>
                    </Tooltip>
                  </span>
                ))}
              {layers.shops &&
                shopPins.map((p) => (
                  <span key={p.key} className="map-pin" style={pinStyle(p.key, p.px, p.py, '-100%')}>
                    <Tooltip
                      text={
                        <span className="slot-tooltip">
                          <strong>{t(`shops.name.${p.shop.id}`)}</strong>
                          <span className={p.now ? 'shop-hours shop-hours--open' : 'shop-hours'}>
                            {!p.today
                              ? t('map.shop.closedToday')
                              : p.now
                                ? t('map.shop.openNow')
                                : p.shop.hours && time < p.shop.hours[0]
                                  ? t('map.shop.opensAt', { time: formatTime(p.shop.hours[0]) })
                                  : t('map.shop.closedNow')}
                          </span>
                          <span>{p.shop.hours ? t('map.shop.hours', { from: formatTime(p.shop.hours[0]), to: formatTime(p.shop.hours[1]) }) : t('map.shop.allDay')}</span>
                          <PlacePicture
                            location={Array.isArray(SHOP_LOCATIONS[p.shop.id]) ? SHOP_LOCATIONS[p.shop.id][0] : (SHOP_LOCATIONS[p.shop.id] as string)}
                            tile={Array.isArray(SHOP_LOCATIONS[p.shop.id]) ? (SHOP_LOCATIONS[p.shop.id][1] as [number, number]) : undefined}
                          />
                        </span>
                      }
                    >
                      <button type="button" className={p.now ? 'map-pin__icon map-pin__icon--shop' : 'map-pin__icon map-pin__icon--shop map-pin__icon--closed'} onClick={() => navigate(`/shops/${p.shop.id}`)} aria-label={t(`shops.name.${p.shop.id}`)}>
                        {p.shop.npc ? <NpcHead npc={p.shop.npc} scale={1} /> : <ItemIcon id={p.shop.icon ?? '(O)472'} scale={1} tooltip={false} />}
                      </button>
                    </Tooltip>
                  </span>
                ))}
              {layers.donations &&
                donationPins.map((p) => (
                  <span key={p.key} className="map-pin" style={pinStyle(p.key, p.px, p.py, '-100%')}>
                    <Tooltip
                      text={
                        <span className="slot-tooltip">
                          <strong>{t('map.donationPin', { place: locationName(p.place), count: p.ids.length })}</strong>
                          <span className="slot-grid">
                            {p.ids.map((id) => (
                              <ItemIcon key={id} id={id} scale={1} tooltip={false} />
                            ))}
                          </span>
                          <span>{p.ids.map((id) => name(getItem(id)?.n)).join(', ')}</span>
                        </span>
                      }
                    >
                      <span className="map-pin__icon map-pin__icon--donation">
                        <ItemIcon id="(O)101" scale={1} tooltip={false} />
                      </span>
                    </Tooltip>
                  </span>
                ))}
              {layers.npcs &&
                regionPlaces.map((p) => {
                    return (
                      <span
                        key={p.npc}
                        className={p.walking ? 'map-npc map-npc--walking' : 'map-npc'}
                        style={pinStyle(p.npc, p.px, p.py, '-50%')}
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
                  })}
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
            <input type="checkbox" checked={layers.quests} onChange={(e) => setLayers({ ...layers, quests: e.target.checked })} />
            {t('map.layer.quests')} ({(player?.quests ?? []).filter((q) => pinnedQuests.includes(q.id) && !q.completed && (q.location || q.npc)).length})
          </label>
          <label className="cc__filter">
            <input type="checkbox" checked={layers.fish} onChange={(e) => setLayers({ ...layers, fish: e.target.checked })} />
            {t('map.layer.fish')} ({fishIds.size})
          </label>
          <FishPicker />
          <label className="cc__filter">
            <input type="checkbox" checked={layers.walnuts} onChange={(e) => setLayers({ ...layers, walnuts: e.target.checked })} />
            {t('map.layer.walnuts')} ({walnutPins.length || gameData().walnuts.filter((w) => !collectedNuts.has(w.id)).length})
          </label>
          <label className="cc__filter">
            <input type="checkbox" checked={layers.shops} onChange={(e) => setLayers({ ...layers, shops: e.target.checked })} />
            {t('map.layer.shops')} ({shopPins.length})
          </label>
          <label className="cc__filter">
            <input type="checkbox" checked={layers.donations} onChange={(e) => setLayers({ ...layers, donations: e.target.checked })} />
            {t('map.layer.donations')} ({[...needByPlace.values()].reduce((n, l) => n + l.length, 0)})
          </label>
          {pinnedStardrops.length > 0 && (
            <label className="cc__filter">
              <input type="checkbox" checked={layers.stardrops} onChange={(e) => setLayers({ ...layers, stardrops: e.target.checked })} />
              {t('map.layer.stardrops')} ({STARDROPS.filter((s) => pinnedStardrops.includes(s.id) && !player?.mailReceived.includes(s.flag)).length})
            </label>
          )}
          {island && island.visitors.length > 0 && (
            <div className="map-visitors">
              <h4>{t('map.visitors')}</h4>
              <ul>
                {island.visitors.map((npc) => (
                  <li key={npc}>
                    <NpcHead npc={npc} /> {name(npcs[npc]?.n)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <section className="box map-list-box">
        <h3>{t('map.listTitle', { time: formatTime(time) })}</h3>
        <ul className="map-list">
          {[...places]
            .sort((a, b) => name(npcs[a.npc]?.n).localeCompare(name(npcs[b.npc]?.n)))
            .map((p) => (
              <li key={p.npc}>
                <button type="button" className="map-person button" onClick={() => showPerson(p)}>
                  <NpcHead npc={p.npc} />
                  <span className="map-person__text">
                    <strong>{name(npcs[p.npc]?.n)}</strong>
                    <small>
                      {p.walking ? t('map.walkingTo', { place: locationName(p.location) }) : locationName(p.location)}
                      {p.region && p.region !== region && ` (${t(`map.region.${p.region}`)})`}
                    </small>
                  </span>
                  <span className="map-person__go" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
