// ../../packages/protocol/src/index.ts
var WAITING_URL = "https://fizmat.win/waiting";
var EVENT_RULES = {
  PAGE_HIDDEN: { severity: "medium", risk: 5 },
  NEW_TAB: { severity: "medium", risk: 10 },
  TAB_CHANGED: { severity: "high", risk: 20 },
  GOOGLE_LENS_ATTEMPT: { severity: "high", risk: 0 },
  BROWSER_UI_ATTEMPT: { severity: "high", risk: 15 },
  CHROME_FOCUS_LOST: { severity: "high", risk: 25 },
  DESKTOP_GUARD_DISCONNECTED: { severity: "high", risk: 30 },
  STUDENT_DISCONNECTED: { severity: "high", risk: 30 },
  STUDENT_RECONNECTED: { severity: "info", risk: 0 },
  TEACHER_SCREENSHOT: { severity: "info", risk: 0 },
  RETURN_TO_EXAM: { severity: "info", risk: 0 }
};
function examAllowedUrls(exam) {
  return exam.allowed_urls?.length ? exam.allowed_urls : [exam.allowed_url];
}
function isAllowedUrl(current, allowed) {
  return (Array.isArray(allowed) ? allowed : [allowed]).some((value) => {
    try {
      const candidate = new URL(current ?? "");
      const base = new URL(value);
      const path = base.pathname.replace(/\/+$/, "");
      return candidate.origin === base.origin && (candidate.pathname === path || candidate.pathname.startsWith(`${path}/`));
    } catch {
      return false;
    }
  });
}
function sanitizeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:")
      return `${url.origin}${url.pathname}`.slice(0, 2048);
    return `${url.protocol}//${url.hostname}${url.pathname}`.slice(0, 2048);
  } catch {
    return null;
  }
}
function websocketUrl(base, path) {
  const url = new URL(path, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

// src/services/backend.ts
var BackendConnection = class {
  constructor(config2, onState, onLost, onCommand) {
    this.config = config2;
    this.onState = onState;
    this.onLost = onLost;
    this.onCommand = onCommand;
    this.connect();
  }
  config;
  onState;
  onLost;
  onCommand;
  socket = null;
  retry = null;
  heartbeat = null;
  closed = false;
  receivedAt = 0;
  leaseSeconds = 0;
  reconnectAttempt = 0;
  connected = false;
  hasLease() {
    return this.connected && Date.now() - this.receivedAt < this.leaseSeconds * 1e3;
  }
  withinOfflineGrace(graceMs = 12e4) {
    return this.receivedAt > 0 && Date.now() - this.receivedAt < graceMs;
  }
  connect() {
    if (this.closed) return;
    const ws = new WebSocket(
      websocketUrl(this.config.backend_url, `/ws/student/${this.config.session.id}`)
    );
    this.socket = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token: this.config.token, role: "extension" }));
      this.heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "heartbeat" }));
        if (!this.hasLease()) this.onLost();
      }, 5e3);
    };
    ws.onmessage = (message) => {
      const state = JSON.parse(String(message.data));
      if (state.type === "capture_request") {
        this.onCommand?.(state);
        return;
      }
      if (state.type !== "session_state" && state.type !== "heartbeat_ack") return;
      this.connected = true;
      this.reconnectAttempt = 0;
      this.receivedAt = Date.now();
      this.leaseSeconds = state.lease_seconds;
      this.onState(state);
    };
    ws.onclose = (event) => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.connected = false;
      this.onLost();
      if (!this.closed && event.code !== 4401 && event.code !== 4001)
        this.retry = setTimeout(
          () => this.connect(),
          Math.min(1e3 * 2 ** this.reconnectAttempt++, 15e3) + Math.random() * 500
        );
    };
    ws.onerror = () => ws.close();
  }
  async request(path, options = {}) {
    const response = await fetch(`${this.config.backend_url}${path}`, {
      ...options,
      signal: AbortSignal.timeout(7e3),
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
        ...options.headers
      }
    });
    if (!response.ok) throw new Error(`Backend ${response.status}`);
    return response.json();
  }
  close() {
    this.closed = true;
    this.connected = false;
    if (this.retry) clearTimeout(this.retry);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close();
  }
};

// src/services/desktop.ts
var DesktopConnection = class {
  constructor(settings, onConfig, onLost, onOpenContest, onError) {
    this.settings = settings;
    this.onConfig = onConfig;
    this.onLost = onLost;
    this.onOpenContest = onOpenContest;
    this.onError = onError;
    this.connect();
  }
  settings;
  onConfig;
  onLost;
  onOpenContest;
  onError;
  socket = null;
  retry = null;
  heartbeat = null;
  lastSeen = 0;
  closed = false;
  reconnectAttempt = 0;
  connected = false;
  connect() {
    if (this.closed) return;
    const ws = new WebSocket(`ws://127.0.0.1:${this.settings.port}`);
    this.socket = ws;
    ws.onopen = () => {
      this.lastSeen = Date.now();
      ws.send(JSON.stringify({ type: "pair", secret: this.settings.secret }));
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastSeen > 1e4) {
          ws.close();
          return;
        }
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 3e3);
    };
    ws.onmessage = (message) => {
      this.lastSeen = Date.now();
      const data = JSON.parse(String(message.data));
      if (data.type === "config") {
        this.connected = true;
        this.reconnectAttempt = 0;
        this.onConfig(data.config ?? null);
      }
      if (data.type === "open_contest" && data.request_id)
        void this.onOpenContest(data.request_id, data.wait_for_focus === true);
      if (data.type === "error") this.onError(data.detail || "Pairing failed");
    };
    ws.onclose = (event) => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) this.onLost();
      if (!this.closed && event.code !== 4401 && event.code !== 4001)
        this.retry = setTimeout(
          () => this.connect(),
          Math.min(1e3 * 2 ** this.reconnectAttempt++, 15e3) + Math.random() * 500
        );
      if (event.code === 4401)
        this.onError("Pairing code rejected. Enter the code shown in Desktop Guard.");
    };
    ws.onerror = () => ws.close();
  }
  send(data) {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(data));
    return true;
  }
  close() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close();
  }
};

// src/background/monitor.ts
var ExamMonitor = class {
  constructor(emit2) {
    this.emit = emit2;
  }
  emit;
  running = false;
  allowed = [];
  focused = null;
  allowedTab = null;
  tabId;
  lastAllowedTabId;
  checkTimer = null;
  browserUiTimer = null;
  pageFocused = null;
  lastHidden = 0;
  epoch = 0;
  get active() {
    return this.running;
  }
  get preferredTabId() {
    return this.lastAllowedTabId;
  }
  setActive(active, allowed) {
    this.allowed = allowed;
    if (active === this.running) return;
    this.running = active;
    this.epoch++;
    this.focused = null;
    this.allowedTab = null;
    this.tabId = void 0;
    this.lastAllowedTabId = void 0;
    this.pageFocused = null;
    if (active) this.schedule("monitoring_started");
    else {
      if (this.checkTimer) clearTimeout(this.checkTimer);
      if (this.browserUiTimer) clearTimeout(this.browserUiTimer);
    }
  }
  schedule(source) {
    if (!this.running) return;
    if (this.checkTimer) clearTimeout(this.checkTimer);
    this.checkTimer = setTimeout(() => {
      void this.inspect(source);
    }, 700);
  }
  async activated(tabId) {
    if (!this.running) return;
    const epoch = this.epoch;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!this.running || epoch !== this.epoch) return;
      const allowed = isAllowedUrl(tab.url, this.allowed);
      if (allowed && tab.id) this.lastAllowedTabId = tab.id;
      this.schedule("tabs.onActivated");
    } catch {
      this.schedule("tabs.onActivated.retry");
    }
  }
  async inspect(source) {
    if (!this.running) return;
    const epoch = this.epoch;
    try {
      const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
      const focused = windows.find((window) => window.focused);
      if (!this.running || epoch !== this.epoch) return;
      if (!focused?.id) {
        if (this.focused !== false) this.emit("CHROME_FOCUS_LOST", void 0, source);
        this.focused = false;
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, windowId: focused.id });
      if (!this.running || epoch !== this.epoch || !tab) return;
      const allowed = isAllowedUrl(tab.url, this.allowed);
      if (!allowed && (this.allowedTab !== false || this.tabId !== tab.id))
        this.emit("TAB_CHANGED", tab.url, source);
      if (allowed && (this.focused === false || this.allowedTab === false))
        this.emit("RETURN_TO_EXAM", tab.url, source);
      this.focused = true;
      this.allowedTab = allowed;
      this.tabId = tab.id;
      if (allowed) this.lastAllowedTabId = tab.id;
    } catch {
    }
  }
  created(tab) {
    if (this.running) {
      const url = tab.pendingUrl || tab.url;
      if (isAllowedUrl(url, this.allowed)) {
        this.schedule("tabs.onCreated.allowed");
        return;
      }
      this.emit("NEW_TAB", url, "tabs.onCreated");
      if (tab.active && !isAllowedUrl(url, this.allowed)) {
        this.focused = true;
        this.allowedTab = false;
        this.tabId = tab.id;
        this.emit("TAB_CHANGED", url, "tabs.onCreated.active");
      }
      this.schedule("tabs.onCreated");
    }
  }
  async inspectBrowserUi(tabId, url, epoch) {
    if (!this.running || epoch !== this.epoch || this.pageFocused !== false) return;
    try {
      const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
      const focused = windows.find((window) => window.focused);
      if (!focused?.id || !this.running || epoch !== this.epoch) return;
      const [active] = await chrome.tabs.query({ active: true, windowId: focused.id });
      if (this.pageFocused === false && active?.id === tabId && isAllowedUrl(active.url, this.allowed))
        this.emit("BROWSER_UI_ATTEMPT", url, "document.blur.browser_ui");
    } catch {
    }
  }
  content(signal, sender) {
    if (!this.running || !isAllowedUrl(sender.url, this.allowed) || sender.frameId !== 0) return;
    const senderTabId = sender.tab?.id;
    if (signal === "contextmenu") {
      this.emit("GOOGLE_LENS_ATTEMPT", sender.url, "document.contextmenu");
      return;
    }
    if (signal === "hidden" && Date.now() - this.lastHidden > 800) {
      this.lastHidden = Date.now();
      this.emit("PAGE_HIDDEN", sender.url, "document.visibilitychange");
    }
    if (signal === "blur" && senderTabId) {
      this.pageFocused = false;
      if (this.browserUiTimer) clearTimeout(this.browserUiTimer);
      const epoch = this.epoch;
      this.browserUiTimer = setTimeout(
        () => void this.inspectBrowserUi(senderTabId, sender.url, epoch),
        200
      );
    }
    if (signal === "focus") {
      this.pageFocused = true;
      if (this.browserUiTimer) clearTimeout(this.browserUiTimer);
      this.browserUiTimer = null;
    }
    if (signal === "visible" || signal === "focus" || signal === "blur")
      this.schedule(`content.${signal}`);
  }
};

// src/background/index.ts
var config = null;
var backend = null;
var desktop = null;
var error = null;
var pairSettings = null;
var lastBadge = "";
var lastBadgeColor = "";
var desktopMissingSince = 0;
var desktopLossReported = false;
var examModeEnabled = false;
var recent = /* @__PURE__ */ new Map();
var PENDING_EVENTS_KEY = "pendingEvents";
var MAX_PENDING_EVENTS = 500;
var CONTENT_SCRIPT_MATCHES = ["https://*/*"];
var pendingEvents = [];
var flushPromise = null;
var flushRetry = null;
var flushAttempt = 0;
var storageWrite = Promise.resolve();
var pendingReady = chrome.storage.local.get(PENDING_EVENTS_KEY).then((saved) => {
  const value = saved[PENDING_EVENTS_KEY];
  if (!Array.isArray(value)) return;
  pendingEvents = value.filter(
    (item) => !!item && typeof item === "object" && typeof item.id === "string" && typeof item.student_session_id === "string" && typeof item.event_type === "string" && typeof item.timestamp === "string"
  ).slice(-MAX_PENDING_EVENTS);
});
var monitor = new ExamMonitor((type, url, source) => {
  emit(type, url, source);
});
function eligible() {
  return !!(config?.monitoring_allowed && config.exam.active && config.session.active && (backend?.hasLease() || backend?.withinOfflineGrace()));
}
function status() {
  return {
    desktop: desktop?.connected ?? false,
    backend: backend?.hasLease() ?? false,
    monitoring: eligible(),
    examTitle: config?.exam.title ?? null,
    allowedUrl: config?.exam.allowed_url ?? null,
    allowedUrls: config ? examAllowedUrls(config.exam) : [],
    error
  };
}
function refresh() {
  const active = eligible();
  if (desktop?.connected) {
    desktopMissingSince = 0;
    desktopLossReported = false;
  } else if (active && !desktopLossReported) {
    desktopMissingSince ||= Date.now();
    if (Date.now() - desktopMissingSince > 3e3) {
      desktopLossReported = true;
      emit("DESKTOP_GUARD_DISCONNECTED", void 0, "localhost.unavailable");
    }
  } else if (!active) desktopMissingSince = 0;
  const changed = monitor.active !== active;
  monitor.setActive(active, config ? examAllowedUrls(config.exam) : []);
  if (active !== examModeEnabled)
    void setExamMode(active).catch((reason) => {
      examModeEnabled = false;
      error = `Exam mode failed: ${String(reason)}`;
    });
  const badge = active ? desktop?.connected ? "ON" : "!" : "";
  const color = desktop?.connected ? "#208660" : "#d3455b";
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
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function setExamMode(active) {
  examModeEnabled = active;
  const removeRuleIds = [1, 2, 3, 4, 5];
  if (!active || !config) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    return;
  }
  const allowRules = examAllowedUrls(config.exam).map((value, index) => {
    const allowed = new URL(value);
    const path = allowed.pathname.replace(/\/+$/, "");
    return {
      id: index + 2,
      priority: 2,
      action: { type: chrome.declarativeNetRequest.RuleActionType.ALLOW },
      condition: {
        regexFilter: `^${escapeRegex(allowed.origin)}${escapeRegex(path)}(?:[/#?]|$)`,
        resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME]
      }
    };
  });
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: [
      {
        id: 5,
        priority: 3,
        action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
        condition: { urlFilter: "||lens.google.com/" }
      },
      {
        id: 1,
        priority: 1,
        action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
        condition: {
          regexFilter: "^https?://",
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME]
        }
      },
      ...allowRules
    ]
  });
  await enforceExamTabs();
}
async function enforceExamTabs() {
  if (!eligible() || !config) return;
  const allowedUrls = examAllowedUrls(config.exam);
  let tabs = await chrome.tabs.query({});
  for (const url of allowedUrls) {
    if (!tabs.some((tab) => isAllowedUrl(tab.url, url))) {
      const created = await chrome.tabs.create({ url, active: false });
      tabs.push(created);
    }
  }
  const forbidden = tabs.filter((tab) => {
    if (!tab.id || !tab.url) return false;
    try {
      const protocol = new URL(tab.url).protocol;
      return (protocol === "http:" || protocol === "https:") && !isAllowedUrl(tab.url, allowedUrls);
    } catch {
      return false;
    }
  });
  if (forbidden.length) await chrome.tabs.remove(forbidden.map((tab) => tab.id));
}
async function closeForbiddenTab(tabId) {
  if (!eligible() || !config) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && !isAllowedUrl(tab.url, examAllowedUrls(config.exam))) {
      const protocol = new URL(tab.url).protocol;
      if (protocol === "http:" || protocol === "https:") await chrome.tabs.remove(tabId);
    }
  } catch {
  }
}
async function syncContentScripts() {
  const tabs = await chrome.tabs.query({ url: CONTENT_SCRIPT_MATCHES });
  const message = {
    type: "monitor_config",
    active: eligible(),
    allowed_urls: config ? examAllowedUrls(config.exam) : []
  };
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ["content.js"]
        });
        await chrome.tabs.sendMessage(tab.id, message);
      } catch {
      }
    }
  }
}
function emit(type, url, source = "extension") {
  if (!eligible() || !config || !backend) return;
  const key = `${type}:${sanitizeUrl(url)}`;
  if (Date.now() - (recent.get(key) || 0) < 800) return;
  recent.set(key, Date.now());
  if (recent.size > 100) {
    for (const [entry, time] of recent) if (Date.now() - time > 3e3) recent.delete(entry);
  }
  const buffered = !backend.hasLease();
  const payload = {
    id: crypto.randomUUID(),
    student_session_id: config.session.id,
    event_type: type,
    severity: EVENT_RULES[type].severity,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    current_url: sanitizeUrl(url),
    metadata: buffered ? { source, reason: "connection_buffered" } : { source }
  };
  if (buffered) showViolationLocally(payload);
  void enqueueEvent(payload).catch((reason) => {
    error = `Could not save the event locally: ${String(reason)}`;
  });
}
function showViolationLocally(payload) {
  if (payload.event_type === "RETURN_TO_EXAM") return;
  desktop?.send({ command: "show_violation", event_type: payload.event_type });
  if (payload.event_type === "CHROME_FOCUS_LOST") setTimeout(() => void focusContest(false), 250);
}
async function persistPendingEvents() {
  const snapshot = pendingEvents.map((event) => ({ ...event, metadata: { ...event.metadata } }));
  storageWrite = storageWrite.catch(() => {
  }).then(() => chrome.storage.local.set({ [PENDING_EVENTS_KEY]: snapshot }));
  await storageWrite;
}
async function enqueueEvent(payload) {
  await pendingReady;
  if (pendingEvents.some((item) => item.id === payload.id)) return;
  pendingEvents.push(payload);
  if (pendingEvents.length > MAX_PENDING_EVENTS) {
    const discard = pendingEvents.findIndex((event) => event.severity === "info");
    pendingEvents.splice(discard >= 0 ? discard : 0, 1);
    error = "Event buffer is full; the oldest event was removed.";
  }
  await persistPendingEvents();
  void flushPendingEvents();
}
function scheduleFlush() {
  if (flushRetry) return;
  const delay = Math.min(1e3 * 2 ** flushAttempt++, 15e3) + Math.random() * 500;
  flushRetry = setTimeout(() => {
    flushRetry = null;
    void flushPendingEvents();
  }, delay);
}
async function delivered(event, payload, connection) {
  const buffered = payload.metadata.reason === "connection_buffered";
  let captureRequested = false;
  if (event.severity === "high" && event.event_type !== "DESKTOP_GUARD_DISCONNECTED" && eligible()) {
    if (buffered) {
      await connection.request(`/api/events/${event.id}/screenshot-status`, {
        method: "POST",
        body: JSON.stringify({ reason: "lease_expired" })
      }).catch(() => {
      });
    } else {
      captureRequested = desktop?.send({ command: "capture_screen", event_id: event.id }) ?? false;
      if (!captureRequested)
        await connection.request(`/api/events/${event.id}/screenshot-status`, {
          method: "POST",
          body: JSON.stringify({ reason: "desktop_disconnected" })
        }).catch(() => {
        });
    }
  }
  if (!buffered && !captureRequested && event.event_type !== "RETURN_TO_EXAM") {
    desktop?.send({ command: "show_violation", event_type: event.event_type });
    if (event.event_type === "CHROME_FOCUS_LOST") void focusContest(false);
  }
}
async function flushPendingEvents() {
  await pendingReady;
  if (flushPromise || !backend || !config || !pendingEvents.length) return;
  const connection = backend;
  flushPromise = (async () => {
    while (pendingEvents.length && backend === connection && config) {
      const payload = pendingEvents[0];
      if (payload.student_session_id !== config.session.id) {
        pendingEvents.shift();
        await persistPendingEvents();
        continue;
      }
      if (!config.monitoring_allowed || !config.exam.active || !config.session.active) {
        pendingEvents = pendingEvents.filter(
          (item) => item.student_session_id !== config.session.id
        );
        await persistPendingEvents();
        return;
      }
      try {
        const event = await connection.request("/api/events", {
          method: "POST",
          body: JSON.stringify(payload)
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
        if (payload.metadata.reason !== "connection_buffered") {
          payload.metadata.reason = "connection_buffered";
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
function setConfig(next) {
  if (!next) {
    backend?.close();
    backend = null;
    config = null;
    void chrome.storage.session.remove("config");
    refresh();
    return;
  }
  const same = config?.session.id === next.session.id && config.token === next.token && config.backend_url === next.backend_url;
  config = next;
  void chrome.storage.session.set({ config: next });
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
        if (message.type === "capture_request")
          desktop?.send({ command: "capture_screen", event_id: message.event_id });
      }
    );
  }
  refresh();
  void flushPendingEvents();
  if (!same && !next.exam.active && !next.exam.finished_at)
    void focusContest(false).catch(() => {
    });
}
async function focusContest(waitForFocus) {
  if (!config) return;
  const tabs = await chrome.tabs.query({});
  const allowedUrls = examAllowedUrls(config.exam);
  const preferred = monitor.preferredTabId ? tabs.find((tab2) => tab2.id === monitor.preferredTabId && isAllowedUrl(tab2.url, allowedUrls)) : void 0;
  const activeAllowed = tabs.find((tab2) => tab2.active && isAllowedUrl(tab2.url, allowedUrls));
  const existing = preferred || activeAllowed || tabs.find((tab2) => isAllowedUrl(tab2.url, allowedUrls));
  const tab = existing?.id ? await chrome.tabs.update(existing.id, { active: true }) : await chrome.tabs.create({ url: allowedUrls[0], active: true });
  if (!tab) throw new Error("Tab unavailable");
  await chrome.windows.update(tab.windowId, { focused: true });
  if (waitForFocus) {
    let ready = false;
    const deadline = Date.now() + 25e3;
    while (Date.now() < deadline && config && desktop?.connected) {
      const window = await chrome.windows.get(tab.windowId);
      const [active] = await chrome.tabs.query({ windowId: tab.windowId, active: true });
      let accountReady = true;
      if (active?.id && isAllowedUrl(active.url, WAITING_URL)) {
        try {
          const result = await chrome.scripting.executeScript({
            target: { tabId: active.id },
            func: () => !!document.querySelector('[data-waiting-account="ready"]')
          });
          accountReady = result[0]?.result === true;
        } catch {
          accountReady = false;
        }
      }
      if (window.focused && isAllowedUrl(active?.url, allowedUrls) && accountReady) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!ready)
      throw new Error("Sign in to your contest account in Chrome, then click Ready again");
  }
}
async function openContest(requestId, waitForFocus) {
  try {
    await focusContest(waitForFocus);
    desktop?.send({ type: "contest_opened", request_id: requestId, ok: true });
  } catch {
    desktop?.send({ type: "contest_opened", request_id: requestId, ok: false });
  }
}
function connectDesktop(settings) {
  desktop?.close();
  desktop = null;
  pairSettings = settings;
  error = null;
  desktop = new DesktopConnection(
    settings,
    setConfig,
    () => {
      desktopLossReported = true;
      emit("DESKTOP_GUARD_DISCONNECTED", void 0, "localhost.websocket");
      refresh();
    },
    openContest,
    (message) => {
      error = message;
    }
  );
}
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void monitor.activated(tabId);
  setTimeout(() => void closeForbiddenTab(tabId), 1400);
});
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && (change.url || change.status === "complete")) {
    monitor.schedule("tabs.onUpdated");
    if (tab.id) setTimeout(() => void closeForbiddenTab(tab.id), 1400);
  }
});
chrome.tabs.onCreated.addListener((tab) => {
  monitor.created(tab);
  if (tab.id) setTimeout(() => void closeForbiddenTab(tab.id), 1400);
});
chrome.windows.onFocusChanged.addListener(() => monitor.schedule("windows.onFocusChanged"));
chrome.runtime.onMessage.addListener(
  (message, sender, respond) => {
    if (message.type === "content_signal" && message.signal) {
      monitor.content(message.signal, sender);
      return;
    }
    if (message.type === "get_monitor_config") {
      respond({
        type: "monitor_config",
        active: eligible(),
        allowed_urls: config ? examAllowedUrls(config.exam) : []
      });
      return;
    }
    if (sender.url !== chrome.runtime.getURL("popup.html")) return;
    if (message.type === "get_status") {
      respond(status());
      return;
    }
    if (message.type === "pair" && message.secret && /^[A-Z0-9]{8}$/.test(message.secret)) {
      const port = message.port ?? 17891;
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        respond({ ok: false });
        return;
      }
      const settings = { secret: message.secret, port };
      void chrome.storage.local.set({ pairing: settings });
      connectDesktop(settings);
      respond({ ok: true });
      return;
    }
    if (message.type === "reconnect" && pairSettings) {
      backend?.close();
      backend = null;
      connectDesktop(pairSettings);
      respond({ ok: true });
    }
  }
);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "reconnect" && pairSettings && !desktop?.connected)
    connectDesktop(pairSettings);
  if (alarm.name === "flush-events") void flushPendingEvents();
});
chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create("reconnect", { periodInMinutes: 0.5 });
  void chrome.alarms.create("flush-events", { periodInMinutes: 0.5 });
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create("reconnect", { periodInMinutes: 0.5 });
  void chrome.alarms.create("flush-events", { periodInMinutes: 0.5 });
});
void (async () => {
  await setExamMode(false);
  await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const cached = await chrome.storage.session.get("config");
  if (cached.config) setConfig(cached.config);
  const saved = await chrome.storage.local.get("pairing");
  if (saved.pairing) connectDesktop(saved.pairing);
  await chrome.alarms.create("reconnect", { periodInMinutes: 0.5 });
  await chrome.alarms.create("flush-events", { periodInMinutes: 0.5 });
  await pendingReady;
  void flushPendingEvents();
})();
setInterval(() => {
  refresh();
  if (monitor.active) monitor.schedule("focus_recheck");
}, 1e3);
