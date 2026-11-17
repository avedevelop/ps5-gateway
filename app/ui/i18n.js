/* Interface language. The interface text is written in Russian; the other languages are applied on top by replacing
   whole phrases (and a few patterns for texts that are put together at run time). The texts live in strings/<lang>.js.
   Nothing here changes behaviour. */
const LANGS = ['en', 'uk', 'de', 'es'];
const DICT = {}, PATTERNS_BY = {};
for (const lg of LANGS) {
  const S = STRINGS[lg];
  DICT[lg] = { ...S.phrases };
  PATTERNS_BY[lg] = S.patterns;
}
// Windows: the dictionaries are keyed by the (macOS) Russian source, so re-key them to the Windows source (os.js)
// and add the phrases that exist only in the Windows wording.
if (OS === 'win') {
  for (const lg of LANGS) {
    const nd = {};
    for (const k in DICT[lg]) nd[osText(k)] = String(DICT[lg][k]).replace(/Cmd\+/g, 'Ctrl+');
    Object.assign(nd, STRINGS[lg].win);
    DICT[lg] = nd;
  }
}

(function () {
  const key = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const translate = (s) => {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = key(m[2]);
    if (!core) return null;
    const lg = lang();
    let out = DICT[lg] && DICT[lg][core];
    if (out === undefined) for (const [re, rep] of (PATTERNS_BY[lg] || [])) if (re.test(core)) { out = core.replace(re, rep); break; }
    return out === undefined ? null : m[1] + out + m[3];
  };
  const origText = new Map(), origAttr = new Map();
  let busy = false;
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  const lang = () => { try { return localStorage.getItem('val-lang') || 'ru'; } catch (_) { return 'ru'; } };
  const english = () => lang() !== 'ru';

  function doNode(n) {
    if (n.nodeType === 3) {
      const t = n.nodeValue, en = translate(t);
      if (en !== null && en !== t) { if (!origText.has(n)) origText.set(n, t); n.nodeValue = en; }
    } else if (n.nodeType === 1) {
      if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE') return;
      for (const a of ATTRS) if (n.hasAttribute(a)) { const v = n.getAttribute(a), en = translate(v); if (en !== null && en !== v) { origAttr.set(n + '|' + a, [n, a, v]); n.setAttribute(a, en); } }
      n.childNodes.forEach(doNode);
    }
  }
  function revert() {
    origText.forEach((v, n) => { if (n.isConnected) n.nodeValue = v; }); origText.clear();
    origAttr.forEach(([n, a, v]) => { if (n.isConnected) n.setAttribute(a, v); }); origAttr.clear();
  }
  const mo = new MutationObserver((list) => {
    if (busy || !english()) return;
    busy = true;
    try { for (const m of list) { if (m.type === 'characterData') doNode(m.target); else if (m.type === 'attributes') doNode(m.target); else m.addedNodes.forEach(doNode); } } finally { busy = false; }
  });
  window.applyLang = function () {
    busy = true;
    try { revert(); if (english()) doNode(document.body); document.documentElement.lang = lang(); } finally { busy = false; }
  };
  mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  window.applyLang();
})();
