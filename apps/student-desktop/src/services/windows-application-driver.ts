import { execFile } from 'node:child_process';
import type { ApplicationDriver, RunningApplication } from './application-control';

export type WindowsGuardTransport = (payload: object, signal: AbortSignal) => Promise<string>;
type Diagnostic = Record<string, unknown>;

export function windowsApplicationDriver(
  helper: string,
  ownerPid = process.pid,
  transport?: WindowsGuardTransport,
  log: (entry: Diagnostic) => void = console.error,
): ApplicationDriver {
  function report(diagnostic: Diagnostic) {
    log({ component: 'windows-application-check', ownerPid, ...diagnostic });
  }
  const invoke: WindowsGuardTransport =
    transport ??
    ((payload, signal) =>
      new Promise((resolve, reject) => {
        const child = execFile(
          helper,
          [],
          { signal, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024, encoding: 'utf8' },
          (error, stdout, stderr) => {
            if (!signal.aborted) {
              for (const line of stderr.trim().split(/\r?\n/).filter(Boolean)) {
                try {
                  report({ helperPid: child.pid, ...JSON.parse(line) });
                } catch {
                  report({ stage: 'helper-stderr', helperPid: child.pid, message: line });
                }
              }
            }
            if (error) reject(error);
            else resolve(stdout);
          },
        );
        child.stdin?.on('error', (error) => {
          if (!signal.aborted)
            report({
              stage: 'send-request',
              api: 'child.stdin',
              helperPid: child.pid,
              ...describe(error),
            });
        });
        child.stdin?.end(JSON.stringify(payload), 'utf8');
      }));

  function describe(value: unknown) {
    const error = value as NodeJS.ErrnoException | undefined;
    return {
      exception: error?.name,
      message: error?.message ?? String(value),
      code: error?.code,
      errno: error?.errno,
      syscall: error?.syscall,
      signal: (error as { signal?: string } | undefined)?.signal,
    };
  }

  const pending = new Map<number, RunningApplication>();
  return {
    async list(signal) {
      let stage = 'run-helper';
      try {
        signal.throwIfAborted();
        const response = await invoke(
          { action: 'list', ownerPid, pending: [...pending.values()] },
          signal,
        );
        signal.throwIfAborted();
        stage = 'validate-response';
        const result: unknown = JSON.parse(response.replace(/^\uFEFF/, ''));
        if (
          !Array.isArray(result) ||
          !result.every(
            (a) =>
              a &&
              Number.isSafeInteger(a.pid) &&
              a.pid > 0 &&
              typeof a.name === 'string' &&
              a.name.length > 0 &&
              typeof a.path === 'string' &&
              Number.isSafeInteger(a.launched) &&
              a.launched >= 0,
          )
        )
          throw Error('Invalid application list');
        for (const [pid, old] of pending) {
          if (
            !result.some(
              (a) =>
                a.pid === pid &&
                (!a.path ||
                  (a.path.toLowerCase() === old.path.toLowerCase() && a.launched === old.launched)),
            )
          )
            pending.delete(pid);
        }
        return result as RunningApplication[];
      } catch (error) {
        signal.throwIfAborted();
        report({
          action: 'list',
          stage,
          api: stage === 'run-helper' ? 'execFile' : 'JSON.parse',
          ...describe(error),
        });
        throw new Error('Не удалось проверить приложения Windows. Подробности в журнале Коширме.', {
          cause: error,
        });
      }
    },
    async quit(app, signal) {
      let stage = 'run-helper';
      try {
        signal.throwIfAborted();
        if (!app.path || app.launched <= 0) {
          stage = 'validate-close-target';
          throw new Error('Application identity is unavailable');
        }
        pending.set(app.pid, app);
        const response = await invoke({ action: 'quit', ownerPid, app }, signal);
        signal.throwIfAborted();
        stage = 'validate-response';
        if (response.trim() !== 'true') throw new Error('Invalid close response');
      } catch (error) {
        signal.throwIfAborted();
        report({ action: 'quit', stage, pid: app.pid, ...describe(error) });
        throw new Error(
          'Не удалось закрыть «' + app.name + '». Сохраните работу и закройте приложение вручную.',
          { cause: error },
        );
      }
    },
  };
}
