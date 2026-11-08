import { useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { gameData, type Festival, type Season } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { useCurrentSave } from '@/store/saveStore';
import { TodayHero, TodayLists } from '@/features/today/TodayPage';
import { TodayChecklist } from '@/features/today/TodayChecklist';
import { RequireSave } from '@/features/saves/RequireSave';
import { NpcHead, SeasonIcon, Tooltip } from '@/ui';
import { SEASONS, seasonDays } from './calendar';
import './calendar.css';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function useFestivalName() {
  const { t } = useTranslation();
  const name = useGameName();
  return (f: Festival) => (f.n ? name(f.n) : t(`calendar.festival.${f.id}`));
}

/** The waving purple flag the game's calendar billboard uses to mark festivals. */
export function FestivalIcon({ festival }: { festival: Festival }) {
  return <span className={festival.passive ? 'festival-flag festival-flag--passive' : 'festival-flag'} aria-hidden />;
}

/** Order of a (year, season) pair, to compare and step through seasons. */
const seasonIndex = (year: number, season: Season) => (year - 1) * 4 + SEASONS.indexOf(season);

const TABS = ['hoje', 'geral'] as const;

/** Two tabs: "Hoje" (the day, what to do, the next 7 days) and "Geral" (the season calendar). */
export function CalendarPage() {
  const { t } = useTranslation();
  const { tab } = useParams<{ tab?: string }>();
  if (!tab || !(TABS as readonly string[]).includes(tab)) return <Navigate to="/calendar/hoje" replace />;
  return (
    <div className="calendar">
      <nav className="calendar__nav calendar__tabs" aria-label={t('nav.calendar')}>
        {TABS.map((id) => (
          <NavLink key={id} to={`/calendar/${id}`} className={({ isActive }) => (isActive ? 'button button--primary' : 'button')}>
            {t(`calendar.tab.${id}`)}
          </NavLink>
        ))}
      </nav>
      {tab === 'hoje' ? (
        <RequireSave>
          {(save, player) => (
            <>
              <TodayHero />
              <TodayChecklist save={save} player={player} />
              <TodayLists />
            </>
          )}
        </RequireSave>
      ) : (
        <SeasonCalendar />
      )}
    </div>
  );
}

/** The season grid; works without a save as a plain calendar. */
function SeasonCalendar() {
  const { t } = useTranslation();
  const name = useGameName();
  const festivalName = useFestivalName();
  const { save } = useCurrentSave();
  const today = save?.date;
  const [view, setView] = useState({ year: today?.year ?? 1, season: today?.season ?? ('spring' as Season) });
  const days = useMemo(() => seasonDays(view.season, gameData().npcs, gameData().calendar.festivals), [view.season]);

  // Jump to the new day when the game saves (or another save is opened).
  useEffect(() => {
    if (today) setView({ year: today.year, season: today.season });
  }, [today?.year, today?.season]);

  const step = (delta: number) => {
    const index = Math.max(0, seasonIndex(view.year, view.season) + delta);
    setView({ year: Math.floor(index / 4) + 1, season: SEASONS[index % 4] });
  };

  const current = today ? seasonIndex(today.year, today.season) : -1;
  const shown = seasonIndex(view.year, view.season);
  const isToday = (day: number) => shown === current && today?.day === day;
  const isPast = (day: number) => shown < current || (shown === current && day < (today?.day ?? 0));

  return (
    <div>
      <header className="calendar__header">
        <h2>{t('calendar.title')}</h2>
        <div className="calendar__nav">
          {today && shown !== current && (
            <button className="button" onClick={() => setView({ year: today.year, season: today.season })}>
              {t('calendar.backToToday')}
            </button>
          )}
          <button className="button" onClick={() => step(-1)} disabled={shown === 0} aria-label={t('calendar.previous')}>
            ◀
          </button>
          <span className="calendar__current box">
            <SeasonIcon season={view.season} />
            {t('calendar.seasonYear', { season: t(`common.seasons.${view.season}`), year: view.year })}
          </span>
          <button className="button" onClick={() => step(1)} aria-label={t('calendar.next')}>
            ▶
          </button>
        </div>
      </header>

      <div className="calendar__grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="calendar__weekday">
            {t(`calendar.weekdays.${d}`)}
          </div>
        ))}
        {days.map(({ day, birthdays, festivals }) => (
          <div
            key={day}
            className={['calendar__day inset', isToday(day) && 'calendar__day--today', isPast(day) && 'calendar__day--past', festivals.some((f) => !f.passive) && 'calendar__day--festival']
              .filter(Boolean)
              .join(' ')}
          >
            <span className="calendar__number">{day}</span>
            {isToday(day) && <span className="calendar__today">{t('calendar.today')}</span>}
            {festivals.map((f) => (
              <span key={f.id} className={f.passive ? 'calendar__festival calendar__festival--passive' : 'calendar__festival'}>
                <FestivalIcon festival={f} />
                {festivalName(f)}
              </span>
            ))}
            <span className="calendar__birthdays">
              {birthdays.map((npc) => (
                <Tooltip key={npc} text={t('calendar.birthday', { name: name(gameData().npcs[npc].n) })}>
                  <NpcHead npc={npc} />
                </Tooltip>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
