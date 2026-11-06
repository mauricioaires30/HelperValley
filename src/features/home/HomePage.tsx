import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { ConnectPanel, SaveList } from '@/features/saves/SavePicker';
import { SaveOverview } from './SaveOverview';

export function HomePage() {
  const { t } = useTranslation();
  const source = useSaveStore((s) => s.source);
  const status = useSaveStore((s) => s.status);
  const error = useSaveStore((s) => s.error);
  const cachedAt = useSaveStore((s) => s.cachedAt);

  return (
    <div className="home">
      {error && (
        <p className="box" role="alert">
          {t('saves.error', { message: error })}
        </p>
      )}
      {/* With a cached save, the banner above the tabs offers to reconnect instead. */}
      {source ? <SaveList /> : cachedAt ? null : <ConnectPanel />}
      {status === 'loading' && <p>{t('saves.loading')}</p>}
      <SaveOverview />
    </div>
  );
}
