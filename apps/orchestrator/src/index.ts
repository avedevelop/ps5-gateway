import { createServer, type ServerResponse } from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, loadEnv } from './env.ts';
import { mask, addSecret } from './mask.ts';
import { Service } from './service.ts';
import { detectLanIp } from '../../common/lanip.mjs';

// PS5 Gateway orchestrator: runs the DNS redirect (CoreDNS) and the RTMP ingest (MediaMTX), watches them,
// and relays the PS5's stream to a stable local address for OBS: rtmp://<PC>:1935/ps5/game
const DRY = process.argv.includes('--dry'); // dashboard and observation only, no processes are started
const env = loadEnv();
const PC_IP = detectLanIp(env.PC_LAN_IP);
const PS5_IP = (env.PS5_IP ?? '').trim();
if (!PC_IP) { console.error('Could not detect the PC LAN address. Set PC_LAN_IP in .env (see .env.example).'); process.exit(1); }
if (!PS5_IP) console.error('PS5_IP is not set in .env: the gateway cannot tell which device is the PS5. Run "node scripts/setup.mjs" or see docs/INSTALL.md.');

// Generate the DNS and RTMP configs from templates, so nothing machine-specific lives in the repository.
function renderConfigs(): void {
  for (const f of ['Corefile', 'mediamtx.yml']) {
    const tpl = readFileSync(resolve(ROOT, 'config', `${f}.tpl`), 'utf8');
    writeFileSync(resolve(ROOT, 'config', f), tpl.replaceAll('__PC_IP__', PC_IP));
  }
}
renderConfigs();
const PORT = Number(process.argv.find((a) => a.startsWith('--port='))?.slice(7) ?? 8787); // --port=NNNN: a second instance for checks, with --dry
const LOGS = resolve(ROOT, 'logs');
mkdirSync(LOGS, { recursive: true });
const RELAY_URL = `rtmp://${PC_IP}:1935/ps5/game`;

function isRunning(image: string): boolean {
  const out = execFileSync('tasklist', ['/fi', `imagename eq ${image}`, '/fo', 'csv', '/nh'], { encoding: 'utf8' });
  return out.toLowerCase().includes(image.toLowerCase());
}
if (!DRY) {
  const busy = ['coredns.exe', 'mediamtx.exe'].filter(isRunning);
  if (busy.length) {
    console.error(`Already running: ${busy.join(', ')}. Stop them first (scripts\\stop.ps1), or start with --dry.`);
    process.exit(1);
  }
}

// ---------- state ----------
const st = {
  publishing: false,
  publishPath: '',
  publishSince: 0,
  ps5LastDns: 0,
  ps5LastHost: '',
  spoofHits: 0,
  spoofLast: 0,
  ff: { fps: 0, bitrateKbps: 0, speed: 0, drop: 0, dup: 0, frames: 0, at: 0 },
  net: { ips: [] as string[], ipOk: true, ps5Reachable: false, ps5CheckedAt: 0 },
  events: [] as { t: number; msg: string }[],
};
function ev(msg: string): void {
  st.events.unshift({ t: Date.now(), msg: mask(msg) });
  st.events.length = Math.min(st.events.length, 30);
}

// ---------- services ----------
const dns = new Service({
  name: 'dns',
  cmd: resolve(ROOT, 'bin/coredns/coredns.exe'),
  args: () => ['-conf', resolve(ROOT, 'config/Corefile')],
  cwd: resolve(ROOT, 'bin/coredns'),
  logFile: resolve(LOGS, 'dns.log'),
  restartDelayMs: 3000,
  onLine: (l) => {
    const m = /^\[INFO\] ([\d.]+):\d+ - \d+ "\w+ IN (\S+) /.exec(l);
    if (!m) return true;
    if (m[1] !== PS5_IP) return false; // other devices' lookups are not logged
    st.ps5LastDns = Date.now();
    st.ps5LastHost = m[2]!;
    const spoofed = /contribute\.live-video\.net\.$/.test(m[2]!);
    if (spoofed) {
      st.spoofHits++;
      st.spoofLast = Date.now();
    }
    return spoofed || /twitch/.test(m[2]!); // the rest (PSN, games) is not logged
  },
});

function onPublish(path: string): void {
  st.publishing = true;
  st.publishPath = path;
  st.publishSince = Date.now();
  addSecret(path.split('/').pop() ?? ''); // the PS5's own key is masked everywhere
  ev('PS5 started broadcasting');
  if (!DRY) setTimeout(() => { if (st.publishing) relay.start(); }, 1500);
}
function onUnpublish(): void {
  if (!st.publishing) return;
  st.publishing = false;
  ev('PS5 stopped broadcasting');
  relay.stop();
}

const ingest = new Service({
  name: 'ingest',
  cmd: resolve(ROOT, 'bin/mediamtx/mediamtx.exe'),
  args: () => [resolve(ROOT, 'config/mediamtx.yml')],
  cwd: resolve(ROOT, 'bin/mediamtx'),
  logFile: resolve(LOGS, 'ingest.log'),
  restartDelayMs: 3000,
  onLine: (l) => {
    let m = /\[RTMP\] \[conn ([\d.]+):\d+\] is publishing to path '([^']+)'/.exec(l);
    if (m && m[1] === PS5_IP) onPublish(m[2]!);
    m = /\[RTMP\] \[conn ([\d.]+):\d+\] closed/.exec(l);
    if (m && m[1] === PS5_IP) onUnpublish();
    return true;
  },
});

// Copies (no re-encoding) the PS5's stream to the fixed local address OBS reads. Nothing is sent to Twitch from here.
const relay = new Service({
  name: 'relay',
  cmd: resolve(ROOT, 'bin/ffmpeg/ffmpeg.exe'),
  args: () => [
    '-hide_banner', '-loglevel', 'warning', '-stats', '-rw_timeout', '15000000',
    '-i', `rtmp://${PC_IP}:1935/${st.publishPath}`,
    '-c', 'copy', '-f', 'flv', '-flvflags', 'no_duration_filesize',
    RELAY_URL,
  ],
  cwd: resolve(ROOT, 'bin/ffmpeg'),
  logFile: resolve(LOGS, 'relay.log'),
  restartDelayMs: 3000,
  onLine: (l) => {
    const m = /frame=\s*(\d+)\s+fps=\s*([\d.]+).*?bitrate=\s*([\d.]+)kbits\/s.*?speed=\s*([\d.]+)x/.exec(l);
    if (!m) return true;
    st.ff.frames = Number(m[1]);
    st.ff.fps = Number(m[2]);
    st.ff.bitrateKbps = Number(m[3]);
    st.ff.speed = Number(m[4]);
    st.ff.drop = Number(/drop=\s*(\d+)/.exec(l)?.[1] ?? 0);
    st.ff.dup = Number(/dup=\s*(\d+)/.exec(l)?.[1] ?? 0);
    st.ff.at = Date.now();
    return false; // progress lines are not logged
  },
});

// ---------- network watch ----------
function checkNet(): void {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  const ok = ips.includes(PC_IP);
  if (st.net.ipOk && !ok) {
    const near = ips.filter((a) => a.startsWith(PC_IP.split('.').slice(0, 3).join('.') + '.'));
    ev(`PC address changed! Expected ${PC_IP}, now ${near.join(', ') || ips.join(', ')}. Update the PS5's DNS and restart the gateway.`);
  }
  st.net.ips = ips;
  st.net.ipOk = ok;
}
function pingPs5(): void {
  if (!PS5_IP) return;
  execFile('ping', ['-n', '1', '-w', '1000', PS5_IP], { encoding: 'utf8' }, (_e, out) => {
    st.net.ps5Reachable = /TTL=/i.test(out ?? '');
    st.net.ps5CheckedAt = Date.now();
  });
}
checkNet();
pingPs5();
setInterval(checkNet, 30_000);
setInterval(pingPs5, 15_000);

// ---------- HTTP ----------
const token = randomBytes(16).toString('hex');
// the token lets local scripts act on the dashboard API; the file is git-ignored and readable only by your Windows user
const tokenFile = resolve(ROOT, '.token');
if (!DRY) { // in --dry (a second instance on another port) the running orchestrator's token file is left alone
  writeFileSync(tokenFile, token, 'utf8');
  try { execFileSync('icacls', [tokenFile, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(R,W)`], { stdio: 'ignore' }); } catch {}
}
const page = () => readFileSync(resolve(ROOT, 'apps/orchestrator/public/index.html'), 'utf8').replace('__TOKEN__', token);

function svcInfo(s: Service) {
  return {
    name: s.name,
    state: s.state,
    pid: s.pid,
    restarts: s.restarts,
    uptimeS: s.pid ? Math.floor((Date.now() - s.startedAt) / 1000) : 0,
    lastExit: s.lastExit,
  };
}
function snapshot() {
  const now = Date.now();
  return {
    now,
    dry: DRY,
    relayUrl: RELAY_URL,
    live: st.publishing && relay.state === 'running' && now - st.ff.at < 5000, // PS5 is publishing and the relay is delivering frames
    publishing: st.publishing,
    publishSinceS: st.publishing ? Math.floor((now - st.publishSince) / 1000) : 0,
    ff: st.ff,
    ps5: { ip: PS5_IP, reachable: st.net.ps5Reachable, lastDns: st.ps5LastDns, lastHost: st.ps5LastHost, spoofHits: st.spoofHits, spoofLast: st.spoofLast },
    net: { pcIp: PC_IP, ipOk: st.net.ipOk, ips: st.net.ips },
    services: [dns, ingest, relay].map(svcInfo),
    events: st.events,
  };
}

const clients = new Set<ServerResponse>();
const server = createServer((req, res) => {
  const host = req.headers.host ?? '';
  if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) {
    res.writeHead(403).end('forbidden');
    return;
  }
  const url = req.url ?? '/';
  if (req.method === 'GET' && url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(page());
    return;
  }
  if (req.method === 'GET' && url === '/api/status') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(snapshot()));
    return;
  }
  if (req.method === 'GET' && url === '/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  const m = /^\/api\/restart\/(dns|ingest)$/.exec(url);
  if (req.method === 'POST' && m) {
    if (req.headers['x-token'] !== token) {
      res.writeHead(403).end('bad token');
      return;
    }
    if (DRY) {
      res.writeHead(409).end('dry mode');
      return;
    }
    const svc = m[1] === 'dns' ? dns : ingest;
    ev(`Manual restart: ${svc.name}`);
    svc.restart();
    res.writeHead(204).end();
    return;
  }
  res.writeHead(404).end('not found');
});
server.listen(PORT, '127.0.0.1', () => console.log(`Dashboard: http://127.0.0.1:${PORT}${DRY ? '  (dry mode)' : ''}`));
setInterval(() => {
  const data = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const c of clients) c.write(data);
}, 1000);

// ---------- start and stop ----------
if (!DRY) {
  dns.start();
  ingest.start();
  ev('Orchestrator started');
}
function shutdown(): void {
  relay.stop();
  ingest.stop();
  dns.stop();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
