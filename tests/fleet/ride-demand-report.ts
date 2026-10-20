import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RIDE_DEMAND_LIMITS,
  RIDE_DEMAND_OVERFLOW_POLICY,
  RIDE_DEMAND_VERSION,
  createRideDemand,
} from '../../src/fleet';
import type {
  DemandLevel,
  RideDemandStats,
  RideRequest,
  RideRequestValidationStatus,
} from '../../src/fleet';
import {
  NEIGHBOURHOOD_MAP_ID,
  createLaneGraph,
  createNeighbourhoodMap,
  createRoutePlanner,
} from '../../src/world';
import {
  RIDE_DEMAND_WINDOWS,
  createRideWorld,
  disposeRideWorld,
  rideDemandPlan,
  singleWindow,
} from './ride-demand-fixture';

export interface RideReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface RideDemandReport {
  readonly version: typeof RIDE_DEMAND_VERSION;
  readonly generatedBy: 'npm run ride:demand';
  readonly oracleRule: string;
  readonly limits: typeof RIDE_DEMAND_LIMITS;
  readonly plan: Readonly<{
    scenarioId: string;
    mapId: string;
    seed: number;
    windows: number;
    requests: number;
    levels: Readonly<Record<DemandLevel, number>>;
    firstSpawnTick: number;
    lastSpawnTick: number;
  }>;
  readonly generated: Readonly<{
    requests: number;
    uniqueIds: number;
    valid: number;
    invalid: number;
    routeSearches: number;
    pendingAfterHorizon: number;
    admittedAfterHorizon: number;
  }>;
  readonly determinism: Readonly<{
    sameSeed: boolean;
    differentSeed: boolean;
    windowOrderIndependent: boolean;
    advanceGranularityIndependent: boolean;
    staleTickRejected: boolean;
  }>;
  readonly invalid: Readonly<{
    accessMismatch: RideRequestValidationStatus;
    unknownDestination: RideRequestValidationStatus;
    sameZone: RideRequestValidationStatus;
    blockedRoute: RideRequestValidationStatus;
    blockedRouteStatus: string | null;
  }>;
  readonly queue: Readonly<{
    policy: typeof RIDE_DEMAND_OVERFLOW_POLICY;
    limit: number;
    requests: number;
    admitted: number;
    pending: number;
    overflow: number;
    bounded: boolean;
  }>;
  readonly disposal: Readonly<{
    disposed: boolean;
    requests: number;
    pending: number;
    routeSearches: number;
    plannerOwned: boolean;
    plannerDisposed: boolean;
    externalPlannerAlive: boolean;
  }>;
  readonly schedule: readonly Readonly<{
    requestId: string;
    windowId: string;
    spawnTick: number;
    demandLevel: DemandLevel;
    originZoneId: string;
    destinationZoneId: string;
    validation: RideRequestValidationStatus;
  }>[];
  readonly checks: readonly RideReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(name: string, expected: unknown, actual: unknown, detail: string): RideReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function truthy(name: string, actual: boolean, detail: string): RideReportCheck {
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

function validationProbe(override: Record<string, unknown>) {
  const world = createRideWorld({ windows: singleWindow(override) }),
    request = world.demand.requests()[0]!,
    validation = world.demand.validation(request.requestId)!,
    advance = world.demand.advance(10),
    rejection = world.demand.rejections()[0]!;
  const result = {
    status: validation.status,
    pending: advance.pending.length,
    rejectionReason: rejection.reason,
    rejectionStatus: rejection.validationStatus,
  };
  disposeRideWorld(world);
  return result;
}

function blockedProbe() {
  const map = createNeighbourhoodMap(),
    graph = createLaneGraph(map),
    planner = createRoutePlanner({
      graph,
      map,
      graphVersion: '033-lane-graph-v1',
      costVersion: 'route-cost-v1',
      blocked: ['lane:02W0'],
    }),
    demand = createRideDemand({
      plan: rideDemandPlan({
        windows: singleWindow({ originZoneId: 'sz:0-2', destinationZoneId: 'sz:1-0' }),
      }),
      map,
      graph,
      planner,
    }),
    request = demand.requests()[0]!,
    validation = demand.validation(request.requestId)!,
    advance = demand.advance(10);
  const result = {
    status: validation.status,
    routeStatus: validation.routeStatus,
    pending: advance.pending.length,
  };
  demand.dispose();
  planner.dispose();
  return result;
}

function overflowProbe() {
  const world = createRideWorld(
      {
        windows: [
          {
            windowId: 'w:flood',
            startTick: 0,
            endTick: 100,
            demandLevel: 'HIGH',
            requestCount: 100,
            originZoneId: null,
            destinationZoneId: null,
          },
        ],
      },
      { demand: { queueLimit: 4 } },
    ),
    advance = world.demand.advance(100),
    stats = world.demand.stats(),
    result = {
      limit: stats.queueLimit,
      requests: stats.requests,
      admitted: advance.admitted.length,
      pending: advance.pending.length,
      overflow: stats.overflow,
      bounded: advance.pending.length <= stats.queueLimit,
    };
  disposeRideWorld(world);
  return result;
}

function disposalProbe() {
  const map = createNeighbourhoodMap(),
    demand = createRideDemand({ plan: rideDemandPlan(), map });
  demand.advance(1500);
  demand.dispose();
  demand.dispose();
  const stats: RideDemandStats = demand.stats(),
    disposed = {
      disposed: stats.disposed,
      requests: demand.requests().length,
      pending: demand.pending().length,
      routeSearches: stats.routeSearches,
      plannerOwned: stats.plannerOwned,
      plannerDisposed: stats.plannerDisposed,
    };
  const external = createRideWorld();
  external.demand.dispose();
  const externalPlannerAlive = !external.planner.getStats().disposed;
  external.planner.dispose();
  return { ...disposed, externalPlannerAlive };
}

export function runRideDemandReport(): RideDemandReport {
  const world = createRideWorld(),
    requests = world.demand.requests(),
    windows = new Map(world.demand.plan.windows.map((entry) => [entry.windowId, entry])),
    zones = new Map(world.map.serviceZones.map((zone) => [zone.id, zone])),
    levels: Record<DemandLevel, number> = { LOW: 0, NORMAL: 0, HIGH: 0 };
  for (const request of requests) levels[request.demandLevel] += 1;
  const schedule = requests.map((request: RideRequest) => ({
    requestId: request.requestId,
    windowId: request.windowId,
    spawnTick: request.spawnTick,
    demandLevel: request.demandLevel,
    originZoneId: request.originZoneId,
    destinationZoneId: request.destinationZoneId,
    validation: world.demand.validation(request.requestId)!.status,
  }));
  const horizon = world.demand.advance(1500),
    stats = world.demand.stats(),
    plan = world.demand.plan,
    planFrozen =
      Object.isFrozen(plan) &&
      Object.isFrozen(plan.windows) &&
      plan.windows.every((entry) => Object.isFrozen(entry)),
    readyValidations = requests.filter(
      (request) => world.demand.validation(request.requestId)?.status === 'READY',
    ).length,
    plannerReadyRoutes = requests.filter(
      (request) => world.demand.validation(request.requestId)?.routeStatus === 'READY',
    ).length;
  disposeRideWorld(world);

  const left = createRideWorld(),
    right = createRideWorld(),
    sameSeed = JSON.stringify(left.demand.requests()) === JSON.stringify(right.demand.requests());
  const otherSeed = createRideWorld({ seed: 59060 }),
    differentSeed =
      JSON.stringify(
        left.demand
          .requests()
          .map((request) => `${request.originZoneId}>${request.destinationZoneId}`),
      ) !==
      JSON.stringify(
        otherSeed.demand
          .requests()
          .map((request) => `${request.originZoneId}>${request.destinationZoneId}`),
      );
  disposeRideWorld(left);
  disposeRideWorld(right);
  disposeRideWorld(otherSeed);

  const reversed = createRideWorld({ windows: [...RIDE_DEMAND_WINDOWS].reverse() }),
    windowOrderIndependent =
      JSON.stringify(reversed.demand.requests()) === JSON.stringify(requests);
  disposeRideWorld(reversed);

  const oneStep = createRideWorld(),
    manySteps = createRideWorld();
  oneStep.demand.advance(1500);
  for (let tick = 0; tick < 1500; tick += 7) manySteps.demand.advance(tick);
  manySteps.demand.advance(1500);
  const advanceGranularityIndependent =
    JSON.stringify(oneStep.demand.pending()) === JSON.stringify(manySteps.demand.pending());
  disposeRideWorld(oneStep);
  disposeRideWorld(manySteps);

  const stale = createRideWorld();
  stale.demand.advance(100);
  const staleTickRejected = throws(() => stale.demand.advance(99), /Stale/);
  disposeRideWorld(stale);

  const accessMismatch = validationProbe({ destinationZoneId: 'sz:2-2' }),
    unknownDestination = validationProbe({ destinationZoneId: 'sz:missing' }),
    sameZone = validationProbe({ originZoneId: 'sz:1-1', destinationZoneId: 'sz:1-1' }),
    blocked = blockedProbe(),
    overflow = overflowProbe(),
    disposal = disposalProbe(),
    source = readFileSync(join(process.cwd(), 'src', 'fleet', 'ride-demand.ts'), 'utf8'),
    noWallClock =
      !/\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/.test(
        source,
      ),
    noDom = !/\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/.test(source);

  const checks: RideReportCheck[] = [
    check(
      'plan-map-id',
      { plan: NEIGHBOURHOOD_MAP_ID, map: world.map.mapId },
      { plan: plan.mapId, map: NEIGHBOURHOOD_MAP_ID },
      'The schedule is bound to the real 032 neighbourhood map.',
    ),
    check('plan-frozen', true, planFrozen, 'Plan, windows and entries are immutable.'),
    check('windows', 3, plan.windows.length, 'Three authored demand windows.'),
    check('requests', 32, requests.length, '12 morning + 12 peak + 8 evening requests.'),
    check(
      'unique-request-ids',
      requests.length,
      new Set(requests.map((request) => request.requestId)).size,
      '006 request identities are unique.',
    ),
    check(
      'canonical-order',
      true,
      requests.every(
        (request, index) =>
          index === 0 ||
          requests[index - 1]!.spawnTick < request.spawnTick ||
          (requests[index - 1]!.spawnTick === request.spawnTick &&
            requests[index - 1]!.requestId < request.requestId),
      ),
      'Order is spawn tick then request id, never insertion or Map order.',
    ),
    check(
      'demand-levels',
      { LOW: 8, NORMAL: 12, HIGH: 12 },
      levels,
      'Every request carries its window demand level.',
    ),
    check(
      'spawn-inside-window',
      requests.length,
      requests.filter((request) => {
        const entry = windows.get(request.windowId)!;
        return request.spawnTick >= entry.startTick && request.spawnTick < entry.endTick;
      }).length,
      'No request spawns before or after its schedule window.',
    ),
    check(
      'real-service-zones',
      requests.length,
      requests.filter(
        (request) => zones.has(request.originZoneId) && zones.has(request.destinationZoneId),
      ).length,
      'Origin and destination are real map service-zone ids.',
    ),
    check(
      'taxi-zone-access',
      requests.length,
      requests.filter(
        (request) =>
          zones.get(request.originZoneId)!.access.includes('TAXI') &&
          zones.get(request.destinationZoneId)!.access.includes('TAXI'),
      ).length,
      'Both zones admit the TAXI access class.',
    ),
    check(
      'pickup-dropoff-kinds',
      requests.length,
      requests.filter(
        (request) =>
          zones.get(request.originZoneId)!.kind !== 'DROPOFF' &&
          zones.get(request.destinationZoneId)!.kind !== 'PICKUP',
      ).length,
      'Origin is pickup-capable and destination is dropoff-capable.',
    ),
    check(
      'distinct-zones',
      requests.length,
      requests.filter((request) => request.originZoneId !== request.destinationZoneId).length,
      'A generated trip never starts and ends in the same service zone.',
    ),
    check(
      'ready-validations',
      requests.length,
      readyValidations,
      'Every impossible request is excluded before admission.',
    ),
    check(
      'planner-ready-routes',
      requests.length,
      plannerReadyRoutes,
      'Every admitted request was checked by the real 041 planner.',
    ),
    check(
      'route-searches',
      requests.length,
      stats.routeSearches,
      'One real planner query per generated request.',
    ),
    check(
      'pending-after-horizon',
      requests.length,
      horizon.pending.length,
      'All 32 valid requests fit the default bounded queue.',
    ),
    check(
      'admitted-after-horizon',
      requests.length,
      stats.admitted,
      'The horizon admits every valid request exactly once.',
    ),
    check(
      'no-future-admission',
      true,
      horizon.pending.every((request) => request.spawnTick <= 1500),
      'advance never admits a request before its scheduled tick.',
    ),
    truthy('same-seed', sameSeed, 'Two identical plans produce identical schedules.'),
    truthy('different-seed', differentSeed, 'A different seed changes the derived zone pairs.'),
    truthy(
      'window-order-independent',
      windowOrderIndependent,
      'Reversing the authored window array does not change the schedule.',
    ),
    truthy(
      'advance-granularity-independent',
      advanceGranularityIndependent,
      'One advance and 215 stepped advances admit the same stable queue.',
    ),
    truthy('stale-tick-rejected', staleTickRejected, 'A decreasing authoritative tick is refused.'),
    check(
      'invalid-destination',
      {
        status: 'ACCESS_MISMATCH',
        pending: 0,
        rejectionReason: 'INVALID_REQUEST',
        rejectionStatus: 'ACCESS_MISMATCH',
      },
      accessMismatch,
      'A CIVIL-only dropoff zone is refused for a TAXI request.',
    ),
    check(
      'unknown-destination',
      {
        status: 'UNKNOWN_DESTINATION',
        pending: 0,
        rejectionReason: 'INVALID_REQUEST',
        rejectionStatus: 'UNKNOWN_DESTINATION',
      },
      unknownDestination,
      'An id outside the map service zones is refused.',
    ),
    check(
      'same-zone',
      {
        status: 'SAME_ZONE',
        pending: 0,
        rejectionReason: 'INVALID_REQUEST',
        rejectionStatus: 'SAME_ZONE',
      },
      sameZone,
      'A trip with one zone is refused.',
    ),
    check(
      'blocked-route',
      { status: 'NO_ROUTE', routeStatus: 'BLOCKED', pending: 0 },
      blocked,
      'A blocked origin lane is refused before allocation.',
    ),
    check(
      'overflow-policy',
      {
        policy: 'REJECT_NEWEST',
        limit: 4,
        requests: 100,
        admitted: 4,
        pending: 4,
        overflow: 96,
        bounded: true,
      },
      { policy: RIDE_DEMAND_OVERFLOW_POLICY, ...overflow },
      'The queue is bounded and the newest overflow is explicitly rejected.',
    ),
    check(
      'clean-disposal',
      {
        disposed: true,
        requests: 0,
        pending: 0,
        routeSearches: 0,
        plannerOwned: true,
        plannerDisposed: true,
        externalPlannerAlive: true,
      },
      disposal,
      'Owned planner and request state go to zero; an injected planner stays caller-owned.',
    ),
    truthy('no-wall-clock', noWallClock, 'The source has no Date, timer or ambient randomness.'),
    truthy('no-dom-or-renderer', noDom, 'The source has no DOM, Babylon or Rapier dependency.'),
  ];
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: RIDE_DEMAND_VERSION,
    generatedBy: 'npm run ride:demand',
    oracleRule:
      'Schedule window + 006 seed derivation chooses real TAXI service zones; 041 findRoute must return READY before a request can enter the bounded FIFO queue.',
    limits: RIDE_DEMAND_LIMITS,
    plan: Object.freeze({
      scenarioId: plan.scenarioId,
      mapId: plan.mapId,
      seed: plan.seed,
      windows: plan.windows.length,
      requests: requests.length,
      levels: Object.freeze(levels),
      firstSpawnTick: requests[0]!.spawnTick,
      lastSpawnTick: requests[requests.length - 1]!.spawnTick,
    }),
    generated: Object.freeze({
      requests: requests.length,
      uniqueIds: new Set(requests.map((request) => request.requestId)).size,
      valid: stats.valid,
      invalid: stats.invalid,
      routeSearches: stats.routeSearches,
      pendingAfterHorizon: horizon.pending.length,
      admittedAfterHorizon: stats.admitted,
    }),
    determinism: Object.freeze({
      sameSeed,
      differentSeed,
      windowOrderIndependent,
      advanceGranularityIndependent,
      staleTickRejected,
    }),
    invalid: Object.freeze({
      accessMismatch: accessMismatch.status,
      unknownDestination: unknownDestination.status,
      sameZone: sameZone.status,
      blockedRoute: blocked.status,
      blockedRouteStatus: blocked.routeStatus,
    }),
    queue: Object.freeze({ policy: RIDE_DEMAND_OVERFLOW_POLICY, ...overflow }),
    disposal: Object.freeze(disposal),
    schedule: Object.freeze(schedule),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}
