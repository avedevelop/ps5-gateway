# Starts the gateway automatically when you log in to Windows (no administrator rights needed). ASCII only on purpose.
#   powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
#   Remove: Unregister-ScheduledTask -TaskName ps5gw -Confirm:$false
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$dir  = Join-Path $root 'apps\orchestrator'
$act  = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -Command `"Set-Location '$dir'; & '$node' src/index.ts`"" -WorkingDirectory $dir
$trg  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$set  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'ps5gw' -Action $act -Trigger $trg -Settings $set -User $env:USERNAME -RunLevel Limited -Force | Out-Null
Get-ScheduledTask -TaskName 'ps5gw' | Select-Object TaskName, State
