# Contributing

Thanks for wanting to help. This is a hobby project, so reviews can be slow, but every issue and pull request is read.

## Good first contributions

- Try it on other hardware, Windows versions or Macs and report what happens.
- Improve the documentation wherever a step confused you.
- Make the dashboard (`apps/orchestrator/public/index.html`) nicer or add a language.
- Extend `scripts/doctor.mjs` with a check that would have saved you time.

## Ground rules

- **No npm dependencies.** The project runs on Node built-ins only. If you think a package is truly needed, open an issue first.
- **Nothing machine-specific in the repository**: no IP addresses, usernames, absolute paths or keys. Use `.env`, `apps/common/lanip.mjs`, or paths relative to the project root.
- **Secrets never leave your machine.** Check `git status` and `git diff --cached` before committing. `.env`, `.env.*`, `.token`, `logs/`, `bin/` and the generated `config/Corefile` and `config/mediamtx.yml` are ignored on purpose.
- **Scripts in `scripts/*.ps1` are ASCII.** Windows PowerShell 5.1 reads UTF-8 files without a BOM as ANSI and mangles other characters. Keep messages in English.
- **Platform differences go into `apps/common/platform.mjs`**, not into `if (process.platform ...)` scattered around. A change must keep both Windows and macOS working; say in the pull request which one you could not test.
- **Do not restart the gateway while someone is live**; it ends the PS5 broadcast. Test with `--dry` as described below.

## Continuous integration

Every pull request runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

- **Unit tests** on Linux, Windows and macOS (`npm test`).
- **Shell and PowerShell lint**: ShellCheck for `*.sh` and the `.command` file, and a PowerShell parser pass over every `.ps1`.
- **Install and run** on a fresh Windows and a fresh macOS machine: the real installer runs, then `tests/smoke.mjs` publishes a test stream the way the PS5 would and checks the DNS redirect, the ingest, the relay address OBS reads, the services and that the stream key stays out of the logs. The runner plays the PS5, so no console is needed. You can run the same check on your own machine:

  ```
  node scripts/setup.mjs --yes --ps5-ip=<this computer's LAN address>
  node scripts/run.mjs start
  node tests/smoke.mjs
  node scripts/run.mjs stop
  ```

A release is made by pushing a tag: `git tag v1.2.3 && git push origin v1.2.3`. [`release.yml`](.github/workflows/release.yml) runs the tests and attaches the Windows zip and the macOS tar.gz (with checksums) to a GitHub release.

Installer rules: `*.ps1` and `*.cmd` stay ASCII (a test checks it), the macOS `.sh` and `.command` files keep their executable bit, and an installer must never change the system without asking (the `--yes` / `-Yes` flag is the only exception).

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
