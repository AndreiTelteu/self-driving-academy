import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPedestrians,
  PEDESTRIAN_STATE_TRANSITIONS,
  PEDESTRIAN_STATES,
  type PedestrianEvent,
  type PedestrianState,
  type Pedestrians,
} from '../../src/world';
import {
  createPedestrianWorld,
  lanePose,
  pedestrianMap,
  pedestrianSession,
  pedestrianTarget,
  vehicleBefore,
  type PedestrianTarget,
} from './pedestrians-fixture';

const DT = 1 / 60;
const targetWorld = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
const target = pedestrianTarget(targetWorld.getLinks());
const targetPedestrianId = (world: Pedestrians) =>
  world.getPedestrians().find((pedestrian) => pedestrian.crosswalkId === target.crosswalkId)!
    .pedestrianId;

function driveFree(world: Pedestrians, ticks: number) {
  const events: PedestrianEvent[] = [];
  for (let tick = 0; tick < ticks; tick += 1)
    events.push(
      ...world.step({
        tick,
        vehicles: [],
        vehiclesComplete: true,
      }).events,
    );
  return events;
}

function driveApproach(
  world: Pedestrians,
  pedestrianId: string,
  ticks: number,
  mode: 'YIELD' | 'CONTINUE' | 'INCOMPLETE' | 'CONTACT',
  targetInfo: PedestrianTarget = target,
) {
  let distance = 30,
    speed = 6,
    contacted = false;
  const events: PedestrianEvent[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    if (tick > 0) {
      const crossing = world.getPedestrian(pedestrianId)?.state === 'CROSSING';
      speed = mode === 'YIELD' && crossing && distance <= 25 ? Math.max(0, speed - 8 * DT) : 6;
      distance -= speed * DT;
    }
    const vehicle = vehicleBefore(targetInfo, distance, speed);
    const contact =
      mode === 'CONTACT' && !contacted && distance <= 0
        ? {
            vehicleId: 'vehicle-1',
            pedestrianId,
            tick,
            positionM: vehicle.positionM,
            speedMps: speed,
          }
        : null;
    if (contact) contacted = true;
    const frame = world.step({
      tick,
      vehicles: [vehicle],
      vehiclesComplete: mode !== 'INCOMPLETE',
      contacts: contact ? [contact] : [],
    });
    events.push(...frame.events);
  }
  return events;
}

test('pedestrians have stable identity derived from the map, crosswalk and slot', () => {
  const first = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
  const second = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
  const firstIds = first.getPedestrians().map((pedestrian) => pedestrian.pedestrianId);
  const secondIds = second.getPedestrians().map((pedestrian) => pedestrian.pedestrianId);
  assert.deepEqual(firstIds, secondIds);
  assert.equal(new Set(firstIds).size, firstIds.length);
  assert.equal(firstIds.length, first.getNetwork().links);
  assert.equal(firstIds.length, 48);
  // Identity is not a clock and does not depend on the observation tick.
  first.step({ tick: 0, vehicles: [], vehiclesComplete: true });
  assert.deepEqual(
    first.getPedestrians().map((pedestrian) => pedestrian.pedestrianId),
    firstIds,
  );
  assert.equal(first.getPedestrian('absent-pedestrian'), null);
});

test('same seed reproduces the same people and decisions; another seed changes behaviour', () => {
  const fingerprint = (seed: number) => {
    const world = createPedestrianWorld({ seed, pedestriansPerCrosswalk: 1 });
    driveFree(world, 400);
    return JSON.stringify(
      world
        .getPedestrians()
        .map((pedestrian) => [
          pedestrian.pedestrianId,
          pedestrian.walkSpeedMps,
          pedestrian.patienceTicks,
          pedestrian.safetyMarginS,
          pedestrian.state,
          pedestrian.positionM,
        ]),
    );
  };
  assert.equal(fingerprint(11), fingerprint(11));
  assert.notEqual(fingerprint(11), fingerprint(12));
});

test('the closed state machine visits every state and refuses any other transition', () => {
  const world = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
  const pedestrianId = targetPedestrianId(world);
  const events = driveFree(world, 1200);
  const own = events.filter((event) => event.pedestrianId === pedestrianId);
  const transitions = own
    .filter((event) => event.kind === 'STATE_CHANGED')
    .map((event) => `${event.from}->${event.to}`);
  assert.deepEqual(transitions, [
    'ON_SIDEWALK->WAITING',
    'WAITING->CROSSING',
    'CROSSING->CROSSED',
    'CROSSED->WITHDRAWN',
  ]);
  for (const event of own)
    if (event.kind === 'STATE_CHANGED')
      assert.ok(
        PEDESTRIAN_STATE_TRANSITIONS[event.from].includes(event.to),
        `illegal transition ${event.from}->${event.to}`,
      );
  const final = world.getPedestrian(pedestrianId)!;
  assert.equal(final.state, 'WITHDRAWN');
  assert.equal(final.withdrawalReason, 'ROUTE_COMPLETE');
  assert.equal(final.crossingProgress, 1);
  assert.deepEqual(PEDESTRIAN_STATE_TRANSITIONS.WITHDRAWN, []);
  for (const state of PEDESTRIAN_STATES)
    for (const next of PEDESTRIAN_STATE_TRANSITIONS[state])
      assert.ok(PEDESTRIAN_STATES.includes(next as PedestrianState));
});

test('a waiting pedestrian who asserts is rewarded with a real yield opportunity', () => {
  const world = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
  const pedestrianId = targetPedestrianId(world);
  const events = driveApproach(world, pedestrianId, 900, 'YIELD');
  const decision = events.find(
    (event) => event.kind === 'CROSSING_DECIDED' && event.pedestrianId === pedestrianId,
  );
  assert.ok(decision && decision.kind === 'CROSSING_DECIDED');
  assert.equal(decision.decision, 'ASSERTED');
  assert.ok(decision.nearestTimeToConflictS !== null && decision.nearestTimeToConflictS > 0);
  const inspection = world.getInspection();
  assert.equal(inspection.counts.assertedCrossings, 1);
  assert.equal(inspection.counts.yieldedCrossings, 1);
  assert.equal(inspection.counts.yieldStopEvents, 1);
  assert.deepEqual(inspection.denominators.yieldRate, {
    id: 'YIELD_RATE',
    numerator: 1,
    denominator: 1,
    value: 1,
    status: 'OBSERVED',
    reason: null,
  });
  const conflict = world.getConflicts().find((entry) => entry.crosswalkId === target.crosswalkId)!;
  assert.equal(conflict.outcome, 'YIELDED');
  assert.ok(conflict.stopTick !== null);
  assert.ok(conflict.stopDistanceM !== null && conflict.stopDistanceM > 0);
  const stop = world.getStops().find((entry) => entry.crosswalkId === target.crosswalkId)!;
  assert.equal(stop.duringCrossing, true);
  assert.equal(stop.pedestrianId, pedestrianId);
  assert.equal(stop.tick, conflict.stopTick);
});

test('a crossing without a yield keeps the measurable near miss, not a fake yield', () => {
  const world = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
  const pedestrianId = targetPedestrianId(world);
  driveApproach(world, pedestrianId, 900, 'CONTINUE');
  const inspection = world.getInspection();
  assert.equal(inspection.counts.yieldedCrossings, 0);
  assert.equal(inspection.counts.crossingsWithoutYield, 1);
  assert.equal(inspection.counts.stopEvents, 0);
  assert.equal(inspection.denominators.yieldRate.numerator, 0);
  assert.equal(inspection.denominators.yieldRate.denominator, 1);
  assert.equal(inspection.denominators.yieldRate.value, 0);
  const conflict = world.getConflicts().find((entry) => entry.crosswalkId === target.crosswalkId)!;
  assert.equal(conflict.outcome, 'CROSSED_WITHOUT_YIELD');
  assert.equal(conflict.stopTick, null);
  assert.ok(conflict.minimumDistanceM < 1);
  assert.ok(conflict.maximumSpeedMps > 0);
  assert.equal(world.getPedestrian(pedestrianId)!.state, 'WITHDRAWN');
});

test('an authoritative contact withdraws the crossing instead of completing it', () => {
  const world = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
  const pedestrianId = targetPedestrianId(world);
  driveApproach(world, pedestrianId, 900, 'CONTACT');
  const inspection = world.getInspection();
  assert.equal(inspection.counts.collisions, 1);
  assert.equal(inspection.counts.crossingsInterrupted, 1);
  assert.equal(world.getPedestrian(pedestrianId)!.withdrawalReason, 'IMPACT');
  assert.equal(world.getCollisions()[0]!.state, 'CROSSING');
});

test('conflict facts are the observed distance, speed and derived times, not assumptions', () => {
  const world = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
  const pedestrianId = targetPedestrianId(world);
  let distance = 30,
    speed = 6;
  let observed: { distanceM: number; speedMps: number } | null = null;
  for (let tick = 0; tick < 900; tick += 1) {
    if (tick > 0) {
      const crossing = world.getPedestrian(pedestrianId)?.state === 'CROSSING';
      speed = crossing && distance <= 25 ? Math.max(0, speed - 8 * DT) : 6;
      distance -= speed * DT;
    }
    const vehicle = vehicleBefore(target, distance, speed);
    const projection = target.graph.projectOnLane(vehicle.laneId, {
      positionM: vehicle.positionM,
      access: 'CIVIL',
      maxHeightDifferenceM: 1.5,
    })!;
    world.step({ tick, vehicles: [vehicle], vehiclesComplete: true });
    const conflict = world.getConflicts().find((entry) => entry.crosswalkId === target.crosswalkId);
    if (conflict && observed === null) {
      observed = { distanceM: target.longitudinalM - projection.longitudinalM, speedMps: speed };
      assert.equal(conflict.tick, tick);
      assert.ok(Math.abs(conflict.distanceM - observed.distanceM) < 1e-6);
      assert.equal(conflict.speedMps, observed.speedMps);
      assert.ok(
        Math.abs(conflict.timeToConflictS! - observed.distanceM / observed.speedMps) < 1e-9,
      );
      const snapshot = world.getPedestrian(pedestrianId)!;
      assert.ok(
        Math.abs(conflict.crossingRemainingS - snapshot.crossingLengthM / snapshot.walkSpeedMps) <
          1e-9,
      );
      assert.equal(conflict.learningEligible, null);
    }
  }
  assert.ok(observed !== null);
});

test('counts never divide by an invented denominator', () => {
  const free = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
  driveFree(free, 1200);
  const inspection = free.getInspection();
  assert.equal(inspection.counts.conflictRecords, 0);
  assert.equal(inspection.counts.freeCrossings, inspection.counts.crossingsCompleted);
  assert.equal(inspection.denominators.yieldRate.status, 'MISSING');
  assert.equal(inspection.denominators.yieldRate.value, null);
  assert.equal(inspection.denominators.yieldRate.reason, 'NO_COMPLETE_CONFLICT_EPISODE');
  assert.ok(inspection.gaps.some((gap) => gap.id === 'NO_COMPLETE_CONFLICT_EPISODE'));
  assert.equal(
    inspection.counts.freeCrossings +
      inspection.counts.yieldedCrossings +
      inspection.counts.crossingsWithoutYield +
      inspection.counts.unobservedCrossings,
    inspection.counts.crossingsCompleted,
  );
  assert.equal(
    inspection.denominators.crossingCompletionRate.numerator,
    inspection.counts.crossingsCompleted,
  );
});

test('incomplete vehicle coverage produces a reported gap, never a free crossing', () => {
  const world = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
  const pedestrianId = targetPedestrianId(world);
  driveApproach(world, pedestrianId, 900, 'INCOMPLETE');
  const inspection = world.getInspection();
  assert.equal(inspection.coverage.incompleteSteps, inspection.coverage.steps);
  assert.equal(inspection.counts.freeCrossings, 0);
  assert.ok(inspection.counts.unobservedCrossings > 0);
  assert.ok(inspection.gaps.some((gap) => gap.id === 'INCOMPLETE_VEHICLE_COVERAGE'));
  assert.equal(inspection.denominators.yieldRate.status, 'MISSING');
});

test('stated capacity truncates creation but reports the missing pedestrians', () => {
  const world = createPedestrianWorld({ pedestriansPerCrosswalk: 2, maxPedestrians: 3 });
  const network = world.getNetwork();
  assert.equal(network.pedestriansCreated, 3);
  assert.equal(network.pedestriansRequested, 96);
  assert.equal(network.capacityTruncated, 93);
  assert.equal(world.getPedestrians().length, 3);
  assert.ok(world.getInspection().gaps.some((gap) => gap.id === 'PEDESTRIAN_CAPACITY_TRUNCATED'));
  assert.equal(world.getNetwork().links, 48);
  for (const link of world.getLinks()) {
    assert.ok(link.crossingLengthM > 0.5);
    assert.ok(link.laneIds.includes(link.referenceLaneId));
    assert.ok(link.laneLines.length > 0);
    assert.ok(link.headingRad === link.headingRad);
  }
});

test('crosswalks without derived sidewalks are refused with a closed reason', () => {
  const network = targetWorld.getNetwork();
  assert.equal(network.crosswalks, 80);
  assert.equal(network.links, 48);
  assert.equal(network.refusedLinks.length, 32);
  assert.deepEqual(
    [...new Set(network.refusedLinks.map((refused) => refused.reason))],
    ['NO_SIDEWALK'],
  );
  assert.ok(targetWorld.getInspection().gaps.some((gap) => gap.id === 'REFUSED_CROSSWALK_LINK'));
  assert.equal(network.lanesWithoutLine, 0);
});

test('a contact fact withdraws the pedestrian once and is not accepted twice', () => {
  const world = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
  const pedestrianId = targetPedestrianId(world);
  driveFree(world, 120);
  const contact = {
    vehicleId: 'vehicle-9',
    pedestrianId,
    tick: 120,
    positionM: { x: 0, y: 0, z: 0 },
    speedMps: 4,
  };
  world.step({ tick: 120, vehicles: [], vehiclesComplete: true, contacts: [contact] });
  assert.equal(world.getPedestrian(pedestrianId)!.withdrawalReason, 'IMPACT');
  assert.equal(world.getCollisions().length, 1);
  assert.equal(world.getCollisions()[0]!.state, 'CROSSING');
  assert.throws(
    () =>
      world.step({
        tick: 121,
        vehicles: [],
        vehiclesComplete: true,
        contacts: [{ ...contact, tick: 121 }],
      }),
    /withdrawn pedestrian/,
  );
});

test('invalid step input is refused explicitly instead of silently repaired', () => {
  const world = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
  const pedestrianId = targetPedestrianId(world);
  assert.throws(() => createPedestrianWorld({ seed: Number.NaN }), /finite number/);
  assert.throws(() => createPedestrianWorld({ seed: 1.5 }), /uint32/);
  assert.throws(() => createPedestrianWorld({ seed: 1, unknown: true } as never), /option/);
  assert.throws(
    () => createPedestrians(pedestrianMap(), pedestrianSession(), { seed: 1, maxStops: 0.5 }),
    /integers/,
  );
  world.step({ tick: 5, vehicles: [], vehiclesComplete: true });
  assert.throws(() => world.step({ tick: 5, vehicles: [], vehiclesComplete: true }), /Stale/);
  assert.throws(
    () => world.step({ tick: 6, vehicles: [], vehiclesComplete: true, extra: 1 } as never),
    /step field/,
  );
  assert.throws(
    () =>
      world.step({ tick: 6, vehicles: [], vehiclesComplete: true, missing: undefined } as never),
    /step field/,
  );
  const vehicle = vehicleBefore(target, 20, 6);
  assert.throws(
    () => world.step({ tick: 6, vehicles: [vehicle, vehicle], vehiclesComplete: true }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      world.step({
        tick: 6,
        vehicles: [{ ...vehicle, laneId: 'lane:absent' }],
        vehiclesComplete: true,
      }),
    /lane/,
  );
  assert.throws(
    () =>
      world.step({
        tick: 6,
        vehicles: [{ ...vehicle, observable: 'yes' } as never],
        vehiclesComplete: true,
      }),
    /boolean/,
  );
  assert.throws(
    () =>
      world.step({
        tick: 6,
        vehicles: [],
        vehiclesComplete: true,
        contacts: [
          { vehicleId: 'v', pedestrianId, tick: 9, positionM: vehicle.positionM, speedMps: 3 },
        ],
      }),
    /belong to this step/,
  );
  assert.throws(
    () =>
      world.step({
        tick: 6,
        vehicles: [],
        vehiclesComplete: true,
        contacts: [
          {
            vehicleId: 'v',
            pedestrianId: 'absent',
            tick: 6,
            positionM: vehicle.positionM,
            speedMps: 3,
          },
        ],
      }),
    /unknown pedestrian/,
  );
});

test('published state is frozen and dispose is final', () => {
  const world = createPedestrianWorld({ pedestriansPerCrosswalk: 1 });
  driveFree(world, 200);
  const snapshot = world.getPedestrians()[0]!;
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.positionM));
  assert.throws(() => {
    (snapshot as { state: string }).state = 'CROSSING';
  }, TypeError);
  world.dispose();
  assert.equal(world.getStats().disposed, true);
  assert.throws(() => world.step({ tick: 500, vehicles: [], vehiclesComplete: true }), /disposed/);
});

test('lane sampling used by the fixture matches the directed lane geometry', () => {
  const pose = lanePose(target.graph, target.laneId, target.longitudinalM);
  assert.ok(Math.abs(pose.laneLengthM - target.laneLengthM) < 1e-9);
  const projection = target.graph.projectOnLane(target.laneId, {
    positionM: pose.positionM,
    access: 'CIVIL',
    maxHeightDifferenceM: 1.5,
  })!;
  assert.ok(Math.abs(projection.longitudinalM - target.longitudinalM) < 1e-6);
  assert.ok(Math.abs(Math.abs(pose.headingRad) - Math.PI) < 0.1);
});
