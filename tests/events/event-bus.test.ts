import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEventBus } from '../../src/simulation/index.ts';
import { context, event } from '../contracts/fixtures.ts';

const bus = (maxEventsPerEpoch = 10000) => createEventBus({ ...context, maxEventsPerEpoch });
const next = (eventId: string, tick = 10) => ({ ...event(), eventId, tick });

test('duplicates and retries consume each identity once even after listeners fail', () => {
  const transport = bus();
  let effects = 0;
  const error = new Error('after side effect');
  transport.subscribe(() => {
    effects += 1;
    throw error;
  });
  transport.subscribe(() => {
    effects += 10;
  });
  const result = transport.publish(event());
  assert.equal(effects, 11);
  assert.equal(result.status, 'delivered');
  assert.equal(result.failures[0]?.error, error);
  assert.equal(transport.publish(event()).status, 'duplicate');
  transport.advanceTick(100);
  assert.equal(transport.publish(event()).status, 'duplicate');
  assert.equal(effects, 11);
  assert.throws(() => transport.publish({ ...event(), tick: 101 }), /Conflicting/);
  assert.throws(
    () => transport.publish({ ...event(), payload: { ...event().payload, impulseNs: 11 } }),
    /Conflicting/,
  );
});

test('stable declared order, type filtering and publication order within tick', () => {
  const transport = bus();
  const calls: string[] = [];
  transport.subscribe(
    (e) => {
      calls.push(`late:${e.eventId}`);
    },
    { order: 2 },
  );
  transport.subscribe(
    (e) => {
      calls.push(`first:${e.eventId}`);
    },
    { order: -1 },
  );
  transport.subscribe(
    (e) => {
      calls.push(`tie:${e.eventId}`);
    },
    { order: -1 },
  );
  transport.subscribe(
    () => {
      assert.fail('wrong type');
    },
    { type: 'PICKUP' },
  );
  transport.publish(next('a'));
  transport.publish(next('b'));
  assert.deepEqual(calls, ['first:a', 'tie:a', 'late:a', 'first:b', 'tie:b', 'late:b']);
});

test('unsubscribe is idempotent and immediate; subscribe during dispatch starts next event', () => {
  const transport = bus();
  const calls: string[] = [];
  let remove = () => {};
  let added = false;
  transport.subscribe(() => {
    calls.push('first');
    remove();
    if (!added) {
      added = true;
      transport.subscribe(() => {
        calls.push('new');
      });
    }
  });
  remove = transport.subscribe(() => {
    calls.push('removed');
  });
  transport.publish(next('a'));
  remove();
  transport.publish(next('b'));
  assert.deepEqual(calls, ['first', 'first', 'new']);
  assert.equal(transport.getStats().listeners, 2);
});

test('rejects invalid, stale, foreign and late events without consuming capacity', () => {
  const transport = bus();
  for (const bad of [
    { ...event(), eventId: '' },
    { ...event(), tick: -1 },
    { ...event(), worldEpoch: 1 },
    { ...event(), sessionId: 'other' },
    { ...event(), payload: {} },
  ])
    assert.throws(() => transport.publish(bad));
  assert.equal(transport.getStats().retainedEvents, 0);
  transport.advanceTick(11);
  assert.throws(() => transport.publish(event()), /watermark/);
  assert.throws(() => transport.advanceTick(10), /decrease/);
  transport.publish(next('valid', 11));
  assert.equal(transport.getStats().retainedEvents, 1);
});

test('dedup is fail-closed at capacity; epoch invalidation rejects retired worlds', () => {
  const transport = bus(2);
  assert.equal(transport.getStats().sessionId, context.sessionId);
  transport.publish(next('a'));
  transport.publish(next('b'));
  assert.throws(() => transport.publish(next('c')), /capacity/);
  assert.equal(transport.publish(next('a')).status, 'duplicate');
  assert.equal(transport.getStats().retainedEvents, 2);
  assert.throws(() => transport.advanceWorldEpoch(2), /increase/);
  transport.advanceWorldEpoch(3);
  assert.equal(transport.getStats().sessionId, context.sessionId);
  assert.equal(transport.getStats().retainedEvents, 0);
  assert.throws(() => transport.publish(next('a')), /world/);
  assert.equal(transport.publish({ ...next('a', 0), worldEpoch: 3 }).status, 'delivered');
});

test('reentrant publication and lifecycle changes fail before nested effects', () => {
  const transport = bus();
  let effects = 0;
  transport.subscribe(() => {
    effects += 1;
    assert.throws(() => transport.advanceTick(20), /Reentrant/);
    assert.throws(() => transport.advanceWorldEpoch(3), /Reentrant/);
    assert.throws(() => transport.dispose(), /Reentrant/);
    transport.publish(next('nested'));
  });
  transport.subscribe(() => {
    effects += 10;
  });
  const result = transport.publish(next('outer'));
  assert.equal(result.failures.length, 1);
  assert.equal(effects, 11);
  assert.equal(transport.getStats().retainedEvents, 1);
});

test('validated copies are immutable and owned; resources are capped and disposed', () => {
  const transport = createEventBus({ ...context, maxListeners: 1, maxEventCodeUnits: 512 });
  const input = event();
  transport.subscribe((received) => {
    assert.notEqual(received.payload, input.payload);
    assert.ok(Object.isFrozen(received.payload));
    assert.ok(Object.isFrozen(received.entityIds));
  });
  assert.throws(() => transport.subscribe(() => {}), /capacity/);
  assert.throws(() => transport.publish(next('x'.repeat(512))), /size/);
  transport.publish(input);
  input.payload.impulseNs = 500;
  assert.equal(transport.publish(event()).status, 'duplicate');
  assert.ok(transport.getStats().retainedCodeUnits <= 512);
  transport.dispose();
  transport.dispose();
  assert.equal(transport.getStats().sessionId, context.sessionId);
  assert.equal(transport.getStats().retainedEvents, 0);
  assert.equal(transport.getStats().listeners, 0);
  assert.throws(() => transport.publish(event()), /disposed/);
  assert.throws(() => transport.subscribe(() => {}), /disposed/);
  assert.throws(() => bus(0), /positive/);
});
