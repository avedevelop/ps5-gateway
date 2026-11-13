// Reads KEY=VALUE files. Later files override earlier ones; missing files are skipped.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function readEnvFiles(root, names) {
  const out = {};
  for (const n of names) {
    const p = join(root, n);
    if (!existsSync(p)) continue;
    for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Za-z_]\w*)=(.*)$/.exec(l);
      if (m) out[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
    }
  }
  return out;
}
