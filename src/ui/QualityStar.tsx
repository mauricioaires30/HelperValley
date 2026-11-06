import { useTranslation } from 'react-i18next';
import { UiIcon } from './Sprite';

/** Game quality levels: 0 normal, 1 silver, 2 gold, 4 iridium. */
export type Quality = 0 | 1 | 2 | 4;

const NAMES = { 1: 'silver', 2: 'gold', 4: 'iridium' } as const;

export function QualityStar({ quality, scale = 2 }: { quality: Quality; scale?: number }) {
  const { t } = useTranslation();
  if (quality === 0) return null;
  const name = NAMES[quality];
  return <UiIcon name={`star-${name}`} w={8} h={8} scale={scale} label={t(`common.quality.${name}`)} />;
}
