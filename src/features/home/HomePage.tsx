import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { ConnectPanel, SaveList } from '@/features/saves/SavePicker';
import { RestoreFolders } from '@/features/saves/LiveSetupGuide';
import { NotifyToggle } from '@/features/saves/Notifications';
import { SharePanel } from '@/features/share/SharePanel';

export function HomePage() {
  const { t } = useTranslation();
  const source = useSaveStore((s) => s.source);
  const status = useSaveStore((s) => s.status);
  const error = useSaveStore((s) => s.error);

  return (
    <div className="home">
      {error && (
        <p className="box" role="alert">
          {t('saves.error', { message: error })}
        </p>
      )}
      {source ? <SaveList /> : <ConnectPanel />}
      {status === 'loading' && <p>{t('saves.loading')}</p>}
      <div className="home__more">
        <SharePanel />
        <NotifyToggle />
        <RestoreFolders />
      </div>
      <p className="cc-summary__hint home__privacy">{t('saves.how.local')}</p>
    </div>
  );
}
