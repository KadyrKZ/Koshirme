import type { PairSettings, SessionConfig } from '../types';

export class DesktopConnection {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastSeen = 0;
  private closed = false;
  private reconnectAttempt = 0;
  status: { permission?: string; backend?: boolean; starting?: boolean } = {};
  private starts = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  connected = false;
  constructor(
    private settings: PairSettings,
    private onConfig: (config: SessionConfig | null) => void,
    private onLost: () => void,
    private onOpenContest: (requestId: string, waitForFocus: boolean) => Promise<void>,
    private onError: (message: string) => void,
  ) {
    this.connect();
  }
  private connect() {
    if (this.closed) return;
    const ws = new WebSocket(`ws://127.0.0.1:${this.settings.port}`);
    this.socket = ws;
    ws.onopen = () => {
      if (this.closed || this.socket !== ws) return;
      this.lastSeen = Date.now();
      ws.send(
        JSON.stringify({
          type: this.settings.website ? 'pair_website' : 'pair',
          secret: this.settings.secret,
        }),
      );
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastSeen > 10000) {
          ws.close();
          return;
        }
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 3000);
    };
    ws.onmessage = (message) => {
      if (this.closed || this.socket !== ws) return;
      this.lastSeen = Date.now();
      const data = JSON.parse(String(message.data)) as {
        type: string;
        status?: { permission?: string; backend?: boolean; starting?: boolean };
        ok?: boolean;
        config?: SessionConfig | null;
        request_id?: string;
        detail?: string;
        wait_for_focus?: boolean;
      };
      if (data.type === 'desktop_status') this.status = data.status || {};
      if (data.type === 'website_started' && data.request_id) {
        const pending = this.starts.get(data.request_id);
        if (pending) {
          clearTimeout(pending.timer);
          this.starts.delete(data.request_id);
          if (data.ok) pending.resolve();
          else pending.reject(new Error(data.detail || 'Start failed'));
        }
      }
      if (data.type === 'config') {
        this.connected = true;
        this.reconnectAttempt = 0;
        this.onConfig(data.config ?? null);
      }
      if (data.type === 'open_contest' && data.request_id)
        void this.onOpenContest(data.request_id, data.wait_for_focus === true);
      if (data.type === 'error') this.onError(data.detail || 'Pairing failed');
    };
    ws.onclose = (event) => {
      if (this.closed || this.socket !== ws) return;
      if (this.heartbeat) clearInterval(this.heartbeat);
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) this.onLost();
      this.rejectStarts();
      this.status = {};
      if (!this.closed && (event.code !== 4401 || this.settings.website) && event.code !== 4001)
        this.retry = setTimeout(
          () => this.connect(),
          Math.min(1000 * 2 ** this.reconnectAttempt++, 15_000) + Math.random() * 500,
        );
      if (event.code === 4401 && !this.settings.website)
        this.onError('Pairing code rejected. Enter the code shown in Desktop Guard.');
    };
    ws.onerror = () => ws.close();
  }
  startFromWebsite(): Promise<void> {
    if (!this.connected) return Promise.reject(new Error('Desktop is not connected'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.starts.delete(requestId);
        reject(new Error('Start timed out'));
      }, 120000);
      this.starts.set(requestId, { resolve, reject, timer });
      if (!this.send({ type: 'website_start', consent: true, request_id: requestId })) {
        clearTimeout(timer);
        this.starts.delete(requestId);
        reject(new Error('Desktop is not connected'));
      }
    });
  }
  private rejectStarts() {
    for (const pending of this.starts.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Desktop disconnected'));
    }
    this.starts.clear();
  }
  send(data: unknown): boolean {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(data));
    return true;
  }
  close() {
    this.rejectStarts();
    this.closed = true;
    this.connected = false;
    if (this.retry) clearTimeout(this.retry);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close();
  }
}
