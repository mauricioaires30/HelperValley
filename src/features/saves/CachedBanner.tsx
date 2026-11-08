import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { supportsDirectoryAccess } from '@/save/sources';
import { FolderInput } from './SavePicker';

/** "x minutes ago" in the current language. */
function relativeTime(at: number, lang: string) {
  const minutes = Math.round((at - Date.now()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'pt' ? 'pt-BR' : 'en', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  if (Math.abs(minutes) < 60 * 24) return rtf.format(Math.round(minutes / 60), 'hour');
  return rtf.format(Math.round(minutes / 1440), 'day');
}

/** Top bar chip while showing the cached copy: when it was read and a button to go live again. */
export function CachedChip() {
  const { t, i18n } = useTranslation();
  const cachedAt = useSaveStore((s) => s.cachedAt);
  const source = useSaveStore((s) => s.source);
  const pendingHandle = useSaveStore((s) => s.pendingHandle);
  const reconnect = useSaveStore((s) => s.reconnect);
  const connectDirectory = useSaveStore((s) => s.connectDirectory);
  const folder = useSaveStore((s) => s.folder);
  if (!cachedAt || source || folder === 'shared') return null;
  return (
    <span className="cached-chip box" role="status" title={t(`saves.${pendingHandle ? 'cachedHintReconnect' : supportsDirectoryAccess() ? 'cachedHintPick' : 'cachedHintUnsupported'}`)}>
      {t('saves.cachedShort', { time: relativeTime(cachedAt, i18n.language) })}
      {pendingHandle ? (
        <button className="button button--primary" onClick={() => void reconnect()}>
          {t('saves.cachedLive')}
        </button>
      ) : supportsDirectoryAccess() ? (
        <button className="button" onClick={() => void connectDirectory()}>
          {t('saves.cachedOpen')}
        </button>
      ) : null}
    </span>
  );
}

/** Shown while the page displays the save cached in IndexedDB rather than the live folder. */
export function CachedBanner() {
  const { t, i18n } = useTranslation();
  const cachedAt = useSaveStore((s) => s.cachedAt);
  const source = useSaveStore((s) => s.source);
  const pendingHandle = useSaveStore((s) => s.pendingHandle);
  const reconnect = useSaveStore((s) => s.reconnect);
  const connectDirectory = useSaveStore((s) => s.connectDirectory);
  if (!cachedAt || source) return null;

  // Three cases: a remembered folder waiting for a click, no folder chosen yet, or a browser
  // that can't keep folder access at all (Firefox, Safari, Brave by default).
  const hint = pendingHandle ? 'cachedHintReconnect' : supportsDirectoryAccess() ? 'cachedHintPick' : 'cachedHintUnsupported';
  return (
    <div className="cached-banner box" role="status">
      <span>
        {t('saves.cached', { time: relativeTime(cachedAt, i18n.language) })} {t(`saves.${hint}`)}
      </span>
      {pendingHandle ? (
        <button className="button button--primary" onClick={() => void reconnect()}>
          {t('saves.cachedLive')}
        </button>
      ) : supportsDirectoryAccess() ? (
        <button className="button" onClick={() => void connectDirectory()}>
          {t('saves.cachedOpen')}
        </button>
      ) : (
        <FolderInput label={t('saves.cachedOpen')} />
      )}
    </div>
  );
}
