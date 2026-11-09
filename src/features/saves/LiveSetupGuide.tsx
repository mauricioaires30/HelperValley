import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { ItemIcon } from '@/ui';
import { detectPlatform, type Platform } from '@/save/platform';
import { REVERT_COMMAND, SETUP_COMMAND } from './setupCommands';

const PLATFORMS: Platform[] = ['windows', 'mac', 'linux'];

function Command({ command }: { command: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  return (
    <>
      <code className="inset live-guide__code">{command}</code>
      <button className="button" onClick={copy}>
        {copied ? t('saves.copied') : t('saves.guide.copy')}
      </button>
    </>
  );
}

/** How to keep the site live, with a tab per system (the visitor's own one opens first). */
export function LiveSetupGuide() {
  const { t } = useTranslation();
  const connectDirectory = useSaveStore((s) => s.connectDirectory);
  const [platform, setPlatform] = useState<Platform>(detectPlatform);

  const openButton = (
    <button className="button button--primary" onClick={() => void connectDirectory()}>
      <ItemIcon id="(BC)130" scale={1} tooltip={false} />
      {t('saves.open')}
    </button>
  );

  return (
    <section className="live-guide box">
      <h2>{t('saves.guide.title')}</h2>
      <div className="calendar__nav" role="tablist">
        {PLATFORMS.map((p) => (
          <button key={p} role="tab" aria-selected={p === platform} className={p === platform ? 'button button--primary' : 'button'} onClick={() => setPlatform(p)}>
            {t(`saves.os.${p}`)}
          </button>
        ))}
      </div>

      <div className="live-guide__warning">
        <strong>{t('saves.guide.warningTitle')}</strong>
        <span>{t('saves.guide.warning')}</span>
        {platform !== 'windows' && <span>{t('saves.guide.untested')}</span>}
      </div>

      {/* The same steps on every system; only the command and where to run it change. */}
      <ol>
        <li>{t('saves.guide.close')}</li>
        <li>
          {t(`saves.guide.terminal.${platform}`)}
          <Command command={SETUP_COMMAND[platform]} />
        </li>
        <li>
          {t('saves.guide.pick')} {openButton}
        </li>
        <li>{t('saves.guide.allow')}</li>
      </ol>
    </section>
  );
}

/** How to undo the setup, always within reach: the guide itself is gone once a folder is connected. */
export function RestoreFolders() {
  const { t } = useTranslation();
  const platform = detectPlatform();
  return (
    <details className="home-fold box">
      <summary>{t('saves.restore.title')}</summary>
      <div className="live-guide">
        <p>{t('saves.restore.text')}</p>
        <Command command={REVERT_COMMAND[platform]} />
      </div>
    </details>
  );
}
