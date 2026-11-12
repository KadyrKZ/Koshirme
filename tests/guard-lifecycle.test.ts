import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { SessionConfig, SessionState } from '@koshirme/protocol';

test('guard releases a finished or revoked session and does not reopen tabs on disconnect', async (t) => {
  let onState!: (state: SessionState) => void;
  let onEnded!: () => void;
  let onConnection!: (connected: boolean) => void;
  let connected = true,
    leased = true,
    grace = true;
  let readyRequests = 0,
    warnings = 0,
    uploads = 0,
    externalOpens = 0;
  let open = async () => {};
  let capture = async () => Buffer.from([255, 216, 255, 217]);
  const initial = {
    token: 'test',
    exam: { active: true, finished_at: null },
    session: { id: 's1', active: true, ready: true },
  } as SessionConfig;
  const state = (finished = false): SessionState => ({
    type: 'session_state',
    lease_seconds: 12,
    exam: { ...initial.exam, active: !finished, finished_at: finished ? 'finished' : null },
    session: { ...initial.session, active: !finished, ready: !finished },
  });
  mock.module(
    new URL('../apps/student-desktop/src/services/screen-capture.ts', import.meta.url).href,
    {
      namedExports: { screenPermission: () => 'granted', captureScreens: () => capture() },
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
            callback: typeof onConnection,
          ) {
            onConnection = callback;
          }
          get connected() {
            return connected;
          }
          sendConfig() {}
          openContest() {
            return open();
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
        constructor(
          _config: unknown,
          callback: typeof onState,
          _lost: unknown,
          ended: typeof onEnded,
        ) {
          onState = callback;
          onEnded = ended;
        }
        hasLease() {
          return leased;
        }
        withinOfflineGrace() {
          return grace;
        }
        async request(path: string) {
          if (path.endsWith('/ready')) {
            readyRequests++;
            return state();
          }
          if (path.endsWith('/capture'))
            return {
              student_session_id: 's1',
              event_type: 'CHROME_FOCUS_LOST',
              screenshot_path: null,
            };
          uploads++;
          return {};
        }
        close() {}
      },
    },
  });
  const { Guard } = await import('../apps/student-desktop/src/services/guard');
  const makeGuard = async () => {
    connected = leased = grace = true;
    warnings = uploads = readyRequests = externalOpens = 0;
    open = async () => {};
    const guard = new Guard(
      () => {},
      () => warnings++,
      () => externalOpens++,
    );
    await guard.join({ studentName: 'Test', joinCode: '1234' });
    guard.state.consented = true;
    onState(state());
    assert.equal(guard.state.monitoring, true);
    return guard;
  };
  try {
    await t.test('repeated extension disconnects do not spawn browser tabs', async () => {
      const guard = await makeGuard();
      try {
        connected = false;
        for (let i = 0; i < 10; i++) onConnection(false);
        assert.equal(externalOpens, 0);
      } finally {
        guard.close();
      }
    });
    await t.test(
      'finish during capture prevents warning, restore and upload; stale state is ignored',
      async () => {
        const guard = await makeGuard();
        let release!: () => void, started!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const entered = new Promise<void>((resolve) => {
          started = resolve;
        });
        capture = async () => {
          started();
          await gate;
          return Buffer.from([]);
        };
        try {
          const capturing = (guard as any).capture('event1');
          await entered;
          onState(state(true));
          onState(state());
          release();
          await capturing;
          assert.equal(guard.state.monitoring, false);
          assert.equal(guard.state.consented, false);
          assert.equal(warnings, 0);
          assert.equal(uploads, 0);
        } finally {
          release();
          guard.close();
        }
      },
    );
    await t.test('finish cancels an in-flight Ready operation', async () => {
      const guard = await makeGuard();
      let release!: () => void;
      open = () =>
        new Promise<void>((resolve) => {
          release = resolve;
        });
      try {
        const ready = guard.start();
        assert.equal(guard.state.starting, true);
        onState(state(true));
        release();
        await ready;
        assert.equal(guard.state.starting, false);
        assert.equal(readyRequests, 0);
        assert.equal(guard.state.monitoring, false);
      } finally {
        release();
        guard.close();
      }
    });
    await t.test('waiting-room heartbeats do not cancel Ready', async () => {
      const guard = await makeGuard();
      const waiting = {
        ...state(),
        exam: { ...initial.exam, active: false },
        session: { ...initial.session, active: false, ready: false },
      } as SessionState;
      onState(waiting);
      let release!: () => void;
      open = () =>
        new Promise<void>((resolve) => {
          release = resolve;
        });
      try {
        const ready = guard.start();
        onState(waiting);
        release();
        await ready;
        assert.equal(readyRequests, 1);
        assert.equal(guard.state.monitoring, true);
        assert.equal(guard.state.starting, false);
      } finally {
        release();
        guard.close();
      }
    });
    await t.test(
      'revocation stops monitoring immediately; offline expiry also stops it',
      async () => {
        const guard = await makeGuard();
        try {
          leased = grace = false;
          onConnection(false);
          assert.equal(guard.state.monitoring, false);
          onEnded();
          assert.equal(guard.state.session, null);
          onState(state());
          assert.equal(guard.state.monitoring, false);
        } finally {
          guard.close();
        }
      },
    );
  } finally {
    mock.restoreAll();
  }
});
