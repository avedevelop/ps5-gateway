# Using Streamlabs Desktop instead of OBS Studio

> Русская версия: [STREAMLABS.ru.md](STREAMLABS.ru.md)

PS5 Gateway does not care which program shows the picture. It publishes the PS5's stream at one fixed address, `rtmp://<your PC or Mac>:1935/ps5/game`, and any program that can open an RTMP address can read it. Streamlabs Desktop is built on the same engine as OBS Studio and has the same kind of source, which Streamlabs calls **Media File** (OBS calls it Media Source), so the setup is the same idea.

**Status.** The gateway is tested with OBS Studio on real hardware. Checked by the author in Streamlabs Desktop 1.21.6 on macOS with a test stream: adding the **Media File** source with the gateway's RTMP address works, the picture and the sound arrive. The settings window and Fit to Screen below are as seen there. Not verified yet: a real PS5 broadcast in Streamlabs, and Windows. If a menu or a setting differs, please open an [issue](https://github.com/avedevelop/ps5-gateway/issues) with what you see. Streamlabs Desktop for macOS exists but is newer; the steps are the same.

## 1. Install the gateway

Use the one-click installer ([INSTALL.md](INSTALL.md#fastest-way-the-installer)). The installer's OBS scene step is for OBS Studio only, so skip it: add `-NoScenes` on Windows or `--no-scenes` on macOS, or ignore its message. At the end it prints the address of your computer (for example `192.168.1.20`) and what to set on the PS5 (DNS). The dashboard at <http://127.0.0.1:8787> also shows the exact address for the player.

## 2. Add the PS5 source in Streamlabs Desktop

1. Create a scene, for example **PS5**.
2. In **Sources** press **+**. In the Add Source window type `Media File` in the search box (searching for "media source" finds nothing: Streamlabs calls this source **Media File**; you do not need to log in to add it), choose **Media File**, press Add Source and name it `PS5`.
3. Uncheck **Local File**.
4. In **Input** type `rtmp://<your computer's address>:1935/ps5/game`.
5. Set **Reconnect Delay** to **2** (the default is 10): the source retries by itself, and a short delay shows the picture a few seconds after the PS5 starts. Untick **Restart playback when source becomes active** (it is on by default) so switching scenes does not restart the connection, and leave **Close file when inactive** off.
6. Leave **Network Buffering** at 2 and **Use hardware decoding when available** off (both are the defaults). Press **Close**. The source reconnects by itself, so you can start Streamlabs before the PS5.
7. If the picture is black while the PS5 broadcasts, open the source's properties (right-click it, **Properties**) and toggle **Use hardware decoding when available**.

## 3. Make it fill the screen

- In **Settings > Video** set **Base (Canvas) Resolution** and **Output (Scaled) Resolution** to **1920x1080**. On a MacBook the default canvas takes the screen's shape (16:10) and cuts the picture at the sides.
- Right-click the PS5 source, **Transform > Fit to Screen**. Do this after changing the canvas: until then the picture keeps its own size (for example 1280x720) in the top-left corner of the canvas.

## 4. Go live

1. On the PS5: set DNS to your computer's address (see [INSTALL.md](INSTALL.md#4-point-the-ps5-at-the-pc)), open Broadcast, choose Twitch, Go Live. The PS5 source in Streamlabs shows the game.
2. In Streamlabs connect your Twitch account (or use a stream key) and press **Go Live** when you are ready. Nothing reaches Twitch before that.
3. Your Streamlabs overlays, alerts and widgets work as usual: they are normal sources on top of the PS5 scene.

## Optional: reuse the OBS scene file

`node scripts/make-obs-scenes.mjs` writes an OBS Studio scene collection. Streamlabs Desktop has an **Import** button in its scene collection window that can read OBS Studio collections; if it works for you the source arrives already fitted. We have not verified this, and the manual steps above take a minute, so they are the safer route.

## Other programs

Anything that can open an RTMP address works the same way: paste `rtmp://<computer>:1935/ps5/game` as a network or media source. Examples: Meld Studio, vMix, VLC (to just look at the picture: File > Open Network).
