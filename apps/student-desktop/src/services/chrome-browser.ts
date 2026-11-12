import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
// Only window handles/process names are inspected; no history or page titles are read.
const activateWindows = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class ExamChromeWindow {
  public delegate bool EnumProc(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
  public static bool Activate() {
    IntPtr target = IntPtr.Zero;
    EnumWindows((window, parameter) => {
      uint pid;
      GetWindowThreadProcessId(window, out pid);
      try {
        if (IsWindowVisible(window) && Process.GetProcessById((int)pid).ProcessName == "chrome") {
          target = window;
          return false;
        }
      } catch (Exception) { }
      return true;
    }, IntPtr.Zero);
    if (target == IntPtr.Zero) return false;
    if (GetForegroundWindow() == target && !IsIconic(target)) return true;
    if (IsIconic(target)) ShowWindowAsync(target, 9);
    return SetForegroundWindow(target);
  }
}
'@
if (-not [ExamChromeWindow]::Activate()) { throw 'Windows could not activate Chrome' }
`;

export class ChromeBrowser {
  constructor(private macApplicationPath?: string) {}
  async activate() {
    if (process.platform === 'darwin') {
      await run(
        '/usr/bin/open',
        this.macApplicationPath ? ['-a', this.macApplicationPath] : ['-b', 'com.google.Chrome'],
        { timeout: 8000 },
      );
    } else if (process.platform === 'win32') {
      await run(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(activateWindows, 'utf16le').toString('base64'),
        ],
        { timeout: 8000, windowsHide: true },
      );
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
