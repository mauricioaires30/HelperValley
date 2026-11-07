import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import type { SaveData } from '@/save/model';
import { useCurrentSave } from '@/store/saveStore';
import { daysUntil, DAYS_IN_SEASON, SEASONS } from '@/features/calendar/calendar';
import { FestivalIcon, useFestivalName } from '@/features/calendar/CalendarPage';
import { bestOwnedGifts, ownedObjectIds } from '@/features/relationships/gifts';
import { ItemIcon, NpcHead, SeasonIcon } from '@/ui';
import './today.css';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
/** Entries per page in the "next 7 days / to do" box. */
const PAGE_SIZE = 5;

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

/** The day itself: date, luck, tomorrow's weather and days left in the season. */
export function TodayHero() {
  const { t } = useTranslation();
  const { save } = useCurrentSave();
  if (!save) return null;
  const { season, day, year } = save.date;
  const weekday = WEEKDAYS[(day - 1) % 7];
  const daysLeft = DAYS_IN_SEASON - day;
  const nextSeason = t(`common.seasons.${SEASONS[(SEASONS.indexOf(season) + 1) % 4]}`);
  return (
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
  );
}

function useTodayEntries(save: SaveData) {
  const { t } = useTranslation();
  const name = useGameName();
  const festivalName = useFestivalName();
  const owned = useMemo(() => ownedObjectIds(save), [save]);
  const soon = useMemo(() => upcoming(save, 7), [save]);
  const when = (d: number) => (d === 0 ? t('today.todayLabel') : t('today.inDays', { count: d }));

  const soonEntries: ReactNode[] = [
    ...soon.festivals.map(({ f, in: d }) => (
      <li key={f.id}>
        <FestivalIcon festival={f} />
        <span className="today__text">
          <strong>{festivalName(f)}</strong> · {when(d)}
        </span>
      </li>
    )),
    ...soon.birthdays.map(({ npc, in: d }) => {
      const gifts = bestOwnedGifts(npc, owned, 3);
      return (
        <li key={npc} className={d === 0 ? 'today__birthday' : undefined}>
          <NpcHead npc={npc} />
          <span className="today__text">
            {t('calendar.birthday', { name: name(gameData().npcs[npc].n) })} · {when(d)}
          </span>
          {gifts.taste === 'love' && gifts.ids.map((id) => <ItemIcon key={id} id={id} />)}
        </li>
      );
    }),
  ];

  return { soonEntries };
}

/** "Next 7 days", one page at a time with arrows to keep the page short. */
export function TodayLists() {
  const { save } = useCurrentSave();
  return save ? <TodayListsFor save={save} /> : null;
}

function TodayListsFor({ save }: { save: SaveData }) {
  const { t } = useTranslation();
  const { soonEntries } = useTodayEntries(save);
  const [page, setPage] = useState(0);

  const chunk = (title: string, entries: ReactNode[]) => {
    const list = entries.length ? entries : [<li key="empty">{t('today.nothingSoon')}</li>];
    return Array.from({ length: Math.ceil(list.length / PAGE_SIZE) }, (_, i) => ({ title, entries: list.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE) }));
  };
  const pages = chunk(t('today.soon'), soonEntries);
  const index = Math.min(page, pages.length - 1);
  const current = pages[index];

  return (
    <section className="today__lists box" aria-live="polite">
      <header className="today__pager">
        <button className="button" onClick={() => setPage((index - 1 + pages.length) % pages.length)} aria-label={t('today.previous')}>
          ◀
        </button>
        <h3>{current.title}</h3>
        <span className="today__page">
          {index + 1}/{pages.length}
        </span>
        <button className="button" onClick={() => setPage((index + 1) % pages.length)} aria-label={t('today.next')}>
          ▶
        </button>
      </header>
      <ul className="today__list">{current.entries}</ul>
    </section>
  );
}
