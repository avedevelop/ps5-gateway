# Starts the PS5 Gateway (orchestrator: DNS + RTMP ingest + relay to OBS). ASCII only on purpose.
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1              runs hidden in the background
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -Foreground  runs here, Ctrl+C stops it
param([switch]$Foreground)
$root = Split-Path -Parent $PSScriptRoot
$dir  = Join-Path $root 'apps\orchestrator'
if (-not (Test-Path (Join-Path $root '.env'))) { Write-Host 'No .env yet. Run: node scripts\setup.mjs'; exit 1 }
if (Get-Process coredns, mediamtx -ErrorAction SilentlyContinue) { Write-Host 'DNS/RTMP already running. Run scripts\stop.ps1 first.'; exit 1 }
New-Item -ItemType Directory -Force (Join-Path $root 'logs') | Out-Null
if ($Foreground) { Set-Location $dir; node src/index.ts; exit $LASTEXITCODE }
Start-Process node -ArgumentList 'src/index.ts' -WorkingDirectory $dir -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $root 'logs\orch.out.log') -RedirectStandardError (Join-Path $root 'logs\orch.err.log')
Start-Sleep 3
Write-Host 'Started. Panel: http://127.0.0.1:8787   (logs\orch.out.log if something is wrong)'
