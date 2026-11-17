// Every line the check (scripts/doctor.mjs) can print must have a translation in all interface languages.
// The messages are read from the source: ok/warn/bad calls with a message and an optional fix text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../scripts/doctor.mjs', import.meta.url), 'utf8');
const ctx = { localStorage: { getItem: () => null } };
vm.createContext(ctx); ctx.window = ctx;
for (const lg of ['ru', 'uk', 'de', 'es']) vm.runInContext(readFileSync(new URL(`../app/ui/strings/${lg}.js`, import.meta.url), 'utf8'), ctx);
const LANGS = ['ru', 'uk', 'de', 'es'];
const rowsOf = (lg) => ctx.STRINGS[lg].doctor;

// Walk the source and collect the string literals that are arguments of ok(), warn() and bad().
// A literal is 'x', "x" or `x` (template placeholders ${...} become a sample value).
function readLiteral(text, i) {
  const q = text[i];
  if (q !== "'" && q !== '"' && q !== '`') return null;
  let out = '';
  for (let j = i + 1; j < text.length; j++) {
    const c = text[j];
    if (c === '\\') { out += text[j + 1]; j++; continue; }
    if (q === '`' && c === '$' && text[j + 1] === '{') { // skip a placeholder, braces may nest
      let depth = 0; let k = j + 1;
      for (; k < text.length; k++) { if (text[k] === '{') depth++; else if (text[k] === '}' && --depth === 0) break; }
      // a conditional placeholder (a ? b : c) stands for an optional suffix such as " (from .env)"; the others for a number or address
      out += /\?/.test(text.slice(j, k)) ? ' (from .env)' : '1'; j = k; continue;
    }
    if (c === q) return { value: out, end: j + 1 };
    out += c;
  }
  return null;
}

function messages() {
  const out = [];
  const re = /\b(ok|warn|bad)\(\s*/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    const first = readLiteral(src, i);
    if (!first) continue; // the helper definitions: ok = (m) => ...
    out.push(['msg', first.value]);
    i = first.end;
    // an optional second argument: the fix text, either one literal or WIN ? 'a' : 'b'
    const rest = src.slice(i).match(/^\s*,\s*(WIN\s*\?\s*)?/);
    if (!rest) continue;
    i += rest[0].length;
    const a = readLiteral(src, i);
    if (!a) continue;
    out.push(['fix', a.value]);
    if (rest[1]) { const sep = src.slice(a.end).match(/^\s*:\s*/); if (sep) { const b = readLiteral(src, a.end + sep[0].length); if (b) out.push(['fix', b.value]); } }
  }
  return out;
}

// commands to type are shown as they are, in every language
const isCommand = (t) => /^(node|brew|sh|sudo|powershell) /.test(t) || /sudo /.test(t);

test('doctor messages are covered by every interface language', () => {
  const list = messages();
  assert.ok(list.length > 12, 'found the messages in doctor.mjs: ' + list.length);
  for (const lg of LANGS) {
    const missing = list.filter(([, t]) => t && !isCommand(t) && !rowsOf(lg).some(([re]) => re.test(t.trim()))).map(([k, t]) => `${k}: ${t}`);
    assert.deepEqual(missing, [], `no ${lg} translation for: ` + missing.join(' | '));
  }
});

test('the languages translate the same lines', () => {
  const ref = rowsOf('ru').map(([re]) => String(re));
  for (const lg of LANGS) assert.deepEqual(rowsOf(lg).map(([re]) => String(re)), ref, lg);
});
