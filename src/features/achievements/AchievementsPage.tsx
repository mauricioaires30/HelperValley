import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { Progress, UiIcon } from '@/ui';
import { achievementProgress, type AchievementProgress } from './achievements';
import { AchievementDetails, HAS_DETAILS } from './AchievementDetails';
import './achievements.css';

interface CardProps {
  progress: AchievementProgress;
  player: Player;
  /** Only one card shows its details at a time; the page owns which. */
  open: boolean;
  onToggle: () => void;
}

function AchievementCard({ progress, player, open, onToggle }: CardProps) {
  const { t } = useTranslation();
  const name = useGameName();
  const canExpand = HAS_DETAILS.has(progress.id);
  const data = gameData().achievements[progress.id];
  const pct = progress.goal ? Math.round(((progress.value ?? 0) / progress.goal) * 100) : 0;
  return (
    <li className={progress.earned ? 'ach box ach--earned' : 'ach box'}>
      <UiIcon name={progress.earned ? 'star-gold' : 'star-silver'} w={8} h={8} scale={4} label={progress.earned ? t('ach.earned') : t('ach.locked')} />
      <div className="ach__body">
        <strong>
          {name(data.n)}
          {!data.shown && <span className="ach__secret">{t('ach.secret')}</span>}
        </strong>
        <span className="ach__desc">{name(data.d)}</span>
        {!progress.earned && progress.goal !== null && (
          <>
            <Progress value={progress.value ?? 0} max={progress.goal} />
            {pct >= 75 && <span className="ach__close">{t('ach.close')}</span>}
          </>
        )}
        {canExpand && (
          <button className="button ach__toggle" aria-expanded={open} onClick={onToggle}>
            {open ? t('ach.hideDetails') : t('ach.showDetails')}
          </button>
        )}
        {open && (
          <div className="ach-details inset">
            <AchievementDetails id={progress.id} player={player} />
          </div>
        )}
      </div>
    </li>
  );
}

function Achievements({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const [hideEarned, setHideEarned] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const progress = useMemo(() => {
    const ids = Object.keys(gameData().achievements).sort((a, b) => Number(a) - Number(b));
    return achievementProgress(save, player, gameData().achievementGoals, ids, gameData().gameCollections.shipped);
  }, [save, player]);
  const earned = progress.filter((p) => p.earned).length;

  // Closest unfinished goals first, then one-off events, then earned ones.
  const ratio = (p: AchievementProgress) => (p.goal ? (p.value ?? 0) / p.goal : -1);
  const sorted = [...progress].sort((a, b) => Number(a.earned) - Number(b.earned) || ratio(b) - ratio(a));
  const visible = hideEarned ? sorted.filter((p) => !p.earned) : sorted;

  return (
    <div>
      <header className="cc__header">
        <h2>{t('ach.title', { name: player.name })}</h2>
        <label className="cc__filter">
          <input type="checkbox" checked={hideEarned} onChange={(e) => setHideEarned(e.target.checked)} />
          {t('ach.hideEarned')}
        </label>
      </header>
      <div className="museum__progress">
        <Progress value={earned} max={progress.length} />
        <p className="cc-summary__hint">{t('ach.perPlayer')}</p>
      </div>
      <ul className="ach-list">
        {visible.map((p) => (
          <AchievementCard key={p.id} progress={p} player={player} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />
        ))}
      </ul>
    </div>
  );
}

export function AchievementsPage() {
  return <RequireSave>{(save, player) => <Achievements save={save} player={player} />}</RequireSave>;
}
