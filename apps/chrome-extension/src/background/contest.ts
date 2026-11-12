import { examAllowedUrls, isAllowedUrl, WAITING_URL, type SessionConfig } from '@koshirme/protocol';

// Opening and enforcing tabs share one queue. A slow navigation already owns
// a tab through pendingUrl, even before Chrome exposes its final URL.
export function allowedTab(tab: chrome.tabs.Tab, urls: string | string[]) {
  return isAllowedUrl(tab.pendingUrl || tab.url, urls);
}

export class ContestNavigator {
  private queue: Promise<unknown> = Promise.resolve();
  private focusing: Promise<void> | null = null;
  constructor(
    private getConfig: () => SessionConfig | null,
    private preferredTab: () => number | undefined,
    private connected: () => boolean,
    private eligible: () => boolean,
  ) {}
  private serialize(task: () => Promise<void>) {
    const operation = this.queue.catch(() => {}).then(task);
    this.queue = operation;
    return operation;
  }
  private snapshot() {
    const config = this.getConfig();
    if (!config || config.exam.finished_at) throw new Error('Session ended');
    const urls = examAllowedUrls(config.exam);
    const valid = () => {
      const next = this.getConfig();
      return (
        !!next &&
        !next.exam.finished_at &&
        next.session.id === config.session.id &&
        next.exam.active === config.exam.active &&
        next.monitoring_allowed === config.monitoring_allowed &&
        JSON.stringify(examAllowedUrls(next.exam)) === JSON.stringify(urls)
      );
    };
    return { urls, valid };
  }
  ensureTabs() {
    return this.serialize(async () => {
      if (!this.eligible()) return;
      const { urls, valid } = this.snapshot();
      const tabs = await chrome.tabs.query({});
      for (const url of urls) {
        if (!valid() || !this.eligible()) return;
        if (!tabs.some((tab) => allowedTab(tab, url)))
          tabs.push(await chrome.tabs.create({ url, active: false }));
      }
      if (!valid() || !this.eligible()) return;
      const forbidden = tabs.filter((tab) => {
        const url = tab.pendingUrl || tab.url;
        if (!tab.id || !url || allowedTab(tab, urls)) return false;
        try {
          return ['http:', 'https:'].includes(new URL(url).protocol);
        } catch {
          return false;
        }
      });
      if (forbidden.length) await chrome.tabs.remove(forbidden.map((tab) => tab.id!));
    });
  }
  focus(waitForFocus: boolean): Promise<void> {
    // Share the activation operation; each Ready request still checks focus/account.
    if (!this.focusing) {
      const snapshot = this.snapshot();
      const operation = this.serialize(async () => {
        const { urls, valid } = snapshot;
        const tabs = await chrome.tabs.query({});
        if (!valid()) throw new Error('Session changed');
        const preferred = tabs.find(
          (tab) => tab.id === this.preferredTab() && allowedTab(tab, urls),
        );
        const existing =
          preferred ||
          tabs.find((tab) => tab.active && allowedTab(tab, urls)) ||
          tabs.find((tab) => allowedTab(tab, urls));
        const tab = existing?.id
          ? existing.active
            ? existing
            : await chrome.tabs.update(existing.id, { active: true })
          : await chrome.tabs.create({ url: urls[0], active: true });
        if (!tab || !valid()) throw new Error('Session changed');
        const window = await chrome.windows.get(tab.windowId);
        if (!valid()) throw new Error('Session changed');
        if (!window.focused) await chrome.windows.update(tab.windowId, { focused: true });
      });
      this.focusing = operation;
      void operation
        .finally(() => {
          if (this.focusing === operation) this.focusing = null;
        })
        .catch(() => {});
    }
    const opening = this.focusing;
    return waitForFocus ? opening.then(() => this.waitForFocus()) : opening;
  }
  private async waitForFocus() {
    const { urls, valid } = this.snapshot();
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline && valid() && this.connected()) {
      const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
      const focused = windows.find((window) => window.focused);
      const [active] = focused?.id
        ? await chrome.tabs.query({ windowId: focused.id, active: true })
        : [];
      let accountReady = true;
      if (active?.id && isAllowedUrl(active.url, WAITING_URL)) {
        try {
          const result = await chrome.scripting.executeScript({
            target: { tabId: active.id },
            func: () => !!document.querySelector('[data-waiting-account="ready"]'),
          });
          accountReady = result[0]?.result === true;
        } catch {
          accountReady = false;
        }
      }
      if (valid() && focused && isAllowedUrl(active?.url, urls) && accountReady) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('Sign in to your contest account in Chrome, then click Ready again');
  }
}
