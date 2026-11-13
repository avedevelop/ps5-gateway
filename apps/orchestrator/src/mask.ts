// Любая строка, уходящая в лог или на дашборд, проходит через mask().
const KEY_RE = /live_\d+_[A-Za-z0-9]+/g;
const secrets = new Set<string>();

export function addSecret(s: string): void {
  if (s.length >= 8) secrets.add(s);
}

export function mask(line: string): string {
  let out = line.replace(KEY_RE, 'live_***');
  for (const s of secrets) out = out.split(s).join('***');
  return out;
}
