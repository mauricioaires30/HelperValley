import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { gameData } from '@/data/gameData';
import { useGameName } from '@/i18n';
import { useCurrentSave, useSaveStore } from '@/store/saveStore';
import { seasonDays } from '@/features/calendar/calendar';
import { SHOPS } from '@/features/shops/catalog';

const KEY = 'hv-notify';
const supported = () => typeof window !== 'undefined' && 'Notification' in window;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1' && supported() && Notification.permission === 'granted';
  } catch {
    return false;
  }
}

/** Button on the Saves page: ask for permission and remember the choice. */
export function NotifyToggle() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(readEnabled);
  if (!supported()) return null;
  const toggle = async () => {
    if (enabled) {
      setEnabled(false);
      try {
        localStorage.setItem(KEY, '0');
      } catch {
        // not remembered
      }
      return;
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    const on = permission === 'granted';
    setEnabled(on);
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      // not remembered
    }
  };
  return (
    <div className="home-fold home-fold--row box">
      <strong>{t('notify.title')}</strong>
      {Notification.permission === 'denied' ? (
        <span className="saves__hint">{t('notify.denied')}</span>
      ) : (
        <button className={enabled ? 'button' : 'button button--primary'} onClick={() => void toggle()}>
          {enabled ? t('notify.off') : t('notify.on')}
        </button>
      )}
    </div>
  );
}

/**
 * When the live folder reloads because the game saved (a new day), show a system notification
 * with the date and the day's highlights. Only while the tab is open; nothing runs in the background.
 */
export function useSaveNotifications() {
  const { t } = useTranslation();
  const name = useGameName();
  const lastUpdate = useSaveStore((s) => s.lastUpdate);
  const { save, player } = useCurrentSave();

  useEffect(() => {
    if (!lastUpdate || !save || !player || !readEnabled()) return;
    const { season, day, year } = save.date;
    const highlights: string[] = [];
    const ready = save.farm.machines.filter((m) => m.ready).length;
    if (ready) highlights.push(t('todo.machines', { count: ready }));
    for (const npc of seasonDays(season, gameData().npcs, gameData().calendar.festivals)[day - 1]?.birthdays ?? []) {
      highlights.push(t('todo.birthday', { name: name(gameData().npcs[npc]?.n) }));
    }
    const cart = SHOPS.find((s) => s.id === 'Traveler');
    if (cart?.open?.({ season, day, year, daysPlayed: player.stats.daysPlayed ?? 0 }, save)) highlights.push(t('todo.cart'));
    try {
      new Notification(t('notify.newDay', { date: t('saves.day', { day, season: t(`common.seasons.${season}`), year }) }), {
        body: highlights.slice(0, 3).join('\n') || t('notify.nothing'),
        icon: `${import.meta.env.BASE_URL}favicon.png`,
        tag: 'helpervalley-day',
      });
    } catch {
      // Some browsers only allow notifications from a service worker; skip quietly.
    }
    // Only when a new update arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUpdate?.at]);
}
