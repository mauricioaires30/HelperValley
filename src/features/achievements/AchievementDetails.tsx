import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { gameData, getItem, qualifyItemId } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player } from '@/save/model';
import { Hearts, ItemIcon, NpcHead, Tooltip } from '@/ui';

const POLYCULTURE_GOAL = 15;
const MONOCULTURE_GOAL = 300;

/** A grid of items with an optional "n/goal" badge; faded ones aren't unlocked yet. */
function ItemGrid({ items }: { items: Array<{ id: string; label?: string; faded?: boolean; tip?: ReactNode }> }) {
  const { t } = useTranslation();
  // Earned achievements open too; with nothing missing, say so.
  if (items.length === 0) return <p className="ach__close">{t('ach.details.allDone')}</p>;
  return (
    <div className="slot-grid ach-details__grid">
      {items.map(({ id, label, faded, tip }) => (
        <span key={id} className="ach-details__item">
          {tip ? (
            <Tooltip text={tip}>
              <ItemIcon id={id} slot faded={faded} tooltip={false} />
            </Tooltip>
          ) : (
            <ItemIcon id={id} slot faded={faded} />
          )}
          {label && <span className="ach-details__badge">{label}</span>}
        </span>
      ))}
    </div>
  );
}

const SEASON_KEYS = ['spring', 'summer', 'fall', 'winter'];

/** Name of the dish/item plus how its recipe is learned, for a slot tooltip. */
/** Recipe ingredients categories: any fish, egg, milk, wild seeds. Icon shown for each. */
const CATEGORY_ICON: Record<string, string> = { '-4': '(O)145', '-5': '(O)176', '-6': '(O)184', '-777': '(O)495' };

/** "What goes in": ingredient icons with counts, as on the game's recipe tooltip. */
export function Ingredients({ list }: { list: Array<[string, number]> }) {
  const { t } = useTranslation();
  const name = useGameName();
  return (
    <span className="ingredients">
      {list.map(([id, count]) => {
        const category = id.startsWith('-');
        return (
          <span key={id} className="ingredients__item">
            <ItemIcon id={category ? CATEGORY_ICON[id] ?? '(O)0' : id} scale={1} tooltip={false} />
            {count}× {category ? t(`ach.recipe.category.${id}`) : name(getItem(id)?.n)}
          </span>
        );
      })}
    </span>
  );
}

export function RecipeTip({
  id,
  sources,
  known,
  ingredients,
}: {
  id: string;
  sources: Array<Array<string | number | null>>;
  known: boolean;
  ingredients?: Array<[string, number]>;
}) {
  const { t } = useTranslation();
  const name = useGameName();
  const npcs = gameData().npcs;
  const line = ([kind, ...args]: Array<string | number | null>) => {
    switch (kind) {
      case 'tv': {
        // The Queen of Sauce airs a new recipe every Sunday for 32 weeks, then reruns.
        const week = Number(args[0]);
        const season = SEASON_KEYS[Math.floor(((week - 1) % 16) / 4)];
        return t('ach.recipe.tv', { day: (((week - 1) % 4) + 1) * 7, season: t(`common.seasons.${season}`), year: week <= 16 ? 1 : 2 });
      }
      case 'f':
        return t('ach.recipe.friend', { name: name(npcs[String(args[0])]?.n) || args[0], hearts: args[1] });
      case 's':
        return t('ach.recipe.skill', { skill: t(`common.skills.${String(args[0]).toLowerCase()}`), level: args[1] });
      case 'l':
        return t('ach.recipe.level', { level: args[0] });
      case 'shop':
        return t('ach.recipe.shop', {
          shop: t(`farm.shop.${args[0]}`, { defaultValue: String(args[0]) }),
          price: args[1] ? `${Number(args[1]).toLocaleString()}${args[2] ? ` ${t(`ach.recipe.currency.${args[2]}`)}` : 'g'}` : '',
        });
      case 'default':
        return t('ach.recipe.default');
      case 'mail':
        return t(`ach.recipe.mail.${args[0]}`, { defaultValue: t('ach.recipe.mailGeneric') });
      case 'event': {
        const places = gameData().heartEvents.places;
        const key = String(args[0]);
        const place = places[key] ? name(places[key]) : t(`rel.place.${key}`, { defaultValue: key });
        return args[1]
          ? t('ach.recipe.eventWith', { name: name(npcs[String(args[1])]?.n) || args[1], hearts: args[2], place })
          : t('ach.recipe.eventAt', { place });
      }
      default:
        return null;
    }
  };
  return (
    <span className="slot-tooltip">
      <strong>{name(getItem(id)?.n)}</strong>
      {ingredients && <Ingredients list={ingredients} />}
      <em>{known ? t('ach.recipe.known') : t('ach.recipe.unknown')}</em>
      {!known && (sources.length ? sources.map((s, i) => <span key={i}>{line(s)}</span>) : <span>{t('ach.recipe.other')}</span>)}
    </span>
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
        .map(([recipe, item]) => {
          const known = recipe in player.cookingRecipes;
          return { id: item, faded: !known, tip: <RecipeTip id={item} known={known} sources={goals.recipeSources.cooking[recipe] ?? []} ingredients={gameData().gameCollections.ingredients.cooking[recipe]} /> };
        });
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
        .map((recipe) => {
          const known = recipe in player.craftingRecipes;
          const id = goals.craftingOutputs[recipe];
          return { id, faded: !known, tip: <RecipeTip id={id} known={known} sources={goals.recipeSources.crafting[recipe] ?? []} ingredients={gameData().gameCollections.ingredients.crafting[recipe]} /> };
        })
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
