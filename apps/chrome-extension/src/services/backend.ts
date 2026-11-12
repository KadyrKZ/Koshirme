import {
  websocketUrl,
  type SessionConfig,
  type SessionState,
  type StudentMessage,
} from '@koshirme/protocol';

export class BackendConnection {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private receivedAt = 0;
  private leaseSeconds = 0;
  private reconnectAttempt = 0;
  connected = false;
  constructor(
    readonly config: SessionConfig,
    private onState: (state: SessionState) => void,
    private onLost: () => void,
    private onCommand?: (message: StudentMessage) => void,
    private onEnded: () => void = () => {},
  ) {
    this.connect();
  }
  hasLease() {
    return (
      !this.closed && this.connected && Date.now() - this.receivedAt < this.leaseSeconds * 1000
    );
  }
  withinOfflineGrace(graceMs = 12_000) {
    return !this.closed && this.receivedAt > 0 && Date.now() - this.receivedAt < graceMs;
  }
  private connect() {
    if (this.closed) return;
    const ws = new WebSocket(
      websocketUrl(this.config.backend_url, `/ws/student/${this.config.session.id}`),
    );
    this.socket = ws;
    ws.onopen = () => {
      if (this.closed || this.socket !== ws) return;
      ws.send(JSON.stringify({ type: 'auth', token: this.config.token, role: 'extension' }));
      this.heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'heartbeat' }));
        if (!this.hasLease()) this.onLost();
      }, 5000);
    };
    ws.onmessage = (message) => {
      if (this.closed || this.socket !== ws) return;
      const state = JSON.parse(String(message.data)) as StudentMessage;
      if (state.type === 'capture_request') {
        this.onCommand?.(state);
        return;
      }
      if (state.type !== 'session_state' && state.type !== 'heartbeat_ack') return;
      this.connected = true;
      this.reconnectAttempt = 0;
      this.receivedAt = Date.now();
      this.leaseSeconds = state.lease_seconds;
      this.onState(state);
    };
    ws.onclose = (event) => {
      if (this.closed || this.socket !== ws) return;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.connected = false;
      if (event.code === 4401 || event.code === 4001) {
        this.closed = true;
        this.receivedAt = 0;
        this.onEnded();
        return;
      }
      this.onLost();
      if (!this.closed && event.code !== 4401 && event.code !== 4001)
        this.retry = setTimeout(
          () => this.connect(),
          Math.min(1000 * 2 ** this.reconnectAttempt++, 15_000) + Math.random() * 500,
        );
    };
    ws.onerror = () => ws.close();
  }
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.backend_url}${path}`, {
      ...options,
      signal: AbortSignal.timeout(7000),
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error(`Backend ${response.status}`);
    return response.json() as Promise<T>;
  }
  close() {
    this.closed = true;
    this.connected = false;
    if (this.retry) clearTimeout(this.retry);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close();
  }
}
