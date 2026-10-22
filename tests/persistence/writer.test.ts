import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WRITER_LOCK_NAME,
  createMemoryLockManager,
  createWriterAuthority,
} from '../../src/persistence/index';
import { fixedClock } from './fixtures';

function authority(tabId: string, locks = createMemoryLockManager()) {
  return createWriterAuthority({ locks, tabId, now: fixedClock() });
}

/** Locks are released when the callback promise settles, which is one microtask later. */
async function settled(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

test('127 the writer lock is exclusive per origin and named explicitly', async () => {
  const locks = createMemoryLockManager();
  const first = authority('tab-a', locks);
  const second = authority('tab-b', locks);
  assert.equal(WRITER_LOCK_NAME, 'self-driving-academy-persistence-writer');

  const claimed = await first.claim();
  assert.equal(claimed.role, 'WRITER');
  assert.equal(claimed.reason, null);
  assert.equal(claimed.tabId, 'tab-a');
  assert.equal(locks.holders(WRITER_LOCK_NAME), 1);

  const readOnly = await second.claim();
  assert.equal(readOnly.role, 'READ_ONLY');
  assert.equal(readOnly.reason, 'WRITER_HELD_BY_OTHER_TAB');
  assert.equal(second.state().role, 'READ_ONLY');

  const again = await first.claim();
  assert.equal(again.role, 'WRITER');
  assert.equal(Object.isFrozen(again), true);
  first.dispose();
  second.dispose();
});

test('127 a second tab queues and becomes the writer in FIFO order', async () => {
  const locks = createMemoryLockManager();
  const first = authority('tab-a', locks);
  const second = authority('tab-b', locks);
  const third = authority('tab-c', locks);
  await first.claim();
  await second.claim();
  await third.claim();

  const waitingSecond = second.wait();
  assert.equal(second.state().role, 'WAITING');
  const waitingThird = third.wait();
  await settled();
  assert.equal(locks.pending(WRITER_LOCK_NAME), 2);

  assert.equal(first.release().role, 'RELEASED');
  assert.equal((await waitingSecond).role, 'WRITER');
  assert.equal(locks.holders(WRITER_LOCK_NAME), 1);
  assert.equal(third.state().role, 'WAITING');

  second.release();
  assert.equal((await waitingThird).role, 'WRITER');
  third.release();
  first.dispose();
  second.dispose();
  third.dispose();
});

test('127 releasing before the grant cancels the queued request', async () => {
  const locks = createMemoryLockManager();
  const first = authority('tab-a', locks);
  const second = authority('tab-b', locks);
  await first.claim();
  const waiting = second.wait();
  assert.equal(second.state().role, 'WAITING');
  const cancelled = second.release();
  assert.equal(cancelled.role, 'READ_ONLY');
  assert.equal(cancelled.reason, 'WRITER_RELEASED');
  assert.equal((await waiting).role, 'READ_ONLY');
  assert.equal(locks.pending(WRITER_LOCK_NAME), 0);
  first.dispose();
  second.dispose();
});

test('127 release is idempotent and dispose frees the lock for the next tab', async () => {
  const locks = createMemoryLockManager();
  const first = authority('tab-a', locks);
  const second = authority('tab-b', locks);
  await first.claim();
  assert.equal(first.release().role, 'RELEASED');
  await settled();
  assert.equal(first.release().role, 'RELEASED');
  assert.equal(locks.holders(WRITER_LOCK_NAME), 0);
  assert.equal((await second.claim()).role, 'WRITER');

  second.dispose();
  await settled();
  assert.equal(locks.holders(WRITER_LOCK_NAME), 0);
  const disposed = await second.claim();
  assert.equal(disposed.role, 'NONE');
  assert.equal(disposed.reason, 'REPOSITORY_DISPOSED');
  first.dispose();
});

test('127 without Web Locks the page never claims a write role', async () => {
  const authorityWithoutLocks = authority('tab-a', createMemoryLockManager({ available: false }));
  const claimed = await authorityWithoutLocks.claim();
  assert.equal(claimed.role, 'READ_ONLY');
  assert.equal(claimed.reason, 'WEB_LOCKS_UNAVAILABLE');
  const queued = await authorityWithoutLocks.wait();
  assert.equal(queued.role, 'READ_ONLY');
  assert.equal(queued.reason, 'WEB_LOCKS_UNAVAILABLE');
  authorityWithoutLocks.dispose();
});

test('127 the authority reports each transition with a stable tab identity', async () => {
  const states: string[] = [];
  const locks = createMemoryLockManager();
  const observed = createWriterAuthority({
    locks,
    tabId: 'tab-observer',
    now: fixedClock(),
    onStateChange: (state) => states.push(state.role),
  });
  await observed.claim();
  observed.release();
  observed.dispose();
  assert.deepEqual(states, ['WRITER', 'RELEASED', 'NONE']);
  assert.equal(observed.state().since, fixedClock()());
  assert.throws(() => observeIdentity());
  function observeIdentity() {
    // The state object is frozen; a UI cannot mutate the ownership record.
    (observed.state() as { role: string }).role = 'WRITER';
  }
});
