# Runs the guide's exact Windows commands through every scenario, on fake folders only.
# The commands are rewritten so they can't reach a real backup: another task name and process filter.
param([Parameter(Mandatory)][string]$Commands)
$root = "$env:USERPROFILE\Documents\hv-cmd-test"
if (Test-Path $root) { throw "test folder already exists" }
$env:APPDATA = "$root\AppData"; $env:USERPROFILE = "$root\Home"
$saves = "$env:APPDATA\StardewValley\Saves"; $base = "$env:USERPROFILE\Documents\Stardew Valley"; $docs = "$base\Saves"; $backup = "$base\Backup"
$oldDocs = "$env:USERPROFILE\Documents\StardewValley Saves"; $oldBackup = "$env:USERPROFILE\Documents\StardewValley Saves Backup"
$isolate = { param($t) $t.Replace('HelperValley Backup', 'HelperValleyTeste').Replace('*Stardew Valley\Backup*', '*hv-cmd-test*Stardew Valley\Backup*').Replace('*StardewValley Saves Backup*', '*hv-cmd-test*StardewValley Saves Backup*') }
$setup = & $isolate (Get-Content "$Commands\setup-windows.txt" -Raw); $revert = & $isolate (Get-Content "$Commands\revert-windows.txt" -Raw)
function Run($code) { $file = "$root\run.ps1"; Set-Content -LiteralPath $file -Encoding UTF8 -Value $code; $out = & powershell -NoProfile -ExecutionPolicy Bypass -File $file 2>&1 | ForEach-Object { "$_" } | Select-Object -First 1; "  saida: [$out] codigo=$LASTEXITCODE" }
function Show($label) { $i = Get-Item $saves -Force -ErrorAction SilentlyContinue; "[$label] saves=[$(if ($i) { if ($i.LinkType) { "$($i.LinkType)->$(Split-Path -Leaf (Split-Path $i.Target))\$(Split-Path -Leaf $i.Target)" } else { 'pasta' } } else { 'nao existe' })] | save: $(Get-Content "$saves\Farm_1\Farm_1" -ErrorAction SilentlyContinue) | backup: $(Get-Content "$backup\Farm_1\Farm_1" -ErrorAction SilentlyContinue) | antigas: docs=$(Test-Path $oldDocs) backup=$(Test-Path $oldBackup)" }
function WaitBackup($text) { $t0 = Get-Date; while (((Get-Date) - $t0).TotalSeconds -lt 120) { if ((Get-Content "$backup\Farm_1\Farm_1" -ErrorAction SilentlyContinue) -eq $text) { return "  backup chegou em $([int]((Get-Date) - $t0).TotalSeconds)s" }; Start-Sleep 2 }; "  FALHOU: backup nao atualizou em 120s" }
function Robocopies { @(Get-CimInstance Win32_Process -Filter "Name='robocopy.exe'" | Where-Object { $_.CommandLine -match 'hv-cmd-test' }).Count }
try {
  "=== A. migrar da versao anterior (o seu caso) ==="
  New-Item -ItemType Directory -Force "$oldDocs\Farm_1", "$oldBackup\Farm_1", (Split-Path $saves) | Out-Null
  Set-Content "$oldDocs\Farm_1\Farm_1" "dia 1"; Set-Content "$oldDocs\Farm_1\SaveGameInfo" "info"; Set-Content "$oldBackup\Farm_1\Farm_1" "dia 1"
  New-Item -ItemType Junction -Path $saves -Target $oldDocs | Out-Null
  $old = Start-Process robocopy -ArgumentList "`"$oldDocs`" `"$oldBackup`" /E /MON:1 /MOT:1 /NP /NFL /NDL" -WindowStyle Hidden -PassThru; Start-Sleep 2
  Show 'antes'; "  robocopy antigo rodando: $(Robocopies)"
  Run $setup; Show 'depois'; "  tarefa: $((Get-ScheduledTask -TaskName 'HelperValleyTeste' -ErrorAction SilentlyContinue).State)"; Start-Sleep 3; "  robocopy rodando: $(Robocopies) (esperado 1)"
  "--- rodar de novo"; Run $setup; Show 'depois'; "  aninhou? $(Test-Path "$docs\Saves")"
  "--- jogo salva"; Set-Content "$saves\Farm_1\Farm_1" "dia 2"; WaitBackup 'dia 2'
  "--- apagar a pasta Saves"; Remove-Item -LiteralPath $docs -Recurse -Force -Confirm:$false; Show 'apagada'; Start-Sleep 3
  "--- rodar de novo recupera"; Run $setup; Show 'recuperada'
  "--- continua atualizando"; Set-Content "$saves\Farm_1\Farm_1" "dia 3"; WaitBackup 'dia 3'
  "--- voltar ao normal"; Run $revert; Show 'normal'; "  tarefa existe: $([bool](Get-ScheduledTask -TaskName 'HelperValleyTeste' -ErrorAction SilentlyContinue)) | robocopy sobrando: $(Robocopies)"
  "--- voltar de novo nao faz nada"; Run $revert; Show 'depois'
  "=== B. primeira vez, pasta normal ==="
  Remove-Item -LiteralPath $base -Recurse -Force -Confirm:$false
  Run $setup; Show 'depois'; "  robocopy rodando: $(Robocopies) (esperado 1)"
  "--- voltar"; Run $revert; Show 'normal'
  "=== C. duas pastas reais: nao mexe ==="
  New-Item -ItemType Directory -Force $docs | Out-Null; Set-Content "$docs\outro" "x"; Run $setup; Show 'depois'; "  aninhou? $(Test-Path "$docs\Saves")"
} finally {
  if (Get-ScheduledTask -TaskName 'HelperValleyTeste' -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName 'HelperValleyTeste'; Unregister-ScheduledTask -TaskName 'HelperValleyTeste' -Confirm:$false }
  Get-CimInstance Win32_Process -Filter "Name='robocopy.exe'" | Where-Object { $_.CommandLine -match 'hv-cmd-test' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep 1
  if ((Get-Item $saves -Force -ErrorAction SilentlyContinue).LinkType -eq 'Junction') { cmd /c rmdir "$saves" }
  Remove-Item -LiteralPath $root -Recurse -Force -Confirm:$false -ErrorAction SilentlyContinue
  "--- limpeza: pasta de teste removida: $(-not (Test-Path $root)), tarefa removida: $(-not (Get-ScheduledTask -TaskName 'HelperValleyTeste' -ErrorAction SilentlyContinue))"
}
