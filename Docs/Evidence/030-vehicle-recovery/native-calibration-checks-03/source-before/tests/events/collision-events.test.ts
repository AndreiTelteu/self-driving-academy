import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCollisionEventAdapter,
  COLLISION_FAILURE_SAMPLE_CAPACITY,
} from '../../src/simulation/collision-events';
import { createEventBus, parseSimulationEvent } from '../../src/simulation';
import type { EventBus } from '../../src/simulation';
import { CollisionRegistry } from '../../src/vehicles';
import type { CollisionContact } from '../../src/vehicles';

const context = {
  schemaVersion: 1,
  units: 'SI',
  sessionId: 'collision-events',
  worldEpoch: 1,
} as const;
function fixture(maxEventsPerEpoch = 10000) {
  const registry = new CollisionRegistry();
  const car = registry.register('car', 'VEHICLE', 0.25);
  const other = registry.register('other', 'VEHICLE', 0.5);
  const wall = registry.register('wall', 'OBSTACLE', 1);
  let serial = 0;
  let contacts: readonly CollisionContact[] = [{ first: car, second: wall, impulseNs: 100 }];
  const physics = {
    collisionSource: registry,
    collisionStepSerial: () => serial,
    readCollisionContacts: () =>
      Object.freeze({
        physicsStepSerial: serial,
        contactToleranceM: 0.001,
        contacts,
        candidatePairs: contacts.length,
        manifoldContacts: contacts.length,
        ignoredGroundPairs: 0,
        ignoredSensorPairs: 0,
        ignoredUnmappedPairs: 0,
        ignoredObstaclePairs: 0,
      }),
  };
  const bus = createEventBus({
    sessionId: context.sessionId,
    worldEpoch: context.worldEpoch,
    maxEventsPerEpoch,
  });
  return {
    registry,
    car,
    other,
    wall,
    physics,
    bus,
    advance: () => {
      serial++;
    },
    setContacts: (next: readonly CollisionContact[]) => {
      contacts = next;
    },
  };
}

test('composition publishes the exact COLLISION variant once for actual admitted step serials', () => {
  const f = fixture();
  const adapter = createCollisionEventAdapter({ context, physics: f.physics, eventBus: f.bus });
  const received: unknown[] = [];
  f.bus.subscribe((event) => {
    received.push(event);
  });
  for (let tick = 0; tick < 70; tick++) {
    assert.equal(adapter.beforePhysicsStep(tick).ready, true);
    f.advance();
    const result = adapter.captureAfterPhysicsStep(tick);
    assert.equal(result.publication.status, 'drained');
  }
  assert.equal(received.length, 1);
  const event = parseSimulationEvent(received[0]);
  assert.equal(event.type, 'COLLISION');
  if (event.type !== 'COLLISION') throw new Error('Wrong variant');
  assert.deepEqual(event.entityIds, ['car', 'wall']);
  assert.deepEqual(event.payload, { vehicleId: 'car', otherEntityId: 'wall', impulseNs: 100 });
  assert.equal(event.tick, 0);
  assert.deepEqual(Object.keys(event.payload).sort(), ['impulseNs', 'otherEntityId', 'vehicleId']);
  adapter.dispose();
  f.bus.dispose();
});

test('foreign session and epoch are rejected at constructor before any native step', () => {
  const f = fixture();
  for (const bad of [
    { ...context, sessionId: 'foreign' },
    { ...context, worldEpoch: 2 },
  ]) {
    assert.throws(
      () => createCollisionEventAdapter({ context: bad, physics: f.physics, eventBus: f.bus }),
      /foreign context/,
    );
  }
  assert.equal(f.physics.collisionStepSerial(), 0);
  assert.equal(f.bus.getStats().retainedEvents, 0);
});

test('accepted listener errors are inspected with bounded diagnostics and never retried as effects', () => {
  const f = fixture();
  const adapter = createCollisionEventAdapter({ context, physics: f.physics, eventBus: f.bus });
  let effects = 0;
  for (let index = 0; index < 80; index++)
    f.bus.subscribe(() => {
      effects++;
      throw { arbitrary: new Array(100).fill(index) };
    });
  adapter.beforePhysicsStep(0);
  f.advance();
  const result = adapter.captureAfterPhysicsStep(0).publication;
  assert.equal(result.accepted, 1);
  assert.equal(result.pending, 0);
  assert.equal(result.listenerFailures, 80);
  assert.equal(result.failureSamples.length, COLLISION_FAILURE_SAMPLE_CAPACITY);
  assert.equal(result.omittedListenerFailures, 80 - COLLISION_FAILURE_SAMPLE_CAPACITY);
  assert.equal(result.failureSamples[0].errorType, 'object');
  assert.equal(Object.hasOwn(result.failureSamples[0], 'error'), false);
  assert.equal(adapter.retryPublications().accepted, 0);
  assert.equal(effects, 80);
});

test('capacity failure keeps exact suffix and blocks newer physics before it advances', () => {
  const f = fixture(1);
  f.setContacts([
    { first: f.car, second: f.wall, impulseNs: 100 },
    { first: f.other, second: f.wall, impulseNs: 200 },
  ]);
  const adapter = createCollisionEventAdapter({ context, physics: f.physics, eventBus: f.bus });
  let effects = 0;
  f.bus.subscribe(() => {
    effects++;
  });
  adapter.beforePhysicsStep(0);
  f.advance();
  const publication = adapter.captureAfterPhysicsStep(0).publication;
  assert.equal(publication.status, 'blocked');
  assert.equal(publication.accepted, 1);
  assert.equal(publication.pending, 1);
  assert.equal(adapter.beforePhysicsStep(1).ready, false);
  assert.equal(f.physics.collisionStepSerial(), 1);
  assert.equal(effects, 1);
  assert.equal(adapter.retryPublications().pending, 1);
  assert.equal(effects, 1);
});

test('publisher failure after acceptance retries stable duplicate identity without repeating effects', () => {
  const f = fixture();
  let first = true,
    effects = 0;
  f.bus.subscribe(() => {
    effects++;
  });
  const wrapped: EventBus = {
    ...f.bus,
    publish(value) {
      const result = f.bus.publish(value);
      if (first) {
        first = false;
        throw new Error('wrapper failed after bus acceptance');
      }
      return result;
    },
  };
  const adapter = createCollisionEventAdapter({ context, physics: f.physics, eventBus: wrapped });
  adapter.beforePhysicsStep(0);
  f.advance();
  assert.equal(adapter.captureAfterPhysicsStep(0).publication.pending, 1);
  assert.equal(adapter.retryPublications().accepted, 1);
  assert.equal(effects, 1);
  assert.equal(f.bus.getStats().retainedEvents, 1);
});

test('listener removal/reuse discards later stale incidents and adapter reentry is fenced', () => {
  const f = fixture();
  f.setContacts([
    { first: f.car, second: f.wall, impulseNs: 100 },
    { first: f.other, second: f.wall, impulseNs: 200 },
  ]);
  const adapter = createCollisionEventAdapter({ context, physics: f.physics, eventBus: f.bus });
  f.bus.subscribe(() => {
    assert.throws(() => adapter.retryPublications(), /busy/);
    assert.throws(() => adapter.dispose(), /busy/);
    f.registry.remove(f.other);
    f.registry.register(f.other.entityId, 'VEHICLE', f.other.colliderHandle);
  });
  adapter.beforePhysicsStep(0);
  f.advance();
  const report = adapter.captureAfterPhysicsStep(0).publication;
  assert.equal(report.accepted, 1);
  assert.equal(report.discarded, 1);
  assert.equal(report.pending, 0);
});

test('native serial and tick fences reject fake captures, duplicated physics and external advances', () => {
  for (const advances of [0, 2]) {
    const f = fixture(),
      adapter = createCollisionEventAdapter({ context, physics: f.physics, eventBus: f.bus });
    adapter.beforePhysicsStep(0);
    for (let index = 0; index < advances; index++) f.advance();
    assert.throws(() => adapter.captureAfterPhysicsStep(0), /exactly one/);
    assert.equal(adapter.getStats().faulted, true);
    assert.throws(() => adapter.beforePhysicsStep(1), /owner recovery/);
    assert.equal(f.bus.getStats().retainedEvents, 0);
  }
  const f = fixture(),
    adapter = createCollisionEventAdapter({ context, physics: f.physics, eventBus: f.bus });
  f.advance();
  assert.throws(() => adapter.beforePhysicsStep(0), /outside collision admission/);
});

test('real epoch reset restores new owner and disposal releases all episode/pending ownership', () => {
  const f = fixture(),
    adapter = createCollisionEventAdapter({ context, physics: f.physics, eventBus: f.bus });
  adapter.beforePhysicsStep(0);
  f.advance();
  adapter.captureAfterPhysicsStep(0);
  const next = fixture();
  f.bus.advanceWorldEpoch(2);
  adapter.reset({ ...context, worldEpoch: 2 }, next.physics);
  assert.equal(adapter.getStats().trackedPairs, 0);
  assert.equal(adapter.getStats().pending, 0);
  assert.equal(adapter.getStats().lastPhysicsTick, -1);
  adapter.beforePhysicsStep(0);
  next.advance();
  adapter.captureAfterPhysicsStep(0);
  assert.equal(f.bus.getStats().retainedEvents, 1);
  adapter.dispose();
  adapter.dispose();
  assert.equal(adapter.getStats().trackedPairs, 0);
  assert.equal(adapter.getStats().pending, 0);
  assert.throws(() => adapter.beforePhysicsStep(1), /disposed/);
});

test('prepared admission is idempotent and cannot relabel the physical tick', () => {
  const f = fixture(),
    adapter = createCollisionEventAdapter({ context, physics: f.physics, eventBus: f.bus });
  assert.equal(adapter.beforePhysicsStep(7).ready, true);
  assert.equal(adapter.beforePhysicsStep(7).ready, true);
  assert.throws(() => adapter.beforePhysicsStep(8), /cannot be overwritten/);
  f.advance();
  assert.throws(() => adapter.captureAfterPhysicsStep(8), /not admitted/);
  assert.equal(adapter.captureAfterPhysicsStep(7).tick, 7);
  assert.equal(f.physics.collisionStepSerial(), 1);
});

test('pending publication cannot admit physics advanced by a listener', () => {
  const f = fixture();
  let rejected = true;
  const wrapped: EventBus = {
    ...f.bus,
    publish(value) {
      if (rejected) throw new Error('temporary publication rejection');
      return f.bus.publish(value);
    },
  };
  const adapter = createCollisionEventAdapter({ context, physics: f.physics, eventBus: wrapped });
  adapter.beforePhysicsStep(0);
  f.advance();
  assert.equal(adapter.captureAfterPhysicsStep(0).publication.pending, 1);
  f.bus.subscribe(() => {
    f.advance();
  });
  rejected = false;
  assert.throws(() => adapter.beforePhysicsStep(1), /advanced during collision publication/);
  assert.equal(adapter.getStats().preparedTick, null);
  assert.equal(f.physics.collisionStepSerial(), 2);
  assert.throws(() => adapter.captureAfterPhysicsStep(1), /not admitted/);
});
