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
