import { expect, test } from '@playwright/test';
import { WebSocket, WebSocketServer } from 'ws';
import { examGuardWorker, launchExtensionBrowser } from './helpers/extension-browser';
import type { SessionConfig } from '@koshirme/protocol';

for (const version of ['current', '0.2.8'] as const)
  test(`MV3 ${version} detects violations and supports the updated backend`, async ({
    request,
  }) => {
    test.setTimeout(90000);
    const base = 'http://localhost:8000',
      auth = {
        Authorization: `Bearer ${process.env.ADMIN_TOKEN || 'examguard-local-teacher-key'}`,
      };
    const exam = await (
      await request.post(`${base}/api/exams`, {
        headers: auth,
        data: { title: `Extension smoke ${Date.now()}`, allowed_url: 'https://contest.yandex.ru/' },
      })
    ).json();
    const joined = await (
      await request.post(`${base}/api/student/join`, {
        data: { student_name: 'MV3 Test Student', join_code: exam.join_code },
      })
    ).json();
    const config: SessionConfig = { ...joined, backend_url: base, monitoring_allowed: false };
    const desktop = new WebSocket(`${base.replace('http', 'ws')}/ws/student/${joined.session.id}`);
    desktop.on('open', () =>
      desktop.send(JSON.stringify({ type: 'auth', token: joined.token, role: 'desktop' })),
    );
    const heartbeat = setInterval(() => {
      if (desktop.readyState === WebSocket.OPEN)
        desktop.send(JSON.stringify({ type: 'heartbeat' }));
    }, 5000);
    const captures: string[] = [];
    const local = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise<void>((resolve) => local.once('listening', resolve));
    const port = (local.address() as { port: number }).port;
    local.on('connection', (ws) =>
      ws.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'pair') ws.send(JSON.stringify({ type: 'config', config }));
        if (message.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        if (message.command === 'capture_screen') captures.push(message.event_id);
      }),
    );
    const extensionBrowser = await launchExtensionBrowser(
      true,
      version === '0.2.8' ? 'tests/fixtures/chrome-extension-0.2.8' : 'apps/chrome-extension/dist',
    );
    const context = extensionBrowser.context;
    try {
      const worker = await examGuardWorker(context);
      const extensionId = new URL(worker.url()).host;
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await expect(popup.locator('#secret')).toHaveAttribute(
        'placeholder',
        'Введите код из приложения',
      );
      await popup.locator('#secret').fill('AB12CD34');
      await popup.evaluate(
        (port) => chrome.runtime.sendMessage({ type: 'pair', secret: 'AB12CD34', port }),
        port,
      );
      await expect(popup.locator('#desktop')).toHaveText('Подключено');
      // A local test response at the allowed origin: no modifications to real Yandex Contest.
      await context.route('https://contest.yandex.ru/**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Exam test fixture</title><h1>Allowed exam page</h1>',
        }),
      );
      const contest = await context.newPage();
      await contest.goto('https://contest.yandex.ru/');
      await contest.bringToFront();
      const state = await (
        await request.post(`${base}/api/student/sessions/${joined.session.id}/ready`, {
          headers: { Authorization: `Bearer ${joined.token}` },
        })
      ).json();
      config.session = state.session;
      config.exam = state.exam;
      config.monitoring_allowed = true;
      for (const ws of local.clients) ws.send(JSON.stringify({ type: 'config', config }));
      await request.post(`${base}/api/exams/${exam.id}/start`, { headers: auth });
      // The fake Desktop must keep its snapshot current when reconnecting after offline mode.
      const activeState = await (
        await request.get(`${base}/api/student/sessions/${joined.session.id}`, {
          headers: { Authorization: `Bearer ${joined.token}` },
        })
      ).json();
      config.session = activeState.session;
      config.exam = activeState.exam;
      await expect
        .poll(async () =>
          worker!.evaluate(
            async () =>
              ((await chrome.storage.session.get('config')).config as SessionConfig).session.active,
          ),
        )
        .toBe(true);
      const lensRule = await worker.evaluate(async () =>
        (await chrome.declarativeNetRequest.getDynamicRules()).find((rule) => rule.id === 5),
      );
      expect(lensRule?.condition.urlFilter).toBe('||lens.google.com/');
      // The released client's initial content handshake can precede activation.
      // Reload the allowed fixture as a real student can between exam stages.
      if (version === '0.2.8') await contest.reload();
      await expect
        .poll(() =>
          contest.evaluate(
            () =>
              !document.body.dispatchEvent(
                new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }),
              ),
          ),
        )
        .toBe(true);
      const eventTypes = async (): Promise<string[]> =>
        (
          await (
            await request.get(`${base}/api/students/${joined.session.id}/events`, { headers: auth })
          ).json()
        ).map((event: { event_type: string }) => event.event_type);
      await expect.poll(eventTypes).toContain('GOOGLE_LENS_ATTEMPT');

      // A short connection loss must not disable local protection or lose the event.
      await context.setOffline(true);
      await contest.waitForTimeout(1000);
      expect(
        await contest.evaluate(
          () =>
            !document.body.dispatchEvent(
              new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }),
            ),
        ),
      ).toBe(true);
      await expect
        .poll(() =>
          worker.evaluate(async () => {
            const saved = await chrome.storage.local.get('pendingEvents');
            return Array.isArray(saved.pendingEvents)
              ? saved.pendingEvents.some(
                  (event: { metadata?: { reason?: string } }) =>
                    event.metadata?.reason === 'connection_buffered',
                )
              : false;
          }),
        )
        .toBe(true);
      await context.setOffline(false);
      await expect
        .poll(async () =>
          (
            await (
              await request.get(`${base}/api/students/${joined.session.id}/events`, {
                headers: auth,
              })
            ).json()
          ).some(
            (event: { event_type: string; metadata?: { reason?: string } }) =>
              event.event_type === 'GOOGLE_LENS_ATTEMPT' &&
              event.metadata?.reason === 'connection_buffered',
          ),
        )
        .toBe(true);
      // Wait for activation baseline, then leave the contest tab.
      await contest.waitForTimeout(500);
      await context.route('https://example.org/**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<title>Other tab</title><p>Outside exam</p>',
        }),
      );
      const other = await context.newPage();
      const blocked = await other.goto('https://example.org/').catch(() => null);
      expect(blocked).toBeNull();
      await other.bringToFront();
      await expect
        .poll(async () =>
          (
            await (
              await request.get(`${base}/api/students/${joined.session.id}/events`, {
                headers: auth,
              })
            ).json()
          ).map((event: { event_type: string }) => event.event_type),
        )
        .toContain('TAB_CHANGED');
      await expect.poll(() => captures.length).toBeGreaterThan(0);
      await expect.poll(eventTypes).toContain('NEW_TAB');
      await expect.poll(eventTypes).toContain('PAGE_HIDDEN');
      await contest.bringToFront();
      await expect.poll(eventTypes).toContain('RETURN_TO_EXAM');
      for (const ws of local.clients) ws.terminate();
      await expect
        .poll(async () =>
          (
            await (
              await request.get(`${base}/api/students/${joined.session.id}/events`, {
                headers: auth,
              })
            ).json()
          ).map((event: { event_type: string }) => event.event_type),
        )
        .toContain('DESKTOP_GUARD_DISCONNECTED');
      await request.post(`${base}/api/exams/${exam.id}/finish`, { headers: auth });
      await expect
        .poll(async () =>
          worker!.evaluate(
            async () =>
              ((await chrome.storage.session.get('config')).config as SessionConfig).session.active,
          ),
        )
        .toBe(false);
      const before = (
        await (
          await request.get(`${base}/api/students/${joined.session.id}/events`, { headers: auth })
        ).json()
      ).length;
      await context.newPage();
      await contest.waitForTimeout(300);
      expect(
        (
          await (
            await request.get(`${base}/api/students/${joined.session.id}/events`, { headers: auth })
          ).json()
        ).length,
      ).toBe(before);
    } finally {
      await extensionBrowser.close();
      clearInterval(heartbeat);
      desktop.close();
      for (const ws of local.clients) ws.terminate();
      local.close();
      await request.post(`${base}/api/exams/${exam.id}/finish`, { headers: auth });
    }
  });
