import assert from 'node:assert/strict';
import test from 'node:test';
import { browserLifetime, BrowserHarnessFailure } from './lifetime';
test('052 partial acquisition releases every owner once and retains primary/cleanup/export causes', () => {
  const scope = browserLifetime();
  const attempts: string[] = [];
  scope.own('priority', () => {
    attempts.push('priority');
  });
  scope.own('native', () => {
    attempts.push('native');
    throw new Error('dispose native');
  });
  scope.record('primary', new Error('register body'));
  scope.dispose();
  scope.dispose();
  scope.record('export', new Error('HTTP rejected'));
  assert.deepEqual(attempts, ['native', 'priority']);
  assert.throws(
    () => scope.throwIfFailed(),
    (error) => {
      assert.ok(error instanceof BrowserHarnessFailure);
      assert.equal(error.snapshot.total, 3);
      for (const message of ['register body', 'dispose native', 'HTTP rejected'])
        assert.ok(error.message.includes(message));
      return true;
    },
  );
});
test('052 bounded failure evidence discloses omitted causes', () => {
  const scope = browserLifetime();
  for (let i = 0; i < 40; i++) scope.record('failure', 'x'.repeat(4096));
  assert.equal(scope.snapshot().causes.length, 32);
  assert.equal(scope.snapshot().total, 40);
  assert.equal(scope.snapshot().omitted, 8);
  assert.ok(scope.snapshot().causes.every((cause) => cause.message.length === 2048));
});
test('052 nested owner failure retains original and cleanup causes without duplicating the same scope', () => {
  const native = browserLifetime(),
    page = browserLifetime();
  native.record('primary', new Error('native step failed'));
  native.own('world', () => {
    throw new Error('native disposal failed');
  });
  native.dispose();
  try {
    native.throwIfFailed();
  } catch (error) {
    native.record('primary', error);
    page.record('arm', error);
  }
  assert.equal(native.snapshot().total, 2);
  page.record('export', new Error('failure HTTP rejected'));
  assert.equal(page.snapshot().total, 3);
  assert.deepEqual(
    page.snapshot().causes.map((cause) => cause.message),
    ['Error: native step failed', 'Error: native disposal failed', 'Error: failure HTTP rejected'],
  );
});

test('052 failed owner retains actual nonzero readback and readback errors while attempting each inspector once', () => {
  const scope = browserLifetime(),
    parent = browserLifetime();
  let reads = 0;
  scope.own('world', () => {
    throw new Error('native cleanup failed');
  });
  scope.inspect(
    'bodies',
    () => {
      reads++;
      return { entities: 2 };
    },
    (value) => {
      if ((value as { entities: number }).entities) throw new Error('nonzero actual bodies');
    },
  );
  scope.inspect('collision', () => {
    reads++;
    throw new Error('collision readback failed');
  });
  scope.record('primary', new Error('setup failed'));
  scope.dispose();
  scope.dispose();
  assert.equal(reads, 2);
  assert.deepEqual(scope.snapshot().readbacks.bodies, { entities: 2 });
  assert.equal(Object.hasOwn(scope.snapshot().readbacks, 'collision'), false);
  assert.equal(scope.snapshot().total, 4);
  try {
    scope.throwIfFailed();
  } catch (error) {
    parent.record('native', error);
  }
  assert.equal(parent.snapshot().total, 4);
  assert.ok(JSON.stringify(parent.snapshot().readbacks).includes('entities'));
});
