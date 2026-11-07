import { useTranslation } from 'react-i18next';
import { UiIcon } from './Sprite';

interface HeartsProps {
  value: number;
  /** Hearts drawn in total. */
  max?: number;
  /** Hearts that can be earned now. */
  reachable?: number;
  /** Hearts possible later (dating, marriage): drawn faded. Beyond this they're dark (impossible). */
  possible?: number;
  scale?: number;
}

/** A row of friendship hearts, e.g. 7 of 10, with locked hearts darkened. */
export function Hearts({ value, max = 10, reachable = max, possible = max, scale = 2 }: HeartsProps) {
  const { t } = useTranslation();
  const full = Math.max(0, Math.min(max, Math.floor(value)));
  return (
    <span className="hearts" role="img" aria-label={t('common.hearts', { count: full })}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i >= possible ? 'heart heart--locked' : i >= reachable ? 'heart heart--soft' : 'heart'}>
          <UiIcon name={i < full ? 'heart-full' : 'heart-empty'} w={7} h={6} scale={scale} />
        </span>
      ))}
    </span>
  );
}
