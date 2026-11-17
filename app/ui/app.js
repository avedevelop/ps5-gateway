requestAnimationFrame(() => requestAnimationFrame(() => { try { window.__TAURI__.core.invoke("ui_ready"); } catch (_) {} }));
// dev aid: script errors go to the app log
window.addEventListener('error', (e) => { try { window.__TAURI__.core.invoke('ui_metrics', { info: 'ERROR ' + e.message + ' @' + e.lineno }); } catch (_) {} });
window.addEventListener('unhandledrejection', (e) => { try { window.__TAURI__.core.invoke('ui_metrics', { info: 'REJECTED ' + ((e.reason && e.reason.message) || e.reason) }); } catch (_) {} });
// PS5 Gateway app interface. Talks to the gateway through a few Tauri commands (app/src-tauri/src/main.rs).
// Russian only for now; the strings move into one RU/EN file later (decision D11 in the design document).
'use strict';
const invoke = window.__TAURI__.core.invoke;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const AUTHOR_URL = 'https://github.com/avedevelop';
const SUPPORT_URL = 'https://github.com/sponsors/avedevelop';   // GitHub Sponsors page (works once the application is approved)
const DOWNLOAD = { obs: 'https://obsproject.com/download', streamlabs: 'https://streamlabs.com/streamlabs-desktop' };
const TABS = ['home', 'guide', 'settings'];
const NAV_HIDDEN = ['ob1', 'ob2', 'ob3', 'ob4', 'ob5', 'ob6', 'err-app'];   // the tab bar is shown everywhere else, so no screen is a dead end
let busy = false, busyLabel = '';
const FLASH = new Set(['#l-fps', '#l-mbit', '#l-drop', '#dns-p', '#ps5-s']);

let env = { exists: false, pc: '', ps5: '' };
let apps = { obs: false, streamlabs: false };
let status = null;                 // last answer of the gateway, null = not running
let lastCheck = '';                // raw text of the last check
let program = 'obs';
let current = 'ob1';
let stack = [];

try { program = localStorage.getItem('program') || 'obs'; } catch (_) {}

/* ---------- helpers ---------- */
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  clearTimeout(toastTimer);
  t.classList.remove('out'); t.textContent = osText(msg);
  if (t.hidden) t.hidden = false;                       // appears already centered and slides up; a repeated toast just changes its text
  toastTimer = setTimeout(() => { t.classList.add('out'); toastTimer = setTimeout(() => { t.hidden = true; t.classList.remove('out'); }, 240); }, 2600);
}
const customName = () => { try { return localStorage.getItem('program-custom') || ''; } catch (_) { return ''; } };
const progName = () => (program === 'obs' ? 'OBS' : program === 'custom' ? customName() : 'Streamlabs Desktop');
const progTitle = () => (program === 'obs' ? 'OBS Studio' : program === 'custom' ? (customName() || 'Другая программа') : 'Streamlabs Desktop');
function setProgram(p) { program = p; try { localStorage.setItem('program', p); } catch (_) {} syncProgram(); }
function syncProgram() {
  $$('[data-prog]').forEach((b) => { const on = b.dataset.prog === program; b.classList.toggle('on', on && b.closest('#seg') !== null); b.classList.toggle('sel', on && b.classList.contains('tile')); });
  const sg = $('#seg'); if (sg) sg.style.setProperty('--i', ['obs', 'streamlabs', 'custom'].indexOf(program));
  $('#open-prog').textContent = 'Открыть ' + (program === 'obs' ? 'OBS' : program === 'custom' ? (customName() || 'программу') : 'Streamlabs');
  $('#open-prog').hidden = program === 'custom' && !customName();
}
const pcIp = () => status?.net?.pcIp || env.pc || '…';
function relayUrl() { return status?.relayUrl || `rtmp://${env.pc || pcIp()}:1935/ps5/game`; }
function bindText() { $$('[data-bind="sec"]').forEach((e) => (e.textContent = (env.upstream || '1.1.1.1 8.8.8.8').split(/[\s,]+/)[0])); $$('[data-bind="pc"]').forEach((e) => (e.textContent = pcIp())); }

/* ---------- navigation ---------- */
function show(id, { push = true } = {}) {
  if (push && current && current !== id && !(TABS.includes(current) && TABS.includes(id))) stack.push(current);
  if (TABS.includes(id) && TABS.includes(current)) stack = [];
  $$('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
  current = id;
  const nav = !NAV_HIDDEN.includes(id); $('#tabs').hidden = !nav; $('#topbar').hidden = !nav;
  $$('#tabs button, #topbar button[data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === id));
  if (id === 'home') render();
  if (id === 'ob2') refreshApps();
  if (id === 'settings') fillSettings();
  if (id === 'ob3') { const f = $('#ps5ip'); if (!f.value) f.value = env.ps5 || ''; f.classList.remove('bad'); }
  if (id === 'ob5' || id === 'help-dns') bindText();
  if (id === 'report') buildReport();
  if (id === 'settings') bindText();
}
function back() { show(stack.pop() || 'home', { push: false }); }

/* ---------- gateway status and Home ---------- */
let lastSig = null;
async function poll() {
  const was = status; let raw = '';
  try { raw = await invoke('gateway_status'); status = JSON.parse(raw); } catch (_) { status = null; raw = ''; }
  const sig = raw.replace(/"now":\d+,?/, '');
  if (sig === lastSig && current !== 'settings') return;
  lastSig = sig;
  notifyChange(was, status);
  bindText();
  if (current === 'settings' && typeof refreshServices === 'function') refreshServices();
  if (current === 'home') render();
}
function homeState() {
  if (!status) return 'off';
  if (status.net && status.net.ipOk === false) return 'attn';
  if (status.live) return 'live';
  return 'wait';
}
function nearIp() {
  const ips = status?.net?.ips || [], base = (status?.net?.pcIp || '').split('.').slice(0, 3).join('.');
  return ips.find((a) => a.startsWith(base + '.')) || ips[0] || '…';
}
let liveBase = null;
function tickLive() {
  if (!liveBase || homeState() !== 'live') return;
  const t = mmss(liveBase.s + Math.floor((Date.now() - liveBase.at) / 1000));
  const a = $('#live-time'), b = $('#l-time'); if (a) a.textContent = '● в эфире ' + t; if (b) b.textContent = t;
}
setInterval(tickLive, 1000);
function mmss(s) { s = Math.max(0, s | 0); return String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function render() {
  const st = homeState(), home = $('#home');
  home.dataset.state = st;
  $$('[data-show]', home).forEach((e) => (e.hidden = !e.dataset.show.split(' ').includes(st)));
  const prevState = home.dataset.prevState; home.dataset.prevState = st;
  if (prevState && prevState !== st) $$('#home-title, #home-sub').forEach((e) => { e.classList.remove('swap'); void e.offsetWidth; e.classList.add('swap'); });
  const set = (id, t) => {
    const e = $(id), v = String(t);
    if (e.textContent === v) return;
    e.textContent = v;
    if (FLASH.has(id)) { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); }
  };
  // the console answers pings but never asks this DNS: it probably sits on its secondary DNS (restart it completely)
  const dnsUp = (status?.services || []).find((s) => s.name === 'dns')?.uptimeS || 0, lastDns = status?.ps5?.lastDns || 0, srvNow = status?.now || Date.now();
  const silent = st === 'wait' && !!status?.ps5?.reachable && dnsUp > 180 && (lastDns === 0 || srvNow - lastDns > 15 * 60 * 1000);
  $('#ps5-silent').hidden = !silent;
  const dot = $('#dot'); dot.className = 'dot' + (st === 'attn' ? ' warn' : st === 'off' ? ' off' : '');
  $('#sw').classList.toggle('on', st !== 'off');
  const dnsState = $('#dns-state'); dnsState.className = '';
  if (st === 'off') {
    set('#home-title', 'Шлюз выключен'); set('#home-sub', 'Включите шлюз, чтобы PS5 могла вещать');
    set('#dns-p', env.pc || '…'); set('#dns-l1', 'Основной'); set('#dns-state', ''); ps5Tile('не проверяем', env.ps5, '—', '—', '');
  } else if (st === 'attn') {
    set('#home-title', 'Нужно внимание'); set('#home-sub', 'Адрес компьютера не совпадает с DNS на PS5');
    set('#dns-l1', 'Основной (новый)'); set('#dns-p', nearIp()); dnsState.className = 'w'; set('#dns-state', 'был ' + (status.net.pcIp || ''));
    ps5Tile('● нет шлюза', status.ps5?.ip || '', 'ещё нет', 'нет', 'wr');
  } else if (st === 'live') {
    set('#home-title', 'PS5 вещает'); set('#home-sub', 'Картинка идёт в ' + progTitle() + '. Выходите в эфир, когда будете готовы');
    liveBase = { s: status.publishSinceS, at: Date.now() }; tickLive();
    set('#l-fps', Math.round(status.ff.fps || 0)); set('#l-mbit', ((status.ff.bitrateKbps || 0) / 1000).toFixed(1)); set('#l-drop', status.ff.drop || 0);
    set('#dns-l1', 'Основной'); set('#dns-p', pcIp()); set('#dns-state', '✓ настроен');
  } else {
    set('#home-title', 'Всё работает'); set('#home-sub', 'Ждём PS5. На консоли: Create → Broadcast → Twitch');
    set('#dns-l1', 'Основной'); set('#dns-p', pcIp());
    const used = (status.ps5?.lastDns || 0) > 0;
    if (used) set('#dns-state', '✓ PS5 его уже использует'); else { dnsState.className = 'n'; set('#dns-state', 'PS5 ещё не обращалась'); }
    ps5Tile(status.ps5?.reachable ? '● отвечает' : 'не отвечает', status.ps5?.ip || '', used ? 'обращалась' : 'ещё нет', status.publishing ? 'идёт' : 'нет', status.ps5?.reachable ? 'ok' : '');
  }
  set('#addr', relayUrl());
  if (busy) $('#home-sub').textContent = busyLabel;      // keep the "working on it" line while a script runs
}

function ps5Tile(state, ip, dns, live, cls) {
  const s = $('#ps5-s'); s.textContent = state; s.className = 'st ' + cls;
  $('#ps5-ip').textContent = ip || '—'; $('#ps5-dns').textContent = dns; $('#ps5-live').textContent = live;
}

/* One slow action at a time: the switch shows that it is working instead of looking frozen. */
async function withBusy(label, fn, button, target) {
  if (busy) return;
  busy = true; busyLabel = label;
  if (target !== undefined) $('#sw').classList.toggle('on', target);          // the switch moves at once, the shimmer shows it is working
  $('#sw').classList.add('busy'); button?.classList.add('busy'); $('#home-sub').textContent = label;
  try { await fn(); } finally { busy = false; $('#sw').classList.remove('busy'); button?.classList.remove('busy'); render(); }
}

/* ---------- gateway control ---------- */
async function startGateway() {
  toast('Запускаем шлюз…');
  const out = await invoke('gateway_start').catch((e) => String(e));
  await poll();
  if (!status) toast(/already running/.test(out) ? 'Шлюз уже запущен, но не отвечает. Нажмите «Перезапустить».' : 'Не удалось запустить. ' + String(out).split('\n').filter(Boolean).pop());
  else toast('Шлюз работает');
}
async function stopGateway() { await invoke('gateway_stop').catch(() => {}); await poll(); toast('Шлюз выключен'); }

/* ---------- check ---------- */
function parseCheck(text) {
  const items = []; let last = null;
  for (const raw of text.split('\n')) {
    const m = /^\[(ok|warn|FAIL)\]\s+(.*)$/.exec(raw.trim());
    if (m) { last = { kind: m[1], text: m[2], fix: '' }; items.push(last); continue; }
    const f = /^fix:\s*(.*)$/.exec(raw.trim());
    if (f && last) last.fix = f[1];
  }
  return items;
}
async function runCheck() {
  show('check'); $('#chk-sub').textContent = 'Проверяем…'; $('#chk-list').innerHTML = '';
  lastCheck = await invoke('run_check').catch((e) => String(e));
  const items = parseCheck(lastCheck), bad = items.filter((i) => i.kind !== 'ok').length;
  $('#chk-sub').textContent = bad ? 'Нашли замечаний: ' + bad : 'Всё в порядке.';
  const list = $('#chk-list');
  list.innerHTML = '';
  for (const i of items) {
    const row = document.createElement('div');
    const mark = document.createElement('span'); mark.className = 'chk ' + (i.kind === 'ok' ? 'y' : i.kind === 'warn' ? 'w' : 'e'); mark.textContent = i.kind === 'ok' ? '✓' : '!';
    const body = document.createElement('span'); body.style.color = 'var(--ink)'; body.style.fontSize = '12.5px'; body.style.flex = '1'; body.style.minWidth = '0'; body.style.whiteSpace = 'normal'; body.style.overflowWrap = 'anywhere'; body.textContent = doctorText(i.text);
    if (i.fix) { const s = document.createElement('small'); s.style.display = 'block'; s.style.color = 'var(--ink2)'; s.textContent = doctorText(i.fix); body.appendChild(s); }
    const left = document.createElement('span'); left.style.display = 'flex'; left.style.gap = '8px'; left.style.alignItems = 'flex-start'; left.style.minWidth = '0'; left.style.whiteSpace = 'normal'; left.append(mark, body);
    row.appendChild(left); list.appendChild(row);
  }
  return items;
}

/* ---------- report (no key, no settings file, addresses hidden by default) ---------- */
function maskText(t, on) {
  let s = t.replace(/live_[A-Za-z0-9_]+/g, 'live_***').replace(/\b([0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, '**:**:**:**:**:**').replace(/\/Users\/[^/\s)]+/g, '/Users/***');
  if (on) s = s.replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, '***.***.*.$4');
  return s;
}
async function buildReport() {
  $('#rep-text').textContent = ''; $('#report').classList.add('building');
  const t0 = Date.now();
  const [check, diag] = await Promise.all([
    invoke('run_check').catch((e) => 'run_check failed: ' + e),
    invoke('collect_diagnostics').catch((e) => 'collect_diagnostics failed: ' + e),
  ]);
  lastCheck = check;
  const prefs = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^(pref-|val-|program|setmode)/.test(k)) prefs[k] = localStorage.getItem(k); } } catch (_) {}
  const st = status ? { ...status } : null; if (st) delete st.now;
  const head = [
    '=== PS5 Gateway report ===',
    'app: PS5 Gateway app 0.1.0 (MIT)', 'created: ' + new Date().toString(), 'collected in: ' + (Date.now() - t0) + ' ms',
    'state: ' + { off: 'gateway off', wait: 'waiting for the PS5', live: 'PS5 is broadcasting', attn: 'needs attention' }[homeState()],
    'screen: ' + current + ', window: ' + innerWidth + 'x' + innerHeight + ' @' + devicePixelRatio + 'x, language: ' + prefVal('lang', 'ru'), 'webview: ' + navigator.userAgent,
    'chosen program: ' + program + (program === 'custom' ? ' (' + customName() + ')' : ''), 'programs found: OBS ' + !!apps.obs + ', Streamlabs ' + !!apps.streamlabs,
    'app settings: ' + JSON.stringify(prefs), 'env summary: ' + JSON.stringify(env),
  ];
  const lines = [
    ...head, '',
    '=== Gateway status (live data from the gateway) ===', st ? JSON.stringify(st, null, 1) : 'the gateway does not answer (switched off or not started)', '',
    '=== Check (scripts/doctor.mjs) ===', ...check.split('\n').filter((l) => l.trim()), '',
    diag,
  ];
  $('#rep-text').dataset.raw = lines.join('\n');
  $('#report').classList.remove('building');
  paintReport();
}
function paintReport() {
  const raw = $('#rep-text').dataset.raw || '', masked = maskText(raw, $('#rep-mask').classList.contains('on'));
  $('#rep-text').textContent = masked;
  $('#rep-count').textContent = masked ? masked.split('\n').length : 0;
  $('#rep-secs').textContent = [...masked.matchAll(/^=== (.+?) ===/gm)].map((m) => m[1].replace(/ \(.*\)$/, '')).join(' · ') || '…';
  if (!$('#dlg-report').hidden) paintRepModal();
}

/* ---------- onboarding ---------- */
async function refreshApps() {
  try { apps = JSON.parse(await invoke('detect_apps')); } catch (_) {}
  const put = (id, found) => { const e = $(id); e.textContent = found ? 'найден ✓' : 'не найден'; e.className = found ? 'ok' : ''; };
  put('#st-obs', apps.obs); put('#st-sl', apps.streamlabs); syncProgram();
}
const mark = (id, k) => { const e = $(id); e.className = 'chk ' + k; e.textContent = k === 'y' ? '✓' : k === 'e' ? '!' : k === 'w' ? '…' : ''; };
/* the progress bar creeps towards the next milestone while a step runs, then jumps to it */
function setBar(pct, ms) { const bar = $('#ob4-bar'); bar.style.transition = 'width ' + ms + 'ms ' + (ms > 3000 ? 'cubic-bezier(.1,.6,.3,1)' : 'ease'); bar.style.width = pct + '%'; }
function pipeStep(n, text) { $('#pipe').dataset.step = String(n); if (text) $('#ob4-p').textContent = text; }
const mb = (b) => Math.round(b / 1048576);
/* setup.mjs reports real download progress; the bar follows it between 4% and 40% */
function paintSetup(j) {
  if (!j || j.phase === 'done') return;
  setBar(4 + j.p * 36, 300);
  if (j.phase === 'download') $('#ob4-p').textContent = j.total ? `Скачиваем ${j.name} (${j.index} из ${j.of}) · ${mb(j.received)} из ${mb(j.total)} МБ` : `Скачиваем ${j.name} (${j.index} из ${j.of})`;
  else if (j.phase === 'verify') $('#ob4-p').textContent = `Проверяем контрольную сумму: ${j.name}`;
  else if (j.phase === 'unpack') $('#ob4-p').textContent = `Распаковываем: ${j.name}`;
}
async function install() {
  const ip = $('#ps5ip').value.trim(), bar = $('#ob4-bar');
  let fwErr = '';
  ['#c1', '#cf', '#c2', '#c3'].forEach((c) => mark(c, 'n')); bar.style.transition = 'none'; bar.style.width = '4%'; $('#pipe').classList.remove('err', 'done'); pipeStep(0);
  $('#ob4-h').textContent = 'Устанавливаем'; $('#ob4-p').textContent = 'Это займёт минуту'; $('#ob4-retry').hidden = true;
  try {
    mark('#c1', 'w'); pipeStep(1, 'Скачиваем компоненты…'); setBar(5, 300);
    const timer = setInterval(async () => { try { const j = await invoke('setup_progress'); if (j) paintSetup(JSON.parse(j)); } catch (_) {} }, 300);
    let out; try { out = await invoke('run_setup', { ps5Ip: ip }); } finally { clearInterval(timer); }
    if (!/Setup finished without problems/.test(out)) throw new Error('setup');
    mark('#c1', 'y'); setBar(40, 400);
    if (OS === 'win') {   // Windows asks once for permission, so the PS5 can reach the gateway through the firewall
      mark('#cf', 'w'); pipeStep(2, 'Разрешаем доступ в брандмауэре…'); setBar(48, 20000);
      try { await invoke('firewall_setup'); } catch (e) { fwErr = String(e).replace(/^Error: /, ''); throw new Error('firewall'); }
      mark('#cf', 'y'); setBar(52, 400);
    }
    mark('#c2', 'w'); pipeStep(2, 'Запускаем шлюз…'); setBar(78, 15000); env = JSON.parse(await invoke('read_env')); await poll();
    if (!status) { await invoke('gateway_start'); if (pref('open-prog')) invoke('open_app', { name: progName() }).catch(() => {}); for (let i = 0; i < 20 && !status; i++) { await new Promise((r) => setTimeout(r, 500)); await poll(); } }
    if (!status) throw new Error('gateway');
    mark('#c2', 'y'); setBar(82, 400);
    mark('#c3', 'w'); pipeStep(3, 'Проверяем связь…'); setBar(96, 12000); lastCheck = await invoke('run_check'); const bad = parseCheck(lastCheck).filter((i) => i.kind === 'FAIL').length;
    if (bad) throw new Error('check'); mark('#c3', 'y'); setBar(100, 400);
    pipeStep(4, 'Готово!'); $('#pipe').classList.add('done'); $('#ob4-h').textContent = 'Всё готово';
    setTimeout(() => show('ob5', { push: false }), 1800);
  } catch (e) {
    ['#c1', '#cf', '#c2', '#c3'].forEach((c) => { if ($(c).classList.contains('w')) mark(c, 'e'); });
    $('#pipe').classList.add('err'); setBar(Math.max(parseFloat($('#ob4-bar').style.width) || 8, 8), 200);
    $('#ob4-h').textContent = 'Не получилось'; $('#ob4-retry').hidden = false;
    if (e.message === 'firewall') {
      $('#ob4-h').textContent = 'Нужно разрешение';
      $('#ob4-p').textContent = fwErr === 'cancelled' ? 'Windows спрашивает разрешение, чтобы PS5 могла связаться со шлюзом. Нажмите «Попробовать снова» и выберите «Да».' : 'Не удалось настроить брандмауэр: ' + fwErr;
    } else if (String(e).includes('cannot run node')) {
      $('#ob4-h').textContent = 'Нужен Node.js'; $('#ob4-p').textContent = 'Установите Node.js 24 LTS с nodejs.org, затем откройте приложение снова: на нём работает шлюз.';
    } else if (String(e).includes('NOFOLDER')) {
      $('#ob4-p').textContent = 'Не нашли папку ps5-gateway рядом с приложением. Не выносите приложение из папки, а если оно скачано из интернета, один раз выполните в Терминале: xattr -dr com.apple.quarantine ~/Downloads/ps5-gateway';
    } else $('#ob4-p').textContent = 'Нажмите «Попробовать снова». Если не выйдет, сделайте отчёт для помощи в Настройках.';
  }
}

/* ---------- events ---------- */
document.addEventListener('click', (ev) => {
  const t = ev.target.closest('button, [data-go], .tile.pick');
  if (!t) return;
  if (t.dataset.go) { show(t.dataset.go); return; }
  if (t.hasAttribute('data-back')) { back(); return; }
  if (t.dataset.prog) { if (t.dataset.prog === 'custom') openProgDlg(); else setProgram(t.dataset.prog); return; }
  if (t.dataset.act === 'author') { invoke('open_url', { url: AUTHOR_URL }); return; }
  if (t.dataset.act === 'support') { SUPPORT_URL ? invoke('open_url', { url: SUPPORT_URL }) : toast('Ссылка для поддержки скоро появится'); return; }
});
$('#ob2-next').onclick = async () => {
  if (program === 'custom') { if (!customName()) return openProgDlg(); $('#err-dl').hidden = false; return show('ob3'); }
  $('#err-dl').hidden = false;
  const found = program === 'obs' ? apps.obs : apps.streamlabs;
  if (found) show('ob3'); else { $('#err-h').textContent = progTitle() + ' не найден'; show('err-app'); } };
$('#err-dl').onclick = () => invoke('open_url', { url: DOWNLOAD[program] });
$('#ob3-next').onclick = () => { const f = $('#ps5ip'); const ok = /^(\d{1,3}\.){3}\d{1,3}$/.test(f.value.trim()) && f.value.trim().split('.').every((n) => +n <= 255);
  f.classList.toggle('bad', !ok); $('#ob3-p').textContent = ok ? 'Нужен, чтобы шлюз отвечал только ей' : 'Это не похоже на адрес. Пример: 192.168.1.50'; if (ok) { show('ob4'); install(); } };
$('#ob4-retry').onclick = install;
$('#ob5-next').onclick = () => show('ob6');
$('#ob6-open').onclick = () => show('home');

$('#open-prog').onclick = () => invoke('open_app', { name: progName() }).catch(() => toast('Не удалось открыть ' + progTitle()));
$('#copy-addr').onclick = () => invoke('copy_text', { text: relayUrl() }).then(() => toast('Адрес скопирован')).catch(() => toast('Не удалось скопировать'));
$('#sw').onclick = () => { if (busy) return; if (homeState() === 'off') withBusy('Запускаем шлюз…', startGateway, null, true); else if (!prefSet('ask')) withBusy('Выключаем шлюз…', stopGateway, null, false); else $('#dlg-off').hidden = false; };
$('#off-no').onclick = () => ($('#dlg-off').hidden = true);
$('#off-yes').onclick = () => { $('#dlg-off').hidden = true; withBusy('Выключаем шлюз…', stopGateway, null, false); };
$('#off-help').onclick = () => { $('#dlg-off').hidden = true; show('help-dns'); };
$('#b-check').onclick = runCheck; $('#g-check').onclick = runCheck; $('#chk-again').onclick = runCheck;
$('#b-restart').onclick = () => withBusy('Перезапускаем шлюз…', async () => { await invoke('gateway_stop').catch(() => {}); await startGateway(); }, $('#b-restart'));
document.addEventListener('keydown', (ev) => {            // Esc: close the dialog, or go back from a nested screen
  if (ev.key !== 'Escape') return;
  { const od = $$('.dim').find((d) => !d.hidden); if (od) { od.hidden = true; if (od.id === 'dlg-prog') syncProgram(); return; } }
  if (!TABS.includes(current) && !NAV_HIDDEN.includes(current)) back();
});
$('#rep-mask').onclick = () => { $('#rep-mask').classList.toggle('on'); paintReport(); };
$('#rep-save').onclick = () => invoke('save_report', { text: $('#rep-text').textContent }).then((p) => toast('Сохранено: ' + String(p).split(/[\/]/).pop())).catch(() => toast('Не удалось сохранить'));
$('#rep-copy').onclick = () => invoke('copy_text', { text: $('#rep-text').textContent }).then(() => toast('Отчёт скопирован')).catch(() => toast('Не удалось скопировать'));
const LANG_NAME = { ru: 'русском', en: 'English', uk: 'українською', de: 'Deutsch', es: 'español' };
const AI_PROMPT = {
  ru: 'Ты терпеливый инженер поддержки по сетям и стримингу. Я пользуюсь PS5 Gateway: приложение на моём Mac перенаправляет встроенную трансляцию PS5 на мой компьютер. Цепочка такая: PS5 спрашивает у DNS на моём Mac адрес приёма Twitch, шлюз отвечает адресом Mac, CoreDNS и MediaMTX принимают поток RTMP, FFmpeg передаёт его в OBS или Streamlabs. Ниже диагностический отчёт приложения.\n\nСделай так:\n1) Одной фразой скажи, работает ли цепочка.\n2) Пройди по отчёту и перечисли все проблемы и подозрительные места, сначала самую вероятную причину.\n3) Дай нумерованные шаги, как исправить, с точными названиями меню на PS5, в macOS и в OBS.\n4) Задай не больше трёх коротких вопросов, и только если не хватает данных.\n\nНе проси мой ключ трансляции, пароли и файл .env. Часть адресов может быть скрыта, это сделано намеренно. Отвечай на русском.',
  en: 'You are a patient network and streaming support engineer. I use PS5 Gateway: an app on my Mac that sends my PS5\'s built-in broadcast to my computer. The chain: the PS5 asks the DNS on my Mac for the Twitch ingest address, the gateway answers with the Mac\'s address, CoreDNS and MediaMTX receive the RTMP stream, FFmpeg passes it to OBS or Streamlabs. Below is the app\'s diagnostic report.\n\nPlease:\n1) Say in one sentence whether the chain works.\n2) Go through the report and list every problem or suspicious thing, the most likely cause first.\n3) Give numbered steps to fix it, with exact menu names on the PS5, in macOS and in OBS.\n4) Ask at most three short questions, and only if you truly need more information.\n\nNever ask for my stream key, passwords or the .env file. Some addresses may be hidden on purpose. Answer in English.',
  uk: 'Ти терплячий інженер підтримки з мереж і стрімінгу. Я користуюся PS5 Gateway: застосунок на моєму Mac спрямовує вбудовану трансляцію PS5 на мій комп’ютер. Ланцюжок: PS5 питає в DNS на моєму Mac адресу приймання Twitch, шлюз відповідає адресою Mac, CoreDNS і MediaMTX приймають потік RTMP, FFmpeg передає його в OBS або Streamlabs. Нижче діагностичний звіт застосунку.\n\nЗроби так:\n1) Одним реченням скажи, чи працює ланцюжок.\n2) Пройди по звіту й перелічи всі проблеми та підозрілі місця, спочатку найімовірнішу причину.\n3) Дай нумеровані кроки виправлення з точними назвами меню на PS5, у macOS та в OBS.\n4) Постав не більше трьох коротких запитань, і лише якщо бракує даних.\n\nНе проси мій ключ трансляції, паролі та файл .env. Частина адрес може бути прихована навмисно. Відповідай українською.',
  de: 'Du bist ein geduldiger Support-Ingenieur für Netzwerk und Streaming. Ich nutze PS5 Gateway: eine App auf meinem Mac, die die eingebaute Übertragung meiner PS5 auf meinen Computer umleitet. Die Kette: Die PS5 fragt den DNS auf meinem Mac nach der Twitch-Ingest-Adresse, das Gateway antwortet mit der Adresse des Macs, CoreDNS und MediaMTX empfangen den RTMP-Stream, FFmpeg gibt ihn an OBS oder Streamlabs weiter. Unten steht der Diagnosebericht der App.\n\nBitte:\n1) Sag in einem Satz, ob die Kette funktioniert.\n2) Geh den Bericht durch und nenne jedes Problem und jede Auffälligkeit, die wahrscheinlichste Ursache zuerst.\n3) Gib nummerierte Schritte zur Behebung mit genauen Menünamen auf der PS5, in macOS und in OBS.\n4) Stelle höchstens drei kurze Fragen, und nur wenn wirklich Informationen fehlen.\n\nFrage nie nach meinem Stream-Key, Passwörtern oder der .env-Datei. Manche Adressen sind absichtlich verborgen. Antworte auf Deutsch.',
  es: 'Eres un ingeniero de soporte paciente de redes y streaming. Uso PS5 Gateway: una app en mi Mac que envía la emisión integrada de mi PS5 a mi ordenador. La cadena: la PS5 pregunta al DNS de mi Mac por la dirección de ingesta de Twitch, la pasarela responde con la dirección del Mac, CoreDNS y MediaMTX reciben el flujo RTMP, FFmpeg lo pasa a OBS o Streamlabs. Abajo está el informe de diagnóstico de la app.\n\nPor favor:\n1) Di en una frase si la cadena funciona.\n2) Recorre el informe y enumera todos los problemas o cosas sospechosas, primero la causa más probable.\n3) Da pasos numerados para arreglarlo, con los nombres exactos de los menús en la PS5, en macOS y en OBS.\n4) Haz como máximo tres preguntas cortas, y solo si de verdad falta información.\n\nNunca me pidas la clave de transmisión, contraseñas ni el archivo .env. Algunas direcciones pueden estar ocultas a propósito. Responde en español.',
};
// the prompts are written for a Mac; on Windows the computer is a PC
const AI_WIN = [[/моём Mac/g, 'моём ПК'], [/моєму Mac/g, 'моєму ПК'], [/my Mac/g, 'my PC'], [/meinem Mac/g, 'meinem PC'], [/mi Mac/g, 'mi PC'], [/адресом Mac/g, 'адресом ПК'], [/адресою Mac/g, 'адресою ПК'],
  [/the Mac's/g, "the PC's"], [/des Macs/g, 'des PCs'], [/del Mac/g, 'del PC'], [/macOS/g, 'Windows']];
const aiText = () => { let p = AI_PROMPT[prefVal('lang', 'ru')] || AI_PROMPT.ru; if (OS === 'win') for (const [re, to] of AI_WIN) p = p.replace(re, to); return p + '\n\n' + $('#rep-text').textContent; };
let repView = 'ai';
function paintRepModal() {
  $('#rep-full').textContent = repView === 'ai' ? aiText() : $('#rep-text').textContent;
  $$('#seg-repview button').forEach((b, i) => { const on = b.dataset.v === repView; b.classList.toggle('on', on); if (on) $('#seg-repview').style.setProperty('--i', i); });
  $('#rep-viewnote').hidden = repView !== 'ai';
}
$('#rep-open').onclick = () => { paintRepModal(); $('#dlg-report').hidden = false; $('#rep-full').scrollTop = 0; };
$('#rep-close').onclick = () => ($('#dlg-report').hidden = true);
$$('#seg-repview button').forEach((b) => (b.onclick = () => { repView = b.dataset.v; paintRepModal(); $('#rep-full').scrollTop = 0; }));
$('#rep-modal-copy').onclick = () => invoke('copy_text', { text: $('#rep-full').textContent }).then(() => toast(repView === 'ai' ? 'Скопировано с промтом. Вставьте в чат с ИИ-ассистентом' : 'Отчёт скопирован')).catch(() => toast('Не удалось скопировать'));
$('#rep-ai').onclick = () => invoke('copy_text', { text: aiText() }).then(() => toast('Скопировано с промтом. Вставьте в чат с ИИ-ассистентом')).catch(() => toast('Не удалось скопировать'));
$('#rep-author').onclick = () => invoke('open_url', { url: 'https://github.com/avedevelop/ps5-gateway/issues/new' }).catch(() => toast('Не удалось открыть'));
$('#un-do').onclick = async () => { $('#un-do').classList.add('busy'); try { await invoke('uninstall'); env = { exists: false, pc: '', ps5: '' }; status = null; toast('Удалено. Можно закрыть приложение'); stack = []; show('ob1', { push: false }); } catch (e) { toast('Не удалось удалить: ' + e); } $('#un-do').classList.remove('busy'); };
$('#sw-login').onclick = async () => { const on = !$('#sw-login').classList.contains('on'); $('#sw-login').classList.toggle('on', on);
  const out = await invoke('autostart_set', { on }).catch((e) => String(e)); toast(on ? 'Запуск при входе включён' : 'Запуск при входе выключен'); void out; };

/* ---------- scale to the window ---------- */
function fit() {
  const w = innerWidth, h = innerHeight;
  const z = w >= 720 ? Math.min(Math.max(w / 880, 0.9), 1.6) : Math.min(Math.max(Math.min(w / 380, h / 640), 1), 1.6);
  document.documentElement.style.setProperty('--z', z.toFixed(3));
}
addEventListener('resize', fit); fit();

/* ---------- development aid: report the real window metrics to the app log ---------- */
function reportMetrics(tag) {
  try {
    const R = (e) => e.getBoundingClientRect(), root = document.documentElement;
    root.classList.add('measure');                       // natural height: nothing stretches
    const pg = $('#home .pg');
    const natural = Math.round(R($('#home .homegrid')).bottom);
    root.classList.remove('measure');
    invoke('ui_metrics', { info: JSON.stringify({ tag, state: $('#home').dataset.state, inner: [innerWidth, innerHeight], z: root.style.getPropertyValue('--z'),
      origin: location.origin, naturalContentBottom: natural, pgClient: pg.clientHeight, pgScroll: pg.scrollHeight, overflowPx: pg.scrollHeight - pg.clientHeight, dpr: devicePixelRatio }) });
  } catch (_) {}
}

/* ---------- start ---------- */
(async () => {
  try { env = JSON.parse(await invoke('read_env')); } catch (_) {}
  syncProgram(); await poll();
  invoke('autostart_state').then((on) => $('#sw-login').classList.toggle('on', !!on)).catch(() => {});   // show the real state, not a guess
  (function tick() { setTimeout(async () => { await poll(); tick(); }, refreshMs()); })();
  if (pref('gw-auto') && !status) invoke('gateway_start').catch(() => {});
  setTimeout(() => reportMetrics('start'), 2500);
  show(env.exists && env.ps5 ? 'home' : 'ob1', { push: false });
  setTimeout(hideSplash, 450);
})();

/* ---------- settings: two modes in one window ---------- */
function pref(k) { try { return localStorage.getItem('pref-' + k) === '1'; } catch (_) { return false; } }
function prefSet(k, dflt = true) { try { const v = localStorage.getItem('pref-' + k); return v === null ? dflt : v === '1'; } catch (_) { return dflt; } }   // a switch that is on by default
function setPref(k, v) { try { localStorage.setItem('pref-' + k, v ? '1' : '0'); } catch (_) {} }
function prefVal(k, dflt) { try { return localStorage.getItem('val-' + k) || dflt; } catch (_) { return dflt; } }
function setVal(k, v) { try { localStorage.setItem('val-' + k, v); } catch (_) {} }
function refreshMs() { return Number(prefVal('refresh', '1500')) || 1500; }
const validIp = (v) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split('.').every((n) => +n <= 255);

/* notifications: only when the PS5 starts or stops broadcasting */
function notifyChange(was, now) {
  if (!pref('notify') || !was || !now) return;
  if (!was.publishing && now.publishing) invoke('notify', { title: 'PS5 Gateway', body: 'PS5 начала трансляцию' }).catch(() => {});
  if (was.publishing && !now.publishing) invoke('notify', { title: 'PS5 Gateway', body: 'Трансляция остановлена' }).catch(() => {});
}

/* a row of choices with a sliding highlight: bindSeg('#id', current, (value) => ...) */
function bindSeg(sel, cur, pick) {
  const el = $(sel), bs = $$('button', el);
  const mark = (v) => { bs.forEach((b, i) => { const on = b.dataset.v === String(v); b.classList.toggle('on', on); if (on) el.style.setProperty('--i', i); }); };
  mark(cur); bs.forEach((b) => (b.onclick = () => { mark(b.dataset.v); pick(b.dataset.v); }));
  return mark;
}
const applyView = () => { document.documentElement.classList.toggle('priv', pref('priv')); document.documentElement.classList.toggle('calm', pref('calm')); };
let markCache, markLog;
function fillSettings() {
  $('#st-ps5').value = env.ps5 || ''; $('#st-pc').value = env.pc || '';
  $('#st-pc').placeholder = 'авто · ' + (status?.net?.pcIp || 'определяется сам');
  $('#sw-awake').classList.toggle('on', env.keepAwake !== false);
  $('#sw-gwauto').classList.toggle('on', pref('gw-auto')); $('#sw-openprog').classList.toggle('on', pref('open-prog'));
  $('#sw-priv').classList.toggle('on', pref('priv')); $('#sw-notify').classList.toggle('on', pref('notify')); $('#sw-ask').classList.toggle('on', prefSet('ask'));
  $('#sw-calm').classList.toggle('on', pref('calm'));
  $('#st-dns1').value = ''; $('#st-dns2').value = '';
  const chips = $('#pc-chips'); const ips = [...new Set([...(status?.net?.ips || []), pcIp()].filter((x) => /^\d/.test(x)))];
  chips.innerHTML = ''; ips.forEach((ip) => { const b = document.createElement('button'); b.className = 'chip' + (ip === pcIp() ? ' on' : ''); b.textContent = ip; b.onclick = () => { $('#st-pc').value = ip; }; chips.appendChild(b); });
  markCache(env.cacheTtl || '30'); markLog(env.logLevel || 'debug');
  markDns(); refreshServices();
}
let dnsMode = 'preset';
function setDnsMode(m, anim) {
  const prev = dnsMode; dnsMode = m;
  if (anim && prev !== m) swapPanels(m === 'own' ? $('#dnslist') : $('#dns-own'), m === 'own' ? $('#dns-own') : $('#dnslist')); else { $('#dnslist').hidden = m !== 'preset'; $('#dns-own').hidden = m !== 'own'; }
  const sg = $('#seg-dnsmode'); $$('button', sg).forEach((b, i) => { const on = b.dataset.v === m; b.classList.toggle('on', on); if (on) sg.style.setProperty('--i', i); });
}
function markDns() {
  const cur = (env.upstream || '').split(/[\s,]+/).filter(Boolean).join(' ');
  let hit = false;
  $$('#dnslist [data-up]').forEach((b) => { const on = b.dataset.up === cur; b.classList.toggle('on', on); hit = hit || on; });
  if (!hit && cur) setDnsMode('own'); else if (dnsMode === 'own' && !cur) setDnsMode('preset'); else setDnsMode(dnsMode);
  $('#dns-note').textContent = hit ? 'Через них шлюз отвечает на всё, кроме адреса трансляции PS5. Первый адрес вы вводите на PS5 как дополнительный DNS.' : 'Сейчас свои адреса из .env: ' + cur;
}
function setMode(m, anim) {
  if (anim) swapPanels(m === 'adv' ? $('#set-basic') : $('#set-adv'), m === 'adv' ? $('#set-adv') : $('#set-basic')); else { $('#set-basic').hidden = m !== 'basic'; $('#set-adv').hidden = m !== 'adv'; }
  $$('#modeseg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m)); $('#modeseg').dataset.active = m;
  try { localStorage.setItem('setmode', m); } catch (_) {}
}
$$('#modeseg button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode, true)));

/* simple switches that live in the app */
function appSwitch(id, key, msgOn, msgOff, after) {
  $(id).onclick = () => { const on = !$(id).classList.contains('on'); $(id).classList.toggle('on', on); setPref(key, on); toast(on ? msgOn : msgOff); if (after) after(on); };
}
appSwitch('#sw-gwauto', 'gw-auto', 'Шлюз будет включаться при открытии приложения', 'Шлюз включается только вручную');
appSwitch('#sw-openprog', 'open-prog', 'Программа откроется вместе со шлюзом', 'Программу открываете сами');
appSwitch('#sw-priv', 'priv', 'Адреса скрыты. Наведите курсор, чтобы увидеть', 'Адреса показаны', applyView);
appSwitch('#sw-notify', 'notify', 'Будем сообщать о начале и конце трансляции', 'Уведомления выключены', (on) => { if (on) invoke('notify', { title: 'PS5 Gateway', body: 'Уведомления включены' }).catch(() => {}); });
appSwitch('#sw-ask', 'ask', 'Перед выключением шлюза спросим', 'Шлюз выключается сразу');
appSwitch('#sw-calm', 'calm', 'Анимации уменьшены', 'Анимации включены', applyView);
bindSeg('#seg-refresh', prefVal('refresh', '1500') === '1500' ? '2000' : prefVal('refresh', '2000'), (v) => { setVal('refresh', v); toast('Статус обновляется раз в ' + v / 1000 + ' с'); });
// the tray / menu bar menu is drawn by the system, so its words are sent from here
const TRAY = { ru: ['Открыть', 'Выйти'], en: ['Open', 'Quit'], uk: ['Відкрити', 'Вийти'], de: ['Öffnen', 'Beenden'], es: ['Abrir', 'Salir'] };
const syncTray = () => { const t = TRAY[prefVal('lang', 'ru')] || TRAY.ru; invoke('tray_labels', { open: t[0], quit: t[1] }).catch(() => {}); };
syncTray();
$$('.sel-lang').forEach((sel) => { sel.value = prefVal('lang', 'ru'); sel.onchange = () => { setVal('lang', sel.value); $$('.sel-lang').forEach((o) => (o.value = sel.value)); if (typeof applyLang === 'function') applyLang(); syncTray(); }; });

async function saveEnv(key, value, field, note) {
  if (!validIp(value) && !(key === 'PC_LAN_IP' && value === '')) { field.classList.add('bad'); return toast('Это не похоже на адрес. Пример: 192.168.1.50'); }
  field.classList.remove('bad');
  try { await invoke('write_env', { key, value }); env = JSON.parse(await invoke('read_env')); bindText(); fillSettings(); toast(note); }
  catch (_) { toast('Не удалось сохранить'); }
}
$('#st-ps5-save').onclick = () => saveEnv('PS5_IP', $('#st-ps5').value.trim(), $('#st-ps5'), 'Сохранено. Перезапустите шлюз, чтобы применить');
$('#st-pc-save').onclick = () => saveEnv('PC_LAN_IP', $('#st-pc').value.trim(), $('#st-pc'), 'Сохранено. Перезапустите шлюз и проверьте DNS на PS5');
async function saveKey(key, v, note, field) {
  try { await invoke('write_env', { key, value: v }); env = JSON.parse(await invoke('read_env')); bindText(); fillSettings(); toast(note); }
  catch (_) { field?.classList.add('bad'); toast('Не удалось сохранить'); }
}
$$('#dnslist [data-up]').forEach((b) => (b.onclick = () => saveKey('UPSTREAM_DNS', b.dataset.up, 'Сохранено. Перезапустите шлюз')));
$('#st-dns-save').onclick = () => {
  const a = $('#st-dns1').value.trim(), b = $('#st-dns2').value.trim();
  if (!a) return toast('Впишите хотя бы первый адрес, например 1.1.1.1');
  if (!validIp(a) || (b && !validIp(b))) { (!validIp(a) ? $('#st-dns1') : $('#st-dns2')).classList.add('bad'); return toast('Адрес в виде четырёх чисел, например 1.1.1.1'); }
  $('#st-dns1').classList.remove('bad'); $('#st-dns2').classList.remove('bad');
  saveKey('UPSTREAM_DNS', b ? a + ' ' + b : a, 'Сохранено. Перезапустите шлюз');
};
markCache = bindSeg('#seg-cache', '30', (v) => saveKey('DNS_CACHE_TTL', v === '30' ? '' : v, 'Сохранено. Перезапустите шлюз'));
markLog = bindSeg('#seg-log', 'debug', (v) => saveKey('MTX_LOG_LEVEL', v === 'debug' ? '' : v, 'Сохранено. Перезапустите шлюз'));
$('#sw-awake').onclick = async () => { const on = !$('#sw-awake').classList.contains('on'); $('#sw-awake').classList.toggle('on', on);
  try { await invoke('write_env', { key: 'KEEP_AWAKE', value: on ? '' : '0' }); env = JSON.parse(await invoke('read_env')); toast(on ? 'Mac не будет засыпать во время трансляции' : 'Mac сможет засыпать во время трансляции'); }
  catch (_) { $('#sw-awake').classList.toggle('on', !on); toast('Не удалось сохранить'); } };
$('#adv-check').onclick = async () => { const b = $('#adv-check'), d = $('#diag'); b.classList.add('busy'); d.textContent = 'Проверяем…';
  try { d.textContent = (await invoke('run_check')).trim(); } catch (e) { d.textContent = 'Не удалось запустить проверку: ' + e; } b.classList.remove('busy'); };
$('#adv-diagcopy').onclick = () => invoke('copy_text', { text: $('#diag').textContent }).then(() => toast('Результат скопирован')).catch(() => toast('Не удалось скопировать'));
$('#adv-logs').onclick = () => invoke('open_path', { which: 'logs' }).catch(() => toast('Не удалось открыть папку'));
$('#adv-env').onclick = () => invoke('open_path', { which: 'env' }).catch(() => toast('Файл настроек не найден'));
$('#adv-reset').onclick = async () => { try { for (const k of ['UPSTREAM_DNS', 'KEEP_AWAKE', 'PC_LAN_IP', 'DNS_CACHE_TTL', 'MTX_LOG_LEVEL']) await invoke('write_env', { key: k, value: '' });
  env = JSON.parse(await invoke('read_env')); bindText(); fillSettings(); toast('Расширенные настройки сброшены. Перезапустите шлюз'); } catch (_) { toast('Не удалось сбросить'); } };
let clearArmed = 0;
$('#adv-clear').onclick = async () => { const b = $('#adv-clear');
  if (!clearArmed) { clearArmed = setTimeout(() => { clearArmed = 0; b.textContent = 'Очистить логи'; }, 3000); b.textContent = 'Точно очистить?'; return; }
  clearTimeout(clearArmed); clearArmed = 0; b.textContent = 'Очистить логи';
  try { const n = await invoke('clear_logs'); toast(n ? 'Логи удалены: ' + n : 'Логов нет'); } catch (_) { toast('Не удалось очистить'); } };
applyView();
try { setMode(localStorage.getItem('setmode') === 'adv' ? 'adv' : 'basic'); } catch (_) { setMode('basic'); }

function refreshServices() {
  const names = { dns: ['работает', 'остановлена'], ingest: ['работает', 'остановлена'], relay: ['передаёт картинку', 'ждёт трансляцию'] };
  $$('#svclist .svr').forEach((row) => {
    const sv = status?.services?.find((x) => x.name === row.dataset.svc);
    const em = $('em', row), run = sv?.state === 'running';
    row.classList.toggle('ok', !!sv && run && (row.dataset.svc !== 'relay' || status.live)); row.classList.toggle('idle', !!sv && !run && row.dataset.svc === 'relay' || (!!sv && run && row.dataset.svc === 'relay' && !status.live));
    em.textContent = !status ? 'шлюз выключен' : !sv ? '—' : sv.restarts > 0 && run ? 'перезапусков: ' + sv.restarts : names[row.dataset.svc][run && (row.dataset.svc !== 'relay' || status.live) ? 0 : 1];
  });
}
// the accordions in "Common problems" open and close smoothly
$$('.faq details').forEach((d) => {
  const sum = $('summary', d), body = $('p', d); let anim = null;
  sum.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (anim) anim.cancel();
    const calm = document.documentElement.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!d.open) {
      d.open = true; if (calm) return;
      const h = body.scrollHeight; anim = body.animate([{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1)' });
      anim.onfinish = () => { anim = null; };
    } else {
      if (calm) { d.open = false; return; }
      const h = body.scrollHeight; anim = body.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 200, easing: 'ease-in' });
      anim.onfinish = () => { anim = null; d.open = false; };
    }
  });
});

/* the screenshot of the PS5 menu follows the interface language */
function applyShot() { const im = $('#ps5shot'); if (im) im.src = 'img/ps5-net-' + prefVal('lang', 'ru') + '.jpg'; }
$$('.sel-lang').forEach((sel) => sel.addEventListener('change', applyShot)); applyShot();

/* ---------- another program: one dialog with everything about it ---------- */
let progBefore = 'obs';
function openProgDlg() {
  progBefore = program === 'custom' ? progBefore : program;
  $('#prog-name').value = customName(); $('#prog-name').classList.remove('bad');
  $('#prog-msg').textContent = 'Пишите так, как программа называется в папке «Программы»: например Twitch Studio, vMix или Wirecast.'; $('#prog-msg').classList.remove('err');
  $('#prog-url').textContent = relayUrl(); $('#dlg-prog').hidden = false; setTimeout(() => $('#prog-name').focus(), 50);
}
const closeProgDlg = () => { $('#dlg-prog').hidden = true; syncProgram(); };
$('#prog-cancel').onclick = closeProgDlg;
$('#prog-copy').onclick = () => invoke('copy_text', { text: relayUrl() }).then(() => toast('Адрес скопирован')).catch(() => toast('Не удалось скопировать'));
$('#prog-save').onclick = async () => {
  const name = $('#prog-name').value.trim(), msg = $('#prog-msg');
  if (!name) { $('#prog-name').classList.add('bad'); msg.textContent = 'Впишите название программы'; msg.classList.add('err'); return; }
  const ok = await invoke('app_exists', { name }).catch(() => false);
  if (!ok) { $('#prog-name').classList.add('bad'); msg.textContent = name + ' не найден'; msg.classList.add('err'); return; }
  try { localStorage.setItem('program-custom', name); } catch (_) {}
  setProgram('custom'); $('#dlg-prog').hidden = true; toast('Программа сохранена');
};

$$('#seg-dnsmode button').forEach((b) => (b.onclick = () => setDnsMode(b.dataset.v, true)));

/* two panels that replace each other: the old one fades out, the new one slides in */
function swapPanels(from, to) {
  if (!from || !to || from === to) { if (to) to.hidden = false; return; }
  const calm = document.documentElement.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (calm || from.hidden) { from.hidden = true; to.hidden = false; return; }
  const out = from.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 130, easing: 'ease-in' });
  out.onfinish = () => { from.hidden = true; to.hidden = false; to.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.3,1)' }); };
}
/* the start screen goes away once the first screen is ready */
function hideSplash() { const sp = $('#splash'); if (!sp) return; sp.classList.add('gone'); setTimeout(() => sp.remove(), 400); }
setTimeout(hideSplash, 5000);

/* ---------- updates: look at GitHub releases, replace the project files ---------- */
let upd = null, updBusy = false;
async function checkUpdate(manual) {
  const b = $('#upd-check'); if (manual) b.classList.add('busy');
  try {
    upd = JSON.parse(await invoke('update_check'));
    setVal('upd-last', String(Date.now()));
    paintUpdate();
    if (manual && !upd.newer) toast('У вас последняя версия');
    if (manual && upd.newer) openUpdDlg();
  } catch (_) { if (manual) toast('Не удалось проверить обновления: нет связи с GitHub'); }
  b.classList.remove('busy');
}
function paintUpdate() {
  $('#ver-num').textContent = upd?.current || $('#ver-num').textContent; $('#ver-foot').textContent = upd?.current || $('#ver-foot').textContent;
  const last = Number(prefVal('upd-last', '0')); const when = last ? new Date(last).toLocaleString() : '';
  const stat = $('#upd-status');
  if (upd?.newer) stat.textContent = 'Доступна новая версия ' + upd.latest; else stat.textContent = last ? 'Последняя версия. Проверено: ' + when : 'Последняя проверка: ещё не было';
  $('#upd-go').hidden = !upd?.newer; $('#upd-go').textContent = upd?.newer ? 'Обновить до ' + upd.latest : 'Обновить';
  $('#upd-pill').hidden = !upd?.newer; if (upd?.newer) $('#upd-ver').textContent = upd.latest;
}
function openUpdDlg() {
  if (!upd?.newer) return;
  $('#upd-title').textContent = 'Доступна новая версия ' + upd.latest;
  $('#upd-notes').textContent = (upd.notes || '').trim() || 'Описание изменений не указано.';
  $('#upd-prog').hidden = true; $('#upd-msg').hidden = true; $('#upd-now').hidden = false; $('#upd-later').hidden = false; $('#upd-later').textContent = 'Позже'; $('#upd-notes').hidden = false;
  $('#dlg-upd').hidden = false;
}
function updStep(text, pct) { $('#upd-step').textContent = text; $('#upd-bar').style.width = pct + '%'; }
async function applyUpdate() {
  if (updBusy || !upd?.newer) return; updBusy = true;
  $('#upd-now').hidden = true; $('#upd-later').hidden = true; $('#upd-msg').hidden = true; $('#upd-prog').hidden = false;
  try {
    if (!upd.assetUrl || !upd.sumsUrl) throw new Error(OS === 'win' ? 'в релизе нет архива для Windows' : 'в релизе нет архива для macOS');
    updStep('Скачиваем обновление…', 25);
    const stage = await invoke('update_download', { assetUrl: upd.assetUrl, assetName: upd.assetName, sumsUrl: upd.sumsUrl });
    updStep('Устанавливаем…', 70);
    await invoke('update_install', { stage });
    updStep('Обновлено', 100);
    $('#upd-title').textContent = 'Обновлено'; $('#upd-notes').hidden = true;
    $('#upd-msg').hidden = false; $('#upd-msg').classList.remove('err'); $('#upd-msg').textContent = 'Файлы обновлены. Перезапускаем приложение…';
    setTimeout(() => invoke('restart_app').catch(() => { $('#upd-msg').textContent = 'Файлы обновлены. Закройте приложение и откройте снова.'; $('#upd-later').hidden = false; $('#upd-later').textContent = 'Закрыть'; }), 1600);
    upd = null; $('#upd-pill').hidden = true; $('#upd-go').hidden = true; $('#ver-num').textContent = '…';
    invoke('app_version').then((v) => { $('#ver-num').textContent = v; $('#ver-foot').textContent = v; $('#upd-status').textContent = 'Последняя версия'; }).catch(() => {});
  } catch (e) {
    $('#upd-prog').hidden = true; $('#upd-msg').hidden = false; $('#upd-msg').classList.add('err');
    $('#upd-msg').textContent = String(e).replace(/^Error: /, ''); $('#upd-now').hidden = false; $('#upd-later').hidden = false; $('#upd-title').textContent = 'Не удалось обновить';
  }
  updBusy = false;
}
$('#upd-pill').onclick = openUpdDlg; $('#upd-go').onclick = openUpdDlg; $('#upd-check').onclick = () => checkUpdate(true);
$('#upd-now').onclick = applyUpdate; $('#upd-later').onclick = () => { if (!updBusy) $('#dlg-upd').hidden = true; };
$('#sw-updauto').classList.toggle('on', prefSet('updauto'));
$('#sw-updauto').onclick = () => { const on = !$('#sw-updauto').classList.contains('on'); $('#sw-updauto').classList.toggle('on', on); setPref('updauto', on); toast(on ? 'Будем проверять обновления сами' : 'Обновления проверяются только вручную'); };
invoke('app_version').then((v) => { $('#ver-num').textContent = v; $('#ver-foot').textContent = v; }).catch(() => {});
paintUpdate();
// once in six hours, a little after the start, unless the user switched it off
setTimeout(() => { const last = Number(prefVal('upd-last', '0')); if (prefSet('updauto') && Date.now() - last > 6 * 3600 * 1000) checkUpdate(false); }, 6000);
