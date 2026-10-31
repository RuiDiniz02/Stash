import test from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, flushOutbox, getQueued } from '../src/lib/outbox.ts';

const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
} });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });

test.beforeEach(() => storage.clear());

test('offline captures preserve destination and stay isolated by account', () => {
  enqueue({ id: 'a', userId: 'first', text: 'An idea', groupId: 'group', collectionIds: ['collection'] });
  enqueue({ id: 'b', userId: 'second', text: 'Private' });
  assert.equal(getQueued('first').length, 1);
  assert.equal(getQueued('first')[0].groupId, 'group');
  assert.deepEqual(getQueued('first')[0].collectionIds, ['collection']);
});

test('a failed synchronization retains the capture for a later retry', async () => {
  enqueue({ id: 'a', userId: 'first', text: 'Keep me' });
  assert.equal(await flushOutbox('first', async () => { throw new Error('Disconnected'); }), 0);
  assert.equal(getQueued('first').length, 1);
  assert.equal(await flushOutbox('first', async () => {}), 1);
  assert.equal(getQueued('first').length, 0);
});

test('two simultaneous flushes send each capture only once', async () => {
  enqueue({ id: 'a', userId: 'first', text: 'Once' });
  let sends = 0;
  let release;
  const pending = flushOutbox('first', async () => { sends++; await new Promise((resolve) => { release = resolve; }); });
  assert.equal(await flushOutbox('first', async () => { sends++; }), 0);
  release();
  await pending;
  assert.equal(sends, 1);
});

test('a full local store throws instead of reporting a successful save', () => {
  const original = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try { assert.throws(() => enqueue({ id: 'a', userId: 'first', text: 'Keep draft' })); }
  finally { localStorage.setItem = original; }
});

test('retrying an offline capture replaces the same queued ID', () => {
  enqueue({ id: 'a', userId: 'first', text: 'First draft' });
  enqueue({ id: 'a', userId: 'first', text: 'Updated draft' });
  assert.equal(getQueued('first').length, 1);
  assert.equal(getQueued('first')[0].text, 'Updated draft');
});
