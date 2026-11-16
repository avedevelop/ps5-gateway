# Changelog

## Unreleased

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
