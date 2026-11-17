# Build the desktop app on Windows into "PS5 Gateway.exe" in the project folder.
#   powershell -ExecutionPolicy Bypass -File scripts\build-app.ps1
# Needs Rust (https://rustup.rs) and the Visual Studio Build Tools. WebView2 ships with Windows 10 and 11.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location (Join-Path $root 'app\src-tauri')
try {
  cargo build --release
  if ($LASTEXITCODE) { throw 'cargo build failed' }
  Copy-Item -Force 'target\release\ps5-gateway-app.exe' (Join-Path $root 'PS5 Gateway.exe')
  Write-Host "Built: $(Join-Path $root 'PS5 Gateway.exe')"
} finally { Pop-Location }
