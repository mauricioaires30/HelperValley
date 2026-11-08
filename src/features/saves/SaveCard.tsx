import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentSave, useSaveStore } from '@/store/saveStore';
import { ItemIcon, SeasonIcon } from '@/ui';

/**
 * One sidebar card for the save: chest, farm and player names, and the date.
 * Clicking it opens the Saves page; in multiplayer a small select switches the player.
 */
export function SaveCard() {
  const { t } = useTranslation();
  const { save, player } = useCurrentSave();
  const live = useSaveStore((s) => s.source?.live ?? false);
  const lastUpdate = useSaveStore((s) => s.lastUpdate);
  const selectPlayer = useSaveStore((s) => s.selectPlayer);

  return (
    <div className="save-side box">
      <NavLink to="/" end className="save-side__link" aria-label={t('nav.home')}>
        <ItemIcon id="(BC)130" scale={2} tooltip={false} />
        <span className="save-side__text">
          {save && player ? (
            <>
              <strong className="save-side__farm">{t('saves.farmName', { name: player.farmName || save.players[0]?.farmName })}</strong>
              {save.players.length === 1 && <span className="save-side__player">{player.name}</span>}
              {/* Re-keyed on every update so the "pop" animation replays. */}
              <span key={lastUpdate?.at ?? 0} className={lastUpdate ? 'save-side__date date-chip--updated' : 'save-side__date'}>
                <SeasonIcon season={save.date.season} />
                {t('saves.dayShort', { day: save.date.day, season: t(`common.seasons.${save.date.season}`), year: save.date.year })}
                {live && <span className="live-dot" title={t('saves.live')} />}
              </span>
            </>
          ) : (
            <strong>{t('nav.home')}</strong>
          )}
        </span>
      </NavLink>
      {save && player && save.players.length > 1 && (
        <label className="save-side__switch">
          <span className="visually-hidden">{t('saves.player')}</span>
          <select value={player.id} onChange={(e) => selectPlayer(e.target.value)}>
            {save.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.isHost ? t('saves.host') : t('saves.farmhand')})
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
