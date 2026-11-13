import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAppLive } from '@/save/appStatus';
import { useSaveStore } from '@/store/saveStore';
import { useShareStore } from './room';

/** Whether the saves on screen come live from the HelperValley app: your own, or the host's in a room. */
export function useAppLive(): boolean {
  const app = useSaveStore((s) => s.app);
  const folder = useSaveStore((s) => s.folder);
  const role = useShareStore((s) => s.role);
  const status = useShareStore((s) => s.status);
  const hostApp = useShareStore((s) => s.hostApp);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  if (role === 'guest' || folder === 'shared') return status === 'joined' && hostApp;
  return app ? isAppLive(app.status, app.modified, now) : false;
}

/**
 * "AO VIVO" at the top while the saves on screen are kept up to date by the app (yours, or the host's in a room),
 * and the same badge dimmed, still, when a save is open but the app is closed, so nobody mistakes an old copy for the current day.
 */
export function LiveBadge() {
  const { t } = useTranslation();
  const live = useAppLive();
  const hasSave = useSaveStore((s) => !!s.save);
  const inRoom = useShareStore((s) => s.role === 'guest' && s.status !== 'error');
  if (live) {
    return (
      <span className="live-badge box" role="status" title={t('share.liveHint')}>
        <span className="live-badge__dot" aria-hidden="true" />
        {t('share.live')}
      </span>
    );
  }
  if (!hasSave && !inRoom) return null;
  const guest = inRoom || useSaveStore.getState().folder === 'shared';
  return (
    <span className="live-badge live-badge--off box" role="status" title={t(guest ? 'share.notLiveGuestHint' : 'share.notLiveHint')}>
      <span className="live-badge__dot" aria-hidden="true" />
      {t('share.live')}
    </span>
  );
}
