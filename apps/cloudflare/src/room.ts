// Cloudflare compatibility adapter retained only for rollback before retirement.
// All persistent business logic is shared with the Contabo origin.
import { RoomEngine } from './room-engine';
import type { Env } from './types';
export class ExamRoom extends RoomEngine implements DurableObject {
  constructor(private durableState: DurableObjectState, env: Env) {
    super(durableState, env);
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/connect' && request.headers.get('upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const id = url.searchParams.get('id') || '';
      this.durableState.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({ kind: 'pending', id });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return super.fetch(request);
  }
}
