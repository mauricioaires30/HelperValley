import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { ConnectPanel, SaveList } from '@/features/saves/SavePicker';
import { LiveSetupGuide } from '@/features/saves/LiveSetupGuide';
import { NotifyToggle } from '@/features/saves/Notifications';
import { SharePanel } from '@/features/share/SharePanel';
import { useShareStore } from '@/features/share/room';

export function HomePage() {
  const { t } = useTranslation();
  const source = useSaveStore((s) => s.source);
  const status = useSaveStore((s) => s.status);
  const error = useSaveStore((s) => s.error);
  const folderGone = useSaveStore((s) => s.folderGone);
  // In someone else's room only the host's save is shown: no own farms to switch to, and no full guide.
  const guestRole = useShareStore((s) => s.role === 'guest' && s.status !== 'error');
  const guest = useSaveStore((s) => s.folder === 'shared') || guestRole;

  return (
    <div className="home">
      {error && (
        <p className="box" role="alert">
          {t('saves.error', { message: error })}
        </p>
      )}
      {folderGone && !source && (
        <p className="box" role="alert">
          {t('saves.folderGone')}
        </p>
      )}
      {!guest && (source ? <SaveList /> : <ConnectPanel />)}
      {status === 'loading' && <p>{t('saves.loading')}</p>}
      {(source || guest) && <LiveSetupGuide folded />}
      <div className="home__more">
        <SharePanel />
        <NotifyToggle />
      </div>
      <p className="cc-summary__hint home__privacy">{t('saves.how.local')}</p>
    </div>
  );
}
