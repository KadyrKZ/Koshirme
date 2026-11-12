import { randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import type { SessionConfig } from '@koshirme/protocol';

export class LocalServer {
  private websiteSecret: string | null = null;
  private server: WebSocketServer;
  private client: WebSocket | null = null;
  private lastSeen = 0;
  private attempts: number[] = [];
  private websiteAttempts: number[] = [];
  private timer: ReturnType<typeof setInterval>;
  private requests = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  connected = false;
  constructor(
    port: number,
    private secret: string,
    private getConfig: () => SessionConfig | null,
    private onConnection: (connected: boolean) => void,
    private onCapture: (eventId: string) => void,
    private onViolation: (eventType: string) => void,
    private onError: (message: string) => void,
    private onWebsiteStart: () => Promise<void> = async () => {
      throw new Error('Website start unavailable');
    },
    private getStatus: () => unknown = () => null,
  ) {
    this.server = new WebSocketServer({
      host: '127.0.0.1',
      port,
      maxPayload: 8192,
      verifyClient: (info: { origin: string }) =>
        /^chrome-extension:\/\/[a-p]{32}$/.test(info.origin || ''),
    });
    this.server.on('error', (error) => onError(`Local Guard could not start: ${error.message}`));
    this.server.on('connection', (ws) => {
      const timeout = setTimeout(() => ws.close(4401, 'Pairing required'), 5000);
      let authenticated = false;
      let websiteAuthenticated = false;
      ws.on('message', (raw) => {
        try {
          const data = JSON.parse(raw.toString()) as Record<string, unknown>;
          if (!authenticated) {
            const website = data.type === 'pair_website';
            const attempts = (website ? this.websiteAttempts : this.attempts).filter(
              (time) => Date.now() - time < 60000,
            );
            attempts.push(Date.now());
            if (website) this.websiteAttempts = attempts;
            else this.attempts = attempts;
            const candidate =
              typeof data.secret === 'string' ? Buffer.from(data.secret) : Buffer.alloc(0);
            websiteAuthenticated = data.type === 'pair_website';
            const expected = Buffer.from(
              websiteAuthenticated ? this.websiteSecret || '' : this.secret,
            );
            if (
              attempts.length > (website ? 120 : 12) ||
              !['pair', 'pair_website'].includes(String(data.type)) ||
              expected.length === 0 ||
              candidate.length !== expected.length ||
              !timingSafeEqual(candidate, expected)
            ) {
              ws.send(JSON.stringify({ type: 'error', detail: 'Pairing code rejected' }));
              ws.close(4401);
              return;
            }
            authenticated = true;
            clearTimeout(timeout);
            this.client?.close(4001, 'Extension connection replaced');
            this.client = ws;
            this.lastSeen = Date.now();
            this.connected = true;
            this.sendConfig();
            this.onConnection(true);
            return;
          }
          if (this.client !== ws) return;
          this.lastSeen = Date.now();
          if (data.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
          if (
            data.type === 'website_start' &&
            websiteAuthenticated &&
            data.consent === true &&
            typeof data.request_id === 'string' &&
            /^[0-9a-f-]{36}$/.test(data.request_id)
          ) {
            const requestId = data.request_id;
            void this.onWebsiteStart().then(
              () => {
                if (ws.readyState === WebSocket.OPEN)
                  ws.send(
                    JSON.stringify({ type: 'website_started', request_id: requestId, ok: true }),
                  );
              },
              (error) => {
                if (ws.readyState === WebSocket.OPEN)
                  ws.send(
                    JSON.stringify({
                      type: 'website_started',
                      request_id: requestId,
                      ok: false,
                      detail: String(error.message || error),
                    }),
                  );
              },
            );
          }
          if (
            data.command === 'capture_screen' &&
            typeof data.event_id === 'string' &&
            /^[0-9a-f-]{36}$/.test(data.event_id)
          )
            this.onCapture(data.event_id);
          if (
            data.command === 'show_violation' &&
            typeof data.event_type === 'string' &&
            /^[A-Z_]{3,50}$/.test(data.event_type)
          )
            this.onViolation(data.event_type);
          if (data.type === 'contest_opened' && typeof data.request_id === 'string') {
            const pending = this.requests.get(data.request_id);
            if (pending) {
              clearTimeout(pending.timer);
              this.requests.delete(data.request_id);
              if (data.ok === true) pending.resolve();
              else pending.reject(new Error('Chrome could not open contest'));
            }
          }
        } catch {
          ws.close(1003, 'Invalid message');
        }
      });
      ws.on('close', () => {
        clearTimeout(timeout);
        if (this.client === ws) {
          this.client = null;
          this.connected = false;
          this.rejectRequests('Chrome extension disconnected');
          this.onConnection(false);
        }
      });
      ws.on('error', () => ws.close());
    });
    this.timer = setInterval(() => {
      if (this.client && Date.now() - this.lastSeen > 10000) this.client.terminate();
    }, 2000);
  }
  sendConfig() {
    if (this.client?.readyState === WebSocket.OPEN)
      this.client.send(JSON.stringify({ type: 'config', config: this.getConfig() }));
    this.sendStatus();
  }
  setWebsiteSecret(secret: string) {
    this.websiteSecret = secret;
    this.client?.close(4001, 'Website connection replaced');
  }
  sendStatus() {
    if (this.client?.readyState === WebSocket.OPEN)
      this.client.send(JSON.stringify({ type: 'desktop_status', status: this.getStatus() }));
  }
  private rejectRequests(message: string) {
    for (const pending of this.requests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.requests.clear();
  }
  openContest(waitForFocus = false): Promise<void> {
    if (!this.connected || this.client?.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error('Connect the Chrome extension first'));
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.requests.delete(requestId);
          reject(new Error('Switch to the contest tab in Chrome, then try Start again.'));
        },
        waitForFocus ? 30000 : 8000,
      );
      this.requests.set(requestId, { resolve, reject, timer });
      this.client!.send(
        JSON.stringify({
          type: 'open_contest',
          request_id: requestId,
          wait_for_focus: waitForFocus,
        }),
      );
    });
  }
  close() {
    clearInterval(this.timer);
    this.client?.close();
    this.server.close();
    this.rejectRequests('Guard closed');
  }
}
