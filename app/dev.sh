#!/bin/sh
# Local development on macOS: rebuild the app, check it, and (re)start it.
#   sh app/dev.sh            build, self-test, restart the window
# The interface files in app/ui are embedded at build time, so a window started from an
# older build shows an older interface: this script always builds first.
root=$(cd "$(dirname "$0")/.." && pwd)
target="${CARGO_TARGET_DIR:-$root/app/src-tauri/target}"   # set CARGO_TARGET_DIR to reuse an existing build folder
bin="$target/debug/ps5-gateway-app"

cd "$root/app/src-tauri" || exit 1
CARGO_TARGET_DIR="$target" cargo build 2>&1 | tail -3 || exit 1

for f in "$root"/app/ui/index.html "$root"/app/ui/app.css "$root"/app/ui/app.js "$root"/app/ui/i18n.js "$root"/app/ui/i18n-langs.js "$root"/app/ui/i18n-extra.js; do
  [ "$bin" -nt "$f" ] || { echo "binary is older than $f: build did not pick it up"; exit 1; }
done

echo "--- self-test (Rust side, no window):"
PS5GW_ROOT="$root" PS5GW_SELFTEST=1 "$bin"

pkill -f "debug/ps5-gateway-app" 2>/dev/null
sleep 1
PS5GW_ROOT="$root" nohup "$bin" >/tmp/ps5gw-app.log 2>&1 &
sleep 3
pgrep -fl "debug/ps5-gateway-app" >/dev/null && echo "app started" || echo "APP DID NOT START (see /tmp/ps5gw-app.log)"
