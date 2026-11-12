import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import type { SessionConfig } from '@koshirme/protocol';
import { BackendClient } from '../apps/student-desktop/src/services/backend';
import { BackendConnection } from '../apps/chrome-extension/src/services/backend';

for (const client of ['desktop', 'extension']) {
  for (const code of [4401, 4001, 1012]) {
    test(`${client}: close ${code} ${code === 1012 ? 'keeps offline grace' : 'revokes offline grace'}`, async () => {
      const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
      await once(server, 'listening');
      const config = {
        backend_url: `http://127.0.0.1:${(server.address() as any).port}`,
        session: { id: 's1' },
        token: 'test',
      } as SessionConfig;
      server.on('connection', (socket) =>
        socket.once('message', () =>
          socket.send(
            JSON.stringify({
              type: 'heartbeat_ack',
              session: { id: 's1' },
              exam: {},
              lease_seconds: 12,
            }),
          ),
        ),
      );
      let receive!: () => void, ended!: () => void;
      const received = new Promise<void>((resolve) => {
        receive = resolve;
      });
      const closed = new Promise<void>((resolve) => {
        ended = resolve;
      });
      const backend =
        client === 'desktop'
          ? new BackendClient(config, receive, ended, ended)
          : new BackendConnection(config, receive, ended, undefined, ended);
      try {
        await received;
        assert.equal(backend.hasLease(), true);
        for (const socket of server.clients) socket.close(code);
        await closed;
        assert.equal(backend.hasLease(), false);
        assert.equal(backend.withinOfflineGrace(), code === 1012);
      } finally {
        backend.close();
        for (const socket of server.clients) socket.terminate();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  }
}
