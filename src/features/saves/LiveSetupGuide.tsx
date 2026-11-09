import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveStore } from '@/store/saveStore';
import { ItemIcon } from '@/ui';
import { detectPlatform, LINUX_FLATPAK_PATH, type Platform } from '@/save/platform';

/**
 * Windows: Chrome and Edge refuse to open folders inside AppData ("contains system files"), which is
 * where the game saves. Moving the saves to Documents and leaving a junction behind keeps the
 * game working unchanged while the browser reads the folder in Documents.
 */
export const BACKUP_TASK = 'HelperValley Backup';

/** Ends the task and the robocopy it started, which keeps running on its own otherwise. */
const STOP_BACKUP = `if (Get-ScheduledTask -TaskName '${BACKUP_TASK}' -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName '${BACKUP_TASK}'; Unregister-ScheduledTask -TaskName '${BACKUP_TASK}' -Confirm:$false }; Get-CimInstance Win32_Process -Filter "Name='robocopy.exe'" | Where-Object { $_.CommandLine -like '*StardewValley Saves Backup*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;

export const JUNCTION_COMMAND = [
  "$ErrorActionPreference = 'Stop'",
  '$saves = "$env:APPDATA\\StardewValley\\Saves"',
  '$docs = "$env:USERPROFILE\\Documents\\StardewValley Saves"',
  '$backup = "$env:USERPROFILE\\Documents\\StardewValley Saves Backup"',
  '$s = Get-Item $saves -Force -ErrorAction SilentlyContinue',
  [
    // Already linked: only brings the folder back if it's gone, from the backup when there is one.
    "if ($s.LinkType -eq 'Junction') { if (-not (Test-Path $docs)) { if (Test-Path $backup) { robocopy $backup $docs /E /NJH /NJS /NFL /NDL | Out-Null; if ($LASTEXITCODE -ge 8) { throw 'Could not restore the backup.' } } else { New-Item -ItemType Directory $docs | Out-Null } } }",
    // Both folders exist: moving would nest one inside the other, so it stops.
    'elseif ($s -and (Test-Path $docs)) { throw "$docs already exists: nothing was moved." }',
    // First time: the backup comes first, and nothing moves unless it worked.
    "else { if ($s) { robocopy $saves $backup /E /NJH /NJS /NFL /NDL | Out-Null; if ($LASTEXITCODE -ge 8) { throw 'Could not create the backup: nothing was moved.' }; Move-Item $saves $docs } else { New-Item -ItemType Directory -Force $docs, (Split-Path $saves) | Out-Null }; New-Item -ItemType Junction -Path $saves -Target $docs | Out-Null }",
  ].join(' '),
  STOP_BACKUP,
  // One way only, without deleting: what is removed from the saves stays in the backup.
  `$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless robocopy \`"$docs\`" \`"$backup\`" /E /MON:1 /MOT:1 /R:3 /W:10"`,
  '$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)',
  `Register-ScheduledTask -TaskName '${BACKUP_TASK}' -Action $action -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) -Settings $settings -Force | Out-Null`,
  `Start-ScheduledTask -TaskName '${BACKUP_TASK}'`,
].join('; ');

/** Back to how the game had it: the saves in AppData, no link, no automatic backup. The backup folder stays. */
export const REVERT_COMMAND = [
  "$ErrorActionPreference = 'Stop'",
  '$saves = "$env:APPDATA\\StardewValley\\Saves"',
  '$docs = "$env:USERPROFILE\\Documents\\StardewValley Saves"',
  "if ((Get-Item $saves -Force -ErrorAction SilentlyContinue).LinkType -ne 'Junction') { throw 'The folders are already normal: nothing was changed.' }",
  "if (-not (Test-Path $docs)) { throw \"$docs is missing: run the setup command to restore it from the backup first.\" }",
  STOP_BACKUP,
  'cmd /c rmdir "$saves"',
  'Move-Item $docs $saves',
].join('; ');

/**
 * Mac and Linux: the browser can open ~/.config, it's just hidden. A link in Documents makes the
 * folder easy to find in the picker; the game keeps saving in the same place.
 */
const LINK_COMMAND: Record<Exclude<Platform, 'windows'>, string> = {
  mac: 'ln -sfn ~/.config/StardewValley/Saves ~/Documents/StardewValley\\ Saves',
  linux: 'ln -sfn ~/.config/StardewValley/Saves ~/Documents/StardewValley\\ Saves',
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
        <span>{t(`saves.guide.warning.${platform === 'windows' ? 'windows' : 'link'}`)}</span>
      </div>

      {/* The same steps on every system; only the command and where to run it change. */}
      <ol>
        <li>{t('saves.guide.close')}</li>
        <li>
          {t(`saves.guide.terminal.${platform}`)}
          <Command command={platform === 'windows' ? JUNCTION_COMMAND : LINK_COMMAND[platform]} />
          {platform === 'linux' && <span className="saves__hint">{t('saves.flatpak', { path: LINUX_FLATPAK_PATH })}</span>}
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
  const windows = detectPlatform() === 'windows';
  return (
    <details className="home-fold box">
      <summary>{t('saves.restore.title')}</summary>
      <div className="live-guide">
        <p>{t(`saves.restore.${windows ? 'windows' : 'link'}`)}</p>
        <Command command={windows ? REVERT_COMMAND : 'rm ~/Documents/StardewValley\\ Saves'} />
      </div>
    </details>
  );
}
