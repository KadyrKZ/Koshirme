import { chromium, expect, test } from '@playwright/test';
import { ChromeBrowser } from '../../apps/student-desktop/src/services/chrome-browser';
import { examGuardWorker, launchExtensionBrowser } from './helpers/extension-browser';

test('macOS native activation restores a minimized Chrome without opening another contest tab', async () => {
  test.skip(process.platform !== 'darwin', 'Requires the macOS window manager');
  const extensionBrowser = await launchExtensionBrowser(
    false,
    'tests/fixtures/chrome-extension-0.2.8',
  );
  const native = new ChromeBrowser(chromium.executablePath().split('/Contents/MacOS/')[0]);
  try {
    const worker = await examGuardWorker(extensionBrowser.context);
    const tab = await worker.evaluate(async () => (await chrome.tabs.query({}))[0]!);
    await worker.evaluate((id) => chrome.windows.update(id, { state: 'minimized' }), tab.windowId);
    await native.activate();
    await expect
      .poll(() =>
        worker.evaluate(async () => {
          const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
          return windows.some((window) => window.focused && window.state !== 'minimized');
        }),
      )
      .toBe(true);
    expect(await worker.evaluate(async () => (await chrome.tabs.query({})).length)).toBe(1);
  } finally {
    await extensionBrowser.close();
  }
});

test('macOS opens the assigned contest when the last Chrome window was closed', async () => {
  test.skip(process.platform !== 'darwin', 'Requires the macOS window manager');
  const extensionBrowser = await launchExtensionBrowser(
    false,
    'tests/fixtures/chrome-extension-0.2.8',
  );
  const native = new ChromeBrowser(chromium.executablePath().split('/Contents/MacOS/')[0]);
  const url = 'https://example.com/exam-recovery';
  try {
    await extensionBrowser.context.route(`${url}**`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Test contest restored</h1>' }),
    );
    const worker = await examGuardWorker(extensionBrowser.context);
    await worker.evaluate(async () => {
      for (const window of await chrome.windows.getAll({ windowTypes: ['normal'] }))
        await chrome.windows.remove(window.id!);
    });
    await native.open(url);
    const restoredWorker = await examGuardWorker(extensionBrowser.context);
    await expect
      .poll(() =>
        restoredWorker.evaluate(
          async (url) =>
            (await chrome.tabs.query({})).filter((tab) => (tab.pendingUrl || tab.url) === url)
              .length,
          url,
        ),
      )
      .toBe(1);
  } finally {
    await extensionBrowser.close();
  }
});
