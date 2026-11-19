import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { windowsApplicationDriver } from '../apps/student-desktop/src/services/windows-application-driver';
const app = {
  pid: 500,
  name: 'Notepad',
  path: 'C:\\Program Files\\Notepad\\Notepad.exe',
  launched: 1700000000000,
};
test('Windows driver carries app identity as data and handles list cardinality', async () => {
  const calls: object[] = [];
  let result: unknown = [];
  const driver = windowsApplicationDriver('fixture.exe', 123, async (payload) => {
    calls.push(payload);
    if ('action' in payload && payload.action === 'quit') return 'true';
    return JSON.stringify(result);
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await driver.list(signal), []);
  result = [app];
  assert.deepEqual(await driver.list(signal), [app]);
  await driver.quit(app, signal);
  assert.deepEqual(calls.at(-1), { action: 'quit', ownerPid: 123, app });
  result = [app, { ...app, pid: 501 }];
  assert.equal((await driver.list(signal)).length, 2);
});
test('Windows driver refuses malformed results and exposes policy failures', async () => {
  for (const result of ['{}', 'null', '[{}]', '[{"pid":-1}]', 'broken']) {
    const driver = windowsApplicationDriver(
      'fixture.exe',
      123,
      async () => result,
      () => {},
    );
    await assert.rejects(driver.list(new AbortController().signal), /Не удалось проверить/);
  }
  const driver = windowsApplicationDriver(
    'fixture.exe',
    123,
    async () => {
      throw Error('Access denied');
    },
    () => {},
  );
  await assert.rejects(
    driver.quit(app, new AbortController().signal),
    /закройте приложение вручную/,
  );
});
test('cancelled Windows checks issue no requests', async () => {
  let calls = 0;
  const abort = new AbortController();
  abort.abort();
  const driver = windowsApplicationDriver('fixture.exe', 123, async () => {
    calls++;
    return '[]';
  });
  await assert.rejects(driver.list(abort.signal));
  await assert.rejects(driver.quit(app, abort.signal));
  assert.equal(calls, 0);
});

test('Windows blockers with denied access cannot be closed or forgotten after their window hides', async () => {
  const calls: object[] = [];
  const logs: Record<string, unknown>[] = [];
  const inaccessible = { ...app, path: '', launched: 0 };
  const driver = windowsApplicationDriver(
    'fixture.exe',
    123,
    async (payload) => {
      calls.push(payload);
      return 'action' in payload && payload.action === 'quit'
        ? 'true'
        : JSON.stringify([inaccessible]);
    },
    (entry) => logs.push(entry),
  );
  const signal = new AbortController().signal;
  await driver.quit(app, signal);
  assert.deepEqual(await driver.list(signal), [inaccessible]);
  await assert.rejects(driver.quit(inaccessible, signal), /закройте приложение вручную/);
  assert.deepEqual(await driver.list(signal), [inaccessible]);
  assert.deepEqual(calls.slice(1), [
    { action: 'list', ownerPid: 123, pending: [app] },
    { action: 'list', ownerPid: 123, pending: [app] },
  ]);
  assert.equal(logs[0].stage, 'validate-close-target');
  assert.equal(logs[0].pid, app.pid);
});

test('Windows launch and response errors retain their underlying details', async () => {
  const logs: Record<string, unknown>[] = [];
  const failure = Object.assign(new Error('Access is denied'), {
    code: 'EACCES',
    errno: -4092,
    syscall: 'spawn',
  });
  const driver = windowsApplicationDriver(
    'fixture.exe',
    123,
    async () => {
      throw failure;
    },
    (entry) => logs.push(entry),
  );
  await assert.rejects(driver.list(new AbortController().signal), { cause: failure });
  assert.equal(logs[0].code, 'EACCES');
  assert.equal(logs[0].errno, -4092);
  assert.equal(logs[0].stage, 'run-helper');
  assert.equal(logs[0].ownerPid, 123);
});

test(
  'Windows helper checks a real owner named KOSH!RME.exe and reports native failures',
  {
    skip: process.platform !== 'win32' || process.arch !== 'x64',
    timeout: 30000,
  },
  async () => {
    const desktop = fileURLToPath(new URL('../apps/student-desktop/', import.meta.url));
    execFileSync(process.execPath, [join(desktop, 'scripts', 'build-native-windows.mjs')]);
    const helper = join(desktop, 'native', 'bin', 'koshirme-app-guard.exe');
    const directory = await mkdtemp(join(tmpdir(), 'Koshirme-'));
    const ownerPath = join(directory, 'KOSH!RME.exe');
    await copyFile(process.execPath, ownerPath);
    const owner = spawn(ownerPath, ['-e', "console.log('ready'); setInterval(() => {}, 1000)"], {
      windowsHide: true,
    });
    const exited = once(owner, 'exit');
    try {
      await once(owner.stdout, 'data');
      const signal = AbortSignal.timeout(12000);
      const list = await windowsApplicationDriver(helper, owner.pid).list(signal);
      assert.ok(list.every((item) => item.pid !== owner.pid));
      const logs: Record<string, unknown>[] = [];
      const invalid = windowsApplicationDriver(helper, 2147483647, undefined, (entry) =>
        logs.push(entry),
      );
      await assert.rejects(invalid.list(signal), /Не удалось проверить/);
      assert.ok(
        logs.some(
          (entry) =>
            entry.stage === 'guard-session' &&
            entry.api === 'ProcessIdToSessionId' &&
            entry.pid === 2147483647 &&
            Number.isInteger(entry.win32Code) &&
            entry.exception === 'System.ComponentModel.Win32Exception',
        ),
      );
    } finally {
      owner.kill();
      await exited;
      await rm(directory, { recursive: true, force: true });
    }
  },
);
