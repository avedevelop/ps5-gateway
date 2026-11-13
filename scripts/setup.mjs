// PS5 Gateway one-step setup (Windows).
//   node scripts/setup.mjs                 interactive
//   node scripts/setup.mjs --yes --ps5-ip=192.168.1.50     no questions
//   node scripts/setup.mjs --check         only report what is missing, change nothing
//   node scripts/setup.mjs --no-download   do not fetch FFmpeg / MediaMTX / CoreDNS
// It downloads the three helper programs (checksum-verified), creates .env
// and tells you the exact PS5 DNS value. Safe to run again: existing files are never overwritten.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, rmSync, createWriteStream, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { lanCandidates, detectLanIp } from '../apps/common/lanip.mjs';
import { readEnvFiles } from '../apps/common/envfile.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const flag = (n) => process.argv.includes(`--${n}`);
const CHECK = flag('check'), YES = flag('yes') || CHECK, NODL = flag('no-download');
const ok = (m) => console.log(`  [ok]   ${m}`), warn = (m) => console.log(`  [warn] ${m}`), bad = (m) => { console.log(`  [FAIL] ${m}`); problems++; }, step = (m) => console.log(`\n== ${m}`);
let problems = 0;

// Pinned, tested versions. FFmpeg publishes only "latest" builds, so it is verified against the checksum published next to the file.
const TOOLS = [
  { name: 'MediaMTX', dir: 'bin/mediamtx', exe: 'mediamtx.exe', url: 'https://github.com/bluenviron/mediamtx/releases/download/v1.21.3/mediamtx_v1.21.3_windows_amd64.zip',
    sums: 'https://github.com/bluenviron/mediamtx/releases/download/v1.21.3/checksums.sha256', ext: 'zip' },
  { name: 'CoreDNS', dir: 'bin/coredns', exe: 'coredns.exe', url: 'https://github.com/coredns/coredns/releases/download/v1.15.0/coredns_1.15.0_windows_amd64.tgz',
    sums: 'https://github.com/coredns/coredns/releases/download/v1.15.0/coredns_1.15.0_windows_amd64.tgz.sha256', ext: 'tgz' },
  { name: 'FFmpeg', dir: 'bin/ffmpeg', exe: 'ffmpeg.exe', url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
    sums: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256', ext: 'zip', pick: ['ffmpeg.exe', 'ffprobe.exe'] },
];

async function download(url, file) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(file));
}
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])); }

async function install(t) {
  const dest = join(ROOT, t.dir);
  if (existsSync(join(dest, t.exe))) { ok(`${t.name} already installed`); return; }
  if (CHECK || NODL) { bad(`${t.name} is missing (${t.dir}\\${t.exe})`); return; }
  const tmp = join(ROOT, 'dl', t.name.toLowerCase());
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const file = join(tmp, `pkg.${t.ext}`);
  console.log(`  downloading ${t.name} ...`);
  await download(t.url, file);
  const want = (await (await fetch(t.sums)).text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const base = t.url.split('/').pop();
  const line = want.find((l) => l.includes(base)) ?? want[0];
  const expected = /[a-f0-9]{64}/i.exec(line)?.[0]?.toLowerCase();
  if (!expected) throw new Error(`no checksum found for ${t.name}`);
  const got = sha256(file);
  if (got !== expected) { rmSync(tmp, { recursive: true, force: true }); throw new Error(`${t.name}: checksum mismatch (got ${got.slice(0, 12)}..., expected ${expected.slice(0, 12)}...). Download aborted.`); }
  mkdirSync(dest, { recursive: true });
  const ex = join(tmp, 'x'); mkdirSync(ex);
  execFileSync(join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe'), ['-xf', file, '-C', ex], { stdio: 'ignore' });   // Windows' own bsdtar (reads zip and tgz); not a GNU tar from Git Bash
  if (t.pick) { for (const p of t.pick) { const f = walk(ex).find((x) => x.toLowerCase().endsWith(`\\bin\\${p}`)); if (f) copyFileSync(f, join(dest, p)); } }
  else for (const f of walk(ex)) copyFileSync(f, join(dest, f.split('\\').pop()));
  rmSync(tmp, { recursive: true, force: true });
  if (existsSync(join(dest, t.exe))) ok(`${t.name} installed (checksum verified)`); else bad(`${t.name}: ${t.exe} not found after extraction`);
}

console.log('PS5 Gateway setup');
step('1/4  Requirements');
if (process.platform !== 'win32') bad('Windows is required (the gateway uses Windows firewall, tasklist and PowerShell).'); else ok('Windows');
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj > 22 || (maj === 22 && min >= 18)) ok(`Node.js ${process.versions.node}`); else bad(`Node.js ${process.versions.node} is too old; install Node.js 24 LTS or newer (https://nodejs.org)`);

step('2/4  Helper programs (bin\\)');
for (const t of TOOLS) { try { await install(t); } catch (e) { bad(e.message); } }

step('3/4  Network');
const cands = lanCandidates();
if (!cands.length) bad('No private LAN address found. Connect the PC to your home network.');
else { ok('LAN addresses: ' + cands.map((c) => `${c.address} (${c.name}${c.virtual ? ', virtual' : ''})`).join(', ')); }
const env0 = readEnvFiles(ROOT, ['.env']);
const pcIp = detectLanIp(env0.PC_LAN_IP);
console.log(`  The PS5 must use ${pcIp || '<this PC IP>'} as its DNS server. Give the PC a fixed IP (DHCP reservation in the router).`);

step('4/4  Settings (.env)');
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) ok('.env exists, left untouched');
else if (CHECK) bad('.env is missing (run without --check)');
else {
  let ps5 = arg('ps5-ip') ?? '';
  if (!ps5 && !YES) { const rl = createInterface({ input: process.stdin, output: process.stdout }); ps5 = (await rl.question('  PS5 IP address (PS5: Settings > Network > View Connection Status): ')).trim(); rl.close(); }
  if (ps5 && !/^\d{1,3}(\.\d{1,3}){3}$/.test(ps5)) { warn(`"${ps5}" is not an IPv4 address; leaving PS5_IP empty`); ps5 = ''; }
  const tpl = readFileSync(join(ROOT, '.env.example'), 'utf8').replace(/^PC_LAN_IP=.*$/m, `PC_LAN_IP=${pcIp}`).replace(/^PS5_IP=.*$/m, `PS5_IP=${ps5}`);
  writeFileSync(envFile, tpl, 'utf8');
  try { execFileSync('icacls', [envFile, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(R,W)`], { stdio: 'ignore' }); } catch {}
  ok('.env created');
  if (!ps5) warn('PS5_IP is empty: edit .env and set it before starting.');
}
for (const d of ['logs']) if (!CHECK) mkdirSync(join(ROOT, d), { recursive: true });

step('Next');
console.log(`  1. Run (as Administrator, once):   powershell -ExecutionPolicy Bypass -File scripts\\firewall.ps1
  2. On the PS5 set the DNS of your network connection: Primary = ${pcIp || '<PC IP>'}, Secondary = 1.1.1.1
  3. Start the gateway:               powershell -ExecutionPolicy Bypass -File scripts\\start.ps1
  4. Panel:                           http://127.0.0.1:8787
  5. OBS scenes:                      node scripts\\make-obs-scenes.mjs ${pcIp || '<PC IP>'}
  Full guide: docs/INSTALL.md`);
console.log(problems ? `\n${problems} problem(s) found, see [FAIL] lines above.` : '\nSetup finished without problems.');
process.exit(problems ? 1 : 0);
