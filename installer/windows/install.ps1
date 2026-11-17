# PS5 Gateway one-click installer for Windows. ASCII only on purpose.
#   Double-click:  installer\windows\Install-PS5-Gateway.cmd
#   Or:            powershell -ExecutionPolicy Bypass -File installer\windows\install.ps1
# Options:
#   -Ps5Ip 192.168.1.50   PS5 address (asked if omitted)
#   -Yes                  no questions, take the defaults
#   -SkipFirewall         do not create the Windows Firewall rules
#   -NoScenes             do not create the OBS scene collection
#   -Autostart            start the gateway when you log in
#   -Check                only report what is missing, change nothing
param([string]$Ps5Ip, [switch]$Yes, [switch]$SkipFirewall, [switch]$NoScenes, [switch]$Autostart, [switch]$Check)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$script:problems = 0
function Step($m) { Write-Host ''; Write-Host "== $m" }
function Ok($m)   { Write-Host "  [ok]   $m" }
function Warn($m) { Write-Host "  [warn] $m" }
function Bad($m)  { Write-Host "  [FAIL] $m"; $script:problems++ }
function Ask($q, [bool]$default) {
  if ($Yes) { return $default }
  $hint = if ($default) { 'Y/n' } else { 'y/N' }
  $a = (Read-Host "  $q [$hint]").Trim().ToLower()
  if (-not $a) { return $default }
  return ($a -eq 'y' -or $a -eq 'yes')
}
function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User') }
function Node-Ok {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  $v = (& node -v).TrimStart('v').Split('.')
  return ([int]$v[0] -gt 22 -or ([int]$v[0] -eq 22 -and [int]$v[1] -ge 18))
}
function Is-Admin { ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
function Run-Node([string[]]$a) { & node @a; if ($LASTEXITCODE -ne 0) { throw "node $($a -join ' ') failed (exit $LASTEXITCODE)" } }

Write-Host 'PS5 Gateway installer (Windows)'
if (-not (Test-Path (Join-Path $root 'scripts\setup.mjs'))) { Write-Host "Cannot find the project at $root (scripts\setup.mjs missing). Unpack the whole archive first."; exit 1 }

Step '1/6  Requirements'
if ($env:OS -ne 'Windows_NT') { Bad 'This installer is for Windows. On a Mac use installer/macos/install.sh.' }
else { Ok 'Windows' }
$haveNode = Node-Ok
if ($haveNode) { Ok "Node.js $((& node -v))" }
elseif ($Check) { Bad 'Node.js 22.18 or newer is missing (https://nodejs.org, or: winget install OpenJS.NodeJS.LTS)' }
else {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) { Bad 'Node.js 22.18 or newer is missing and winget is not available. Install Node.js 24 LTS from https://nodejs.org and run this again.' }
  elseif (Ask 'Node.js is missing. Install Node.js LTS with winget now?' $true) {
    & winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (Node-Ok) { Ok "Node.js $((& node -v)) installed" } else { Bad 'Node.js is installed but not visible yet. Close this window, open a new one and run the installer again.' }
  } else { Bad 'Node.js is required.' }
}
$obs = (Test-Path "$env:ProgramFiles\obs-studio") -or (Test-Path "$env:APPDATA\obs-studio")
if ($obs) { Ok 'OBS Studio found' } else { Warn 'OBS Studio not found. Install it from https://obsproject.com (the gateway works without it, OBS is where you watch the picture).' }
if (Is-Admin) { Ok 'running as Administrator' } else { Ok 'not Administrator (a UAC prompt will appear for the firewall step)' }

if ($Check) {
  Step 'Check only'
  if (Test-Path (Join-Path $root '.env')) { Ok '.env exists' } else { Warn '.env not created yet (the installer creates it)' }
  Write-Host ''
  if ($script:problems) { Write-Host "$script:problems problem(s) found."; exit 1 }
  Write-Host 'Ready to install.'; exit 0
}
if ($script:problems) { Write-Host "`n$script:problems problem(s) found, see [FAIL] lines above."; exit 1 }

Step '2/6  PS5 address'
$envFile = Join-Path $root '.env'
if (-not $Ps5Ip -and (Test-Path $envFile)) {
  $m = Select-String -Path $envFile -Pattern '^PS5_IP=(\d{1,3}(\.\d{1,3}){3})\s*$'
  if ($m) { $Ps5Ip = $m.Matches[0].Groups[1].Value; Ok "using PS5_IP=$Ps5Ip from .env" }
}
while ($Ps5Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') {
  if ($Yes) { Write-Host '  Pass -Ps5Ip 192.168.x.y (PS5: Settings > Network > Connection Status > View Connection Status).'; exit 1 }
  $Ps5Ip = (Read-Host '  PS5 IP address (PS5: Settings > Network > Connection Status > View Connection Status)').Trim()
}
Ok "PS5 address $Ps5Ip"

Step '3/6  Helper programs and settings'
Push-Location $root
try {
  Run-Node @('scripts\setup.mjs', '--yes', "--ps5-ip=$Ps5Ip")
  $pcIp = ''
  $m = Select-String -Path $envFile -Pattern '^PC_LAN_IP=(.+)$' -ErrorAction SilentlyContinue
  if ($m) { $pcIp = $m.Matches[0].Groups[1].Value.Trim() }

  Step '4/6  Firewall (DNS and RTMP for the PS5 only)'
  if ($SkipFirewall) { Warn 'skipped (-SkipFirewall)' }
  elseif (@(Get-NetFirewallRule -DisplayName 'ps5gw-*' -ErrorAction SilentlyContinue).Count -ge 3) { Ok 'rules already present' }
  elseif (Ask 'Create Windows Firewall rules for the PS5 (needs Administrator)?' $true) {
    $fw = Join-Path $root 'scripts\firewall.ps1'
    if (Is-Admin) { & powershell -NoProfile -ExecutionPolicy Bypass -File $fw -Ps5Ip $Ps5Ip }
    else { Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$fw`" -Ps5Ip $Ps5Ip" }
    if (@(Get-NetFirewallRule -DisplayName 'ps5gw-*' -ErrorAction SilentlyContinue).Count -ge 3) { Ok 'firewall rules created' }
    else { Warn "rules were not created. Run scripts\firewall.ps1 from an Administrator PowerShell later." }
  } else { Warn 'skipped. The PS5 will not reach the gateway until you run scripts\firewall.ps1 as Administrator.' }

  Step '5/6  Start the gateway'
  $up = $false
  try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', 8787); $c.Close(); $up = $true } catch {}
  if ($up) { Ok 'already running (dashboard port 8787 is open)' }
  else { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\start.ps1') }
  & node (Join-Path $root 'scripts\doctor.mjs')

  Step '6/6  OBS scene and autostart'
  if ($NoScenes) { Warn 'OBS scene skipped (-NoScenes)' }
  elseif (-not (Test-Path "$env:APPDATA\obs-studio\basic\scenes")) { Warn 'OBS has not been started yet. Start OBS once, close it, then run: node scripts\make-obs-scenes.mjs' }
  elseif (Test-Path "$env:APPDATA\obs-studio\basic\scenes\PS5.json") { Ok 'OBS scene collection "PS5" already exists' }
  else {
    $lang = if ((Get-UICulture).TwoLetterISOLanguageName -eq 'ru') { '--lang=ru' } else { '--lang=en' }
    & node (Join-Path $root 'scripts\make-obs-scenes.mjs') $pcIp $lang
  }
  if ($Autostart -or (Ask 'Start the gateway automatically when you log in to Windows?' $false)) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'scripts\install-autostart.ps1')
  }
} finally { Pop-Location }

Write-Host ''
Write-Host 'Done. What is left to do by hand:'
Write-Host "  1. On the PS5 set the DNS of your network connection: Primary = $pcIp, Secondary = 1.1.1.1"
Write-Host '  2. On the PS5 open Broadcast, choose Twitch and go live.'
Write-Host '  3. In OBS pick the scene collection PS5, enter your stream key (Settings > Stream), press Start Streaming when ready.'
Write-Host '  Dashboard: http://127.0.0.1:8787     Check anything with: node scripts\doctor.mjs'
