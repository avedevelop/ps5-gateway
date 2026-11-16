#!/bin/sh
# Starts the PS5 Gateway automatically when you log in to macOS (a LaunchAgent, no administrator rights needed).
#   sh scripts/install-autostart.sh            install and start now
#   sh scripts/install-autostart.sh --remove   remove
#   sh scripts/install-autostart.sh --print    only show the LaunchAgent, change nothing
# Note: macOS does not let background programs read Desktop, Documents or Downloads without asking.
# Keep the ps5-gateway folder elsewhere (for example ~/ps5-gateway) if you use autostart.
label=com.ps5gateway
plist="$HOME/Library/LaunchAgents/$label.plist"
root=$(cd "$(dirname "$0")/.." && pwd)
if [ "$1" = "--remove" ]; then
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null
  rm -f "$plist"; echo 'Autostart removed.'; exit 0
fi
node=$(command -v node) || { echo 'Node.js not found. Install Node.js 24 LTS (https://nodejs.org).'; exit 1; }
esc() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
body=$(cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>$(esc "$node")</string><string>src/index.ts</string></array>
  <key>WorkingDirectory</key><string>$(esc "$root/apps/orchestrator")</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>$(esc "$root/logs/orch.out.log")</string>
  <key>StandardErrorPath</key><string>$(esc "$root/logs/orch.err.log")</string>
</dict>
</plist>
PLIST
)
if [ "$1" = "--print" ]; then printf '%s\n' "$body"; exit 0; fi
[ -f "$root/.env" ] || { echo 'No .env yet. Run: node scripts/setup.mjs'; exit 1; }
mkdir -p "$HOME/Library/LaunchAgents" "$root/logs"
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null
printf '%s\n' "$body" >"$plist"
launchctl bootstrap "gui/$(id -u)" "$plist" && echo "Autostart installed: $plist" && echo 'Remove it any time: sh scripts/install-autostart.sh --remove'
