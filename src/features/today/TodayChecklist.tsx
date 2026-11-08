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
import { useChecks } from './checks';

interface Todo {
  key: string;
  icon: ReactNode;
  text: ReactNode;
  to?: string;
  /** Something to act on now (highlighted). */
  urgent?: boolean;
  /** Who it's for; without it the row is just good to know, with no checkbox. */
  scope?: 'farm' | 'player';
}

/** Everything worth doing today, gathered from the save; each card links to the page that helps. */
export function TodayChecklist({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const festivalName = useFestivalName();
  const { npcs, calendar } = gameData();
  const { season, day, year } = save.date;
  const todos: Todo[] = [];
  const checked = useChecks((s) => s.checked);
  const toggle = useChecks((s) => s.toggle);

  // Farm chores.
  const ready = save.farm.machines.filter((m) => m.ready).length;
  if (ready) todos.push({ key: 'machines', icon: <ItemIcon id="(BC)12" scale={2} tooltip={false} />, text: t('todo.machines', { count: ready }), to: '/farm/producing', urgent: true, scope: 'farm' });
  const harvest = save.farm.areas.reduce((n, a) => n + a.crops.filter((c) => c.daysToHarvest === 0 && !c.dead).length, 0);
  if (harvest) todos.push({ key: 'harvest', icon: <ItemIcon id="(O)24" tooltip={false} />, text: t('todo.harvest', { count: harvest }), to: '/farm/crops', urgent: true, scope: 'farm' });
  // Hay for tomorrow morning: one per animal.
  const hayShort = save.farm.animals.length - save.farm.hay;
  if (hayShort > 0) todos.push({ key: 'hay', icon: <ItemIcon id="(O)178" tooltip={false} />, text: t('todo.hay', { count: hayShort }), to: '/farm/animals', urgent: true, scope: 'farm' });
  const toPet = save.farm.animals.filter((a) => !a.autoPet).length;
  if (toPet) todos.push({ key: 'pet', icon: <ItemIcon id="(O)176" tooltip={false} />, text: t('todo.pet', { count: toPet }), to: '/farm/animals', urgent: true, scope: 'farm' });
  if (save.farm.pets.length && save.farm.bowls.some((w) => !w) && !save.isRaining)
    todos.push({ key: 'bowl', icon: <ItemIcon id="(T)WateringCan" tooltip={false} />, text: t('todo.bowl'), to: '/farm/animals', urgent: true, scope: 'farm' });
  for (const [i, h] of save.slimeHutches.entries()) {
    const needed = Math.min(h.water.length || 4, Math.ceil(h.slimes.length / 5));
    if (!h.sprinkler && h.water.filter(Boolean).length < needed) todos.push({ key: `slime-water-${i}`, icon: <ItemIcon id="(O)766" tooltip={false} />, text: t('todo.slimeWater'), to: '/farm/slimes', urgent: true, scope: 'farm' });
    if (h.balls) todos.push({ key: `slime-balls-${i}`, icon: <ItemIcon id="(BC)56" tooltip={false} />, text: t('todo.slimeBalls', { count: h.balls }), to: '/farm/slimes', scope: 'farm' });
  }
  const pondsReady = save.farm.ponds.filter((p) => p.output).length;
  if (pondsReady) todos.push({ key: 'ponds', icon: <ItemIcon id="(O)812" tooltip={false} />, text: t('todo.ponds', { count: pondsReady }), to: '/farm/ponds', scope: 'farm' });
  const pondAsks = save.farm.ponds.filter((p) => p.request).length;
  if (pondAsks) todos.push({ key: 'pond-asks', icon: <ItemIcon id="(O)812" tooltip={false} />, text: t('todo.pondAsks', { count: pondAsks }), to: '/quests', scope: 'farm' });

  // People.
  const today = seasonDays(season, npcs, calendar.festivals)[day - 1];
  for (const npc of today?.birthdays ?? [])
    todos.push({ key: `bday-${npc}`, icon: <NpcHead npc={npc} />, text: t('todo.birthday', { name: name(npcs[npc]?.n) }), to: '/relationships', urgent: true, scope: 'player' });
  for (const f of today?.festivals ?? []) todos.push({ key: `fest-${f.id}`, icon: <UiIcon name="nav-calendar" w={14} h={12} scale={2} />, text: t('todo.festival', { name: festivalName(f) }), to: '/calendar/geral' });
  const events = availableEvents(player, season, day, 1200, save.isRaining);
  if (events.length)
    todos.push({ key: 'events', icon: <UiIcon name="heart-full" w={7} h={6} scale={3} />, text: t('todo.events', { count: events.length, names: [...new Set(events.map((e) => name(npcs[e.npc]?.n)))].join(', ') }), to: '/map', scope: 'player' });
  // A kiss and a chat a day keep the spouse happy; a roommate only talks.
  const partner = player.spouse ? player.friendships[player.spouse] : undefined;
  if (player.spouse && npcs[player.spouse] && partner && !partner.talkedToday)
    todos.push({ key: 'spouse', icon: <NpcHead npc={player.spouse} />, text: t(partner.status === 'Roommate' ? 'todo.roommate' : 'todo.spouse', { name: name(npcs[player.spouse].n) }), to: '/relationships', urgent: true, scope: 'player' });
  const children = save.children.filter((c) => !player.friendships[c.name]?.talkedToday);
  if (children.length) todos.push({ key: 'kids', icon: <UiIcon name="heart-full" w={7} h={6} scale={3} />, text: t('todo.kids', { names: children.map((c) => c.name).join(', ') }), to: '/relationships', scope: 'player' });

  // Quests and orders about to expire.
  for (const q of player.quests.filter((x) => !x.completed)) {
    const soon = q.daysLeft > 0 && q.daysLeft <= 2;
    todos.push({ key: `quest-${q.id}`, icon: <ItemIcon id={q.item ?? '(O)842'} tooltip={false} />, text: soon ? t('todo.questSoon', { title: q.title, count: q.daysLeft }) : q.title, to: '/quests', urgent: soon, scope: 'player' });
  }
  const orders = save.specialOrders.filter((o) => o.dueDate - (player.stats.daysPlayed ?? 0) <= 2 && o.objectives.some((ob) => ob.current < ob.max));
  if (orders.length) todos.push({ key: 'orders', icon: <ItemIcon id="(O)842" tooltip={false} />, text: t('todo.orders', { count: orders.length }), to: '/quests', urgent: true, scope: 'farm' });

  // Shops.
  const shopDay = { season, day, year, daysPlayed: player.stats.daysPlayed ?? 0 };
  const cart = SHOPS.find((s) => s.id === 'Traveler');
  if (cart?.open?.(shopDay, save)) todos.push({ key: 'cart', icon: <ItemIcon id="(O)347" tooltip={false} />, text: t('todo.cart'), to: '/shops/Traveler' });
  if (weekday(shopDay) === 6 || weekday(shopDay) === 2) todos.push({ key: 'tv', icon: <ItemIcon id="(F)1466" tooltip={false} />, text: t('todo.tv') });

  // Season change.
  if (day === DAYS_IN_SEASON) {
    const next = SEASONS[(SEASONS.indexOf(season) + 1) % 4];
    todos.push({ key: 'season', icon: <ItemIcon id="(O)24" tooltip={false} />, text: t('todo.seasonEnd', { next: t(`common.seasons.${next}`) }), to: '/farm/crops', urgent: true, scope: 'farm' });
  }

  const markOf = (x: Todo) => (x.scope === 'farm' ? `farm:${x.key}` : `player:${player.id}:${x.key}`);

  const card = (x: Todo) => {
    const done = !!x.scope && !!checked[markOf(x)];
    const classes = ['todo', 'inset', x.urgent && !done && 'todo--urgent', done && 'todo--done', x.scope && 'todo--check'].filter(Boolean).join(' ');
    const body = (
      <>
        <span className="todo__icon">{x.icon}</span>
        <span className="todo__text">{x.text}</span>
        {x.to && <span className="todo__go" aria-hidden="true">›</span>}
      </>
    );
    return (
      <li key={x.key} className={classes}>
        {x.scope && <input type="checkbox" checked={done} onChange={() => toggle(markOf(x))} aria-label={t('todo.done')} />}
        {x.to ? (
          <Link to={x.to} className="todo__body">
            {body}
          </Link>
        ) : (
          <span className="todo__body">{body}</span>
        )}
      </li>
    );
  };

  /** A section of checkable rows: urgent first, done last, with its count in the title. */
  const section = (title: string, list: Todo[]) => {
    if (list.length === 0) return null;
    const rank = (x: Todo) => (checked[markOf(x)] ? 2 : x.urgent ? 0 : 1);
    const done = list.filter((x) => checked[markOf(x)]).length;
    return (
      <>
        <h3>
          {title} ({done}/{list.length})
        </h3>
        <ul className="todo-list">{[...list].sort((a, b) => rank(a) - rank(b)).map(card)}</ul>
      </>
    );
  };
  const info = todos.filter((x) => !x.scope);

  return (
    <section className="todos">
      {todos.length === 0 && <p className="cc-summary__hint">{t('todo.nothing')}</p>}
      {section(t('todo.farm'), todos.filter((x) => x.scope === 'farm'))}
      {section(t('todo.player', { name: player.name }), todos.filter((x) => x.scope === 'player'))}
      {info.length > 0 && (
        <>
          <h4 className="todos__sub">{t('todo.goodToKnow')}</h4>
          <ul className="todo-list">{info.map(card)}</ul>
        </>
      )}
    </section>
  );
}
