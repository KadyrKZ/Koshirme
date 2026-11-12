import { expect, test } from '@playwright/test';
import { examGuardWorker, launchExtensionBrowser } from './helpers/extension-browser';

test('exam content script blocks the context menu on an arbitrary allowed HTTPS page and its frames', async () => {
  const extensionBrowser = await launchExtensionBrowser(true);
  const context = extensionBrowser.context;
  try {
    await context.route('https://example.org/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: route.request().url().endsWith('/frame')
          ? '<!doctype html><p id="frame-target">Frame target</p>'
          : '<!doctype html><p id="target">Page target</p><iframe src="https://example.org/frame"></iframe>',
      }),
    );
    const page = await context.newPage();
    await page.goto('https://example.org/exam');
    await expect(page.locator('#target')).toBeVisible();
    await expect(page.locator('iframe')).toBeVisible();

    const worker = await examGuardWorker(context);
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ url: 'https://example.org/*' });
      if (!tab?.id) throw new Error('Allowed exam tab is unavailable');
      await chrome.tabs.sendMessage(tab.id, {
        type: 'monitor_config',
        active: true,
        allowed_urls: ['https://example.org/'],
      });
    });

    const contextMenuWasBlocked = await page.locator('#target').evaluate((target) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(contextMenuWasBlocked).toBe(true);

    const frame = page.frames().find((candidate) => candidate.url().endsWith('/frame'));
    expect(frame).toBeTruthy();
    const frameContextMenuWasBlocked = await frame!.locator('#frame-target').evaluate((target) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(frameContextMenuWasBlocked).toBe(true);

    const keyboardMenuWasBlocked = await page.locator('#target').evaluate((target) => {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'ContextMenu',
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(keyboardMenuWasBlocked).toBe(true);
  } finally {
    await extensionBrowser.close();
  }
});
