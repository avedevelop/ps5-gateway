# Security

PS5 Gateway is a home-network hobby tool. It runs a DNS server and an RTMP server on your PC. Treat it accordingly.

## What to protect

| Secret | Where | Rule |
|---|---|---|
| Twitch stream key | OBS settings (the gateway never sees it) | Anyone with it can stream to your channel. Never share, post or commit it. If it leaks, reset it on Twitch. |
| PS5 publish path | in MediaMTX and relay logs | Contains the PS5's own key. The orchestrator masks it in its own output; check before pasting logs anywhere. |
| Dashboard token | `.token` | Gives access to the dashboard's restart API. Created with owner-only permissions. |

`.env` holds only network addresses. All of these files are listed in `.gitignore`. Run `git status` before every commit.

## Network exposure

- DNS (53) and RTMP (1935) are allowed through the Windows firewall **only from the PS5's address**, and bound to the PC's LAN address.
- The dashboard (8787) listens on `127.0.0.1` only and answers only requests addressed to `127.0.0.1` or `localhost`.
- Do not port-forward any of these ports on your router. Do not run this on a shared or public network, and do not tell other devices to use your PC as DNS.
- The DNS server answers only a small set of Twitch ingest names with the PC's address; everything else is forwarded to public resolvers (1.1.1.1 and 8.8.8.8).

## Downloads

`scripts\setup.mjs` fetches FFmpeg, MediaMTX and CoreDNS from their official release locations and verifies each file against the checksum published next to it before extracting. MediaMTX and CoreDNS are pinned to specific versions. FFmpeg publishes rolling builds, so its checksum is read from the same site at download time.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting (the **Security** tab of the repository, "Report a vulnerability"). Include what you found, how to reproduce it, and the version or commit. Expect an answer within about a week; this is a spare-time project.

If you accidentally published a key, rotate it first, then tell me.
