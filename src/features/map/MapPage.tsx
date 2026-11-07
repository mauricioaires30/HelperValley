import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData, spriteUrl, type Season } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { useCurrentSave } from '@/store/saveStore';
import { NpcHead, SeasonIcon, Tooltip } from '@/ui';
import { SEASONS } from '@/features/calendar/calendar';
import { formatTime, positionAt, resolveSchedule, WEEKDAYS } from './schedule';
import { toMapPixel, type RegionId } from './worldMap';
import './map.css';

/** 6am to 2am, one hour at a time, like the game clock. */
const HOURS = Array.from({ length: 21 }, (_, i) => 600 + i * 100);

interface Placed {
  npc: string;
  location: string;
  since: number;
  region: RegionId | null;
  px: number;
  py: number;
}

/** Villagers who keep a schedule (shown in the social tab). */
function scheduledNpcs() {
  const { npcs, schedules } = gameData();
  return Object.keys(schedules).filter((npc) => npcs[npc] && npcs[npc].social !== 3);
}

/**
 * Where every villager is at a chosen hour, from their schedules and today's conditions
 * (season, day, rain, hearts, marriage). Indoors they sit on the building's spot on the map.
 */
export function MapPage() {
  const { t } = useTranslation();
  const name = useGameName();
  const { save, player } = useCurrentSave();
  const [region, setRegion] = useState<RegionId>('Valley');
  const [season, setSeason] = useState<Season>(save?.date.season ?? 'spring');
  const [day, setDay] = useState(save?.date.day ?? 1);
  const [time, setTime] = useState(1200);
  const [raining, setRaining] = useState(save?.isRaining ?? false);
  const [resort, setResort] = useState(false);

  // Follow the save when it changes (new day, other save).
  useEffect(() => {
    if (!save) return;
    setSeason(save.date.season);
    setDay(save.date.day);
    setRaining(save.isRaining);
  }, [save]);

  const { worldMap, schedules, npcs } = gameData();
  const places = useMemo(() => {
    const out: Placed[] = [];
    for (const npc of scheduledNpcs()) {
      const friendship = player?.friendships[npc];
      const conditions = {
        season,
        day,
        raining,
        hearts: friendship ? Math.floor(friendship.points / 250) : 0,
        married: player?.spouse === npc,
      };
      const data = schedules[npc];
      const schedule = resolveSchedule(data, conditions, npc);
      const stop = positionAt(data, schedule, time);
      if (!stop) continue;
      // A spouse without a schedule today stays at the farmhouse.
      const location = conditions.married && !schedule.key ? 'Farm' : stop.location;
      const pixel = toMapPixel(worldMap, location, stop.x, stop.y);
      out.push({ npc, location, since: stop.time, region: pixel?.region ?? null, px: pixel?.px ?? 0, py: pixel?.py ?? 0 });
    }
    return out;
  }, [player, season, day, raining, time, schedules, worldMap]);

  // NPCs in the same building share a spot; fan them out in a small grid.
  const visible = places.filter((p) => p.region === region);
  const groups = new Map<string, Placed[]>();
  for (const p of visible) {
    const key = `${Math.round(p.px)}:${Math.round(p.py)}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const { texture, source } = worldMap.regions[region];
  const [, , mapW, mapH] = source;
  const [sheetW, sheetH] = gameData().sheets[texture] ?? [mapW, mapH];
  const locationName = (location: string) => {
    for (const r of Object.values(worldMap.regions)) {
      const pos = r.positions.find((p) => p.location === location && p.n);
      if (pos?.n) return name(pos.n);
    }
    // Outdoor areas have no scroll text; fall back to the game's location names.
    const known = gameData().museum.places[location] ?? gameData().heartEvents.places[location];
    return known ? name(known) : t(`map.location.${location}`, { defaultValue: location });
  };
  const resortVisitors = Object.entries(schedules)
    .filter(([npc, s]) => npcs[npc] && s.island !== 'FALSE' && npcs[npc].social !== 3 && npcs[npc].region === 'Town')
    .map(([npc]) => npc);

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
          <input type="range" min={HOURS[0]} max={HOURS.at(-1)} step={100} value={time} onChange={(e) => setTime(Number(e.target.value))} />
        </label>
        <div className="calendar__nav">
          {SEASONS.map((s) => (
            <button key={s} className={s === season ? 'button button--primary' : 'button'} onClick={() => setSeason(s)}>
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
        <label className="cc__filter">
          <input type="checkbox" checked={resort} onChange={(e) => setResort(e.target.checked)} />
          {t('map.resort')}
        </label>
        <p className="cc-summary__hint">
          {player
            ? t('map.fromSave', { spouse: player.spouse ? name(npcs[player.spouse]?.n) : t('map.single') })
            : t('map.noSave')}
        </p>
      </div>

      <div className="map-frame panel">
        <div
          className="map-canvas"
          style={{
            aspectRatio: `${mapW} / ${mapH}`,
            backgroundImage: `url("${encodeURI(spriteUrl(texture))}")`,
            // The texture also holds map overlays below the base map; show only the map rect.
            backgroundSize: `${(sheetW / mapW) * 100}% ${(sheetH / mapH) * 100}%`,
          }}
        >
          {[...groups.values()].flatMap((group) =>
            group.map((p, i) => {
              const cols = Math.ceil(Math.sqrt(group.length));
              const dx = (i % cols) - (cols - 1) / 2;
              const dy = Math.floor(i / cols) - (Math.ceil(group.length / cols) - 1) / 2;
              return (
                <span
                  key={p.npc}
                  className="map-npc"
                  style={{ left: `${(p.px / mapW) * 100}%`, top: `${(p.py / mapH) * 100}%`, transform: `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))` }}
                >
                  <Tooltip
                    text={
                      <span className="slot-tooltip">
                        <strong>{name(npcs[p.npc]?.n)}</strong>
                        <span>{locationName(p.location)}</span>
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

      {resort && (
        <section className="box map-resort">
          <h3>{t('map.resortTitle')}</h3>
          <p className="cc-summary__hint">{t('map.resortHint')}</p>
          <div className="slot-grid">
            {resortVisitors.map((npc) => (
              <Tooltip key={npc} text={name(npcs[npc]?.n)}>
                <NpcHead npc={npc} />
              </Tooltip>
            ))}
          </div>
        </section>
      )}

      <section className="box">
        <h3>{t('map.listTitle', { time: formatTime(time) })}</h3>
        <ul className="map-list">
          {[...places]
            .sort((a, b) => name(npcs[a.npc]?.n).localeCompare(name(npcs[b.npc]?.n)))
            .map((p) => (
              <li key={p.npc} className={p.region === region ? undefined : 'rel__muted'}>
                <NpcHead npc={p.npc} />
                <span>
                  <strong>{name(npcs[p.npc]?.n)}</strong> · {locationName(p.location)}
                  {p.region && p.region !== region && ` (${t(`map.region.${p.region}`)})`}
                </span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
