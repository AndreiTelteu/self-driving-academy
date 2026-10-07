import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLLISION_LIMITS, CollisionRegistry } from '../../src/vehicles/collision-port';
import type { CollisionContact } from '../../src/vehicles/collision-port';
import { createCollisionEpisodes } from '../../src/vehicles/collision-episodes';
import type { CollisionIncident } from '../../src/vehicles/collision-episodes';

const context = {
  schemaVersion: 1,
  units: 'SI',
  sessionId: 'collision-tests',
  worldEpoch: 1,
} as const;

test('contact array permutations preserve canonical registration-pair delivery order', () => {
  const sequences = [false, true].map((reverse) => {
    const f = fixture();
    const contacts = [
      { first: f.car, second: f.wall, impulseNs: 10 },
      { first: f.other, second: f.wall, impulseNs: 20 },
    ];
    f.episodes.update(0, reverse ? contacts.reverse() : contacts);
    const ids: string[] = [];
    f.episodes.drain((incident) => {
      ids.push(incident.incidentId);
    });
    return ids;
  });
  assert.deepEqual(sequences[0], sequences[1]);
});
function fixture(options = {}) {
  const registry = new CollisionRegistry();
  const car = registry.register('z-car', 'VEHICLE', Number.MIN_VALUE);
  const other = registry.register('a-car', 'VEHICLE', 0.25);
  const wall = registry.register('wall', 'OBSTACLE', 2.75);
  const episodes = createCollisionEpisodes(context, registry, options);
  return { registry, car, other, wall, episodes };
}

test('canonical owned registrations fence copied tokens, handle/ID reuse and another world', () => {
  const { registry, car } = fixture();
  assert.equal(registry.forHandle(Number.MIN_VALUE), car);
  assert.equal(registry.isCurrent({ ...car }), false);
  assert.throws(() => registry.register('z-car', 'OBSTACLE', 5), /registered/);
  assert.equal(registry.remove(car), true);
  const next = registry.register('z-car', 'VEHICLE', Number.MIN_VALUE);
  assert.ok(next.serial > car.serial);
  assert.equal(registry.remove(car), false);
  assert.equal(registry.isCurrent(car), false);
  const foreign = new CollisionRegistry().register('z-car', 'VEHICLE', Number.MIN_VALUE);
  assert.equal(registry.isCurrent(foreign), false);
  registry.dispose();
  registry.dispose();
  assert.deepEqual(registry.getStats(), {
    vehicles: 0,
    obstacles: 0,
    colliders: 0,
    disposed: true,
  });
  assert.throws(() => registry.admit('new', 'VEHICLE'), /disposed/);
});

test('kind and ID admission reject before registration consumes a serial', () => {
  const registry = new CollisionRegistry();
  assert.throws(() => registry.admit('x'.repeat(257), 'VEHICLE'), /ID capacity/);
  assert.throws(() => registry.register('bad', 'VEHICLE', Infinity), /finite/);
  for (let i = 0; i < COLLISION_LIMITS.vehicles; i++) registry.register(`car-${i}`, 'VEHICLE', i);
  const before = registry.getStats();
  assert.throws(() => registry.register('overflow', 'VEHICLE', 200), /capacity/);
  assert.deepEqual(registry.getStats(), before);
  const obstacle = registry.register('wall', 'OBSTACLE', 200);
  assert.equal(obstacle.serial, COLLISION_LIMITS.vehicles + 1);
});

test('reversed pairs and multiple manifolds emit once with summed SI impulse and deterministic primary', () => {
  const { episodes, car, other } = fixture();
  const contacts = [
    { first: car, second: other, impulseNs: 20 },
    { first: other, second: car, impulseNs: 30 },
  ];
  assert.equal(episodes.update(10, contacts), 1);
  contacts[0].impulseNs = 999;
  const delivered: CollisionIncident[] = [];
  const drained = episodes.drain((incident) => {
    delivered.push(incident);
  });
  assert.deepEqual(drained, {
    status: 'drained',
    accepted: 1,
    discarded: 0,
    pending: 0,
    blocked: null,
  });
  assert.equal(delivered[0].vehicleId, 'a-car');
  assert.equal(delivered[0].otherEntityId, 'z-car');
  assert.equal(delivered[0].impulseNs, 50);
  assert.equal(delivered[0].tick, 10);
  assert.equal(delivered[0].units, 'SI');
  assert.ok(Object.isFrozen(delivered[0]));
  assert.equal(episodes.update(10, [{ first: other, second: car, impulseNs: 50 }]), 0);
  assert.throws(
    () => episodes.update(10, [{ first: car, second: other, impulseNs: 51 }]),
    /same-tick/,
  );
});

test('persistent contacts do not reemit after cooldown; separation recontact includes boundary', () => {
  const { episodes, car, wall } = fixture();
  const contacts = [{ first: car, second: wall, impulseNs: 10 }];
  assert.equal(episodes.update(0, contacts), 1);
  episodes.drain(() => undefined);
  for (let tick = 1; tick <= 80; tick++) assert.equal(episodes.update(tick, contacts), 0);
  episodes.update(81, []);
  assert.equal(episodes.update(82, contacts), 1);
  episodes.drain(() => undefined);
  episodes.update(83, []);
  for (let tick = 84; tick < 141; tick++) episodes.update(tick, []);
  assert.equal(episodes.update(141, contacts), 0);
  assert.equal(episodes.update(142, contacts), 0);
  episodes.update(143, []);
  assert.equal(episodes.update(144, contacts), 1);
});

test('cooldown inclusive onset boundary and zero-tick cooldown still require separation', () => {
  for (const cooldownTicks of [0, 60]) {
    const { episodes, car, wall } = fixture({ cooldownTicks });
    const contacts = [{ first: car, second: wall, impulseNs: 0 }];
    episodes.update(0, contacts);
    episodes.drain(() => undefined);
    assert.equal(episodes.update(1, contacts), 0);
    episodes.update(2, []);
    for (let tick = 3; tick < Math.max(3, cooldownTicks); tick++) episodes.update(tick, []);
    assert.equal(episodes.update(Math.max(3, cooldownTicks), contacts), 1);
  }
});

test('invalid contacts, accessor/prototype arrays and capacity overflow leave tick and episodes atomic', () => {
  const { episodes, car, other, wall } = fixture({ maxPairs: 1, maxPending: 1 });
  const before = episodes.getStats();
  const pair = { first: car, second: wall, impulseNs: 10 };
  assert.throws(
    () => episodes.update(1, [pair, { first: car, second: other, impulseNs: 20 }]),
    /capacity/,
  );
  assert.throws(() => episodes.update(1, [{ ...pair, impulseNs: NaN }]), /finite/);
  let getterRan = false;
  const unsafe = Object.defineProperty({ first: car, second: wall }, 'impulseNs', {
    enumerable: true,
    get() {
      getterRan = true;
      return 10;
    },
  });
  assert.throws(() => episodes.update(1, [unsafe as CollisionContact]), /data fields/);
  const inherited = [pair];
  Object.setPrototypeOf(inherited, {});
  assert.throws(() => episodes.update(1, inherited), /dense array/);
  assert.equal(getterRan, false);
  assert.deepEqual(episodes.getStats(), before);
  assert.equal(episodes.update(1, [pair]), 1);
});

test('publisher errors retain exact failed suffix and forbid new ticks until accepted-prefix retry', () => {
  const { episodes, car, other, wall } = fixture();
  episodes.update(1, [
    { first: car, second: wall, impulseNs: 10 },
    { first: other, second: wall, impulseNs: 20 },
  ]);
  const attempted: CollisionIncident[] = [];
  const failure = new Error('publication blocked');
  const first = episodes.drain((incident) => {
    attempted.push(incident);
    if (attempted.length === 2) throw failure;
  });
  assert.equal(first.accepted, 1);
  assert.equal(first.pending, 1);
  assert.equal(first.blocked, failure);
  assert.throws(() => episodes.update(2, []), /Drain pending/);
  const retry: CollisionIncident[] = [];
  episodes.drain((incident) => {
    retry.push(incident);
  });
  assert.equal(retry[0], attempted[1]);
  assert.equal(episodes.update(2, []), 0);
});

test('pending and separated-history caps each reject an entire update before state changes', () => {
  const pendingFixture = fixture({ maxPairs: 2, maxPending: 1 });
  const { car, other, wall, episodes } = pendingFixture;
  const before = episodes.getStats();
  assert.throws(
    () =>
      episodes.update(1, [
        { first: car, second: wall, impulseNs: 10 },
        { first: other, second: wall, impulseNs: 10 },
      ]),
    /pending capacity/,
  );
  assert.deepEqual(episodes.getStats(), before);
  const limited = createCollisionEpisodes(context, pendingFixture.registry, { maxPairs: 1 });
  limited.update(1, [{ first: car, second: wall, impulseNs: 10 }]);
  limited.drain(() => undefined);
  limited.update(2, []);
  const separated = limited.getStats();
  assert.throws(
    () => limited.update(3, [{ first: other, second: wall, impulseNs: 10 }]),
    /tracked pair capacity/,
  );
  assert.deepEqual(limited.getStats(), separated);
});

test('strict finite option admission and synchronous publisher contract reject malformed values', () => {
  const { registry, episodes, car, wall } = fixture();
  for (const options of [
    { cooldownTicks: NaN },
    { maxPairs: 0 },
    { maxPairs: COLLISION_LIMITS.pairs + 1 },
    { maxPending: Infinity },
  ]) {
    assert.throws(() => createCollisionEpisodes(context, registry, options));
  }
  assert.throws(() =>
    createCollisionEpisodes(context, registry, { cooldownTicks: null } as unknown as {
      cooldownTicks: number;
    }),
  );
  episodes.update(1, [{ first: car, second: wall, impulseNs: 10 }]);
  const result = episodes.drain((() => Promise.resolve()) as unknown as (
    incident: CollisionIncident,
  ) => undefined);
  assert.ok(result.blocked instanceof Error);
  assert.equal(result.pending, 1);
  const nullFailure = episodes.drain(() => {
    throw null;
  });
  assert.equal(nullFailure.status, 'blocked');
  assert.equal(nullFailure.pending, 1);
  assert.equal(episodes.drain(() => undefined).accepted, 1);
});

test('separated cooldown history expires exactly at boundary before admitting a different pair', () => {
  const { episodes, car, other, wall } = fixture({ maxPairs: 1, cooldownTicks: 3 });
  episodes.update(1, [{ first: car, second: wall, impulseNs: 10 }]);
  episodes.drain(() => undefined);
  episodes.update(2, []);
  const before = episodes.getStats();
  assert.throws(
    () => episodes.update(3, [{ first: other, second: wall, impulseNs: 10 }]),
    /tracked pair capacity/,
  );
  assert.deepEqual(episodes.getStats(), before);
  episodes.update(3, []);
  assert.equal(episodes.update(4, [{ first: other, second: wall, impulseNs: 10 }]), 1);
  assert.equal(episodes.getStats().trackedPairs, 1);
});

test('consecutive snapshot admission rejects unobserved gaps without inventing contact continuity', () => {
  const { episodes, car, wall } = fixture({ cooldownTicks: 3 });
  const contacts = [{ first: car, second: wall, impulseNs: 10 }];
  episodes.update(5, contacts);
  episodes.drain(() => undefined);
  const before = episodes.getStats();
  assert.throws(() => episodes.update(7, []), /consecutive/);
  assert.deepEqual(episodes.getStats(), before);
  assert.equal(episodes.update(6, contacts), 0);
  assert.equal(episodes.update(6, contacts), 0);
  episodes.update(7, []);
  assert.equal(episodes.update(8, contacts), 1);
});

test('session namespace differentiates otherwise identical incident keys and admits bounded IDs upfront', () => {
  const { registry, car, wall, episodes } = fixture();
  const otherSession = createCollisionEpisodes(
    { ...context, sessionId: 'other-session' },
    registry,
  );
  const contacts = [{ first: car, second: wall, impulseNs: 10 }];
  const ids: string[] = [];
  for (const engine of [episodes, otherSession]) {
    engine.update(0, contacts);
    engine.drain((incident) => {
      ids.push(incident.incidentId);
    });
  }
  assert.notEqual(ids[0], ids[1]);
  assert.throws(
    () => createCollisionEpisodes({ ...context, sessionId: 's'.repeat(257) }, registry),
    /session identity capacity/,
  );
  const before = episodes.getStats();
  assert.throws(
    () => episodes.reset({ ...context, sessionId: 's'.repeat(257), worldEpoch: 2 }, registry),
    /session identity capacity/,
  );
  assert.deepEqual(episodes.getStats(), before);
});

test('callback removal/reuse cancels stale pending; reentrant core mutation is fenced', () => {
  const { registry, episodes, car, other, wall } = fixture();
  episodes.update(1, [
    { first: car, second: wall, impulseNs: 10 },
    { first: other, second: wall, impulseNs: 20 },
  ]);
  const result = episodes.drain(() => {
    assert.throws(() => episodes.update(2, []), /busy/);
    assert.throws(() => episodes.dispose(), /busy/);
    registry.remove(other);
    registry.register(other.entityId, 'VEHICLE', other.colliderHandle);
  });
  assert.equal(result.accepted, 1);
  assert.equal(result.discarded, 1);
  assert.equal(episodes.getStats().trackedPairs, 1);
  assert.throws(() => episodes.update(2, [{ first: car, second: other, impulseNs: 1 }]), /Stale/);
});

test('obstacle pairs ignored; epoch reset/new owner and disposal clear bounded state', () => {
  const { registry, episodes, car, wall } = fixture();
  const wall2 = registry.register('wall2', 'OBSTACLE', 3);
  assert.equal(episodes.update(0, [{ first: wall, second: wall2, impulseNs: 20 }]), 0);
  episodes.update(1, [{ first: car, second: wall, impulseNs: 10 }]);
  assert.throws(() => episodes.reset(context, registry), /epoch/);
  const next = new CollisionRegistry();
  const nextCar = next.register('z-car', 'VEHICLE', Number.MIN_VALUE);
  const nextWall = next.register('wall', 'OBSTACLE', 2.75);
  episodes.reset({ ...context, worldEpoch: 2 }, next);
  assert.equal(episodes.getStats().pending, 0);
  assert.throws(() => episodes.update(0, [{ first: car, second: wall, impulseNs: 10 }]), /Stale/);
  assert.equal(episodes.update(0, [{ first: nextCar, second: nextWall, impulseNs: 10 }]), 1);
  episodes.dispose();
  episodes.dispose();
  assert.equal(episodes.getStats().trackedPairs, 0);
  assert.equal(episodes.getStats().pending, 0);
  assert.throws(() => episodes.update(1, []), /disposed/);
});
