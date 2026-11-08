import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { ItemIcon } from '@/ui';
import { detectPlatform, type Platform } from '@/save/platform';

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
    <details className="home-fold box">
      <summary>{t('saves.guide.title')}</summary>
      <div className="live-guide">
      <div className="calendar__nav" role="tablist">
        {PLATFORMS.map((p) => (
          <button key={p} role="tab" aria-selected={p === platform} className={p === platform ? 'button button--primary' : 'button'} onClick={() => setPlatform(p)}>
            {t(`saves.os.${p}`)}
          </button>
        ))}
      </div>

      {/* The same steps on every system; only the command and where to run it change. */}
      <ol>
        <li>{t('saves.guide.close')}</li>
        <li>
          {t(`saves.guide.terminal.${platform}`)}
          <Command command={platform === 'windows' ? JUNCTION_COMMAND : LINK_COMMAND[platform]} />
        </li>
        <li>
          {t('saves.guide.pick')} {openButton}
        </li>
        <li>{t('saves.guide.allow')}</li>
      </ol>
      </div>
    </details>
  );
}
