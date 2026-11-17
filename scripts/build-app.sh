#!/bin/sh
# Build the desktop app on macOS into "PS5 Gateway.app" in the project folder.
#   sh scripts/build-app.sh               this Mac's architecture
#   sh scripts/build-app.sh --universal   Apple silicon and Intel in one program (needs both Rust targets)
# Needs Rust (https://rustup.rs). The result sits next to scripts/, which is where the program looks for the gateway.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
universal=0; [ "${1:-}" = "--universal" ] && universal=1
cd "$root/app/src-tauri"
if [ "$universal" = 1 ]; then
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  cargo build --release --target aarch64-apple-darwin
  cargo build --release --target x86_64-apple-darwin
  bin="$root/app/src-tauri/target/ps5-gateway-app-universal"
  lipo -create -output "$bin" target/aarch64-apple-darwin/release/ps5-gateway-app target/x86_64-apple-darwin/release/ps5-gateway-app
else
  cargo build --release
  bin="$root/app/src-tauri/target/release/ps5-gateway-app"
fi
ver=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$root/package.json" | head -1)
app="$root/PS5 Gateway.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$bin" "$app/Contents/MacOS/ps5-gateway-app"
cp "$root/app/src-tauri/icons/icon.icns" "$app/Contents/Resources/icon.icns"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>PS5 Gateway</string>
  <key>CFBundleDisplayName</key><string>PS5 Gateway</string>
  <key>CFBundleIdentifier</key><string>dev.ps5gateway.app</string>
  <key>CFBundleExecutable</key><string>ps5-gateway-app</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$ver</string>
  <key>CFBundleVersion</key><string>$ver</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.utilities</string>
</dict></plist>
PLIST
# an ad-hoc signature: Apple silicon refuses to start unsigned programs, and this is not a developer signature
codesign --force --deep --sign - "$app"
echo "Built: $app (version $ver)"
