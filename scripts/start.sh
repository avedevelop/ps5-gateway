#!/bin/sh
# Starts the PS5 Gateway on macOS (orchestrator: DNS + RTMP ingest + relay to OBS).
#   sh scripts/start.sh               runs in the background
#   sh scripts/start.sh --foreground  runs here, Ctrl+C stops it
root=$(cd "$(dirname "$0")/.." && pwd)
dir="$root/apps/orchestrator"
[ -f "$root/.env" ] || { echo 'No .env yet. Run: node scripts/setup.mjs'; exit 1; }
if pgrep -x coredns >/dev/null || pgrep -x mediamtx >/dev/null; then echo 'DNS/RTMP already running. Run: sh scripts/stop.sh'; exit 1; fi
command -v node >/dev/null || { echo 'Node.js not found. Install Node.js 24 LTS (https://nodejs.org).'; exit 1; }
mkdir -p "$root/logs"
cd "$dir" || exit 1
if [ "$1" = "--foreground" ]; then exec node src/index.ts; fi
nohup node src/index.ts >"$root/logs/orch.out.log" 2>"$root/logs/orch.err.log" </dev/null &
sleep 3
if kill -0 $! 2>/dev/null; then echo 'Started. Panel: http://127.0.0.1:8787   (logs/orch.out.log if something is wrong)'
else echo 'The gateway did not start:'; cat "$root/logs/orch.err.log"; exit 1; fi
