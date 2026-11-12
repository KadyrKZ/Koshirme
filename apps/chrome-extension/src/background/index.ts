import {
  EVENT_RULES,
  examAllowedUrls,
  isAllowedUrl,
  sanitizeUrl,
  type EventInput,
  type EventType,
  type ExtensionStatus,
  type SessionConfig,
  type ViolationEvent,
} from '@koshirme/protocol';
import { BackendConnection } from '../services/backend';
import { DesktopConnection } from '../services/desktop';
import type { PairSettings } from '../types';
import { ExamMonitor } from './monitor';
import { ContestNavigator } from './contest';

let config: SessionConfig | null = null,
  backend: BackendConnection | null = null,
  desktop: DesktopConnection | null = null;
let error: string | null = null,
  pairSettings: PairSettings | null = null;
let lastBadge = '',
  lastBadgeColor = '';
let desktopMissingSince = 0,
  desktopLossReported = false;
let examModeEnabled = false;
const endedSessions = new Set<string>();
const recent = new Map<string, number>();
const PENDING_EVENTS_KEY = 'pendingEvents';
const MAX_PENDING_EVENTS = 500;
const CONTENT_SCRIPT_MATCHES = ['https://*/*'];
let pendingEvents: EventInput[] = [];
let flushPromise: Promise<void> | null = null;
let flushRetry: ReturnType<typeof setTimeout> | null = null;
let flushAttempt = 0;
let storageWrite = Promise.resolve();
const pendingReady = chrome.storage.local.get(PENDING_EVENTS_KEY).then((saved) => {
  const value = saved[PENDING_EVENTS_KEY];
  if (!Array.isArray(value)) return;
  pendingEvents = value
    .filter(
      (item): item is EventInput =>
        !!item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.student_session_id === 'string' &&
        typeof item.event_type === 'string' &&
        typeof item.timestamp === 'string',
    )
    .slice(-MAX_PENDING_EVENTS);
});
const monitor = new ExamMonitor((type, url, source) => {
  emit(type, url, source);
});

const navigator = new ContestNavigator(
  () => config,
  () => monitor.preferredTabId,
  () => desktop?.connected ?? false,
  eligible,
);

function eligible() {
  return !!(
    config?.monitoring_allowed &&
    config.exam.active &&
    !config.exam.finished_at &&
    !config.session.finished_at &&
    config.session.active &&
    (backend?.hasLease() || backend?.withinOfflineGrace())
  );
}
function status(): ExtensionStatus {
  return {
    desktop: desktop?.connected ?? false,
    backend: backend?.hasLease() ?? false,
    monitoring: eligible(),
    examTitle: config?.exam.title ?? null,
    allowedUrl: config?.exam.allowed_url ?? null,
    allowedUrls: config ? examAllowedUrls(config.exam) : [],
    error,
  };
}
function refresh() {
  const active = eligible();
  if (desktop?.connected) {
    desktopMissingSince = 0;
    desktopLossReported = false;
  } else if (active && !desktopLossReported) {
    desktopMissingSince ||= Date.now();
    if (Date.now() - desktopMissingSince > 3000) {
      desktopLossReported = true;
      emit('DESKTOP_GUARD_DISCONNECTED', undefined, 'localhost.unavailable');
    }
  } else if (!active) desktopMissingSince = 0;
  const changed = monitor.active !== active;
  monitor.setActive(active, config ? examAllowedUrls(config.exam) : []);
  if (active !== examModeEnabled)
    void setExamMode(active).catch((reason) => {
      examModeEnabled = false;
      error = `Exam mode failed: ${String(reason)}`;
    });
  const badge = active ? (desktop?.connected ? 'ON' : '!') : '';
  const color = desktop?.connected ? '#208660' : '#d3455b';
  if (badge !== lastBadge) {
    lastBadge = badge;
    void chrome.action.setBadgeText({ text: badge });
  }
  if (color !== lastBadgeColor) {
    lastBadgeColor = color;
    void chrome.action.setBadgeBackgroundColor({ color });
  }
  if (changed) void syncContentScripts();
}
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
async function setExamMode(active: boolean) {
  examModeEnabled = active;
  const removeRuleIds = [1, 2, 3, 4, 5];
  if (!active || !config) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    return;
  }
  const allowRules = examAllowedUrls(config.exam).map((value, index) => {
    const allowed = new URL(value);
    const path = allowed.pathname.replace(/\/+$/, '');
    return {
      id: index + 2,
      priority: 2,
      action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
      condition: {
        regexFilter: `^${escapeRegex(allowed.origin)}${escapeRegex(path)}(?:[/#?]|$)`,
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
      },
    };
  });
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: [
      {
        id: 5,
        priority: 3,
        action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
        condition: { urlFilter: '||lens.google.com/' },
      },
      {
        id: 1,
        priority: 1,
        action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
        condition: {
          regexFilter: '^https?://',
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
        },
      },
      ...allowRules,
    ],
  });
  await navigator.ensureTabs();
}
async function closeForbiddenTab(tabId: number) {
  if (!eligible() || !config) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!eligible() || !config) return;
    if (tab.url && !isAllowedUrl(tab.url, examAllowedUrls(config.exam))) {
      const protocol = new URL(tab.url).protocol;
      if (protocol === 'http:' || protocol === 'https:') await chrome.tabs.remove(tabId);
    }
  } catch {
    // The tab may already have been closed by Chrome's request blocker.
  }
}
async function syncContentScripts() {
  const tabs = await chrome.tabs.query({ url: CONTENT_SCRIPT_MATCHES });
  const message = {
    type: 'monitor_config',
    active: eligible(),
    allowed_urls: config ? examAllowedUrls(config.exam) : [],
  };
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      // Chrome does not inject static content scripts into tabs that were already
      // open when an unpacked/updated extension was reloaded. Repair that state
      // automatically so exam protection never depends on a manual page reload.
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ['content.js'],
        });
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // Protected/internal Chrome pages reject script injection by design.
      }
    }
  }
}
function emit(type: EventType, url?: string, source = 'extension') {
  if (!eligible() || !config || !backend) return;
  const key = `${type}:${sanitizeUrl(url)}`;
  if (Date.now() - (recent.get(key) || 0) < 800) return;
  recent.set(key, Date.now());
  if (recent.size > 100)
    for (const [entry, time] of recent) if (Date.now() - time > 3000) recent.delete(entry);
  const buffered = !backend.hasLease();
  const payload: EventInput = {
    id: crypto.randomUUID(),
    student_session_id: config.session.id,
    event_type: type,
    severity: EVENT_RULES[type].severity,
    timestamp: new Date().toISOString(),
    current_url: sanitizeUrl(url),
    metadata: buffered ? { source, reason: 'connection_buffered' } : { source },
  };
  if (buffered) showViolationLocally(payload);
  void enqueueEvent(payload).catch((reason) => {
    error = `Could not save the event locally: ${String(reason)}`;
  });
}

function showViolationLocally(payload: EventInput) {
  if (!eligible()) return;
  if (payload.event_type === 'RETURN_TO_EXAM') return;
  desktop?.send({ command: 'show_violation', event_type: payload.event_type });
  if (payload.event_type === 'CHROME_FOCUS_LOST')
    setTimeout(() => void focusContest(false).catch(() => {}), 250);
}

async function persistPendingEvents() {
  const snapshot = pendingEvents.map((event) => ({ ...event, metadata: { ...event.metadata } }));
  storageWrite = storageWrite
    .catch(() => {})
    .then(() => chrome.storage.local.set({ [PENDING_EVENTS_KEY]: snapshot }));
  await storageWrite;
}

async function enqueueEvent(payload: EventInput) {
  await pendingReady;
  if (pendingEvents.some((item) => item.id === payload.id)) return;
  pendingEvents.push(payload);
  if (pendingEvents.length > MAX_PENDING_EVENTS) {
    const discard = pendingEvents.findIndex((event) => event.severity === 'info');
    pendingEvents.splice(discard >= 0 ? discard : 0, 1);
    error = 'Event buffer is full; the oldest event was removed.';
  }
  await persistPendingEvents();
  void flushPendingEvents();
}

function scheduleFlush() {
  if (flushRetry) return;
  const delay = Math.min(1000 * 2 ** flushAttempt++, 15_000) + Math.random() * 500;
  flushRetry = setTimeout(() => {
    flushRetry = null;
    void flushPendingEvents();
  }, delay);
}

async function delivered(
  event: ViolationEvent,
  payload: EventInput,
  connection: BackendConnection,
) {
  const buffered = payload.metadata.reason === 'connection_buffered';
  let captureRequested = false;
  if (
    event.severity === 'high' &&
    event.event_type !== 'DESKTOP_GUARD_DISCONNECTED' &&
    eligible()
  ) {
    if (buffered) {
      await connection
        .request(`/api/events/${event.id}/screenshot-status`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'lease_expired' }),
        })
        .catch(() => {});
    } else {
      captureRequested = desktop?.send({ command: 'capture_screen', event_id: event.id }) ?? false;
      if (!captureRequested)
        await connection
          .request(`/api/events/${event.id}/screenshot-status`, {
            method: 'POST',
            body: JSON.stringify({ reason: 'desktop_disconnected' }),
          })
          .catch(() => {});
    }
  }
  // Desktop shows the warning and restores Chrome only after the capture finishes.
  // A timer here races the OS capture and can replace the evidence with the warning.
  if (
    eligible() &&
    backend === connection &&
    !buffered &&
    !captureRequested &&
    event.event_type !== 'RETURN_TO_EXAM'
  ) {
    desktop?.send({ command: 'show_violation', event_type: event.event_type });
    if (event.event_type === 'CHROME_FOCUS_LOST') void focusContest(false).catch(() => {});
  }
}

async function flushPendingEvents() {
  await pendingReady;
  if (flushPromise || !backend || !config || !pendingEvents.length) return;
  const connection = backend;
  flushPromise = (async () => {
    while (pendingEvents.length && backend === connection && config) {
      const payload = pendingEvents[0]!;
      if (payload.student_session_id !== config.session.id) {
        pendingEvents.shift();
        await persistPendingEvents();
        continue;
      }
      if (!config.monitoring_allowed || !config.exam.active || !config.session.active) {
        pendingEvents = pendingEvents.filter(
          (item) => item.student_session_id !== config!.session.id,
        );
        await persistPendingEvents();
        return;
      }
      try {
        const event = await connection.request<ViolationEvent>('/api/events', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        pendingEvents.shift();
        await persistPendingEvents();
        flushAttempt = 0;
        if (flushRetry) clearTimeout(flushRetry);
        flushRetry = null;
        error = null;
        await delivered(event, payload, connection);
      } catch (reason) {
        const message = String(reason);
        if (/Backend (401|403|409|422)/.test(message)) {
          pendingEvents.shift();
          await persistPendingEvents();
          continue;
        }
        if (payload.metadata.reason !== 'connection_buffered') {
          payload.metadata.reason = 'connection_buffered';
          showViolationLocally(payload);
          await persistPendingEvents();
        }
        error = `Events are saved locally and will be sent when the connection returns: ${message}`;
        scheduleFlush();
        return;
      }
    }
  })().finally(() => {
    flushPromise = null;
  });
  await flushPromise;
}
function setConfig(next: SessionConfig | null) {
  if (!next) {
    backend?.close();
    backend = null;
    config = null;
    void chrome.storage.session.remove('config');
    refresh();
    return;
  }
  if (endedSessions.has(next.session.id)) return;
  const same =
    config?.session.id === next.session.id &&
    config.token === next.token &&
    config.backend_url === next.backend_url;
  if (same && config?.exam.finished_at && !next.exam.finished_at) return;
  config = next;
  void chrome.storage.session.set({ config: next }); // Memory-backed, cleared when Chrome exits.
  if (!same || !backend) {
    backend?.close();
    backend = new BackendConnection(
      next,
      (state) => {
        if (!config || config.session.id !== state.session.id) return;
        if (config.exam.finished_at && !state.exam.finished_at) return;
        config = { ...config, exam: state.exam, session: state.session };
        void chrome.storage.session.set({ config });
        refresh();
        void flushPendingEvents();
      },
      refresh,
      (message) => {
        if (message.type === 'capture_request')
          desktop?.send({ command: 'capture_screen', event_id: message.event_id });
      },
      () => {
        endedSessions.add(next.session.id);
        setConfig(null);
        error = 'Сессия недоступна. Мониторинг остановлен.';
      },
    );
  }
  refresh();
  void flushPendingEvents();
  if (!same && !next.fizmat && !next.exam.active && !next.exam.finished_at)
    void focusContest(false).catch(() => {});
}
function focusContest(waitForFocus: boolean) {
  // Delayed event delivery must never reopen a finished contest.
  if (
    !config ||
    config.exam.finished_at ||
    (!waitForFocus && config.monitoring_allowed && !eligible())
  )
    return Promise.reject(new Error('Monitoring stopped'));
  try {
    return navigator.focus(waitForFocus);
  } catch (reason) {
    return Promise.reject(reason);
  }
}
async function openContest(requestId: string, waitForFocus: boolean) {
  try {
    await focusContest(waitForFocus);
    desktop?.send({ type: 'contest_opened', request_id: requestId, ok: true });
  } catch {
    desktop?.send({ type: 'contest_opened', request_id: requestId, ok: false });
  }
}
function connectDesktop(settings: PairSettings) {
  desktop?.close();
  desktop = null;
  pairSettings = settings;
  error = null;
  desktop = new DesktopConnection(
    settings,
    setConfig,
    () => {
      desktopLossReported = true;
      emit('DESKTOP_GUARD_DISCONNECTED', undefined, 'localhost.websocket');
      refresh();
    },
    openContest,
    (message) => {
      error = message;
    },
  );
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type !== 'fizmat_bridge') return;
  let url: URL;
  try {
    url = new URL(sender.url || '');
  } catch {
    return;
  }
  if (
    sender.frameId !== 0 ||
    !sender.tab ||
    url.origin !== 'https://fizmat.win' ||
    !/^\/contests?\/[a-zA-Z0-9-]+\/?$/.test(url.pathname)
  )
    return;
  const matches =
    !!config?.fizmat &&
    config.fizmat.contest_id === message.contestId &&
    config.fizmat.user_id === message.userId &&
    isAllowedUrl(url.href, examAllowedUrls(config.exam));
  if (message.action === 'status') {
    respond({
      installed: true,
      matches,
      desktop: matches && !!desktop?.connected,
      backend: matches && !!desktop?.status.backend && !!backend?.connected,
      permission: matches ? desktop?.status.permission : null,
      ready: matches && !!config?.session.ready && !!config.monitoring_allowed,
      active: matches && !!config?.exam.active && !!config?.session.active,
      finished: matches && !!(config?.exam.finished_at || config?.session.finished_at),
      otherActive: !matches && eligible(),
    });
    return;
  }
  if (message.action === 'pair') {
    if (eligible() && !matches) {
      respond({ error: 'OTHER_CONTEST_ACTIVE' });
      return;
    }
    if (typeof message.ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(message.ticket)) return;
    const settings: PairSettings = { secret: message.ticket, port: 17891, website: true };
    void chrome.storage.session.set({ websitePairing: settings });
    connectDesktop(settings);
    respond({ ok: true });
    return;
  }
  if (message.action === 'start' && matches && message.consent === true && desktop?.connected) {
    void desktop.startFromWebsite().then(
      () => respond({ ok: true }),
      () => respond({ error: 'START_FAILED' }),
    );
    return true;
  }
  respond({ error: 'NOT_CONNECTED' });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void monitor.activated(tabId);
  setTimeout(() => void closeForbiddenTab(tabId), 1400);
});
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && (change.url || change.status === 'complete')) {
    monitor.schedule('tabs.onUpdated');
    if (tab.id) setTimeout(() => void closeForbiddenTab(tab.id!), 1400);
  }
});
chrome.tabs.onCreated.addListener((tab) => {
  monitor.created(tab);
  if (tab.id) setTimeout(() => void closeForbiddenTab(tab.id!), 1400);
});
chrome.windows.onFocusChanged.addListener(() => monitor.schedule('windows.onFocusChanged'));
chrome.runtime.onMessage.addListener(
  (
    message: { type?: string; signal?: string; secret?: string; port?: number },
    sender,
    respond,
  ) => {
    if (message.type === 'content_signal' && message.signal) {
      monitor.content(message.signal, sender);
      return;
    }
    if (message.type === 'get_monitor_config') {
      respond({
        type: 'monitor_config',
        active: eligible(),
        allowed_urls: config ? examAllowedUrls(config.exam) : [],
      });
      return;
    }
    // Configuration and status may only be requested by the extension popup, never by a website.
    if (sender.url !== chrome.runtime.getURL('popup.html')) return;
    if (message.type === 'get_status') {
      respond(status());
      return;
    }
  },
);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'reconnect' && pairSettings && !desktop?.connected)
    connectDesktop(pairSettings);
  if (alarm.name === 'flush-events') void flushPendingEvents();
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create('reconnect', { periodInMinutes: 0.5 });
  void chrome.alarms.create('flush-events', { periodInMinutes: 0.5 });
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create('reconnect', { periodInMinutes: 0.5 });
  void chrome.alarms.create('flush-events', { periodInMinutes: 0.5 });
});
void (async () => {
  await setExamMode(false);
  await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  const cached = await chrome.storage.session.get('config');
  if (cached.config) setConfig(cached.config as SessionConfig);
  const website = await chrome.storage.session.get('websitePairing');
  if (website.websitePairing) connectDesktop(website.websitePairing as PairSettings);
  await chrome.alarms.create('reconnect', { periodInMinutes: 0.5 });
  await chrome.alarms.create('flush-events', { periodInMinutes: 0.5 });
  await pendingReady;
  void flushPendingEvents();
})();
setInterval(() => {
  refresh();
  // Chrome/OS can omit a focus notification. Reconcile current state locally;
  // transition detection deduplicates events. Never query while monitoring is stopped.
  if (monitor.active) monitor.schedule('focus_recheck');
}, 1000);
