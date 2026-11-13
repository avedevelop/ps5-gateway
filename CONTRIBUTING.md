# Contributing

Thanks for wanting to help. This is a hobby project, so reviews can be slow, but every issue and pull request is read.

## Good first contributions

- Try it on other hardware or Windows versions and report what happens.
- Improve the documentation wherever a step confused you.
- Make the dashboard (`apps/orchestrator/public/index.html`) nicer or add a language.
- Extend `scripts/doctor.mjs` with a check that would have saved you time.

## Ground rules

- **No npm dependencies.** The project runs on Node built-ins only. If you think a package is truly needed, open an issue first.
- **Nothing machine-specific in the repository**: no IP addresses, usernames, absolute paths or keys. Use `.env`, `apps/common/lanip.mjs`, or paths relative to the project root.
- **Secrets never leave your machine.** Check `git status` and `git diff --cached` before committing. `.env`, `.env.*`, `.token`, `logs/`, `bin/` and the generated `config/Corefile` and `config/mediamtx.yml` are ignored on purpose.
- **Scripts in `scripts/*.ps1` are ASCII.** Windows PowerShell 5.1 reads UTF-8 files without a BOM as ANSI and mangles other characters. Keep messages in English.
- **Do not restart the gateway while someone is live**; it ends the PS5 broadcast. Test with `--dry` as described below.

## Development setup

```powershell
git clone https://github.com/avedevelop/ps5-gateway.git
cd ps5-gateway
node scripts\setup.mjs --ps5-ip=<your PS5 IP>
npm test
node scripts\doctor.mjs
```

`npm test` runs fast unit tests (`tests/core.test.mjs`) with no network and no running gateway.

To try dashboard changes without touching a running gateway, start a second orchestrator in dry mode on another port: `cd apps\orchestrator; node src/index.ts --dry --port=8799`. It serves the dashboard but starts no DNS, ingest or relay.

## Pull requests

- One change per pull request, with a short description of what and why.
- Add or update a test in `tests/` when you change logic that can be tested without hardware.
- Run `npm test` before opening the PR.
- Say what you tested by hand and on what hardware. "Not tested on a real PS5" is a fine thing to write.

## Code style

Plain modern JavaScript (ES modules) and TypeScript that Node can run by stripping types (no enums, no namespaces, no parameter properties). Small functions, comments that explain why rather than what.

## License

By contributing you agree that your work is released under the [PolyForm Noncommercial License 1.0.0](LICENSE), the same as the project.
