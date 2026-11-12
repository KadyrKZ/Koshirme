import { app, BrowserWindow, clipboard, ipcMain, Menu, screen, session } from 'electron';
import { join } from 'node:path';
import { connectionTicket } from '../services/deep-link';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Guard } from '../services/guard';
import { ChromeBrowser } from '../services/chrome-browser';
import { requestScreenPermission } from '../services/screen-capture';
import type { JoinInput } from '../types';

let guard: Guard | null = null;
let pendingTicket: string | null = null;
let linking = Promise.resolve();
function handleLink(url: string) {
  const ticket = connectionTicket(url);
  if (!ticket) return;
  if (!guard) {
    pendingTicket = ticket;
    return;
  }
  linking = linking
    .then(() => guard!.connectWebsite(ticket))
    .catch((error) => {
      if (guard) {
        guard.state.error = String(error.message || error);
        window?.webContents.send('guard:state', guard.state);
      }
    });
}
// macOS delivers cold-start URLs before app.ready.
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleLink(url);
});
let window: BrowserWindow | null = null;
let violationWindows: BrowserWindow[] = [];
let quitting = false;
let wasMonitoring = false;
function hideViolations() {
  for (const item of violationWindows) if (!item.isDestroyed()) item.hide();
}
function showViolation(eventType: string) {
  if (
    ![
      'TAB_CHANGED',
      'NEW_TAB',
      'GOOGLE_LENS_ATTEMPT',
      'BROWSER_UI_ATTEMPT',
      'CHROME_FOCUS_LOST',
      'DESKTOP_GUARD_DISCONNECTED',
    ].includes(eventType)
  )
    return;
  for (const item of violationWindows) item.close();
  violationWindows = screen.getAllDisplays().map((display) => {
    const scale = Math.sqrt(0.4);
    const width = Math.min(
      display.workArea.width,
      Math.max(420, Math.round(display.workArea.width * scale)),
    );
    const height = Math.min(
      display.workArea.height,
      Math.max(300, Math.round(display.workArea.height * scale)),
    );
    const overlay = new BrowserWindow({
      x: display.workArea.x + Math.round((display.workArea.width - width) / 2),
      y: display.workArea.y + Math.round((display.workArea.height - height) / 2),
      width,
      height,
      show: false,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      movable: false,
      backgroundColor: '#b20d2f',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    overlay.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin')
      overlay.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true,
      });
    overlay.setContentProtection(true);
    overlay.once('ready-to-show', () => {
      if (!guard?.state.monitoring || overlay.isDestroyed()) {
        if (!overlay.isDestroyed()) overlay.close();
        return;
      }
      overlay.showInactive();
      setTimeout(() => {
        if (!overlay.isDestroyed()) overlay.close();
      }, 2800);
    });
    const label = encodeURIComponent(eventType.replaceAll('_', ' '));
    void overlay.loadURL(
      `data:text/html,<meta charset=utf-8><style>html,body{margin:0;height:100%;background:%23b20d2f;color:white;font-family:system-ui;display:grid;place-items:center;text-align:center}body{border:8px solid %23ffccd5}main{padding:5vw}h1{font-size:clamp(32px,5vw,72px);margin:0}p{font-size:clamp(18px,2.2vw,30px)}</style><main><h1>НАРУШЕНИЕ / БҰЗУШЫЛЫҚ</h1><p>${label}<br>Вернитесь к экзамену / Емтиханға оралыңыз</p></main>`,
    );
    return overlay;
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_event, args) => {
    for (const arg of args) if (arg.startsWith('koshirme:')) handleLink(arg);
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  void app.whenReady().then(async () => {
    app.setName('KOSH!RME');
    if (app.isPackaged) app.setAsDefaultProtocolClient('koshirme');
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    );
    window = new BrowserWindow({
      width: 640,
      height: 880,
      minWidth: 510,
      minHeight: 650,
      title: 'KOSH!RME',
      backgroundColor: '#f4f6fc',
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    const pairingPath = join(app.getPath('userData'), 'pairing-code');
    let pairingCode = existsSync(pairingPath) ? readFileSync(pairingPath, 'utf8').trim() : '';
    if (!/^[A-F0-9]{8}$/.test(pairingCode)) pairingCode = '';
    const chromeBrowser = new ChromeBrowser(
      app.isPackaged ? undefined : process.env.KOSHIRME_CHROME_APP_PATH,
    );
    guard = new Guard(
      (state) => {
        if (quitting) return;
        if (window && !window.isDestroyed()) {
          window.webContents.send('guard:state', state);
          if (state.monitoring && window.isVisible()) window.hide();
          if (wasMonitoring && !state.monitoring) {
            hideViolations();
            window.show();
          }
        }
        wasMonitoring = state.monitoring;
        if (state.exam?.finished_at) setImmediate(() => app.quit());
      },
      showViolation,
      (url) => chromeBrowser.open(url),
      pairingCode || undefined,
      hideViolations,
      () => chromeBrowser.activate(),
    );
    window.on('close', (event) => {
      if (!quitting && (guard?.state.monitoring || guard?.state.starting)) {
        event.preventDefault();
        window?.minimize();
      }
    });
    if (!pairingCode) writeFileSync(pairingPath, guard.state.pairingCode);
    window.on('focus', () => {
      if (guard?.state.monitoring) {
        void guard
          .openContest()
          .catch(() => {})
          .finally(() => {
            if (guard?.state.monitoring) window?.hide();
          });
      }
    });
    function handle(channel: string, fn: (input: unknown) => unknown) {
      ipcMain.handle(channel, (event, input: unknown) => {
        if (
          event.sender !== window?.webContents ||
          event.senderFrame !== window.webContents.mainFrame
        )
          throw new Error('Untrusted renderer');
        return fn(input);
      });
    }
    handle('guard:get-state', () => guard!.state);
    handle('guard:join', async (input) => {
      if (!input || typeof input !== 'object') throw new Error('Invalid input');
      await guard!.join(input as JoinInput);
      // Manual room entry remains available; never overwrite the clipboard on join.
    });
    handle('guard:start', () => guard!.start());
    handle('guard:screen-permission', () => requestScreenPermission());
    handle('guard:copy-pairing-code', () => clipboard.writeText(guard!.state.pairingCode));
    window.once('ready-to-show', () => {
      window?.show();
      if (guard?.state.permission !== 'granted') void requestScreenPermission();
      console.log('KOSH!RME window ready');
    });
    if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL);
    else await window.loadFile(join(__dirname, '../renderer/index.html'));
    if (pendingTicket) {
      handleLink(`koshirme://connect?ticket=${pendingTicket}`);
      pendingTicket = null;
    }
    for (const arg of process.argv) if (arg.startsWith('koshirme:')) handleLink(arg);
  });
  app.on('activate', () => {
    if (guard?.state.monitoring) void guard.openContest().catch(() => {});
    else window?.show();
  });
  // Closing the visible window exits the guard. It never keeps monitoring in a hidden tray.
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (guard?.state.monitoring || guard?.state.starting) {
      event.preventDefault();
      window?.hide();
      return;
    }
    quitting = true;
    guard?.close();
    for (const item of violationWindows) if (!item.isDestroyed()) item.destroy();
    violationWindows = [];
  });
}
