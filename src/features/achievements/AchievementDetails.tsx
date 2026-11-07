import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gameData, qualifyItemId } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player } from '@/save/model';
import { Hearts, ItemIcon, NpcHead } from '@/ui';

const POLYCULTURE_GOAL = 15;
const MONOCULTURE_GOAL = 300;

/** A grid of items with an optional "n/goal" badge; faded ones aren't unlocked yet. */
function ItemGrid({ items }: { items: Array<{ id: string; label?: string; faded?: boolean }> }) {
  return (
    <div className="slot-grid ach-details__grid">
      {items.map(({ id, label, faded }) => (
        <span key={id} className="ach-details__item">
          <ItemIcon id={id} slot faded={faded} />
          {label && <span className="ach-details__badge">{label}</span>}
        </span>
      ))}
    </div>
  );
}

function FriendList({ player, hearts }: { player: Player; hearts: number }) {
  const { t } = useTranslation();
  const name = useGameName();
  const { npcs } = gameData();
  const below = Object.entries(player.friendships)
    .filter(([npc]) => npcs[npc]?.gifts && npcs[npc].social !== 3)
    .map(([npc, f]) => ({ npc, hearts: Math.floor(f.points / 250) }))
    .filter((f) => f.hearts < hearts)
    .sort((a, b) => b.hearts - a.hearts);
  return (
    <>
      <p className="cc-summary__hint">{t('ach.details.friends', { hearts })}</p>
      <ul className="ach-details__friends">
        {below.map((f) => (
          <li key={f.npc}>
            <NpcHead npc={f.npc} />
            <span>{name(npcs[f.npc].n)}</span>
            <Hearts value={f.hearts} max={hearts} scale={1} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** What is still missing for one achievement, when the save can tell. */
export function AchievementDetails({ id, player }: { id: string; player: Player }) {
  const { t } = useTranslation();
  const goals = gameData().achievementGoals;

  switch (id) {
    case '6':
    case '11':
    case '12':
    case '13':
      return <FriendList player={player} hearts={5} />;
    case '7':
    case '9':
      return <FriendList player={player} hearts={10} />;

    case '15':
    case '16':
    case '17': {
      const missing = Object.entries(goals.cookingOutputs)
        .filter(([, item]) => !player.recipesCooked[item.replace('(O)', '')])
        .map(([recipe, item]) => ({ id: item, faded: !(recipe in player.cookingRecipes) }));
      return (
        <>
          <p className="cc-summary__hint">{t('ach.details.cooking', { count: missing.length })}</p>
          <ItemGrid items={missing} />
        </>
      );
    }

    case '20':
    case '21':
    case '22': {
      const missing = goals.crafting
        .filter((recipe) => !(player.craftingRecipes[recipe] > 0))
        .map((recipe) => ({ id: goals.craftingOutputs[recipe], faded: !(recipe in player.craftingRecipes) }))
        .filter((m) => m.id);
      return (
        <>
          <p className="cc-summary__hint">{t('ach.details.crafting', { count: missing.length })}</p>
          <ItemGrid items={missing} />
        </>
      );
    }

    case '24':
    case '25':
    case '26': {
      const caught = new Set(Object.keys(player.fishCaught).map(qualifyItemId));
      const missing = goals.fish.filter((f) => !caught.has(f)).map((f) => ({ id: f }));
      return (
        <>
          <p className="cc-summary__hint">{t('ach.details.fish', { count: missing.length })}</p>
          <ItemGrid items={missing} />
        </>
      );
    }

    case '31': {
      const missing = goals.polyculture
        .map((crop) => ({ crop, shipped: player.basicShipped[crop] ?? 0 }))
        .filter((c) => c.shipped < POLYCULTURE_GOAL)
        .sort((a, b) => b.shipped - a.shipped)
        .map((c) => ({ id: qualifyItemId(c.crop), label: `${c.shipped}/${POLYCULTURE_GOAL}`, faded: c.shipped === 0 }));
      return (
        <>
          <p className="cc-summary__hint">{t('ach.details.polyculture', { count: missing.length })}</p>
          <ItemGrid items={missing} />
        </>
      );
    }

    case '32': {
      const best = goals.monoculture
        .map((crop) => ({ crop, shipped: player.basicShipped[crop] ?? 0 }))
        .sort((a, b) => b.shipped - a.shipped)
        .slice(0, 6)
        .map((c) => ({ id: qualifyItemId(c.crop), label: `${c.shipped}/${MONOCULTURE_GOAL}` }));
      return (
        <>
          <p className="cc-summary__hint">{t('ach.details.monoculture')}</p>
          <ItemGrid items={best} />
        </>
      );
    }

    case '5':
    case '28':
      return (
        <Link className="button" to="/museum">
          {t('ach.details.museum')}
        </Link>
      );

    case '29':
    case '30':
      return <p className="cc-summary__hint">{t('ach.details.quests')}</p>;

    case '18':
    case '19':
      return <p className="cc-summary__hint">{t('ach.details.house', { level: player.houseUpgradeLevel })}</p>;

    case '0':
    case '1':
    case '2':
    case '3':
    case '4':
      return <p className="cc-summary__hint">{t('ach.details.money', { money: player.totalMoneyEarned.toLocaleString() })}</p>;

    default:
      return null;
  }
}

/** Achievements whose details panel has something to show. */
export const HAS_DETAILS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '9', '11', '12', '13', '15', '16', '17', '18', '19', '20', '21', '22', '24', '25', '26', '28', '29', '30', '31', '32']);
