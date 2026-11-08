import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { ItemIcon, NpcHead, UiIcon } from '@/ui';
import { SHOPS, weekday } from '@/features/shops/catalog';
import { availableEvents } from '@/features/map/MapPage';
import { DAYS_IN_SEASON, SEASONS, seasonDays } from '@/features/calendar/calendar';
import { useFestivalName } from '@/features/calendar/CalendarPage';

interface Todo {
  key: string;
  icon: ReactNode;
  text: ReactNode;
  to?: string;
  /** Something to act on now (highlighted), as opposed to good to know. */
  urgent?: boolean;
}

/** Everything worth doing today, gathered from the save; each card links to the page that helps. */
export function TodayChecklist({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const festivalName = useFestivalName();
  const { npcs, calendar } = gameData();
  const { season, day, year } = save.date;
  const todos: Todo[] = [];

  // Farm chores.
  const ready = save.farm.machines.filter((m) => m.ready).length;
  if (ready) todos.push({ key: 'machines', icon: <ItemIcon id="(BC)12" scale={2} tooltip={false} />, text: t('todo.machines', { count: ready }), to: '/farm/producing', urgent: true });
  const toPet = save.farm.animals.filter((a) => !a.autoPet).length;
  if (toPet) todos.push({ key: 'pet', icon: <ItemIcon id="(O)176" tooltip={false} />, text: t('todo.pet', { count: toPet }), to: '/farm/animals', urgent: true });
  if (save.farm.pets.length && save.farm.bowls.some((w) => !w) && !save.isRaining)
    todos.push({ key: 'bowl', icon: <ItemIcon id="(T)WateringCan" tooltip={false} />, text: t('todo.bowl'), to: '/farm/animals', urgent: true });
  for (const [i, h] of save.slimeHutches.entries()) {
    const needed = Math.min(h.water.length || 4, Math.ceil(h.slimes.length / 5));
    if (!h.sprinkler && h.water.filter(Boolean).length < needed) todos.push({ key: `slime-water-${i}`, icon: <ItemIcon id="(O)766" tooltip={false} />, text: t('todo.slimeWater'), to: '/farm/slimes', urgent: true });
    if (h.balls) todos.push({ key: `slime-balls-${i}`, icon: <ItemIcon id="(BC)56" tooltip={false} />, text: t('todo.slimeBalls', { count: h.balls }), to: '/farm/slimes' });
  }
  const pondsReady = save.farm.ponds.filter((p) => p.output).length;
  if (pondsReady) todos.push({ key: 'ponds', icon: <ItemIcon id="(O)812" tooltip={false} />, text: t('todo.ponds', { count: pondsReady }), to: '/farm/ponds' });
  const pondAsks = save.farm.ponds.filter((p) => p.request).length;
  if (pondAsks) todos.push({ key: 'pond-asks', icon: <ItemIcon id="(O)812" tooltip={false} />, text: t('todo.pondAsks', { count: pondAsks }), to: '/quests' });

  // People.
  const today = seasonDays(season, npcs, calendar.festivals)[day - 1];
  for (const npc of today?.birthdays ?? [])
    todos.push({ key: `bday-${npc}`, icon: <NpcHead npc={npc} />, text: t('todo.birthday', { name: name(npcs[npc]?.n) }), to: '/relationships', urgent: true });
  for (const f of today?.festivals ?? []) todos.push({ key: `fest-${f.id}`, icon: <UiIcon name="nav-calendar" w={14} h={12} scale={2} />, text: t('todo.festival', { name: festivalName(f) }), to: '/calendar/geral' });
  const events = availableEvents(player, season, day, 1200, save.isRaining);
  if (events.length)
    todos.push({ key: 'events', icon: <UiIcon name="heart-full" w={7} h={6} scale={3} />, text: t('todo.events', { count: events.length, names: [...new Set(events.map((e) => name(npcs[e.npc]?.n)))].join(', ') }), to: '/map' });
  const children = save.children.filter((c) => !player.friendships[c.name]?.talkedToday);
  if (children.length) todos.push({ key: 'kids', icon: <UiIcon name="heart-full" w={7} h={6} scale={3} />, text: t('todo.kids', { names: children.map((c) => c.name).join(', ') }), to: '/relationships' });

  // Quests and orders about to expire.
  const expiring = player.quests.filter((q) => !q.completed && q.daysLeft > 0 && q.daysLeft <= 2);
  if (expiring.length) todos.push({ key: 'quests', icon: <ItemIcon id="(O)842" tooltip={false} />, text: t('todo.quests', { count: expiring.length }), to: '/quests', urgent: true });
  const orders = save.specialOrders.filter((o) => o.dueDate - (player.stats.daysPlayed ?? 0) <= 2 && o.objectives.some((ob) => ob.current < ob.max));
  if (orders.length) todos.push({ key: 'orders', icon: <ItemIcon id="(O)842" tooltip={false} />, text: t('todo.orders', { count: orders.length }), to: '/quests', urgent: true });

  // Shops.
  const shopDay = { season, day, year, daysPlayed: player.stats.daysPlayed ?? 0 };
  const cart = SHOPS.find((s) => s.id === 'Traveler');
  if (cart?.open?.(shopDay, save)) todos.push({ key: 'cart', icon: <ItemIcon id="(O)347" tooltip={false} />, text: t('todo.cart'), to: '/shops/Traveler' });
  if (weekday(shopDay) === 6 || weekday(shopDay) === 2) todos.push({ key: 'tv', icon: <ItemIcon id="(F)1466" tooltip={false} />, text: t('todo.tv') });

  // Season change.
  if (day === DAYS_IN_SEASON) {
    const next = SEASONS[(SEASONS.indexOf(season) + 1) % 4];
    todos.push({ key: 'season', icon: <ItemIcon id="(O)24" tooltip={false} />, text: t('todo.seasonEnd', { next: t(`common.seasons.${next}`) }), to: '/farm/crops', urgent: true });
  }

  const urgent = todos.filter((x) => x.urgent);
  const rest = todos.filter((x) => !x.urgent);
  const card = (x: Todo) => {
    const body = (
      <>
        <span className="todo__icon">{x.icon}</span>
        <span className="todo__text">{x.text}</span>
        {x.to && <span className="todo__go" aria-hidden="true">›</span>}
      </>
    );
    return (
      <li key={x.key}>
        {x.to ? (
          <Link to={x.to} className={x.urgent ? 'todo inset todo--urgent' : 'todo inset'}>
            {body}
          </Link>
        ) : (
          <span className="todo inset">{body}</span>
        )}
      </li>
    );
  };

  return (
    <section className="todos">
      <h3>{t('todo.title')}</h3>
      {todos.length === 0 && <p className="cc-summary__hint">{t('todo.nothing')}</p>}
      {urgent.length > 0 && <ul className="todo-list">{urgent.map(card)}</ul>}
      {rest.length > 0 && (
        <>
          <h4 className="todos__sub">{t('todo.goodToKnow')}</h4>
          <ul className="todo-list">{rest.map(card)}</ul>
        </>
      )}
    </section>
  );
}
