# PS5 Gateway

Get your PS5's picture into **OBS** over your home network, with no capture card, and stream it to Twitch from there.

The PS5 has a built-in **Broadcast to Twitch** feature, but it gives you no overlays, no alerts, no scenes and no control over the picture. PS5 Gateway quietly redirects that built-in broadcast to your Windows PC. OBS then opens it as a normal Media Source, and from that point on it is just OBS: scenes, overlays, chat, StreamElements, Streamlabs, DonationAlerts, recording, filters.

> Russian version: [README.ru.md](README.ru.md)

```
PS5  "Broadcast" ──DNS redirect──▶  your PC
                                      ├─ CoreDNS      answers the PS5's Twitch ingest lookup with your PC
                                      ├─ MediaMTX     receives the PS5's RTMP stream (port 1935)
                                      └─ Orchestrator keeps both running, relays the stream, shows a dashboard
                                                │
                                                ▼
                       rtmp://<PC>:1935/ps5/game  ──▶  OBS Media Source  ──▶  Twitch
                                                       (you press Start Streaming)
```

## Why you might want this

- **Real OBS with a PS5.** Everything OBS can do, on a picture that comes straight from the console's own broadcast.
- **No capture card, no HDMI splitter.** The PS5 sends its stream over your home network.
- **The PS5 still shows chat and viewers.** It takes them straight from Twitch, as usual.
- **You decide when to go live.** The gateway never sends anything to Twitch. If OBS is not streaming, nothing is public.
- **Set up once.** One setup script, one `doctor` command that tells you what is wrong, and a ready OBS scene.

## Quick start

You need Windows 10/11, [Node.js 24 LTS](https://nodejs.org), [OBS Studio](https://obsproject.com), and a PS5 on the same network as the PC.

```powershell
git clone https://github.com/avedevelop/ps5-gateway.git
cd ps5-gateway
node scripts\setup.mjs --ps5-ip=192.168.1.50     # downloads FFmpeg, MediaMTX, CoreDNS; creates .env
powershell -ExecutionPolicy Bypass -File scripts\firewall.ps1   # Administrator PowerShell, once
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
node scripts\doctor.mjs                          # checks every link of the chain
node scripts\make-obs-scenes.mjs                 # creates the "PS5" scene collection in OBS
```

Then on the PS5 set the DNS of your network connection to the PC's address (setup prints it), start **Broadcast** and pick Twitch. In OBS choose the **PS5** scene collection, enter your stream key in Settings > Stream, and press **Start Streaming** when you are ready.

Detailed step-by-step guide: **[docs/INSTALL.md](docs/INSTALL.md)**.

## Install with an AI assistant

Do not want to do it by hand? Copy a ready prompt from **[docs/AI-INSTALL.md](docs/AI-INSTALL.md)** into any AI assistant or coding agent. There are prompts for guided installation, for fixing a problem from `doctor` output, and for customising the project.

## What is in the box

- **Setup that does the boring parts**: pinned, checksum-verified downloads, automatic LAN IP detection, config generation.
- **`doctor`**: checks files, addresses, name-resolution speed, the DNS redirect, the RTMP port and the PS5's activity, and prints a fix for each problem.
- **Dashboard** (`http://127.0.0.1:8787`, in 5 languages): is the PS5 broadcasting, relay health, restart buttons for the services, the exact OBS source URL.
- **OBS scene generator**: one command creates an OBS scene collection with a single scene: the PS5 source, already fitted to the canvas to reconnect by itself.
- **Autostart** with Windows (optional) and clean start/stop scripts.

## Requirements

- Windows 10 or 11, 64-bit. The project uses Windows-only pieces (firewall rules, `tasklist`, PowerShell scripts).
- Node.js 22.18 or newer (24 LTS recommended). No npm dependencies.
- OBS Studio.
- A PS5 and a PC on the same local network. Give the PC a fixed IP (DHCP reservation in the router).

## Limitations, said plainly

- **Windows only**, and tested on one setup (Windows 11, PS5, OBS 32). Other hardware should work but has not been tried.
- **The PS5 picture is re-encoded by OBS.** The console compresses its broadcast first, so quality is bounded by that stream plus OBS's own encode. See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for settings that help.
- This project is a hobby tool, offered as is. Read [SECURITY.md](SECURITY.md) before exposing anything beyond your home network.

## Is this allowed?

The gateway only changes how **your own** console reaches **your own** PC on **your own** network. It does not touch Sony's or Twitch's servers, does not break encryption, and does not bypass any protection. You are still streaming through your own Twitch account under Twitch's Terms of Service, and the game you play still has its own rules about streaming. Do not point other people's devices at your DNS server.

This project is not affiliated with, endorsed by, or connected to Sony Interactive Entertainment, Twitch, OBS Project or any other company named here. All names are trademarks of their owners.

## Documentation

| | |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | Full installation, step by step |
| [docs/AI-INSTALL.md](docs/AI-INSTALL.md) | Prompts for installing with an AI assistant |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How it works, ports, files |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Black screen, no connection, slow DNS, quality |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development and tests |

## License

[PolyForm Noncommercial 1.0.0](LICENSE): free for personal and other non-commercial use, not for commercial use. This is a source-available license, not an OSI "open source" one. Third-party software that setup downloads keeps its own license, listed in [NOTICE.md](NOTICE.md).
