import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { ConnectPanel, SaveList } from '@/features/saves/SavePicker';
import { LiveSetupGuide } from '@/features/saves/LiveSetupGuide';
import { NotifyToggle } from '@/features/saves/Notifications';
import { SharePanel } from '@/features/share/SharePanel';

export function HomePage() {
  const { t } = useTranslation();
  const source = useSaveStore((s) => s.source);
  const status = useSaveStore((s) => s.status);
  const error = useSaveStore((s) => s.error);
  const folderGone = useSaveStore((s) => s.folderGone);
  // In someone else's room: their save is shown, so the full guide would only be in the way.
  const guest = useSaveStore((s) => s.folder === 'shared');

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
      {source ? <SaveList /> : !guest && <ConnectPanel />}
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
