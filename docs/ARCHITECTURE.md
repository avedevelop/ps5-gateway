# Architecture

## The trick in one paragraph

When you press Broadcast on a PS5, the console asks Twitch which ingest server to use, then opens an RTMP connection to a host under `contribute.live-video.net`. PS5 Gateway runs a small DNS server on your PC. The PS5 is told to use it. For the Twitch ingest hostnames the DNS server answers with your PC's address; for every other name it forwards to a normal public resolver, so the PS5 keeps working. The PS5's RTMP stream therefore lands on a local RTMP server (MediaMTX) instead of Twitch. A relay then copies it to a fixed local address that OBS reads.

```
                        home network
 ┌─────┐  1. DNS: ingest hostname? ┌──────────────────────── PC ─────────────────────────┐
 │ PS5 │ ───────────────────────▶ │ CoreDNS :53   → answers with the PC's address         │
 │     │  2. RTMP publish         │ MediaMTX :1935 ← receives "app/live_<id>_<key>"       │
 │     │ ───────────────────────▶ │ Orchestrator :8787 supervises both, detects the       │
 └─────┘                          │   publish, starts the relay (FFmpeg, -c copy) ──▶     │
                                  │   rtmp://<PC>:1935/ps5/game ──▶ OBS Media Source      │
                                  └──────────────────────────────────────────────────────┘
```

## Components

| Part | Where | Role |
|---|---|---|
| CoreDNS | `bin\coredns`, config generated from `config\Corefile.tpl` | Answers the Twitch ingest names with the PC's address, forwards everything else to 1.1.1.1 and 8.8.8.8. Bound to the LAN address only. |
| MediaMTX | `bin\mediamtx`, config from `config\mediamtx.yml.tpl` | RTMP server on `<PC>:1935`. Accepts the PS5's publish on any path; only RTMP is enabled. |
| Orchestrator | `apps\orchestrator` | TypeScript run by Node's built-in type stripping, no npm packages. Starts and watches DNS, ingest and the relay; restarts them if they die; detects "PS5 started publishing" from the MediaMTX log; serves the dashboard on `127.0.0.1:8787` with a small JSON API. |
| Relay | FFmpeg, started by the orchestrator | Copies the PS5's stream without re-encoding to `rtmp://<PC>:1935/ps5/game` while the PS5 broadcasts. |
| Common helpers | `apps\common` | LAN IP detection, `.env` reading. |
| Scripts | `scripts` | `setup`, `doctor`, `start`, `stop`, `firewall`, `install-autostart`, OBS scene generator. |

Configs are **generated at every start** from the `.tpl` files by replacing `__PC_IP__`, so nothing machine-specific is committed. Edit the templates, not the generated files.

## Why a relay instead of reading the PS5's own path?

The PS5's publish path contains a secret key and a device-specific id, and you do not want that in an OBS scene file. The relay gives OBS one stable, key-free URL. The orchestrator masks the PS5's key in everything it logs or shows.

The gateway never publishes anywhere else. Twitch only ever receives video from OBS, when you press Start Streaming.

## Dashboard API

| Request | Result |
|---|---|
| `GET /` | the dashboard page |
| `GET /api/status` | JSON state: PS5 activity, relay stats, services, network, events |
| `GET /events` | the same state as a server-sent event stream (1 per second) |
| `POST /api/restart/dns` or `/ingest` | restarts that service; needs header `x-token` with the value from `.token` |

The server answers only requests whose `Host` is `127.0.0.1:8787` or `localhost:8787`.

## Data and secrets

| File | Contains | Committed |
|---|---|---|
| `.env` | the PC and PS5 addresses | no |
| `.token` | dashboard API token (owner-only permissions) | no |
| `config\Corefile`, `config\mediamtx.yml` | generated from the templates | no |
| `logs\` | service logs | no |

## Ports

| Port | Process | Bound to |
|---|---|---|
| 53 UDP/TCP | CoreDNS | LAN address |
| 1935 TCP | MediaMTX | LAN address |
| 8787 TCP | Orchestrator dashboard | 127.0.0.1 |

## Repository layout

```
apps/orchestrator   supervisor, relay and dashboard (TypeScript, no deps)
apps/common         shared helpers
config              Corefile.tpl, mediamtx.yml.tpl
scripts             setup, doctor, start/stop, firewall, autostart, OBS scenes
tests               unit tests (npm test)
docs                guides
```
