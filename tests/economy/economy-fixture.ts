import { createFleetEconomy, readRideEconomicOutcome } from '../../src/economy';
import type { FleetEconomy, FleetEconomyOptions, RideEconomicOutcome } from '../../src/economy';
import { createComfortMetrics } from '../../src/experiments';
import type { ComfortMetricsSnapshot } from '../../src/experiments';
import type { ControlMode } from '../../src/vehicles';
import type {
  DispatchAssignment,
  RideCancelReason,
  RideFailureReason,
  RideRecord,
} from '../../src/fleet';
import {
  createRideLifecycleWorld,
  disposeRideLifecycleWorld,
  rideEventInput,
} from '../fleet/ride-fsm-fixture';
import type { RideLifecycleWorld } from '../fleet/ride-fsm-fixture';

/**
 * 209 economy fixtures: real 057 fleet, real 059 schedule, real 060 assignments, the real 032 map
 * and lane graph, the real 061 lifecycle and the real 139 comfort service. No economy fact is
 * invented by the fixture; only the driver style and the timings are chosen, which is exactly what a
 * scenario controls.
 */
export interface EconomyWorld {
  readonly world: RideLifecycleWorld;
  readonly economy: FleetEconomy;
  readonly assignments: readonly DispatchAssignment[];
  dispose(): void;
}

export interface EconomyWorldOptions {
  readonly requestCount?: number;
  readonly openTaxis?: number;
  readonly economy?: FleetEconomyOptions;
}

export function createEconomyWorld(options: EconomyWorldOptions = {}): EconomyWorld {
  const requestCount = options.requestCount ?? 4,
    openTaxis = options.openTaxis ?? requestCount,
    world = createRideLifecycleWorld({ requestCount, openTaxis }),
    economy = createFleetEconomy(options.economy ?? {});
  return {
    world,
    economy,
    assignments: world.assignments,
    dispose(): void {
      economy.dispose();
      disposeRideLifecycleWorld(world);
    },
  };
}

export interface BegunRide {
  readonly index: number;
  readonly assignment: DispatchAssignment;
  readonly rideId: string;
  readonly beginTick: number;
  /** Zero until the passenger boards. */
  readonly pickupTick: number;
}

export interface BeginRideOptions {
  readonly atTick?: number;
  /** Runs the real `ARRIVED_PICKUP` and `PICKUP_COMPLETE` transitions. */
  readonly boarded?: boolean;
}

function assignmentAt(world: EconomyWorld, index: number): DispatchAssignment {
  const assignment = world.assignments[index];
  if (assignment === undefined) throw new RangeError(`Economy fixture has no assignment ${index}`);
  return assignment;
}

/** Creates the ride of the assignment and, optionally, boards the passenger. */
export function beginRide(
  world: EconomyWorld,
  index: number,
  options: BeginRideOptions = {},
): BegunRide {
  const atTick = options.atTick ?? 10,
    assignment = assignmentAt(world, index),
    result = world.world.lifecycle.begin({
      requestId: assignment.requestId,
      eventId: `assigned:${assignment.requestId}`,
      tick: atTick,
    }),
    begun: BegunRide = {
      index,
      assignment,
      rideId: result.ride.rideId,
      beginTick: atTick,
      pickupTick: 0,
    };
  if (options.boarded !== true) return begun;
  world.world.lifecycle.apply(rideEventInput(begun.rideId, 'ARRIVED_PICKUP', begun.beginTick + 2));
  world.world.lifecycle.apply(rideEventInput(begun.rideId, 'PICKUP_COMPLETE', begun.beginTick + 3));
  return { ...begun, pickupTick: begun.beginTick + 3 };
}

export function rideOf(world: EconomyWorld, begun: BegunRide): RideRecord {
  const ride = world.world.lifecycle.ride(begun.rideId);
  if (ride === undefined) throw new Error('Economy fixture ride disappeared');
  return ride;
}

function outcomeOf(world: EconomyWorld, rideId: string): RideEconomicOutcome {
  const ride = world.world.lifecycle.ride(rideId);
  if (ride === undefined) throw new Error('Economy fixture ride disappeared');
  return readRideEconomicOutcome(ride, world.world.dispatcherWorld.graph);
}

export interface TerminalRide extends BegunRide {
  readonly terminalTick: number;
  readonly outcome: RideEconomicOutcome;
}

export interface CompletedRide extends TerminalRide {
  readonly tripSeconds: number;
}

/**
 * Completes a boarded ride. `extraSeconds` is the deliberate detour/wait used by the comparison
 * scenarios: the measured trip gets longer while the planned route and the quote stay the same.
 */
export function completeRide(
  world: EconomyWorld,
  begun: BegunRide,
  extraSeconds = 0,
): CompletedRide {
  if (begun.pickupTick === 0) throw new TypeError('A completed ride needs a boarded passenger');
  const ride = rideOf(world, begun),
    tripSeconds = ride.tripCostSeconds + extraSeconds,
    tripTicks = Math.max(2, Math.round(tripSeconds * 60)),
    arrivalTick = begun.pickupTick + tripTicks - 1,
    terminalTick = begun.pickupTick + tripTicks;
  world.world.lifecycle.apply(rideEventInput(begun.rideId, 'ARRIVED_DROPOFF', arrivalTick));
  world.world.lifecycle.apply(rideEventInput(begun.rideId, 'DROPOFF_COMPLETE', terminalTick));
  return {
    ...begun,
    terminalTick,
    tripSeconds,
    outcome: outcomeOf(world, begun.rideId),
  };
}

export interface FailRideOptions {
  readonly atTick?: number;
  readonly reason?: RideFailureReason;
}

export function failRide(
  world: EconomyWorld,
  begun: BegunRide,
  options: FailRideOptions = {},
): TerminalRide {
  const atTick =
    options.atTick ?? (begun.pickupTick === 0 ? begun.beginTick + 2 : begun.pickupTick + 600);
  world.world.lifecycle.apply(
    rideEventInput(begun.rideId, 'FAILED', atTick, {
      reason: options.reason ?? 'TAXI_BLOCKED',
    }),
  );
  return { ...begun, terminalTick: atTick, outcome: outcomeOf(world, begun.rideId) };
}

export interface CancelRideOptions {
  readonly atTick?: number;
  readonly reason?: RideCancelReason;
}

export function cancelRide(
  world: EconomyWorld,
  begun: BegunRide,
  options: CancelRideOptions = {},
): TerminalRide {
  const atTick =
    options.atTick ?? (begun.pickupTick === 0 ? begun.beginTick + 2 : begun.pickupTick + 600);
  world.world.lifecycle.apply(
    rideEventInput(begun.rideId, 'CANCELLED', atTick, {
      reason: options.reason ?? 'PASSENGER_CANCELLED',
    }),
  );
  return { ...begun, terminalTick: atTick, outcome: outcomeOf(world, begun.rideId) };
}

export interface ComfortProfile {
  readonly intervals?: number;
  /** Constant longitudinal acceleration; ignored when `pattern` is given. */
  readonly accelerationMps2?: number;
  /** Cycled longitudinal accelerations, used to create real jerk. */
  readonly pattern?: readonly number[];
  readonly lateralAccelerationMps2?: number | null;
  readonly lateralLimitMps2?: number | null;
  readonly controlMode?: ControlMode;
  readonly impacts?: number;
  readonly impulseNs?: number;
}

/**
 * One real 139 instance per ride: a few accepted passenger intervals and, optionally, real impacts.
 * The returned snapshot is therefore structurally scoped to the reviewed ride.
 */
export function comfortSnapshot(
  begun: BegunRide,
  profile: ComfortProfile = {},
): ComfortMetricsSnapshot {
  return comfortForRide(begun.rideId, begun.assignment.taxiId, begun.pickupTick, profile);
}

/** The same scoped 139 read model for callers that only have the ride identity. */
export function comfortForRide(
  rideId: string,
  vehicleId: string,
  baseTick: number,
  profile: ComfortProfile = {},
): ComfortMetricsSnapshot {
  const intervals = profile.intervals ?? 8,
    pattern = profile.pattern,
    acceleration = profile.accelerationMps2 ?? 0.5,
    lateral = profile.lateralAccelerationMps2 ?? 1,
    limit = profile.lateralLimitMps2 ?? 3,
    mode = profile.controlMode ?? 'AUTO',
    metrics = createComfortMetrics({ retainedKeys: 64, retainedRides: 4 });
  let tick = baseTick;
  for (let index = 0; index < intervals; index += 1) {
    const from = tick,
      to = tick + 60;
    metrics.ingest({
      eventId: `${rideId}:interval:${index}`,
      kind: 'PASSENGER_INTERVAL',
      rideId,
      vehicleId,
      controlMode: mode,
      learningEligible: mode === 'LEARNING',
      fromTick: from,
      toTick: to,
      durationSeconds: 1,
      longitudinalAccelerationMps2:
        pattern === undefined ? acceleration : pattern[index % pattern.length]!,
      lateralAccelerationMps2: lateral,
      lateralLimitMps2: limit,
    });
    tick = to;
  }
  for (let index = 0; index < (profile.impacts ?? 0); index += 1)
    metrics.ingest({
      eventId: `${rideId}:impact:${index}`,
      kind: 'PASSENGER_IMPACT',
      rideId,
      vehicleId,
      tick: baseTick + 60 * (index + 1),
      incidentId: `${rideId}:incident:${index}`,
      impulseNs: profile.impulseNs ?? 8_000,
    });
  const snapshot = metrics.snapshot({ tick, simulatedSeconds: intervals });
  metrics.dispose();
  return snapshot;
}
