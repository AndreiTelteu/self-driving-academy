import { performance } from 'node:perf_hooks';
import { createAmbientTraffic, createCompositionWorld } from '../../src/app';
import {
  LIVE_RIDES_LIMITS,
  LIVE_RIDES_VERSION,
  createFleetRegistry,
  createLiveRides,
} from '../../src/fleet';
import type {
  LiveRideFrameVehicle,
  LiveRideSnapshot,
  LiveRides,
  RideDemandRejection,
} from '../../src/fleet';
import { createLaneGraph, createRoutePlanner } from '../../src/world';
import type { RoutePlanner } from '../../src/world';
import type { LiveRideReleaseCause } from '../../src/fleet';

export const LIVE_RIDES_REPORT_VERSION = '264-live-rides-report-v1' as const;
export const LIVE_RIDES_COST_VERSION = '264-live-rides-cost-v1' as const;
/** Docs/25 laptop authoritative tick p95 budget; the live step is one subsystem, not the whole tick. */
export const LIVE_RIDES_TICK_BUDGET_MS = 8 as const;

export interface LiveRidesReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LiveRidesReport {
  readonly version: typeof LIVE_RIDES_REPORT_VERSION;
  readonly contract: typeof LIVE_RIDES_VERSION;
  readonly fixture: Readonly<{
    taxis: number;
    civilians: number;
    seed: number;
    scenarioId: string;
    namespace: string;
    planWindows: number;
    requests: number;
    ticks: number;
    resetTick: number;
  }>;
  readonly plan: Readonly<{
    valid: number;
    invalid: number;
    firstSpawnTick: number;
    lastSpawnTick: number;
    uniqueOrigins: number;
    uniqueDestinations: number;
    sameSeed: boolean;
    seedMovesZones: boolean;
    realZones: boolean;
  }>;
  readonly queue: Readonly<{
    limit: number;
    peak: number;
    policy: string;
    overflow: number;
    bounded: boolean;
    overflowFixture: Readonly<{
      limit: number;
      peak: number;
      overflow: number;
      pending: number;
      rejectedSecondWindow: boolean;
    }>;
  }>;
  readonly dispatch: Readonly<{
    assignments: number;
    releases: number;
    dispatchSteps: number;
    routeSearches: number;
    maxSearchesPerStep: number;
    routeSearchBudget: number;
    maxAssignmentsPerStep: number;
    assignmentsPerDispatch: number;
    uniqueRequests: number;
    uniqueTaxis: number;
    minCost: Readonly<{
      expectedTaxi: string;
      expectedCost: number;
      actualTaxi: string;
      actualCost: number;
      pass: boolean;
    }> | null;
    tripCostMismatch: number;
    releasesByCause: Readonly<Record<LiveRideReleaseCause, number>>;
  }>;
  readonly reset: Readonly<{
    releasedAssignments: number;
    preservedStats: boolean;
    activeAfterReset: number;
    assignmentsAfterReset: number;
    duplicateActive: number;
    identityMismatches: number;
    statesAfterReset: Readonly<Record<string, number>>;
  }>;
  readonly state: Readonly<{
    statesBeforeReset: Readonly<Record<string, number>>;
    statesAfterReset: Readonly<Record<string, number>>;
    consumed: number;
    activeRequests: number;
    activeTaxis: number;
  }>;
  readonly checks: readonly LiveRidesReportCheck[];
  readonly summary: Readonly<{
    version: typeof LIVE_RIDES_REPORT_VERSION;
    checks: number;
    passed: number;
    pass: boolean;
  }>;
}

interface SimulatedRideFleet {
  readonly ambient: ReturnType<typeof createAmbientTraffic>;
  readonly live: LiveRides;
  readonly planner: RoutePlanner;
  readonly blocked: Set<string>;
  readonly player: { value: string | null };
  tick: number;
  step(atTick: number): ReturnType<LiveRides['step']>;
  advanceTraffic(atTick: number): void;
  frame(): readonly LiveRideFrameVehicle[];
  dispose(): void;
}

function createSimulatedFleet(
  overrides: Record<string, unknown> = {},
  taxiCount = 24,
  civilians = 32,
): SimulatedRideFleet {
  const world = createCompositionWorld();
  const ambient = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: {
      schemaVersion: 1,
      units: 'SI',
      sessionId: 'session-264-report',
      worldEpoch: 1,
    },
    seed: 262,
    taxiCount,
    civilianCount: civilians,
    focus: { x: world.spawn.x, z: world.spawn.z },
  });
  const live = createLiveRides({
    registry: ambient.registry,
    map: world.map,
    graph: world.graph,
    seed: ambient.seed,
    scenarioId: 'v3-live-city-264-report',
    namespace: 'report:264:rides',
    ...overrides,
  });
  const planner = createRoutePlanner({
    graph: createLaneGraph(world.map),
    map: world.map,
    graphVersion: '033-lane-graph-v1',
    costVersion: 'route-cost-v1',
  });
  const fleet: SimulatedRideFleet = {
    ambient,
    live,
    planner,
    blocked: new Set<string>(),
    player: { value: null },
    tick: 0,
    advanceTraffic(atTick: number): void {
      ambient.traffic.step({ tick: atTick, dtSeconds: 1 / 60, vehicles: [] });
    },
    frame(): readonly LiveRideFrameVehicle[] {
      return ambient.list().map((actor) => ({
        vehicleId: actor.vehicleId,
        driverKind: actor.driverKind,
        laneId: actor.laneId,
        blocked: fleet.blocked.has(actor.vehicleId) || actor.blocked,
        controlMode: actor.authority,
      }));
    },
    step(atTick: number): ReturnType<LiveRides['step']> {
      if (atTick <= fleet.tick) throw new Error(`Report tick ${atTick} after ${fleet.tick}`);
      fleet.advanceTraffic(atTick);
      fleet.tick = atTick;
      return live.step({
        tick: atTick,
        vehicles: fleet.frame(),
        playerVehicleId: fleet.player.value,
      });
    },
    dispose(): void {
      live.dispose();
      planner.dispose();
      ambient.dispose();
    },
  };
  return fleet;
}

function taxiIds(fleet: SimulatedRideFleet): readonly string[] {
  return fleet.ambient.registry
    .list()
    .filter((vehicle) => vehicle.driverKind === 'TAXI')
    .map((vehicle) => vehicle.vehicleId)
    .sort();
}

function laneFor(fleet: SimulatedRideFleet, taxiId: string): string | null {
  return fleet.ambient.traffic.get(taxiId)?.laneId ?? null;
}

function check(
  name: string,
  expected: LiveRidesReportCheck['expected'],
  actual: LiveRidesReportCheck['actual'],
  detail: string,
): LiveRidesReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function stateCounts(snapshot: LiveRideSnapshot): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const request of snapshot.requests) counts[request.state] = (counts[request.state] ?? 0) + 1;
  return counts;
}

function peakPending(peaks: number[], value: number): void {
  peaks[0] = Math.max(peaks[0] ?? 0, value);
}

/** Deterministic live report: real 24-taxi/32-civilian fleet, real 041 routes, no timing. */
export function runLiveRidesReport(): LiveRidesReport {
  const fleet = createSimulatedFleet();
  const peaks = [0];
  const banned = new Set<string>();
  let playerBan: string | null = null;
  let playerAssignedWhileTaken = 0;
  const bannedAssigned: string[] = [];
  let minCost: LiveRidesReport['dispatch']['minCost'] = null;
  let tripCostMismatch = 0;
  const usedForRelease = new Set<string>();
  const releaseAt = new Map<number, string>();

  const markAssigned = (tick: number, status: 'DAMAGED' | 'OFFLINE' | 'BLOCKED'): void => {
    const snapshot = fleet.live.snapshot(),
      assignment = snapshot.assignments.find((entry) => !usedForRelease.has(entry.taxiId));
    if (assignment === undefined) return;
    usedForRelease.add(assignment.taxiId);
    releaseAt.set(tick, assignment.taxiId);
    if (status === 'BLOCKED') fleet.blocked.add(assignment.taxiId);
    else fleet.live.setTaxiStatus(assignment.taxiId, status);
    banned.add(assignment.taxiId);
  };

  try {
    for (let tick = 1; tick <= 900; tick += 1) {
      if (tick === 60) {
        // The dispatch cost is the real 041 taxi->pickup time at assignment. Verify the accepted
        // assignment against every available taxi before the authoritative live step.
        fleet.advanceTraffic(60);
        fleet.tick = 60;
        const request = fleet.live.demand.requests()[0]!,
          available = taxiIds(fleet);
        let expected: { taxiId: string; costSeconds: number } | null = null;
        for (const taxiId of available) {
          const lane = laneFor(fleet, taxiId);
          if (lane === null) continue;
          const pickup = fleet.planner.findRoute({
            origin: lane,
            destination: request.originZoneId,
            access: 'TAXI',
          });
          if (pickup.status !== 'READY' || pickup.path === null) continue;
          if (
            expected === null ||
            pickup.costSeconds < expected.costSeconds ||
            (pickup.costSeconds === expected.costSeconds && taxiId < expected.taxiId)
          )
            expected = { taxiId, costSeconds: pickup.costSeconds };
        }
        const result = fleet.live.step({
          tick: 60,
          vehicles: fleet.frame(),
          playerVehicleId: null,
        });
        const assignment = fleet.live
          .snapshot()
          .assignments.find((entry) => entry.requestId === request.requestId);
        if (expected !== null && assignment !== undefined)
          minCost = {
            expectedTaxi: expected.taxiId,
            expectedCost: expected.costSeconds,
            actualTaxi: assignment.taxiId,
            actualCost: assignment.pickupCostSeconds,
            pass:
              assignment.taxiId === expected.taxiId &&
              Math.abs(assignment.pickupCostSeconds - expected.costSeconds) < 1e-9,
          };
        if (result.released.length > 0) throw new Error('Unexpected release at tick 60');
      } else if (tick === 130) {
        const assignment = fleet.live.snapshot().assignments[0];
        if (assignment !== undefined) {
          fleet.player.value = assignment.taxiId;
          fleet.ambient.traffic.setAuthority(assignment.taxiId, 'MANUAL', 129);
          playerBan = assignment.taxiId;
        }
        fleet.step(130);
      } else if (tick === 180) {
        if (fleet.player.value !== null)
          fleet.ambient.traffic.setAuthority(fleet.player.value, 'AUTO', 179);
        fleet.player.value = null;
        playerBan = null;
        fleet.step(180);
      } else if (tick === 220) {
        markAssigned(220, 'DAMAGED');
        fleet.step(220);
      } else if (tick === 280) {
        markAssigned(280, 'OFFLINE');
        fleet.step(280);
      } else if (tick === 340) {
        markAssigned(340, 'BLOCKED');
        fleet.step(340);
      } else {
        fleet.step(tick);
      }
      const snapshot = fleet.live.snapshot();
      peakPending(peaks, snapshot.counts.pending);
      for (const assignment of snapshot.assignments) {
        if (banned.has(assignment.taxiId)) bannedAssigned.push(assignment.taxiId);
        if (playerBan !== null && assignment.taxiId === playerBan) playerAssignedWhileTaken += 1;
      }
    }
    const beforeReset = fleet.live.snapshot();
    const requests = fleet.live.demand.requests();
    const replayWorld = createCompositionWorld();
    const mapZones = new Map(replayWorld.map.serviceZones.map((zone) => [zone.id, zone]));
    const realZones = requests.every((request) => {
      const origin = mapZones.get(request.originZoneId),
        destination = mapZones.get(request.destinationZoneId);
      return (
        origin !== undefined &&
        destination !== undefined &&
        origin.access.includes('TAXI') &&
        destination.access.includes('TAXI') &&
        origin.kind !== 'DROPOFF' &&
        destination.kind !== 'PICKUP' &&
        request.originZoneId !== request.destinationZoneId
      );
    });
    const tripMismatches = beforeReset.assignments.filter((assignment) => {
      const trip = fleet.planner.findRoute({
        origin: assignment.pickupZoneId,
        destination: assignment.dropoffZoneId,
        access: 'TAXI',
      });
      return (
        trip.status !== 'READY' ||
        trip.path === null ||
        Math.abs(trip.costSeconds - assignment.tripCostSeconds) > 1e-9
      );
    }).length;
    tripCostMismatch = tripMismatches;
    const activeRequests = new Set(
      beforeReset.assignments.map((assignment) => assignment.requestId),
    );
    const activeTaxis = new Set(beforeReset.assignments.map((assignment) => assignment.taxiId));
    const identities = new Map(
      beforeReset.assignments.map((assignment) => [
        `${assignment.requestId}:${assignment.taxiId}`,
        assignment.assignmentId,
      ]),
    );
    const releasedByCause = beforeReset.totals.releasesByCause;
    const totalsBeforeReset = beforeReset.totals,
      assignmentsBeforeReset = beforeReset.assignments.length;

    // 059 deterministic replay: same seed, identical requests; another seed moves the zones.
    const same = createLiveRides({
      registry: fleet.ambient.registry,
      map: replayWorld.map,
      graph: replayWorld.graph,
      seed: fleet.ambient.seed,
      scenarioId: 'v3-live-city-264-report',
      namespace: 'report:264:rides',
    });
    const other = createLiveRides({
      registry: fleet.ambient.registry,
      map: replayWorld.map,
      graph: replayWorld.graph,
      seed: fleet.ambient.seed + 1,
      scenarioId: 'v3-live-city-264-report',
      namespace: 'report:264:rides',
    });
    let sameSeed = false,
      seedMovesZones = false;
    try {
      sameSeed =
        JSON.stringify(same.demand.requests()) === JSON.stringify(fleet.live.demand.requests());
      const left = same.demand.requests(),
        right = other.demand.requests();
      seedMovesZones = left.some(
        (request, index) =>
          request.originZoneId !== right[index]!.originZoneId ||
          request.destinationZoneId !== right[index]!.destinationZoneId,
      );
    } finally {
      same.dispose();
      other.dispose();
    }

    // Bounded queue fixture: 8-request queue with no dispatch before the overflow is observed.
    const overflowWorld = createCompositionWorld();
    const overflowRegistry = createFleetRegistry({
      schemaVersion: 1,
      units: 'SI',
      sessionId: 'session-264-overflow',
      worldEpoch: 1,
      scenarioId: 'v3-live-city-264-overflow',
      seed: 264,
      namespace: 'report:264:overflow',
      taxiCount: 24,
      civilianCount: 20,
      profile: { profileId: 'city:common', versionId: 'profile-v1' },
    });
    const overflowLive = createLiveRides({
      registry: overflowRegistry,
      map: overflowWorld.map,
      graph: overflowWorld.graph,
      seed: 264,
      scenarioId: 'v3-live-city-264-overflow',
      namespace: 'report:264:overflow',
      queueLimit: 8,
      firstSpawnTick: 0,
      windowSpanTicks: 60,
      windows: 2,
      requestsPerWindow: 8,
      dispatchEveryTicks: 600,
    });
    const overflowPeaks = [0];
    let overflowSnapshot: LiveRideSnapshot;
    let overflowRejections: readonly RideDemandRejection[];
    try {
      for (let tick = 1; tick <= 120; tick += 1) {
        overflowLive.step({ tick, vehicles: [], playerVehicleId: null });
        peakPending(overflowPeaks, overflowLive.snapshot().counts.pending);
      }
      overflowSnapshot = overflowLive.snapshot();
      overflowRejections = overflowLive.demand.rejections();
    } finally {
      overflowLive.dispose();
      overflowRegistry.dispose();
    }
    const overflowIds = new Set(overflowRejections.map((rejection) => rejection.requestId));
    const overflowWindows = overflowSnapshot.requests
      .filter((request) => overflowIds.has(request.requestId))
      .map((request) => request.windowId);
    const queueBounded =
      overflowPeaks[0]! <= 8 &&
      overflowSnapshot.queue.limit === 8 &&
      overflowSnapshot.totals.overflow > 0 &&
      overflowSnapshot.counts.pending === 8;

    const reset = fleet.live.reset({ tick: 900, preserveStats: true });
    const afterResetStart = fleet.live.snapshot();
    for (let tick = 901; tick <= 1080; tick += 1) fleet.step(tick);
    const afterReset = fleet.live.snapshot();
    const postRequests = new Set(afterReset.assignments.map((assignment) => assignment.requestId));
    const postTaxis = new Set(afterReset.assignments.map((assignment) => assignment.taxiId));
    const duplicateActive = afterReset.assignments.length - postRequests.size;
    const identityMismatches = afterReset.assignments.filter((assignment) => {
      const prior = identities.get(`${assignment.requestId}:${assignment.taxiId}`);
      return prior !== undefined && prior !== assignment.assignmentId;
    }).length;
    const postStates = stateCounts(afterReset);
    const consumed = postStates.CONSUMED ?? 0;
    const excludedBanned = bannedAssigned.length === 0 && playerAssignedWhileTaken === 0;
    const checks: LiveRidesReportCheck[] = [
      check('fleet-taxis', 24, beforeReset.counts.taxis, 'the live 057 fleet is 24 taxis'),
      check(
        'fleet-civilians',
        32,
        fleet.ambient.report().counts.civilians,
        'the real live composition keeps 32 civilians',
      ),
      check('plan-windows', LIVE_RIDES_LIMITS.windows, beforeReset.counts.windows, '059 windows'),
      check('plan-requests', 64, beforeReset.counts.requests, '8 windows x 8 requests'),
      check('first-spawn-tick', 60, requests[0]!.spawnTick, 'first live request at tick 60'),
      check(
        'spawn-tick-window',
        true,
        requests.every((request) => request.spawnTick >= 60 && request.spawnTick < 540),
        'every request stays inside its authored window',
      ),
      check(
        'request-ids-unique',
        requests.length,
        new Set(requests.map((request) => request.requestId)).size,
        'stable 006 request identities',
      ),
      check('zones-real', true, realZones, 'all pickup/dropoff ids exist in the real 032 map'),
      check(
        'zones-taxi-access',
        true,
        requests.every((request) => request.access === 'TAXI'),
        'TAXI access',
      ),
      check(
        'zones-kind',
        true,
        requests.every((request) => request.originZoneId !== request.destinationZoneId),
        'pickup and dropoff are different real service zones',
      ),
      check('seed-deterministic', true, sameSeed, 'same seed yields identical request list'),
      check('seed-varies-zones', true, seedMovesZones, 'a different seed chooses different zones'),
      check('queue-policy', 'REJECT_NEWEST', beforeReset.queue.policy, 'explicit 059 policy'),
      check('queue-bounded', true, queueBounded, 'overflow fixture never exceeds 8 pending'),
      check(
        'queue-overflow',
        true,
        overflowSnapshot.totals.overflow > 0,
        'newest requests rejected',
      ),
      check(
        'queue-rejects-only-second-window',
        true,
        overflowWindows.every((windowId) => windowId === 'w001'),
        'the first 8 requests stay queued; later ones are rejected',
      ),
      check('dispatch-assignments', true, beforeReset.assignments.length > 0, 'real claims exist'),
      check(
        'assignment-requests-unique',
        beforeReset.assignments.length,
        activeRequests.size,
        'one active taxi per request',
      ),
      check(
        'assignment-taxis-unique',
        beforeReset.assignments.length,
        activeTaxis.size,
        'one active request per taxi',
      ),
      check(
        'minimum-pickup-cost',
        true,
        minCost?.pass === true,
        minCost === null
          ? 'no assignment observed'
          : `expected ${minCost.expectedTaxi} ${minCost.expectedCost}; actual ${minCost.actualTaxi} ${minCost.actualCost}`,
      ),
      check(
        'both-legs-replanned',
        true,
        beforeReset.assignments.every(
          (assignment) =>
            assignment.pickupRouteLaneIds.length > 0 &&
            assignment.tripRouteLaneIds.length > 0 &&
            Number.isFinite(assignment.pickupCostSeconds) &&
            assignment.pickupCostSeconds >= 0 &&
            Number.isFinite(assignment.tripCostSeconds) &&
            assignment.tripCostSeconds > 0,
        ),
        'pickup and trip paths with finite real costs',
      ),
      check(
        'trip-cost-matches-041',
        0,
        tripCostMismatch,
        'replanned trip cost equals a fresh 041 query',
      ),
      check(
        'search-budget',
        true,
        totalsBeforeReset.maxSearchesPerStep <= beforeReset.queue.routeSearchBudget,
        `max ${totalsBeforeReset.maxSearchesPerStep} of ${beforeReset.queue.routeSearchBudget}`,
      ),
      check(
        'assignment-budget',
        true,
        totalsBeforeReset.maxAssignmentsPerStep <= beforeReset.queue.assignmentsPerDispatch,
        `max ${totalsBeforeReset.maxAssignmentsPerStep} of ${beforeReset.queue.assignmentsPerDispatch}`,
      ),
      check(
        'exclusion-player',
        true,
        releasedByCause.PLAYER_TAKEOVER === 1 && playerAssignedWhileTaken === 0,
        `${playerAssignedWhileTaken} assignments while player-driven; ${releasedByCause.PLAYER_TAKEOVER} release`,
      ),
      check(
        'exclusion-damaged',
        true,
        releasedByCause.DAMAGED === 1 && !bannedAssigned.includes(releaseAt.get(220) ?? ''),
        `${releasedByCause.DAMAGED} damaged releases, no reassignment`,
      ),
      check(
        'exclusion-offline',
        true,
        releasedByCause.OFFLINE === 1 && !bannedAssigned.includes(releaseAt.get(280) ?? ''),
        `${releasedByCause.OFFLINE} offline releases, no reassignment`,
      ),
      check(
        'exclusion-blocked',
        true,
        releasedByCause.BLOCKED === 1 && !bannedAssigned.includes(releaseAt.get(340) ?? ''),
        `${releasedByCause.BLOCKED} blocked releases, no reassignment`,
      ),
      check(
        'exclusion-overall',
        true,
        excludedBanned,
        'no unavailable or player-driven taxi is proposed',
      ),
      check(
        'reset-releases-active',
        assignmentsBeforeReset,
        reset.releasedAssignments,
        'reset releases every claim',
      ),
      check(
        'reset-zero-active',
        0,
        afterResetStart.assignments.length,
        'no claim survives the reset',
      ),
      check(
        'reset-preserves-stats',
        totalsBeforeReset.assignments,
        fleet.live.stats().assignments - afterReset.assignments.length,
        'preserveStats keeps cumulative assignments; new claims add to them',
      ),
      check(
        'reset-no-duplicate-active',
        0,
        duplicateActive,
        'post-reset active request map has no duplicates',
      ),
      check(
        'reset-unique-taxis',
        afterReset.assignments.length,
        postTaxis.size,
        'post-reset active taxi map has one claim per taxi',
      ),
      check(
        'reset-stable-identities',
        0,
        identityMismatches,
        'same request/taxi keeps the same assignment id',
      ),
      check('state-no-consumed', 0, consumed, 'every consumed request has a visible state'),
      check(
        'state-assigned-consistent',
        afterReset.assignments.length,
        afterReset.requests.filter((request) => request.state === 'ASSIGNED').length,
        'ASSIGNED rows equal active 060 claims',
      ),
      check(
        'state-closed',
        true,
        afterReset.requests.every((request) =>
          [
            'SCHEDULED',
            'PENDING',
            'ASSIGNED',
            'RELEASED',
            'REJECTED_INVALID',
            'REJECTED_QUEUE',
            'REJECTED_NO_ROUTE',
            'CONSUMED',
          ].includes(request.state),
        ),
        'request states stay inside the documented vocabulary',
      ),
      check('version', LIVE_RIDES_VERSION, afterReset.version, 'live rides contract version'),
    ];
    const passed = checks.filter((entry) => entry.pass).length;
    return {
      version: LIVE_RIDES_REPORT_VERSION,
      contract: LIVE_RIDES_VERSION,
      fixture: {
        taxis: 24,
        civilians: 32,
        seed: fleet.ambient.seed,
        scenarioId: 'v3-live-city-264-report',
        namespace: 'report:264:rides',
        planWindows: beforeReset.counts.windows,
        requests: beforeReset.counts.requests,
        ticks: 900,
        resetTick: 900,
      },
      plan: {
        valid: beforeReset.counts.valid,
        invalid: beforeReset.counts.invalid,
        firstSpawnTick: requests[0]!.spawnTick,
        lastSpawnTick: requests.at(-1)!.spawnTick,
        uniqueOrigins: new Set(requests.map((request) => request.originZoneId)).size,
        uniqueDestinations: new Set(requests.map((request) => request.destinationZoneId)).size,
        sameSeed,
        seedMovesZones,
        realZones,
      },
      queue: {
        limit: beforeReset.queue.limit,
        peak: peaks[0]!,
        policy: beforeReset.queue.policy,
        overflow: beforeReset.totals.overflow,
        bounded: peaks[0]! <= beforeReset.queue.limit && beforeReset.totals.overflow === 0,
        overflowFixture: {
          limit: 8,
          peak: overflowPeaks[0]!,
          overflow: overflowSnapshot.totals.overflow,
          pending: overflowSnapshot.counts.pending,
          rejectedSecondWindow: overflowWindows.every((windowId) => windowId === 'w001'),
        },
      },
      dispatch: {
        assignments: beforeReset.totals.assignments,
        releases: beforeReset.totals.releases,
        dispatchSteps: beforeReset.totals.dispatchSteps,
        routeSearches: beforeReset.totals.routeSearches,
        maxSearchesPerStep: beforeReset.totals.maxSearchesPerStep,
        routeSearchBudget: beforeReset.queue.routeSearchBudget,
        maxAssignmentsPerStep: beforeReset.totals.maxAssignmentsPerStep,
        assignmentsPerDispatch: beforeReset.queue.assignmentsPerDispatch,
        uniqueRequests: activeRequests.size,
        uniqueTaxis: activeTaxis.size,
        minCost,
        tripCostMismatch,
        releasesByCause: releasedByCause,
      },
      reset: {
        releasedAssignments: reset.releasedAssignments,
        preservedStats: reset.preserveStats,
        activeAfterReset: afterResetStart.assignments.length,
        assignmentsAfterReset: afterReset.assignments.length,
        duplicateActive,
        identityMismatches,
        statesAfterReset: postStates,
      },
      state: {
        statesBeforeReset: stateCounts(beforeReset),
        statesAfterReset: postStates,
        consumed,
        activeRequests: activeRequests.size,
        activeTaxis: activeTaxis.size,
      },
      checks,
      summary: {
        version: LIVE_RIDES_REPORT_VERSION,
        checks: checks.length,
        passed,
        pass: passed === checks.length,
      },
    };
  } finally {
    fleet.dispose();
  }
}

export interface LiveRidesCostProbe {
  readonly version: typeof LIVE_RIDES_COST_VERSION;
  readonly protocol: Readonly<{
    warmupTicks: number;
    measuredTicks: number;
    repetitions: number;
    tickHz: number;
    dispatchEveryTicks: number;
    budgetMs: number;
    note: string;
  }>;
  readonly liveStep: Readonly<{
    samples: number;
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
  }>;
  readonly dispatchStep: Readonly<{
    samples: number;
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
  }>;
  readonly routeSearches: Readonly<{
    maxPerStep: number;
    budget: number;
    total: number;
  }>;
  readonly amortizedPerTickMs: number;
  readonly budgetShare: number;
  readonly pass: boolean;
}

function summary(samples: readonly number[]): LiveRidesCostProbe['liveStep'] {
  if (samples.length === 0)
    return Object.freeze({ samples: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 });
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))]!;
  return Object.freeze({
    samples: sorted.length,
    meanMs: sorted.reduce((total, value) => total + value, 0) / sorted.length,
    p50Ms: at(0.5),
    p95Ms: Math.max(at(0.95), at(0.5)),
    maxMs: sorted[sorted.length - 1]!,
  });
}

/**
 * Headless Node probe of the additional `live.step` cost. It measures only the new subsystem on top
 * of the existing world: no renderer, browser frame, GPU, civil-traffic step or hardware certificate.
 */
export function measureLiveRidesCost(): LiveRidesCostProbe {
  const liveStepSamples: number[] = [],
    dispatchSamples: number[] = [];
  let maxSearches = 0,
    searchBudget = 0,
    totalSearches = 0,
    final: LiveRideSnapshot | undefined;
  for (let repetition = 0; repetition < 3; repetition += 1) {
    const fleet = createSimulatedFleet();
    try {
      // Warm up the deterministic routes and the real 041 planner cache, then measure the burst in
      // which the 64 live requests are admitted and dispatched to the 24 real taxis.
      for (let tick = 1; tick <= 30; tick += 1) fleet.step(tick);
      for (let offset = 0; offset < 300; offset += 1) {
        const tick = fleet.tick + 1;
        fleet.advanceTraffic(tick);
        fleet.tick = tick;
        const started = performance.now();
        const result = fleet.live.step({
          tick,
          vehicles: fleet.frame(),
          playerVehicleId: fleet.player.value,
        });
        const elapsed = performance.now() - started;
        liveStepSamples.push(elapsed);
        if (result.dispatchRan) dispatchSamples.push(elapsed);
      }
      const snapshot = fleet.live.snapshot();
      maxSearches = Math.max(maxSearches, snapshot.totals.maxSearchesPerStep);
      searchBudget = snapshot.queue.routeSearchBudget;
      totalSearches += snapshot.totals.routeSearches;
      final = snapshot;
    } finally {
      fleet.dispose();
    }
  }
  const liveStep = summary(liveStepSamples),
    dispatchStep = summary(dispatchSamples),
    measuredTicks = 300 * 3,
    budget = LIVE_RIDES_TICK_BUDGET_MS,
    amortizedPerTickMs = liveStep.meanMs,
    budgetShare = amortizedPerTickMs / budget;
  return Object.freeze({
    version: LIVE_RIDES_COST_VERSION,
    protocol: Object.freeze({
      warmupTicks: 30,
      measuredTicks,
      repetitions: 3,
      tickHz: 60,
      dispatchEveryTicks: LIVE_RIDES_LIMITS.dispatchEveryTicks,
      budgetMs: budget,
      note: 'Headless Node subsystem step on a fresh real fleet per repetition, no renderer, no GPU and no browser frame; not a hardware or FPS certificate.',
    }),
    liveStep,
    dispatchStep,
    routeSearches: Object.freeze({
      maxPerStep: maxSearches,
      budget: searchBudget,
      total: totalSearches,
    }),
    amortizedPerTickMs,
    budgetShare,
    pass: amortizedPerTickMs <= budget && final !== undefined && maxSearches <= searchBudget,
  });
}
