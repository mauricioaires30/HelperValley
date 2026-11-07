import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData, getItem, qualifyItemId } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player } from '@/save/model';
import { RequireSave } from '@/features/saves/RequireSave';
import { RecipeTip } from '@/features/achievements/AchievementDetails';
import { usePinStore } from '@/store/pinStore';
import { ItemIcon, Progress, Tooltip } from '@/ui';
import { HowToGet } from './HowToGet';

export type GameTab = 'shipped' | 'fish' | 'artifacts' | 'minerals' | 'cooking';

interface Entry {
  id: string;
  /** Times shipped / caught / cooked / found (0 = not yet). */
  count: number;
  extra?: ReactNode;
}

/** The collection list and the player's counts for one tab, like the game's collections menu. */
function entriesFor(tab: GameTab, player: Player): Entry[] {
  const data = gameData();
  const bare = (id: string) => id.replace(/^\(O\)/, '');
  switch (tab) {
    case 'shipped':
      return data.gameCollections.shipped.map((id) => ({ id, count: player.basicShipped[bare(id)] ?? 0 }));
    case 'fish': {
      const caught = Object.fromEntries(Object.entries(player.fishCaught).map(([k, v]) => [qualifyItemId(k), v[0]]));
      return data.achievementGoals.fish.map((id) => ({ id, count: caught[id] ?? 0 }));
    }
    case 'artifacts':
      return data.museum.artifacts.map((id) => ({ id, count: player.archaeologyFound[bare(id)] ?? 0 }));
    case 'minerals':
      return data.museum.minerals.map((id) => ({ id, count: player.mineralsFound[bare(id)] ?? 0 }));
    case 'cooking':
      return Object.entries(data.achievementGoals.cookingOutputs).map(([recipe, id]) => ({
        id,
        count: player.recipesCooked[bare(id)] ?? 0,
        extra: <RecipeTip id={id} known={recipe in player.cookingRecipes} sources={data.achievementGoals.recipeSources.cooking[recipe] ?? []} />,
      }));
  }
}

/**
 * Icons in a grid: collected ones in color, the rest as dark silhouettes like the game.
 * Hover shows the name, your count and how to get it; fish can be clicked to mark on the map.
 */
function Grid({ tab, player }: { tab: GameTab; player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const pinnedFish = usePinStore((s) => s.fish);
  const toggle = usePinStore((s) => s.toggle);
  const entries = entriesFor(tab, player).filter((e) => getItem(e.id));
  const done = entries.filter((e) => e.count > 0).length;

  return (
    <div>
      <div className="museum__progress">
        <Progress value={done} max={entries.length} />
        {tab === 'fish' && <p className="cc-summary__hint">{t('collections.fishClick')}</p>}
      </div>
      <div className="game-grid">
        {entries.map((e) => {
          const pinned = tab === 'fish' && pinnedFish.includes(e.id);
          return (
            <Tooltip
              key={e.id}
              text={
                <span className="slot-tooltip game-grid__tip">
                  <strong>{name(getItem(e.id)?.n)}</strong>
                  <em>{e.count > 0 ? t(`collections.count.${tab}`, { count: e.count }) : t('collections.notYet')}</em>
                  {e.extra ?? <HowToGet id={e.id} />}
                  {pinned && <span>{t('quests.pinned')}</span>}
                </span>
              }
            >
              <button
                type="button"
                className={['game-grid__cell', e.count > 0 ? '' : 'game-grid__cell--missing', pinned ? 'game-grid__cell--pinned' : ''].join(' ')}
                onClick={tab === 'fish' ? () => toggle('fish', e.id) : undefined}
                aria-label={name(getItem(e.id)?.n)}
              >
                <ItemIcon id={e.id} tooltip={false} />
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

export function GameCollectionTab({ tab }: { tab: GameTab }) {
  return <RequireSave>{(_, player) => <Grid tab={tab} player={player} />}</RequireSave>;
}

/** Letters received, like the game's collection: titles of letters you have. */
export function LettersTab() {
  return (
    <RequireSave>
      {(_, player) => {
        const letters = gameData().gameCollections.letters;
        return <Letters received={player.mailReceived.filter((k) => letters[k])} />;
      }}
    </RequireSave>
  );
}

function Letters({ received }: { received: string[] }) {
  const { t } = useTranslation();
  const name = useGameName();
  const letters = gameData().gameCollections.letters;
  return (
    <div>
      <p className="cc-summary__hint">{t('collections.lettersHint', { count: received.length })}</p>
      <ul className="letters">
        {received.map((k) => (
          <li key={k} className="inset">
            {name(letters[k])}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Secret notes found out of all of them. */
export function NotesTab() {
  const { t } = useTranslation();
  return (
    <RequireSave>
      {(_, player) => {
        const all = gameData().gameCollections.secretNotes;
        const seen = new Set(player.secretNotesSeen);
        return (
          <div>
            <div className="museum__progress">
              <Progress value={all.filter((n) => seen.has(n)).length} max={all.length} />
              <p className="cc-summary__hint">{t('collections.notesHint')}</p>
            </div>
            <div className="game-grid">
              {all.map((n) => (
                <span key={n} className={seen.has(n) ? 'game-grid__cell' : 'game-grid__cell game-grid__cell--missing'}>
                  <ItemIcon id={n >= 1000 ? '(O)842' : '(O)79'} tooltip={false} />
                </span>
              ))}
            </div>
          </div>
        );
      }}
    </RequireSave>
  );
}
