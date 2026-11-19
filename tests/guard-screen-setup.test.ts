import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenSetup } from '../apps/student-desktop/src/services/screen-setup';

test('screen setup exercises capture while opening, even when the OS reports granted', async () => {
  let complete!: () => void;
  let calls = 0;
  const setup = new ScreenSetup(
    () => 'granted',
    () => {
      calls++;
      return new Promise<void>((resolve) => {
        complete = resolve;
      });
    },
    assert.fail,
  );
  assert.equal(setup.status(), 'checking');
  const check = setup.check();
  assert.equal(setup.check(), check);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(setup.status(), 'checking');
  complete();
  await check;
  assert.equal(setup.status(), 'granted');
});

test('allowing capture in System Settings requires a fresh successful capture check', async () => {
  let permission = 'not-determined';
  let captureFails = true;
  const reported: unknown[] = [];
  const setup = new ScreenSetup(
    () => permission,
    async () => {
      if (captureFails) throw new Error('Capture blocked');
    },
    (error) => reported.push(error),
  );
  await setup.check();
  assert.equal(setup.status(), 'not-determined');
  permission = 'granted';
  assert.equal(setup.status(), 'checking');
  assert.equal(setup.needsCheckAfterGrant(), true);
  await setup.check();
  assert.equal(setup.status(), 'capture_failed');
  assert.equal(reported.length, 2);
  captureFails = false;
  await setup.check();
  assert.equal(setup.status(), 'granted');
  permission = 'denied';
  assert.equal(setup.status(), 'denied');
  permission = 'granted';
  assert.equal(setup.needsCheckAfterGrant(), true);
});
