import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { SeasonIcon } from '@/ui';
import './live.css';

const TOAST_MS = 6000;

/** Current in-game date of the loaded save, shown in the header. */
export function SaveDateChip() {
  const { t } = useTranslation();
  const save = useSaveStore((s) => s.save);
  const live = useSaveStore((s) => s.source?.live ?? false);
  const lastUpdate = useSaveStore((s) => s.lastUpdate);
  if (!save) return null;
  const { season, day, year } = save.date;
  return (
    // Re-keyed on every update so the "pop" animation replays.
    <span key={lastUpdate?.at ?? 0} className={lastUpdate ? 'date-chip box date-chip--updated' : 'date-chip box'}>
      <SeasonIcon season={season} />
      {t('saves.day', { day, season: t(`common.seasons.${season}`), year })}
      {live && <span className="live-dot" title={t('saves.live')} />}
    </span>
  );
}

/** Toast announcing that the game saved and the page now shows the new day. */
export function SaveUpdatedToast() {
  const { t } = useTranslation();
  const lastUpdate = useSaveStore((s) => s.lastUpdate);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastUpdate) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [lastUpdate]);

  if (!lastUpdate || !visible) return null;
  const { season, day, year } = lastUpdate.date;
  return (
    <div className="save-toast box" role="status" onClick={() => setVisible(false)}>
      <SeasonIcon season={season} scale={3} />
      <div>
        <strong>{t('saves.updated')}</strong>
        <div>{t('saves.day', { day, season: t(`common.seasons.${season}`), year })}</div>
      </div>
    </div>
  );
}
