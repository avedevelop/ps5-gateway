// End-to-end smoke test of a RUNNING gateway, with a test stream standing in for the PS5.
//   node scripts/setup.mjs --yes --ps5-ip=<this computer's LAN address>
//   node scripts/run.mjs start
//   node tests/smoke.mjs
//   node scripts/run.mjs stop
// The "PS5" is this very computer (PS5_IP in .env must be this computer's address), so it needs no console.
// Checks: DNS redirect, RTMP ingest, relay to the OBS address, the dashboard state, and that the key is masked in logs.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';
import { detectLanIp } from '../apps/common/lanip.mjs';
import { readEnvFiles } from '../apps/common/envfile.mjs';
import { findFfmpeg } from '../apps/common/platform.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readEnvFiles(ROOT, ['.env']);
const pc = detectLanIp(env.PC_LAN_IP);
const ffmpeg = findFfmpeg(ROOT);
const KEY = 'SmokeTestKeyAbCdEf123';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (m) => console.log(`[ok]   ${m}`);
const bad = (m) => { fails++; console.log(`[FAIL] ${m}`); };
const status = async () => { try { return await (await fetch('http://127.0.0.1:8787/api/status')).json(); } catch { return null; } };
async function until(fn, ms, step = 500) { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return null; await sleep(step); } }

if (!pc) { console.log('[FAIL] no LAN address'); process.exit(1); }
if (!ffmpeg) { console.log('[FAIL] FFmpeg not found'); process.exit(1); }
if (env.PS5_IP !== pc) { console.log(`[FAIL] PS5_IP (${env.PS5_IP}) must equal this computer's address (${pc}) for the smoke test`); process.exit(1); }
console.log(`smoke test on ${process.platform}, computer ${pc}\n`);

(await until(status, 30_000)) ? ok('dashboard is up (:8787)') : (bad('dashboard did not come up'), process.exit(1));

// 1. the DNS redirect answers the Twitch ingest name with this computer
try {
  const r = new dns.promises.Resolver({ timeout: 3000, tries: 2 }); r.setServers([pc]);
  const a = await r.resolve4('ingest.global-contribute.live-video.net');
  a[0] === pc ? ok(`DNS redirect: ingest name -> ${a[0]}`) : bad(`DNS returned ${a[0]}, expected ${pc}`);
} catch (e) { bad(`DNS server did not answer (${e.code ?? e.message})`); }

// 2. publish a test stream the way the console would, to a path with a key
const pub = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-re',
  '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440',
  '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '60', '-c:a', 'aac', '-t', '30',
  '-f', 'flv', `rtmp://${pc}:1935/app/live_123456789_${KEY}`], { stdio: ['ignore', 'ignore', 'pipe'] });
let pubErr = ''; pub.stderr.on('data', (d) => { pubErr += d; });

try {
  const live = await until(async () => { const s = await status(); return s?.live ? s : null; }, 25_000);
  if (live) ok(`gateway is live: ${live.ff.fps} fps, ${Math.round(live.ff.bitrateKbps)} kbit/s`); else bad(`gateway never went live. publisher said: ${pubErr.trim() || '(nothing)'}`);

  // 3. what OBS reads: the fixed relay address, without the key
  const rd = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-rw_timeout', '8000000', '-i', `rtmp://${pc}:1935/ps5/game`, '-t', '2', '-f', 'null', '-'], { encoding: 'utf8', timeout: 30_000 });
  rd.status === 0 ? ok('relay address rtmp://<computer>:1935/ps5/game is readable (what OBS opens)') : bad(`cannot read the relay address: ${(rd.stderr || '').trim().slice(0, 200)}`);

  const s = await status();
  s?.services?.every((x) => x.state === 'running' || x.name === 'relay') ? ok('services: ' + s.services.map((x) => `${x.name}:${x.state}`).join(' ')) : bad('a service is not running: ' + JSON.stringify(s?.services));
  s && s.services.every((x) => x.restarts === 0) ? ok('no service restarted') : bad('a service restarted during the test');
} finally { pub.kill(); await sleep(1500); }

// 4. the key must never reach the logs
const logDir = join(ROOT, 'logs');
const leaked = existsSync(logDir) ? readdirSync(logDir).filter((f) => readFileSync(join(logDir, f), 'utf8').includes(KEY)) : [];
leaked.length ? bad(`stream key found in logs: ${leaked.join(', ')}`) : ok('stream key is masked in all logs');

console.log(fails ? `\n${fails} check(s) failed` : '\nsmoke test passed');
process.exit(fails ? 1 : 0);
