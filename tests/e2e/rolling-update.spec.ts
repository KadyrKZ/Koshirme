import { _electron, chromium, expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { examGuardWorker, launchExtensionBrowser } from './helpers/extension-browser';
import type { SessionConfig } from '@koshirme/protocol';
import type { GuardAPI } from '../../apps/student-desktop/src/types';

// Exercise the real released client, not a rebuilt copy or a protocol mock.
// Screenshot sources are replaced with a synthetic test image; no user's desktop is captured.
for (const version of ['0.2.8', 'current'] as const)
  test(`Desktop supports Chrome ${version}: Ready, restore minimized window/closed tab, pause, resume, delete`, async ({
    request,
  }) => {
    test.setTimeout(60000);
    const base = 'http://localhost:8000';
    const auth = {
      Authorization: `Bearer ${process.env.ADMIN_TOKEN || 'examguard-local-teacher-key'}`,
    };
    const examResponse = await request.post(`${base}/api/exams`, {
      headers: auth,
      data: {
        title: `Rolling upgrade ${version} ${Date.now()}`,
        allowed_url: 'https://contest.yandex.ru/contest/42/',
      },
    });
    expect(examResponse.status()).toBe(201);
    const exam = await examResponse.json();
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key, value]) => value !== undefined && key !== 'ELECTRON_RUN_AS_NODE',
      ),
    ) as Record<string, string>;
    env.KOSHIRME_BACKEND_URL = base;
    env.KOSHIRME_LOCAL_PORT = '17894';
    if (process.platform === 'darwin')
      env.KOSHIRME_CHROME_APP_PATH = chromium.executablePath().split('/Contents/MacOS/')[0]!;
    const require = createRequire(import.meta.url);
    const app = await _electron.launch({
      executablePath: require('electron') as string,
      args: [resolve('apps/student-desktop/out/main/index.js')],
      env,
    });
    const nativeProcess = app.process();
    await app.evaluate(({ desktopCapturer, nativeImage }) => {
      desktopCapturer.getSources = async () => [
        {
          id: 'screen:0:0',
          name: 'Synthetic test display',
          display_id: '0',
          appIcon: nativeImage.createEmpty(),
          thumbnail: nativeImage.createFromBuffer(
            Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4WQAAAAASUVORK5CYII=',
              'base64',
            ),
          ),
        },
      ];
    });
    const extensionBrowser = await launchExtensionBrowser(
      false,
      version === '0.2.8' ? 'tests/fixtures/chrome-extension-0.2.8' : 'apps/chrome-extension/dist',
    );
    const context = extensionBrowser.context;
    const clipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
    try {
      await context.route('https://fizmat.win/waiting**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<h1 data-waiting-account="ready">Test account ready</h1>',
        }),
      );
      await context.route('https://contest.yandex.ru/**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<h1>Allowed test contest</h1>',
        }),
      );
      const guard = await app.firstWindow();
      const initial = await guard.evaluate(() =>
        (window as unknown as { examguard: GuardAPI }).examguard.getState(),
      );
      test.skip(
        initial.permission !== 'granted',
        'Screen Recording permission must already be granted.',
      );
      const worker = await examGuardWorker(context);
      const manifest = await worker.evaluate(() => chrome.runtime.getManifest().version);
      expect(manifest).toBe(version === '0.2.8' ? '0.2.8' : '0.2.9');
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
      await popup.evaluate(
        (secret) => chrome.runtime.sendMessage({ type: 'pair', secret, port: 17894 }),
        initial.pairingCode,
      );
      await expect(popup.locator('#desktop')).toHaveText('Подключено');
      const waiting = await context.newPage();
      await waiting.goto('https://fizmat.win/waiting');
      await expect(waiting.locator('[data-waiting-account="ready"]')).toBeVisible();
      await guard.getByLabel('Имя ученика', { exact: true }).fill('Compatibility Test');
      await guard.getByLabel('Код комнаты', { exact: true }).fill(exam.join_code);
      await guard.getByRole('button', { name: 'Войти в комнату', exact: false }).click();
      await expect(guard.locator('#backend-check')).toHaveText('✓ Подключено');
      await expect(guard.locator('#extension-check')).toHaveText('✓ Подключено');
      await guard.locator('#consent').check();
      await guard.locator('#start-button').click();
      await waiting.bringToFront();
      await expect(guard.getByText('ГОТОВ — ОЖИДАНИЕ УЧИТЕЛЯ')).toBeVisible({ timeout: 30000 });
      await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), clipboard);
      const monitoring = () =>
        worker.evaluate(async () => {
          const saved = (await chrome.storage.session.get('config')).config as
            SessionConfig | undefined;
          return !!saved?.session.active;
        });
      // Preload the allowed fixture through Playwright so extension-created
      // navigation does not depend on the external test site's network.
      const contest = await context.newPage();
      await contest.goto('https://contest.yandex.ru/contest/42/');
      await request.post(`${base}/api/exams/${exam.id}/start`, { headers: auth });
      await expect.poll(monitoring).toBe(true);
      await expect
        .poll(() =>
          worker.evaluate(async () =>
            (await chrome.tabs.query({})).some((tab) =>
              tab.url?.startsWith('https://contest.yandex.ru/contest/42'),
            ),
          ),
        )
        .toBe(true);
      // Exercise the Desktop-native return with the frozen store extension too.
      const contestWindow = await worker.evaluate(
        async () =>
          (await chrome.tabs.query({})).find((tab) =>
            tab.url?.startsWith('https://contest.yandex.ru/contest/42'),
          )!.windowId,
      );
      await worker.evaluate(
        (id) => chrome.windows.update(id, { state: 'minimized' }),
        contestWindow,
      );
      await expect
        .poll(() =>
          worker.evaluate(async () =>
            (await chrome.windows.getAll({ windowTypes: ['normal'] })).some(
              (window) => window.focused && window.state !== 'minimized',
            ),
          ),
        )
        .toBe(true);
      await worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        await chrome.tabs.remove(
          tabs
            .filter((tab) => tab.url?.startsWith('https://contest.yandex.ru/contest/42'))
            .map((tab) => tab.id!),
        );
      });
      await expect
        .poll(() =>
          worker.evaluate(
            async () =>
              (await chrome.tabs.query({})).filter((tab) =>
                (tab.pendingUrl || tab.url)?.startsWith('https://contest.yandex.ru/contest/42'),
              ).length,
          ),
        )
        .toBe(1);
      await request.post(`${base}/api/exams/${exam.id}/pause`, { headers: auth });
      await expect.poll(monitoring).toBe(false);
      await expect(guard.getByRole('heading', { name: 'Мониторинг на паузе' })).toBeVisible();
      await expect
        .poll(() =>
          worker.evaluate(
            async () => (await chrome.declarativeNetRequest.getDynamicRules()).length,
          ),
        )
        .toBe(0);
      await request.post(`${base}/api/exams/${exam.id}/start`, { headers: auth });
      await expect.poll(monitoring).toBe(true);
      await request.post(`${base}/api/exams/${exam.id}/pause`, { headers: auth });
      await expect.poll(monitoring).toBe(false);
      const exited = new Promise<void>((resolve) => nativeProcess.once('exit', () => resolve()));
      expect(
        (await request.delete(`${base}/api/exams/${exam.id}`, { headers: auth })).status(),
      ).toBe(204);
      await exited;
      expect(nativeProcess.exitCode).toBe(0);
      await expect.poll(monitoring).toBe(false);
      await expect
        .poll(() =>
          worker.evaluate(
            async () => (await chrome.declarativeNetRequest.getDynamicRules()).length,
          ),
        )
        .toBe(0);
      expect((await request.get(`${base}/api/exams/${exam.id}`, { headers: auth })).status()).toBe(
        404,
      );
    } finally {
      if (nativeProcess.exitCode === null) {
        await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), clipboard);
        await request.post(`${base}/api/exams/${exam.id}/finish`, { headers: auth });
        await app.close();
      }
      await extensionBrowser.close();
      await request.delete(`${base}/api/exams/${exam.id}`, { headers: auth });
    }
  });
