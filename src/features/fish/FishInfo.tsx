import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { formatTime } from '@/features/map/schedule';
import { SeasonIcon, Sprite } from '@/ui';
import type { Season } from '@/data/gameData';
import './fish.css';

/** Display name for a location key, from the map, museum or event place names. */
export function useLocationName() {
  const { t } = useTranslation();
  const name = useGameName();
  return (location: string) => {
    const { worldMap, museum, heartEvents } = gameData();
    for (const r of Object.values(worldMap.regions)) {
      const pos = r.positions.find((p) => p.location === location && p.n);
      if (pos?.n) return name(pos.n);
    }
    const known = museum.places[location] ?? heartEvents.places[location];
    return known ? name(known) : t(`map.location.${location}`, { defaultValue: location });
  };
}

/** The moment the map shows: whether a fish bites then. Weather is null when that day's isn't known. */
export interface FishMoment {
  season: Season;
  time: number;
  raining: boolean | null;
  /** The spot being looked at, for fish whose season depends on the place. */
  location?: string;
}

/** Why a fish isn't biting at that moment, or null when it is. */
export function notBiting(id: string, now: FishMoment): 'season' | 'time' | 'weather' | null {
  const fish = gameData().fish[id];
  if (!fish || fish.trap) return null;
  const spot = now.location ? fish.locations.find((l) => l.location === now.location) : undefined;
  const seasons = spot?.seasons ?? fish.seasons;
  if (seasons && !seasons.includes(now.season)) return 'season';
  if (fish.times?.length && !fish.times.some(([a, b]) => now.time >= a && now.time < b)) return 'time';
  if (now.raining !== null && fish.weather && fish.weather !== 'both' && (fish.weather === 'rainy') !== now.raining) return 'weather';
  return null;
}

function Weather({ kind }: { kind: 'sunny' | 'rainy' }) {
  return <Sprite sheet="LooseSprites/Cursors" x={kind === 'rainy' ? 365 : 341} y={421} w={12} h={8} scale={2} />;
}

/** Where and when a fish bites, one labeled row each, plus whether it bites at `now` (on the map). */
export function FishWhere({ id, now, hideWhere = false }: { id: string; now?: FishMoment; /** On the map the pin already shows where. */ hideWhere?: boolean }) {
  const { t } = useTranslation();
  const place = useLocationName();
  const fish = gameData().fish[id];
  if (!fish) return null;
  if (fish.trap) return <span>{t(`fish.trap.${fish.trap}`)}</span>;
  const why = now ? notBiting(id, now) : null;
  // The seasons it really bites: a place can limit them (sardines leave the beach in summer).
  const order: Season[] = ['spring', 'summer', 'fall', 'winter'];
  const bySpot = fish.locations.flatMap((l) => l.seasons ?? fish.seasons ?? []);
  const seasons = fish.seasons ? order.filter((s) => fish.seasons!.includes(s) && (!fish.locations.length || bySpot.includes(s))) : null;
  return (
    <span className="fish-where">
      {now && (
        <span className={why ? 'fish-where__now fish-where__now--no' : 'fish-where__now'}>
          {why ? t(`fish.cond.not.${why}`) : now.raining === null && fish.weather && fish.weather !== 'both' ? t('fish.cond.ifWeather') : t('fish.cond.biting')}
        </span>
      )}
      {seasons && (
        <span className="fish-where__row">
          <span className="fish-where__label">{t('fish.cond.seasons')}</span>
          <span className="fish-where__seasons">
            {seasons.length === 4
              ? t('fish.cond.allYear')
              : seasons.map((s) => (
                  <span key={s} className={now?.season === s ? 'fish-where__season fish-where__season--now' : 'fish-where__season'}>
                    <SeasonIcon season={s} />
                    {t(`common.seasons.${s}`)}
                  </span>
                ))}
          </span>
        </span>
      )}
      {fish.times?.length ? (
        <span className="fish-where__row">
          <span className="fish-where__label">{t('fish.cond.time')}</span>
          <span>{fish.times.map(([a, b]) => `${formatTime(a)}–${formatTime(b)}`).join(', ')}</span>
        </span>
      ) : null}
      <span className="fish-where__row">
        <span className="fish-where__label">{t('fish.cond.weather')}</span>
        <span className="fish-where__weather">
          {fish.weather === 'sunny' || fish.weather === 'rainy' ? (
            <>
              <Weather kind={fish.weather} />
              {t(`fish.weather.${fish.weather}`)}
            </>
          ) : (
            t('fish.cond.anyWeather')
          )}
        </span>
      </span>
      {!hideWhere && (
      <span className="fish-where__row">
        <span className="fish-where__label">{t('fish.cond.where')}</span>
        <span>
          {fish.locations.length
            ? fish.locations
                .map((l) => `${place(l.location)}${l.seasons && l.seasons.length < 4 ? ` (${l.seasons.map((s) => t(`common.seasons.${s}`)).join(', ')})` : ''}`)
                .join(' · ')
            : t(`fish.special.${id}`, { defaultValue: t('fish.special.default') })}
        </span>
      </span>
      )}
      {fish.level ? (
        <span className="fish-where__row">
          <span className="fish-where__label">{t('fish.cond.level')}</span>
          <span>{fish.level}</span>
        </span>
      ) : null}
    </span>
  );
}
