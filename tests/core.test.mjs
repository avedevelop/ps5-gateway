// Fast unit tests, no network and no running gateway needed.   Run: npm test   (or: node --test tests/core.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectLanIp, lanCandidates } from '../apps/common/lanip.mjs';
import { readEnvFiles } from '../apps/common/envfile.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'ps5gw-t-'));

test('detectLanIp: configured value wins and is trimmed', () => {
  assert.equal(detectLanIp('  192.168.7.9 '), '192.168.7.9');
});
test('detectLanIp: auto-detect returns a private IPv4 or empty string', () => {
  const ip = detectLanIp('');
  assert.ok(ip === '' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip), ip);
  for (const c of lanCandidates()) assert.ok(!c.address.startsWith('169.254.'));
});

test('readEnvFiles: later files override, quotes stripped, missing files skipped', () => {
  const d = tmp();
  writeFileSync(join(d, '.env'), 'A=1\nB="two"\n# comment\nC=3\n');
  writeFileSync(join(d, '.env.x'), 'C=override\r\nD=4\r\n');
  assert.deepEqual(readEnvFiles(d, ['.env', '.env.missing', '.env.x']), { A: '1', B: 'two', C: 'override', D: '4' });
});

test('config templates: only __PC_IP__ is a placeholder and it renders cleanly', () => {
  for (const f of ['Corefile', 'mediamtx.yml']) {
    const tpl = readFileSync(join(ROOT, 'config', `${f}.tpl`), 'utf8');
    assert.ok(tpl.includes('__PC_IP__'), `${f}.tpl has the placeholder`);
    assert.ok(!tpl.replaceAll('__PC_IP__', '192.168.1.20').includes('__PC_IP__'));
    assert.ok(!/10\.0\.0\./.test(tpl), `${f}.tpl contains no machine-specific IP`);
  }
  const core = readFileSync(join(ROOT, 'config', 'Corefile.tpl'), 'utf8');
  assert.match(core, /contribute\.live-video\.net/);
  assert.match(core, /\{\{ \.Name \}\}/, 'CoreDNS template syntax is untouched');
});

test('.env.example lists the keys the code reads and holds no secrets', () => {
  const ex = readEnvFiles(ROOT, ['.env.example']);
  for (const k of ['PC_LAN_IP', 'PS5_IP']) assert.ok(k in ex, k);
  for (const v of Object.values(ex)) assert.equal(v, '', 'example values must be empty');
});

// ---------- platform differences (apps/common/platform.mjs) ----------
import { exeName, pingArgs, obsScenesDir, renderConfig } from '../apps/common/platform.mjs';
const tpl = (f) => readFileSync(join(ROOT, 'config', `${f}.tpl`), 'utf8');
const IPS = { pcIp: '192.168.1.20', ps5Ip: '192.168.1.50' };

test('exeName: .exe only on Windows', () => {
  assert.equal(exeName('coredns', true), 'coredns.exe');
  assert.equal(exeName('coredns', false), 'coredns');
});

test('pingArgs: one ping, timeout in the unit each system expects', () => {
  assert.deepEqual(pingArgs('192.168.1.50', 1500, 'win32'), ['-n', '1', '-w', '1500', '192.168.1.50']);
  assert.deepEqual(pingArgs('192.168.1.50', 1500, 'darwin'), ['-c', '1', '-W', '1500', '192.168.1.50']);
  assert.deepEqual(pingArgs('192.168.1.50', 1500, 'linux'), ['-c', '1', '-W', '2', '192.168.1.50']);
});

test('obsScenesDir: where OBS keeps scene collections', () => {
  const fwd = (p) => p.replaceAll('\\', '/'); // the separator is the one of the system running the tests
  assert.equal(fwd(obsScenesDir('darwin', '/Users/me', '')), '/Users/me/Library/Application Support/obs-studio/basic/scenes');
  assert.equal(fwd(obsScenesDir('win32', '', 'C:/Users/me/AppData/Roaming')), 'C:/Users/me/AppData/Roaming/obs-studio/basic/scenes');
});

test('renderConfig on Windows: services bind to the PC address, nothing else changes', () => {
  for (const f of ['Corefile', 'mediamtx.yml'])
    assert.equal(renderConfig(f, tpl(f), { ...IPS, win: true }), tpl(f).replaceAll('__PC_IP__', IPS.pcIp));
});

test('renderConfig on macOS: DNS on the wildcard address, answering only the PS5 and this computer', () => {
  const core = renderConfig('Corefile', tpl('Corefile'), { ...IPS, win: false });
  assert.ok(!/^\s*bind /m.test(core), 'no bind line: a specific address on port 53 needs root on macOS');
  assert.equal(core.match(/allow net 192\.168\.1\.50 192\.168\.1\.20 127\.0\.0\.1 ::1\n\s+block/g)?.length, 2, 'both server blocks are restricted');
  assert.match(core, /IN A 192\.168\.1\.20"/, 'the spoofed answer is still the PC address');
  assert.match(core, /\{\{ \.Name \}\}/);
  assert.ok(!core.includes('__PC_IP__'));
});

test('renderConfig on macOS: RTMP only from the PS5 and this computer', () => {
  const mtx = renderConfig('mediamtx.yml', tpl('mediamtx.yml'), { ...IPS, win: false });
  assert.match(mtx, /rtmpAddress: 192\.168\.1\.20:1935/);
  assert.match(mtx, /authInternalUsers:\n- user: any\n  pass:\n  ips: \['192\.168\.1\.50', '192\.168\.1\.20', '127\.0\.0\.1'\]/);
  assert.match(mtx, /- action: publish[\s\S]*- action: read/);
});

test('renderConfig on macOS without a PS5 address: only this computer is allowed', () => {
  const core = renderConfig('Corefile', tpl('Corefile'), { pcIp: '192.168.1.20', ps5Ip: '', win: false });
  assert.match(core, /allow net 192\.168\.1\.20 127\.0\.0\.1 ::1/);
});

// ---------- scripts that Windows PowerShell 5.1 reads ----------
import { readdirSync } from 'node:fs';
function walkFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'bin', 'logs', 'dl'].includes(e.name)) continue;
    const p = join(dir, e.name);
    e.isDirectory() ? walkFiles(p, out) : out.push(p);
  }
  return out;
}

test('every .ps1 and .cmd is ASCII (PowerShell 5.1 reads UTF-8 without a BOM as ANSI)', () => {
  const files = walkFiles(ROOT).filter((f) => /\.(ps1|cmd)$/i.test(f));
  assert.ok(files.length >= 6, `found ${files.length} Windows scripts`);
  for (const f of files) {
    const bad = [...readFileSync(f)].findIndex((b) => b > 127);
    assert.equal(bad, -1, `${f} has a non-ASCII byte at offset ${bad}`);
  }
});

test('installers exist for both systems and the mac ones are executable', async () => {
  const { statSync } = await import('node:fs');
  for (const f of ['installer/windows/install.ps1', 'installer/windows/Install-PS5-Gateway.cmd', 'installer/macos/install.sh', 'installer/macos/Install PS5 Gateway.command'])
    assert.ok(readFileSync(join(ROOT, f), 'utf8').length > 100, f);
  if (process.platform !== 'win32')
    for (const f of ['installer/macos/install.sh', 'installer/macos/Install PS5 Gateway.command', 'scripts/start.sh', 'scripts/stop.sh', 'scripts/install-autostart.sh'])
      assert.ok(statSync(join(ROOT, f)).mode & 0o100, `${f} must be executable`);
});
