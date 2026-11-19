import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
export interface RunningApplication {
  pid: number;
  name: string;
  path: string;
  launched: number;
}
export interface ApplicationDriver {
  list(signal: AbortSignal): Promise<RunningApplication[]>;
  quit(app: RunningApplication, signal: AbortSignal): Promise<void>;
}
export interface ApplicationControl {
  prepare(signal: AbortSignal): Promise<void>;
  setActive(active: boolean): void;
  close(): void;
}
export function nativeApplicationDriver(binary: string): ApplicationDriver {
  const run = (args: string[], signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      execFile(binary, args, { signal, timeout: 8000, maxBuffer: 1024 * 1024 }, (error, stdout) =>
        error ? reject(error) : resolve(stdout),
      );
    });
  return {
    async list(signal) {
      try {
        return JSON.parse(await run(['list'], signal));
      } catch (error) {
        signal.throwIfAborted();
        throw new Error('Не удалось проверить открытые приложения macOS. Перезапустите Коширме.');
      }
    },
    async quit(app, signal) {
      try {
        await run(['quit', String(app.pid), app.path, String(app.launched)], signal);
      } catch (error) {
        signal.throwIfAborted();
        throw new Error(
          'Не удалось закрыть «' + app.name + '». Сохраните работу и закройте приложение вручную.',
        );
      }
    },
  };
}
export class ApplicationController implements ApplicationControl {
  private active = false;
  private prepared = false;
  private closed = false;
  private watch: AbortController | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private requested = new Map<string, number>();
  constructor(
    private driver: ApplicationDriver,
    private consent: (apps: RunningApplication[]) => Promise<boolean>,
    private status: (error: string | null) => void,
    private settleMs = 10000,
    private intervalMs = 2000,
  ) {}
  private async sweep(signal: AbortSignal) {
    const deadline = Date.now() + this.settleMs;
    for (const [key, time] of this.requested)
      if (Date.now() - time > 30000) this.requested.delete(key);
    do {
      signal.throwIfAborted();
      const apps = await this.driver.list(signal);
      signal.throwIfAborted();
      if (!apps.length) {
        this.status(null);
        return;
      }
      for (const app of apps) {
        signal.throwIfAborted();
        const key = app.pid + ':' + app.launched;
        if (Date.now() - (this.requested.get(key) ?? 0) < 30000) continue;
        this.requested.set(key, Date.now());
        await this.driver.quit(app, signal);
      }
      if (Date.now() >= deadline)
        throw new Error(
          'Сохраните работу и закройте приложения: ' + apps.map((a) => a.name).join(', '),
        );
      await delay(Math.min(250, Math.max(1, deadline - Date.now())), undefined, { signal });
    } while (!signal.aborted);
    signal.throwIfAborted();
  }
  async prepare(signal: AbortSignal) {
    if (this.closed) throw new Error('Приложение закрывается');
    this.prepared = false;
    const apps = await this.driver.list(signal);
    signal.throwIfAborted();
    if (!(await this.consent(apps)))
      throw new Error('Подготовка отменена. Сохраните работу перед началом контеста.');
    signal.throwIfAborted();
    this.requested.clear();
    await this.sweep(signal);
    signal.throwIfAborted();
    this.prepared = true;
  }
  setActive(active: boolean) {
    active = active && this.prepared && !this.closed;
    if (active === this.active) return;
    this.active = active;
    this.watch?.abort();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!active) return;
    const watch = (this.watch = new AbortController());
    const tick = async () => {
      if (this.busy || watch.signal.aborted) return;
      this.busy = true;
      try {
        await this.sweep(watch.signal);
      } catch (error) {
        if (!watch.signal.aborted) this.status(String((error as Error).message));
      } finally {
        this.busy = false;
      }
    };
    this.timer = setInterval(() => void tick(), this.intervalMs);
    void tick();
  }
  close() {
    this.closed = true;
    this.setActive(false);
    this.watch?.abort();
  }
}

// Compatibility for existing macOS consumers.
export { ApplicationController as MacApplicationControl };
