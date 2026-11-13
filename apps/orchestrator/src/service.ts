import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mask } from './mask.ts';

export type ServiceState = 'stopped' | 'running' | 'crashed';

export interface ServiceOpts {
  name: string;
  cmd: string;
  args: () => string[];
  cwd: string;
  logFile: string;
  restartDelayMs: number;
  /** Получает СЫРУЮ строку. Вернуть false, чтобы не писать её в лог (спам, чужие запросы). */
  onLine: (raw: string) => boolean | void;
}

export class Service {
  readonly name: string;
  state: ServiceState = 'stopped';
  pid = 0;
  restarts = 0;
  startedAt = 0;
  lastExit = '';
  private o: ServiceOpts;
  private child: ChildProcess | null = null;
  private log: WriteStream | null = null;
  private want = false;
  private manual = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(o: ServiceOpts) {
    this.o = o;
    this.name = o.name;
  }

  start(): void {
    this.want = true;
    if (this.child) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const child = spawn(this.o.cmd, this.o.args(), {
      cwd: this.o.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    this.pid = child.pid ?? 0;
    this.startedAt = Date.now();
    this.state = 'running';
    this.write(`--- start pid=${this.pid}`);

    for (const stream of [child.stdout, child.stderr]) {
      let buf = '';
      stream?.setEncoding('utf8');
      stream?.on('data', (chunk: string) => {
        buf += chunk;
        const parts = buf.split(/[\r\n]+/);
        buf = parts.pop() ?? '';
        for (const l of parts) this.line(l);
      });
    }
    child.on('error', (e) => {
      this.lastExit = e.message;
      if (child.pid === undefined) this.afterExit(); // не удалось запустить
    });
    child.on('exit', (code, sig) => {
      this.lastExit = `code=${code} signal=${sig}`;
      this.write(`--- exit ${this.lastExit}`);
      this.afterExit();
    });
  }

  // child.kill() на Windows убивает только сам процесс; taskkill /T снимает и его потомков (ffmpeg, Chrome)
  private killTree(): void {
    const pid = this.child?.pid;
    if (!pid) return;
    try { spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => this.child?.kill()); }
    catch { this.child?.kill(); }
  }

  stop(): void {
    this.want = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.killTree();
    if (!this.child) this.state = 'stopped';
  }

  restart(): void {
    this.want = true;
    this.manual = true;
    if (this.child) this.killTree();
    else this.start();
  }

  private afterExit(): void {
    this.child = null;
    this.pid = 0;
    if (!this.want) {
      this.state = 'stopped';
      return;
    }
    this.state = 'crashed';
    if (this.manual) this.manual = false;
    else this.restarts++;
    this.timer = setTimeout(() => this.start(), this.o.restartDelayMs);
  }

  private line(raw: string): void {
    if (!raw.trim()) return;
    const keep = this.o.onLine(raw);
    if (keep !== false) this.write(raw);
  }

  private write(l: string): void {
    if (!this.log) {
      this.log = createWriteStream(this.o.logFile, { flags: 'a' });
      this.log.on('error', () => {}); // занятый или недоступный лог не должен ронять оркестратор
    }
    this.log.write(`[${new Date().toISOString()}] ${mask(l)}\n`);
  }
}
