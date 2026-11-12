import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { LocalServer } from '../apps/student-desktop/src/services/local-server';

test(
  'closing Chrome rejects an outstanding open_contest request immediately',
  { timeout: 2000 },
  async () => {
    let paired!: () => void;
    const connected = new Promise<void>((resolve) => {
      paired = resolve;
    });
    const local = new LocalServer(
      0,
      'ABCD1234',
      () => null,
      (connected) => {
        if (connected) paired();
      },
      () => {},
      () => {},
      () => {},
    );
    const server = (local as any).server;
    let client: WebSocket | undefined;
    try {
      await once(server, 'listening');
      client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
        origin: `chrome-extension://${'a'.repeat(32)}`,
      });
      await once(client, 'open');
      client.send(JSON.stringify({ type: 'pair', secret: 'ABCD1234' }));
      await connected;
      const rejection = assert.rejects(local.openContest(), /Chrome extension disconnected/);
      client.close();
      await rejection;
      assert.equal(local.connected, false);
    } finally {
      client?.terminate();
      local.close();
    }
  },
);

test(
  'website pairing needs the launch secret; only that connection can request a consented start',
  { timeout: 5000 },
  async () => {
    let starts = 0;
    const ticket = 'A'.repeat(43);
    const local = new LocalServer(
      0,
      'ABCD1234',
      () => null,
      () => {},
      () => {},
      () => {},
      () => {},
      async () => {
        starts++;
      },
      () => ({ permission: 'granted' }),
    );
    const server = (local as any).server;
    const clients: WebSocket[] = [];
    async function connect() {
      const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
        origin: `chrome-extension://${'b'.repeat(32)}`,
      });
      clients.push(client);
      await once(client, 'open');
      return client;
    }
    try {
      await once(server, 'listening');
      const rejected = await connect();
      const close = once(rejected, 'close');
      rejected.send(JSON.stringify({ type: 'pair_website', secret: ticket }));
      assert.equal((await close)[0], 4401);
      local.setWebsiteSecret(ticket);
      const client = await connect();
      const config = once(client, 'message');
      client.send(JSON.stringify({ type: 'pair_website', secret: ticket }));
      assert.equal(JSON.parse(String((await config)[0])).type, 'config');
      const reply = new Promise<any>((resolve) =>
        client.on('message', (raw) => {
          const message = JSON.parse(String(raw));
          if (message.type === 'website_started') resolve(message);
        }),
      );
      client.send(
        JSON.stringify({
          type: 'website_start',
          consent: false,
          request_id: '00000000-0000-4000-8000-000000000000',
        }),
      );
      client.send(
        JSON.stringify({
          type: 'website_start',
          consent: true,
          request_id: '00000000-0000-4000-8000-000000000001',
        }),
      );
      assert.equal((await reply).ok, true);
      assert.equal(starts, 1);
    } finally {
      clients.forEach((client) => client.terminate());
      local.close();
    }
  },
);
