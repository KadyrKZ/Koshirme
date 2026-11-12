import { isAllowedUrl, type EventType } from '@koshirme/protocol';
import { allowedTab } from './contest';

type Emit = (type: EventType, url?: string, source?: string) => void;
export class ExamMonitor {
  private running = false;
  private allowed: string[] = [];
  private focused: boolean | null = null;
  private allowedTab: boolean | null = null;
  private tabId: number | undefined;
  private lastAllowedTabId: number | undefined;
  private checkTimer: ReturnType<typeof setTimeout> | null = null;
  private browserUiTimer: ReturnType<typeof setTimeout> | null = null;
  private pageFocused: boolean | null = null;
  private lastHidden = 0;
  private epoch = 0;
  constructor(private emit: Emit) {}
  get active() {
    return this.running;
  }
  get preferredTabId() {
    return this.lastAllowedTabId;
  }
  setActive(active: boolean, allowed: string[]) {
    this.allowed = allowed;
    if (active === this.running) return;
    this.running = active;
    this.epoch++;
    this.focused = null;
    this.allowedTab = null;
    this.tabId = undefined;
    this.lastAllowedTabId = undefined;
    this.pageFocused = null;
    if (active) this.schedule('monitoring_started');
    else {
      if (this.checkTimer) clearTimeout(this.checkTimer);
      if (this.browserUiTimer) clearTimeout(this.browserUiTimer);
    }
  }
  schedule(source: string) {
    if (!this.running) return;
    if (this.checkTimer) clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => {
      void this.inspect(source);
    }, 700);
  }
  async activated(tabId: number) {
    if (!this.running) return;
    const epoch = this.epoch;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!this.running || epoch !== this.epoch) return;
      const allowed = allowedTab(tab, this.allowed);
      if (allowed && tab.id) this.lastAllowedTabId = tab.id;
      // Full inspection verifies Chrome focus and only then records return.
      this.schedule('tabs.onActivated');
    } catch {
      this.schedule('tabs.onActivated.retry');
    }
  }
  private async inspect(source: string) {
    if (!this.running) return;
    const epoch = this.epoch;
    try {
      const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
      const focused = windows.find((window) => window.focused);
      if (!this.running || epoch !== this.epoch) return;
      if (!focused?.id) {
        if (this.focused !== false) this.emit('CHROME_FOCUS_LOST', undefined, source);
        this.focused = false;
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, windowId: focused.id });
      if (!this.running || epoch !== this.epoch || !tab) return;
      const allowed = allowedTab(tab, this.allowed);
      if (!allowed && (this.allowedTab !== false || this.tabId !== tab.id))
        this.emit('TAB_CHANGED', tab.url, source);
      if (allowed && (this.focused === false || this.allowedTab === false))
        this.emit('RETURN_TO_EXAM', tab.url, source);
      this.focused = true;
      this.allowedTab = allowed;
      this.tabId = tab.id;
      if (allowed) this.lastAllowedTabId = tab.id;
    } catch {
      /* Window may disappear between queries; next Chrome event re-evaluates it. */
    }
  }
  created(tab: chrome.tabs.Tab) {
    if (this.running) {
      const url = tab.pendingUrl || tab.url;
      if (isAllowedUrl(url, this.allowed)) {
        this.schedule('tabs.onCreated.allowed');
        return;
      }
      this.emit('NEW_TAB', url, 'tabs.onCreated');
      // A foreground tab can be restored by exam mode before the debounced
      // window inspection runs. Record the tab switch at creation time too.
      if (tab.active && !isAllowedUrl(url, this.allowed)) {
        this.focused = true;
        this.allowedTab = false;
        this.tabId = tab.id;
        this.emit('TAB_CHANGED', url, 'tabs.onCreated.active');
      }
      this.schedule('tabs.onCreated');
    }
  }
  private async inspectBrowserUi(tabId: number, url: string | undefined, epoch: number) {
    if (!this.running || epoch !== this.epoch || this.pageFocused !== false) return;
    try {
      const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
      const focused = windows.find((window) => window.focused);
      if (!focused?.id || !this.running || epoch !== this.epoch) return;
      const [active] = await chrome.tabs.query({ active: true, windowId: focused.id });
      if (
        this.pageFocused === false &&
        active?.id === tabId &&
        isAllowedUrl(active.url, this.allowed)
      )
        this.emit('BROWSER_UI_ATTEMPT', url, 'document.blur.browser_ui');
    } catch {
      /* A window or tab may disappear while Chrome changes focus. */
    }
  }
  content(signal: string, sender: chrome.runtime.MessageSender) {
    if (!this.running || !isAllowedUrl(sender.url, this.allowed) || sender.frameId !== 0) return;
    const senderTabId = sender.tab?.id;
    if (signal === 'contextmenu') {
      this.emit('GOOGLE_LENS_ATTEMPT', sender.url, 'document.contextmenu');
      return;
    }
    if (signal === 'hidden' && Date.now() - this.lastHidden > 800) {
      this.lastHidden = Date.now();
      this.emit('PAGE_HIDDEN', sender.url, 'document.visibilitychange');
    }
    if (signal === 'blur' && senderTabId) {
      this.pageFocused = false;
      if (this.browserUiTimer) clearTimeout(this.browserUiTimer);
      const epoch = this.epoch;
      this.browserUiTimer = setTimeout(
        () => void this.inspectBrowserUi(senderTabId, sender.url, epoch),
        200,
      );
    }
    if (signal === 'focus') {
      this.pageFocused = true;
      if (this.browserUiTimer) clearTimeout(this.browserUiTimer);
      this.browserUiTimer = null;
    }
    if (signal === 'visible' || signal === 'focus' || signal === 'blur')
      this.schedule(`content.${signal}`);
  }
}
