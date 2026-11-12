import { chromium, expect, type BrowserContext, type Worker } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export async function examGuardWorker(context: BrowserContext): Promise<Worker> {
  let match: Worker | undefined;
  await expect
    .poll(async () => {
      for (const worker of context.serviceWorkers()) {
        const name = await worker
          .evaluate(() => chrome.runtime.getManifest().short_name)
          .catch(() => '');
        if (name === 'KOSH!RME' || name === 'Көшірме') {
          match = worker;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return match!;
}

// Do not enable Playwright's focus emulation: it masks real visibilitychange.
// A separate temporary profile never reads or changes the user's Chrome profile.
export async function launchExtensionBrowser(
  headless: boolean,
  extensionPath = 'apps/chrome-extension/dist',
) {
  const profile = await mkdtemp(join(tmpdir(), 'examguard-mv3-'));
  const extension = resolve(extensionPath);
  const process = spawn(
    chromium.executablePath(),
    [
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
      ...(headless ? ['--headless=new'] : []),
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Chromium CDP startup timed out')), 20000);
      let output = '';
      process.once('error', reject);
      process.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Chromium exited before connection: ${code}`));
      });
      process.stderr.on('data', (chunk) => {
        output += chunk.toString();
        const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match?.[1]) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
    });
    const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
    const context = browser.contexts()[0]!;
    return {
      context,
      async close() {
        try {
          const cdp = await browser.newBrowserCDPSession();
          await cdp.send('Browser.close');
        } finally {
          await browser.close();
          process.kill('SIGTERM');
        }
      },
    };
  } catch (error) {
    process.kill('SIGTERM');
    throw error;
  }
}
