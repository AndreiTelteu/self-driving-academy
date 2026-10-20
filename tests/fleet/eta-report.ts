import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ETA_DEFAULTS,
  ETA_LIMITS,
  ETA_UNAVAILABLE_REASONS,
  ETA_UNCERTAINTY,
  RIDE_ETA_VERSION,
  createRideDropoff,
  createRideEta,
  createRideLifecycle,
  createRidePickup,
} from '../../src/fleet';
import type { DropoffDecision, EtaPoint, PickupDecision, RideState } from '../../src/fleet';
import type { LaneGraph } from '../../src/world';
import { createDispatcherWorld, fixedWindow } from './dispatcher-fixture';
import {
  adjacentLane,
  adjacentRouteLane,
  createEtaWorld,
  createStubEta,
  disposeEtaWorld,
  etaObservation,
  gapMidpoint,
  laneMidpoint,
  laneStart,
  rideOf,
  stubObservation,
} from './eta-fixture';

export interface EtaReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

interface SimulationRide {
  readonly requestId: string;
  readonly taxiId: string;
  readonly pickupSamples: number;
  readonly tripSamples: number;
  readonly state: RideState;
  readonly events: readonly string[];
}

interface Simulation {
  readonly requests: number;
  readonly assignments: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly active: number;
  readonly samples: number;
  readonly pickupSamples: number;
  readonly tripSamples: number;
  readonly monotonicViolations: number;
  readonly etaViolations: number;
  readonly offRoute: number;
  readonly unavailable: number;
  readonly arrived: number;
  readonly zeroCostSamples: number;
  readonly byReason: Readonly<Record<string, number>>;
  readonly routeLoads: number;
  readonly minEta: number;
  readonly maxEta: number;
  readonly rides: readonly SimulationRide[];
}

export interface EtaReport {
  readonly version: typeof RIDE_ETA_VERSION;
  readonly generatedBy: 'npm run ride:eta';
  readonly oracleRule: string;
  readonly defaults: typeof ETA_DEFAULTS;
  readonly limits: typeof ETA_LIMITS;
  readonly uncertainty: typeof ETA_UNCERTAINTY;
  readonly fleet: Readonly<{ taxis: number; civilians: number; requests: number }>;
  readonly routeBasis: Readonly<{
    routeLaneIds: readonly string[];
    totalDistanceM: number;
    plannedSpeedMps: number;
    pickupCostSeconds: number;
    plannedRemainingSeconds: number;
    etaSeconds: number;
    etaMinSeconds: number;
    etaMaxSeconds: number;
    boundsOrdered: boolean;
    initialProgress: number;
  }>;
  readonly remainingRoute: Readonly<{
    fullEtaSeconds: number;
    nearEndEtaSeconds: number;
    nearEndProgress: number;
    nearEndRatio: number;
    samples: number;
  }>;
  readonly monotonic: Readonly<{
    progressBefore: number;
    progressAfterBackward: number;
    backwardReason: string | null;
    backwardEta: number | null;
    forwardProgress: number;
    noRewind: boolean;
    etaAfterBackward: number | null;
  }>;
  readonly reprojection: Readonly<{
    adjacentLaneId: string | null;
    adjacentDistanceM: number;
    adjacentStatus: string;
    adjacentSegmentIndex: number;
    adjacentSegmentLaneId: string | null;
    adjacentReprojected: boolean;
    gapStatus: string;
    gapKind: string | null;
    gapSegmentIndex: number;
    gapSegmentLaneId: string | null;
    gapOffRouteDistanceM: number;
    gapReprojected: boolean;
    gapProgress: number;
    gapEta: number | null;
  }>;
  readonly antiSnap: Readonly<{
    reason: string | null;
    progressBefore: number;
    progressAfter: number;
    progressPreserved: boolean;
    etaSeconds: number | null;
    offRouteDistanceM: number | null;
  }>;
  readonly missingRoute: Readonly<{
    status: string;
    reason: string | null;
    etaSeconds: number | null;
    remainingDistanceM: number | null;
    progressFraction: number | null;
    routeLaneIds: readonly string[] | null;
  }>;
  readonly invalidRoutes: Readonly<{
    negativeCostReason: string | null;
    negativeCostEta: number | null;
    disconnectedReason: string | null;
    disconnectedStale: boolean;
    disconnectedEta: number | null;
  }>;
  readonly staleRoute: Readonly<{
    beforeStatus: string;
    afterReason: string | null;
    afterEta: number | null;
    afterRemaining: number | null;
    staleFlag: boolean;
    recoveredStatus: string;
    recoveredProgress: number;
    beforeProgress: number;
    lateCreatedReason: string | null;
    lateCreatedEta: number | null;
  }>;
  readonly service: Readonly<{
    freeEtaSeconds: number;
    congestedEtaSeconds: number;
    congestedRatio: number;
    congestedMinSeconds: number;
    congestedMaxSeconds: number;
    blockedReason: string | null;
    blockedEta: number | null;
    blockedProgress: number;
    congestedProgress: number;
    restoredEtaSeconds: number;
  }>;
  readonly reroute: Readonly<{
    freeRouteLaneIds: readonly string[];
    replannedRouteLaneIds: readonly string[];
    routeDiffers: boolean;
    freeTripCostSeconds: number;
    replannedTripCostSeconds: number;
    freeEtaSeconds: number;
    replannedEtaSeconds: number;
    oldRouteAfterReplanReason: string | null;
    oldRouteAfterReplanEta: number | null;
  }>;
  readonly arrivals: Readonly<{
    pickupStatus: string;
    pickupEta: number | null;
    dropoffStatus: string;
    dropoffEta: number | null;
    terminalReason: string | null;
    terminalEta: number | null;
    terminalState: RideState | null;
  }>;
  readonly validation: Readonly<{
    nanSpeed: boolean;
    negativeSpeed: boolean;
    infiniteSpeed: boolean;
    nanPosition: boolean;
    staleTick: boolean;
    staleTickReason: string | null;
    unknownField: boolean;
    wrongRide: string | null;
    foreignVehicle: string | null;
  }>;
  readonly simulation: Simulation;
  readonly disposal: Readonly<{
    disposed: boolean;
    observations: number;
    estimated: number;
    arrived: number;
    unavailable: number;
    tick: number;
    routeLoads: number;
    releaseReason: string | null;
    state: RideState | null;
  }>;
  readonly determinism: Readonly<{ identical: boolean; rides: number }>;
  readonly checks: readonly EtaReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(name: string, expected: unknown, actual: unknown, detail: string): EtaReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function truthy(name: string, actual: boolean, detail: string): EtaReportCheck {
  return check(name, true, actual, detail);
}

function throws(action: () => unknown, pattern: RegExp): boolean {
  try {
    action();
    return false;
  } catch (error) {
    return error instanceof Error && pattern.test(error.message);
  }
}

function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function midpoint(graph: LaneGraph, laneId: string): EtaPoint {
  const path = graph.getDirectedPath(laneId);
  if (path === null) throw new Error(`Report lane is missing: ${laneId}`);
  const point = path.points[Math.floor((path.points.length - 1) / 2)]!;
  return Object.freeze({ x: point.x, y: point.y, z: point.z });
}

function pointAt(graph: LaneGraph, laneId: string, index: 'START' | 'END'): EtaPoint {
  const path = graph.getDirectedPath(laneId);
  if (path === null) throw new Error(`Report lane is missing: ${laneId}`);
  const point = index === 'START' ? path.points[0]! : path.points[path.points.length - 1]!;
  return Object.freeze({ x: point.x, y: point.y, z: point.z });
}

function zoneCenter(
  map: ReturnType<typeof createDispatcherWorld>['map'],
  zoneId: string,
): EtaPoint {
  const zone = map.serviceZones.find((entry) => entry.id === zoneId);
  if (zone === undefined) throw new Error(`Report zone is missing: ${zoneId}`);
  const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM])),
    area = map.geometry.areas.find((entry) => entry.id === zone.geometryId);
  if (area === undefined) throw new Error(`Report zone area is missing: ${zone.geometryId}`);
  let x = 0,
    y = 0,
    z = 0;
  for (const nodeId of area.vertexNodeIds) {
    const position = nodes.get(nodeId);
    if (position === undefined) throw new Error(`Report zone vertex is missing: ${nodeId}`);
    x += position.x;
    y += position.y;
    z += position.z;
  }
  const count = area.vertexNodeIds.length;
  return Object.freeze({ x: x / count, y: y / count, z: z / count });
}

function routeBasisProbe(): EtaReport['routeBasis'] {
  const world = createEtaWorld(),
    ride = rideOf(world),
    snapshot = world.eta.observe(etaObservation(world));
  if (
    snapshot.routeLaneIds === null ||
    snapshot.totalDistanceM === null ||
    snapshot.plannedSpeedMps === null ||
    snapshot.plannedRemainingSeconds === null ||
    snapshot.etaSeconds === null ||
    snapshot.etaMinSeconds === null ||
    snapshot.etaMaxSeconds === null
  )
    throw new Error('Route basis probe is not estimable');
  const report = {
    routeLaneIds: snapshot.routeLaneIds,
    totalDistanceM: round(snapshot.totalDistanceM),
    plannedSpeedMps: round(snapshot.plannedSpeedMps),
    pickupCostSeconds: round(ride.pickupCostSeconds),
    plannedRemainingSeconds: round(snapshot.plannedRemainingSeconds),
    etaSeconds: round(snapshot.etaSeconds),
    etaMinSeconds: round(snapshot.etaMinSeconds),
    etaMaxSeconds: round(snapshot.etaMaxSeconds),
    boundsOrdered:
      snapshot.etaMinSeconds < snapshot.etaSeconds && snapshot.etaSeconds < snapshot.etaMaxSeconds,
    initialProgress: round(snapshot.progressFraction ?? Number.NaN),
  };
  disposeEtaWorld(world);
  return Object.freeze(report);
}

function remainingRouteProbe(): EtaReport['remainingRoute'] {
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
  if (full.etaSeconds === null || nearEnd.etaSeconds === null || nearEnd.progressFraction === null)
    throw new Error('Remaining-route probe is not estimable');
  const report = {
    fullEtaSeconds: round(full.etaSeconds),
    nearEndEtaSeconds: round(nearEnd.etaSeconds),
    nearEndProgress: round(nearEnd.progressFraction),
    nearEndRatio: round(nearEnd.etaSeconds / full.etaSeconds),
    samples: route.length,
  };
  disposeEtaWorld(world);
  return Object.freeze(report);
}

function monotonicProbe(): EtaReport['monotonic'] {
  const world = createEtaWorld(),
    route = world.routeLaneIds,
    before = world.eta.observe(
      etaObservation(world, { tick: world.startTick, positionM: laneMidpoint(world, route[2]!) }),
    ),
    backward = world.eta.observe(
      etaObservation(world, {
        tick: world.startTick + 1,
        positionM: laneMidpoint(world, route[0]!),
      }),
    ),
    ahead = world.eta.observe(
      etaObservation(world, {
        tick: world.startTick + 2,
        positionM: laneMidpoint(world, route[3]!),
      }),
    );
  const report = {
    progressBefore: round(before.progressFraction ?? Number.NaN),
    progressAfterBackward: round(backward.progressFraction ?? Number.NaN),
    backwardReason: backward.reason,
    backwardEta: backward.etaSeconds,
    forwardProgress: round(ahead.progressFraction ?? Number.NaN),
    noRewind:
      backward.progressFraction !== null &&
      before.progressFraction !== null &&
      backward.progressFraction === before.progressFraction,
    etaAfterBackward: backward.etaSeconds,
  };
  disposeEtaWorld(world);
  return Object.freeze(report);
}

function reprojectionProbe(): EtaReport['reprojection'] {
  const parallelWorld = createEtaWorld(),
    adjacentInfo = adjacentRouteLane(parallelWorld),
    adjacentSnapshot = parallelWorld.eta.observe(
      etaObservation(parallelWorld, {
        positionM: laneMidpoint(parallelWorld, adjacentInfo.adjacentId),
      }),
    );
  disposeEtaWorld(parallelWorld);

  const gapWorld = createEtaWorld(),
    gap = gapWorld.eta.observe(
      etaObservation(gapWorld, { positionM: gapMidpoint(gapWorld, gapWorld.routeLaneIds) }),
    );
  const report = {
    adjacentLaneId: adjacentInfo.adjacentId,
    adjacentDistanceM: round(adjacentSnapshot.offRouteDistanceM ?? Number.NaN),
    adjacentStatus: adjacentSnapshot.status,
    adjacentSegmentIndex: adjacentSnapshot.segmentIndex ?? -1,
    adjacentSegmentLaneId: adjacentSnapshot.segmentLaneId,
    adjacentReprojected: adjacentSnapshot.reprojected,
    gapStatus: gap.status,
    gapKind: gap.segmentKind,
    gapSegmentIndex: gap.segmentIndex ?? -1,
    gapSegmentLaneId: gap.segmentLaneId,
    gapOffRouteDistanceM: round(gap.offRouteDistanceM ?? Number.NaN),
    gapReprojected: gap.reprojected,
    gapProgress: round(gap.progressFraction ?? Number.NaN),
    gapEta: gap.etaSeconds === null ? null : round(gap.etaSeconds),
  };
  disposeEtaWorld(gapWorld);
  return Object.freeze(report);
}

function antiSnapProbe(): EtaReport['antiSnap'] {
  const world = createEtaWorld(),
    route = world.routeLaneIds,
    committed = world.eta.observe(
      etaObservation(world, {
        tick: world.startTick,
        positionM: laneMidpoint(world, route[route.length - 1]!),
      }),
    ),
    backward = world.eta.observe(
      etaObservation(world, {
        tick: world.startTick + 1,
        positionM: laneMidpoint(world, route[0]!),
      }),
    );
  const report = {
    reason: backward.reason,
    progressBefore: round(committed.progressFraction ?? Number.NaN),
    progressAfter: round(backward.progressFraction ?? Number.NaN),
    progressPreserved:
      committed.progressFraction !== null &&
      backward.progressFraction !== null &&
      committed.progressFraction === backward.progressFraction,
    etaSeconds: backward.etaSeconds,
    offRouteDistanceM: backward.offRouteDistanceM,
  };
  disposeEtaWorld(world);
  return Object.freeze(report);
}

function missingRouteProbe(): EtaReport['missingRoute'] {
  const stub = createStubEta({ pickupRouteLaneIds: [] }),
    snapshot = stub.eta.observe(stubObservation(stub, { x: 0, y: 0, z: 0 })),
    report = {
      status: snapshot.status,
      reason: snapshot.reason,
      etaSeconds: snapshot.etaSeconds,
      remainingDistanceM: snapshot.remainingDistanceM,
      progressFraction: snapshot.progressFraction,
      routeLaneIds: snapshot.routeLaneIds,
    };
  stub.dispose();
  return Object.freeze(report);
}

function invalidRoutesProbe(): EtaReport['invalidRoutes'] {
  const negativeCost = createStubEta({ pickupCostSeconds: -1 }),
    negative = negativeCost.eta.observe(stubObservation(negativeCost, { x: 0, y: 0, z: 0 }));
  negativeCost.dispose();
  const disconnected = createStubEta({ pickupRouteLaneIds: ['lane:30S0', 'lane:10E0'] }),
    broken = disconnected.eta.observe(stubObservation(disconnected, { x: 0, y: 0, z: 0 }));
  disconnected.dispose();
  return Object.freeze({
    negativeCostReason: negative.reason,
    negativeCostEta: negative.etaSeconds,
    disconnectedReason: broken.reason,
    disconnectedStale: broken.stale,
    disconnectedEta: broken.etaSeconds,
  });
}

function staleRouteProbe(): EtaReport['staleRoute'] {
  const world = createEtaWorld(),
    route = world.routeLaneIds,
    before = world.eta.observe(
      etaObservation(world, { tick: world.startTick, positionM: laneMidpoint(world, route[1]!) }),
    );
  world.rideWorld.dispatcherWorld.planner.setBlocked([route[2]!]);
  const stale = world.eta.observe(
    etaObservation(world, {
      tick: world.startTick + 1,
      positionM: laneMidpoint(world, route[2]!),
    }),
  );
  world.rideWorld.dispatcherWorld.planner.setBlocked([]);
  const recovered = world.eta.observe(
    etaObservation(world, {
      tick: world.startTick + 2,
      positionM: laneMidpoint(world, route[2]!),
    }),
  );
  disposeEtaWorld(world);

  const late = createEtaWorld(),
    lateRoute = late.routeLaneIds;
  late.rideWorld.dispatcherWorld.planner.setBlocked([lateRoute[2]!]);
  const lateEta = createRideEta({
      lifecycle: late.rideWorld.lifecycle,
      graph: late.rideWorld.dispatcherWorld.graph,
      planner: late.rideWorld.dispatcherWorld.planner,
    }),
    lateSnapshot = lateEta.observe(etaObservation(late, { tick: late.startTick + 1 }));
  lateEta.dispose();
  disposeEtaWorld(late);
  return Object.freeze({
    beforeStatus: before.status,
    afterReason: stale.reason,
    afterEta: stale.etaSeconds,
    afterRemaining: stale.remainingDistanceM,
    staleFlag: stale.stale,
    recoveredStatus: recovered.status,
    recoveredProgress: round(recovered.progressFraction ?? Number.NaN),
    beforeProgress: round(before.progressFraction ?? Number.NaN),
    lateCreatedReason: lateSnapshot.reason,
    lateCreatedEta: lateSnapshot.etaSeconds,
  });
}

function serviceProbe(): EtaReport['service'] {
  const world = createEtaWorld(),
    route = world.routeLaneIds,
    positionM = laneMidpoint(world, route[1]!),
    free = world.eta.observe(etaObservation(world, { tick: world.startTick, positionM }));
  world.eta.setServiceState('CONGESTED');
  const congested = world.eta.observe(
    etaObservation(world, { tick: world.startTick + 1, positionM }),
  );
  world.eta.setServiceState('BLOCKED');
  const blocked = world.eta.observe(
    etaObservation(world, {
      tick: world.startTick + 2,
      positionM: laneMidpoint(world, route[2]!),
    }),
  );
  world.eta.setServiceState('FREE_FLOW');
  const restored = world.eta.observe(
    etaObservation(world, {
      tick: world.startTick + 3,
      positionM: laneMidpoint(world, route[3]!),
    }),
  );
  if (
    free.etaSeconds === null ||
    congested.etaSeconds === null ||
    congested.etaMinSeconds === null ||
    congested.etaMaxSeconds === null ||
    restored.etaSeconds === null ||
    blocked.progressFraction === null ||
    congested.progressFraction === null
  )
    throw new Error('Service probe is not estimable');
  const report = {
    freeEtaSeconds: round(free.etaSeconds),
    congestedEtaSeconds: round(congested.etaSeconds),
    congestedRatio: round(congested.etaSeconds / free.etaSeconds),
    congestedMinSeconds: round(congested.etaMinSeconds),
    congestedMaxSeconds: round(congested.etaMaxSeconds),
    blockedReason: blocked.reason,
    blockedEta: blocked.etaSeconds,
    blockedProgress: round(blocked.progressFraction),
    congestedProgress: round(congested.progressFraction),
    restoredEtaSeconds: round(restored.etaSeconds),
  };
  disposeEtaWorld(world);
  return Object.freeze(report);
}

function rerouteProbe(): EtaReport['reroute'] {
  const free = createEtaWorld({ boarded: true }),
    freeRoute = free.routeLaneIds,
    freeTripCostSeconds = round(rideOf(free).tripCostSeconds),
    midLane = freeRoute[2]!,
    adjacent = adjacentLane(free, midLane),
    blocked = adjacent === null ? [midLane] : [midLane, adjacent],
    freeEta = free.eta.observe(
      etaObservation(free, {
        tick: free.startTick,
        positionM: pointAt(free.rideWorld.dispatcherWorld.graph, freeRoute[0]!, 'START'),
      }),
    );
  free.rideWorld.dispatcherWorld.planner.setBlocked(blocked);
  const staleOld = free.eta.observe(
    etaObservation(free, {
      tick: free.startTick + 1,
      positionM: pointAt(free.rideWorld.dispatcherWorld.graph, freeRoute[0]!, 'START'),
    }),
  );
  disposeEtaWorld(free);

  const replannedWorld = createDispatcherWorld({
    windows: fixedWindow('sz:0-0', 'sz:1-0', { requestCount: 1, endTick: 10 }),
    taxiCount: 24,
  });
  replannedWorld.planner.setBlocked(blocked);
  replannedWorld.demand.advance(10);
  const assignment = replannedWorld.dispatcher.step({ tick: 10, maxAssignments: 1 }).assigned[0];
  if (assignment === undefined) throw new Error('Reroute world did not assign the request');
  const lifecycle = createRideLifecycle({ dispatcher: replannedWorld.dispatcher }),
    begun = lifecycle.begin({
      requestId: assignment.requestId,
      eventId: 'assigned:reroute',
      tick: 10,
    }),
    rideId = begun.ride.rideId;
  lifecycle.apply({
    rideId,
    eventId: 'arrived:reroute',
    event: 'ARRIVED_PICKUP',
    tick: 12,
  });
  lifecycle.apply({
    rideId,
    eventId: 'boarded:reroute',
    event: 'PICKUP_COMPLETE',
    tick: 13,
  });
  const replannedEta = createRideEta({
      lifecycle,
      graph: replannedWorld.graph,
      planner: replannedWorld.planner,
    }),
    replannedSnapshot = replannedEta.observe({
      rideId,
      taxiId: assignment.taxiId,
      tick: 20,
      positionM: pointAt(replannedWorld.graph, assignment.tripRouteLaneIds[0]!, 'START'),
      speedMps: 8,
    });
  if (freeEta.etaSeconds === null || replannedSnapshot.etaSeconds === null)
    throw new Error('Reroute probe is not estimable');
  const report = {
    freeRouteLaneIds: freeRoute,
    replannedRouteLaneIds: assignment.tripRouteLaneIds,
    routeDiffers: JSON.stringify(freeRoute) !== JSON.stringify(assignment.tripRouteLaneIds),
    freeTripCostSeconds,
    replannedTripCostSeconds: round(assignment.tripCostSeconds),
    freeEtaSeconds: round(freeEta.etaSeconds),
    replannedEtaSeconds: round(replannedSnapshot.etaSeconds),
    oldRouteAfterReplanReason: staleOld.reason,
    oldRouteAfterReplanEta: staleOld.etaSeconds,
  };
  replannedEta.dispose();
  lifecycle.dispose();
  replannedWorld.dispatcher.dispose();
  replannedWorld.demand.dispose();
  replannedWorld.registry.dispose();
  replannedWorld.planner.dispose();
  return Object.freeze(report);
}

function arrivalsProbe(): EtaReport['arrivals'] {
  const pickupWorld = createEtaWorld(),
    pickupRide = rideOf(pickupWorld);
  pickupWorld.rideWorld.lifecycle.apply({
    rideId: pickupRide.rideId,
    eventId: 'arrived:pickup',
    event: 'ARRIVED_PICKUP',
    tick: 20,
  });
  const pickup = pickupWorld.eta.observe(etaObservation(pickupWorld, { tick: 20 }));
  disposeEtaWorld(pickupWorld);

  const dropoffWorld = createEtaWorld({ boarded: true }),
    dropoffRide = rideOf(dropoffWorld);
  dropoffWorld.rideWorld.lifecycle.apply({
    rideId: dropoffRide.rideId,
    eventId: 'arrived:dropoff',
    event: 'ARRIVED_DROPOFF',
    tick: 30,
  });
  const dropoff = dropoffWorld.eta.observe(
    etaObservation(dropoffWorld, {
      tick: 30,
      positionM: laneStart(dropoffWorld, dropoffWorld.routeLaneIds[0]!),
    }),
  );
  disposeEtaWorld(dropoffWorld);

  const terminalWorld = createEtaWorld({ boarded: true }),
    terminalRide = rideOf(terminalWorld);
  terminalWorld.rideWorld.lifecycle.apply({
    rideId: terminalRide.rideId,
    eventId: 'arrived:terminal',
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
  disposeEtaWorld(terminalWorld);
  return Object.freeze({
    pickupStatus: pickup.status,
    pickupEta: pickup.etaSeconds,
    dropoffStatus: dropoff.status,
    dropoffEta: dropoff.etaSeconds,
    terminalReason: terminal.reason,
    terminalEta: terminal.etaSeconds,
    terminalState: terminal.state,
  });
}

function validationProbe(): EtaReport['validation'] {
  const world = createEtaWorld(),
    base = etaObservation(world),
    accepted = world.eta.observe({ ...base, tick: world.startTick + 10 }),
    stale = world.eta.observe({ ...base, tick: world.startTick + 9 }),
    wrongRide = world.eta.observe(
      etaObservation(world, { tick: world.startTick + 11, rideId: 'ride:unknown' }),
    ),
    foreign = world.eta.observe(
      etaObservation(world, { tick: world.startTick + 12, taxiId: 'taxi:foreign' }),
    );
  const report = {
    nanSpeed: throws(() => world.eta.observe({ ...base, speedMps: Number.NaN }), /range/),
    negativeSpeed: throws(() => world.eta.observe({ ...base, speedMps: -1 }), /range/),
    infiniteSpeed: throws(
      () => world.eta.observe({ ...base, speedMps: Number.POSITIVE_INFINITY }),
      /range/,
    ),
    nanPosition: throws(
      () => world.eta.observe({ ...base, positionM: { x: Number.NaN, y: 0, z: 0 } }),
      /range/,
    ),
    staleTick: accepted.status === 'ESTIMATED' && stale.reason === 'STALE_TICK',
    staleTickReason: stale.reason,
    unknownField: throws(() => world.eta.observe({ ...base, extra: true }), /Unknown eta/),
    wrongRide: wrongRide.reason,
    foreignVehicle: foreign.reason,
  };
  disposeEtaWorld(world);
  return Object.freeze(report);
}

function simulate(): Simulation {
  const world = createDispatcherWorld(),
    lifecycle = createRideLifecycle({ dispatcher: world.dispatcher }),
    pickup = createRidePickup({ map: world.map, lifecycle }),
    dropoff = createRideDropoff({ map: world.map, lifecycle }),
    eta = createRideEta({ lifecycle, graph: world.graph, planner: world.planner });
  interface Transit {
    leg: 'PICKUP' | 'TRIP';
    laneIndex: number;
    tick: number;
    lastProgress: number;
    lastEta: number;
    samples: number;
    pickup: number;
    trip: number;
  }
  const transits = new Map<string, Transit>();
  let assignments = 0,
    samples = 0,
    pickupSamples = 0,
    tripSamples = 0,
    monotonicViolations = 0,
    etaViolations = 0,
    offRoute = 0,
    unavailable = 0,
    arrived = 0,
    zeroCostSamples = 0,
    minEta = Number.POSITIVE_INFINITY,
    maxEta = 0;
  const byReason: Record<string, number> = { ARRIVED: 0 };

  function sampleEta(
    ride: ReturnType<typeof lifecycle.active>[number],
    leg: 'PICKUP' | 'TRIP',
    tick: number,
  ): void {
    const route = leg === 'PICKUP' ? ride.pickupRouteLaneIds : ride.tripRouteLaneIds;
    let transit = transits.get(ride.rideId);
    if (transit === undefined || transit.leg !== leg) {
      transit = {
        leg,
        laneIndex: 0,
        tick,
        lastProgress: -1,
        lastEta: Number.POSITIVE_INFINITY,
        samples: transit?.samples ?? 0,
        pickup: transit?.pickup ?? 0,
        trip: transit?.trip ?? 0,
      };
      transits.set(ride.rideId, transit);
    }
    if (transit.laneIndex >= route.length || tick - transit.tick < 3) return;
    const snapshot = eta.observe({
      rideId: ride.rideId,
      taxiId: ride.taxiId,
      tick,
      positionM: midpoint(world.graph, route[transit.laneIndex]!),
      speedMps: 8,
    });
    transit.tick = tick;
    transit.laneIndex += 1;
    transit.samples += 1;
    samples += 1;
    if (leg === 'PICKUP') {
      transit.pickup += 1;
      pickupSamples += 1;
      if (ride.pickupCostSeconds === 0) zeroCostSamples += 1;
    } else {
      transit.trip += 1;
      tripSamples += 1;
      if (ride.tripCostSeconds === 0) zeroCostSamples += 1;
    }
    if (snapshot.status === 'ESTIMATED') {
      if (snapshot.progressFraction !== null && snapshot.progressFraction < transit.lastProgress)
        monotonicViolations += 1;
      if (snapshot.etaSeconds !== null) {
        if (snapshot.etaSeconds > transit.lastEta + 1e-9) etaViolations += 1;
        transit.lastEta = snapshot.etaSeconds;
        minEta = Math.min(minEta, snapshot.etaSeconds);
        maxEta = Math.max(maxEta, snapshot.etaSeconds);
      }
      if (snapshot.progressFraction !== null) transit.lastProgress = snapshot.progressFraction;
    } else if (snapshot.status === 'ARRIVED') {
      arrived += 1;
      byReason.ARRIVED = (byReason.ARRIVED ?? 0) + 1;
    } else if (snapshot.reason === 'OFF_ROUTE' || snapshot.reason === 'POSITION_INVALID') {
      offRoute += 1;
      byReason[snapshot.reason] = (byReason[snapshot.reason] ?? 0) + 1;
    } else {
      unavailable += 1;
      const reason = snapshot.reason ?? 'UNKNOWN';
      byReason[reason] = (byReason[reason] ?? 0) + 1;
    }
  }

  for (let tick = 0; tick <= 2500; tick += 1) {
    world.demand.advance(tick);
    lifecycle.advance(tick);
    for (const assignment of world.dispatcher.step({ tick, maxAssignments: 4 }).assigned) {
      lifecycle.begin({
        requestId: assignment.requestId,
        eventId: `assigned:${assignment.requestId}`,
        tick,
      });
      assignments += 1;
    }
    for (const ride of lifecycle.active()) {
      if (ride.state === 'TO_PICKUP') {
        const decision: PickupDecision = pickup.observe({
          rideId: ride.rideId,
          taxiId: ride.taxiId,
          tick,
          positionM: zoneCenter(world.map, ride.pickupZoneId),
          speedMps: 0,
        });
        if (decision.status !== 'BOARDED') sampleEta(ride, 'PICKUP', tick);
      } else if (ride.state === 'TO_DROPOFF') {
        const decision: DropoffDecision = dropoff.observe({
          rideId: ride.rideId,
          taxiId: ride.taxiId,
          tick,
          positionM: zoneCenter(world.map, ride.dropoffZoneId),
          speedMps: 0,
        });
        if (decision.status !== 'COMPLETED') sampleEta(ride, 'TRIP', tick);
      }
    }
  }
  const closed = lifecycle.terminal(),
    rides = Object.freeze(
      closed.map((ride) => {
        const transit = transits.get(ride.rideId);
        return Object.freeze({
          requestId: ride.requestId,
          taxiId: ride.taxiId,
          pickupSamples: transit?.pickup ?? 0,
          tripSamples: transit?.trip ?? 0,
          state: ride.state,
          events: Object.freeze(ride.transitions.map((entry) => entry.event)),
        });
      }),
    ),
    report = {
      requests: world.demand.requests().length,
      assignments,
      completed: closed.filter((ride) => ride.state === 'COMPLETED').length,
      failed: closed.filter((ride) => ride.state === 'FAILED').length,
      cancelled: closed.filter((ride) => ride.state === 'CANCELLED').length,
      active: lifecycle.active().length,
      samples,
      pickupSamples,
      tripSamples,
      monotonicViolations,
      etaViolations,
      offRoute,
      unavailable,
      arrived,
      zeroCostSamples,
      byReason,
      routeLoads: eta.stats().routeLoads,
      minEta: minEta === Number.POSITIVE_INFINITY ? 0 : round(minEta),
      maxEta: round(maxEta),
      rides,
    };
  eta.dispose();
  pickup.dispose();
  dropoff.dispose();
  lifecycle.dispose();
  world.dispatcher.dispose();
  world.demand.dispose();
  world.registry.dispose();
  world.planner.dispose();
  return Object.freeze(report);
}

function disposalProbe(): EtaReport['disposal'] {
  const world = createEtaWorld(),
    ride = rideOf(world),
    before = world.eta.observe(etaObservation(world));
  world.eta.dispose();
  world.eta.dispose();
  const stats = world.eta.stats(),
    report = {
      disposed: stats.disposed,
      observations: stats.observations,
      estimated: stats.estimated,
      arrived: stats.arrived,
      unavailable: stats.unavailable,
      tick: stats.tick,
      routeLoads: stats.routeLoads,
      releaseReason: world.rideWorld.dispatcherWorld.dispatcher.releases()[0]?.reason ?? null,
      state: world.rideWorld.lifecycle.ride(ride.rideId)?.state ?? null,
    };
  if (before.status !== 'ESTIMATED') throw new Error('Disposal probe did not estimate');
  disposeEtaWorld(world);
  return Object.freeze(report);
}

export function runEtaReport(): EtaReport {
  const routeBasis = routeBasisProbe(),
    remainingRoute = remainingRouteProbe(),
    monotonic = monotonicProbe(),
    reprojection = reprojectionProbe(),
    antiSnap = antiSnapProbe(),
    missingRoute = missingRouteProbe(),
    invalidRoutes = invalidRoutesProbe(),
    staleRoute = staleRouteProbe(),
    service = serviceProbe(),
    reroute = rerouteProbe(),
    arrivals = arrivalsProbe(),
    validation = validationProbe(),
    simulation = simulate(),
    second = simulate(),
    deterministic =
      JSON.stringify(simulation.rides) === JSON.stringify(second.rides) &&
      simulation.samples === second.samples &&
      simulation.completed === second.completed;
  const fleetWorld = createDispatcherWorld(),
    fleet = {
      taxis: fleetWorld.registry.counts().taxis,
      civilians: fleetWorld.registry.counts().civilians,
      requests: fleetWorld.demand.requests().length,
    };
  fleetWorld.dispatcher.dispose();
  fleetWorld.demand.dispose();
  fleetWorld.registry.dispose();
  fleetWorld.planner.dispose();
  const disposal = disposalProbe(),
    source = readFileSync(join(process.cwd(), 'src', 'fleet', 'eta.ts'), 'utf8'),
    noWallClock =
      !/\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/.test(
        source,
      ),
    noDom = !/\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/.test(source);
  const checks: EtaReportCheck[] = [
    check('version', '064-eta-v1', RIDE_ETA_VERSION, 'One versioned ETA identity.'),
    check(
      'unavailable-reasons',
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
      [...ETA_UNAVAILABLE_REASONS],
      'Every unavailable estimate carries one closed reason.',
    ),
    check(
      'defaults',
      {
        tickRateHz: 60,
        offRouteToleranceM: 4,
        reprojectionLanes: 8,
        serviceState: 'FREE_FLOW',
      },
      { ...ETA_DEFAULTS },
      'Documented provisional defaults; no wall clock and no hidden traffic prediction.',
    ),
    check(
      'uncertainty',
      {
        FREE_FLOW: { nominalSpeedFactor: 1, minSpeedFactor: 0.9, maxSpeedFactor: 1.1 },
        CONGESTED: { nominalSpeedFactor: 0.5, minSpeedFactor: 0.35, maxSpeedFactor: 0.65 },
        BLOCKED: null,
      },
      {
        FREE_FLOW: { ...ETA_UNCERTAINTY.FREE_FLOW! },
        CONGESTED: { ...ETA_UNCERTAINTY.CONGESTED! },
        BLOCKED: ETA_UNCERTAINTY.BLOCKED,
      },
      'The published interval is a declared speed uncertainty around the real route basis.',
    ),
    check(
      'fleet-and-demand',
      { taxis: 24, civilians: 20, requests: 32 },
      fleet,
      'The report uses the real 057 fleet and the real 059 schedule.',
    ),
    check(
      'route-basis',
      {
        routeLaneIds: [
          'lane:00E0',
          'lane:10E0',
          'lane:20N0',
          'lane:11W0',
          'lane:10S0',
          'lane:00W0',
        ],
        totalDistanceM: 1067.884216,
        plannedSpeedMps: 12.258824,
        pickupCostSeconds: 83.776386,
        plannedRemainingSeconds: 83.776386,
        etaSeconds: 83.776386,
        etaMinSeconds: 76.160351,
        etaMaxSeconds: 93.084873,
        boundsOrdered: true,
        initialProgress: 0,
      },
      routeBasis,
      'The ETA is the real 041 route cost at progress 0 with an ordered interval.',
    ),
    check(
      'remaining-route',
      {
        fullEtaSeconds: 83.776386,
        nearEndEtaSeconds: 7.230957,
        nearEndProgress: 0.91928,
        nearEndRatio: 0.086313,
        samples: 6,
      },
      remainingRoute,
      'A near-end observation returns a small fraction of the full leg, not the leg cost.',
    ),
    check(
      'monotonic',
      {
        progressBefore: 0.417806,
        progressAfterBackward: 0.417806,
        backwardReason: 'OFF_ROUTE',
        backwardEta: null,
        forwardProgress: 0.588066,
        noRewind: true,
        etaAfterBackward: null,
      },
      monotonic,
      'A backward observation is refused and certified progress is not rewound.',
    ),
    check(
      'reprojection',
      {
        adjacentLaneId: 'lane:20N1',
        adjacentDistanceM: 3.7,
        adjacentStatus: 'ESTIMATED',
        adjacentSegmentIndex: 2,
        adjacentSegmentLaneId: 'lane:20N0',
        adjacentReprojected: true,
        gapStatus: 'ESTIMATED',
        gapKind: 'CONNECTION',
        gapSegmentIndex: 1,
        gapSegmentLaneId: 'lane:10E0',
        gapOffRouteDistanceM: 0,
        gapReprojected: true,
        gapProgress: 0.164999,
        gapEta: 69.314472,
      },
      reprojection,
      'An adjacent same-direction lane and an intersection gap reproject to the current segment.',
    ),
    check(
      'anti-snap',
      {
        reason: 'OFF_ROUTE',
        progressBefore: 0.91928,
        progressAfter: 0.91928,
        progressPreserved: true,
        etaSeconds: null,
        offRouteDistanceM: null,
      },
      antiSnap,
      'A position behind the committed progress is not snapped to an earlier segment.',
    ),
    check(
      'missing-route',
      {
        status: 'UNAVAILABLE',
        reason: 'ROUTE_MISSING',
        etaSeconds: null,
        remainingDistanceM: null,
        progressFraction: null,
        routeLaneIds: null,
      },
      missingRoute,
      'A ride without a 041 route never shows zero seconds as a certain time.',
    ),
    check(
      'invalid-routes',
      {
        negativeCostReason: 'ROUTE_INVALID',
        negativeCostEta: null,
        disconnectedReason: 'ROUTE_STALE',
        disconnectedStale: true,
        disconnectedEta: null,
      },
      invalidRoutes,
      'An invalid-cost leg and a disconnected lane sequence are refused with closed reasons.',
    ),
    check(
      'stale-route',
      {
        beforeStatus: 'ESTIMATED',
        afterReason: 'ROUTE_STALE',
        afterEta: null,
        afterRemaining: null,
        staleFlag: true,
        recoveredStatus: 'ESTIMATED',
        recoveredProgress: 0.417806,
        beforeProgress: 0.247546,
        lateCreatedReason: 'ROUTE_STALE',
        lateCreatedEta: null,
      },
      staleRoute,
      'A replan invalidates the stored route; an estimate created later refuses the old path too.',
    ),
    check(
      'service-states',
      {
        freeEtaSeconds: 62.238703,
        congestedEtaSeconds: 124.477407,
        congestedRatio: 2,
        congestedMinSeconds: 95.751851,
        congestedMaxSeconds: 177.824867,
        blockedReason: 'SERVICE_BLOCKED',
        blockedEta: null,
        blockedProgress: 0.417806,
        congestedProgress: 0.247546,
        restoredEtaSeconds: 35.999597,
      },
      service,
      'Free flow, congestion and a blocked service produce different, documented outcomes.',
    ),
    check(
      'reroute',
      {
        freeRouteLaneIds: [
          'lane:00W0',
          'lane:00N0',
          'lane:01E0',
          'lane:11E0',
          'lane:20S1',
          'lane:10W0',
        ],
        replannedRouteLaneIds: [
          'lane:00W0',
          'lane:00N0',
          'lane:01N0',
          'lane:02E1',
          'lane:12E1',
          'lane:21S1',
          'lane:20S1',
          'lane:10W0',
        ],
        routeDiffers: true,
        freeTripCostSeconds: 83.776386,
        replannedTripCostSeconds: 110.428305,
        freeEtaSeconds: 83.776386,
        replannedEtaSeconds: 110.428305,
        oldRouteAfterReplanReason: 'ROUTE_STALE',
        oldRouteAfterReplanEta: null,
      },
      reroute,
      'A real 060 replan yields a different route and a larger ETA; the old route is stale.',
    ),
    check(
      'arrivals',
      {
        pickupStatus: 'ARRIVED',
        pickupEta: 0,
        dropoffStatus: 'ARRIVED',
        dropoffEta: 0,
        terminalReason: 'RIDE_TERMINAL',
        terminalEta: null,
        terminalState: 'COMPLETED',
      },
      arrivals,
      'Arrival is authoritative and reports zero; a terminal ride has no estimate.',
    ),
    check(
      'validation',
      {
        nanSpeed: true,
        negativeSpeed: true,
        infiniteSpeed: true,
        nanPosition: true,
        staleTick: true,
        staleTickReason: 'STALE_TICK',
        unknownField: true,
        wrongRide: 'WRONG_RIDE',
        foreignVehicle: 'FOREIGN_VEHICLE',
      },
      validation,
      'NaN, negative or infinite speed and invalid positions are contract errors, never estimates.',
    ),
    check(
      'simulation',
      {
        requests: 32,
        assignments: 32,
        completed: 32,
        failed: 0,
        cancelled: 0,
        active: 0,
        samples: simulation.samples,
        pickupSamples: simulation.pickupSamples,
        tripSamples: simulation.tripSamples,
        monotonicViolations: 0,
        etaViolations: 0,
        offRoute: 0,
        unavailable: 0,
        arrived: 0,
        zeroCostSamples: 4,
        routeLoads: 64,
        minEtaNonNegative: true,
        maxEtaGreaterThanMin: true,
      },
      {
        requests: simulation.requests,
        assignments: simulation.assignments,
        completed: simulation.completed,
        failed: simulation.failed,
        cancelled: simulation.cancelled,
        active: simulation.active,
        samples: simulation.samples,
        pickupSamples: simulation.pickupSamples,
        tripSamples: simulation.tripSamples,
        monotonicViolations: simulation.monotonicViolations,
        etaViolations: simulation.etaViolations,
        offRoute: simulation.offRoute,
        unavailable: simulation.unavailable,
        arrived: simulation.arrived,
        zeroCostSamples: simulation.zeroCostSamples,
        routeLoads: simulation.routeLoads,
        minEtaNonNegative: simulation.minEta >= 0,
        maxEtaGreaterThanMin: simulation.maxEta > simulation.minEta,
      },
      'All 32 real requests are estimated along their real route without rewinds or ETA inversions.',
    ),
    check(
      'simulation-bounds',
      {
        requests: 32,
        everyRideSampledBothLegs: true,
        transitions: true,
      },
      {
        requests: simulation.requests,
        everyRideSampledBothLegs:
          simulation.rides.length === 32 &&
          simulation.rides.every((ride) => ride.pickupSamples >= 1 && ride.tripSamples >= 1),
        transitions: simulation.rides.every(
          (ride) =>
            JSON.stringify(ride.events) ===
            JSON.stringify([
              'ASSIGNED',
              'ARRIVED_PICKUP',
              'PICKUP_COMPLETE',
              'ARRIVED_DROPOFF',
              'DROPOFF_COMPLETE',
            ]),
        ),
      },
      'Each completed ride contributed ETA samples on both legs and kept the real 061 chain.',
    ),
    check(
      'disposal',
      {
        disposed: true,
        observations: 0,
        estimated: 0,
        arrived: 0,
        unavailable: 0,
        tick: 0,
        routeLoads: 0,
        releaseReason: null,
        state: 'TO_PICKUP',
      },
      disposal,
      'Disposal returns owned ETA state to zero without releasing the 060 claim.',
    ),
    check(
      'limits',
      { rides: 64, routeLanes: 256, reprojectionLanes: 8, minimumFleet: true },
      {
        rides: ETA_LIMITS.rides,
        routeLanes: ETA_LIMITS.routeLanes,
        reprojectionLanes: ETA_LIMITS.reprojectionLanes,
        minimumFleet: ETA_LIMITS.rides >= 30,
      },
      'ETA state is bounded by the same active-ride and 041 path ceilings.',
    ),
    truthy('determinism', deterministic, 'Two identical simulations produce identical estimates.'),
    truthy('no-wall-clock', noWallClock, 'The source has no Date, timer or ambient randomness.'),
    truthy('no-dom-or-renderer', noDom, 'The source has no DOM, Babylon or Rapier dependency.'),
  ];
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: RIDE_ETA_VERSION,
    generatedBy: 'npm run ride:eta',
    oracleRule:
      'ETA is the remaining real 041 lane-time profile at the certified route progress, scaled by the caller service state; progress is forward-only over the stored route with a documented reprojection tolerance, and a missing, stale or uncertifiable route is unavailable instead of zero.',
    defaults: ETA_DEFAULTS,
    limits: ETA_LIMITS,
    uncertainty: ETA_UNCERTAINTY,
    fleet: Object.freeze(fleet),
    routeBasis: Object.freeze(routeBasis),
    remainingRoute: Object.freeze(remainingRoute),
    monotonic: Object.freeze(monotonic),
    reprojection: Object.freeze(reprojection),
    antiSnap: Object.freeze(antiSnap),
    missingRoute: Object.freeze(missingRoute),
    invalidRoutes: Object.freeze(invalidRoutes),
    staleRoute: Object.freeze(staleRoute),
    service: Object.freeze(service),
    reroute: Object.freeze(reroute),
    arrivals: Object.freeze(arrivals),
    validation: Object.freeze(validation),
    simulation: Object.freeze(simulation),
    disposal: Object.freeze(disposal),
    determinism: Object.freeze({
      identical: deterministic,
      rides: simulation.rides.length,
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}
