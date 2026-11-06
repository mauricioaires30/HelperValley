import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { Player, SaveData } from '@/save/model';
import { useCurrentSave } from '@/store/saveStore';
import { totalCount } from '@/save/inventory';
import { daysUntil, DAYS_IN_SEASON, SEASONS } from '@/features/calendar/calendar';
import { FestivalIcon, useFestivalName } from '@/features/calendar/CalendarPage';
import { buildRelationships } from '@/features/relationships/relationships';
import { bestOwnedGifts, ownedObjectIds } from '@/features/relationships/gifts';
import { buildRooms } from '@/features/community-center/bundles';
import { buildMuseum } from '@/features/museum/museum';
import { ItemIcon, NpcHead, SeasonIcon } from '@/ui';
import './today.css';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Same bands the TV fortune teller uses. */
function luckKey(luck: number) {
  if (luck > 0.07) return 'great';
  if (luck > 0.02) return 'good';
  if (luck === 0) return 'neutral';
  if (luck >= -0.02) return 'mixed';
  if (luck >= -0.07) return 'bad';
  return 'awful';
}

/** Birthdays and festivals within `days` days (0 = today; running festivals count as today). */
function upcoming(save: SaveData, days: number) {
  const { npcs, calendar } = gameData();
  const birthdays = Object.entries(npcs)
    .filter(([, n]) => n.birth && n.social !== 3)
    .map(([npc, n]) => ({ npc, in: daysUntil(save.date, n.birth!) }))
    .filter((b) => b.in <= days)
    .sort((a, b) => a.in - b.in);
  const festivals = calendar.festivals
    .map((f) => {
      const running = f.season === save.date.season && save.date.day >= f.start && save.date.day <= f.end;
      return { f, in: running ? 0 : daysUntil(save.date, { season: f.season, day: f.start }) };
    })
    .filter((x) => x.in <= days)
    .sort((a, b) => a.in - b.in);
  return { birthdays, festivals };
}

function Today({ save, player }: { save: SaveData; player: Player }) {
  const { t } = useTranslation();
  const name = useGameName();
  const festivalName = useFestivalName();
  const { season, day, year } = save.date;
  const weekday = WEEKDAYS[(day - 1) % 7];
  const owned = useMemo(() => ownedObjectIds(save), [save]);
  const soon = useMemo(() => upcoming(save, 7), [save]);
  const relationships = useMemo(() => buildRelationships(save, player), [save, player]);
  const ccReady = useMemo(() => {
    if (save.communityCenter.isJoja) return 0;
    const slots = buildRooms(save, gameData().bundles).flatMap((r) =>
      r.bundles.filter((b) => !b.complete).flatMap((b) => b.slots.filter((s) => !s.done && s.id !== 'money')),
    );
    return slots.filter((s) => totalCount(s.owned) >= s.count).length;
  }, [save]);
  const museumReady = useMemo(() => buildMuseum(save, gameData().museum).filter((e) => e.status === 'owned').length, [save]);

  const eventsReady = relationships.filter((r) => r.nextEvent?.unlocked);
  const giftable = relationships.filter((r) => r.giftsThisWeek < 2 && r.giftsToday === 0).length;
  const daysLeft = DAYS_IN_SEASON - day;
  const nextSeason = t(`common.seasons.${SEASONS[(SEASONS.indexOf(season) + 1) % 4]}`);
  const when = (d: number) => (d === 0 ? t('today.todayLabel') : t('today.inDays', { count: d }));

  return (
    <div className="today">
      <section className="today__hero inset">
        <SeasonIcon season={season} scale={4} />
        <div>
          <h2>
            {t(`calendar.weekdaysLong.${weekday}`)}, {t('saves.day', { day, season: t(`common.seasons.${season}`), year })}
          </h2>
          <p>{t(`today.luck.${luckKey(save.dailyLuck)}`)}</p>
          {save.weatherTomorrow && (
            <p>{t('today.tomorrow', { weather: t(`today.weather.${save.weatherTomorrow}`, { defaultValue: save.weatherTomorrow }) })}</p>
          )}
          <p className="cc-summary__hint">
            {daysLeft === 0 ? t('today.lastDay', { season: nextSeason }) : t('today.daysLeft', { count: daysLeft, season: nextSeason })}
          </p>
        </div>
      </section>

      <div className="today__grid">
        <section className="box">
          <h3>{t('today.soon')}</h3>
          <ul className="today__list">
            {soon.festivals.map(({ f, in: d }) => (
              <li key={f.id}>
                <FestivalIcon festival={f} />
                <span>
                  <strong>{festivalName(f)}</strong> · {when(d)}
                </span>
              </li>
            ))}
            {soon.birthdays.map(({ npc, in: d }) => {
              const gifts = bestOwnedGifts(npc, owned, 3);
              return (
                <li key={npc} className={d === 0 ? 'today__birthday' : undefined}>
                  <NpcHead npc={npc} />
                  <span>
                    {t('calendar.birthday', { name: name(gameData().npcs[npc].n) })} · {when(d)}
                  </span>
                  {gifts.taste === 'love' && gifts.ids.map((id) => <ItemIcon key={id} id={id} />)}
                </li>
              );
            })}
            {soon.festivals.length + soon.birthdays.length === 0 && <li>{t('today.nothingSoon')}</li>}
          </ul>
        </section>

        <section className="box">
          <h3>{t('today.todo')}</h3>
          <ul className="today__list">
            {ccReady > 0 && (
              <li>
                <Link to="/cc">{t('today.ccReady', { count: ccReady })}</Link>
              </li>
            )}
            {museumReady > 0 && (
              <li>
                <Link to="/museum">{t('today.museumReady', { count: museumReady })}</Link>
              </li>
            )}
            {eventsReady.map((r) => (
              <li key={r.npc}>
                <NpcHead npc={r.npc} />
                <Link to="/relationships">{t('today.eventReady', { name: name(gameData().npcs[r.npc].n), hearts: r.nextEvent!.hearts })}</Link>
              </li>
            ))}
            <li>
              <Link to="/relationships">{t('today.giftable', { count: giftable })}</Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Today's summary, shown at the top of the calendar when a save is loaded. */
export function TodayPanel() {
  const { save, player } = useCurrentSave();
  return save && player ? <Today save={save} player={player} /> : null;
}
