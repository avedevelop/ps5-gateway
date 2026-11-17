/* The check (scripts/doctor.mjs) speaks English. Its lines are shown in the interface language, using the "doctor" lists of
   strings/<lang>.js: [regular expression, replacement]. A line that matches nothing is shown as it is. English: untouched. */
function doctorText(s) {
  let lg = 'ru'; try { lg = localStorage.getItem('val-lang') || 'ru'; } catch (_) {}
  if (lg === 'en' || !s || !STRINGS[lg]) return s;
  const t = s.trim();
  for (const [re, rep] of STRINGS[lg].doctor) { if (re.test(t)) return t.replace(re, rep); }
  return s;
}
