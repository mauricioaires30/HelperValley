import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData, type Festival, type Season } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { useCurrentSave } from '@/store/saveStore';
import { NpcHead, SeasonIcon, Tooltip } from '@/ui';
import { SEASONS, seasonDays } from './calendar';
import './calendar.css';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function useFestivalName() {
  const { t } = useTranslation();
  const name = useGameName();
  return (f: Festival) => (f.n ? name(f.n) : t(`calendar.festival.${f.id}`));
}

/** Works without a save (plain calendar); with one, marks today and past days. */
export function CalendarPage() {
  const { t } = useTranslation();
  const name = useGameName();
  const festivalName = useFestivalName();
  const { save } = useCurrentSave();
  const today = save?.date;
  const [season, setSeason] = useState<Season>(today?.season ?? 'spring');
  const days = useMemo(() => seasonDays(season, gameData().npcs, gameData().calendar.festivals), [season]);

  const isToday = (day: number) => today?.season === season && today.day === day;
  const isPast = (day: number) => today?.season === season && day < today.day;

  return (
    <div className="calendar">
      <header className="cc__header">
        <h2>{t('calendar.title')}</h2>
        <div className="calendar__seasons" role="tablist">
          {SEASONS.map((s) => (
            <button key={s} role="tab" aria-selected={s === season} className={s === season ? 'button button--primary' : 'button'} onClick={() => setSeason(s)}>
              <SeasonIcon season={s} />
              {t(`common.seasons.${s}`)}
            </button>
          ))}
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
