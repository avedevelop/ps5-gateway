# Starts the gateway automatically when you log in to Windows (no administrator rights needed). ASCII only on purpose.
#   powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
#   Remove: Unregister-ScheduledTask -TaskName ps5gw -Confirm:$false
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node).Source
$dir  = Join-Path $root 'apps\orchestrator'
# wscript runs the small launcher with no window at all (a hidden powershell.exe would flash a console at every login)
$vbs  = Join-Path $PSScriptRoot 'autostart.vbs'
$act  = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "//B //nologo `"$vbs`" `"$node`"" -WorkingDirectory $dir
$trg  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$set  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'ps5gw' -Action $act -Trigger $trg -Settings $set -User $env:USERNAME -RunLevel Limited -Force | Out-Null
Get-ScheduledTask -TaskName 'ps5gw' | Select-Object TaskName, State
