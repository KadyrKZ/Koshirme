import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import {
  MacApplicationControl,
  type RunningApplication,
} from '../apps/student-desktop/src/services/application-control';
const app: RunningApplication = { pid: 123, name: 'Test document', path: '/Test.app', launched: 1 };
test('application closure needs consent, and an unsaved application blocks readiness', async () => {
  let quits = 0;
  const denied = new MacApplicationControl(
    {
      list: async () => [app],
      quit: async () => {
        quits++;
      },
    },
    async () => false,
    () => {},
    5,
    5,
  );
  await assert.rejects(denied.prepare(new AbortController().signal), /отменена/);
  assert.equal(quits, 0);
  denied.close();
  const blocked = new MacApplicationControl(
    {
      list: async () => [app],
      quit: async () => {
        quits++;
      },
    },
    async () => true,
    () => {},
    5,
    5,
  );
  await assert.rejects(blocked.prepare(new AbortController().signal), /Test document/);
  blocked.setActive(true);
  await delay(20);
  assert.equal(quits, 1);
  blocked.close();
});
test('cancelled preparation cannot close an app after a delayed consent', async () => {
  let release!: (value: boolean) => void,
    quits = 0;
  const control = new MacApplicationControl(
    {
      list: async () => [app],
      quit: async () => {
        quits++;
      },
    },
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    () => {},
  );
  const abort = new AbortController();
  const preparing = control.prepare(abort.signal);
  await delay(0);
  abort.abort();
  release(true);
  await assert.rejects(preparing);
  assert.equal(quits, 0);
  control.close();
});
test('active monitoring closes reopened apps; pause and close cancel pending checks', async () => {
  let apps: RunningApplication[] = [],
    quits = 0;
  const control = new MacApplicationControl(
    {
      list: async () => apps,
      quit: async () => {
        quits++;
        apps = [];
      },
    },
    async () => true,
    () => {},
    20,
    5,
  );
  await control.prepare(new AbortController().signal);
  control.setActive(true);
  apps = [app];
  for (let i = 0; i < 40 && quits === 0; i++) await delay(5);
  assert.equal(quits, 1);
  control.setActive(false);
  apps = [{ ...app, pid: 124 }];
  await delay(30);
  assert.equal(quits, 1);
  control.close();
  control.setActive(true);
  await delay(15);
  assert.equal(quits, 1);
});
test('a list result arriving after pause cannot issue new quit requests', async () => {
  let release!: (apps: RunningApplication[]) => void,
    armed = false,
    quits = 0;
  const control = new MacApplicationControl(
    {
      list: async () =>
        armed
          ? new Promise((resolve) => {
              release = resolve;
            })
          : [],
      quit: async () => {
        quits++;
      },
    },
    async () => true,
    () => {},
    20,
    5,
  );
  await control.prepare(new AbortController().signal);
  armed = true;
  control.setActive(true);
  await delay(0);
  control.setActive(false);
  release([app]);
  await delay(15);
  assert.equal(quits, 0);
  control.close();
});
