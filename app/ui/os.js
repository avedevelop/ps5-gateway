/* Operating system layer. The interface text is written for macOS (Russian source phrases). On Windows the phrases
   listed in OS_SWAP are replaced by Windows wording; their translations are the "win" lists of strings/<lang>.js, so every
   language gets the right text. Nothing here changes behaviour except which words are shown. */
const OS = /Windows/i.test(navigator.userAgent) ? 'win' : 'mac';
document.documentElement.dataset.os = OS;

// [macOS phrase, Windows phrase] (Russian source). Longer phrases first.
const OS_SWAP = [
  ['Если брандмауэр включён, он может не пускать PS5. Разрешите входящие подключения для CoreDNS и MediaMTX один раз; «Проверка» подскажет точную команду.',
   'Если брандмауэр включён, он может не пускать PS5. Разрешите входящие подключения один раз: запустите scripts\\firewall.ps1 от имени администратора.'],
  ['Название программы, как в папке «Программы»', 'Название программы, как в меню «Пуск»'],
  ['Mac не будет засыпать во время трансляции', 'Компьютер не будет засыпать во время трансляции'],
  ['Mac сможет засыпать во время трансляции', 'Компьютер сможет засыпать во время трансляции'],
  ['Брандмауэр macOS блокирует шлюз', 'Брандмауэр Windows блокирует шлюз'],
  ['шлюз включается вместе с Mac', 'шлюз включается вместе с Windows'],
  ['системное уведомление macOS', 'системное уведомление Windows'],
  ['Не давать Mac засыпать', 'Не давать компьютеру засыпать'],
  ['на MacBook по умолчанию другой формат', ''],
  ['Cmd+R, затем Cmd+F', 'Ctrl+R, затем Ctrl+F'],
];

/** Russian source text for the current system. */
function osText(s) {
  if (OS !== 'win' || typeof s !== 'string') return s;
  for (const [mac, win] of OS_SWAP) if (s.includes(mac)) s = s.split(mac).join(win);
  return s;
}

if (OS === 'win') {
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  const walk = (n) => {
    if (n.nodeType === 3) { const v = osText(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    else if (n.nodeType === 1 && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE') {
      for (const a of ATTRS) if (n.hasAttribute(a)) { const v = osText(n.getAttribute(a)); if (v !== n.getAttribute(a)) n.setAttribute(a, v); }
      n.childNodes.forEach(walk);
    }
  };
  walk(document.body);
}
