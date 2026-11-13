import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentSave, useSaveStore } from '@/store/saveStore';
import { ItemIcon } from '@/ui';
import { PresenceDots } from '@/features/share/Presence';

/**
 * One sidebar card for the save: chest, farm and player names, and the date.
 * Clicking it opens the Saves page; in multiplayer a small select switches the player.
 */
export function SaveCard() {
  const { t } = useTranslation();
  const { save, player } = useCurrentSave();
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
            </>
          ) : (
            <strong>{t('nav.home')}</strong>
          )}
        </span>
        <PresenceDots to="/" exact />
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
