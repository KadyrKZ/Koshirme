import { expect, test } from '@playwright/test';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

const base = process.env.TEST_API_URL || 'http://localhost:8000';
const teacher = process.env.ADMIN_TOKEN || 'examguard-local-teacher-key';
async function connectStudent(id: string, token: string, role: string) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws/student/${id}`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => ws.send(JSON.stringify({ type: 'auth', token, role })));
    ws.once('message', () => resolve());
    ws.once('error', reject);
  });
  const timer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'heartbeat' }));
  }, 5000);
  return () => {
    clearInterval(timer);
    ws.close();
  };
}

test('teacher UI → event → live timeline → protected screenshot → finish', async ({
  page,
  request,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  const auth = { Authorization: `Bearer ${teacher}` };
  const name = `UI smoke ${new Date().toISOString()}`;
  let examId = '',
    stopExtension: (() => void) | undefined,
    stopDesktop: (() => void) | undefined;
  try {
    await page.addInitScript(
      (token) => sessionStorage.setItem('examguard.teacher', token),
      teacher,
    );
    await page.goto('/exams');
    await page.getByRole('button', { name: 'Создать комнату', exact: true }).first().click();
    await page.getByLabel('Название экзамена', { exact: true }).fill(name);
    await page
      .getByLabel('Ссылка на контест 1', { exact: true })
      .fill('https://fizmat.win/contest/12345/');
    await page
      .getByLabel('Ссылка на контест 2', { exact: false })
      .fill('https://example.com/reference/');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Создать комнату', exact: true })
      .click();
    await expect(page).toHaveURL(/\/exam\/[a-f0-9-]+$/);
    examId = page.url().split('/').at(-1)!;
    await expect(page.getByRole('heading', { name })).toBeVisible();
    const exam = await (await request.get(`${base}/api/exams/${examId}`, { headers: auth })).json();
    expect(exam.allowed_urls).toEqual([
      'https://fizmat.win/contest/12345/',
      'https://example.com/reference/',
    ]);
    const joined = await (
      await request.post(`${base}/api/student/join`, {
        data: { student_name: 'Aruzhan UI Test', join_code: exam.join_code },
      })
    ).json();
    const sid = joined.session.id as string,
      studentAuth = { Authorization: `Bearer ${joined.token}` };
    stopExtension = await connectStudent(sid, joined.token, 'extension');
    stopDesktop = await connectStudent(sid, joined.token, 'desktop');
    expect(
      (
        await request.post(`${base}/api/student/sessions/${sid}/ready`, { headers: studentAuth })
      ).ok(),
    ).toBeTruthy();
    await page.getByRole('button', { name: 'Начать мониторинг', exact: true }).click();
    await expect(page.getByText('1 / 1 учеников онлайн', { exact: false })).toBeVisible();
    const response = await request.post(`${base}/api/events`, {
      headers: studentAuth,
      data: {
        id: randomUUID(),
        student_session_id: sid,
        event_type: 'TAB_CHANGED',
        severity: 'high',
        timestamp: new Date().toISOString(),
        current_url: 'https://google.com/?private=never-store',
        metadata: { source: 'automated_protocol_test' },
      },
    });
    expect(response.ok()).toBeTruthy();
    const event = await response.json();
    await expect(page.getByText('Обнаружено нарушение', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: /Aruzhan UI Test/ }).click();
    await expect(page.getByText('TAB_CHANGED', { exact: true })).toBeVisible();
    // Test fixture from this test page only; this test does not capture the user's desktop.
    const jpeg = await page.screenshot({ type: 'jpeg', quality: 75 });
    const uploaded = await request.post(`${base}/api/events/${event.id}/screenshot`, {
      headers: studentAuth,
      multipart: { file: { name: 'ui-fixture.jpg', mimeType: 'image/jpeg', buffer: jpeg } },
    });
    expect(uploaded.ok()).toBeTruthy();
    await page.getByRole('button', { name: 'Открыть снимок' }).click();
    const image = page.getByRole('img', { name: 'Снимок нарушения' });
    await expect(image).toBeVisible();
    expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    const filename = (await uploaded.json()).screenshot_path;
    expect((await request.get(`${base}/api/screenshots/${filename}`)).status()).toBe(401);
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('link', { name: new RegExp(name) }).click();
    await page.getByRole('button', { name: 'Завершить комнату', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Завершить комнату', exact: true })
      .click();
    await expect(page.getByText('Мониторинг остановлен', { exact: true })).toBeVisible();
    expect(
      (
        await request.post(`${base}/api/events`, {
          headers: studentAuth,
          data: {
            id: randomUUID(),
            student_session_id: sid,
            event_type: 'NEW_TAB',
            severity: 'medium',
            timestamp: new Date().toISOString(),
            metadata: {},
          },
        })
      ).status(),
    ).toBe(409);
    expect(failures).toEqual([]);
  } finally {
    stopExtension?.();
    stopDesktop?.();
    if (examId) await request.post(`${base}/api/exams/${examId}/finish`, { headers: auth });
  }
});

test('admin works at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((token) => sessionStorage.setItem('examguard.teacher', token), teacher);
  await page.goto('/exams');
  await expect(
    page.getByRole('heading', { name: 'Экзаменационные комнаты', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});
