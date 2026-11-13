# Run once as ADMINISTRATOR. ASCII only on purpose.
# Opens DNS (53) and RTMP (1935) ONLY for the PS5, and the control panel (8790) only for your home subnet.
#   powershell -ExecutionPolicy Bypass -File scripts\firewall.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\firewall.ps1 -Ps5Ip 192.168.1.50 -NoPanel
param([string]$Ps5Ip, [switch]$NoPanel)
$root = Split-Path -Parent $PSScriptRoot
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrator')) {
  Write-Host 'Run this from an Administrator PowerShell (right-click Start > Terminal (Admin)).'; exit 1 }
if (-not $Ps5Ip) {
  $envFile = Join-Path $root '.env'
  if (Test-Path $envFile) { $Ps5Ip = ((Select-String -Path $envFile -Pattern '^PS5_IP=(.+)$').Matches.Groups[1].Value).Trim() }
}
if ($Ps5Ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { Write-Host 'PS5 IP not found. Pass -Ps5Ip 192.168.x.y or set PS5_IP in .env'; exit 1 }
Get-NetFirewallRule -DisplayName 'ps5gw-*' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'ps5gw-dns'  -Direction Inbound -Protocol UDP -LocalPort 53   -RemoteAddress $Ps5Ip -Action Allow -Profile Any | Out-Null
New-NetFirewallRule -DisplayName 'ps5gw-dnst' -Direction Inbound -Protocol TCP -LocalPort 53   -RemoteAddress $Ps5Ip -Action Allow -Profile Any | Out-Null
New-NetFirewallRule -DisplayName 'ps5gw-rtmp' -Direction Inbound -Protocol TCP -LocalPort 1935 -RemoteAddress $Ps5Ip -Action Allow -Profile Any | Out-Null
if (-not $NoPanel) {
  New-NetFirewallRule -DisplayName 'ps5gw-panel' -Direction Inbound -Protocol TCP -LocalPort 8790 -RemoteAddress LocalSubnet -Action Allow -Profile Any | Out-Null
}
Get-NetFirewallRule -DisplayName 'ps5gw-*' | Select-Object DisplayName, Enabled, Action
Write-Host "Firewall rules set for PS5 $Ps5Ip. Remove them any time: Get-NetFirewallRule -DisplayName 'ps5gw-*' | Remove-NetFirewallRule"
