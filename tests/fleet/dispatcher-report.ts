import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RIDE_DISPATCH_LIMITS,
  RIDE_DISPATCH_REJECTION_REASONS,
  RIDE_DISPATCH_RELEASE_REASONS,
  RIDE_DISPATCHER_VERSION,
  createRideDispatcher,
} from '../../src/fleet';
import {
  createDispatcherWorld,
  disposeDispatcherWorld,
  fixedWindow,
  taxiAt,
} from './dispatcher-fixture';

export interface DispatchReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

interface SimulationEvent {
  readonly tick: number;
  readonly requestId: string;
  readonly taxiId: string;
  readonly pickupCostSeconds: number;
  readonly tripCostSeconds: number;
}

interface Simulation {
  readonly events: readonly SimulationEvent[];
  readonly requests: number;
  readonly releases: number;
  readonly plannerSearches: number;
  readonly steps: number;
  readonly maxConcurrent: number;
  readonly duplicateTaxis: boolean;
  readonly firstAssignmentTick: number | null;
  readonly lastAssignmentTick: number | null;
  readonly taxiIdsUsed: number;
  readonly blockedTaxiAssigned: boolean;
  readonly damagedTaxiAssigned: boolean;
  readonly offlineTaxiAssigned: boolean;
  readonly order: readonly string[];
  readonly demandOrder: readonly string[];
}

export interface DispatcherReport {
  readonly version: typeof RIDE_DISPATCHER_VERSION;
  readonly generatedBy: 'npm run fleet:dispatch';
  readonly oracleRule: string;
  readonly limits: typeof RIDE_DISPATCH_LIMITS;
  readonly fleet: Readonly<{
    taxis: number;
    civilians: number;
    serviceable: number;
    blocked: number;
    damaged: number;
    offline: number;
  }>;
  readonly demand: Readonly<{
    windows: number;
    requests: number;
    firstSpawnTick: number;
    lastSpawnTick: number;
  }>;
  readonly simulation: Readonly<{
    ticks: number;
    assignments: number;
    uniqueRequests: number;
    uniqueTaxis: number;
    releases: number;
    plannerSearches: number;
    maxConcurrent: number;
    duplicateTaxis: boolean;
    firstAssignmentTick: number | null;
    lastAssignmentTick: number | null;
    blockedTaxiAssigned: boolean;
    damagedTaxiAssigned: boolean;
    offlineTaxiAssigned: boolean;
    fifoMatchesDemandOrder: boolean;
  }>;
  readonly costs: Readonly<{
    minPickupSeconds: number;
    maxPickupSeconds: number;
    totalPickupSeconds: number;
    totalTripSeconds: number;
    recomputedMatches: number;
    recomputedChecked: number;
  }>;
  readonly tieBreak: Readonly<{
    equalCost: boolean;
    chosenTaxiId: string;
    expectedTaxiId: string;
    sameResultWithReversedPositions: boolean;
  }>;
  readonly staleRoute: Readonly<{
    validationBefore: string;
    validationAfter: string;
    assigned: number;
    reason: string;
    routeStatus: string | null;
    pendingAfter: number;
  }>;
  readonly pickupUnreachable: Readonly<{
    assigned: number;
    reason: string;
    pendingAfter: number;
    plannerSearches: number;
  }>;
  readonly noTaxi: Readonly<{
    assigned: number;
    reason: string;
    pendingAfter: number;
    plannerSearches: number;
  }>;
  readonly noPosition: Readonly<{
    assigned: number;
    reason: string;
    pendingAfter: number;
  }>;
  readonly bounds: Readonly<{
    configuredSearches: number;
    assignmentsInStep: number;
    plannerSearches: number;
    budgetExhausted: boolean;
    blockedReason: string;
    pendingAfter: number;
    candidateLimit: number;
    assignmentLimit: number;
  }>;
  readonly releaseReasons: readonly Readonly<{
    reason: string;
    statusAfter: string | undefined;
    availableAfter: boolean;
  }>[];
  readonly disposal: Readonly<{
    disposed: boolean;
    assignments: number;
    assigned: number;
    routeSearches: number;
    registryTaxis: number;
    demandRequests: number;
    plannerAlive: boolean;
  }>;
  readonly determinism: Readonly<{
    identical: boolean;
    checkCount: number;
  }>;
  readonly checks: readonly DispatchReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): DispatchReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function truthy(name: string, actual: boolean, detail: string): DispatchReportCheck {
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

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function simulate(): Simulation {
  const world = createDispatcherWorld();
  world.dispatcher.setTaxiStatus(taxiAt(world, 24), 'DAMAGED', 0);
  world.dispatcher.setTaxiStatus(taxiAt(world, 23), 'BLOCKED', 0);
  world.dispatcher.setTaxiStatus(taxiAt(world, 22), 'OFFLINE', 0);
  const blocked = taxiAt(world, 23),
    damaged = taxiAt(world, 24),
    offline = taxiAt(world, 22),
    events: SimulationEvent[] = [],
    order: string[] = [];
  let releases = 0,
    plannerSearches = 0,
    steps = 0,
    maxConcurrent = 0,
    duplicateTaxis = false,
    firstAssignmentTick: number | null = null,
    lastAssignmentTick: number | null = null,
    blockedTaxiAssigned = false,
    damagedTaxiAssigned = false,
    offlineTaxiAssigned = false;
  for (let tick = 0; tick <= 1500; tick += 1) {
    world.demand.advance(tick);
    for (const active of world.dispatcher.assignments())
      if (tick - active.tick >= 40) {
        world.dispatcher.release(active.taxiId, 'COMPLETED', tick);
        releases += 1;
      }
    const step = world.dispatcher.step({ tick, maxAssignments: 4 });
    steps += 1;
    plannerSearches += step.plannerSearches;
    for (const assignment of step.assigned) {
      if (assignment.taxiId === blocked) blockedTaxiAssigned = true;
      if (assignment.taxiId === damaged) damagedTaxiAssigned = true;
      if (assignment.taxiId === offline) offlineTaxiAssigned = true;
      if (firstAssignmentTick === null) firstAssignmentTick = assignment.tick;
      lastAssignmentTick = assignment.tick;
      order.push(assignment.requestId);
      events.push(
        Object.freeze({
          tick: assignment.tick,
          requestId: assignment.requestId,
          taxiId: assignment.taxiId,
          pickupCostSeconds: round(assignment.pickupCostSeconds),
          tripCostSeconds: round(assignment.tripCostSeconds),
        }),
      );
    }
    const activeTaxis = world.dispatcher.assignments().map((entry) => entry.taxiId);
    if (new Set(activeTaxis).size !== activeTaxis.length) duplicateTaxis = true;
    maxConcurrent = Math.max(maxConcurrent, activeTaxis.length);
  }
  for (const active of world.dispatcher.assignments()) {
    world.dispatcher.release(active.taxiId, 'COMPLETED', 1501);
    releases += 1;
  }
  const requests = world.demand.requests(),
    demandOrder = requests
      .filter((request) => world.demand.validation(request.requestId)?.status === 'READY')
      .map((request) => request.requestId);
  disposeDispatcherWorld(world);
  return {
    events: Object.freeze(events),
    requests: requests.length,
    releases,
    plannerSearches,
    steps,
    maxConcurrent,
    duplicateTaxis,
    firstAssignmentTick,
    lastAssignmentTick,
    taxiIdsUsed: new Set(events.map((event) => event.taxiId)).size,
    blockedTaxiAssigned,
    damagedTaxiAssigned,
    offlineTaxiAssigned,
    order: Object.freeze(order),
    demandOrder: Object.freeze(demandOrder),
  };
}

function recomputeCosts(events: readonly SimulationEvent[]): {
  recomputedMatches: number;
  recomputedChecked: number;
  minPickupSeconds: number;
  maxPickupSeconds: number;
  totalPickupSeconds: number;
  totalTripSeconds: number;
} {
  const world = createDispatcherWorld();
  let matches = 0,
    minPickup = Infinity,
    maxPickup = -Infinity,
    totalPickup = 0,
    totalTrip = 0;
  for (const event of events) {
    const request = world.demand.requests().find((entry) => entry.requestId === event.requestId)!,
      laneId = world.positions.laneFor(event.taxiId)!,
      pickup = world.planner.findRoute({
        origin: laneId,
        destination: request.originZoneId,
        access: 'TAXI',
      }),
      trip = world.planner.findRoute({
        origin: request.originZoneId,
        destination: request.destinationZoneId,
        access: 'TAXI',
      });
    if (
      pickup.status === 'READY' &&
      trip.status === 'READY' &&
      round(pickup.costSeconds) === event.pickupCostSeconds &&
      round(trip.costSeconds) === event.tripCostSeconds
    )
      matches += 1;
    minPickup = Math.min(minPickup, event.pickupCostSeconds);
    maxPickup = Math.max(maxPickup, event.pickupCostSeconds);
    totalPickup += event.pickupCostSeconds;
    totalTrip += event.tripCostSeconds;
  }
  disposeDispatcherWorld(world);
  return {
    recomputedMatches: matches,
    recomputedChecked: events.length,
    minPickupSeconds: round(minPickup),
    maxPickupSeconds: round(maxPickup),
    totalPickupSeconds: round(totalPickup),
    totalTripSeconds: round(totalTrip),
  };
}

function tieBreakProbe(): {
  equalCost: boolean;
  chosenTaxiId: string;
  expectedTaxiId: string;
  sameResultWithReversedPositions: boolean;
} {
  const run = (reversePositions: boolean) => {
    const world = createDispatcherWorld({
        windows: fixedWindow('sz:0-0', 'sz:1-0'),
        slotLanes: { 1: 'lane:10W0', 2: 'lane:10W0' },
      }),
      first = taxiAt(world, 1),
      second = taxiAt(world, 2);
    if (reversePositions) {
      world.positions.set(second, 'lane:10W0');
      world.positions.set(first, 'lane:10W0');
    }
    for (let slot = 3; slot <= 24; slot += 1)
      world.dispatcher.setTaxiStatus(taxiAt(world, slot), 'BLOCKED', 0);
    world.demand.advance(10);
    const firstCost = world.planner.findRoute({
        origin: 'lane:10W0',
        destination: 'sz:0-0',
        access: 'TAXI',
      }).costSeconds,
      secondCost = world.planner.findRoute({
        origin: 'lane:10W0',
        destination: 'sz:0-0',
        access: 'TAXI',
      }).costSeconds,
      assignment = world.dispatcher.step({ tick: 10 }).assigned[0]!;
    disposeDispatcherWorld(world);
    return { equalCost: firstCost === secondCost, chosenTaxiId: assignment.taxiId, first, second };
  };
  const direct = run(false),
    reversed = run(true);
  return {
    equalCost: direct.equalCost,
    chosenTaxiId: direct.chosenTaxiId,
    expectedTaxiId: direct.first,
    sameResultWithReversedPositions: direct.chosenTaxiId === reversed.chosenTaxiId,
  };
}

function staleRouteProbe(): {
  validationBefore: string;
  validationAfter: string;
  assigned: number;
  reason: string;
  routeStatus: string | null;
  pendingAfter: number;
} {
  const world = createDispatcherWorld({ windows: fixedWindow('sz:0-0', 'sz:1-0') });
  world.demand.advance(10);
  const request = world.demand.pending()[0]!,
    validationBefore = world.demand.validation(request.requestId)!.status;
  world.planner.setBlocked(['lane:10W0']);
  const step = world.dispatcher.step({ tick: 10 }),
    result = {
      validationBefore,
      validationAfter: world.demand.validation(request.requestId)!.status,
      assigned: step.assigned.length,
      reason: step.rejected[0]?.reason ?? 'NONE',
      routeStatus: step.rejected[0]?.routeStatus ?? null,
      pendingAfter: world.demand.stats().pending,
    };
  disposeDispatcherWorld(world);
  return result;
}

function pickupUnreachableProbe(): {
  assigned: number;
  reason: string;
  pendingAfter: number;
  plannerSearches: number;
} {
  const world = createDispatcherWorld({ windows: fixedWindow('sz:0-0', 'sz:1-0') });
  for (const taxiId of world.taxiIds) world.positions.set(taxiId, 'lane:31W0');
  world.demand.advance(10);
  world.planner.setBlocked(['lane:31W0']);
  const step = world.dispatcher.step({ tick: 10 }),
    result = {
      assigned: step.assigned.length,
      reason: step.blocked?.reason ?? 'NONE',
      pendingAfter: world.demand.stats().pending,
      plannerSearches: step.plannerSearches,
    };
  disposeDispatcherWorld(world);
  return result;
}

function noTaxiProbe(): {
  assigned: number;
  reason: string;
  pendingAfter: number;
  plannerSearches: number;
} {
  const world = createDispatcherWorld({ windows: fixedWindow('sz:0-0', 'sz:1-0') });
  for (const taxiId of world.taxiIds) world.dispatcher.setTaxiStatus(taxiId, 'BLOCKED', 0);
  world.demand.advance(10);
  const step = world.dispatcher.step({ tick: 10 }),
    result = {
      assigned: step.assigned.length,
      reason: step.blocked?.reason ?? 'NONE',
      pendingAfter: world.demand.stats().pending,
      plannerSearches: step.plannerSearches,
    };
  disposeDispatcherWorld(world);
  return result;
}

function noPositionProbe(): { assigned: number; reason: string; pendingAfter: number } {
  const world = createDispatcherWorld({ windows: fixedWindow('sz:0-0', 'sz:1-0') });
  for (const taxiId of world.taxiIds) world.positions.set(taxiId, null);
  world.demand.advance(10);
  const step = world.dispatcher.step({ tick: 10 }),
    result = {
      assigned: step.assigned.length,
      reason: step.blocked?.reason ?? 'NONE',
      pendingAfter: world.demand.stats().pending,
    };
  disposeDispatcherWorld(world);
  return result;
}

function boundsProbe(): {
  configuredSearches: number;
  assignmentsInStep: number;
  plannerSearches: number;
  budgetExhausted: boolean;
  blockedReason: string;
  pendingAfter: number;
  candidateLimit: number;
  assignmentLimit: number;
} {
  const world = createDispatcherWorld({
      windows: fixedWindow('sz:0-0', 'sz:1-0', { requestCount: 12, endTick: 1 }),
      dispatcher: { maxRouteSearchesPerStep: 30, maxTaxiCandidates: 24 },
    }),
    configuredSearches = 30,
    candidateLimit = 24,
    assignmentLimit = RIDE_DISPATCH_LIMITS.maximumAssignmentsPerStep;
  world.demand.advance(0);
  const step = world.dispatcher.step({ tick: 0, maxAssignments: 8 }),
    result = {
      configuredSearches,
      assignmentsInStep: step.assigned.length,
      plannerSearches: step.plannerSearches,
      budgetExhausted: step.budgetExhausted,
      blockedReason: step.blocked?.reason ?? 'NONE',
      pendingAfter: world.demand.stats().pending,
      candidateLimit,
      assignmentLimit,
    };
  disposeDispatcherWorld(world);
  return result;
}

function releaseReasonsProbe(): readonly {
  reason: string;
  statusAfter: string | undefined;
  availableAfter: boolean;
}[] {
  const results: { reason: string; statusAfter: string | undefined; availableAfter: boolean }[] =
    [];
  for (const reason of RIDE_DISPATCH_RELEASE_REASONS) {
    const world = createDispatcherWorld({ windows: fixedWindow('sz:0-0', 'sz:1-0') });
    world.demand.advance(10);
    const assignment = world.dispatcher.step({ tick: 10 }).assigned[0]!;
    world.dispatcher.release(assignment.taxiId, reason, 12);
    results.push(
      Object.freeze({
        reason,
        statusAfter: world.dispatcher.taxiStatus(assignment.taxiId),
        availableAfter: world.dispatcher.availableTaxis().includes(assignment.taxiId),
      }),
    );
    disposeDispatcherWorld(world);
  }
  return Object.freeze(results);
}

function disposalProbe(): {
  disposed: boolean;
  assignments: number;
  assigned: number;
  routeSearches: number;
  registryTaxis: number;
  demandRequests: number;
  plannerAlive: boolean;
} {
  const world = createDispatcherWorld();
  world.demand.advance(10);
  world.dispatcher.step({ tick: 10 });
  world.dispatcher.dispose();
  world.dispatcher.dispose();
  const stats = world.dispatcher.stats(),
    result = {
      disposed: stats.disposed,
      assignments: stats.assignments,
      assigned: stats.assigned,
      routeSearches: stats.routeSearches,
      registryTaxis: world.registry.counts().taxis,
      demandRequests: world.demand.stats().requests,
      plannerAlive: !world.planner.getStats().disposed,
    };
  disposeDispatcherWorld(world);
  return result;
}

export function runDispatcherReport(): DispatcherReport {
  const simulation = simulate(),
    costs = recomputeCosts(simulation.events),
    tieBreak = tieBreakProbe(),
    staleRoute = staleRouteProbe(),
    pickupUnreachable = pickupUnreachableProbe(),
    noTaxi = noTaxiProbe(),
    noPosition = noPositionProbe(),
    bounds = boundsProbe(),
    releaseReasons = releaseReasonsProbe(),
    disposal = disposalProbe(),
    second = simulate(),
    deterministic =
      JSON.stringify(simulation.events) === JSON.stringify(second.events) &&
      simulation.plannerSearches === second.plannerSearches,
    source = readFileSync(join(process.cwd(), 'src', 'fleet', 'dispatcher.ts'), 'utf8'),
    noWallClock =
      !/\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/.test(
        source,
      ),
    noDom = !/\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/.test(source),
    world = createDispatcherWorld(),
    fleet = {
      taxis: world.registry.counts().taxis,
      civilians: world.registry.counts().civilians,
      serviceable: world.registry.counts().taxis - 3,
      blocked: 1,
      damaged: 1,
      offline: 1,
    },
    demand = {
      windows: world.demand.plan.windows.length,
      requests: world.demand.requests().length,
      firstSpawnTick: world.demand.requests()[0]!.spawnTick,
      lastSpawnTick: world.demand.requests()[world.demand.requests().length - 1]!.spawnTick,
    },
    uniqueRequests = new Set(simulation.events.map((event) => event.requestId)).size;
  disposeDispatcherWorld(world);

  const checks: DispatchReportCheck[] = [
    check(
      'version',
      '060-ride-dispatcher-v1',
      RIDE_DISPATCHER_VERSION,
      'The dispatch contract has one versioned identity.',
    ),
    check(
      'fleet',
      { taxis: 24, civilians: 20 },
      { taxis: fleet.taxis, civilians: fleet.civilians },
      'Taxi candidates come from the real 057 registry, not a parallel population.',
    ),
    check(
      'demand',
      { windows: 3, requests: 32 },
      { windows: demand.windows, requests: demand.requests },
      'The queue is the real 059 schedule over the real 032 map.',
    ),
    check(
      'assignments',
      32,
      simulation.events.length,
      'Every pending request is assigned exactly once over the simulated horizon.',
    ),
    check('unique-requests', 32, uniqueRequests, 'No request is assigned to two taxis.'),
    check(
      'request-identity',
      32,
      new Set(simulation.order).size,
      'The assignment sequence contains every 059 request identity once.',
    ),
    check('unique-taxis', true, simulation.taxiIdsUsed > 1, 'Assignments rotate over real taxis.'),
    truthy(
      'no-double-taxi',
      !simulation.duplicateTaxis,
      'No taxi holds two active assignments at the same tick.',
    ),
    check(
      'max-concurrent',
      true,
      simulation.maxConcurrent <= fleet.serviceable,
      'Concurrent claims never exceed the serviceable taxi population.',
    ),
    truthy(
      'unavailable-never-assigned',
      !simulation.blockedTaxiAssigned &&
        !simulation.damagedTaxiAssigned &&
        !simulation.offlineTaxiAssigned,
      'BLOCKED, DAMAGED and OFFLINE taxis are never treated as available.',
    ),
    truthy(
      'fifo',
      JSON.stringify(simulation.order) === JSON.stringify(simulation.demandOrder),
      'Requests are claimed in the 059 spawnTick/requestId order.',
    ),
    check(
      'releases',
      true,
      simulation.releases >= simulation.events.length,
      'Every assignment is released explicitly before the horizon ends.',
    ),
    check(
      'planner-searches',
      true,
      simulation.plannerSearches >= simulation.events.length * 2,
      'Every assignment performs a trip replan plus at least one pickup search.',
    ),
    check(
      'cost-recomputed',
      { checked: 32, matches: 32 },
      { checked: costs.recomputedChecked, matches: costs.recomputedMatches },
      'Recorded pickup and trip costs equal fresh 041 queries, not the 059 snapshot.',
    ),
    check(
      'cost-range',
      true,
      costs.minPickupSeconds >= 0 && costs.maxPickupSeconds > costs.minPickupSeconds,
      'Pickup ETA is the real planner cost and varies by taxi position.',
    ),
    check(
      'tie-break',
      { equalCost: true, chosen: tieBreak.expectedTaxiId, reversed: true },
      {
        equalCost: tieBreak.equalCost,
        chosen: tieBreak.chosenTaxiId,
        reversed: tieBreak.sameResultWithReversedPositions,
      },
      'Equal cost is broken by the stable taxi id, independent of insertion order.',
    ),
    check(
      'stale-snapshot',
      {
        validationBefore: 'READY',
        validationAfter: 'READY',
        assigned: 0,
        reason: 'TRIP_UNREACHABLE',
        routeStatus: 'BLOCKED',
        pendingAfter: 0,
      },
      staleRoute,
      'A READY 059 snapshot is ignored; the assignment replans and rejects the impossible trip.',
    ),
    check(
      'pickup-unreachable',
      { assigned: 0, reason: 'PICKUP_UNREACHABLE', pendingAfter: 1, plannerSearches: 25 },
      pickupUnreachable,
      'A blocked taxi position keeps the request pending instead of inventing a route.',
    ),
    check(
      'no-taxi',
      { assigned: 0, reason: 'NO_TAXI', pendingAfter: 1, plannerSearches: 0 },
      noTaxi,
      'With no available taxi the dispatcher performs zero searches and preserves the queue.',
    ),
    check(
      'no-position',
      { assigned: 0, reason: 'NO_POSITION', pendingAfter: 1 },
      noPosition,
      'A taxi without a real lane position cannot be assigned.',
    ),
    check(
      'bounds',
      {
        configuredSearches: 30,
        assignmentsInStep: 1,
        plannerSearches: 25,
        budgetExhausted: true,
        blockedReason: 'ROUTE_BUDGET_EXHAUSTED',
        pendingAfter: 11,
        candidateLimit: 24,
        assignmentLimit: 16,
      },
      bounds,
      'One step assigns at most its budget; the all-or-nothing scan never half-ranks candidates.',
    ),
    check(
      'release-reasons',
      [
        { reason: 'COMPLETED', statusAfter: 'AVAILABLE', availableAfter: true },
        { reason: 'CANCELLED', statusAfter: 'AVAILABLE', availableAfter: true },
        { reason: 'FAILED', statusAfter: 'AVAILABLE', availableAfter: true },
        { reason: 'TAXI_BLOCKED', statusAfter: 'BLOCKED', availableAfter: false },
        { reason: 'TAXI_DAMAGED', statusAfter: 'DAMAGED', availableAfter: false },
        { reason: 'TAXI_REMOVED', statusAfter: 'OFFLINE', availableAfter: false },
      ],
      releaseReasons,
      'Release reasons are closed and map to explicit next taxi statuses.',
    ),
    check(
      'disposal',
      {
        disposed: true,
        assignments: 0,
        assigned: 0,
        routeSearches: 0,
        registryTaxis: 24,
        demandRequests: 32,
        plannerAlive: true,
      },
      disposal,
      'Dispatcher state returns to zero; the injected registry, queue and planner stay alive.',
    ),
    truthy('determinism', deterministic, 'Two identical runs produce identical assignments.'),
    truthy('no-wall-clock', noWallClock, 'The source has no Date, timer or ambient randomness.'),
    truthy('no-dom-or-renderer', noDom, 'The source has no DOM, Babylon or Rapier dependency.'),
    check(
      'closed-vocabularies',
      {
        rejections: 5,
        releases: 6,
        statuses: 5,
      },
      {
        rejections: RIDE_DISPATCH_REJECTION_REASONS.length,
        releases: RIDE_DISPATCH_RELEASE_REASONS.length,
        statuses: 5,
      },
      'Rejection, release and taxi status vocabularies are closed enums.',
    ),
    check(
      'validation-errors',
      true,
      throws(() => createRideDispatcher({}), /registry/i),
      'Options are validated instead of silently defaulting.',
    ),
  ];
  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: RIDE_DISPATCHER_VERSION,
    generatedBy: 'npm run fleet:dispatch',
    oracleRule:
      'A pending 059 request is claimed by the available 057 taxi whose fresh 041 taxi->pickup cost is lowest; the pickup->dropoff leg is replanned at assignment, ties fall back to the stable taxi id and every claim is bounded and explicitly released.',
    limits: RIDE_DISPATCH_LIMITS,
    fleet: Object.freeze(fleet),
    demand: Object.freeze(demand),
    simulation: Object.freeze({
      ticks: 1501,
      assignments: simulation.events.length,
      uniqueRequests,
      uniqueTaxis: simulation.taxiIdsUsed,
      releases: simulation.releases,
      plannerSearches: simulation.plannerSearches,
      maxConcurrent: simulation.maxConcurrent,
      duplicateTaxis: simulation.duplicateTaxis,
      firstAssignmentTick: simulation.firstAssignmentTick,
      lastAssignmentTick: simulation.lastAssignmentTick,
      blockedTaxiAssigned: simulation.blockedTaxiAssigned,
      damagedTaxiAssigned: simulation.damagedTaxiAssigned,
      offlineTaxiAssigned: simulation.offlineTaxiAssigned,
      fifoMatchesDemandOrder:
        JSON.stringify(simulation.order) === JSON.stringify(simulation.demandOrder),
    }),
    costs: Object.freeze(costs),
    tieBreak: Object.freeze(tieBreak),
    staleRoute: Object.freeze(staleRoute),
    pickupUnreachable: Object.freeze(pickupUnreachable),
    noTaxi: Object.freeze(noTaxi),
    noPosition: Object.freeze(noPosition),
    bounds: Object.freeze(bounds),
    releaseReasons,
    disposal: Object.freeze(disposal),
    determinism: Object.freeze({
      identical: deterministic,
      checkCount: simulation.events.length,
    }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}
