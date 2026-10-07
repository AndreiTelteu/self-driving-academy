import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { createCollisionEpisodes } from '../../src/vehicles/collision-episodes';
import type { CollisionIncident } from '../../src/vehicles/collision-episodes';
import { SEDAN } from '../../src/vehicles';

const context = {
  schemaVersion: 1,
  units: 'SI',
  sessionId: 'native-collisions',
  worldEpoch: 1,
} as const;

for (const kind of ['wall', 'cars'] as const)
  test(`actual Rapier ${kind} impact emits one positive SI impulse for the mapped episode`, async () => {
    const world = await createRapierProbe();
    const episodes = createCollisionEpisodes(context, world.collisionSource);
    try {
      world.addCar('car', { x: 0, y: 0.8, z: 0 });
      if (kind === 'cars') world.addCar('target', { x: 0, y: 0.8, z: 10 });
      else {
        const wall = world.addNamedBox('target', { x: 0, y: 1, z: 10 }, { x: 4, y: 1, z: 0.05 });
        assert.equal(world.bodyIdentity('target'), undefined);
        assert.equal(world.collisionForColliderHandle(wall.colliderHandle), wall);
      }
      for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
      world.setVelocity('car', { x: 0, y: 0, z: kind === 'wall' ? 45 : 10 });
      const incidents: CollisionIncident[] = [];
      const expectedOnsets: number[] = [];
      let touching = false,
        lastOnset = -Infinity,
        streak = 0,
        maxStreak = 0;
      let nativePositive = 0;
      for (let tick = 0; tick < 180; tick++) {
        world.step(new Map(), false);
        const snapshot = world.readCollisionContacts();
        const pair = snapshot.contacts.find(
          (contact) =>
            (contact.first.entityId === 'car' && contact.second.entityId === 'target') ||
            (contact.second.entityId === 'car' && contact.first.entityId === 'target'),
        );
        if (pair && !touching && tick - lastOnset >= 60) {
          expectedOnsets.push(tick);
          lastOnset = tick;
        }
        touching = pair !== undefined;
        streak = touching ? streak + 1 : 0;
        maxStreak = Math.max(maxStreak, streak);
        for (const contact of snapshot.contacts)
          nativePositive = Math.max(nativePositive, contact.impulseNs);
        episodes.update(tick, snapshot.contacts);
        episodes.drain((incident) => {
          incidents.push(incident);
        });
      }
      assert.ok(nativePositive > 0, 'native manifold normal impulse must be observed');
      assert.ok(incidents.length >= 1);
      assert.ok(incidents[0].impulseNs > 0, `onset incident intensity: ${incidents[0].impulseNs}`);
      assert.equal(incidents[0].vehicleId, 'car');
      assert.equal(incidents[0].otherEntityId, 'target');
      assert.equal(incidents[0].units, 'SI');
      assert.deepEqual(
        incidents.map((incident) => incident.tick),
        expectedOnsets,
      );
      assert.ok(maxStreak >= 2, 'actual consecutive contact segment must be exercised');
      assert.equal(
        new Set(incidents.map((incident) => incident.incidentId)).size,
        incidents.length,
      );
    } finally {
      episodes.dispose();
      world.dispose();
    }
  });

test('positive predictive gap with zero impulse beyond native resting tolerance produces no incident', async () => {
  const world = await createRapierProbe();
  try {
    world.addCar('car', { x: 0, y: 0.8, z: 0 });
    for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
    const position = world.project('car').position;
    world.addNamedBox('wall', { x: 0, y: 1, z: position.z + 2.06 }, { x: 4, y: 1, z: 0.05 });
    world.step(new Map(), false);
    const snapshot = world.readCollisionContacts();
    assert.ok(snapshot.manifoldContacts > 0, 'actual predictive contact manifold is required');
    assert.ok(snapshot.contactToleranceM > 0 && snapshot.contactToleranceM < 0.01);
    assert.deepEqual(snapshot.contacts, []);
  } finally {
    world.dispose();
  }
});

test('native sustained contact, controlled separation and recontact emit only qualifying episode onsets', async () => {
  const world = await createRapierProbe();
  const episodes = createCollisionEpisodes(context, world.collisionSource);
  try {
    world.addCar('car', { x: 0, y: 0.8, z: 0 });
    world.addNamedBox('wall', { x: 0, y: 1, z: 10 }, { x: 4, y: 1, z: 0.05 });
    for (let tick = 0; tick < 180; tick++) world.step(new Map(), false);
    const drive = new Map([['car', { throttle: 1, brake: 0, steering: 0 }]]);
    const delivered: CollisionIncident[] = [];
    let tick = 0,
      contactTicks = 0;
    const advance = (inputs = drive) => {
      world.step(inputs, false);
      const snapshot = world.readCollisionContacts();
      contactTicks += snapshot.contacts.length ? 1 : 0;
      episodes.update(tick++, snapshot.contacts);
      episodes.drain((incident) => {
        delivered.push(incident);
      });
      return snapshot.contacts.length > 0;
    };
    world.setVelocity('car', { x: 0, y: 0, z: 10 });
    for (let index = 0; index < 180; index++) advance();
    assert.ok(contactTicks > 60);
    const firstCount = delivered.length;
    assert.ok(firstCount >= 1 && firstCount < contactTicks);
    const body = world.bodyIdentity('car')!;
    world.setPose(body, {
      positionM: { x: 0, y: 0.8, z: 0 },
      rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    });
    world.setBodyVelocity(body, { x: 0, y: 0, z: 0 });
    for (let index = 0; index < 61; index++) assert.equal(advance(new Map()), false);
    world.setVelocity('car', { x: 0, y: 0, z: 10 });
    for (let index = 0; index < 180; index++) advance();
    assert.ok(delivered.length > firstCount);
    assert.ok(delivered[firstCount].tick >= 241);
    assert.ok(delivered[firstCount].impulseNs > 0);
  } finally {
    episodes.dispose();
    world.dispose();
  }
});

test('native ground, sensor and anonymous obstacle contacts have no invented mapped incidents', async () => {
  const world = await createRapierProbe();
  try {
    world.addCar('car', { x: 0, y: 0.2, z: 0 });
    world.addBox({ x: 0, y: 0.5, z: 1 }, { x: 0.5, y: 0.5, z: 0.5 });
    world.addNamedBox('sensor', { x: 0, y: 0.5, z: 0 }, { x: 3, y: 3, z: 3 }, { sensor: true });
    world.step(new Map(), false);
    const snapshot = world.readCollisionContacts();
    assert.deepEqual(snapshot.contacts, []);
    assert.ok(snapshot.ignoredGroundPairs > 0);
    assert.ok(snapshot.ignoredUnmappedPairs > 0);
    assert.ok(world.contacts() > 0);
  } finally {
    world.dispose();
  }
});

test('named obstacle–obstacle physical contacts are excluded without a vehicle participant', async () => {
  const world = await createRapierProbe();
  try {
    world.addNamedBox('a', { x: 0, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0.5 }, { dynamic: true });
    world.addNamedBox('b', { x: 0.2, y: 0.5, z: 0 }, { x: 0.5, y: 0.5, z: 0.5 }, { dynamic: true });
    world.step(new Map(), false);
    assert.ok(world.contacts() > 0);
    assert.deepEqual(world.readCollisionContacts().contacts, []);
  } finally {
    world.dispose();
  }
});

test('native removal/reuse maps exact collider identity and releases static/dynamic/controller ownership', async () => {
  for (let iteration = 0; iteration < 20; iteration++) {
    const world = await createRapierProbe();
    try {
      world.addCar('car', { x: 0, y: 0.8, z: 0 });
      const car = world.collisionIdentity('car')!;
      const wall = world.addNamedBox('wall', { x: 0, y: 1, z: 10 }, { x: 1, y: 1, z: 1 });
      const box = world.addNamedBox(
        'box',
        { x: 5, y: 1, z: 0 },
        { x: 0.5, y: 0.5, z: 0.5 },
        { dynamic: true },
      );
      assert.equal(world.removeCollisionEntity(car), true);
      assert.equal(world.bodyIdentity('car'), undefined);
      world.addCar('car', { x: 0, y: 0.8, z: 0 });
      const next = world.collisionIdentity('car')!;
      assert.ok(next.serial > car.serial);
      assert.equal(world.removeCollisionEntity(car), false);
      assert.equal(world.collisionSource.isCurrent(car), false);
      assert.equal(world.removeCollisionEntity(wall), true);
      assert.equal(world.removeCollisionEntity(box), true);
      assert.equal(world.removeCollisionEntity(next), true);
      assert.deepEqual(world.counts(), { vehicles: 0, bodies: 0, colliders: 1 });
      assert.deepEqual(world.collisionResources(), {
        vehicles: 0,
        obstacles: 0,
        colliders: 0,
        disposed: false,
      });
    } finally {
      world.dispose();
    }
    assert.deepEqual(world.collisionResources(), {
      vehicles: 0,
      obstacles: 0,
      colliders: 0,
      disposed: true,
    });
  }
});

test('named identity and native shape admission reject without allocation or serial consumption', async () => {
  const world = await createRapierProbe();
  try {
    world.addCar('car', { x: 0, y: 0.8, z: 0 });
    const before = world.counts();
    assert.throws(
      () => world.addNamedBox('car', { x: 0, y: 1, z: 10 }, { x: 1, y: 1, z: 1 }),
      /registered/,
    );
    assert.throws(
      () => world.addNamedBox('bad', { x: 0, y: 1, z: 10 }, { x: 0, y: 1, z: 1 }),
      /physics value/,
    );
    let getterRan = false;
    const position = Object.defineProperty({ y: 1, z: 10 }, 'x', {
      enumerable: true,
      get() {
        getterRan = true;
        return 0;
      },
    });
    assert.throws(
      () =>
        world.addNamedBox('getter', position as { x: number; y: number; z: number }, {
          x: 1,
          y: 1,
          z: 1,
        }),
      /data fields/,
    );
    assert.equal(getterRan, false);
    assert.deepEqual(world.counts(), before);
    assert.equal(world.addNamedBox('wall', { x: 0, y: 1, z: 10 }, { x: 1, y: 1, z: 1 }).serial, 2);
  } finally {
    world.dispose();
  }
});

test('vehicle input getters never execute and boundary reentrancy cannot retire a valid registration', async () => {
  const world = await createRapierProbe();
  try {
    world.addCar('stable', { x: 0, y: 0.8, z: 0 });
    const stable = world.collisionIdentity('stable')!;
    const stableBody = world.bodyIdentity('stable')!;
    const before = world.counts();
    let getterRan = false;
    const tuning = Object.defineProperty({ ...SEDAN }, 'massKg', {
      enumerable: true,
      get() {
        getterRan = true;
        world.removeCollisionEntity(stable);
        return 1400;
      },
    });
    assert.throws(() => world.addCar('reentrant', { x: 0, y: 0.8, z: 10 }, tuning), /data fields/);
    assert.equal(getterRan, false);
    assert.deepEqual(world.counts(), before);
    assert.equal(world.bodyIdentity('stable'), stableBody);
    assert.equal(world.collisionIdentity('stable'), stable);
    let mutationBlocked = false;
    const reflected = new Proxy(
      { ...SEDAN },
      {
        ownKeys(target) {
          assert.throws(() => world.removeCollisionEntity(stable), /busy/);
          mutationBlocked = true;
          return Reflect.ownKeys(target);
        },
      },
    );
    world.addCar('other', { x: 0, y: 0.8, z: 10 }, reflected);
    assert.equal(mutationBlocked, true);
    assert.equal(world.collisionSource.isCurrent(stable), true);
    assert.equal(world.collisionIdentity('other')!.serial, 2);
    world.addClassCar('compact', { x: 5, y: 0.8, z: 10 }, 'compact');
    assert.equal(world.readVehicleMechanics('compact').massKg, 1100);
  } finally {
    world.dispose();
  }
});
