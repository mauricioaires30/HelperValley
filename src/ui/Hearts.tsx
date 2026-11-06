import { useTranslation } from 'react-i18next';
import { UiIcon } from './Sprite';

/** A row of friendship hearts, e.g. 7 of 10. */
export function Hearts({ value, max = 10, scale = 2 }: { value: number; max?: number; scale?: number }) {
  const { t } = useTranslation();
  const full = Math.max(0, Math.min(max, Math.floor(value)));
  return (
    <span className="hearts" role="img" aria-label={t('common.hearts', { count: full })}>
      {Array.from({ length: max }, (_, i) => (
        <UiIcon key={i} name={i < full ? 'heart-full' : 'heart-empty'} w={7} h={6} scale={scale} />
      ))}
    </span>
  );
}
