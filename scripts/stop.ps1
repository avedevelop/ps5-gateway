# Stops the PS5 Gateway completely. WARNING: this ends a running PS5 broadcast. ASCII only on purpose.
$root = Split-Path -Parent $PSScriptRoot
# the orchestrator is the process listening on the dashboard port 8787; taskkill /T also ends its children
Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { & taskkill /PID $_.OwningProcess /T /F | Out-Null }
# anything left over from our bin\ folder
Get-Process coredns, mediamtx, ffmpeg -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$root\bin\*" } | Stop-Process -Force
Write-Host 'Stopped.'
