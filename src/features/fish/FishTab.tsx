import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData, getItem } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { PinButton } from '@/features/quests/QuestsPage';
import { ItemIcon, Progress } from '@/ui';
import { FishWhere } from './FishInfo';

/** True when the fish bites today: season (at any of its spots) and weather. */
function bitesToday(id: string, save: SaveData) {
  const fish = gameData().fish[id];
  if (!fish || fish.trap) return !!fish;
  const season = save.date.season;
  const inSeason = fish.locations.length
    ? fish.locations.some((l) => (l.seasons ?? fish.seasons ?? []).includes(season))
    : (fish.seasons ?? []).includes(season);
  const weatherOk = fish.weather === 'both' || (fish.weather === 'rainy') === save.isRaining;
  return inSeason && weatherOk;
}

function Fish({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const [filter, setFilter] = useState<'all' | 'missing' | 'today'>('missing');
  const caught = new Set(Object.keys(player.fishCaught).map((k) => (k.startsWith('(') ? k : `(O)${k}`)));
  const all = gameData().achievementGoals.fish;
  const list = all.filter((id) => (filter === 'missing' ? !caught.has(id) : filter === 'today' ? !caught.has(id) && bitesToday(id, save) : true));

  return (
    <div>
      <header className="cc__header">
        <h2>{t('fish.title')}</h2>
        <div className="calendar__nav">
          {(['missing', 'today', 'all'] as const).map((f) => (
            <button key={f} className={f === filter ? 'button button--primary' : 'button'} onClick={() => setFilter(f)}>
              {t(`fish.filter.${f}`)}
            </button>
          ))}
        </div>
      </header>
      <div className="museum__progress">
        <Progress value={all.filter((id) => caught.has(id)).length} max={all.length} />
      </div>
      <div className="quest-grid">
        {list.map((id) => (
          <article key={id} className={caught.has(id) ? 'quest box cc-bundle--complete' : 'quest box'}>
            <header className="quest__header">
              <ItemIcon id={id} />
              <h3>{name(getItem(id)?.n)}</h3>
              {caught.has(id) && <span>✓</span>}
            </header>
            <FishWhere id={id} />
            {!caught.has(id) && (
              <footer className="quest__footer">
                <PinButton kind="fish" id={id} />
              </footer>
            )}
          </article>
        ))}
      </div>
      {list.length === 0 && <p>{t('fish.none')}</p>}
    </div>
  );
}

export function FishTab() {
  return <RequireSave>{(save, player) => <Fish save={save} player={player} />}</RequireSave>;
}
