// SOURCE-only adverse cleanup tests: injected authority DTO, no native worlds.
import assert from 'node:assert/strict';
import test from 'node:test';
import { segmentFixture } from './manual-segments-fixture';
import { createAfterResourceScope, retireHealthyAfterFailure } from './manual-segments-after';
import {
  serializeDiagnostic,
  exportFailurePreserving,
} from '../../scripts/manual-segments-calibration-proof.mjs';
test('AFTER failureafterOPEN retires healthy actualowner withoutphysicstep then permitsdisposal', () => {
  const f = segmentFixture();
  const old = f.apply('LEARNING').active!,
    before = f.authority();
  const result = retireHealthyAfterFailure({ lifecycle: f.owner }, () =>
    f.cause('SHUTDOWN', 'AT_LAST_ACCEPTED_TICK'),
  );
  assert.equal(result.status, 'HEALTHY_EXPLICIT_RETIREMENT');
  assert.equal(f.authority(), before);
  assert.equal(f.store.port.read(old.segmentId)!.closeReason, 'SHUTDOWN');
  f.owner.dispose();
});
test('AFTER pendingowner isretained, neverforcedretire/replayed afterfailure', () => {
  const f = segmentFixture();
  f.apply('MANUAL');
  const ticket = f.owner.prepare(f.plan('LEARNING', 'MODE_CHANGE'));
  let calls = 0;
  assert.equal(
    retireHealthyAfterFailure({ lifecycle: f.owner }, () => {
      calls++;
      return f.cause('SHUTDOWN', 'AT_LAST_ACCEPTED_TICK');
    }).status,
    'RETAINED_UNKNOWN_OR_PENDING',
  );
  assert.equal(calls, 0);
  assert.equal(f.owner.inspectTicket(ticket)!.committed, false);
});
test('AFTER oncecleanup retains actualoriginal causes andstack not replacementErrors', () => {
  const scope = createAfterResourceScope(),
    original = new TypeError('actual disposer'),
    inspect = new RangeError('actual readback');
  scope.own(
    'one',
    () => {
      throw original;
    },
    () => {
      throw inspect;
    },
  );
  const cleanup = scope.close();
  assert.equal(cleanup.causes[0], original);
  assert.equal(cleanup.causes[1], inspect);
  assert.equal(cleanup.errors[0].name, 'TypeError');
  assert.match(cleanup.errors[0].stack, /actual disposer/);
  assert.deepEqual(cleanup.attempts, ['one']);
  assert.throws(() => scope.close());
});

// The real private resource-scope seam must continue once-only ownership attempts for every thrown value.
for (const [name, thrown] of [
  ['undefined', undefined],
  ['false', false],
  ['null', null],
  ['zero', 0],
  ['null-prototype', Object.create(null)],
] as const)
  test('AFTER oncecleanup retains ' + name + ' failure and releases laterowners', () => {
    const scope = createAfterResourceScope();
    let releases = 0;
    scope.own(
      'later',
      () => {
        releases++;
      },
      () => ({ disposed: true }),
    );
    scope.own(
      'first',
      () => {
        throw thrown;
      },
      () => ({ disposed: false }),
    );
    const cleanup = scope.close();
    assert.deepEqual(cleanup.attempts, ['first', 'later']);
    assert.equal(releases, 1);
    assert.equal(cleanup.errors.length, 1);
    assert.equal(cleanup.causes.length, 1);
    assert.equal(cleanup.causes[0], thrown);
    assert.equal((cleanup.snapshots.later as { disposed: boolean }).disposed, true);
    assert.throws(() => scope.close());
  });
test('AFTER serializer executes no throwing getter, conversion or proxy trap and still records original causes', () => {
  let calls = 0;
  const hostile = Object.create(null);
  for (const key of ['name', 'message', 'stack', 'errors', 'cause'])
    Object.defineProperty(hostile, key, {
      get() {
        calls++;
        throw Error('getter executed');
      },
    });
  Object.defineProperty(hostile, Symbol.toPrimitive, {
    value() {
      calls++;
      throw Error('conversion executed');
    },
  });
  const proxy = new Proxy(
    {},
    {
      get() {
        calls++;
        throw Error('proxy get');
      },
      getOwnPropertyDescriptor() {
        calls++;
        throw Error('proxy descriptor');
      },
      getPrototypeOf() {
        calls++;
        throw Error('proxy prototype');
      },
    },
  );
  for (const thrown of [undefined, false, null, 0, hostile, proxy]) {
    const diagnostic = serializeDiagnostic(thrown);
    assert.equal(typeof diagnostic.message, 'string');
    assert.equal(typeof diagnostic.stack, 'string');
  }
  assert.equal(calls, 0);
  const scope = createAfterResourceScope();
  let after = 0;
  scope.own('last', () => {
    after++;
  });
  scope.own('hostile', () => {
    throw hostile;
  });
  scope.own('proxy', () => {
    throw proxy;
  });
  const cleanup = scope.close();
  assert.equal(after, 1);
  assert.deepEqual(cleanup.attempts, ['proxy', 'hostile', 'last']);
  assert.equal(cleanup.causes[0], proxy);
  assert.equal(cleanup.causes[1], hostile);
  assert.equal(calls, 0);
});
test('AFTER primitive primary plus hostile retirement cleanup and export all retain identity', async () => {
  const original = undefined,
    retirement = Object.create(null),
    cleanup = false,
    exportError = new TypeError('export');
  const failure = new AggregateError([original, retirement, cleanup], 'actual three failures');
  await assert.rejects(
    exportFailurePreserving(failure, async () => {
      throw exportError;
    }),
    (error: unknown) => {
      assert(error instanceof AggregateError);
      assert.equal(error.errors[0], failure);
      assert.equal(error.errors[1], exportError);
      assert.equal(failure.errors.length, 3);
      assert.equal(failure.errors[0], undefined);
      assert.equal(failure.errors[1], retirement);
      assert.equal(failure.errors[2], false);
      const raw = serializeDiagnostic(error);
      assert.equal(raw.causes![0].causes!.length, 3);
      assert.equal(raw.causes![0].causes![0].message, 'undefined');
      assert.equal(raw.causes![0].causes![2].message, 'false');
      return true;
    },
  );
});
