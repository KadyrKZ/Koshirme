import WebSocket from 'ws';
import { websocketUrl, type SessionConfig, type SessionState } from '@koshirme/protocol';

export function validateBackendUrl(input: string): string {
  const url = new URL(input);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Enter the backend origin, for example http://localhost:8000');
  return url.origin;
}
export async function request<T>(
  base: string,
  path: string,
  token?: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(10000),
    headers: { ...headers, ...options.headers },
  });
  if (!response.ok) {
    const body: { detail?: unknown } = await response.json().catch(() => ({}));
    throw new Error(
      typeof body.detail === 'string' ? body.detail : `Backend request failed (${response.status})`,
    );
  }
  return response.json() as Promise<T>;
}
export class BackendClient {
  private socket: WebSocket | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private receivedAt = 0;
  private leaseSeconds = 0;
  private reconnectAttempt = 0;
  connected = false;
  constructor(
    readonly config: SessionConfig,
    private onState: (state: SessionState) => void,
    private onLost: () => void,
    private onEnded: () => void = () => {},
  ) {
    this.connect();
  }
  hasLease() {
    return (
      !this.stopped && this.connected && Date.now() - this.receivedAt < this.leaseSeconds * 1000
    );
  }
  withinOfflineGrace(graceMs = 12_000) {
    return !this.stopped && this.receivedAt > 0 && Date.now() - this.receivedAt < graceMs;
  }
  private connect() {
    if (this.stopped) return;
    const ws = new WebSocket(
      websocketUrl(this.config.backend_url, `/ws/student/${this.config.session.id}`),
      { handshakeTimeout: 5000, maxPayload: 65536 },
    );
    this.socket = ws;
    ws.on('open', () => {
      if (this.stopped || this.socket !== ws) return;
      ws.send(JSON.stringify({ type: 'auth', token: this.config.token, role: 'desktop' }));
      this.timer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'heartbeat' }));
        if (!this.hasLease()) this.onLost();
      }, 5000);
    });
    ws.on('message', (raw) => {
      if (this.stopped || this.socket !== ws) return;
      try {
        const data = JSON.parse(raw.toString()) as SessionState;
        if (data.type !== 'session_state' && data.type !== 'heartbeat_ack') return;
        this.receivedAt = Date.now();
        this.leaseSeconds = data.lease_seconds;
        this.connected = true;
        this.reconnectAttempt = 0;
        this.onState(data);
      } catch {
        ws.close();
      }
    });
    ws.on('close', (code) => {
      if (this.stopped || this.socket !== ws) return;
      if (this.timer) clearInterval(this.timer);
      this.connected = false;
      if (code === 4401 || code === 4001) {
        this.stopped = true;
        this.receivedAt = 0;
        this.onEnded();
        return;
      }
      this.onLost();
      if (!this.stopped && code !== 4401 && code !== 4001)
        this.retry = setTimeout(
          () => this.connect(),
          Math.min(1000 * 2 ** this.reconnectAttempt++, 15_000) + Math.random() * 500,
        );
    });
    ws.on('error', () => {
      ws.close();
    });
  }
  request<T>(path: string, options: RequestInit = {}) {
    return request<T>(this.config.backend_url, path, this.config.token, options);
  }
  close() {
    this.stopped = true;
    this.connected = false;
    if (this.timer) clearInterval(this.timer);
    if (this.retry) clearTimeout(this.retry);
    this.socket?.close();
  }
}
