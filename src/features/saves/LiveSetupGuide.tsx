import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { ItemIcon } from '@/ui';
import { detectPlatform, type Platform } from '@/save/platform';
import { APP_RELEASES_URL, latestAppRelease, pickAsset, type ReleaseAsset } from './appRelease';

const PLATFORMS: Platform[] = ['windows', 'mac', 'linux'];

/** The download button for this system, from the latest app release. */
function DownloadApp() {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<Platform>(detectPlatform);
  const [state, setState] = useState<{ asset: ReleaseAsset | null; version: string } | 'loading' | 'none' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    latestAppRelease()
      .then((release) => alive && setState(release ? { asset: pickAsset(release.assets, platform), version: release.tag_name.replace(/^app-v/, '') } : 'none'))
      .catch(() => alive && setState('error'));
    return () => {
      alive = false;
    };
  }, [platform]);

  return (
    <div className="download-app">
      <div className="calendar__nav" role="tablist">
        {PLATFORMS.map((p) => (
          <button key={p} role="tab" aria-selected={p === platform} className={p === platform ? 'button button--primary' : 'button'} onClick={() => setPlatform(p)}>
            {t(`saves.os.${p}`)}
          </button>
        ))}
      </div>
      {state === 'loading' && <p className="cc-summary__hint">{t('saves.app.checking')}</p>}
      {state === 'none' && <p className="cc-summary__hint">{t('saves.app.soon')}</p>}
      {(state === 'error' || (typeof state === 'object' && !state.asset)) && (
        <a className="button" href={APP_RELEASES_URL} target="_blank" rel="noreferrer">
          {t('saves.app.releases')}
        </a>
      )}
      {typeof state === 'object' && state.asset && (
        <a className="button button--primary download-app__button" href={state.asset.browser_download_url}>
          <ItemIcon id="(O)176" scale={1} tooltip={false} />
          {t('saves.app.download', { os: t(`saves.os.${platform}`), version: state.version })}
        </a>
      )}
      <p className="cc-summary__hint">{t(`saves.app.unsigned.${platform}`)}</p>
    </div>
  );
}

function Guide() {
  const { t } = useTranslation();
  const connectDirectory = useSaveStore((s) => s.connectDirectory);
  return (
    <div className="live-guide__ways">
      <div className="live-guide__way">
        <h3>{t('saves.how.hostTitle')}</h3>
        <p className="cc-summary__hint">{t('saves.how.hostWho')}</p>
        <ol>
          <li>
            {t('saves.how.host1')}
            <DownloadApp />
          </li>
          <li>
            {t('saves.how.host2')}{' '}
            <button className="button button--primary" onClick={() => void connectDirectory()}>
              <ItemIcon id="(BC)130" scale={1} tooltip={false} />
              {t('saves.open')}
            </button>
          </li>
          <li>{t('saves.how.host3')}</li>
        </ol>
      </div>
      <div className="live-guide__way">
        <h3>{t('saves.how.guestTitle')}</h3>
        <p className="cc-summary__hint">{t('saves.how.guestWho')}</p>
        <ol>
          <li>{t('saves.how.guest1')}</li>
          <li>{t('saves.how.guest2')}</li>
          <li>{t('saves.how.guest3')}</li>
        </ol>
      </div>
    </div>
  );
}

/** How the site works: your own saves through the app, or someone else's room with a code. Folded once a folder is connected. */
export function LiveSetupGuide({ folded = false }: { folded?: boolean }) {
  const { t } = useTranslation();
  if (folded) {
    return (
      <details className="live-guide box">
        <summary>{t('saves.how.toggle')}</summary>
        <Guide />
      </details>
    );
  }
  return (
    <section className="live-guide box">
      <h2>{t('saves.how.title')}</h2>
      <Guide />
    </section>
  );
}
