import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { ItemIcon } from '@/ui';
import { FolderInput } from './SavePicker';
import { detectPlatform, SAVES_PATH, type Platform } from '@/save/platform';

/**
 * Windows: Chrome and Edge refuse to open folders inside AppData ("contains system files"), which is
 * where the game saves. Moving the saves to Documents and leaving a junction behind keeps the
 * game working unchanged while the browser reads the folder in Documents.
 */
export const JUNCTION_COMMAND = [
  '$saves = "$env:APPDATA\\StardewValley\\Saves"',
  '$docs = "$env:USERPROFILE\\Documents\\StardewValley Saves"',
  'Move-Item $saves $docs',
  'New-Item -ItemType Junction -Path $saves -Target $docs',
].join('; ');

/**
 * Mac and Linux: the browser can open ~/.config, it's just hidden. A link in Documents makes the
 * folder easy to find in the picker; the game keeps saving in the same place.
 */
const LINK_COMMAND: Record<Exclude<Platform, 'windows'>, string> = {
  mac: 'ln -s ~/.config/StardewValley/Saves ~/Documents/StardewValley\\ Saves',
  linux: 'ln -s ~/.config/StardewValley/Saves ~/Documents/StardewValley\\ Saves',
};

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
      <h3>{t('saves.guide.title')}</h3>
      <div className="calendar__nav" role="tablist">
        {PLATFORMS.map((p) => (
          <button key={p} role="tab" aria-selected={p === platform} className={p === platform ? 'button button--primary' : 'button'} onClick={() => setPlatform(p)}>
            {t(`saves.os.${p}`)}
          </button>
        ))}
      </div>

      {platform === 'windows' ? (
        <ol>
          <li>{t('saves.guide.close')}</li>
          <li>
            {t('saves.guide.run')}
            <Command command={JUNCTION_COMMAND} />
          </li>
          <li>
            {t('saves.guide.pick')} {openButton}
          </li>
          <li>{t('saves.guide.allow')}</li>
        </ol>
      ) : (
        <ol>
          <li>
            {t(`saves.guide.terminal.${platform}`)}
            <Command command={LINK_COMMAND[platform]} />
          </li>
          <li>
            {t('saves.guide.pick')} {openButton}
            <span className="saves__hint"> {t('saves.guide.orHidden', { path: SAVES_PATH[platform] })}</span>
          </li>
          <li>{t('saves.guide.allow')}</li>
        </ol>
      )}

      <p className="saves__hint">{t(platform === 'windows' ? 'saves.guide.safe' : 'saves.guide.safeLink')}</p>
      <p className="saves__hint">{t('saves.guide.browsers')}</p>
      <div className="live-guide__fallback">
        <span>{t('saves.guide.noLive')}</span>
        <FolderInput label={t('saves.fallback')} />
      </div>
    </section>
  );
}
