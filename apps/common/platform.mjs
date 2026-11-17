// Everything that differs between Windows and macOS lives here, so the rest of the code stays platform-neutral.
import { existsSync, chmodSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join, delimiter } from 'node:path';
import { homedir } from 'node:os';

export const WIN = process.platform === 'win32';
export const MAC = process.platform === 'darwin';
export const SUPPORTED = WIN || MAC;

/** File name of a helper program: "coredns.exe" on Windows, "coredns" elsewhere. */
export const exeName = (name, win = WIN) => (win ? `${name}.exe` : name);

/** Path of a downloaded helper inside bin/, e.g. bin/mediamtx/mediamtx(.exe). */
export const toolPath = (root, name) => join(root, 'bin', name, exeName(name));

/**
 * FFmpeg: the copy in bin/ffmpeg wins. On macOS there is no official build to download, so a system FFmpeg
 * (Homebrew) is used. Fixed locations are checked first because launchd starts programs with a minimal PATH.
 * Returns '' when nothing is found.
 */
export function findFfmpeg(root) {
  const own = toolPath(root, 'ffmpeg');
  if (existsSync(own)) return own;
  if (WIN) return '';
  const dirs = ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', ...(process.env.PATH ?? '').split(delimiter)];
  for (const d of dirs) { if (d && existsSync(join(d, 'ffmpeg'))) return join(d, 'ffmpeg'); }
  return '';
}

/** Is a process with this base name (no .exe) running? */
export function isRunning(name) {
  try {
    if (WIN) {
      const image = exeName(name);
      const out = execFileSync('tasklist', ['/fi', `imagename eq ${image}`, '/fo', 'csv', '/nh'], { encoding: 'utf8' });
      return out.toLowerCase().includes(image.toLowerCase());
    }
    execFileSync('pgrep', ['-x', name], { stdio: 'ignore' }); // exit code 1 (throws) when nothing matches
    return true;
  } catch { return false; }
}

/** Options for spawn(): on macOS the child leads its own process group, so killTree can end its descendants too. */
export const spawnOpts = () => (WIN ? { windowsHide: true } : { detached: true });

/** Ends a process started with spawnOpts() together with its descendants. */
export function killTree(child) {
  const pid = child?.pid;
  if (!pid) return;
  if (WIN) {
    // child.kill() on Windows ends only the process itself; taskkill /T also ends its descendants
    try { spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill()); }
    catch { child.kill(); }
    return;
  }
  try { process.kill(-pid, 'SIGTERM'); } catch { try { child.kill(); } catch {} }
}

/** Arguments for one ping with a timeout in milliseconds. */
export function pingArgs(ip, ms, platform = process.platform) {
  if (platform === 'win32') return ['-n', '1', '-w', String(ms), ip];
  if (platform === 'darwin') return ['-c', '1', '-W', String(ms), ip];   // macOS: -W is in milliseconds
  return ['-c', '1', '-W', String(Math.max(1, Math.ceil(ms / 1000))), ip]; // Linux: -W is in seconds
}

/** Makes a file readable and writable by the current user only. */
export function restrictFile(file) {
  try {
    if (WIN) execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(R,W,D)`], { stdio: 'ignore' });
    else chmodSync(file, 0o600);
  } catch {}
}

/** Folder where OBS keeps its scene collections. */
export function obsScenesDir(platform = process.platform, home = homedir(), appData = process.env.APPDATA ?? '') {
  if (platform === 'win32') return join(appData, 'obs-studio', 'basic', 'scenes');
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'obs-studio', 'basic', 'scenes');
  return join(home, '.config', 'obs-studio', 'basic', 'scenes');
}

/** How to start / stop the gateway, for messages shown to the user. */
export const startCmd = () => (WIN ? 'powershell -ExecutionPolicy Bypass -File scripts\\start.ps1' : 'sh scripts/start.sh');
export const stopCmd = () => (WIN ? 'powershell -ExecutionPolicy Bypass -File scripts\\stop.ps1' : 'sh scripts/stop.sh');

/**
 * Fills a config template.
 *
 * Windows: the services bind to the PC's LAN address and Windows Firewall admits only the PS5 (scripts/firewall.ps1).
 *
 * macOS: an unprivileged process may open port 53 only on the wildcard address, and there is no per-port firewall
 * to lean on. So CoreDNS listens on all interfaces and answers only the PS5 and this computer (acl plugin), and
 * MediaMTX accepts RTMP connections only from those same addresses.
 */
export const DEFAULT_UPSTREAM = '1.1.1.1 8.8.8.8';

/** UPSTREAM_DNS from .env: one to four IPv4 resolvers separated by spaces or commas. Anything else falls back to the default. */
export function parseUpstream(value) {
  const list = String(value ?? '').split(/[\s,]+/).filter(Boolean);
  const ok = list.length >= 1 && list.length <= 4 && list.every((a) => /^(\d{1,3}\.){3}\d{1,3}$/.test(a) && a.split('.').every((n) => Number(n) <= 255));
  return ok ? list.join(' ') : DEFAULT_UPSTREAM;
}

/** DNS_CACHE_TTL from .env: seconds, 0 to 3600. Anything else falls back to 30. */
export function parseCacheTtl(value) {
  const t = String(value ?? '').trim();
  return /^\d{1,4}$/.test(t) && Number(t) <= 3600 ? t : '30';
}
/** MTX_LOG_LEVEL from .env: error, warn, info or debug. Anything else falls back to debug (the current behaviour). */
export function parseLogLevel(value) {
  const t = String(value ?? '').trim().toLowerCase();
  return ['error', 'warn', 'info', 'debug'].includes(t) ? t : 'debug';
}

export function renderConfig(name, tpl, { pcIp, ps5Ip = '', win = WIN, upstream = DEFAULT_UPSTREAM, cacheTtl = '30', logLevel = 'debug' }) {
  let out = tpl;
  if (name === 'Corefile') out = out.replace(/^([ \t]*cache) \d+[ \t]*$/m, `$1 ${parseCacheTtl(cacheTtl)}`);
  if (name === 'mediamtx.yml') out = out.replace(/^logLevel: .*$/m, `logLevel: ${parseLogLevel(logLevel)}`);
  if (name === 'Corefile') out = out.replace(/^([ \t]*forward \.) .*$/m, `$1 ${parseUpstream(upstream)}`);
  if (!win) {
    const allowed = [...new Set([ps5Ip, pcIp, '127.0.0.1'].filter(Boolean))];
    if (name === 'Corefile') {
      out = out.replace(/^([ \t]*)bind __PC_IP__[ \t]*$/gm, (_m, pad) =>
        [`${pad}acl {`, `${pad}    allow net ${allowed.join(' ')} ::1`, `${pad}    block`, `${pad}}`].join('\n'));
    }
    if (name === 'mediamtx.yml') {
      out = `${out.replace(/\s*$/, '\n')}authInternalUsers:\n- user: any\n  pass:\n  ips: [${allowed.map((a) => `'${a}'`).join(', ')}]\n  permissions:\n  - action: publish\n    path:\n  - action: read\n    path:\n`;
    }
  }
  return out.replaceAll('__PC_IP__', pcIp);
}
