// PS5 Gateway one-step setup (Windows and macOS).
//   node scripts/setup.mjs                 interactive
//   node scripts/setup.mjs --yes --ps5-ip=192.168.1.50     no questions
//   node scripts/setup.mjs --check         only report what is missing, change nothing
//   node scripts/setup.mjs --no-download   do not fetch FFmpeg / MediaMTX / CoreDNS
// It downloads the three helper programs (checksum-verified), creates .env
// and tells you the exact PS5 DNS value. Safe to run again: existing files are never overwritten.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, rmSync, createWriteStream, chmodSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { lanCandidates, detectLanIp } from '../apps/common/lanip.mjs';
import { readEnvFiles } from '../apps/common/envfile.mjs';
import { WIN, SUPPORTED, exeName, findFfmpeg, restrictFile, startCmd } from '../apps/common/platform.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const flag = (n) => process.argv.includes(`--${n}`);
const CHECK = flag('check'), YES = flag('yes') || CHECK, NODL = flag('no-download');
const ok = (m) => console.log(`  [ok]   ${m}`), warn = (m) => console.log(`  [warn] ${m}`), bad = (m) => { console.log(`  [FAIL] ${m}`); problems++; }, step = (m) => console.log(`\n== ${m}`);
let problems = 0;

// Pinned, tested versions. FFmpeg publishes only "latest" builds, so it is verified against the checksum published next to the file.
// macOS: MediaMTX and CoreDNS publish native builds for both Apple silicon and Intel; FFmpeg has no official
// macOS build, so the one from Homebrew is used (see findFfmpeg).
const OS = WIN ? 'windows' : 'darwin', ARCH = process.arch === 'arm64' ? 'arm64' : 'amd64';
const MTX = 'https://github.com/bluenviron/mediamtx/releases/download/v1.21.3', DNS = 'https://github.com/coredns/coredns/releases/download/v1.15.0';
const TOOLS = [
  { name: 'MediaMTX', dir: 'bin/mediamtx', exe: exeName('mediamtx'), url: WIN ? `${MTX}/mediamtx_v1.21.3_windows_amd64.zip` : `${MTX}/mediamtx_v1.21.3_darwin_${ARCH}.tar.gz`,
    sums: `${MTX}/checksums.sha256`, ext: WIN ? 'zip' : 'tar.gz' },
  { name: 'CoreDNS', dir: 'bin/coredns', exe: exeName('coredns'), url: `${DNS}/coredns_1.15.0_${OS}_${WIN ? 'amd64' : ARCH}.tgz`,
    sums: `${DNS}/coredns_1.15.0_${OS}_${WIN ? 'amd64' : ARCH}.tgz.sha256`, ext: 'tgz' },
  ...(WIN ? [{ name: 'FFmpeg', dir: 'bin/ffmpeg', exe: 'ffmpeg.exe', url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
    sums: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256', ext: 'zip', pick: ['ffmpeg.exe', 'ffprobe.exe'] }] : []),
];
// Windows' own bsdtar (reads zip and tgz), not a GNU tar from Git Bash; macOS ships bsdtar as /usr/bin/tar
const TAR = WIN ? join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe') : '/usr/bin/tar';

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
  if (CHECK || NODL) { bad(`${t.name} is missing (${join(t.dir, t.exe)})`); return; }
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
  execFileSync(TAR, ['-xf', file, '-C', ex], { stdio: 'ignore' });
  if (t.pick) { for (const p of t.pick) { const f = walk(ex).find((x) => x.toLowerCase().endsWith(`${sep}bin${sep}${p}`)); if (f) copyFileSync(f, join(dest, p)); } }
  else for (const f of walk(ex)) copyFileSync(f, join(dest, basename(f)));
  if (!WIN && existsSync(join(dest, t.exe))) chmodSync(join(dest, t.exe), 0o755);
  rmSync(tmp, { recursive: true, force: true });
  if (existsSync(join(dest, t.exe))) ok(`${t.name} installed (checksum verified)`); else bad(`${t.name}: ${t.exe} not found after extraction`);
}

console.log('PS5 Gateway setup');
step('1/4  Requirements');
if (!SUPPORTED) bad(`Windows or macOS is required (this is ${process.platform}).`); else ok(WIN ? 'Windows' : `macOS (${ARCH})`);
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj > 22 || (maj === 22 && min >= 18)) ok(`Node.js ${process.versions.node}`); else bad(`Node.js ${process.versions.node} is too old; install Node.js 24 LTS or newer (https://nodejs.org)`);

step(`2/4  Helper programs (bin${sep})`);
for (const t of TOOLS) { try { await install(t); } catch (e) { bad(e.message); } }
if (!WIN) { const ff = findFfmpeg(ROOT); ff ? ok(`FFmpeg found (${ff})`) : bad('FFmpeg is missing. Install it with Homebrew (https://brew.sh):  brew install ffmpeg'); }

step('3/4  Network');
const cands = lanCandidates();
if (!cands.length) bad('No private LAN address found. Connect the computer to your home network.');
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
  restrictFile(envFile);
  ok('.env created');
  if (!ps5) warn('PS5_IP is empty: edit .env and set it before starting.');
}
for (const d of ['logs']) if (!CHECK) mkdirSync(join(ROOT, d), { recursive: true });

step('Next');
const me = pcIp || '<PC IP>';
console.log(WIN ? `  1. Run (as Administrator, once):   powershell -ExecutionPolicy Bypass -File scripts\\firewall.ps1
  2. On the PS5 set the DNS of your network connection: Primary = ${me}, Secondary = 1.1.1.1
  3. Start the gateway:               ${startCmd()}
  4. Panel:                           http://127.0.0.1:8787
  5. OBS scenes:                      node scripts\\make-obs-scenes.mjs ${me}
  Full guide: docs/INSTALL.md` : `  1. On the PS5 set the DNS of your network connection: Primary = ${me}, Secondary = 1.1.1.1
  2. Start the gateway:               ${startCmd()}
  3. Check everything:                node scripts/doctor.mjs
  4. Panel:                           http://127.0.0.1:8787
  5. OBS scenes:                      node scripts/make-obs-scenes.mjs ${me}
  No firewall script is needed on macOS: the gateway itself answers only the PS5 and this Mac.
  Full guide: docs/INSTALL.md`);
console.log(problems ? `\n${problems} problem(s) found, see [FAIL] lines above.` : '\nSetup finished without problems.');
process.exit(problems ? 1 : 0);
