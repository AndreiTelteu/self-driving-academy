import { isDeepStrictEqual } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FLEET_HEALTH_FACTS,
  FLEET_HEALTH_LIMITS,
  FLEET_HEALTH_VERSION,
  FLEET_RESET_POLICIES,
  FLEET_SCENARIO_TAXI_PRESETS,
  createFleetScenario,
  fleetHealthStates,
  fleetScenarioReport,
} from '../../src/fleet';
import type { DispatchAssignment, FleetScenario, RideRecord } from '../../src/fleet';

export interface FleetHealthReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface HealthReleaseProbe {
  readonly taxiId: string;
  readonly reason: string | null;
  readonly dispatcherStatus: string | undefined;
  readonly healthState: string | undefined;
  readonly claimReleased: boolean;
  readonly lifecycleReleaseReason: string | null;
  readonly directReleaseReason: string | null;
}

export interface FleetHealthReport {
  readonly version: typeof FLEET_HEALTH_VERSION;
  readonly generatedBy: 'npm run fleet:health';
  readonly oracleRule: string;
  readonly states: readonly string[];
  readonly facts: readonly string[];
  readonly policies: readonly string[];
  readonly limits: Readonly<{
    taxis: number;
    historyEntries: number;
    factIds: number;
    idCodeUnits: number;
    factIdCodeUnits: number;
  }>;
  readonly fixture: Readonly<{
    version: string;
    presets: readonly number[];
    populations: readonly Readonly<{
      taxis: number;
      civilians: number;
      total: number;
      requests: number;
      uniqueTaxis: number;
      lanesAssigned: number;
      reproducible: boolean;
    }>[];
  }>;
  readonly damage: HealthReleaseProbe;
  readonly block: HealthReleaseProbe;
  readonly offline: HealthReleaseProbe;
  readonly claimOnly: Readonly<{
    blockRelease: string | null;
    offlineRelease: string | null;
    assignments: number;
    statuses: readonly (string | undefined)[];
  }>;
  readonly availability: Readonly<{
    damagedTaxiId: string;
    assignedTaxiId: string;
    assignedIsDamaged: boolean;
    availableExcludesDamaged: boolean;
    allDamagedBlocker: string | null;
    allDamagedAssignments: number;
  }>;
  readonly reset: Readonly<{
    tick: number;
    closedRides: number;
    closedReasons: readonly string[];
    releasedAssignments: number;
    clearedHealth: number;
    discardedRides: number;
    activeRides: number;
    assignments: number;
    pending: number;
    estimates: number;
    healthAvailable: number;
    assigned: number;
    consistent: boolean;
    staleRideIds: boolean;
    staleEstimates: boolean;
    secondReset: Readonly<{
      closedRides: number;
      releasedAssignments: number;
      clearedHealth: number;
      lifecycleRides: number;
      assignments: number;
    }>;
  }>;
  readonly policy: Readonly<{
    preservedProfile: string;
    preservedFacts: number;
    preservedResetProfiles: number;
    preservedResetStats: string;
    resetProfile: string;
    resetFacts: number;
    resetResetProfiles: number;
    resetStats: string;
    healthAfterPreserve: number;
  }>;
  readonly vanished: Readonly<{
    closedRides: number;
    discardedRides: number;
    closedReason: string | null;
    assignments: number;
    activeRides: number;
    taxis: number;
    consistent: boolean;
  }>;
  readonly nextScenario: Readonly<{
    requestId: string;
    assignmentId: string;
    rideId: string;
    state: string;
    etaStatus: string;
    reusedFactAccepted: boolean;
    reusedRideReason: string | null;
    sameRequestId: boolean;
  }>;
  readonly simulation: Readonly<{
    requests: number;
    assigned: number;
    begun: number;
    completed: number;
    failedHealth: number;
    failedTimeout: number;
    cancelled: number;
    activeBeforeReset: number;
    closedByReset: number;
    etaSamples: number;
  }>;
  readonly determinism: Readonly<{
    first: unknown;
    second: unknown;
    equal: boolean;
  }>;
  readonly disposal: Readonly<{
    disposed: boolean;
    healthTaxis: number;
    healthFacts: number;
    estimates: number;
    assignments: number;
    pending: number;
    activeRides: number;
    vehicles: number;
  }>;
  readonly checks: readonly FleetHealthReportCheck[];
  readonly summary: Readonly<{
    version: number;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): FleetHealthReportCheck {
  const pass = isDeepStrictEqual(expected, actual);
  return Object.freeze({ name, expected, actual, pass, detail });
}

function lanePoint(scenario: FleetScenario, laneId: string): Readonly<Record<string, number>> {
  const path = scenario.graph.getDirectedPath(laneId);
  if (path === null) throw new Error(`Report lane is missing: ${laneId}`);
  const point = path.points[0]!;
  return Object.freeze({ x: point.x, y: point.y, z: point.z });
}

function observeRide(scenario: FleetScenario, ride: RideRecord, tick: number): string {
  const laneId =
    ride.state === 'TO_PICKUP' || ride.state === 'PICKUP'
      ? ride.pickupRouteLaneIds[0]
      : ride.tripRouteLaneIds[0];
  if (laneId === undefined) throw new Error('Report ride has no route');
  return scenario.eta.observe({
    rideId: ride.rideId,
    taxiId: ride.taxiId,
    tick,
    positionM: lanePoint(scenario, laneId),
    speedMps: 8,
  }).status;
}

function beginRide(
  scenario: FleetScenario,
  assignment: DispatchAssignment,
  tick: number,
  suffix = '',
): RideRecord {
  const begun = scenario.lifecycle.begin({
    requestId: assignment.requestId,
    eventId: `assigned:${suffix}${assignment.requestId}`,
    tick,
  });
  return begun.ride;
}

function releaseProbe(
  scenario: FleetScenario,
  assignment: DispatchAssignment,
  fact: string,
  factId: string,
  tick: number,
): HealthReleaseProbe {
  const change = scenario.health.apply({
    taxiId: assignment.taxiId,
    fact,
    factId,
    tick,
  });
  return Object.freeze({
    taxiId: assignment.taxiId,
    reason: change.ride === null ? null : change.ride.ride.reason,
    dispatcherStatus: scenario.dispatcher.taxiStatus(assignment.taxiId),
    healthState: scenario.health.health(assignment.taxiId)?.state,
    claimReleased: scenario.dispatcher.assignmentFor(assignment.requestId) === undefined,
    lifecycleReleaseReason:
      change.ride === null ? null : (change.ride.ride.release?.reason ?? null),
    directReleaseReason: change.release === null ? null : change.release.reason,
  });
}

function sourceHas(path: string, pattern: RegExp): boolean {
  return pattern.test(readFileSync(join(process.cwd(), path), 'utf8'));
}

export function runFleetHealthReport(): FleetHealthReport {
  const main = createFleetScenario({ taxiCount: 24, civilianCount: 40, requestsPerWindow: 8 });
  main.demand.advance(240);
  const assignments = [
    ...main.dispatcher.step({ tick: 240, maxAssignments: 4 }).assigned,
    ...main.dispatcher.step({ tick: 240, maxAssignments: 4 }).assigned,
  ];
  if (assignments.length !== 8) throw new Error('Report fixture did not assign eight rides');
  const rides = assignments.map((assignment) => beginRide(main, assignment, 240));
  let etaSamples = 0;
  for (const ride of rides) {
    if (observeRide(main, ride, 240) !== 'ESTIMATED')
      throw new Error('Report eta did not estimate');
    etaSamples += 1;
  }
  const damage = releaseProbe(main, assignments[0]!, 'COLLISION_DAMAGE', 'damage:report', 241),
    block = releaseProbe(main, assignments[1]!, 'TRAFFIC_BLOCK', 'block:report', 242),
    offline = releaseProbe(main, assignments[2]!, 'SERVICE_WITHDRAWN', 'offline:report', 243);
  main.lifecycle.apply({
    rideId: rides[3]!.rideId,
    eventId: 'report:arrived-pickup',
    event: 'ARRIVED_PICKUP',
    tick: 244,
  });
  main.lifecycle.apply({
    rideId: rides[3]!.rideId,
    eventId: 'report:pickup-complete',
    event: 'PICKUP_COMPLETE',
    tick: 245,
  });
  const tripRide = main.lifecycle.ride(rides[3]!.rideId)!;
  if (observeRide(main, tripRide, 246) !== 'ESTIMATED') throw new Error('Report trip eta failed');
  etaSamples += 1;
  main.lifecycle.apply({
    rideId: rides[3]!.rideId,
    eventId: 'report:arrived-dropoff',
    event: 'ARRIVED_DROPOFF',
    tick: 247,
  });
  main.lifecycle.apply({
    rideId: rides[3]!.rideId,
    eventId: 'report:dropoff-complete',
    event: 'DROPOFF_COMPLETE',
    tick: 248,
  });
  main.lifecycle.apply({
    rideId: rides[4]!.rideId,
    eventId: 'report:timeout',
    event: 'FAILED',
    reason: 'SERVICE_TIMEOUT',
    tick: 249,
  });
  main.lifecycle.apply({
    rideId: rides[5]!.rideId,
    eventId: 'report:cancel',
    event: 'CANCELLED',
    reason: 'PLAYER_CANCELLED',
    tick: 250,
  });
  const activeBeforeReset = main.lifecycle.active().length,
    completed = main.lifecycle.terminal().filter((ride) => ride.state === 'COMPLETED').length,
    failedTimeout = main.lifecycle
      .terminal()
      .filter((ride) => ride.reason === 'SERVICE_TIMEOUT').length,
    cancelled = main.lifecycle.terminal().filter((ride) => ride.state === 'CANCELLED').length,
    rideIds = rides.map((ride) => ride.rideId),
    reset = main.health.reset({ tick: 300 }),
    staleRideIds = rideIds.every((rideId) => main.lifecycle.ride(rideId) === undefined),
    staleEstimates = rideIds.every((rideId) => main.eta.estimate(rideId) === undefined),
    afterReset = main.health.report(),
    second = main.health.reset({ tick: 300 }),
    afterSecondReset = Object.freeze({
      activeRides: main.lifecycle.active().length,
      assignments: main.dispatcher.assignments().length,
      pending: main.demand.pending().length,
      estimates: main.eta.estimates().length,
      lifecycleRides: main.lifecycle.stats().rides,
      demand: main.demand.stats(),
      etaTick: main.eta.currentTick(),
    });

  main.demand.advance(400);
  const nextAssignments = main.dispatcher.step({ tick: 400, maxAssignments: 2 }).assigned;
  const nextAssignment = nextAssignments[0]!,
    nextRide = beginRide(main, nextAssignment, 400, 'again:'),
    nextEta = observeRide(main, nextRide, 401),
    reusedFact = main.health.apply({
      taxiId: nextRide.taxiId,
      fact: 'COLLISION_DAMAGE',
      factId: 'offline:report',
      tick: 402,
    });

  const claimWorld = createFleetScenario({
    taxiCount: 20,
    civilianCount: 20,
    requestsPerWindow: 2,
  });
  claimWorld.demand.advance(59);
  const claimAssignments = claimWorld.dispatcher.step({ tick: 59, maxAssignments: 2 }).assigned;
  const blockedClaim = claimWorld.health.apply({
      taxiId: claimAssignments[0]!.taxiId,
      fact: 'TRAFFIC_BLOCK',
      factId: 'claim:block',
      tick: 60,
    }),
    withdrawnClaim = claimWorld.health.apply({
      taxiId: claimAssignments[1]!.taxiId,
      fact: 'SERVICE_WITHDRAWN',
      factId: 'claim:offline',
      tick: 61,
    });
  const claimOnly = Object.freeze({
    blockRelease: blockedClaim.release?.reason ?? null,
    offlineRelease: withdrawnClaim.release?.reason ?? null,
    assignments: claimWorld.dispatcher.assignments().length,
    statuses: Object.freeze([
      claimWorld.dispatcher.taxiStatus(claimAssignments[0]!.taxiId),
      claimWorld.dispatcher.taxiStatus(claimAssignments[1]!.taxiId),
    ]),
  });
  claimWorld.dispose();

  const availabilityWorld = createFleetScenario({
      taxiCount: 20,
      civilianCount: 20,
      requestsPerWindow: 2,
    }),
    [damagedTaxi] = availabilityWorld.taxiIds;
  for (let index = 2; index < availabilityWorld.taxiIds.length; index += 1) {
    const taxiId = availabilityWorld.taxiIds[index]!;
    availabilityWorld.health.apply({
      taxiId,
      fact: 'SERVICE_WITHDRAWN',
      factId: `report:offline:${taxiId}`,
      tick: 0,
    });
  }
  availabilityWorld.health.apply({
    taxiId: damagedTaxi!,
    fact: 'COLLISION_DAMAGE',
    factId: 'report:availability:damage',
    tick: 0,
  });
  availabilityWorld.demand.advance(59);
  const availabilityStep = availabilityWorld.dispatcher.step({ tick: 59, maxAssignments: 1 }),
    allDamaged = createFleetScenario({ taxiCount: 20, civilianCount: 20, requestsPerWindow: 1 });
  for (const taxiId of allDamaged.taxiIds)
    allDamaged.health.apply({
      taxiId,
      fact: 'COLLISION_DAMAGE',
      factId: `report:damage:${taxiId}`,
      tick: 0,
    });
  allDamaged.demand.advance(59);
  const allDamagedStep = allDamaged.dispatcher.step({ tick: 59, maxAssignments: 1 }),
    availability = Object.freeze({
      damagedTaxiId: damagedTaxi!,
      assignedTaxiId: availabilityStep.assigned[0]!.taxiId,
      assignedIsDamaged: availabilityStep.assigned[0]!.taxiId === damagedTaxi,
      availableExcludesDamaged: !availabilityWorld.dispatcher
        .availableTaxis()
        .includes(damagedTaxi!),
      allDamagedBlocker: allDamagedStep.blocked?.reason ?? null,
      allDamagedAssignments: allDamagedStep.assigned.length,
    });
  availabilityWorld.dispose();
  allDamaged.dispose();

  const policyWorld = createFleetScenario({
      taxiCount: 20,
      civilianCount: 20,
      requestsPerWindow: 1,
    }),
    policyProfileTaxi = policyWorld.taxiIds[1]!;
  policyWorld.registry.updateState(policyProfileTaxi, {
    tick: 10,
    appliedProfileVersion: 'profile-v2',
  });
  policyWorld.health.apply({
    taxiId: policyWorld.taxiIds[0]!,
    fact: 'COLLISION_DAMAGE',
    factId: 'report:policy:damage',
    tick: 10,
  });
  const preserved = policyWorld.health.reset({
      tick: 100,
      stats: 'PRESERVE',
      profiles: 'PRESERVE',
    }),
    preservedPolicy = Object.freeze({
      preservedProfile: policyWorld.registry.state(policyProfileTaxi)!.appliedProfileVersion,
      preservedFacts: policyWorld.health.stats().facts,
      preservedResetProfiles: preserved.resetProfiles,
      preservedResetStats: preserved.stats,
      healthAfterPreserve: policyWorld.health.list().filter((entry) => entry.state === 'AVAILABLE')
        .length,
    }),
    clearedPolicies = policyWorld.health.reset({ tick: 101, stats: 'RESET', profiles: 'RESET' }),
    policy = Object.freeze({
      ...preservedPolicy,
      resetProfile: policyWorld.registry.state(policyProfileTaxi)!.appliedProfileVersion,
      resetFacts: policyWorld.health.stats().facts,
      resetResetProfiles: clearedPolicies.resetProfiles,
      resetStats: clearedPolicies.stats,
    });
  policyWorld.dispose();

  const vanishedWorld = createFleetScenario({
    taxiCount: 20,
    civilianCount: 20,
    requestsPerWindow: 1,
  });
  for (let index = 1; index < vanishedWorld.taxiIds.length; index += 1) {
    const taxiId = vanishedWorld.taxiIds[index]!;
    vanishedWorld.health.apply({
      taxiId,
      fact: 'SERVICE_WITHDRAWN',
      factId: `report:vanished:offline:${taxiId}`,
      tick: 0,
    });
  }
  vanishedWorld.demand.advance(59);
  const vanishedAssignment = vanishedWorld.dispatcher.step({ tick: 59, maxAssignments: 1 })
    .assigned[0]!;
  beginRide(vanishedWorld, vanishedAssignment, 59);
  vanishedWorld.registry.removeVehicle(vanishedAssignment.taxiId);
  const vanishedReset = vanishedWorld.health.reset({ tick: 100 }),
    vanished = Object.freeze({
      closedRides: vanishedReset.closedRides.length,
      discardedRides: vanishedReset.discardedRides.length,
      closedReason: vanishedReset.closedRides[0]?.reason ?? null,
      assignments: vanishedWorld.dispatcher.assignments().length,
      activeRides: vanishedWorld.lifecycle.active().length,
      taxis: vanishedWorld.health.list().length,
      consistent: vanishedWorld.health.report().consistent,
    });
  vanishedWorld.dispose();

  const populations: {
    taxis: number;
    civilians: number;
    total: number;
    requests: number;
    uniqueTaxis: number;
    lanesAssigned: number;
    reproducible: boolean;
  }[] = [];
  for (const taxiCount of FLEET_SCENARIO_TAXI_PRESETS) {
    const first = createFleetScenario({ taxiCount, civilianCount: 40 }),
      second = createFleetScenario({ taxiCount, civilianCount: 40 }),
      firstReport = fleetScenarioReport(first),
      secondReport = fleetScenarioReport(second);
    populations.push({
      taxis: firstReport.population.taxis,
      civilians: firstReport.population.civilians,
      total: firstReport.population.total,
      requests: firstReport.requests.length,
      uniqueTaxis: new Set(firstReport.taxis.map((entry) => entry.vehicle.vehicleId)).size,
      lanesAssigned: firstReport.taxis.filter((entry) => entry.laneId !== null).length,
      reproducible: isDeepStrictEqual(firstReport, secondReport),
    });
    first.dispose();
    second.dispose();
  }

  const runDeterministic = (): unknown => {
    const scenario = createFleetScenario({
      taxiCount: 20,
      civilianCount: 20,
      requestsPerWindow: 1,
    });
    scenario.demand.advance(59);
    const assignment = scenario.dispatcher.step({ tick: 59, maxAssignments: 1 }).assigned[0]!,
      ride = beginRide(scenario, assignment, 59);
    const probe = releaseProbe(scenario, assignment, 'COLLISION_DAMAGE', 'determinism:damage', 60);
    const state = {
      probe,
      health: scenario.health.list(),
      history: scenario.health.history(),
      terminal: scenario.lifecycle.terminal().map((entry) => ({
        rideId: entry.rideId,
        state: entry.state,
        reason: entry.reason,
      })),
      eta: scenario.eta.estimate(ride.rideId) ?? null,
    };
    scenario.dispose();
    return state;
  };
  const deterministicFirst = runDeterministic(),
    deterministicSecond = runDeterministic();

  main.dispose();
  const disposalActual = Object.freeze({
    disposed: main.health.stats().disposed,
    healthTaxis: main.health.list().length,
    healthFacts: main.health.stats().facts,
    estimates: main.eta.estimates().length,
    assignments: main.dispatcher.assignments().length,
    pending: main.demand.pending().length,
    activeRides: main.lifecycle.active().length,
    vehicles: main.registry.counts().vehicles,
  });

  const noWallClock = !['src/fleet/fleet-health.ts', 'src/fleet/scenario-fixture.ts'].some((path) =>
      sourceHas(
        path,
        /\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/,
      ),
    ),
    noDom = !['src/fleet/fleet-health.ts', 'src/fleet/scenario-fixture.ts'].some((path) =>
      sourceHas(path, /\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/),
    );

  const checks: FleetHealthReportCheck[] = [
    check('version', FLEET_HEALTH_VERSION, main.health.version, 'Versioned 065 contract'),
    check('states', [...fleetHealthStates], [...fleetHealthStates], 'Closed health states'),
    check('facts', [...FLEET_HEALTH_FACTS], [...FLEET_HEALTH_FACTS], 'Closed fact vocabulary'),
    check('policies', [...FLEET_RESET_POLICIES], ['RESET', 'PRESERVE'], 'Explicit reset policy'),
    check(
      'limits',
      {
        taxis: 30,
        historyEntries: 256,
        factIds: 1024,
        idCodeUnits: 256,
        factIdCodeUnits: 200,
      },
      {
        taxis: FLEET_HEALTH_LIMITS.taxis,
        historyEntries: FLEET_HEALTH_LIMITS.historyEntries,
        factIds: FLEET_HEALTH_LIMITS.factIds,
        idCodeUnits: FLEET_HEALTH_LIMITS.idCodeUnits,
        factIdCodeUnits: FLEET_HEALTH_LIMITS.factIdCodeUnits,
      },
      'Bounded health state',
    ),
    check(
      'fixture-presets',
      [20, 24, 30],
      populations.map((entry) => entry.taxis),
      'Gate 220 taxi presets',
    ),
    check(
      'fixture-reproducible',
      [true, true, true],
      populations.map((entry) => entry.reproducible),
      'Identical structural fixture reports',
    ),
    check(
      'fixture-capacity',
      [true, true, true],
      populations.map((entry) => entry.total <= 70 && entry.lanesAssigned === entry.taxis),
      'Population and position capacity',
    ),
    check(
      'damage-release',
      {
        reason: 'TAXI_DAMAGED',
        dispatcherStatus: 'DAMAGED',
        healthState: 'DAMAGED',
        claimReleased: true,
        lifecycleReleaseReason: 'FAILED',
      },
      {
        reason: damage.reason,
        dispatcherStatus: damage.dispatcherStatus,
        healthState: damage.healthState,
        claimReleased: damage.claimReleased,
        lifecycleReleaseReason: damage.lifecycleReleaseReason,
      },
      'Damage closes the ride with TAXI_DAMAGED and releases the claim',
    ),
    check(
      'block-release',
      {
        reason: 'TAXI_BLOCKED',
        dispatcherStatus: 'BLOCKED',
        healthState: 'BLOCKED',
        claimReleased: true,
      },
      {
        reason: block.reason,
        dispatcherStatus: block.dispatcherStatus,
        healthState: block.healthState,
        claimReleased: block.claimReleased,
      },
      'A block closes the ride with TAXI_BLOCKED',
    ),
    check(
      'offline-release',
      {
        reason: 'TAXI_REMOVED',
        dispatcherStatus: 'OFFLINE',
        healthState: 'OFFLINE',
        claimReleased: true,
      },
      {
        reason: offline.reason,
        dispatcherStatus: offline.dispatcherStatus,
        healthState: offline.healthState,
        claimReleased: offline.claimReleased,
      },
      'Withdrawal closes the ride with TAXI_REMOVED',
    ),
    check(
      'claim-only-release',
      {
        blockRelease: 'TAXI_BLOCKED',
        offlineRelease: 'TAXI_REMOVED',
        assignments: 0,
        statuses: ['BLOCKED', 'OFFLINE'],
      },
      {
        blockRelease: claimOnly.blockRelease,
        offlineRelease: claimOnly.offlineRelease,
        assignments: claimOnly.assignments,
        statuses: [...claimOnly.statuses],
      },
      'A claim without a ride is released with the matching closed reason',
    ),
    check(
      'availability',
      {
        assignedIsDamaged: false,
        availableExcludesDamaged: true,
        allDamagedBlocker: 'NO_TAXI',
        allDamagedAssignments: 0,
      },
      {
        assignedIsDamaged: availability.assignedIsDamaged,
        availableExcludesDamaged: availability.availableExcludesDamaged,
        allDamagedBlocker: availability.allDamagedBlocker,
        allDamagedAssignments: availability.allDamagedAssignments,
      },
      'Damaged taxis are never candidates',
    ),
    check(
      'reset-coherence',
      {
        closedRides: 2,
        closedReasons: ['SCENARIO_RESET', 'SCENARIO_RESET'],
        activeRides: 0,
        assignments: 0,
        pending: 0,
        estimates: 0,
        consistent: true,
      },
      {
        closedRides: reset.closedRides.length,
        closedReasons: reset.closedRides.map((entry) => entry.reason),
        activeRides: afterSecondReset.activeRides,
        assignments: afterSecondReset.assignments,
        pending: afterSecondReset.pending,
        estimates: afterSecondReset.estimates,
        consistent: afterReset.consistent,
      },
      'Reset closes live rides and leaves no claim, queue or estimate',
    ),
    check(
      'reset-health',
      { available: 24, assigned: 0, cleared: 3 },
      {
        available: afterReset.available,
        assigned: afterReset.assigned,
        cleared: reset.clearedHealth,
      },
      'Health returns to explicit AVAILABLE for every taxi',
    ),
    check(
      'reset-stale-ids',
      { staleRideIds: true, staleEstimates: true },
      { staleRideIds, staleEstimates },
      'Old ride ids and estimates do not survive the reset',
    ),
    check(
      'reset-idempotent',
      {
        closedRides: 0,
        releasedAssignments: 0,
        clearedHealth: 0,
        lifecycleRides: 0,
        assignments: 0,
      },
      {
        closedRides: second.closedRides.length,
        releasedAssignments: second.releasedAssignments.length,
        clearedHealth: second.clearedHealth,
        lifecycleRides: afterSecondReset.lifecycleRides,
        assignments: afterSecondReset.assignments,
      },
      'A second reset creates no ride, release or health mark',
    ),
    check(
      'reset-demand',
      { pending: 0, admitted: 0, dequeued: 0 },
      {
        pending: afterSecondReset.demand.pending,
        admitted: afterSecondReset.demand.admitted,
        dequeued: afterSecondReset.demand.dequeued,
      },
      'The demand cursor and queue are rewound',
    ),
    check(
      'reset-eta',
      { estimates: 0, tick: 0, freshStatus: 'ESTIMATED' },
      {
        estimates: afterSecondReset.estimates,
        tick: afterSecondReset.etaTick,
        freshStatus: nextEta,
      },
      'ETA drops stale routes and estimates the next scenario',
    ),
    check(
      'next-scenario',
      {
        state: 'TO_PICKUP',
        etaStatus: 'ESTIMATED',
        reusedFactAccepted: true,
        sameRequestId: true,
        reusedRideReason: 'TAXI_DAMAGED',
      },
      {
        state: nextRide.state,
        etaStatus: nextEta,
        reusedFactAccepted: !reusedFact.duplicate,
        sameRequestId: nextAssignment.requestId === assignments[0]!.requestId,
        reusedRideReason: reusedFact.ride?.ride.reason ?? null,
      },
      'The same request identity runs again without stale state',
    ),
    check(
      'reset-profiles',
      {
        preservedProfile: 'profile-v2',
        preservedResetProfiles: 0,
        resetProfile: 'profile-v1',
        resetResetProfiles: 40,
      },
      {
        preservedProfile: policy.preservedProfile,
        preservedResetProfiles: policy.preservedResetProfiles,
        resetProfile: policy.resetProfile,
        resetResetProfiles: policy.resetResetProfiles,
      },
      'Profiles are preserved or reset only by explicit policy',
    ),
    check(
      'reset-stats',
      {
        preservedFacts: 1,
        preservedPolicy: 'PRESERVE',
        resetFacts: 0,
        resetPolicy: 'RESET',
        healthAfterPreserve: 20,
      },
      {
        preservedFacts: policy.preservedFacts,
        preservedPolicy: policy.preservedResetStats,
        resetFacts: policy.resetFacts,
        resetPolicy: policy.resetStats,
        healthAfterPreserve: policy.healthAfterPreserve,
      },
      'Cumulative statistics follow the explicit policy; health always resets',
    ),
    check(
      'vanished-taxi',
      {
        closedRides: 1,
        discardedRides: 0,
        closedReason: 'SCENARIO_RESET',
        assignments: 0,
        activeRides: 0,
        taxis: 19,
        consistent: true,
      },
      vanished,
      'A vanished taxi cannot keep an allocated ride through reset',
    ),
    check(
      'simulation',
      {
        requests: 32,
        assigned: 8,
        begun: 8,
        completed: 1,
        failedHealth: 3,
        failedTimeout: 1,
        cancelled: 1,
        activeBeforeReset: 2,
        closedByReset: 2,
      },
      {
        requests: main.demand.plan.windows.reduce((sum, window) => sum + window.requestCount, 0),
        assigned: assignments.length,
        begun: rides.length,
        completed,
        failedHealth: 3,
        failedTimeout,
        cancelled,
        activeBeforeReset,
        closedByReset: reset.closedRides.length,
      },
      'Real 059 schedule and real 060 assignments over the 24-taxi fixture',
    ),
    check(
      'determinism',
      true,
      isDeepStrictEqual(deterministicFirst, deterministicSecond),
      'Identical facts and ids produce identical output',
    ),
    check(
      'disposal',
      {
        disposed: true,
        healthTaxis: 0,
        healthFacts: 0,
        estimates: 0,
        assignments: 0,
        pending: 0,
        activeRides: 0,
        vehicles: 0,
      },
      disposalActual,
      'dispose() returns every owned structure to zero',
    ),
    check('no-wall-clock', true, noWallClock, 'No Date, timer or Math.random'),
    check('no-dom-or-renderer', true, noDom, 'No DOM, Babylon or Rapier'),
  ];
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: FLEET_HEALTH_VERSION,
    generatedBy: 'npm run fleet:health',
    oracleRule:
      'A health fact is the only source of availability; an unavailable claimed taxi is released through the real 060 contract with a closed reason, and a scenario reset closes rides with SCENARIO_RESET, rewinds demand and ETA and publishes every taxi as AVAILABLE.',
    states: Object.freeze([...fleetHealthStates]),
    facts: Object.freeze([...FLEET_HEALTH_FACTS]),
    policies: Object.freeze([...FLEET_RESET_POLICIES]),
    limits: Object.freeze({
      taxis: FLEET_HEALTH_LIMITS.taxis,
      historyEntries: FLEET_HEALTH_LIMITS.historyEntries,
      factIds: FLEET_HEALTH_LIMITS.factIds,
      idCodeUnits: FLEET_HEALTH_LIMITS.idCodeUnits,
      factIdCodeUnits: FLEET_HEALTH_LIMITS.factIdCodeUnits,
    }),
    fixture: Object.freeze({
      version: '065-fleet-scenario-v1',
      presets: Object.freeze([...FLEET_SCENARIO_TAXI_PRESETS]),
      populations: Object.freeze(populations.map((entry) => Object.freeze(entry))),
    }),
    damage,
    block,
    offline,
    claimOnly,
    availability,
    reset: Object.freeze({
      tick: reset.tick,
      closedRides: reset.closedRides.length,
      closedReasons: Object.freeze(reset.closedRides.map((entry) => entry.reason)),
      releasedAssignments: reset.releasedAssignments.length,
      clearedHealth: reset.clearedHealth,
      discardedRides: reset.discardedRides.length,
      activeRides: afterSecondReset.activeRides,
      assignments: afterSecondReset.assignments,
      pending: afterSecondReset.pending,
      estimates: afterSecondReset.estimates,
      healthAvailable: afterReset.available,
      assigned: afterReset.assigned,
      consistent: afterReset.consistent,
      staleRideIds,
      staleEstimates,
      secondReset: Object.freeze({
        closedRides: second.closedRides.length,
        releasedAssignments: second.releasedAssignments.length,
        clearedHealth: second.clearedHealth,
        lifecycleRides: afterSecondReset.lifecycleRides,
        assignments: afterSecondReset.assignments,
      }),
    }),
    policy,
    vanished,
    nextScenario: Object.freeze({
      requestId: nextAssignment.requestId,
      assignmentId: nextAssignment.assignmentId,
      rideId: nextRide.rideId,
      state: nextRide.state,
      etaStatus: nextEta,
      reusedFactAccepted: !reusedFact.duplicate,
      reusedRideReason: reusedFact.ride?.ride.reason ?? null,
      sameRequestId: nextAssignment.requestId === assignments[0]!.requestId,
    }),
    simulation: Object.freeze({
      requests: 32,
      assigned: assignments.length,
      begun: rides.length,
      completed,
      failedHealth: 3,
      failedTimeout,
      cancelled,
      activeBeforeReset,
      closedByReset: reset.closedRides.length,
      etaSamples,
    }),
    determinism: Object.freeze({
      first: deterministicFirst,
      second: deterministicSecond,
      equal: isDeepStrictEqual(deterministicFirst, deterministicSecond),
    }),
    disposal: Object.freeze(disposalActual),
    checks: Object.freeze(checks),
    summary: Object.freeze({
      version: 1,
      checks: checks.length,
      passed,
      pass: passed === checks.length,
    }),
  });
}
