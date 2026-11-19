import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export class ChromeBrowser {
  constructor(
    private macApplicationPath?: string,
    private activateWindows?: () => Promise<void>,
  ) {}
  async activate() {
    if (process.platform === 'darwin') {
      await run(
        '/usr/bin/open',
        this.macApplicationPath ? ['-a', this.macApplicationPath] : ['-b', 'com.google.Chrome'],
        { timeout: 8000 },
      );
    } else if (process.platform === 'win32') {
      if (!this.activateWindows) throw new Error('Windows Chrome activation is unavailable');
      await this.activateWindows();
    }
  }
  async open(url: string) {
    const allowed = new URL(url);
    if (allowed.protocol !== 'https:') throw new Error('Chrome requires an HTTPS contest URL');
    if (process.platform === 'darwin') {
      await run(
        '/usr/bin/open',
        [
          ...(this.macApplicationPath
            ? ['-a', this.macApplicationPath]
            : ['-b', 'com.google.Chrome']),
          url,
        ],
        { timeout: 8000 },
      );
      return;
    }
    if (process.platform !== 'win32') throw new Error('Chrome recovery requires Windows or macOS');
    const executable = [
      process.env.LOCALAPPDATA,
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
    ]
      .filter((base): base is string => !!base)
      .map((base) => join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'))
      .find(existsSync);
    if (!executable) throw new Error('Google Chrome is not installed');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, [url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
  }
}
