# Changelog

## 1.2.0

- **Desktop app for Windows and macOS** (`PS5 Gateway.exe` / `PS5 Gateway.app`, built with Tauri). Guided setup (language, program, PS5 address, installation with progress), a dashboard with the PS5's status and the on-air numbers, settings (basic and advanced), a help section with common problems, a diagnostic report for an AI assistant or the author, and a check/update from GitHub releases. Interface in English, Russian, Ukrainian, German and Spanish. Works with OBS, Streamlabs Desktop or any other program that can take video from an address.
- **Updates.** The app looks at the latest release and, on request, downloads the archive, verifies its SHA-256 against `SHA256SUMS.txt` and replaces the project files, keeping `.env`, `bin/` and `logs/`. The interface is read from `app/ui` in the project folder, so a restart brings the new interface.
- **Release builds.** A `v*` tag now also builds a universal (Apple silicon and Intel) `PS5 Gateway.app` and puts it into the macOS archive. `scripts/build-app.sh` and `scripts/build-app.ps1` build the app locally. CI compiles the app on macOS and Windows on every change.
- **New optional settings in `.env`:** `UPSTREAM_DNS` (DNS servers for everything except the PS5's Twitch address), `KEEP_AWAKE=0` (let the Mac sleep during a broadcast), `DNS_CACHE_TTL` (seconds) and `MTX_LOG_LEVEL` (`error`, `warn`, `info`, `debug`). Defaults keep the old behaviour.
- **License changed from PolyForm Noncommercial 1.0.0 to MIT.** Commercial use is now allowed. Versions 1.0.0 and 1.1.0 stay under PolyForm Noncommercial for the copies already published.
- **Windows app.** Every command has a Windows branch: scripts, OBS (also the Steam copy) and Streamlabs detection, any other program through its Start-menu shortcut, notifications, diagnostics, updates. The release archive for Windows now contains `PS5 Gateway.exe` next to `scripts\`. Setup shows real download progress and asks Windows once for permission to create the firewall rules (only your PS5 may reach the gateway). Autostart no longer flashes a window.
- **Tray / menu bar.** Closing the window hides it; the gateway keeps running. One copy of the app at a time.
- **PS5 on the wrong DNS.** Home warns when the PS5 answers pings but never asks the gateway, and says to restart the console completely. The gateway status and the report list the last names the PS5 asked about.
- **Keep awake on Windows too** while the PS5 broadcasts (`KEEP_AWAKE=0` still turns it off), and the interface says "computer" instead of "Mac" on Windows. Interface texts are split by system.
- **Strings** now live in one file per language (`app/ui/strings/`). Every line of the system check has a translation in all languages (guarded by a test); `doctor` also checks the Windows firewall rules.
- **Report:** *Save to a file* puts it on the Desktop.
- **Guides** for Windows and macOS with pictures (`docs/WINDOWS.md`, `docs/MACOS.md`, also in Russian), made by `tools/screenshots.mjs`.

## 1.1.0

- **One-click installers** for Windows (`installer\windows\Install-PS5-Gateway.cmd`) and macOS (`installer/macos/Install PS5 Gateway.command`): check Node.js, FFmpeg and OBS, download the helper programs, create `.env`, set up the Windows firewall, start the gateway, run `doctor` and create the OBS scene. `-Check` / `--check` only report.
- **CI** (GitHub Actions): unit tests on Linux, Windows and macOS, ShellCheck and PowerShell parsing, and an install-and-run job on fresh Windows and macOS machines driven by `tests/smoke.mjs` (test stream, DNS redirect, ingest, relay, key masking). Pushing a `v*` tag publishes a release with a Windows zip, a macOS tar.gz and checksums.
- `scripts/stop.sh` now waits until the gateway has really exited.
- The flow diagram says "your PC (Windows or Mac)".

- **macOS support** (Apple silicon and Intel). Setup downloads the macOS builds of MediaMTX and CoreDNS and uses FFmpeg from Homebrew. New scripts: `scripts/start.sh`, `scripts/stop.sh`, `scripts/install-autostart.sh` (LaunchAgent). `npm start` and `npm stop` now work on both systems.
- On macOS no firewall script is needed: the generated configs let only the PS5 and the Mac itself use DNS and RTMP. The Mac is kept from idle sleep while the PS5 broadcasts.
- Platform differences moved into `apps/common/platform.mjs`, with unit tests. Windows behaviour is unchanged.
- The gateway's own relay path (`ps5/game`) is never mistaken for the console's publish.
- Verified with a real PS5 on Windows 10 and 11 (OBS 32) and on a MacBook with Apple silicon, macOS 27 (OBS 33.0.1).

## 1.0.0

First public release: stream your PS5 into OBS. Licensed under PolyForm Noncommercial 1.0.0.

- DNS redirect (CoreDNS) and RTMP ingest (MediaMTX), supervised by a small orchestrator with a dashboard on `127.0.0.1:8787`.
- Relay (FFmpeg, no re-encoding) from the PS5's stream to the fixed address `rtmp://<PC>:1935/ps5/game` that OBS reads as a Media Source. The gateway never publishes to Twitch.
- `scripts\setup.mjs`: checksum-verified downloads of FFmpeg, MediaMTX and CoreDNS, LAN IP detection, `.env` creation.
- `scripts\doctor.mjs`: checks files, addresses, name-resolution speed, the DNS redirect, the RTMP port and the PS5's activity, with a fix for each problem.
- `scripts\make-obs-scenes.mjs`: creates an OBS scene collection `PS5` with one scene: the PS5 source, fitted to the canvas.
- Start, stop, firewall (PS5-only rules) and autostart scripts.
- Install guide, architecture notes, troubleshooting guide, prompts for installing with an AI assistant.
- Unit tests (`npm test`).
