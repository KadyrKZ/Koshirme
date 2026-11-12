import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { SessionState } from '@koshirme/protocol';

test('browser recovery works independently of screenshot delivery', async (t) => {
  let onConnection!: (connected: boolean) => void;
  let onViolation!: (type: string) => void;
  let onState!: (state: SessionState) => void;
  let connected = true,
    permission = 'granted';
  let activationFailures = 0;
  let opens = 0,
    activations = 0,
    launches = 0,
    captures = 0;
  let capture = async () => Buffer.from([255, 216, 255, 217]);
  let open = async () => {};
  const initial = {
    token: 'test',
    exam: { active: true, finished_at: null, allowed_url: 'https://example.com/exam' },
    session: { id: 's1', active: true, ready: true },
  };
  const state = (active = true) =>
    ({
      type: 'session_state',
      exam: { ...initial.exam, active },
      session: { ...initial.session, active },
      lease_seconds: 12,
    }) as SessionState;
  mock.module(
    new URL('../apps/student-desktop/src/services/screen-capture.ts', import.meta.url).href,
    {
      namedExports: {
        screenPermission: () => permission,
        captureScreens: () => {
          captures++;
          return capture();
        },
      },
    },
  );
  mock.module(
    new URL('../apps/student-desktop/src/services/local-server.ts', import.meta.url).href,
    {
      namedExports: {
        LocalServer: class {
          constructor(
            _port: number,
            _secret: string,
            _config: unknown,
            connection: typeof onConnection,
            _capture: unknown,
            violation: typeof onViolation,
          ) {
            onConnection = connection;
            onViolation = violation;
          }
          get connected() {
            return connected;
          }
          sendConfig() {}
          async openContest() {
            opens++;
            await open();
          }
          close() {}
        },
      },
    },
  );
  mock.module(new URL('../apps/student-desktop/src/services/backend.ts', import.meta.url).href, {
    namedExports: {
      validateBackendUrl: (s: string) => s,
      request: async () => initial,
      BackendClient: class {
        constructor(_config: unknown, callback: typeof onState) {
          onState = callback;
        }
        hasLease() {
          return true;
        }
        withinOfflineGrace() {
          return true;
        }
        async request(path: string) {
          return path.endsWith('/capture')
            ? { student_session_id: 's1', event_type: 'CHROME_FOCUS_LOST', screenshot_path: null }
            : {};
        }
        close() {}
      },
    },
  });
  const { Guard } = await import('../apps/student-desktop/src/services/guard');
  const makeGuard = async () => {
    activationFailures = 0;
    connected = true;
    permission = 'granted';
    opens = activations = launches = captures = 0;
    open = async () => {};
    capture = async () => Buffer.from([255, 216, 255, 217]);
    const guard = new Guard(
      () => {},
      () => {},
      () => {
        launches++;
      },
      undefined,
      () => {},
      () => {
        activations++;
        if (activationFailures-- > 0) throw new Error('Foreground denied');
      },
    );
    await guard.join({ studentName: 'Test', joinCode: '1234' });
    guard.state.consented = true;
    onState(state());
    return guard;
  };
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  try {
    await t.test('cooldown skips the second screenshot but still returns to Chrome', async () => {
      const guard = await makeGuard();
      try {
        await (guard as any).capture('event1');
        await flush();
        await (guard as any).capture('event2');
        await flush();
        assert.equal(captures, 1);
        assert.equal(opens, 2);
        assert.equal(activations, 2);
      } finally {
        guard.close();
      }
    });
    await t.test('offline show_violation returns without a server capture request', async () => {
      const guard = await makeGuard();
      try {
        onViolation('CHROME_FOCUS_LOST');
        await flush();
        assert.equal(opens, 1);
        assert.equal(activations, 1);
        assert.equal(captures, 0);
      } finally {
        guard.close();
      }
    });
    await t.test(
      'closing the contest tab and activating another tab requests restoration',
      async () => {
        const guard = await makeGuard();
        try {
          onViolation('TAB_CHANGED');
          await flush();
          assert.equal(opens, 1);
          assert.equal(activations, 1);
        } finally {
          guard.close();
        }
      },
    );
    await t.test(
      'a queued return waits for evidence, then coalesces with the capture return',
      async () => {
        const guard = await makeGuard();
        let release!: () => void, entered!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const started = new Promise<void>((resolve) => {
          entered = resolve;
        });
        capture = async () => {
          entered();
          await gate;
          return Buffer.from([]);
        };
        try {
          const operation = (guard as any).capture('event1');
          await started;
          onViolation('CHROME_FOCUS_LOST');
          assert.equal(opens, 0);
          assert.equal(activations, 0);
          release();
          await operation;
          await flush();
          assert.equal(opens, 1);
          assert.equal(activations, 1);
        } finally {
          release();
          guard.close();
        }
      },
    );
    await t.test('a missing screen permission still returns to Chrome', async () => {
      const guard = await makeGuard();
      permission = 'denied';
      try {
        await (guard as any).capture('event1');
        await flush();
        assert.equal(opens, 1);
        assert.equal(activations, 1);
        assert.equal(captures, 0);
      } finally {
        guard.close();
      }
    });
    await t.test('a failed extension focus is retried once after native activation', async () => {
      const guard = await makeGuard();
      open = async () => {
        if (opens === 1) throw new Error('Window unavailable');
      };
      try {
        await guard.openContest();
        assert.equal(opens, 2);
        assert.equal(activations, 2);
        assert.equal(launches, 0);
      } finally {
        guard.close();
      }
    });
    await t.test(
      'Chrome focus is retried even if native foreground activation was denied',
      async () => {
        const guard = await makeGuard();
        activationFailures = 1;
        open = async () => {
          if (opens === 1) throw new Error('Minimized window');
        };
        try {
          await guard.openContest();
          assert.equal(opens, 2);
          assert.equal(activations, 2);
        } finally {
          guard.close();
        }
      },
    );
    await t.test(
      'a persistent failure is visible and cannot loop or create duplicate tabs',
      async () => {
        const guard = await makeGuard();
        open = async () => {
          throw new Error('Window unavailable');
        };
        try {
          onViolation('CHROME_FOCUS_LOST');
          await flush();
          assert.equal(opens, 2);
          assert.equal(launches, 0);
          assert.match(guard.state.error || '', /Could not return/);
        } finally {
          guard.close();
        }
      },
    );
    await t.test(
      'closed Chrome is launched once per outage and restored on reconnection',
      async () => {
        const guard = await makeGuard();
        t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-10-11') });
        try {
          connected = false;
          for (let i = 0; i < 10; i++) onConnection(false);
          t.mock.timers.tick(1999);
          assert.equal(launches, 0);
          t.mock.timers.tick(1);
          await flush();
          assert.equal(launches, 1);
          for (let i = 0; i < 10; i++) onConnection(false);
          t.mock.timers.tick(60000);
          await flush();
          assert.equal(launches, 1);
          connected = true;
          onConnection(true);
          await flush();
          assert.equal(opens, 1);
        } finally {
          t.mock.timers.reset();
          guard.close();
        }
      },
    );
    await t.test('pause cancels a scheduled Chrome relaunch', async () => {
      const guard = await makeGuard();
      t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2026-10-11') });
      try {
        connected = false;
        onConnection(false);
        onState(state(false));
        t.mock.timers.tick(60000);
        await flush();
        assert.equal(launches, 0);
      } finally {
        t.mock.timers.reset();
        guard.close();
      }
    });
  } finally {
    mock.restoreAll();
  }
});
