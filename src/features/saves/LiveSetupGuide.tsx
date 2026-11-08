import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { ItemIcon } from '@/ui';
import { FolderInput } from './SavePicker';
import { detectPlatform, SAVES_PATH } from '@/save/platform';

/**
 * Chrome and Edge refuse to open folders inside AppData ("contains system files"), which is
 * where the game saves. Moving the saves to Documents and leaving a junction behind keeps the
 * game working unchanged while the browser reads the folder in Documents.
 */
export const JUNCTION_COMMAND = [
  '$saves = "$env:APPDATA\\StardewValley\\Saves"',
  '$docs = "$env:USERPROFILE\\Documents\\StardewValley Saves"',
  'Move-Item $saves $docs',
  'New-Item -ItemType Junction -Path $saves -Target $docs',
].join('; ');

export function LiveSetupGuide() {
  const { t } = useTranslation();
  const connectDirectory = useSaveStore((s) => s.connectDirectory);
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard?.writeText(JUNCTION_COMMAND).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });

  const platform = detectPlatform();
  if (platform !== 'windows') {
    // macOS and Linux: Chrome opens ~/.config fine, no folder moving needed.
    return (
      <section className="live-guide box">
        <h3>{t('saves.guide.title')}</h3>
        <ol>
          <li>
            {t('saves.guide.pickHidden', { path: SAVES_PATH[platform] })} <span className="saves__hint">{t(`saves.hidden.${platform}`)}</span>{' '}
            <button className="button button--primary" onClick={() => void connectDirectory()}>
              <ItemIcon id="(BC)130" scale={1} tooltip={false} />
              {t('saves.open')}
            </button>
          </li>
          <li>{t('saves.guide.allow')}</li>
        </ol>
        <p className="saves__hint">{t('saves.guide.browsers')}</p>
        <div className="live-guide__fallback">
          <span>{t('saves.guide.noLive')}</span>
          <FolderInput label={t('saves.fallback')} />
        </div>
      </section>
    );
  }

  return (
    <section className="live-guide box">
      <h3>{t('saves.guide.title')}</h3>
      <p className="saves__hint">{t('saves.guide.why')}</p>
      <ol>
        <li>{t('saves.guide.close')}</li>
        <li>
          {t('saves.guide.run')}
          <code className="inset live-guide__code">{JUNCTION_COMMAND}</code>
          <button className="button" onClick={copy}>
            {copied ? t('saves.copied') : t('saves.guide.copy')}
          </button>
        </li>
        <li>
          {t('saves.guide.pick')}{' '}
          <button className="button button--primary" onClick={() => void connectDirectory()}>
            <ItemIcon id="(BC)130" scale={1} tooltip={false} />
            {t('saves.open')}
          </button>
        </li>
        <li>{t('saves.guide.allow')}</li>
      </ol>
      <p className="saves__hint">{t('saves.guide.safe')}</p>
      <div className="live-guide__fallback">
        <span>{t('saves.guide.noLive')}</span>
        <FolderInput label={t('saves.fallback')} />
      </div>
    </section>
  );
}
