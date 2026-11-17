<div align="center">

# PS5 Gateway on Windows

**From download to the first broadcast in about five minutes.**

[Русский](WINDOWS.ru.md) · [macOS guide](MACOS.md) · [Troubleshooting](TROUBLESHOOTING.md) · [Back to the README](../README.md)

<img src="images/win-en-home-live.png" alt="PS5 Gateway on Windows: the PS5 is broadcasting" width="760">

<sub>The pictures in this guide use made-up addresses (192.168.1.x). Yours will differ.</sub>

</div>

<br>

## What you need

- Windows 10 or 11, 64-bit. WebView2, which the app needs, is part of both.
- [Node.js 24 LTS](https://nodejs.org). The gateway runs on it. Install it first and accept the defaults (about a minute).
- [OBS Studio](https://obsproject.com) or Streamlabs Desktop. The Steam version of OBS is found too.
- A PS5 on the same home network as the PC (cable or Wi-Fi).
- About 250 MB of free space. The app downloads its helper programs (MediaMTX, CoreDNS, FFmpeg), checks their checksums and keeps them in its own folder.

## 1. Download and unpack

1. Open the [latest release](https://github.com/avedevelop/ps5-gateway/releases/latest) and download **`ps5-gateway-windows-<version>.zip`**.
2. Unpack it to a folder you keep, for example `C:\ps5-gateway`. Not into `Program Files` and not into a folder that syncs with the cloud.
3. Open the folder and double-click **`PS5 Gateway.exe`**.

> **Windows says "Windows protected your PC".** The app is not signed with a paid certificate yet. Click **More info**, then **Run anyway**. The whole program is open source in this repository, and every download is checked against the checksum in `SHA256SUMS.txt`.

## 2. Guided setup

The app opens with a short setup. Pick your language in the corner first, if you like: it speaks English, Russian, Ukrainian, German and Spanish.

<table>
<tr>
<td width="50%"><img src="images/win-en-welcome.png" alt="Welcome"><br><sub><b>1. Welcome.</b> Press <i>Get started</i>.</sub></td>
<td width="50%"><img src="images/win-en-program.png" alt="Choose the program"><br><sub><b>2. Your program.</b> The app shows what it found on the PC. Choose OBS or Streamlabs.</sub></td>
</tr>
<tr>
<td><img src="images/win-en-address.png" alt="PS5 address"><br><sub><b>3. PS5 address.</b> On the PS5: Settings › Network › View Connection Status › IPv4 address. Type it here.</sub></td>
<td><img src="images/win-en-installing.png" alt="Installing"><br><sub><b>4. Installing.</b> Real download progress. <b>Windows asks once for permission</b> (the firewall step): choose <i>Yes</i>. It opens DNS and the stream port for your PS5 only.</sub></td>
</tr>
<tr>
<td><img src="images/win-en-dns.png" alt="DNS for the PS5"><br><sub><b>5. DNS for the PS5.</b> The two numbers are typed on the console by hand (next section).</sub></td>
<td><img src="images/win-en-done.png" alt="All set"><br><sub><b>6. All set.</b> The gateway is running.</sub></td>
</tr>
</table>

## 3. Tell the PS5 to use the gateway

On the PS5:

1. **Settings › Network › Settings › Set Up Internet Connection.**
2. Choose your network, then **Advanced Settings › DNS Settings › Manual**.
3. **Primary DNS:** the big number from the app (this PC's address). **Secondary DNS:** `1.1.1.1`.
4. **Done**, then **Test Internet Connection**.
5. **Turn the PS5 fully off and on again** (not rest mode). This matters: a console that was using another DNS can stay on it, and then its broadcast goes straight to Twitch and never reaches OBS.

## 4. Broadcast

1. On the PS5 press **Create › Broadcast › Twitch** and go live.
2. The app changes to **PS5 is broadcasting** and shows frames per second, megabits and the time.
3. In OBS pick the scene collection **PS5** (the app creates it), enter your stream key under *Settings › Stream* and press **Start Streaming** when you are ready. Nothing is public until you do.

<table>
<tr>
<td width="50%"><img src="images/win-en-home-waiting.png" alt="Waiting for the PS5"><br><sub><b>Waiting.</b> Everything runs, the gateway waits for the PS5.</sub></td>
<td width="50%"><img src="images/win-en-home-live.png" alt="Broadcasting"><br><sub><b>On air.</b> The picture is on its way to OBS. Copy the source address from the card if OBS asks for it.</sub></td>
</tr>
</table>

## 5. Every day

- **Closing the window does not stop the gateway.** The app stays in the notification area next to the clock (click the icon to open it, right-click for *Quit*). To switch the gateway off, use the switch on the Home screen. It asks first, because the broadcast to OBS stops.
- **Start with Windows:** Settings › Basic › Startup › *Start at login*. The gateway then starts when you sign in, with no window.
- **The PC stays awake during a broadcast** (Settings › Advanced › Power). Turn it off if you do not want that.
- **Updates:** Settings › Updates checks GitHub (nothing about you is sent) and replaces the files in place. Your settings and downloads stay.
- **Uninstall:** Settings › Advanced › *Uninstall…* lists what it deletes. Then set the PS5's DNS back to *Automatic*.

## If something does not work

<table>
<tr>
<td width="50%"><img src="images/win-en-home-silent.png" alt="The PS5 does not use this DNS"><br><sub><b>"The PS5 is not using this DNS".</b> The console answers pings but never asks the gateway. Restart the PS5 completely and check its primary DNS.</sub></td>
<td width="50%"><img src="images/win-en-check.png" alt="The check"><br><sub><b>Check.</b> Press <i>Check</i> on Home: every line says what is fine and, if not, how to fix it.</sub></td>
</tr>
</table>

- **The PS5 broadcast goes straight to Twitch, not to OBS.** Restart the PS5 completely (step 3.5). If your router has IPv6 on, try turning it off.
- **The PS5 says it cannot start the broadcast.** Link your Twitch account: Settings › Users and Accounts › Link with Other Services.
- **Report for help.** *Report* on Home creates a report you can hand to an AI assistant or the author. It hides network addresses by default, never includes your stream key, and nothing is sent anywhere by itself. **Save to a file** puts it on your Desktop.
- More cases: [Troubleshooting](TROUBLESHOOTING.md) and *Guide › If something does not work* inside the app.

## Prefer the command line?

Everything the app does is a script in `scripts\`. See the [install guide](INSTALL.md).
