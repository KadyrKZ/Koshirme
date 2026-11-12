import { _electron, chromium, expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { examGuardWorker, launchExtensionBrowser } from './helpers/extension-browser';
import type { GuardAPI } from '../../apps/student-desktop/src/types';
import type { ViolationEvent } from '@koshirme/protocol';

// Explicit opt-in: this test captures the real desktop after a real tab violation.
test('native Electron + actual MV3 → server JPEG → teacher Dialog → stop', async ({
  page,
  request,
}) => {
  test.skip(
    process.env.RUN_NATIVE_CAPTURE !== '1',
    'Requires an interactive desktop and screen permission.',
  );
  test.setTimeout(90000);
  const base = 'http://localhost:8000';
  const teacher = process.env.ADMIN_TOKEN || 'examguard-local-teacher-key';
  const auth = { Authorization: `Bearer ${teacher}` };
  const exam = await (
    await request.post(`${base}/api/exams`, {
      headers: auth,
      data: {
        title: `Native screenshot verification ${Date.now()}`,
        allowed_url: 'https://contest.yandex.ru/',
      },
    })
  ).json();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  env.KOSHIRME_LOCAL_PORT = '17891';
  env.KOSHIRME_BACKEND_URL = base;
  const require = createRequire(import.meta.url);
  const app = await _electron.launch({
    executablePath: require('electron') as string,
    args: [resolve('apps/student-desktop/out/main/index.js')],
    env,
  });
  const nativeProcess = app.process();
  const extensionBrowser = await launchExtensionBrowser(false);
  const browser = extensionBrowser.context;
  try {
    const guard = await app.firstWindow();
    await guard.getByLabel('Имя ученика', { exact: true }).fill('Native Capture Test');
    await guard.getByLabel('Код комнаты', { exact: true }).fill(exam.join_code);
    await guard.getByRole('button', { name: 'Войти в комнату', exact: false }).click();
    await expect(guard.locator('#backend-check')).toHaveText('✓ Подключено');
    const initial = await guard.evaluate(() =>
      (window as unknown as { examguard: GuardAPI }).examguard.getState(),
    );
    test.skip(
      initial.permission !== 'granted',
      'Screen Recording must be granted manually in OS settings.',
    );
    const worker = await examGuardWorker(browser);
    const popup = await browser.newPage();
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    await popup.locator('#secret').fill(initial.pairingCode);
    await popup.locator('#connect-button').click();
    await expect(popup.locator('#desktop')).toHaveText('Подключено');
    await expect(guard.locator('#extension-check')).toHaveText('✓ Подключено');
    const fixture = (title: string, description: string, color: string) =>
      `<!doctype html><html><head><title>${title}</title></head><body style="font:24px system-ui;background:${color};color:white;padding:70px"><h1>${title}</h1><p>${description}</p><p>KOSH!RME automated native capture verification</p></body></html>`;
    await browser.route('https://contest.yandex.ru/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: fixture('Allowed exam fixture', 'This is the permitted test tab.', '#193a65'),
      }),
    );
    await browser.route('https://example.org/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: fixture(
          'Outside the exam',
          'Switching to this test tab triggers one violation screenshot.',
          '#563f7e',
        ),
      }),
    );
    const contest = await browser.newPage();
    await contest.goto('https://contest.yandex.ru/');
    const other = await browser.newPage();
    await other.goto('https://example.org/');
    await guard.bringToFront();
    await guard.locator('#consent').check();
    await guard.locator('#start-button').click();
    await contest.bringToFront();
    if (process.platform === 'darwin')
      execFileSync('/usr/bin/open', [
        '-a',
        chromium.executablePath().split('/Contents/MacOS/')[0]!,
      ]);
    await expect(guard.getByText('ГОТОВ — ОЖИДАНИЕ УЧИТЕЛЯ')).toBeVisible();
    await request.post(`${base}/api/exams/${exam.id}/start`, { headers: auth });
    await expect(guard.locator('#active-banner')).toBeVisible();
    const sessionId = initial.session!.id;
    const getEvents = async () =>
      (await (
        await request.get(`${base}/api/students/${sessionId}/events`, { headers: auth })
      ).json()) as ViolationEvent[];
    await contest.waitForTimeout(800);
    expect(await getEvents()).toHaveLength(0);
    await other.bringToFront();
    await expect
      .poll(
        async () =>
          (await getEvents()).find((event) => event.event_type === 'TAB_CHANGED')?.screenshot_path,
        { timeout: 25000 },
      )
      .toBeTruthy();
    const event = (await getEvents()).find((event) => event.event_type === 'TAB_CHANGED')!;
    await expect
      .poll(async () => (await getEvents()).map((event) => event.event_type))
      .toContain('PAGE_HIDDEN');
    const jpegResponse = await request.get(`${base}/api/screenshots/${event.screenshot_path}`, {
      headers: auth,
    });
    const jpeg = await jpegResponse.body();
    expect(jpeg[0]).toBe(0xff);
    expect(jpeg[1]).toBe(0xd8);
    expect(jpeg.length).toBeLessThanOrEqual(5 * 1024 * 1024);
    await other.waitForTimeout(2100); // Independent violation, outside the capture cooldown.
    await app.evaluate(({ app, BrowserWindow }) => {
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()[0]?.focus();
    });
    if (process.platform === 'darwin')
      execFileSync('/usr/bin/open', [
        '-a',
        (require('electron') as string).split('/Contents/MacOS/')[0]!,
      ]);
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFocused()),
      )
      .toBe(true);
    await expect
      .poll(
        async () =>
          (await getEvents()).some(
            (event) => event.event_type === 'CHROME_FOCUS_LOST' && event.screenshot_path,
          ),
        { timeout: 25000 },
      )
      .toBe(true);
    await page.addInitScript(
      (token) => sessionStorage.setItem('examguard.teacher', token),
      teacher,
    );
    await page.goto(`/exam/${exam.id}/student/${sessionId}`);
    await page.getByRole('button', { name: 'Открыть снимок' }).first().click();
    const image = page.getByRole('img', { name: 'Снимок нарушения' });
    await expect(image).toBeVisible();
    const size = await image.evaluate((img: HTMLImageElement) => ({
      width: img.naturalWidth,
      height: img.naturalHeight,
    }));
    expect(size.width).toBeGreaterThan(0);
    expect(size.width).toBeLessThanOrEqual(2560);
    expect(size.height).toBeLessThanOrEqual(1440);
    const exited = new Promise<void>((resolve) => nativeProcess.once('exit', () => resolve()));
    await request.post(`${base}/api/exams/${exam.id}/finish`, { headers: auth });
    await exited;
    expect(nativeProcess.exitCode).toBe(0);
    const count = (await getEvents()).length;
    await contest.bringToFront();
    await browser.newPage();
    await contest.waitForTimeout(500);
    expect((await getEvents()).length).toBe(count);
    console.log(
      `Native JPEG verified: ${jpeg.length} bytes, ${size.width}×${size.height}. Review: /exam/${exam.id}/student/${sessionId}`,
    );
  } finally {
    await request.post(`${base}/api/exams/${exam.id}/finish`, { headers: auth });
    await extensionBrowser.close();
    if (nativeProcess.exitCode === null) await app.close();
  }
});
