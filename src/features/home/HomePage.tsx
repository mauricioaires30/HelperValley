import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { ConnectPanel, SaveList } from '@/features/saves/SavePicker';
import { SaveOverview } from './SaveOverview';

export function HomePage() {
  const { t } = useTranslation();
  const source = useSaveStore((s) => s.source);
  const status = useSaveStore((s) => s.status);
  const error = useSaveStore((s) => s.error);
  const summaries = useSaveStore((s) => s.summaries);

  return (
    <div className="home">
      {error && (
        <p className="box" role="alert">
          {t('saves.error', { message: error })}
        </p>
      )}
      {source || summaries.length > 0 ? <SaveList /> : <ConnectPanel />}
      {status === 'loading' && <p>{t('saves.loading')}</p>}
      <SaveOverview />
    </div>
  );
}
