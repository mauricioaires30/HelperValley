import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { formatTime } from '@/features/map/schedule';

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

/** Where and when a fish bites: places, seasons, times, weather and level. */
export function FishWhere({ id }: { id: string }) {
  const { t } = useTranslation();
  const place = useLocationName();
  const fish = gameData().fish[id];
  if (!fish) return null;
  if (fish.trap) return <span>{t(`fish.trap.${fish.trap}`)}</span>;
  return (
    <span className="fish-where">
      <span>
        {fish.locations.length
          ? fish.locations
              .map((l) => `${place(l.location)}${l.seasons && l.seasons.length < 4 ? ` (${l.seasons.map((s) => t(`common.seasons.${s}`)).join(', ')})` : ''}`)
              .join(' · ')
          : t(`fish.special.${id}`, { defaultValue: t('fish.special.default') })}
      </span>
      <span>
        {fish.times?.map(([a, b]) => `${formatTime(a)}–${formatTime(b)}`).join(', ')}
        {fish.weather && fish.weather !== 'both' && ` · ${t(`fish.weather.${fish.weather}`)}`}
        {fish.level ? ` · ${t('fish.level', { level: fish.level })}` : ''}
      </span>
    </span>
  );
}
