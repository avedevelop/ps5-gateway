// Renders the screens of the desktop app (app/ui) to PNG files for the README and the guides.
//   node tools/screenshots.mjs [outDir] [lang,lang] [os,os]        defaults: docs/images, en,ru, win,mac
// It serves app/ui over http, opens it in a headless Chrome/Edge and answers the app's commands (Tauri `invoke`) with
// made-up data (192.168.1.x addresses), so no personal data ends up in the pictures. "os" only changes which wording
// of the interface is shown (see app/ui/os.js): the pictures are the interface itself, without a window frame.
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI = join(ROOT, 'app', 'ui');
const OUT = process.argv[2] || join(ROOT, 'docs', 'images');
const LANGS = (process.argv[3] || 'en,ru').split(',');
const OSES = (process.argv[4] || 'win,mac').split(',');
const W = 960, H = 636, SCALE = 2;

const browser = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));
if (!browser) { console.error('Chrome or Edge not found (set CHROME=path)'); process.exit(1); }

// ---- static server for app/ui
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const f = join(UI, p);
  if (p.includes('..') || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

// ---- headless browser + DevTools protocol
const profile = mkdtempSync(join(tmpdir(), 'ps5gw-shots-'));
const chrome = spawn(browser, ['--headless=new', '--remote-debugging-port=9333', `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl = '';
for (let i = 0; i < 50 && !wsUrl; i++) { try { wsUrl = (await (await fetch('http://127.0.0.1:9333/json')).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch { /* not up yet */ } if (!wsUrl) await sleep(200); }
if (!wsUrl) { chrome.kill(); throw new Error('browser did not start'); }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let nextId = 1; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = nextId++; pending.set(id, (d) => (d.error ? rej(new Error(method + ': ' + d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = (expression) => cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });

// ---- made-up answers of the program's commands
const PC = '192.168.1.20', PS5 = '192.168.1.50';
const status = (kind) => {
  const now = Date.now();
  if (kind === 'off') return null;
  const live = kind === 'live';
  return { now, dry: false, relayUrl: `rtmp://${PC}:1935/ps5/game`, live, publishing: live, publishSinceS: live ? 754 : 0,
    ff: { fps: live ? 60 : 0, bitrateKbps: live ? 6100 : 0, speed: live ? 1 : 0, drop: 0, dup: 0, frames: live ? 45240 : 0, at: now },
    ps5: { ip: PS5, reachable: true, lastDns: kind === 'wait-new' ? 0 : now - 20000, lastHost: live ? 'ingest.global-contribute.live-video.net.' : 'ps5.np.playstation.net.', recent: [], spoofHits: live ? 3 : 0, spoofLast: live ? now - 760000 : 0 },
    net: { pcIp: PC, ipOk: true, ips: [PC] },
    services: [{ name: 'dns', state: 'running', pid: 4120, restarts: 0, uptimeS: 3600, lastExit: '' }, { name: 'ingest', state: 'running', pid: 4121, restarts: 0, uptimeS: 3600, lastExit: '' }, { name: 'relay', state: live ? 'running' : 'stopped', pid: live ? 4300 : 0, restarts: 0, uptimeS: live ? 750 : 0, lastExit: '' }],
    events: [{ t: now - 760000, msg: 'PS5 started broadcasting' }, { t: now - 3600000, msg: 'Orchestrator started' }] };
};
const CHECK = `PS5 Gateway doctor  (node v24.12.0, win32)

[ok]   MediaMTX present
[ok]   CoreDNS present
[ok]   FFmpeg present
[ok]   PC address ${PC} (auto-detected)
[ok]   PS5 address ${PS5}
[ok]   PS5 answers ping
[ok]   name resolution is fast (8 ms)
[ok]   orchestrator running (dashboard :8787)
[ok]   RTMP ingest listening on ${PC}:1935
[ok]   DNS spoof works: ingest.global-contribute.live-video.net -> ${PC}
[ok]   DNS forwards normal names (PS5 keeps its internet)
[ok]   PS5 has asked this DNS (spoofed lookups: 3)
[ok]   OBS scene collection "PS5" exists
0 failure(s), 0 warning(s).`;

const MOCK_SRC = (o) => `
(() => {
  const sc = ${JSON.stringify(o)};
  const PC = '${PC}', PS5 = '${PS5}';
  const status = (${status.toString()});
  const CHECK = ${JSON.stringify(CHECK)};
  const inv = async (cmd, args) => {
    switch (cmd) {
      case 'read_env': return JSON.stringify(sc.firstRun ? { exists: false, pc: '', ps5: '', upstream: '', keepAwake: true, cacheTtl: '', logLevel: '' } : { exists: true, pc: '${PC}', ps5: '${PS5}', upstream: '', keepAwake: true, cacheTtl: '', logLevel: '' });
      case 'detect_apps': return JSON.stringify({ obs: true, streamlabs: false });
      case 'gateway_status': { const s = status(sc.state); if (!s) throw new Error('offline'); return JSON.stringify(s); }
      case 'run_check': return CHECK;
      case 'collect_diagnostics': return '=== Computer ===\\nWindows 11\\n\\n=== Network ===\\n(addresses hidden)';
      case 'app_version': return '1.2.0';
      case 'autostart_state': return true;
      case 'update_check': throw new Error('offline');
      case 'setup_progress': return sc.progress ? JSON.stringify(sc.progress) : '';
      case 'run_setup': return new Promise(() => {});
      case 'firewall_setup': return 'ok';
      default: return '';
    }
  };
  window.__TAURI__ = { core: { invoke: inv } };
  try { localStorage.setItem('val-lang', sc.lang); localStorage.setItem('program', 'obs'); } catch (_) {}
})();`;

const SHOTS = [
  { name: 'welcome', first: true, run: "show('ob1')" },
  { name: 'program', first: true, run: "show('ob2')" },
  { name: 'address', first: true, run: "$('#ps5ip').value = '192.168.1.50'; show('ob3')" },
  { name: 'installing', first: true, progress: { name: 'FFmpeg', index: 3, of: 3, phase: 'download', p: 0.62, received: 70_000_000, total: 114_768_076 }, run: "$('#ps5ip').value = '192.168.1.50'; show('ob4'); install()", wait: 900 },
  { name: 'dns', run: "show('ob5')" },
  { name: 'done', run: "show('ob6')" },
  { name: 'home-waiting', state: 'wait', run: "show('home')" },
  { name: 'home-live', state: 'live', run: "show('home')" },
  { name: 'home-silent', state: 'wait-new', run: "show('home')", before: "status && (status.services.find((s) => s.name === 'dns').uptimeS = 3600)" },
  { name: 'guide', state: 'wait', run: "show('guide')" },
  { name: 'settings', state: 'wait', run: "show('settings')" },
  { name: 'check', state: 'wait', run: "await runCheck()" },
];

mkdirSync(OUT, { recursive: true });
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false });
let count = 0;
for (const os of OSES) {
  await cdp('Network.setUserAgentOverride', { userAgent: os === 'win' ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36' });
  for (const lang of LANGS) {
    for (const s of SHOTS) {
      const { identifier } = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: MOCK_SRC({ lang, firstRun: !!s.first, state: s.state || 'wait', progress: s.progress || null }) });
      await cdp('Page.navigate', { url: base + 'index.html' });
      await sleep(1600);
      await evalJs(`(async () => { try { await poll(); } catch (_) {} ${s.before || ''}; ${s.run}; if (typeof applyLang === 'function') applyLang(); })()`);
      await sleep(s.wait || 700);
      if (s.name === 'check') await sleep(500);
      const shot = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
      const file = join(OUT, `${os}-${lang}-${s.name}.png`);
      writeFileSync(file, Buffer.from(shot.data, 'base64')); count++;
      await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    }
  }
}
console.log(`${count} pictures in ${OUT}`);
ws.close(); chrome.kill(); server.close(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* still in use */ }
process.exit(0);
