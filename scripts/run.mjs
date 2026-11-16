// npm start / npm stop: runs the start or stop script of this operating system.
//   node scripts/run.mjs start|stop [extra arguments]
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [what, ...rest] = process.argv.slice(2);
if (what !== 'start' && what !== 'stop') { console.error('Usage: node scripts/run.mjs start|stop'); process.exit(1); }
const here = dirname(fileURLToPath(import.meta.url));
const r = process.platform === 'win32'
  ? spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(here, `${what}.ps1`), ...rest], { stdio: 'inherit' })
  : spawnSync('sh', [join(here, `${what}.sh`), ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 1);
