import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SessionConfig } from '@koshirme/protocol';
import { ContestNavigator } from '../apps/chrome-extension/src/background/contest';

const url = 'https://fizmat.win/contest/42';
const session = () =>
  ({
    session: { id: 's1', active: true },
    exam: { active: true, finished_at: null, allowed_url: url, allowed_urls: [url] },
    monitoring_allowed: true,
  }) as SessionConfig;

test('parallel enforcement and focus reuse a tab that is still loading', async () => {
  const tabs: any[] = [];
  let creations = 0;
  globalThis.chrome = {
    tabs: {
      query: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return [...tabs];
      },
      create: async ({ url }: { url: string }) => {
        creations++;
        const tab = { id: 1, windowId: 1, url: 'about:blank', pendingUrl: url };
        tabs.push(tab);
        return tab;
      },
      update: async (id: number) => tabs.find((tab) => tab.id === id),
      remove: async () => {
        throw new Error('Allowed pending tab removed');
      },
    },
    windows: { get: async () => ({ focused: true }), update: async () => {} },
  } as any;
  const config = session();
  const navigator = new ContestNavigator(
    () => config,
    () => undefined,
    () => true,
    () => true,
  );
  await Promise.all([
    navigator.ensureTabs(),
    navigator.focus(false),
    navigator.focus(false),
    navigator.ensureTabs(),
  ]);
  await navigator.focus(false);
  assert.equal(creations, 1);
  assert.equal(tabs.length, 1);
});

test('finishing a session during a tab query cancels the pending open', async () => {
  let config = session();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let querying!: () => void;
  const started = new Promise<void>((resolve) => {
    querying = resolve;
  });
  globalThis.chrome = {
    tabs: {
      query: async () => {
        querying();
        await gate;
        return [];
      },
      create: async () => {
        throw new Error('Opened after finish');
      },
    },
  } as any;
  const navigator = new ContestNavigator(
    () => config,
    () => undefined,
    () => true,
    () => true,
  );
  const opening = navigator.focus(false);
  await started;
  config = { ...config, exam: { ...config.exam, active: false, finished_at: 'finished' } };
  release();
  await assert.rejects(opening, /Session changed/);
  assert.throws(() => navigator.focus(false), /Session ended/);
});

test('an allowed active tab in a focused window needs no focus mutation', async () => {
  globalThis.chrome = {
    tabs: {
      query: async () => [{ id: 1, windowId: 1, url, active: true }],
      update: async () => {
        throw new Error('Unnecessary tab activation');
      },
      create: async () => {
        throw new Error('Duplicate tab');
      },
    },
    windows: {
      get: async () => ({ focused: true }),
      update: async () => {
        throw new Error('Unnecessary window activation');
      },
    },
  } as any;
  const config = session();
  const navigator = new ContestNavigator(
    () => config,
    () => 1,
    () => true,
    () => true,
  );
  await navigator.focus(false);
});
