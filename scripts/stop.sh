#!/bin/sh
# Stops the PS5 Gateway on macOS completely. WARNING: this ends a running PS5 broadcast.
root=$(cd "$(dirname "$0")/.." && pwd)
# autostart keeps the gateway alive; unload it for this login session (it comes back at the next login)
launchctl bootout "gui/$(id -u)/com.ps5gateway" 2>/dev/null
# the orchestrator is the process listening on the dashboard port 8787; on SIGTERM it stops its own children
pids=$(lsof -nP -t -iTCP:8787 -sTCP:LISTEN 2>/dev/null)
[ -n "$pids" ] && kill $pids 2>/dev/null
# wait (at most 6 s) until the orchestrator and both servers are really gone, so a start right after this always works
i=0
while [ $i -lt 20 ]; do
  alive=0
  for p in $pids; do kill -0 "$p" 2>/dev/null && alive=1; done
  pgrep -x coredns >/dev/null && alive=1
  pgrep -x mediamtx >/dev/null && alive=1
  [ $alive = 0 ] && break
  sleep 0.3; i=$((i + 1))
done
# anything left over from our bin/ folder
pkill -9 -f "^$root/bin/" 2>/dev/null
echo 'Stopped.'
