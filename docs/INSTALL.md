# Installation guide

About 20 minutes. You will end up with the PS5's picture inside OBS, ready to stream to Twitch.

If you would rather have an AI assistant walk you through it, use the prompts in [AI-INSTALL.md](AI-INSTALL.md).

## Fastest way: the installer

Download the archive for your system from the [latest release](https://github.com/avedevelop/ps5-gateway/releases/latest) and unpack it:

| System | Archive | Run |
|---|---|---|
| Windows 10 / 11 | `ps5-gateway-windows-<version>.zip` | double-click `installer\windows\Install-PS5-Gateway.cmd` |
| macOS | `ps5-gateway-macos-<version>.tar.gz` | double-click `installer/macos/Install PS5 Gateway.command` |

The installer asks for the PS5's address (step 2 below shows where to find it) and does steps 1 to 6 for you: it checks Node.js (offers to install it with winget on Windows or Homebrew on macOS), FFmpeg on macOS, creates `.env`, downloads the helper programs, creates the firewall rules on Windows (one UAC prompt), starts the gateway, runs `doctor` and creates the OBS scene. It changes nothing without asking and prints what is left to do by hand: the PS5's DNS and your stream key.

Options, from a terminal: `install.ps1 -Ps5Ip 192.168.1.50 -Yes -SkipFirewall -NoScenes -Autostart -Check` on Windows, `install.sh --ps5-ip=192.168.1.50 --yes --no-obs --no-scenes --autostart --check` on macOS. `-Check` / `--check` only reports what is missing.

- **macOS says the `.command` file cannot be opened** because it is from an unidentified developer: on macOS 15 and newer click **Done**, then open **System Settings › Privacy & Security** and click **Open Anyway** (on macOS 14 and older: right-click it, choose Open). Or run `sh installer/macos/install.sh` in a terminal, which needs no permission.
- **Windows SmartScreen** warns about the `.cmd`: choose More info, then Run anyway. Both installers are plain text, read them first if you like.

Prefer to do each step yourself? Read on.

The steps below are written for Windows. **On a Mac**, follow [Installing on macOS](#installing-on-macos) for steps 1 to 5; steps 4 (PS5) and 6 (OBS) are the same on both.

## 0. Before you start

| You need | Notes |
|---|---|
| Windows 10 or 11 PC, or a Mac | It must stay on and awake while you stream. |
| [Node.js 24 LTS](https://nodejs.org) | Check with `node -v` in PowerShell. 22.18 or newer also works. |
| [OBS Studio](https://obsproject.com) | Any recent version. |
| PS5 with a Twitch account linked | PS5: Settings > Users and Accounts > Link with Other Services > Twitch. |
| PC and PS5 on the same network | Ethernet is best for both. Wi-Fi works but can cause dropped frames. |
| A Twitch account | Your stream key: Twitch Creator Dashboard > Settings > Stream. |

Good to know: the PS5 will be told the PC's address as its DNS server, so if that address changes (new network, router restart), the PS5 has no internet until you set the new address on it (step 4). Optional: if your router lets you, bind the PC's address in its settings ("DHCP reservation" or "static lease") and this never happens.

## 1. Get the project

```powershell
git clone https://github.com/avedevelop/ps5-gateway.git
cd ps5-gateway
```

No git? Download the ZIP from GitHub and unpack it somewhere without spaces in the path, for example `C:\ps5-gateway`.

## 2. Run setup

Find the PS5's address: PS5 Settings > Network > Connection Status > View Connection Status, and read the IPv4 address (for example `192.168.1.50`).

```powershell
node scripts\setup.mjs --ps5-ip=192.168.1.50
```

Setup checks Node, downloads FFmpeg, MediaMTX and CoreDNS into `bin\` (each download is checked against a published checksum), detects the PC's address and writes `.env`. It prints the exact DNS address you will give the PS5. It is safe to run again; it never overwrites files that exist.

Useful flags: `--check` (only report), `--no-download`, `--yes` (no questions).

## 3. Open the firewall for the PS5

Open **PowerShell as Administrator** (right-click Start, Terminal (Admin)) and run:

```powershell
cd C:\path\to\ps5-gateway
powershell -ExecutionPolicy Bypass -File scripts\firewall.ps1
```

This allows DNS (port 53) and RTMP (port 1935) **only from the PS5's address**. Nothing is opened to the internet.

## 4. Point the PS5 at the PC

On the PS5: Settings > Network > Settings > Set Up Internet Connection > pick your network (the gear icon, or "Advanced Settings"):

- DNS Settings: **Manual**
- Primary DNS: **the PC's address** (setup printed it)
- Secondary DNS: `1.1.1.1`

Menu names differ slightly between system software versions. Save and let the PS5 test the connection. While the gateway is not running the PS5 will have no internet, so do this step and step 5 together. To undo it later, set DNS back to Automatic.

## 5. Start the gateway

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
node scripts\doctor.mjs
```

`doctor` should end with `0 failure(s)`. The most common problems it finds are explained in [TROUBLESHOOTING.md](TROUBLESHOOTING.md). The dashboard is at <http://127.0.0.1:8787>.

To start the gateway automatically when you log in to Windows: `powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1`.

## 6. Set up OBS

1. Create the scene collection: one scene, "PS5", with the PS5 source already fitted to the canvas. With `--lang=ru` it uses the Russian names of OBS's built-in transitions (use it if your OBS is in Russian).
   ```powershell
   node scripts\make-obs-scenes.mjs 192.168.1.20
   ```
   The argument is the PC's address (optional, detected if omitted). It refuses to overwrite an existing `PS5` collection, and it never touches your other collections.

   Prefer to do it by hand? Add a **Media Source**, uncheck *Local File*, set Input to `rtmp://<PC address>:1935/ps5/game` (the dashboard shows the exact URL), set *Reconnect delay* to 2 s, and keep *Use hardware decoding* on (turn it off if the picture is black).
2. Restart OBS if it was open, then choose **Scene Collection > PS5**.
3. In OBS go to **Settings > Stream**, choose Twitch, link your account or paste the stream key.
4. Recommended **Settings > Output** (Advanced mode, Streaming tab): the hardware H.264 encoder of your GPU, CBR, bitrate 6000 to 8000 Kbps, keyframe interval 2 s, profile high. **Settings > Video**: 1920x1080 at 60.
5. On the PS5 open the broadcast menu (Create button > Broadcast), choose Twitch and press **Go Live**. Within a few seconds the **PS5** source in OBS shows the game.
6. When you are ready, press **Start Streaming** in OBS. Nothing reaches Twitch until you do.

If you added the source by hand and it shows as a small or black rectangle, select it and press **Ctrl+F** (Fit to screen). Details in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Installing on macOS

Works on Apple silicon and Intel Macs. No administrator rights and no firewall script are needed.

1. Install [Node.js 24 LTS](https://nodejs.org), [OBS Studio](https://obsproject.com) **33 or newer** (OBS 32.2.2 crashes at startup on macOS 27) and FFmpeg. FFmpeg has no official macOS download, so it comes from [Homebrew](https://brew.sh): `brew install ffmpeg`.
2. Get the project and run setup (the PS5's address is found as in step 2 above):
   ```bash
   git clone https://github.com/avedevelop/ps5-gateway.git
   cd ps5-gateway
   node scripts/setup.mjs --ps5-ip=192.168.1.50
   ```
   Setup downloads MediaMTX and CoreDNS for your Mac's processor into `bin/` (checksum-verified), finds FFmpeg and writes `.env`.
3. Point the PS5 at the Mac: step 4 above, with the Mac's address as Primary DNS.
4. Start the gateway and check it:
   ```bash
   sh scripts/start.sh
   node scripts/doctor.mjs
   ```
5. Set up OBS: step 6 above. The commands are the same with forward slashes, for example `node scripts/make-obs-scenes.mjs`. OBS must have been started at least once. Where the guide says **Ctrl+F**, use **Cmd+F**.

Good to know on a Mac:

- **Who can reach the gateway.** macOS lets a normal program open the DNS port only on all network interfaces at once, so instead of a firewall rule the gateway itself refuses everyone except the PS5 (`PS5_IP` in `.env`) and the Mac. If the PS5's address changes, update `.env` and restart.
- **macOS firewall.** It is off by default. If you turned it on (System Settings > Network > Firewall), macOS may block the PS5; `doctor` detects this and prints the two commands that allow the gateway's servers.
- **Sleep.** While the PS5 broadcasts, the gateway keeps the Mac from going to sleep on its own. Closing a MacBook's lid still puts it to sleep, so keep it open.
- **Wi-Fi.** A MacBook is usually on Wi-Fi, and its address changes when it joins another network. If your router allows it, reserving its address (step 0) avoids this; otherwise just set the new address on the PS5 after moving.
- **Autostart at login:** `sh scripts/install-autostart.sh` (remove with `--remove`). macOS does not let background programs read Desktop, Documents or Downloads without asking, so keep the project folder elsewhere, for example `~/ps5-gateway`.
- **Stop:** `sh scripts/stop.sh`. **Update:** stop, `git pull`, `node scripts/setup.mjs`, start.
- **Uninstall:** set the PS5's DNS back to Automatic, run `sh scripts/install-autostart.sh --remove` if you enabled autostart, `sh scripts/stop.sh`, delete the folder.

## Updating

```powershell
powershell -ExecutionPolicy Bypass -File scripts\stop.ps1      # ends a running PS5 broadcast
git pull
node scripts\setup.mjs
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
```

Your `.env` is git-ignored and survives updates.

## Uninstalling

1. On the PS5 set DNS back to Automatic.
2. `scripts\stop.ps1`, then delete the project folder.
3. Remove firewall rules (Administrator): `Get-NetFirewallRule -DisplayName 'ps5gw-*' | Remove-NetFirewallRule`
4. If you enabled autostart: `Unregister-ScheduledTask -TaskName ps5gw -Confirm:$false`
5. In OBS delete the **PS5** scene collection if you no longer want it.

## Ports used

| Port | What | Reachable from |
|---|---|---|
| 53 UDP/TCP | DNS (CoreDNS) | PS5 only (macOS: PS5 and this Mac) |
| 1935 TCP | RTMP ingest (MediaMTX) | PS5 and this PC |
| 8787 TCP | Dashboard | this PC only |
