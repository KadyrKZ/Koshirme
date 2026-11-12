import { randomBytes } from 'node:crypto';
import type { SessionConfig, SessionState, ViolationEvent } from '@koshirme/protocol';
import type { DesktopState, JoinInput } from '../types';
import { BackendClient, request, validateBackendUrl } from './backend';
import { LocalServer } from './local-server';
import { captureScreens, screenPermission } from './screen-capture';
import type { ApplicationControl } from './application-control';

export class Guard {
  private config: SessionConfig | null = null;
  private backend: BackendClient | null = null;
  private local: LocalServer;
  private timer: ReturnType<typeof setInterval>;
  private capturing = false;
  private collectingScreen = false;
  private pendingWarning: string | null = null;
  private pendingBrowserReturn = false;
  private returningBrowser: Promise<void> | null = null;
  private browserReopenTimer: ReturnType<typeof setTimeout> | null = null;
  private browserReopenAttempted = false;
  private lastBrowserReopenAt = 0;
  private restoreOnReconnect = false;
  private lastCaptureAt = 0;
  private seen = new Set<string>();
  private epoch = 0;
  private startAttempt = 0;
  private closed = false;
  private websiteTicket: string | null = null;
  private preparation: AbortController | null = null;
  readonly state: DesktopState;
  constructor(
    private changed: (state: DesktopState) => void,
    private violation: (eventType: string) => void,
    private restoreBrowser: (url: string) => void | Promise<void>,
    pairingCode?: string,
    private beforeCapture: () => void = () => {},
    private activateBrowser: () => void | Promise<void> = () => {},
    private applicationControl?: ApplicationControl,
  ) {
    const port = Number(
      process.env.KOSHIRME_LOCAL_PORT || process.env.EXAMGUARD_LOCAL_PORT || '17891',
    );
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error('Invalid KOSHIRME_LOCAL_PORT');
    this.state = {
      starting: false,
      backend: false,
      extension: false,
      permission: screenPermission(),
      pairingCode: pairingCode || randomBytes(4).toString('hex').toUpperCase(),
      session: null,
      exam: null,
      monitoring: false,
      consented: false,
      error: null,
    };
    this.local = new LocalServer(
      port,
      this.state.pairingCode,
      () => this.config,
      (connected) => {
        this.state.extension = connected;
        if (connected) {
          if (this.config?.fizmat && !this.state.monitoring)
            void this.local
              .openContest(false)
              .then(() => this.activateBrowser())
              .catch(() => {});
          this.cancelBrowserReopen();
          this.browserReopenAttempted = false;
          if (this.restoreOnReconnect && this.active()) this.returnToContest();
          this.restoreOnReconnect = false;
        } else if (
          this.config?.fizmat &&
          this.state.consented &&
          this.config.session.ready &&
          (this.config.exam.active || this.config.exam.paused)
        ) {
          // Do not recover Chrome into the same attempt after its extension closes.
          // Closing the desktop socket also makes this loss visible to the server.
          this.preparation?.abort();
          this.startAttempt++;
          this.state.starting = false;
          this.state.consented = false;
          this.config.monitoring_allowed = false;
          this.state.error = 'Связь с расширением потеряна. Контест завершается.';
          this.backend?.close();
        } else if (this.active()) this.scheduleBrowserReopen();
        this.publish();
      },
      (eventId) => {
        void this.capture(eventId);
      },
      (eventType) => {
        if (this.active()) this.handleViolation(eventType);
      },
      (error) => {
        this.state.error = error;
        this.publish();
      },
      async () => {
        if (!this.config?.fizmat) throw new Error('Open the contest on fizmat.win');
        await this.start();
      },
      () => ({
        permission: this.state.permission,
        backend: this.state.backend,
        starting: this.state.starting,
      }),
    );
    this.timer = setInterval(() => {
      this.state.permission = screenPermission();
      this.publish();
    }, 1000);
  }
  private active() {
    return !!(
      this.state.consented &&
      !this.closed &&
      this.config?.exam.active &&
      !this.config.exam.finished_at &&
      !this.config.session.finished_at &&
      this.config.session.active &&
      (this.backend?.hasLease() || this.backend?.withinOfflineGrace())
    );
  }
  private publish() {
    const wasMonitoring = this.state.monitoring;
    this.state.backend = this.backend?.hasLease() ?? false;
    this.state.monitoring = this.active();
    this.applicationControl?.setActive(this.state.monitoring);
    if (wasMonitoring && !this.state.monitoring) {
      this.pendingWarning = null;
      this.pendingBrowserReturn = false;
      this.restoreOnReconnect = false;
      this.cancelBrowserReopen();
      this.epoch++;
      this.beforeCapture();
    }
    this.local?.sendStatus?.();
    this.changed({ ...this.state });
  }
  private cancelBrowserReopen() {
    if (this.browserReopenTimer) clearTimeout(this.browserReopenTimer);
    this.browserReopenTimer = null;
  }
  private scheduleBrowserReopen() {
    this.restoreOnReconnect = true;
    if (this.browserReopenTimer || this.browserReopenAttempted) return;
    const epoch = this.epoch;
    // One launch per uninterrupted outage; flapping cannot launch more often than 30s.
    const delay = Math.max(2000, this.lastBrowserReopenAt + 30000 - Date.now());
    this.browserReopenTimer = setTimeout(() => {
      this.browserReopenTimer = null;
      if (!this.active() || epoch !== this.epoch || this.local.connected || !this.config) return;
      if (this.collectingScreen) {
        this.pendingBrowserReturn = true;
        return;
      }
      this.browserReopenAttempted = true;
      this.lastBrowserReopenAt = Date.now();
      const url = this.config.exam.allowed_url;
      void Promise.resolve()
        .then(() => {
          if (this.active() && epoch === this.epoch) return this.restoreBrowser(url);
        })
        .catch((error) => {
          if (this.active() && epoch === this.epoch) {
            this.state.error = `Could not reopen Chrome: ${String(error)}`;
            this.publish();
          }
        });
    }, delay);
  }
  private handleViolation(type: string) {
    if (type === 'CHROME_FOCUS_LOST' || type === 'TAB_CHANGED') this.pendingBrowserReturn = true;
    if (this.collectingScreen) {
      this.pendingWarning = type;
      return;
    }
    this.violation(type);
    if (this.pendingBrowserReturn) this.returnToContest();
  }
  private returnToContest() {
    if (!this.active()) return;
    if (this.collectingScreen) {
      this.pendingBrowserReturn = true;
      return;
    }
    this.pendingBrowserReturn = false;
    const epoch = this.epoch;
    void this.openContest().catch((error) => {
      if (!this.active() || epoch !== this.epoch) return;
      if (!this.local.connected) this.scheduleBrowserReopen();
      this.state.error = `Could not return to the contest: ${String(error)}`;
      this.publish();
    });
  }
  private acceptState(state: SessionState) {
    if (!this.config || this.config.session.id !== state.session.id) return;
    if (this.config.exam.finished_at && !state.exam.finished_at) return;
    if (this.config.session.finished_at && !state.session.finished_at) return;
    const teacherJustStarted =
      !this.config.exam.active && state.exam.active && state.session.active;
    this.config = { ...this.config, session: state.session, exam: state.exam };
    this.state.session = state.session;
    this.state.exam = state.exam;
    if (state.exam.finished_at || state.session.finished_at || !state.session.ready) {
      this.state.consented = false;
      this.epoch++;
    }
    if (state.exam.finished_at || state.session.finished_at || state.exam.paused) {
      this.preparation?.abort();
      this.startAttempt++;
      this.state.starting = false;
    }
    this.config.monitoring_allowed = this.state.consented;
    this.local.sendConfig();
    this.publish();
    if (teacherJustStarted && this.state.consented) {
      void this.openContest().catch(() => {
        this.state.error =
          'Chrome could not open the assigned contest. Check the extension connection.';
        this.publish();
      });
    }
  }
  async join(input: JoinInput) {
    if (this.config?.session.active)
      throw new Error('Stop the current session before joining another exam');
    if (
      typeof input.studentName !== 'string' ||
      !input.studentName.trim() ||
      input.studentName.length > 120 ||
      !/^\d{4}$/.test(input.joinCode)
    )
      throw new Error('Enter your name and the four-digit room code');
    const base = validateBackendUrl(
      process.env.KOSHIRME_BACKEND_URL ||
        process.env.EXAMGUARD_BACKEND_URL ||
        'https://koshirme.stream',
    );
    const joined = await request<Omit<SessionConfig, 'backend_url' | 'monitoring_allowed'>>(
      base,
      '/api/student/join',
      undefined,
      {
        method: 'POST',
        body: JSON.stringify({
          student_name: input.studentName.trim(),
          join_code: input.joinCode.toUpperCase(),
        }),
      },
    );
    this.installSession(joined, base);
    if (!joined.exam.active && !joined.exam.finished_at && !this.local.connected)
      await this.restoreBrowser(joined.exam.allowed_url);
  }
  async connectWebsite(ticket: string) {
    if (this.websiteTicket === ticket && this.config) return;
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new Error('Invalid connection ticket');
    if (this.state.starting) throw new Error('Wait for the current connection');
    if (this.state.monitoring && !this.config?.fizmat)
      throw new Error('Finish the current exam before opening another contest');
    const base = 'https://koshirme.stream';
    const joined = await request<Omit<SessionConfig, 'backend_url' | 'monitoring_allowed'>>(
      base,
      '/api/student/connect',
      undefined,
      {
        method: 'POST',
        body: JSON.stringify({
          ticket,
          ...(this.config?.fizmat && this.state.consented
            ? { resumeToken: this.config.token }
            : {}),
        }),
      },
    );
    if (!joined.fizmat) throw new Error('Invalid contest connection');
    this.websiteTicket = ticket;
    this.local.setWebsiteSecret(ticket);
    if (this.config?.token === joined.token) {
      this.local.sendConfig();
      return;
    }
    this.installSession(joined, base);
  }
  private installSession(
    joined: Omit<SessionConfig, 'backend_url' | 'monitoring_allowed'>,
    base: string,
  ) {
    this.preparation?.abort();
    this.backend?.close();
    this.config = { ...joined, backend_url: base, monitoring_allowed: false };
    this.epoch++;
    this.state.websiteConnected = !!joined.fizmat;
    this.state.session = joined.session;
    this.state.exam = joined.exam;
    this.state.consented = false;
    this.state.error = null;
    this.seen.clear();
    this.backend = new BackendClient(
      this.config,
      (state) => this.acceptState(state),
      () => this.publish(),
      () => {
        this.preparation?.abort();
        this.startAttempt++;
        this.epoch++;
        this.state.starting = false;
        this.state.consented = false;
        this.config = null;
        this.state.session = null;
        this.state.exam = null;
        this.state.error = 'Сессия недоступна. Мониторинг остановлен. Можно закрыть приложение.';
        this.local.sendConfig();
        this.publish();
      },
    );
    this.local.sendConfig();
    this.publish();
  }
  async start() {
    if (this.state.starting) throw new Error('Wait for the current session action to finish');
    if (!this.config || !this.backend?.hasLease() || !this.local.connected)
      throw new Error('Connect the backend and Chrome extension first');
    if (this.config.exam.finished_at || this.config.session.finished_at || this.config.exam.paused)
      throw new Error('Контест завершён или приостановлен');
    if (screenPermission() !== 'granted')
      throw new Error('Grant Screen Recording permission, then restart KOSH!RME');
    const attempt = ++this.startAttempt;
    const preparation = (this.preparation = new AbortController());
    const backend = this.backend;
    const sessionId = this.config.session.id;
    this.state.starting = true;
    this.state.error = null;
    this.publish();
    try {
      if (this.applicationControl) await this.applicationControl.prepare(preparation.signal);
      if (attempt !== this.startAttempt || preparation.signal.aborted) return;
      const opening = this.local.openContest(true);
      // macOS may acknowledge Chrome's window focus without activating the application.
      void Promise.resolve(this.activateBrowser()).catch(() => {});
      await opening;
      if (attempt !== this.startAttempt) return;
      const state = await backend.request<SessionState>(
        `/api/student/sessions/${sessionId}/ready`,
        { method: 'POST' },
      );
      if (attempt !== this.startAttempt) return;
      this.state.consented = true;
      this.acceptState(state);
    } catch (e) {
      if (attempt !== this.startAttempt) return;
      this.state.consented = false;
      this.state.error = String((e as Error).message || e);
      this.publish();
      throw e;
    } finally {
      if (attempt === this.startAttempt) {
        this.state.starting = false;
        this.publish();
      }
    }
  }
  openContest() {
    if (this.returningBrowser) return this.returningBrowser;
    const epoch = this.epoch;
    const valid = () =>
      !this.closed &&
      epoch === this.epoch &&
      !this.config?.exam.finished_at &&
      !this.config?.session.finished_at;
    const operation = (async () => {
      try {
        await this.local.openContest();
      } catch (error) {
        if (!valid() || !this.local.connected) throw error;
        try {
          await this.activateBrowser();
        } catch {
          // Windows may restore a minimized window but reject foreground focus.
          // Retry through Chrome itself even when native activation was denied.
        }
        if (!valid()) return;
        await this.local.openContest();
      }
      if (valid()) await this.activateBrowser();
    })();
    this.returningBrowser = operation;
    void operation
      .finally(() => {
        if (this.returningBrowser === operation) this.returningBrowser = null;
      })
      .catch(() => {});
    return operation;
  }
  private async capture(eventId: string) {
    if (
      !this.active() ||
      !this.local.connected ||
      !this.backend ||
      !this.config ||
      this.seen.has(eventId)
    )
      return;
    const backend = this.backend,
      epoch = this.epoch;
    let failure = 'capture_failed';
    let eventType: string | null = null;
    let warned = false;
    const markFailed = async (reason: string) => {
      await backend
        .request(`/api/events/${eventId}/screenshot-status`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        })
        .catch(() => {});
    };
    if (this.capturing || Date.now() - this.lastCaptureAt < 2000) {
      // Capture throttling must not disable enforcement. Authorize/classify the event,
      // then defer the return only while another screenshot is actually being collected.
      try {
        const event = await backend.request<ViolationEvent>(`/api/events/${eventId}/capture`);
        if (
          this.active() &&
          epoch === this.epoch &&
          event.student_session_id === this.config?.session.id
        ) {
          this.seen.add(eventId);
          this.handleViolation(event.event_type);
        }
      } catch {
        /* An expired/unauthorized event cannot drive local enforcement. */
      }
      await markFailed('rate_limited');
      return;
    }
    this.capturing = true;
    this.collectingScreen = true;
    try {
      const event = await backend.request<ViolationEvent>(`/api/events/${eventId}/capture`);
      if (
        !this.active() ||
        epoch !== this.epoch ||
        !this.config ||
        event.student_session_id !== this.config.session.id ||
        event.screenshot_path
      )
        return;
      eventType = event.event_type;
      this.seen.add(eventId);
      if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value!);
      this.lastCaptureAt = Date.now();
      if (screenPermission() !== 'granted') {
        failure = 'permission_denied';
        throw new Error('Screen Recording permission is missing');
      }
      this.beforeCapture();
      // Let the compositor remove any previous warning before taking the image.
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (!this.active() || epoch !== this.epoch) return;
      const jpeg = await captureScreens();
      if (!this.active() || epoch !== this.epoch) return;
      this.collectingScreen = false;
      warned = true;
      this.pendingWarning = null;
      this.handleViolation(event.event_type);
      failure = 'upload_failed';
      const body = new FormData();
      body.append(
        'file',
        new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }),
        `${eventId}.jpg`,
      );
      await backend.request(`/api/events/${eventId}/screenshot`, { method: 'POST', body });
      this.state.error = null;
    } catch (e) {
      if (!this.active() || epoch !== this.epoch) return;
      this.state.error = `Screenshot unavailable: ${String(e)}`;
      this.collectingScreen = false;
      if (eventType && !warned) {
        this.handleViolation(eventType);
        warned = true;
      }
      if (this.pendingBrowserReturn) this.returnToContest();
      await markFailed(failure);
    } finally {
      this.capturing = false;
      this.collectingScreen = false;
      if (this.active() && epoch === this.epoch) {
        if (!warned && eventType) {
          this.handleViolation(eventType);
        } else if (this.pendingWarning) this.handleViolation(this.pendingWarning);
        if (this.pendingBrowserReturn) this.returnToContest();
      }
      this.pendingWarning = null;
      this.publish();
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.preparation?.abort();
    this.applicationControl?.close();
    this.startAttempt++;
    this.state.starting = false;
    this.state.consented = false;
    this.state.monitoring = false;
    this.pendingWarning = null;
    this.pendingBrowserReturn = false;
    this.cancelBrowserReopen();
    this.epoch++;
    this.beforeCapture();
    clearInterval(this.timer);
    this.backend?.close();
    this.local.close();
  }
  applicationStatus(error: string | null) {
    this.state.applicationError = error;
    this.publish();
  }
}
