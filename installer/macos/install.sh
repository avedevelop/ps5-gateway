#!/bin/sh
# PS5 Gateway one-click installer for macOS (Apple silicon and Intel).
#   Double-click:  "Install PS5 Gateway.command"  (next to this file)
#   Or:            sh installer/macos/install.sh
# Options:
#   --ps5-ip=192.168.1.50   PS5 address (asked if omitted)
#   --yes                   no questions, take the defaults
#   --no-obs                do not offer to install OBS Studio
#   --no-scenes             do not create the OBS scene collection
#   --autostart             start the gateway when you log in
#   --check                 only report what is missing, change nothing
set -u
root=$(cd "$(dirname "$0")/../.." && pwd)
ps5=""; yes=0; noobs=0; noscenes=0; autostart=0; check=0
for a in "$@"; do
  case "$a" in
    --ps5-ip=*) ps5=${a#--ps5-ip=} ;;
    --yes) yes=1 ;;
    --no-obs) noobs=1 ;;
    --no-scenes) noscenes=1 ;;
    --autostart) autostart=1 ;;
    --check) check=1 ;;
    *) echo "Unknown option: $a"; exit 1 ;;
  esac
done
problems=0
step() { printf '\n== %s\n' "$1"; }
ok()   { printf '  [ok]   %s\n' "$1"; }
warn() { printf '  [warn] %s\n' "$1"; }
bad()  { printf '  [FAIL] %s\n' "$1"; problems=$((problems + 1)); }
ask() { # ask "question" default(y|n)
  [ "$yes" = 1 ] && { [ "$2" = y ]; return; }
  if [ "$2" = y ]; then hint='Y/n'; else hint='y/N'; fi
  printf '  %s [%s] ' "$1" "$hint"; read -r reply || reply=""
  case "$reply" in "") [ "$2" = y ] ;; y|Y|yes|YES) true ;; *) false ;; esac
}
node_ok() { command -v node >/dev/null 2>&1 && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)'; }
find_brew() {
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$b" ]; then eval "$("$b" shellenv)"; return 0; fi
  done
  command -v brew >/dev/null 2>&1
}
find_obs() {
  for d in /Applications/OBS.app "$HOME/Applications/OBS.app"; do [ -d "$d" ] && { echo "$d"; return 0; }; done
  return 1
}

echo 'PS5 Gateway installer (macOS)'
[ -f "$root/scripts/setup.mjs" ] || { echo "Cannot find the project at $root (scripts/setup.mjs missing). Unpack the whole archive first."; exit 1; }

step '1/6  Requirements'
if [ "$(uname -s)" != Darwin ]; then bad 'This installer is for macOS. On Windows use installer\windows\Install-PS5-Gateway.cmd.'; else ok "macOS $(sw_vers -productVersion) ($(uname -m))"; fi
have_brew=0; find_brew && have_brew=1
if [ "$have_brew" = 1 ]; then ok "Homebrew $(brew --version | head -1 | sed 's/Homebrew //')"
else warn 'Homebrew not found (https://brew.sh). It is needed to install FFmpeg and, if missing, Node.js.'; fi

if node_ok; then ok "Node.js $(node -v)"
elif [ "$check" = 1 ]; then bad 'Node.js 22.18 or newer is missing (https://nodejs.org, or: brew install node)'
elif [ "$have_brew" = 1 ] && ask 'Node.js is missing. Install it with Homebrew now?' y; then
  if brew install node && node_ok; then ok "Node.js $(node -v) installed"; else bad 'Node.js installation failed'; fi
else bad 'Node.js 22.18 or newer is required. Install Node.js 24 LTS from https://nodejs.org and run this again.'; fi

ffmpeg_ok=0
for d in /opt/homebrew/bin /usr/local/bin /opt/local/bin; do [ -x "$d/ffmpeg" ] && ffmpeg_ok=1; done
command -v ffmpeg >/dev/null 2>&1 && ffmpeg_ok=1
if [ "$ffmpeg_ok" = 1 ]; then ok 'FFmpeg found'
elif [ "$check" = 1 ]; then bad 'FFmpeg is missing (brew install ffmpeg)'
elif [ "$have_brew" = 1 ] && ask 'FFmpeg is missing. Install it with Homebrew now?' y; then
  if brew install ffmpeg; then ok 'FFmpeg installed'; else bad 'FFmpeg installation failed'; fi
else bad 'FFmpeg is required (brew install ffmpeg)'; fi

obs=$(find_obs) || obs=""
if [ -n "$obs" ]; then
  v=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$obs/Contents/Info.plist" 2>/dev/null || echo 0)
  major=${v%%.*}
  if [ "${major:-0}" -ge 33 ] 2>/dev/null; then ok "OBS Studio $v"
  else warn "OBS Studio $v found. On macOS 27 versions older than 33 crash at startup; update with: brew install --cask obs"; fi
elif [ "$noobs" = 1 ] || [ "$check" = 1 ]; then warn 'OBS Studio not found (https://obsproject.com, version 33 or newer)'
elif [ "$have_brew" = 1 ] && ask 'OBS Studio is missing. Download and install it with Homebrew (about 210 MB)?' n; then
  if brew install --cask obs; then ok 'OBS Studio installed'; else warn 'OBS installation failed; install it from https://obsproject.com'; fi
else warn 'OBS Studio not found. Install version 33 or newer from https://obsproject.com'; fi

if [ "$check" = 1 ]; then
  step 'Check only'
  if [ -f "$root/.env" ]; then ok '.env exists'; else warn '.env not created yet (the installer creates it)'; fi
  echo
  if [ "$problems" -gt 0 ]; then echo "$problems problem(s) found."; exit 1; fi
  echo 'Ready to install.'; exit 0
fi
if [ "$problems" -gt 0 ]; then printf '\n%s problem(s) found, see [FAIL] lines above.\n' "$problems"; exit 1; fi

step '2/6  PS5 address'
if [ -z "$ps5" ] && [ -f "$root/.env" ]; then
  ps5=$(sed -n 's/^PS5_IP=\([0-9][0-9]*\(\.[0-9][0-9]*\)\{3\}\)[[:space:]]*$/\1/p' "$root/.env" | head -1)
  [ -n "$ps5" ] && ok "using PS5_IP=$ps5 from .env"
fi
while ! printf '%s' "$ps5" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'; do
  [ "$yes" = 1 ] && { echo '  Pass --ps5-ip=192.168.x.y (PS5: Settings > Network > Connection Status > View Connection Status).'; exit 1; }
  printf '  PS5 IP address (PS5: Settings > Network > Connection Status > View Connection Status): '; read -r ps5 || exit 1
done
ok "PS5 address $ps5"

step '3/6  Helper programs and settings'
cd "$root" || exit 1
node scripts/setup.mjs --yes "--ps5-ip=$ps5" || { echo 'setup failed, see above.'; exit 1; }
pc=$(sed -n 's/^PC_LAN_IP=\(.*\)$/\1/p' .env | head -1 | tr -d '[:space:]')

step '4/6  Firewall'
ok 'nothing to do: on macOS the gateway itself answers only the PS5 and this Mac'
if [ -x /usr/libexec/ApplicationFirewall/socketfilterfw ] && /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null | grep -qi enabled; then
  warn 'the macOS firewall is on and may block the PS5. doctor (next step) prints the commands that allow the gateway.'
fi

step '5/6  Start the gateway'
if curl -s -o /dev/null --max-time 2 http://127.0.0.1:8787/api/status; then ok 'already running (dashboard port 8787 is open)'
else sh scripts/start.sh || echo '  The gateway did not start; see logs/orch.err.log'; fi
node scripts/doctor.mjs

step '6/6  OBS scene and autostart'
scenes="$HOME/Library/Application Support/obs-studio/basic/scenes"
if [ "$noscenes" = 1 ]; then warn 'OBS scene skipped (--no-scenes)'
elif [ ! -d "$scenes" ]; then warn 'OBS has not been started yet. Start OBS once, quit it, then run: node scripts/make-obs-scenes.mjs'
elif [ -f "$scenes/PS5.json" ]; then ok 'OBS scene collection "PS5" already exists'
else
  case "$(defaults read -g AppleLanguages 2>/dev/null | tr -d ' \n()"')" in ru*) lang=ru ;; *) lang=en ;; esac
  node scripts/make-obs-scenes.mjs "$pc" "--lang=$lang" || warn 'could not create the OBS scene'
fi
if [ "$autostart" = 1 ] || ask 'Start the gateway automatically when you log in to macOS?' n; then
  case "$root" in
    "$HOME/Desktop"/*|"$HOME/Documents"/*|"$HOME/Downloads"/*) warn 'autostart skipped: macOS blocks background programs from Desktop, Documents and Downloads. Move the folder (for example to ~/ps5-gateway) and run: sh scripts/install-autostart.sh' ;;
    *) sh scripts/install-autostart.sh ;;
  esac
fi

printf '\nDone. What is left to do by hand:\n'
echo "  1. On the PS5 set the DNS of your network connection: Primary = $pc, Secondary = 1.1.1.1"
echo '  2. On the PS5 open Broadcast, choose Twitch and go live.'
echo '  3. In OBS pick the scene collection PS5, enter your stream key (Settings > Stream), press Start Streaming when ready.'
echo '  Dashboard: http://127.0.0.1:8787     Check anything with: node scripts/doctor.mjs'
echo '  Keep the MacBook lid open while streaming: a closed lid puts the Mac to sleep.'
