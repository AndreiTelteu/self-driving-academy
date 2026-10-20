import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PICKUP_DEFAULTS,
  PICKUP_LIMITS,
  PICKUP_REJECTION_REASONS,
  PICKUP_VERSION,
  createRideLifecycle,
  createRidePickup,
  pickupBoardedEventId,
} from '../../src/fleet';
import type { PickupDecision, PickupRejectionReason, RideState } from '../../src/fleet';
import { createDispatcherWorld } from './dispatcher-fixture';
import type { DispatcherWorld } from './dispatcher-fixture';
import {
  boardAt,
  createPickupWorld,
  disposePickupWorld,
  holdAndBoard,
  holdStationary,
  pickupObservation,
  zoneCenter,
  zoneBounds,
} from './pickup-fixture';
import type { PickupWorld } from './pickup-fixture';

export interface PickupReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

interface SimulationRide {
  readonly requestId: string;
  readonly taxiId: string;
  readonly pickupZoneId: string;
  readonly pickupStartTick: number;
  readonly boardTick: number;
  readonly dwellTicks: number;
  readonly state: RideState;
  readonly events: readonly string[];
  readonly releaseReason: string | null;
}

interface Simulation {
  readonly assignments: number;
  readonly boarded: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly active: number;
  readonly releases: number;
  readonly requests: number;
  readonly duplicateTaxis: boolean;
  readonly uniquePickupZones: number;
  readonly uniqueBoardedEvents: number;
  readonly minDwellTicks: number;
  readonly maxDwellTicks: number;
  readonly exactDwellRides: number;
  readonly pickupRejections: number;
  readonly pickupDuplicates: number;
  readonly minTransitions: number;
  readonly maxTransitions: number;
  readonly rides: readonly SimulationRide[];
}

export interface PickupReport {
  readonly version: typeof PICKUP_VERSION;
  readonly generatedBy: 'npm run ride:pickup';
  readonly oracleRule: string;
  readonly defaults: typeof PICKUP_DEFAULTS;
  readonly limits: typeof PICKUP_LIMITS;
  readonly fleet: Readonly<{ taxis: number; civilians: number; requests: number }>;
  readonly exactDwell: Readonly<{
    requiredDwellTicks: number;
    startTick: number;
    boardTick: number;
    pendingBeforeBoard: number;
    dwellAtBoard: number;
    dwellSeconds: number;
    stateAfterBoard: RideState;
    events: readonly string[];
    transitionTicks: readonly number[];
    replayDuplicate: boolean;
    transitionsAfterReplay: number;
  }>;
  readonly fastPass: Readonly<{
    samples: number;
    insideSamples: number;
    reasons: readonly PickupRejectionReason[];
    maxDwell: number;
    state: RideState;
    transitions: number;
    boarded: number;
  }>;
  readonly zoneRejections: Readonly<{
    outside: Readonly<{ samples: number; reason: PickupRejectionReason }>;
    otherPickupZone: Readonly<{
      zoneId: string;
      samples: number;
      reason: PickupRejectionReason;
    }>;
    dropoffZone: Readonly<{ samples: number; reason: PickupRejectionReason }>;
    state: RideState;
    transitions: number;
    boarded: number;
  }>;
  readonly boundary: Readonly<{
    exactBoundaryInZone: boolean;
    exactBoundaryReason: PickupRejectionReason | null;
    outsideReason: PickupRejectionReason;
    reentryReason: PickupRejectionReason | null;
    boardTick: number;
    dwellTicks: number;
    state: RideState;
  }>;
  readonly idempotency: Readonly<{
    sameTickDuplicate: boolean;
    laterDuplicate: boolean;
    transitions: number;
    boardings: number;
    boardedEvents: number;
    lifecycleDuplicates: number;
  }>;
  readonly wrongRide: Readonly<{
    unknown: PickupRejectionReason;
    foreign: PickupRejectionReason;
    cancelled: PickupRejectionReason;
    state: RideState;
    transitions: number;
    boarded: number;
  }>;
  readonly stale: Readonly<{
    staleBefore: boolean;
    staleAfterAdvance: boolean;
    tickAfterStale: number;
    restartDwell: number;
    state: RideState;
    staleCount: number;
  }>;
  readonly simulation: Simulation;
  readonly disposal: Readonly<{
    disposed: boolean;
    attempts: number;
    boardings: number;
    observations: number;
    boarded: number;
    tick: number;
    rideState: RideState;
    taxiStatus: string | undefined;
    releases: number;
  }>;
  readonly determinism: Readonly<{ identical: boolean; rides: number }>;
  readonly checks: readonly PickupReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): PickupReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function truthy(name: string, actual: boolean, detail: string): PickupReportCheck {
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

function stateOf(world: PickupWorld): RideState {
  return world.rideWorld.lifecycle.ride(world.rideId)!.state;
}

function exactDwellProbe(): PickupReport['exactDwell'] {
  const world = createPickupWorld(),
    required = world.pickup.requiredDwellTicks,
    startTick = 20;
  let pending = world.pickup.observe(pickupObservation(world, { tick: startTick }));
  for (let offset = 1; offset < required; offset += 1)
    pending = world.pickup.observe(pickupObservation(world, { tick: startTick + offset }));
  const boarded = world.pickup.observe(pickupObservation(world, { tick: startTick + required })),
    ride = world.rideWorld.lifecycle.ride(world.rideId)!,
    replay = world.pickup.observe(pickupObservation(world, { tick: startTick + required })),
    report = {
      requiredDwellTicks: required,
      startTick,
      boardTick: boarded.tick,
      pendingBeforeBoard: pending.dwellTicks,
      dwellAtBoard: boarded.dwellTicks,
      dwellSeconds: boarded.dwellSeconds,
      stateAfterBoard: ride.state,
      events: Object.freeze(ride.transitions.map((entry) => entry.event)),
      transitionTicks: Object.freeze(ride.transitions.map((entry) => entry.tick)),
      replayDuplicate: replay.duplicate,
      transitionsAfterReplay: world.rideWorld.lifecycle.ride(world.rideId)!.transitions.length,
    };
  disposePickupWorld(world);
  return Object.freeze(report);
}

function fastPassProbe(): PickupReport['fastPass'] {
  const world = createPickupWorld(),
    bounds = zoneBounds(world.rideWorld.dispatcherWorld.map, world.pickupZoneId),
    steps = 13,
    reasons = new Set<PickupRejectionReason>();
  let maxDwell = 0,
    insideSamples = 0;
  for (let index = 0; index < steps; index += 1) {
    const x = bounds.minX - 2 + ((bounds.maxX - bounds.minX + 4) * index) / (steps - 1),
      decision = world.pickup.observe(
        pickupObservation(world, {
          tick: 20 + index,
          positionM: { x, y: 0, z: world.pickupZoneCenter.z },
          speedMps: 5,
        }),
      );
    if (decision.inPickupZone) insideSamples += 1;
    if (decision.reason !== null) reasons.add(decision.reason);
    maxDwell = Math.max(maxDwell, decision.dwellTicks);
  }
  const report = {
    samples: steps,
    insideSamples,
    reasons: Object.freeze([...reasons].sort()),
    maxDwell,
    state: stateOf(world),
    transitions: world.rideWorld.lifecycle.ride(world.rideId)!.transitions.length,
    boarded: world.pickup.boardings().length,
  };
  disposePickupWorld(world);
  return Object.freeze(report);
}

function zoneRejectionsProbe(): PickupReport['zoneRejections'] {
  const world = createPickupWorld();
  let outside: PickupDecision = world.pickup.observe(
      pickupObservation(world, { tick: 20, positionM: world.outsidePoint }),
    ),
    other: PickupDecision = world.pickup.observe(
      pickupObservation(world, { tick: 21, positionM: world.otherPickupZoneCenter }),
    ),
    dropoff: PickupDecision = world.pickup.observe(
      pickupObservation(world, { tick: 22, positionM: world.dropoffZoneCenter }),
    );
  for (let tick = 21; tick <= 219; tick += 1)
    outside = world.pickup.observe(
      pickupObservation(world, { tick, positionM: world.outsidePoint }),
    );
  for (let tick = 220; tick <= 399; tick += 1)
    other = world.pickup.observe(
      pickupObservation(world, { tick, positionM: world.otherPickupZoneCenter }),
    );
  for (let tick = 400; tick <= 499; tick += 1)
    dropoff = world.pickup.observe(
      pickupObservation(world, { tick, positionM: world.dropoffZoneCenter }),
    );
  const report = {
    outside: Object.freeze({ samples: 200, reason: outside.reason! }),
    otherPickupZone: Object.freeze({
      zoneId: world.otherPickupZoneId,
      samples: 180,
      reason: other.reason!,
    }),
    dropoffZone: Object.freeze({ samples: 100, reason: dropoff.reason! }),
    state: stateOf(world),
    transitions: world.rideWorld.lifecycle.ride(world.rideId)!.transitions.length,
    boarded: world.pickup.boardings().length,
  };
  disposePickupWorld(world);
  return Object.freeze(report);
}

function boundaryProbe(): PickupReport['boundary'] {
  const world = createPickupWorld(),
    bounds = zoneBounds(world.rideWorld.dispatcherWorld.map, world.pickupZoneId),
    exact = { x: bounds.maxX, y: 0, z: world.pickupZoneCenter.z },
    first = world.pickup.observe(pickupObservation(world, { tick: 20, positionM: exact })),
    outside = world.pickup.observe(
      pickupObservation(world, { tick: 21, positionM: world.boundaryOutsidePoint }),
    ),
    reentered = world.pickup.observe(pickupObservation(world, { tick: 22, positionM: exact })),
    boarded = holdAndBoard(world, 22, true, exact),
    report = {
      exactBoundaryInZone: first.inPickupZone,
      exactBoundaryReason: first.reason,
      outsideReason: outside.reason!,
      reentryReason: reentered.reason,
      boardTick: boarded.tick,
      dwellTicks: boarded.dwellTicks,
      state: stateOf(world),
    };
  disposePickupWorld(world);
  return Object.freeze(report);
}

function idempotencyProbe(): PickupReport['idempotency'] {
  const world = createPickupWorld(),
    required = world.pickup.requiredDwellTicks;
  holdStationary(world, 20);
  boardAt(world, 20);
  const sameTick = world.pickup.observe(pickupObservation(world, { tick: 20 + required })),
    later = world.pickup.observe(pickupObservation(world, { tick: 900 })),
    ride = world.rideWorld.lifecycle.ride(world.rideId)!,
    report = {
      sameTickDuplicate: sameTick.duplicate,
      laterDuplicate: later.duplicate,
      transitions: ride.transitions.length,
      boardings: world.pickup.boardings().length,
      boardedEvents: ride.appliedEventIds.filter(
        (eventId) => eventId === pickupBoardedEventId(world.assignment.requestId),
      ).length,
      lifecycleDuplicates: world.rideWorld.lifecycle.stats().duplicates,
    };
  disposePickupWorld(world);
  return Object.freeze(report);
}

function wrongRideProbe(): PickupReport['wrongRide'] {
  const world = createPickupWorld(),
    unknown = world.pickup.observe(pickupObservation(world, { tick: 20, rideId: 'ride:unknown' })),
    foreign = world.pickup.observe(pickupObservation(world, { tick: 21, taxiId: 'taxi:foreign' }));
  world.rideWorld.lifecycle.apply({
    rideId: world.rideId,
    eventId: 'cancel:before-pickup',
    event: 'CANCELLED',
    tick: 22,
    reason: 'PLAYER_CANCELLED',
  });
  const cancelled = world.pickup.observe(pickupObservation(world, { tick: 23 })),
    ride = world.rideWorld.lifecycle.ride(world.rideId)!,
    report = {
      unknown: unknown.reason!,
      foreign: foreign.reason!,
      cancelled: cancelled.reason!,
      state: ride.state,
      transitions: ride.transitions.length,
      boarded: world.pickup.boardings().length,
    };
  disposePickupWorld(world);
  return Object.freeze(report);
}

function staleProbe(): PickupReport['stale'] {
  const world = createPickupWorld();
  world.pickup.observe(pickupObservation(world, { tick: 100 }));
  const staleBefore = world.pickup.observe(pickupObservation(world, { tick: 99 })),
    tickAfterStale = world.pickup.currentTick();
  world.rideWorld.lifecycle.advance(500);
  const staleAfterAdvance = world.pickup.observe(pickupObservation(world, { tick: 499 })),
    restart = world.pickup.observe(pickupObservation(world, { tick: 500 })),
    report = {
      staleBefore: staleBefore.reason === 'STALE_TICK',
      staleAfterAdvance: staleAfterAdvance.reason === 'STALE_TICK',
      tickAfterStale,
      restartDwell: restart.dwellTicks,
      state: stateOf(world),
      staleCount: world.pickup.stats().byReason.STALE_TICK,
    };
  disposePickupWorld(world);
  return Object.freeze(report);
}

function simulate(): Simulation {
  const world: DispatcherWorld = createDispatcherWorld(),
    lifecycle = createRideLifecycle({ dispatcher: world.dispatcher }),
    pickup = createRidePickup({ map: world.map, lifecycle });
  const started = new Map<string, number>(),
    boarded = new Map<string, { tick: number; dwellTicks: number }>();
  let assignments = 0,
    duplicateTaxis = false,
    pickupRejections = 0,
    pickupDuplicates = 0;
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
        if (!started.has(ride.rideId)) started.set(ride.rideId, tick);
        const decision = pickup.observe({
          rideId: ride.rideId,
          taxiId: ride.taxiId,
          tick,
          positionM: zoneCenter(world.map, ride.pickupZoneId),
          speedMps: 0,
        });
        if (decision.duplicate) pickupDuplicates += 1;
        if (decision.status === 'BOARDED')
          boarded.set(ride.rideId, { tick: decision.tick, dwellTicks: decision.dwellTicks });
        else if (decision.reason !== 'NOT_STATIONARY') pickupRejections += 1;
      } else if (ride.state === 'TO_DROPOFF') {
        lifecycle.apply({
          rideId: ride.rideId,
          eventId: `dropoff:${ride.requestId}`,
          event: 'ARRIVED_DROPOFF',
          tick,
        });
      } else if (ride.state === 'DROPOFF') {
        lifecycle.apply({
          rideId: ride.rideId,
          eventId: `complete:${ride.requestId}`,
          event: 'DROPOFF_COMPLETE',
          tick,
        });
      }
      const taxis = lifecycle.active().map((entry) => entry.taxiId);
      if (new Set(taxis).size !== taxis.length) duplicateTaxis = true;
    }
  }
  const closed = lifecycle.terminal(),
    rides = Object.freeze(
      closed.map((ride) => {
        const start = started.get(ride.rideId) ?? 0,
          boardedAt = boarded.get(ride.rideId) ?? { tick: start, dwellTicks: 0 };
        return Object.freeze({
          requestId: ride.requestId,
          taxiId: ride.taxiId,
          pickupZoneId: ride.pickupZoneId,
          pickupStartTick: start,
          boardTick: boardedAt.tick,
          dwellTicks: boardedAt.dwellTicks,
          state: ride.state,
          events: Object.freeze(ride.transitions.map((entry) => entry.event)),
          releaseReason: ride.release?.reason ?? null,
        });
      }),
    ),
    dwells = rides.map((ride) => ride.dwellTicks),
    transitions = rides.map((ride) => ride.events.length),
    report = {
      assignments,
      boarded: boarded.size,
      completed: closed.filter((ride) => ride.state === 'COMPLETED').length,
      failed: closed.filter((ride) => ride.state === 'FAILED').length,
      cancelled: closed.filter((ride) => ride.state === 'CANCELLED').length,
      active: lifecycle.active().length,
      releases: lifecycle.stats().releases,
      requests: world.demand.requests().length,
      duplicateTaxis,
      uniquePickupZones: new Set(rides.map((ride) => ride.pickupZoneId)).size,
      uniqueBoardedEvents: new Set(rides.map((ride) => pickupBoardedEventId(ride.requestId))).size,
      minDwellTicks: dwells.length === 0 ? 0 : Math.min(...dwells),
      maxDwellTicks: dwells.length === 0 ? 0 : Math.max(...dwells),
      exactDwellRides: rides.filter(
        (ride) =>
          ride.dwellTicks === pickup.requiredDwellTicks &&
          ride.boardTick - ride.pickupStartTick === pickup.requiredDwellTicks,
      ).length,
      pickupRejections,
      pickupDuplicates,
      minTransitions: transitions.length === 0 ? 0 : Math.min(...transitions),
      maxTransitions: transitions.length === 0 ? 0 : Math.max(...transitions),
      rides,
    };
  pickup.dispose();
  lifecycle.dispose();
  world.dispatcher.dispose();
  world.demand.dispose();
  world.registry.dispose();
  world.planner.dispose();
  return report;
}

function disposalProbe(): PickupReport['disposal'] {
  const world = createPickupWorld();
  world.pickup.observe(pickupObservation(world, { tick: 20 }));
  world.pickup.dispose();
  world.pickup.dispose();
  const stats = world.pickup.stats(),
    report = {
      disposed: stats.disposed,
      attempts: stats.attempts,
      boardings: world.pickup.boardings().length,
      observations: stats.observations,
      boarded: stats.boarded,
      tick: stats.tick,
      rideState: stateOf(world),
      taxiStatus: world.rideWorld.dispatcherWorld.dispatcher.taxiStatus(world.assignment.taxiId),
      releases: world.rideWorld.dispatcherWorld.dispatcher.releases().length,
    };
  disposePickupWorld(world);
  return Object.freeze(report);
}

export function runPickupReport(): PickupReport {
  const exactDwell = exactDwellProbe(),
    fastPass = fastPassProbe(),
    zoneRejections = zoneRejectionsProbe(),
    boundary = boundaryProbe(),
    idempotency = idempotencyProbe(),
    wrongRide = wrongRideProbe(),
    stale = staleProbe(),
    simulation = simulate(),
    second = simulate(),
    deterministic =
      JSON.stringify(simulation.rides) === JSON.stringify(second.rides) &&
      simulation.boarded === second.boarded &&
      simulation.releases === second.releases,
    fleetWorld = createDispatcherWorld(),
    fleet = {
      taxis: fleetWorld.registry.counts().taxis,
      civilians: fleetWorld.registry.counts().civilians,
      requests: fleetWorld.demand.requests().length,
    };
  fleetWorld.dispatcher.dispose();
  fleetWorld.demand.dispose();
  fleetWorld.registry.dispose();
  fleetWorld.planner.dispose();
  const validationWorld = createPickupWorld(),
    validationMap = validationWorld.rideWorld.dispatcherWorld.map,
    validationLifecycle = validationWorld.rideWorld.lifecycle,
    disposal = disposalProbe(),
    source = readFileSync(join(process.cwd(), 'src', 'fleet', 'pickup.ts'), 'utf8'),
    noWallClock =
      !/\bDate\b|performance\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random/.test(
        source,
      ),
    noDom = !/\bdocument\b|HTMLElement|HTMLCanvasElement|@babylonjs|@dimforge/.test(source),
    checks: PickupReportCheck[] = [
      check('version', '062-pickup-v1', PICKUP_VERSION, 'One versioned pickup identity.'),
      check(
        'rejection-reasons',
        [
          'WRONG_ZONE',
          'TOO_FAST',
          'NOT_STATIONARY',
          'WRONG_RIDE',
          'NOT_AT_PICKUP',
          'STALE_TICK',
          'FOREIGN_VEHICLE',
        ],
        [...PICKUP_REJECTION_REASONS],
        'Every non-boarded observation carries one closed reason.',
      ),
      check(
        'defaults',
        {
          tickRateHz: 60,
          speedThresholdMps: 0.3,
          dwellTicks: 180,
          displacementToleranceM: 0.05,
        },
        { ...PICKUP_DEFAULTS },
        'Speed, dwell and displacement defaults are explicit and provisional.',
      ),
      check(
        'fleet-and-demand',
        { taxis: 24, civilians: 20, requests: 32 },
        fleet,
        'The report uses the real 057 fleet and the real 059 schedule.',
      ),
      check(
        'exact-dwell',
        {
          requiredDwellTicks: 180,
          startTick: 20,
          boardTick: 200,
          pendingBeforeBoard: 179,
          dwellAtBoard: 180,
          dwellSeconds: 3,
          stateAfterBoard: 'TO_DROPOFF',
          events: ['ASSIGNED', 'ARRIVED_PICKUP', 'PICKUP_COMPLETE'],
          transitionTicks: [10, 200, 200],
          replayDuplicate: true,
          transitionsAfterReplay: 3,
        },
        exactDwell,
        'Boarding happens exactly at 180 simulated tick intervals inside the real pickup zone.',
      ),
      check(
        'fast-pass',
        {
          samples: 13,
          insideSamples: 7,
          reasons: ['NOT_AT_PICKUP', 'TOO_FAST'],
          maxDwell: 0,
          state: 'TO_PICKUP',
          transitions: 1,
          boarded: 0,
        },
        fastPass,
        'A fast pass through the marker never completes or starts a pickup.',
      ),
      check(
        'zone-rejections',
        {
          outside: { samples: 200, reason: 'NOT_AT_PICKUP' },
          otherPickupZone: { zoneId: 'sz:0-2', samples: 180, reason: 'WRONG_ZONE' },
          dropoffZone: { samples: 100, reason: 'WRONG_ZONE' },
          state: 'TO_PICKUP',
          transitions: 1,
          boarded: 0,
        },
        zoneRejections,
        'A nearby authored zone or a dropoff-only zone never yields a pickup.',
      ),
      check(
        'boundary',
        {
          exactBoundaryInZone: true,
          exactBoundaryReason: 'NOT_STATIONARY',
          outsideReason: 'NOT_AT_PICKUP',
          reentryReason: 'NOT_STATIONARY',
          boardTick: 202,
          dwellTicks: 180,
          state: 'TO_DROPOFF',
        },
        boundary,
        'The authored boundary is inclusive and leaving it resets the dwell proof.',
      ),
      check(
        'idempotency',
        {
          sameTickDuplicate: true,
          laterDuplicate: true,
          transitions: 3,
          boardings: 1,
          boardedEvents: 1,
          lifecycleDuplicates: 0,
        },
        idempotency,
        'One ride has exactly one boarding transition and one stable boarding event id.',
      ),
      check(
        'wrong-ride',
        {
          unknown: 'WRONG_RIDE',
          foreign: 'FOREIGN_VEHICLE',
          cancelled: 'WRONG_RIDE',
          state: 'CANCELLED',
          transitions: 2,
          boarded: 0,
        },
        wrongRide,
        'Unknown rides, foreign taxis and cancelled rides never board.',
      ),
      check(
        'stale-tick',
        {
          staleBefore: true,
          staleAfterAdvance: true,
          tickAfterStale: 100,
          restartDwell: 0,
          state: 'TO_PICKUP',
          staleCount: 2,
        },
        stale,
        'Stale ticks are refused and never contribute dwell.',
      ),
      check(
        'simulation',
        {
          assignments: 32,
          boarded: 32,
          completed: 32,
          failed: 0,
          cancelled: 0,
          active: 0,
          releases: 32,
          uniquePickupZones: simulation.uniquePickupZones,
          uniqueBoardedEvents: 32,
          minDwellTicks: 180,
          maxDwellTicks: 180,
          exactDwellRides: 32,
          pickupRejections: 0,
          pickupDuplicates: 0,
          duplicateTaxis: false,
        },
        {
          assignments: simulation.assignments,
          boarded: simulation.boarded,
          completed: simulation.completed,
          failed: simulation.failed,
          cancelled: simulation.cancelled,
          active: simulation.active,
          releases: simulation.releases,
          uniquePickupZones: simulation.uniquePickupZones,
          uniqueBoardedEvents: simulation.uniqueBoardedEvents,
          minDwellTicks: simulation.minDwellTicks,
          maxDwellTicks: simulation.maxDwellTicks,
          exactDwellRides: simulation.exactDwellRides,
          pickupRejections: simulation.pickupRejections,
          pickupDuplicates: simulation.pickupDuplicates,
          duplicateTaxis: simulation.duplicateTaxis,
        },
        'All 32 real requests are picked up in their real zones at the exact dwell and complete once.',
      ),
      check(
        'simulation-bounds',
        {
          requests: 32,
          uniquePickupZones: true,
          transitions: true,
          boardedNotMoreThanRides: true,
        },
        {
          requests: simulation.requests,
          uniquePickupZones: simulation.uniquePickupZones > 0 && simulation.uniquePickupZones <= 32,
          transitions: simulation.minTransitions === 5 && simulation.maxTransitions === 5,
          boardedNotMoreThanRides: simulation.boarded <= simulation.rides.length,
        },
        'The simulation stays inside the documented fleet, zone and transition bounds.',
      ),
      check(
        'disposal',
        {
          disposed: true,
          attempts: 0,
          boardings: 0,
          observations: 0,
          boarded: 0,
          tick: 0,
          rideState: 'TO_PICKUP',
          taxiStatus: 'ASSIGNED',
          releases: 0,
        },
        disposal,
        'Disposal returns owned pickup state to zero without releasing the taxi claim.',
      ),
      check(
        'limits',
        { attempts: 64, polygonVertices: 256, minimumFleet: true },
        {
          attempts: PICKUP_LIMITS.attempts,
          polygonVertices: PICKUP_LIMITS.polygonVertices,
          minimumFleet: PICKUP_LIMITS.attempts >= 30,
        },
        'Pickup state is bounded by the same active-ride ceiling.',
      ),
      truthy('determinism', deterministic, 'Two identical simulations produce identical rides.'),
      truthy('no-wall-clock', noWallClock, 'The source has no Date, timer or ambient randomness.'),
      truthy('no-dom-or-renderer', noDom, 'The source has no DOM, Babylon or Rapier dependency.'),
      check(
        'validation-errors',
        { missingMap: true, unknownOption: true, badDwell: true, noLifecycle: true },
        {
          missingMap: throws(() => createRidePickup({}), /map/),
          unknownOption: throws(
            () =>
              createRidePickup({
                map: validationMap,
                lifecycle: validationLifecycle,
                extra: true,
              }),
            /Unknown ride pickup option field/,
          ),
          badDwell: throws(
            () =>
              createRidePickup({
                map: validationMap,
                lifecycle: validationLifecycle,
                dwellTicks: 0,
              }),
            /range/,
          ),
          noLifecycle: throws(
            () =>
              createRidePickup({
                map: validationMap,
                lifecycle: {},
              }),
            /lifecycle/,
          ),
        },
        'Options are validated before any observed tick changes pickup state.',
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  disposePickupWorld(validationWorld);
  return Object.freeze({
    version: PICKUP_VERSION,
    generatedBy: 'npm run ride:pickup',
    oracleRule:
      'A pickup boards only when the assigned taxi is inside the ride’s real authored service-zone polygon, at or below the speed threshold, and has remained contiguous and stationary for the exact simulated dwell; every other observation keeps a closed reason and never writes PICKUP_COMPLETE.',
    defaults: PICKUP_DEFAULTS,
    limits: PICKUP_LIMITS,
    fleet: Object.freeze(fleet),
    exactDwell: Object.freeze(exactDwell),
    fastPass: Object.freeze(fastPass),
    zoneRejections: Object.freeze(zoneRejections),
    boundary: Object.freeze(boundary),
    idempotency: Object.freeze(idempotency),
    wrongRide: Object.freeze(wrongRide),
    stale: Object.freeze(stale),
    simulation: Object.freeze(simulation),
    disposal: Object.freeze(disposal),
    determinism: Object.freeze({ identical: deterministic, rides: simulation.rides.length }),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}
