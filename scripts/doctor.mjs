// Diagnoses a PS5 Gateway installation. Changes nothing.
//   node scripts/doctor.mjs
// Prints [ok] / [warn] / [FAIL] lines with the fix for each problem. Paste the output into an issue or to an AI assistant.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';
import net from 'node:net';
import { detectLanIp } from '../apps/common/lanip.mjs';
import { readEnvFiles } from '../apps/common/envfile.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, warns = 0;
const ok = (m) => console.log(`[ok]   ${m}`);
const warn = (m, fix) => { warns++; console.log(`[warn] ${m}${fix ? `\n         fix: ${fix}` : ''}`); };
const bad = (m, fix) => { fails++; console.log(`[FAIL] ${m}${fix ? `\n         fix: ${fix}` : ''}`); };
const tcp = (host, port, ms = 1500) => new Promise((res) => { const s = net.connect({ host, port, timeout: ms }); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); s.on('timeout', () => { s.destroy(); res(false); }); });

const env = readEnvFiles(ROOT, ['.env']);
console.log(`PS5 Gateway doctor  (node ${process.version}, ${process.platform})\n`);

// --- files
for (const [n, p] of [['MediaMTX', 'bin/mediamtx/mediamtx.exe'], ['CoreDNS', 'bin/coredns/coredns.exe'], ['FFmpeg', 'bin/ffmpeg/ffmpeg.exe']])
  existsSync(join(ROOT, p)) ? ok(`${n} present`) : bad(`${n} missing (${p})`, 'node scripts/setup.mjs');
if (!existsSync(join(ROOT, '.env'))) bad('.env missing', 'node scripts/setup.mjs');

// --- addresses
const pc = detectLanIp(env.PC_LAN_IP);
pc ? ok(`PC address ${pc}${env.PC_LAN_IP ? ' (from .env)' : ' (auto-detected)'}`) : bad('no LAN address for this PC', 'connect to your home network or set PC_LAN_IP in .env');
const ps5 = (env.PS5_IP ?? '').trim();
/^\d{1,3}(\.\d{1,3}){3}$/.test(ps5) ? ok(`PS5 address ${ps5}`) : bad('PS5_IP is not set in .env', 'PS5: Settings > Network > View Connection Status, then put the IPv4 address into .env as PS5_IP=');
if (pc && ps5 && pc.split('.').slice(0, 3).join('.') !== ps5.split('.').slice(0, 3).join('.')) warn(`PC (${pc}) and PS5 (${ps5}) look like different subnets`, 'both must be on the same router/network');
if (ps5) { try { execFileSync('ping', ['-n', '1', '-w', '1500', ps5], { stdio: 'ignore' }); ok('PS5 answers ping'); } catch { warn('PS5 does not answer ping', 'normal if the PS5 is off or in rest mode with network off'); } }

// --- name resolution speed on this PC (a VPN adapter with dead DNS makes OBS/Twitch API calls time out)
{ const t0 = Date.now(); try { await dns.promises.lookup('id.twitch.tv'); const ms = Date.now() - t0; ms > 3000 ? warn(`resolving id.twitch.tv took ${ms} ms on this PC`, 'a VPN or virtual adapter with unreachable DNS is first in line; disable or remove it (see docs/TROUBLESHOOTING.md)') : ok(`name resolution is fast (${ms} ms)`); } catch (e) { warn(`cannot resolve id.twitch.tv: ${e.code ?? e.message}`, 'check your internet connection'); } }

// --- gateway services
const dash = await tcp('127.0.0.1', 8787);
if (!dash) warn('the gateway is not running (dashboard port 8787 closed)', 'powershell -ExecutionPolicy Bypass -File scripts\\start.ps1');
else {
  ok('orchestrator running (dashboard :8787)');
  if (pc) {
    (await tcp(pc, 1935)) ? ok(`RTMP ingest listening on ${pc}:1935`) : bad(`nothing listens on ${pc}:1935`, 'see logs\\ingest.log; another program may use port 1935');
    const r = new dns.promises.Resolver({ timeout: 2000, tries: 1 }); r.setServers([pc]);
    try {
      const a = await r.resolve4('ingest.global-contribute.live-video.net');
      a[0] === pc ? ok(`DNS spoof works: ingest.global-contribute.live-video.net -> ${a[0]}`) : bad(`DNS returns ${a[0]} instead of ${pc} for the Twitch ingest name`, 'check config\\Corefile and restart the gateway');
    } catch (e) { bad(`DNS server on ${pc}:53 does not answer (${e.code})`, 'run scripts\\firewall.ps1 as Administrator; make sure no other program (e.g. Windows ICS, Docker) uses port 53'); }
    try { const g = await r.resolve4('example.com'); g.length ? ok('DNS forwards normal names (PS5 keeps its internet)') : warn('DNS returned nothing for example.com'); } catch { warn('DNS forwarding failed for example.com', 'check that the PC has internet access'); }
  }
  try {
    const token = readFileSync(join(ROOT, '.token'), 'utf8').trim();
    const s = await (await fetch('http://127.0.0.1:8787/api/status', { headers: { 'x-token': token } })).json();
    s.ps5?.lastDns ? ok(`PS5 has asked this DNS (spoofed lookups: ${s.ps5.spoofHits})`) : warn('the PS5 has not used this DNS yet', 'on the PS5 set Primary DNS to the PC address (docs/INSTALL.md step 4), then start Broadcast');
  } catch { /* status is optional */ }
}

// --- OBS
const obsDir = join(process.env.APPDATA ?? '', 'obs-studio', 'basic', 'scenes');
existsSync(join(obsDir, 'PS5.json')) ? ok('OBS scene collection "PS5" exists') : warn('OBS scene collection "PS5" not created yet', `node scripts/make-obs-scenes.mjs ${pc || '<PC IP>'} <twitch login>`);

console.log(`\n${fails} failure(s), ${warns} warning(s).`);
process.exit(fails ? 1 : 0);
