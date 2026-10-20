import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  ETA_DEFAULTS,
  ETA_LIMITS,
  ETA_UNAVAILABLE_REASONS,
  ETA_UNCERTAINTY,
  RIDE_ETA_VERSION,
  createRideEta,
} from '../../src/fleet';
import type { EtaSnapshot } from '../../src/fleet';
import {
  adjacentRouteLane,
  createEtaWorld,
  createStubEta,
  disposeEtaWorld,
  etaObservation,
  gapMidpoint,
  laneEnd,
  laneMidpoint,
  laneStart,
  rideOf,
  stubObservation,
} from './eta-fixture';
import { runEtaReport } from './eta-report';

const SOURCE = join(process.cwd(), 'src', 'fleet', 'eta.ts');
const EVIDENCE = join(process.cwd(), 'Docs', 'Evidence', '064-eta', 'report.json');

function throws(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

function close(left: number, right: number, epsilon = 1e-9): boolean {
  return Math.abs(left - right) <= epsilon;
}

test('064 estimates the remaining real 041 route and publishes documented bounds', () => {
  const world = createEtaWorld(),
    ride = rideOf(world),
    route = world.routeLaneIds,
    start = world.eta.observe(etaObservation(world)),
    progress: EtaSnapshot[] = [];
  assert.equal(start.status, 'ESTIMATED');
  assert.equal(start.reason, null);
  assert.equal(start.leg, 'PICKUP');
  assert.equal(start.state, 'TO_PICKUP');
  assert.equal(start.serviceState, 'FREE_FLOW');
  assert.deepEqual(start.routeLaneIds, route);
  assert.equal(start.laneCount, route.length);
  assert.ok(start.totalDistanceM !== null && start.totalDistanceM > 0);
  assert.ok(start.traveledDistanceM !== null && close(start.traveledDistanceM, 0));
  assert.ok(start.plannedSpeedMps !== null && start.plannedSpeedMps > 0);
  assert.ok(close(start.speedBasisMps!, start.plannedSpeedMps!));
  // The whole free-flow route reproduces the real 041 leg cost exactly.
  assert.ok(close(start.plannedRemainingSeconds!, ride.pickupCostSeconds));
  assert.ok(close(start.etaSeconds!, ride.pickupCostSeconds));
  assert.ok(start.etaMinSeconds !== null && start.etaMinSeconds < start.etaSeconds!);
  assert.ok(start.etaMaxSeconds !== null && start.etaSeconds! < start.etaMaxSeconds);
  assert.equal(start.reprojected, false);
  assert.equal(start.stale, false);

  for (const laneId of route) {
    progress.push(
      world.eta.observe(
        etaObservation(world, {
          tick: (progress.at(-1)?.tick ?? world.startTick) + 1,
          positionM: laneMidpoint(world, laneId),
        }),
      ),
    );
  }
  for (let index = 1; index < progress.length; index += 1) {
    const previous = progress[index - 1]!,
      current = progress[index]!;
    assert.equal(current.status, 'ESTIMATED');
    assert.ok(current.progressFraction! > previous.progressFraction!);
    assert.ok(current.remainingDistanceM! < previous.remainingDistanceM!);
    assert.ok(current.etaSeconds! < previous.etaSeconds!);
    assert.ok(current.etaSeconds! >= current.etaMinSeconds!);
    assert.ok(current.etaSeconds! <= current.etaMaxSeconds!);
  }
  const last = route[route.length - 1]!,
    arrived = world.eta.observe(
      etaObservation(world, {
        tick: progress.at(-1)!.tick + 1,
        positionM: laneEnd(world, last),
      }),
    );
  assert.equal(arrived.status, 'ARRIVED');
  assert.equal(arrived.reason, null);
  assert.ok(close(arrived.progressFraction!, 1));
  assert.ok(close(arrived.remainingDistanceM!, 0));
  assert.ok(close(arrived.etaSeconds!, 0));
  assert.ok(close(arrived.etaMinSeconds!, 0));
  assert.ok(close(arrived.etaMaxSeconds!, 0));
  assert.equal(world.eta.stats().estimated, progress.length + 1);
  assert.equal(world.eta.stats().arrived, 1);
  assert.equal(world.eta.stats().routeLoads, 1);
  disposeEtaWorld(world);
});

test('064 ETA follows the remaining route instead of the whole leg cost', () => {
  const world = createEtaWorld(),
    route = world.routeLaneIds,
    full = world.eta.observe(etaObservation(world)),
    lastLane = route[route.length - 1]!,
    nearEnd = world.eta.observe(
      etaObservation(world, {
        tick: world.startTick + 1,
        positionM: laneMidpoint(world, lastLane),
      }),
    );
  assert.ok(close(full.etaSeconds!, rideOf(world).pickupCostSeconds));
  // A near-end estimate must be a small fraction of the full leg; an implementation that always
  // returns the leg cost (or the total route time) fails here.
  assert.ok(nearEnd.etaSeconds! < full.etaSeconds! * 0.25);
  assert.ok(nearEnd.remainingDistanceM! < full.remainingDistanceM! * 0.15);
  assert.ok(nearEnd.progressFraction! > 0.85);
  assert.ok(nearEnd.etaSeconds! > 0);
  disposeEtaWorld(world);
});

test('064 certified progress never moves backwards, even for a backward observation', () => {
  const world = createEtaWorld(),
    route = world.routeLaneIds,
    forward = world.eta.observe(
      etaObservation(world, { tick: world.startTick, positionM: laneMidpoint(world, route[2]!) }),
    ),
    repeat = world.eta.observe(
      etaObservation(world, {
        tick: world.startTick + 1,
        positionM: laneMidpoint(world, route[2]!),
      }),
    );
  assert.equal(forward.status, 'ESTIMATED');
  assert.ok(close(repeat.progressFraction!, forward.progressFraction!));
  assert.ok(close(repeat.etaSeconds!, forward.etaSeconds!));
  const backward = world.eta.observe(
    etaObservation(world, { tick: world.startTick + 2, positionM: laneMidpoint(world, route[0]!) }),
  );
  assert.equal(backward.status, 'UNAVAILABLE');
  assert.equal(backward.reason, 'OFF_ROUTE');
  assert.equal(backward.etaSeconds, null);
  assert.ok(close(backward.traveledDistanceM!, forward.traveledDistanceM!));
  assert.ok(close(backward.progressFraction!, forward.progressFraction!));
  const ahead = world.eta.observe(
    etaObservation(world, { tick: world.startTick + 3, positionM: laneMidpoint(world, route[3]!) }),
  );
  assert.equal(ahead.status, 'ESTIMATED');
  assert.ok(ahead.progressFraction! > forward.progressFraction!);
  disposeEtaWorld(world);
});

test('064 reprojects an adjacent lane or intersection gap onto the current route segment', () => {
  const parallelWorld = createEtaWorld(),
    adjacentInfo = adjacentRouteLane(parallelWorld),
    parallel = parallelWorld.eta.observe(
      etaObservation(parallelWorld, {
        positionM: laneMidpoint(parallelWorld, adjacentInfo.adjacentId),
      }),
    );
  assert.equal(parallel.status, 'ESTIMATED');
  assert.equal(parallel.reason, null);
  assert.equal(parallel.reprojected, true);
  assert.equal(parallel.offRouteDistanceM !== null, true);
  assert.ok(parallel.offRouteDistanceM! > 3 && parallel.offRouteDistanceM! <= 4);
  assert.equal(parallel.segmentIndex, adjacentInfo.index);
  assert.equal(parallel.segmentLaneId, adjacentInfo.laneId);
  assert.ok(parallel.progressFraction! > 0);
  assert.equal(parallel.etaSeconds !== null, true);
  disposeEtaWorld(parallelWorld);

  const gapWorld = createEtaWorld(),
    gap = gapWorld.eta.observe(
      etaObservation(gapWorld, { positionM: gapMidpoint(gapWorld, gapWorld.routeLaneIds) }),
    );
  assert.equal(gap.status, 'ESTIMATED');
  assert.equal(gap.reprojected, true);
  assert.equal(gap.segmentKind, 'CONNECTION');
  assert.equal(gap.segmentIndex, 1);
  assert.equal(gap.segmentLaneId, gapWorld.routeLaneIds[1]);
  assert.ok(close(gap.segmentProgressFraction!, 0));
  assert.ok(gap.offRouteDistanceM! < 0.01);
  assert.ok(gap.progressFraction! > 0 && gap.progressFraction! < 0.25);
  // The gap itself carries distance but no planned cost, so its ETA equals the next lane start.
  disposeEtaWorld(gapWorld);
});

test('064 refuses an off-route position instead of snapping it to the wrong segment', () => {
  const world = createEtaWorld(),
    route = world.routeLaneIds,
    committed = world.eta.observe(
      etaObservation(world, {
        tick: world.startTick,
        positionM: laneMidpoint(world, route[route.length - 1]!),
      }),
    ),
    unrelated = world.eta.observe(
      etaObservation(world, {
        tick: world.startTick + 1,
        positionM: laneMidpoint(world, route[0]!),
      }),
    );
  assert.equal(committed.status, 'ESTIMATED');
  assert.equal(unrelated.status, 'UNAVAILABLE');
  assert.equal(unrelated.reason, 'OFF_ROUTE');
  assert.equal(unrelated.etaSeconds, null);
  assert.ok(close(unrelated.traveledDistanceM!, committed.traveledDistanceM!));
  assert.ok(close(unrelated.progressFraction!, committed.progressFraction!));
  const outside = world.eta.observe(
    etaObservation(world, {
      tick: world.startTick + 2,
      positionM: { x: 10_000, y: 0, z: 10_000 },
    }),
  );
  assert.equal(outside.status, 'UNAVAILABLE');
  assert.equal(outside.reason, 'POSITION_INVALID');
  assert.equal(outside.etaSeconds, null);
  assert.ok(close(outside.traveledDistanceM!, committed.traveledDistanceM!));
  disposeEtaWorld(world);
});

test('064 never reports a missing route as a certain zero-second ETA', () => {
  const stub = createStubEta({ pickupRouteLaneIds: [] });
  const snapshot = stub.eta.observe(stubObservation(stub, { x: 0, y: 0, z: 0 }));
  assert.equal(snapshot.status, 'UNAVAILABLE');
  assert.equal(snapshot.reason, 'ROUTE_MISSING');
  assert.equal(snapshot.etaSeconds, null);
  assert.equal(snapshot.etaMinSeconds, null);
  assert.equal(snapshot.etaMaxSeconds, null);
  assert.equal(snapshot.remainingDistanceM, null);
  assert.equal(snapshot.progressFraction, null);
  assert.equal(snapshot.totalDistanceM, null);
  assert.equal(snapshot.stale, false);
  assert.equal(stub.eta.stats().byReason.ROUTE_MISSING, 1);
  stub.dispose();

  const unknownLane = createStubEta({ pickupRouteLaneIds: ['lane:missing'] });
  const unknown = unknownLane.eta.observe(stubObservation(unknownLane, { x: 0, y: 0, z: 0 }));
  assert.equal(unknown.status, 'UNAVAILABLE');
  assert.equal(unknown.reason, 'ROUTE_MISSING');
  assert.equal(unknown.etaSeconds, null);
  unknownLane.dispose();

  const invalidCost = createStubEta({ pickupCostSeconds: -1 });
  const invalid = invalidCost.eta.observe(stubObservation(invalidCost, { x: 0, y: 0, z: 0 }));
  assert.equal(invalid.status, 'UNAVAILABLE');
  assert.equal(invalid.reason, 'ROUTE_INVALID');
  assert.equal(invalid.etaSeconds, null);
  invalidCost.dispose();

  const disconnected = createStubEta({ pickupRouteLaneIds: ['lane:30S0', 'lane:10E0'] });
  const broken = disconnected.eta.observe(stubObservation(disconnected, { x: 0, y: 0, z: 0 }));
  assert.equal(broken.status, 'UNAVAILABLE');
  assert.equal(broken.reason, 'ROUTE_STALE');
  assert.equal(broken.stale, true);
  assert.equal(broken.etaSeconds, null);
  disconnected.dispose();
});

test('064 refuses a stale route after a replan instead of reusing the old path', () => {
  const world = createEtaWorld(),
    route = world.routeLaneIds,
    before = world.eta.observe(
      etaObservation(world, { positionM: laneMidpoint(world, route[1]!) }),
    );
  assert.equal(before.status, 'ESTIMATED');
  world.rideWorld.dispatcherWorld.planner.setBlocked([route[2]!]);
  const stale = world.eta.observe(
    etaObservation(world, {
      tick: world.startTick + 1,
      positionM: laneMidpoint(world, route[2]!),
    }),
  );
  assert.equal(stale.status, 'UNAVAILABLE');
  assert.equal(stale.reason, 'ROUTE_STALE');
  assert.equal(stale.stale, true);
  assert.equal(stale.etaSeconds, null);
  assert.equal(stale.remainingDistanceM, null);
  assert.equal(stale.progressFraction, null);
  world.rideWorld.dispatcherWorld.planner.setBlocked([]);
  const recovered = world.eta.observe(
    etaObservation(world, {
      tick: world.startTick + 2,
      positionM: laneMidpoint(world, route[2]!),
    }),
  );
  assert.equal(recovered.status, 'ESTIMATED');
  assert.equal(recovered.reason, null);
  assert.ok(recovered.progressFraction! >= before.progressFraction!);
  disposeEtaWorld(world);

  // An estimate created after the route inputs changed must not trust the old stored path either.
  const late = createEtaWorld(),
    lateRoute = late.routeLaneIds;
  late.rideWorld.dispatcherWorld.planner.setBlocked([lateRoute[2]!]);
  const lateEta = createRideEta({
    lifecycle: late.rideWorld.lifecycle,
    graph: late.rideWorld.dispatcherWorld.graph,
    planner: late.rideWorld.dispatcherWorld.planner,
  });
  const lateSnapshot = lateEta.observe(etaObservation(late, { tick: 11 }));
  assert.equal(lateSnapshot.status, 'UNAVAILABLE');
  assert.equal(lateSnapshot.reason, 'ROUTE_STALE');
  assert.equal(lateSnapshot.etaSeconds, null);
  lateEta.dispose();
  disposeEtaWorld(late);
});

test('064 reflects free flow, congestion and a blocked service in the estimate', () => {
  const world = createEtaWorld(),
    route = world.routeLaneIds,
    positionM = laneMidpoint(world, route[1]!),
    free = world.eta.observe(etaObservation(world, { tick: world.startTick, positionM }));
  world.eta.setServiceState('CONGESTED');
  const congested = world.eta.observe(
    etaObservation(world, { tick: world.startTick + 1, positionM }),
  );
  assert.equal(congested.status, 'ESTIMATED');
  assert.equal(congested.serviceState, 'CONGESTED');
  assert.ok(congested.etaSeconds! > free.etaSeconds! * 1.9);
  assert.ok(congested.etaSeconds! < free.etaSeconds! * 2.1);
  assert.ok(close(congested.speedBasisMps!, free.plannedSpeedMps! * 0.5));
  assert.ok(congested.etaMinSeconds! < congested.etaSeconds!);
  assert.ok(congested.etaSeconds! < congested.etaMaxSeconds!);
  world.eta.setServiceState('BLOCKED');
  const blocked = world.eta.observe(
    etaObservation(world, { tick: world.startTick + 2, positionM: laneMidpoint(world, route[2]!) }),
  );
  assert.equal(blocked.status, 'UNAVAILABLE');
  assert.equal(blocked.reason, 'SERVICE_BLOCKED');
  assert.equal(blocked.etaSeconds, null);
  assert.equal(blocked.speedBasisMps, null);
  assert.equal(blocked.progressFraction !== null, true);
  assert.ok(blocked.progressFraction! > congested.progressFraction!);
  world.eta.setServiceState('FREE_FLOW');
  const restored = world.eta.observe(
    etaObservation(world, { tick: world.startTick + 3, positionM: laneMidpoint(world, route[3]!) }),
  );
  assert.equal(restored.status, 'ESTIMATED');
  assert.equal(restored.etaSeconds !== null, true);
  disposeEtaWorld(world);
});

test('064 handles arrival and terminal rides without inventing a trip estimate', () => {
  const pickupWorld = createEtaWorld(),
    pickupRide = rideOf(pickupWorld);
  pickupWorld.rideWorld.lifecycle.apply({
    rideId: pickupRide.rideId,
    eventId: 'arrived:pickup',
    event: 'ARRIVED_PICKUP',
    tick: 20,
  });
  const atPickup = pickupWorld.eta.observe(etaObservation(pickupWorld, { tick: 20 }));
  assert.equal(atPickup.status, 'ARRIVED');
  assert.equal(atPickup.leg, 'PICKUP');
  assert.equal(atPickup.state, 'PICKUP');
  assert.ok(close(atPickup.etaSeconds!, 0));
  assert.ok(close(atPickup.remainingDistanceM!, 0));
  assert.ok(close(atPickup.progressFraction!, 1));
  disposeEtaWorld(pickupWorld);

  const dropoffWorld = createEtaWorld({ boarded: true }),
    dropoffRide = rideOf(dropoffWorld);
  dropoffWorld.rideWorld.lifecycle.apply({
    rideId: dropoffRide.rideId,
    eventId: 'arrived:dropoff',
    event: 'ARRIVED_DROPOFF',
    tick: 30,
  });
  const atDropoff = dropoffWorld.eta.observe(
    etaObservation(dropoffWorld, {
      tick: 30,
      positionM: laneStart(dropoffWorld, dropoffWorld.routeLaneIds[0]!),
    }),
  );
  assert.equal(atDropoff.status, 'ARRIVED');
  assert.equal(atDropoff.leg, 'TRIP');
  assert.equal(atDropoff.state, 'DROPOFF');
  assert.ok(close(atDropoff.etaSeconds!, 0));
  disposeEtaWorld(dropoffWorld);

  const terminalWorld = createEtaWorld({ boarded: true }),
    terminalRide = rideOf(terminalWorld);
  terminalWorld.rideWorld.lifecycle.apply({
    rideId: terminalRide.rideId,
    eventId: 'arrived:terminal-dropoff',
    event: 'ARRIVED_DROPOFF',
    tick: 30,
  });
  terminalWorld.rideWorld.lifecycle.apply({
    rideId: terminalRide.rideId,
    eventId: 'complete:terminal',
    event: 'DROPOFF_COMPLETE',
    tick: 31,
  });
  const terminal = terminalWorld.eta.observe(
    etaObservation(terminalWorld, {
      tick: 31,
      positionM: laneStart(terminalWorld, terminalWorld.routeLaneIds[0]!),
    }),
  );
  assert.equal(terminal.status, 'UNAVAILABLE');
  assert.equal(terminal.reason, 'RIDE_TERMINAL');
  assert.equal(terminal.etaSeconds, null);
  assert.equal(terminal.state, 'COMPLETED');
  disposeEtaWorld(terminalWorld);

  const wrongWorld = createEtaWorld();
  assert.equal(
    wrongWorld.eta.observe(etaObservation(wrongWorld, { rideId: 'ride:unknown' })).reason,
    'WRONG_RIDE',
  );
  assert.equal(
    wrongWorld.eta.observe(etaObservation(wrongWorld, { taxiId: 'taxi:foreign' })).reason,
    'FOREIGN_VEHICLE',
  );
  disposeEtaWorld(wrongWorld);
});

test('064 validates speed, position and tick instead of estimating from bad input', () => {
  const world = createEtaWorld(),
    base = etaObservation(world);
  assert.ok(throws(() => world.eta.observe({ ...base, speedMps: Number.NaN }), /range/));
  assert.ok(throws(() => world.eta.observe({ ...base, speedMps: -1 }), /range/));
  assert.ok(
    throws(() => world.eta.observe({ ...base, speedMps: Number.POSITIVE_INFINITY }), /range/),
  );
  assert.ok(
    throws(() => world.eta.observe({ ...base, positionM: { x: Number.NaN, y: 0, z: 0 } }), /range/),
  );
  assert.ok(throws(() => world.eta.observe({ ...base, tick: 1.5 }), /integer/));
  assert.ok(
    throws(() => world.eta.observe({ ...base, extra: true }), /Unknown eta observation field/),
  );
  const accepted = world.eta.observe({ ...base, tick: world.startTick + 10 });
  assert.equal(accepted.status, 'ESTIMATED');
  const stale = world.eta.observe({ ...base, tick: world.startTick + 9 });
  assert.equal(stale.status, 'UNAVAILABLE');
  assert.equal(stale.reason, 'STALE_TICK');
  assert.equal(stale.etaSeconds, null);
  assert.equal(world.eta.currentTick(), world.startTick + 10);
  world.rideWorld.lifecycle.advance(world.startTick + 100);
  const afterAdvance = world.eta.observe({ ...base, tick: world.startTick + 99 });
  assert.equal(afterAdvance.reason, 'STALE_TICK');
  disposeEtaWorld(world);
});

test('064 is pure, deterministic and disposes every owned structure', () => {
  const source = readFileSync(SOURCE, 'utf8');
  assert.equal(
    /\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/.test(
      source,
    ),
    false,
  );
  assert.equal(
    /\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/.test(source),
    false,
  );
  const run = (): readonly EtaSnapshot[] => {
    const world = createEtaWorld(),
      route = world.routeLaneIds,
      snapshots: EtaSnapshot[] = [];
    for (let index = 0; index < route.length; index += 1)
      snapshots.push(
        world.eta.observe(
          etaObservation(world, {
            tick: world.startTick + index,
            positionM: laneMidpoint(world, route[index]!),
          }),
        ),
      );
    world.eta.dispose();
    disposeEtaWorld(world);
    return Object.freeze(snapshots);
  };
  assert.deepEqual(run(), run());

  const world = createEtaWorld();
  world.eta.observe(etaObservation(world));
  world.eta.dispose();
  world.eta.dispose();
  const stats = world.eta.stats();
  assert.equal(stats.disposed, true);
  assert.equal(stats.observations, 0);
  assert.equal(stats.estimated, 0);
  assert.equal(stats.routeLoads, 0);
  assert.equal(world.eta.currentTick(), 0);
  assert.deepEqual(world.eta.estimates(), []);
  assert.equal(world.eta.estimate(world.rideId), undefined);
  assert.ok(throws(() => world.eta.observe(etaObservation(world)), /disposed/));
  assert.ok(throws(() => world.eta.setServiceState('FREE_FLOW'), /disposed/));
  disposeEtaWorld(world);
});

test('064 keeps the versioned contract and bounded defaults', () => {
  assert.equal(RIDE_ETA_VERSION, '064-eta-v1');
  assert.equal(ETA_LIMITS.rides, 64);
  assert.equal(ETA_LIMITS.routeLanes, 256);
  assert.ok(ETA_LIMITS.reprojectionLanes >= 1);
  assert.ok(ETA_LIMITS.reprojectionLanes <= ETA_LIMITS.maximumReprojectionLanes);
  assert.equal(ETA_DEFAULTS.tickRateHz, 60);
  assert.equal(ETA_DEFAULTS.offRouteToleranceM, 4);
  assert.equal(ETA_DEFAULTS.reprojectionLanes, ETA_LIMITS.reprojectionLanes);
  assert.deepEqual(
    [...ETA_UNAVAILABLE_REASONS],
    [
      'ROUTE_MISSING',
      'ROUTE_STALE',
      'ROUTE_INVALID',
      'POSITION_INVALID',
      'OFF_ROUTE',
      'SERVICE_BLOCKED',
      'STALE_TICK',
      'WRONG_RIDE',
      'FOREIGN_VEHICLE',
      'RIDE_TERMINAL',
    ],
  );
  assert.deepEqual(ETA_UNCERTAINTY.FREE_FLOW, {
    nominalSpeedFactor: 1,
    minSpeedFactor: 0.9,
    maxSpeedFactor: 1.1,
  });
  assert.deepEqual(ETA_UNCERTAINTY.CONGESTED, {
    nominalSpeedFactor: 0.5,
    minSpeedFactor: 0.35,
    maxSpeedFactor: 0.65,
  });
  assert.equal(ETA_UNCERTAINTY.BLOCKED, null);
  const world = createEtaWorld(),
    base = {
      lifecycle: world.rideWorld.lifecycle,
      graph: world.rideWorld.dispatcherWorld.graph,
      planner: world.rideWorld.dispatcherWorld.planner,
    };
  assert.ok(throws(() => createRideEta({}), /lifecycle/));
  assert.ok(throws(() => createRideEta({ ...base, extra: true }), /Unknown ride eta option/));
  assert.ok(throws(() => createRideEta({ ...base, tickRateHz: 0 }), /range/));
  assert.ok(throws(() => createRideEta({ ...base, reprojectionLanes: 0 }), /range/));
  assert.ok(throws(() => createRideEta({ ...base, serviceState: 'BOGUS' }), /service state/));
  assert.ok(throws(() => world.eta.setServiceState('BOGUS'), /service state/));
  disposeEtaWorld(world);
});

test('064 committed evidence report is the current eta transcript', () => {
  const report = runEtaReport(),
    saved = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as ReturnType<typeof runEtaReport>;
  assert.deepEqual(saved, JSON.parse(JSON.stringify(report)) as ReturnType<typeof runEtaReport>);
});
