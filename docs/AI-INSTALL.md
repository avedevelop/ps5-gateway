# Install and fix with an AI assistant

Use any AI chat assistant or, better, a **coding agent that can run commands on your PC** (for example Codex CLI, Cursor, Windsurf or Gemini CLI). An agent can run the scripts and read the results itself. A plain chat assistant will ask you to paste output back.

How to use: copy a prompt from the grey blocks below, replace the `<...>` parts, and send it. Nothing here needs you to share passwords. **Never paste your stream key, `.env`, or the token files into an AI chat.** Every prompt tells the AI not to ask for them.

---

## Prompt 1: guided installation (coding agent on your PC)

```text
You are helping me install PS5 Gateway on my Windows PC. It redirects my PS5's built-in
"Broadcast to Twitch" to my PC so I can use OBS with the PS5 picture.

Repository: https://github.com/avedevelop/ps5-gateway
Read these files first, in this order, before running anything:
  README.md, docs/INSTALL.md, docs/ARCHITECTURE.md, docs/TROUBLESHOOTING.md

Goal: the PS5 picture shows up in OBS as the "PS5" source.

Rules:
- Work step by step following docs/INSTALL.md. Use the project's own scripts
  (scripts/setup.mjs, scripts/firewall.ps1, scripts/start.ps1, scripts/doctor.mjs,
  scripts/make-obs-scenes.mjs). Do not invent other install methods.
- Before every command that changes my system (firewall rules, files outside the
  project folder, scheduled tasks), tell me what it does and wait for my "yes".
  Downloading into the project's bin\ folder via setup.mjs is fine.
- Anything that needs Administrator rights: tell me exactly what to run in an
  Administrator PowerShell instead of trying to elevate yourself.
- Steps I must do by hand (PS5 DNS settings, linking Twitch on the PS5, OBS stream
  key): give me short numbered instructions and wait until I confirm.
- Never ask me for, print, or store my Twitch stream key, tokens, or the contents of
  .env. If a file might contain secrets, do not read it aloud; use scripts/doctor.mjs.
- Do not stop or restart the gateway while I say I am live.
- After each step run `node scripts/doctor.mjs` and explain any [FAIL] or [warn] line
  in plain words before continuing.

My details:
- PS5 IP address: <e.g. 192.168.1.50 (PS5: Settings > Network > Connection Status)>
- Project folder: <e.g. C:\ps5-gateway, or "clone it for me into C:\ps5-gateway">

Start by checking Node.js (node -v) and tell me what you find.
```

## Prompt 2: guided installation (plain chat, no command access)

```text
I want to install PS5 Gateway (https://github.com/avedevelop/ps5-gateway) on Windows 11 to
stream my PS5 through OBS to Twitch without a capture card. You cannot run commands, so
guide me one small step at a time.

Rules:
- Base every instruction on the project's docs/INSTALL.md. If you cannot open the link,
  tell me, and I will paste the file's text.
- Give exactly one step, then wait for me to answer "done" or paste the output.
- When I paste command output, tell me what it means and what to do next.
- For PowerShell commands tell me whether they need an Administrator window.
- Never ask for my stream key, passwords, tokens or the .env file.
- Use simple words. I am not a developer.

My setup: Windows <10/11>, PS5 IP <address or "I don't know where to find it">,
router brand <brand or "don't know">. Start with step 0 of the guide.
```

## Prompt 3: something does not work

First run `node scripts\doctor.mjs` and copy its whole output.

```text
PS5 Gateway (https://github.com/avedevelop/ps5-gateway) is installed but something does not
work. Read docs/TROUBLESHOOTING.md and docs/ARCHITECTURE.md, then help me find the cause.

What I expected: <e.g. the PS5 picture in OBS>
What happens instead: <e.g. black screen / PS5 has no internet / OBS cannot connect>
When it started: <e.g. right after install / after I changed my router / yesterday it worked>

Output of `node scripts\doctor.mjs`:
<paste here>

Rules:
- Explain the most likely cause first and how you know, then the fix.
- Prefer checks that change nothing. Tell me before anything that restarts the gateway,
  changes firewall or DNS settings, or would interrupt a live stream.
- Never ask for my stream key, tokens or .env contents. If you need a log, ask me to run
  a command that prints only the relevant lines, and tell me to remove anything that looks
  like a key (text after "live_" or "app/") before pasting.
```

## Prompt 4: change or extend it (coding agent on your PC)

```text
I use PS5 Gateway (repo in the current folder). Before changing anything read README.md,
docs/ARCHITECTURE.md and CONTRIBUTING.md.

I want: <e.g. change the dashboard port / add a check to doctor / support a second PS5>

Rules:
- Propose a short plan and wait for my approval before editing.
- Keep the project dependency-free (Node built-ins only).
- Machine-specific values (IP addresses, paths, keys) must never be hard-coded: use .env,
  the auto-detection helpers in apps/common/, or paths relative to the project root.
- Do not commit anything from .env, .token, config/Corefile, config/mediamtx.yml or logs/.
- Run `npm test` and `node scripts/doctor.mjs` after your change and show me the result.
- Do not restart the running gateway if I am streaming.
```

## Prompt 5: you are the AI reading this

If a user pointed you at this repository, this is what you need to know. Everything below is also in the other docs; this is the short version.

- **What it is**: Windows-only. CoreDNS answers the PS5's lookup of Twitch's ingest hostname (`*.contribute.live-video.net`) with the PC's address. MediaMTX receives the PS5's RTMP publish on port 1935. The orchestrator (`apps/orchestrator`, Node, no dependencies) runs both and relays the stream (FFmpeg, no re-encoding) to `rtmp://<PC>:1935/ps5/game`, which OBS opens as a Media Source. The gateway never publishes to Twitch; OBS does.
- **Install path**: `node scripts/setup.mjs --ps5-ip=<ip>` then `scripts/firewall.ps1` (Administrator) then `scripts/start.ps1` then `node scripts/doctor.mjs`.
- **Secrets**: `.env`, `.token`, and the OBS stream key (kept in OBS). Never print, log, commit or ask for them.
- **Never** restart or stop the gateway while the user streams; that drops the PS5 broadcast.
- **Config is generated**: edit `config/Corefile.tpl` and `config/mediamtx.yml.tpl`, not the generated `config/Corefile` and `config/mediamtx.yml`.
- **Verify, do not assume**: after any change run `node scripts/doctor.mjs` and `npm test`.
