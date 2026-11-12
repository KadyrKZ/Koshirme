import { _electron, expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { WebSocket } from 'ws';
import { createRequire } from 'node:module';
import type { GuardAPI } from '../../apps/student-desktop/src/types';

for (const ending of ['finish', 'delete', 'pause-and-close'] as const)
  test(`Electron joins, enforces pairing and exits on ${ending}`, async ({ request }) => {
    test.setTimeout(60000);
    const require = createRequire(import.meta.url);
    const auth = {
      Authorization: `Bearer ${process.env.ADMIN_TOKEN || 'examguard-local-teacher-key'}`,
    };
    const exam = await (
      await request.post('http://localhost:8000/api/exams', {
        headers: auth,
        data: { title: `Desktop smoke ${Date.now()}`, allowed_url: 'https://contest.yandex.ru/' },
      })
    ).json();
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env))
      if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
    env.KOSHIRME_LOCAL_PORT = '17893';
    env.KOSHIRME_BACKEND_URL = 'http://localhost:8000';
    const app = await _electron.launch({
      executablePath: require('electron') as string,
      args: [resolve('apps/student-desktop/out/main/index.js')],
      env,
    });
    const nativeProcess = app.process();
    let extension: WebSocket | undefined;
    const previousClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
    try {
      const page = await app.firstWindow();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await expect(page.getByRole('heading', { name: 'Можно начинать.' })).toBeVisible();
      await page.getByLabel('Имя ученика', { exact: true }).fill('Desktop Test Student');
      await page.getByLabel('Код комнаты', { exact: true }).fill(exam.join_code);
      await page.getByRole('button', { name: 'Войти в комнату', exact: false }).click();
      await expect(page.getByRole('heading', { name: 'Проверка системы' })).toBeVisible();
      await expect(page.locator('#backend-check')).toHaveText('✓ Подключено');
      const pairing = (await page.locator('#pair-code').textContent())!;
      expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(pairing);
      const refused = new WebSocket('ws://127.0.0.1:17893', { origin: 'https://evil.example' });
      await new Promise<void>((resolve, reject) => {
        refused.on('unexpected-response', (_request, response) => {
          expect(response.statusCode).toBe(401);
          refused.terminate();
          resolve();
        });
        refused.on('open', () => reject(new Error('Website origin was accepted')));
        refused.on('error', () => {});
      });
      extension = new WebSocket('ws://127.0.0.1:17893', {
        origin: `chrome-extension://${'a'.repeat(32)}`,
      });
      await new Promise<void>((resolve, reject) => {
        extension!.on('open', () =>
          extension!.send(JSON.stringify({ type: 'pair', secret: pairing })),
        );
        extension!.once('message', () => resolve());
        extension!.once('error', reject);
      });
      await expect(page.locator('#extension-check')).toHaveText('✓ Подключено');
      const state = await page.evaluate(() =>
        (window as unknown as { examguard: GuardAPI }).examguard.getState(),
      );
      expect(state.monitoring).toBe(false);
      expect(state.consented).toBe(false);
      await expect(page.locator('#start-button')).toBeDisabled(); // Explicit consent is still unchecked.
      if (state.permission !== 'granted')
        await expect(page.locator('#permission-panel')).toBeVisible();
      console.log(
        `Native Electron launch verified; Screen Recording permission: ${state.permission}. No desktop screenshot taken by this smoke test.`,
      );
      await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), previousClipboard);
      const exited = new Promise<void>((resolve) => nativeProcess.once('exit', () => resolve()));
      if (ending === 'delete')
        await request.delete(`http://localhost:8000/api/exams/${exam.id}`, { headers: auth });
      else if (ending === 'pause-and-close') {
        await request.post(`http://localhost:8000/api/exams/${exam.id}/pause`, { headers: auth });
        await expect(page.getByRole('heading', { name: 'Мониторинг на паузе' })).toBeVisible();
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
      } else
        await request.post(`http://localhost:8000/api/exams/${exam.id}/finish`, { headers: auth });
      await exited;
      expect(nativeProcess.exitCode).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      if (nativeProcess.exitCode === null) {
        await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), previousClipboard);
        await app.close();
      }
      extension?.close();
      await request.post(`http://localhost:8000/api/exams/${exam.id}/finish`, { headers: auth });
    }
  });
