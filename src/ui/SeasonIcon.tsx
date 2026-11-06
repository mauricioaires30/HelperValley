import { useTranslation } from 'react-i18next';
import type { Season } from '@/data/gameData';
import { UiIcon } from './Sprite';

export function SeasonIcon({ season, scale = 2 }: { season: Season; scale?: number }) {
  const { t } = useTranslation();
  return <UiIcon name={`season-${season}`} w={12} h={8} scale={scale} label={t(`common.seasons.${season}`)} />;
}
