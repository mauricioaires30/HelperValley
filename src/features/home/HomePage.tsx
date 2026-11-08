import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { ConnectPanel, SaveList } from '@/features/saves/SavePicker';
import { LiveSetupGuide } from '@/features/saves/LiveSetupGuide';
import { supportsDirectoryAccess } from '@/save/sources';
import { NotifyToggle } from '@/features/saves/Notifications';
import { CachedBanner } from '@/features/saves/CachedBanner';

/** Always at the bottom: what the site does with saves and how to keep it live. */
function HowItWorks() {
  const { t } = useTranslation();
  return (
    <section className="how-it-works">
      <h2>{t('saves.how.title')}</h2>
      <ul className="farm-facts">
        <li>{t('saves.how.local')}</li>
        <li>{t('saves.how.copy')}</li>
        <li>{t('saves.how.live')}</li>
      </ul>
      <NotifyToggle />
      {supportsDirectoryAccess() && <LiveSetupGuide />}
    </section>
  );
}

export function HomePage() {
  const { t } = useTranslation();
  const source = useSaveStore((s) => s.source);
  const status = useSaveStore((s) => s.status);
  const error = useSaveStore((s) => s.error);
  const summaries = useSaveStore((s) => s.summaries);

  return (
    <div className="home">
      <CachedBanner />
      {error && (
        <p className="box" role="alert">
          {t('saves.error', { message: error })}
        </p>
      )}
      {source || summaries.length > 0 ? <SaveList /> : <ConnectPanel />}
      {status === 'loading' && <p>{t('saves.loading')}</p>}
      <HowItWorks />
    </div>
  );
}
