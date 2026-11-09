import type { Platform } from '@/save/platform';

/**
 * The commands people paste to connect their saves. Browsers refuse the folder the game uses and
 * follow links, so the real saves live in Documents with a link left where the game expects them.
 * They touch real saves: every change here goes through tools/setup-tests on fake folders first.
 */
export const BACKUP_TASK = 'HelperValley Backup';

const WINDOWS_PATHS = [
  '$saves = "$env:APPDATA\\StardewValley\\Saves"',
  '$root = "$env:USERPROFILE\\Documents\\Stardew Valley"',
  '$docs = "$root\\Saves"',
  '$backup = "$root\\Backup"',
];

/** Ends the task and the robocopy it started, which keeps running on its own otherwise. Also the first version's. */
const WINDOWS_STOP_BACKUP = [
  `if (Get-ScheduledTask -TaskName '${BACKUP_TASK}' -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName '${BACKUP_TASK}'; Unregister-ScheduledTask -TaskName '${BACKUP_TASK}' -Confirm:$false }`,
  `Get-CimInstance Win32_Process -Filter "Name='robocopy.exe'" | Where-Object { $_.CommandLine -like '*Stardew Valley\\Backup*' -or $_.CommandLine -like '*StardewValley Saves Backup*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`,
  'Start-Sleep 1',
];

const WINDOWS_SETUP = [
  "$ErrorActionPreference = 'Stop'",
  ...WINDOWS_PATHS,
  ...WINDOWS_STOP_BACKUP,
  'New-Item -ItemType Directory -Force $root | Out-Null',
  // From the first version of this command: separate folders in Documents.
  '$oldBackup = "$env:USERPROFILE\\Documents\\StardewValley Saves Backup"',
  'if ((Test-Path $oldBackup) -and -not (Test-Path $backup)) { Move-Item $oldBackup $backup }',
  '$s = Get-Item $saves -Force -ErrorAction SilentlyContinue',
  [
    // Already linked: moves the saves if the link points somewhere older, and brings the folder back from the backup if it's gone.
    "if ($s.LinkType -eq 'Junction') {",
    '$t = "$($s.Target)";',
    'if (($t -ne $docs) -and (Test-Path $t) -and -not (Test-Path $docs)) { Move-Item $t $docs };',
    "if (-not (Test-Path $docs)) { if (Test-Path $backup) { robocopy $backup $docs /E /NJH /NJS /NFL /NDL | Out-Null; if ($LASTEXITCODE -ge 8) { throw 'Could not restore the backup.' } } else { New-Item -ItemType Directory $docs | Out-Null } };",
    'if ($t -ne $docs) { cmd /c rmdir "$saves"; New-Item -ItemType Junction -Path $saves -Target $docs | Out-Null }',
    '}',
    // Both folders exist: moving would nest one inside the other, so it stops.
    'elseif ($s -and (Test-Path $docs)) { throw "$docs already exists: nothing was moved." }',
    // First time: the backup comes first, and nothing moves unless it worked.
    "else { if ($s) { robocopy $saves $backup /E /NJH /NJS /NFL /NDL | Out-Null; if ($LASTEXITCODE -ge 8) { throw 'Could not create the backup: nothing was moved.' }; Move-Item $saves $docs } else { New-Item -ItemType Directory -Force $docs, (Split-Path $saves) | Out-Null }; New-Item -ItemType Junction -Path $saves -Target $docs | Out-Null }",
  ].join(' '),
  // One way only, without deleting: what is removed from the saves stays in the backup.
  '$action = New-ScheduledTaskAction -Execute \'conhost.exe\' -Argument "--headless robocopy `"$docs`" `"$backup`" /E /MON:1 /MOT:1 /R:3 /W:10"',
  '$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)',
  `Register-ScheduledTask -TaskName '${BACKUP_TASK}' -Action $action -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) -Settings $settings -Force | Out-Null`,
  `Start-ScheduledTask -TaskName '${BACKUP_TASK}'`,
].join('; ');

/** Back to how the game had it: the saves in AppData, no link, no automatic backup. The backup stays. */
const WINDOWS_REVERT = [
  "$ErrorActionPreference = 'Stop'",
  ...WINDOWS_PATHS,
  "if ((Get-Item $saves -Force -ErrorAction SilentlyContinue).LinkType -ne 'Junction') { throw 'The folders are already normal: nothing was changed.' }",
  'if (-not (Test-Path $docs)) { throw "$docs is missing: run the setup command to restore it from the backup first." }',
  ...WINDOWS_STOP_BACKUP,
  'cmd /c rmdir "$saves"',
  'Move-Item $docs $saves',
].join('; ');

const UNIX_PATHS = `saves="$HOME/.config/StardewValley/Saves"; root="$HOME/Documents/Stardew Valley"; docs="$root/Saves"; backup="$root/Backup"`;

/** The same steps as on Windows; a copy every minute keeps the backup, and never deletes from it. */
const UNIX_FOLDERS = `mkdir -p "$root" "$(dirname "$saves")"
  if [ -L "$saves" ]; then
    if [ ! -d "$docs" ]; then
      if [ -d "$backup" ]; then cp -Rp "$backup" "$docs"; else mkdir "$docs"; fi
    fi
  elif [ -d "$saves" ] && [ -e "$docs" ]; then
    echo "$docs already exists: nothing was moved."; exit 1
  else
    if [ -d "$saves" ]; then mkdir -p "$backup"; cp -Rp "$saves/." "$backup/"; mv "$saves" "$docs"; else mkdir -p "$docs"; fi
    ln -s "$docs" "$saves"
  fi
  if [ -L "$HOME/Documents/StardewValley Saves" ]; then rm "$HOME/Documents/StardewValley Saves"; fi`;

const UNIX_REVERT_FOLDERS = `if [ ! -L "$saves" ]; then echo "The folders are already normal: nothing was changed."; exit 1; fi
  if [ ! -d "$docs" ]; then echo "$docs is missing: run the setup command to restore it from the backup first."; exit 1; fi`;

const UNIX_REVERT_MOVE = `rm "$saves"; mv "$docs" "$saves"`;

const MAC_PLIST = '$HOME/Library/LaunchAgents/com.helpervalley.backup.plist';

const MAC_SETUP = `${UNIX_PATHS}
(
  set -e
  ${UNIX_FOLDERS}
  mkdir -p "$HOME/Library/LaunchAgents" "$backup"
  launchctl unload "${MAC_PLIST}" 2>/dev/null || true
  cat > "${MAC_PLIST}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>Label</key><string>com.helpervalley.backup</string>
<key>ProgramArguments</key><array><string>/bin/cp</string><string>-Rp</string><string>$docs/.</string><string>$backup/</string></array>
<key>StartInterval</key><integer>60</integer>
<key>RunAtLoad</key><true/>
</dict></plist>
EOF
  launchctl load -w "${MAC_PLIST}"
)`;

const MAC_REVERT = `${UNIX_PATHS}
(
  set -e
  ${UNIX_REVERT_FOLDERS}
  launchctl unload "${MAC_PLIST}" 2>/dev/null || true
  rm -f "${MAC_PLIST}"
  ${UNIX_REVERT_MOVE}
)`;

const LINUX_UNITS = '$HOME/.config/systemd/user';

const LINUX_SETUP = `${UNIX_PATHS}
(
  set -e
  if [ -d "$HOME/.var/app/com.valvesoftware.Steam/.config/StardewValley" ]; then echo "Steam from Flatpak can't reach Documents: nothing was moved."; exit 1; fi
  ${UNIX_FOLDERS}
  mkdir -p "${LINUX_UNITS}" "$backup"
  cat > "${LINUX_UNITS}/helpervalley-backup.service" <<EOF
[Unit]
Description=HelperValley save backup
[Service]
Type=oneshot
ExecStart=/bin/cp -Rp "$docs/." "$backup/"
EOF
  cat > "${LINUX_UNITS}/helpervalley-backup.timer" <<EOF
[Unit]
Description=HelperValley save backup every minute
[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now helpervalley-backup.timer
)`;

const LINUX_REVERT = `${UNIX_PATHS}
(
  set -e
  ${UNIX_REVERT_FOLDERS}
  systemctl --user disable --now helpervalley-backup.timer 2>/dev/null || true
  rm -f "${LINUX_UNITS}/helpervalley-backup.service" "${LINUX_UNITS}/helpervalley-backup.timer"
  systemctl --user daemon-reload 2>/dev/null || true
  ${UNIX_REVERT_MOVE}
)`;

export const SETUP_COMMAND: Record<Platform, string> = { windows: WINDOWS_SETUP, mac: MAC_SETUP, linux: LINUX_SETUP };
export const REVERT_COMMAND: Record<Platform, string> = { windows: WINDOWS_REVERT, mac: MAC_REVERT, linux: LINUX_REVERT };
