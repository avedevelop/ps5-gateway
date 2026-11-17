# Troubleshooting

Start with `node scripts\doctor.mjs`. It checks every link of the chain and prints a fix next to each problem. Logs are in `logs\` (`orch.out.log`, `ingest.log`, `dns.log`, `relay.log`).

On macOS the commands are the same with forward slashes (`node scripts/doctor.mjs`), and start and stop are `sh scripts/start.sh` and `sh scripts/stop.sh`. Mac-specific problems are collected [at the end](#macos).

## The PS5 has no internet after I changed DNS

The PS5 now asks the PC for every name. If the gateway is not running, or the firewall blocks it, nothing resolves.

1. Is the gateway running? `node scripts\doctor.mjs` (looks at port 8787).
2. Did you run `scripts\firewall.ps1` as Administrator? The rule is bound to the PS5's address; if the PS5 got a new address, run it again with `-Ps5Ip <new address>` and fix `PS5_IP` in `.env`.
3. Is another program using port 53 (Docker, Windows Internet Connection Sharing, a VPN)? `Get-NetUDPEndpoint -LocalPort 53` shows who.
4. Quick escape: on the PS5 set DNS back to Automatic.

## The PS5 broadcasts straight to Twitch, not to OBS

The console is using a DNS other than the gateway for the Twitch address. It happens after the gateway was off: the PS5 falls back to the secondary DNS (`1.1.1.1`) and can stay on it even when the gateway is back, or after you changed the primary DNS.

1. Stop the broadcast on the PS5.
2. **Turn the PS5 fully off and on again** (not rest mode).
3. Check Settings > Network > View Connection Status: the primary DNS must be the number shown in the app.
4. If your router hands out IPv6, the console may also get an IPv6 DNS from it. Try turning IPv6 off on the router.

The app shows "The PS5 is not using this DNS" on Home when the console answers pings but never asks the gateway. The report lists the last names the console asked about (`ps5.recent`): if `ingest.global-contribute.live-video.net` never appears there during a broadcast attempt, the console is not asking the gateway.

## The PS5 says it cannot start the broadcast

- The PS5 needs a linked Twitch account (Settings > Users and Accounts > Link with Other Services).
- Check `doctor`: the line "PS5 has asked this DNS" must be ok. If it is not, the PS5 is not using the PC as its DNS; recheck step 4 of [INSTALL.md](INSTALL.md) and press "Test Internet Connection" on the PS5.
- Check `doctor`: "DNS spoof works" must be ok.

## `doctor` says the PC address changed

The router gave the PC a new address, so the PS5's DNS now points at nothing. Set the PS5's DNS to the PC's address again, and either remove `PC_LAN_IP` from `.env` (auto-detect) or update it. Restart the gateway. If your router lets you, a DHCP reservation for the PC (optional) prevents this.

## The Windows installer cannot install Node.js

The installer uses `winget`, which older Windows 10 builds lack. Install Node.js 24 LTS from <https://nodejs.org>, open a new window and run the installer again. If Windows SmartScreen blocks `Install-PS5-Gateway.cmd`, choose More info > Run anyway, or run `powershell -ExecutionPolicy Bypass -File installer\windows\install.ps1`.

## OBS: the PS5 source is black

First check that the PS5 really sends picture. In the source's Properties window the preview should show the game. If it does, but the main preview is black, the source has no size on the scene:

- select the **PS5** source and press **Ctrl+F** (Fit to screen); if that does nothing, press **Ctrl+R** first (Reset transform), then Ctrl+F.

If the Properties preview is black too:

- turn off **Use hardware decoding when possible** in the source's Properties and press OK (the most common cause of a black H.264 stream);
- confirm the input is `rtmp://<PC address>:1935/ps5/game`;
- confirm the PS5 is broadcasting: the dashboard says "PS5 broadcasting → OBS";
- very dark games (night scenes, loading screens) can look black: look for shapes, or check the audio meter.

The Media Source reconnects by itself every 2 seconds, so you can start OBS before the PS5.

## OBS: "Failed to get text from remote: Resolving timed out" (Settings > Stream)

Name resolution on the PC is slow. `doctor` prints how long `id.twitch.tv` takes; more than a few seconds is a problem. The usual cause is a VPN or virtual network adapter (Radmin VPN, Hamachi, ZeroTier, Hyper-V, VPN clients) that Windows tries first, with a DNS server it cannot reach. Each lookup then waits for a timeout before falling back to the real network.

Fix: remove the VPN software, or open Network Connections, open the adapter's IPv4 properties and clear its DNS servers (or raise its interface metric). Check with `node scripts\doctor.mjs`.

You can also skip the account link: in OBS Settings > Stream choose "Use stream key" and paste the key.

## The picture on Twitch is soft or blocky

Quality is limited by three things, in this order:

1. **The PS5's own stream.** The console compresses its broadcast before it reaches the PC. Check the broadcast quality setting on the PS5. OBS re-encodes that picture, which costs a little more quality.
2. **OBS encoder settings.** Use the hardware H.264 encoder (AMD AMF, NVIDIA NVENC, Intel QSV), CBR, 6000 to 8000 Kbps (check Twitch's current recommendation for your account), keyframe interval 2 s, profile high, 1920x1080 at 60 FPS. On AMD, "Quality" preset; the pre-analysis option helps in dark scenes and costs little.
3. **Your connection.** Use Ethernet for the PC if you can. In OBS, View > Stats shows dropped frames; more than a couple of percent means a network problem, not an encoder problem.

## The gateway does not start

`logs\orch.err.log` has the reason. Common ones:

- `PS5_IP is not set`: edit `.env`.
- `Could not detect the PC LAN address`: set `PC_LAN_IP` in `.env`.
- `Already running: coredns.exe, mediamtx.exe`: run `scripts\stop.ps1`, then start again.
- Port 53 or 1935 busy: another program uses it; see "no internet" above.

## Starting over cleanly

```powershell
powershell -ExecutionPolicy Bypass -File scripts\stop.ps1
```

Delete `.env` if you want setup to recreate it, then run `node scripts\setup.mjs` again.

## macOS

- **The installer says Homebrew is missing.** Install it from <https://brew.sh> (one command from that page), then run the installer again. Or install Node.js from <https://nodejs.org> and FFmpeg yourself and run `node scripts/setup.mjs`.
- **macOS will not open the `.command` file** (unidentified developer). On macOS 15 and newer: click Done, then System Settings > Privacy & Security > Open Anyway (on macOS 14 and older: right-click it, Open). Or run `sh installer/macos/install.sh`.
- **OBS closes right after it opens (macOS 27).** OBS 32.2.2 crashes inside Qt when it sets the mouse cursor, in normal and safe mode alike, and the crash report mentions `QWidget::setCursor` and `CGImageCreate`. Use OBS 33 or newer (`brew install --cask obs`); 33.0.1 starts fine.
- **The PS5 source is wider than the canvas on a MacBook.** OBS takes the screen's shape as its canvas (for example 2940x1912, which is 16:10), so a 16:9 picture is cut at the sides. In OBS Settings > Video set Base (Canvas) and Output (Scaled) resolution to 1920x1080, then select the source and press Cmd+F.
- **`FFmpeg not found`**: `brew install ffmpeg`, then start again.
- **The PS5 has no internet, `doctor` is all ok on the Mac.** The gateway answers only the address in `PS5_IP`. If the PS5 got a new address, its lookups are refused: put the new address into `.env` and restart. `logs/dns.log` stays empty for the PS5 in this case.
- **The macOS firewall is on.** `doctor` warns about it and prints the commands that allow `coredns` and `mediamtx`. Or turn the firewall off under System Settings > Network > Firewall.
- **Port 53 is busy.** `sudo lsof -nP -i :53` shows who uses it. Usual suspects: Internet Sharing (System Settings > General > Sharing), Docker, dnsmasq, a VPN client.
- **The Mac's address changed.** A MacBook gets a new address on every network it joins. The gateway detects the address at start; after moving, restart the gateway and set the PS5's DNS to the new address. If your router allows it, a DHCP reservation (optional) avoids this.
- **The stream stopped when I closed the lid.** A closed MacBook sleeps. Keep the lid open while streaming.
- **"node" would like to access files in your Documents folder** (with autostart): move the project out of Desktop, Documents and Downloads, then run `sh scripts/install-autostart.sh` again.
- **`Already running: coredns, mediamtx`**: `sh scripts/stop.sh`, then start again.

## Still stuck

Open an issue and paste the output of `node scripts\doctor.mjs`. Before pasting any log, remove anything that looks like a stream key (text after `live_` or after `app/`). The orchestrator masks these in its own output, but check anyway. Never post `.env`.
