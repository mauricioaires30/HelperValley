import { useTranslation } from 'react-i18next';
import { useCurrentSave, useSaveStore } from '@/store/saveStore';

/** Multiplayer: choose whose progress (friendships, collections...) to show. */
export function PlayerSwitcher() {
  const { t } = useTranslation();
  const { save, player } = useCurrentSave();
  const selectPlayer = useSaveStore((s) => s.selectPlayer);
  if (!save || !player) return null;

  if (save.players.length === 1) {
    return <span className="player-switcher box">{player.name}</span>;
  }

  return (
    <label className="player-switcher box">
      <span className="visually-hidden">{t('saves.player')}</span>
      <select value={player.id} onChange={(e) => selectPlayer(e.target.value)}>
        {save.players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.isHost ? t('saves.host') : t('saves.farmhand')})
          </option>
        ))}
      </select>
    </label>
  );
}
