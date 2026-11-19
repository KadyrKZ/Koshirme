import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Test the asynchronous capture boundary without capturing the user's real desktop.
test('slow capture finishes before warning or Chrome restore; old overlays are hidden', async () => {
  const order: string[] = [];
  let releaseCapture!: () => void;
  const capturing = new Promise<void>((resolve) => {
    releaseCapture = resolve;
  });
  let authorized!: () => void;
  const authorizedPromise = new Promise<void>((resolve) => {
    authorized = resolve;
  });
  mock.module(
    new URL('../apps/student-desktop/src/services/screen-capture.ts', import.meta.url).href,
    {
      namedExports: {
        screenPermission: () => 'granted',
        captureScreens: async () => {
          order.push('capture-start');
          authorized();
          await capturing;
          order.push('capture-end');
          return Buffer.from([255, 216, 255, 217]);
        },
      },
    },
  );
  mock.module(
    new URL('../apps/student-desktop/src/services/local-server.ts', import.meta.url).href,
    {
      namedExports: {
        LocalServer: class {
          connected = true;
          sendConfig() {}
          async openContest() {
            order.push('restore');
          }
          close() {}
        },
      },
    },
  );
  const event = {
    id: 'event1',
    student_session_id: 's1',
    event_type: 'BROWSER_UI_ATTEMPT',
    severity: 'high',
    screenshot_path: null,
  };
  mock.module(new URL('../apps/student-desktop/src/services/backend.ts', import.meta.url).href, {
    namedExports: {
      validateBackendUrl: (s: string) => s,
      request: async () => ({
        token: 'test',
        exam: { active: true },
        session: { id: 's1', active: true, ready: true },
      }),
      BackendClient: class {
        hasLease() {
          return true;
        }
        withinOfflineGrace() {
          return true;
        }
        async request(path: string) {
          if (path.endsWith('/capture')) {
            await new Promise((r) => setTimeout(r, 550));
            return event;
          }
          order.push(path.endsWith('/screenshot-status') ? 'status' : 'upload');
          return {};
        }
        close() {}
      },
    },
  });
  const { Guard } = await import('../apps/student-desktop/src/services/guard.ts');
  const guard = new Guard(
    () => {},
    () => order.push('warning'),
    () => {},
    undefined,
    () => order.push('hide'),
  );
  try {
    await guard.join({ studentName: 'Test Student', joinCode: '1234' });
    guard.state.consented = true;
    const operation = (guard as any).capture('event1') as Promise<void>;
    await (guard as any).capture('event1');
    await authorizedPromise;
    assert.deepEqual(order, ['hide', 'capture-start']);
    releaseCapture();
    await operation;
    assert.deepEqual(order, [
      'hide',
      'capture-start',
      'capture-end',
      'warning',
      'restore',
      'upload',
    ]);
  } finally {
    guard.close();
    mock.restoreAll();
  }
});
