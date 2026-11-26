import {
  deriveComfortIntervals,
  createComfortMetrics,
  type ComfortMetrics,
  type ComfortMetricsSnapshot,
  type ComfortSampleFact,
} from '../experiments';
import { createFleetEconomy, readLiveEconomySnapshot, LIVE_ECONOMY_FIRST_EPOCH } from '../economy';
import type {
  EconomyClock,
  EconomyRideResult,
  FleetEconomy,
  FleetEconomySnapshot,
  LiveEconomyEpoch,
  LiveEconomySnapshot,
  RideReview,
  RideSettlement,
  TariffSchedule,
} from '../economy';
import type { RideLifecycle, RideRecord, RideState } from '../fleet';
import { choice, number, record, requireContract, tick } from '../sessions';
import { controlModes, vehicleClass } from '../vehicles';
import type { ControlMode, VehicleClassId } from '../vehicles';
import type { LaneGraph } from '../world';

/**
 * 266 live economy composition over the real 265 ride lifecycle.
 *
 * The composition is a thin adapter between the already accepted owners:
 *
 * - the real 061 lifecycle (`RideRecord`, transitions, planned route) supplies every terminal ride;
 * - the unchanged 209 economy settles that ride once and updates the day/month KPI buckets;
 * - the real 139 comfort derivation turns the passenger trace of the ride into the same intervals the
 *   mission and dashboard read;
 * - the real 028 collision facts reach the same 139 read model as passenger impacts, so the 209
 *   review counts the incident instead of reporting zero;
 * - the real 088 artifact windows, when the caller supplies them, suppress the telemetry that cannot
 *   be comfort of the command; the incident itself stays a separate fact;
 * - the real 137 blocked seconds, when the caller supplies them, reach the 209 review as the blocked
 *   service term. Without that port the composition counts the authoritative 058 blockage frames of
 *   the same ride, so a real blocked tick is never replaced by an invented duration.
 *
 * The live path adds two things the 209 module deliberately does not own:
 *
 * 1. **A per-ride passenger trace.** While a passenger is aboard, the authoritative speed, heading and
 *    control mode of the observed taxi are sampled at a fixed cadence and kept in a bounded buffer.
 *    At settlement the shared 139 derivation is called exactly once, with the 088 suppressed spans of
 *    the ride, and the resulting intervals enter a bounded per-ride `ComfortMetrics` instance. The
 *    review model consumes that snapshot; there is no second comfort calculation.
 * 2. **An explicit economic epoch.** A scenario/session reset closes the live rides and starts a new
 *    reporting series, but the ledger, reviews and KPI buckets are preserved. No history is
 *    rewritten and no wall clock is read.
 *
 * There is no second simulation, ledger or store. The economic clock is the authoritative tick the
 * shell actually advanced: a paused, focus-lost or offline game produces no step, so neither the
 * clock nor the revenue can advance.
 */
export const LIVE_ECONOMY_COMPOSITION_VERSION = '266-live-economy-composition-v1' as const;

/** One authoritative observation the economy needs; positions are not used here. */
export interface LiveEconomyObservedVehicle {
  readonly vehicleId: string;
  readonly speedMps: number;
  readonly controlMode: ControlMode;
  /** Real vehicle class, used only for the 139 lateral capability. */
  readonly classId?: VehicleClassId;
  /** Authoritative map heading; with a real class it makes the lateral term measurable. */
  readonly headingRad?: number;
  /** Real 058 blockage carried by the authoritative frame; never inferred from speed. */
  readonly blocked?: boolean;
}

/**
 * The subset of one real 028 `CollisionIncident` the economy needs. A full incident is assignable,
 * so the caller passes the owner's fact unchanged instead of rebuilding a parallel one.
 */
export interface LiveEconomyCollisionFact {
  readonly incidentId: string;
  readonly vehicleId: string;
  readonly otherEntityId: string;
  readonly tick: number;
  readonly impulseNs: number;
}

/**
 * The subset of one real 088 `FilteredWindowRecord` the economy needs. A full window is assignable;
 * `suppressed` is exactly the span the 088 owner already decided is not usable telemetry.
 */
export interface LiveEconomyArtifactWindow {
  readonly vehicleId: string;
  readonly suppressed: Readonly<{ fromTick: number; toTick: number }> | null;
}

export interface LiveEconomyStepInput {
  readonly tick: number;
  readonly vehicles: readonly LiveEconomyObservedVehicle[];
  /** Real 028 incidents delivered for this authoritative tick. */
  readonly collisions?: readonly LiveEconomyCollisionFact[];
}

export interface LiveEconomyStepResult {
  readonly version: typeof LIVE_ECONOMY_COMPOSITION_VERSION;
  readonly tick: number;
  /** A re-delivered tick changes nothing and is reported explicitly. */
  readonly duplicate: boolean;
  readonly settlements: readonly EconomyRideResult[];
  readonly settled: number;
  readonly duplicates: number;
  readonly rejected: number;
  readonly reviews: number;
  readonly comfortSamples: number;
  readonly comfortIntervals: number;
}

export interface LiveEconomyEpochResult {
  readonly epoch: LiveEconomyEpoch;
  /** Revenue of the previous series, preserved unchanged. */
  readonly preservedRevenueMinorUnits: number;
  readonly preservedSettlements: number;
  readonly preservedReviews: number;
}

export interface LiveEconomyCompositionStats {
  readonly version: typeof LIVE_ECONOMY_COMPOSITION_VERSION;
  readonly tick: number;
  readonly epoch: LiveEconomyEpoch;
  readonly settledRides: number;
  readonly activeComfortTrackers: number;
  readonly terminalRides: number;
  readonly settlements: number;
  readonly duplicates: number;
  readonly rejected: number;
  readonly reviews: number;
  readonly civilians: number;
  readonly comfortSamples: number;
  readonly comfortIntervals: number;
  readonly comfortExcludedSamples: number;
  readonly comfortExcludedIntervals: number;
  readonly collisionImpacts: number;
  readonly blockedSeconds: number;
  readonly historyScans: 0;
  readonly disposed: boolean;
}

export interface LiveEconomyCompositionOptions {
  readonly lifecycle: RideLifecycle;
  readonly graph: LaneGraph;
  readonly namespace?: string;
  readonly clock?: EconomyClock;
  readonly schedule?: TariffSchedule;
  readonly reviewModelVersion?: string;
  /** Authoritative sample cadence of the comfort trace; default 6 ticks (10 Hz at 60 Hz). */
  readonly sampleIntervalTicks?: number;
  /**
   * Real 088 windows of one ride, read at settlement. A clean window has `suppressed: null`; only a
   * suppressed span removes telemetry. The composition never creates or widens a window.
   */
  readonly artifactWindows?: (ride: RideRecord) => readonly LiveEconomyArtifactWindow[];
  /**
   * Real 137 blocked seconds measured with the passenger aboard. `null`/`undefined` falls back to
   * the authoritative 058 blocked frames observed during the ride, never to a guessed duration.
   */
  readonly blockedSeconds?: (ride: RideRecord) => number | null;
}

export interface LiveEconomyComposition {
  readonly version: typeof LIVE_ECONOMY_COMPOSITION_VERSION;
  readonly economy: FleetEconomy;
  readonly clock: EconomyClock;
  step(input: unknown): LiveEconomyStepResult;
  /** Settles terminal rides already visible at `atTick` without sampling another comfort tick. */
  flush(input: unknown): LiveEconomyStepResult;
  /** Starts a new reporting epoch while preserving every ledger, review and KPI value. */
  beginEpoch(input: unknown): LiveEconomyEpochResult;
  read(): LiveEconomySnapshot | null;
  snapshot(atTick?: number): FleetEconomySnapshot | null;
  stats(): LiveEconomyCompositionStats;
  dispose(): void;
}

interface ComfortSample extends ComfortSampleFact {
  readonly velocityMps?: Readonly<{ x: number; y: number; z: number }>;
}

interface ComfortTracker {
  readonly classId: VehicleClassId;
  readonly lateralLimitMps2: number | null;
  readonly vehicleId: string;
  /** Authoritative passenger samples in tick order, bounded per ride. */
  readonly samples: ComfortSample[];
  /** Authoritative steps the 058 frame marked blocked while the passenger was aboard. */
  blockedTicks: number;
  lastSampleTick: number | null;
  droppedSamples: number;
}

const optionFields = [
  'lifecycle',
  'graph',
  'namespace',
  'clock',
  'schedule',
  'reviewModelVersion',
  'sampleIntervalTicks',
  'artifactWindows',
  'blockedSeconds',
] as const;
const stepFields = ['tick', 'vehicles', 'collisions'] as const;
const vehicleFields = [
  'vehicleId',
  'speedMps',
  'controlMode',
  'classId',
  'headingRad',
  'blocked',
] as const;
const collisionFields = [
  // The economy reads only these five fields, but the real 028 incident is passed unchanged.
  'incidentId',
  'vehicleId',
  'otherEntityId',
  'tick',
  'impulseNs',
  'schemaVersion',
  'units',
  'sessionId',
  'worldEpoch',
  'first',
  'second',
] as const;

/** Bounded live telemetry memory: real rides are minutes, the cap only protects the session. */
export const LIVE_ECONOMY_TELEMETRY_LIMITS = Object.freeze({
  /** 20 simulated minutes at the default 10 Hz sample cadence. */
  maximumSamplesPerRide: 12_000,
  /** 088 windows read for one ride at settlement. */
  maximumArtifactWindowsPerRide: 256,
  /** Real 028 incidents retained per vehicle until its ride settles. */
  maximumCollisionsPerVehicle: 64,
  /** Real 028 incidents retained across the live composition. */
  maximumCollisionFacts: 4_096,
  /** A review cannot describe a longer trip than one simulated day. */
  maximumRideSeconds: 86_400,
  /** Retained settlement identities; the lifecycle itself retains only terminal receipts. */
  retainedSettledRides: 4_096,
});

function boundedId(value: unknown, label: string): string {
  const id = typeof value === 'string' ? value : '';
  requireContract(id.length > 0 && id.length <= 512, `${label} is invalid`);
  requireContract(id.trim() === id, `${label} whitespace is invalid`);
  return id;
}

function readLifecycle(value: unknown): RideLifecycle {
  const lifecycle = value as RideLifecycle;
  requireContract(
    typeof lifecycle === 'object' &&
      lifecycle !== null &&
      typeof lifecycle.terminal === 'function' &&
      typeof lifecycle.active === 'function' &&
      typeof lifecycle.ride === 'function',
    'Live economy requires the real 061 ride lifecycle',
  );
  return lifecycle;
}

function readVehicles(value: unknown): readonly LiveEconomyObservedVehicle[] {
  requireContract(Array.isArray(value), 'Live economy vehicles must be a list');
  requireContract(value.length <= 128, 'Live economy frame is too large');
  const seen = new Set<string>();
  const vehicles: LiveEconomyObservedVehicle[] = [];
  for (const entry of value) {
    const data = record(entry);
    for (const key of Object.keys(data))
      requireContract(
        (vehicleFields as readonly string[]).includes(key),
        'Unknown live economy vehicle field',
      );
    const vehicleId = boundedId(data.vehicleId, 'live economy vehicle id');
    requireContract(!seen.has(vehicleId), 'Duplicate live economy vehicle');
    seen.add(vehicleId);
    const speedMps = number(data.speedMps, 0, 500),
      controlMode = choice(data.controlMode, controlModes),
      classId =
        data.classId === undefined
          ? undefined
          : choice(data.classId, ['sedan', 'compact'] as const),
      heading = data.headingRad === undefined ? undefined : number(data.headingRad, -1e9, 1e9);
    requireContract(heading === undefined || Number.isFinite(heading), 'Invalid heading');
    requireContract(
      data.blocked === undefined || typeof data.blocked === 'boolean',
      'Live economy blocked flag is invalid',
    );
    vehicles.push(
      Object.freeze({
        vehicleId,
        speedMps,
        controlMode,
        ...(classId === undefined ? {} : { classId }),
        ...(heading === undefined ? {} : { headingRad: heading }),
        ...(data.blocked === undefined ? {} : { blocked: data.blocked }),
      }),
    );
  }
  return Object.freeze(vehicles);
}

function readCollisions(value: unknown): readonly LiveEconomyCollisionFact[] {
  if (value === undefined) return Object.freeze([]);
  requireContract(Array.isArray(value), 'Live economy collisions must be a list');
  requireContract(value.length <= 64, 'Live economy collision frame is too large');
  const facts: LiveEconomyCollisionFact[] = [];
  for (const entry of value) {
    const data = record(entry);
    for (const key of Object.keys(data))
      requireContract(
        (collisionFields as readonly string[]).includes(key),
        'Unknown live economy collision field',
      );
    const impulseNs = number(data.impulseNs, 0, 1e12);
    requireContract(Number.isFinite(impulseNs), 'Live economy collision impulse is invalid');
    facts.push(
      Object.freeze({
        incidentId: boundedId(data.incidentId, 'collision incident id'),
        vehicleId: boundedId(data.vehicleId, 'collision vehicle id'),
        otherEntityId: boundedId(data.otherEntityId, 'collision other entity id'),
        tick: tick(data.tick),
        impulseNs,
      }),
    );
  }
  return Object.freeze(facts);
}

function readStepInput(value: unknown): LiveEconomyStepInput {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      (stepFields as readonly string[]).includes(key),
      'Unknown live economy step field',
    );
  requireContract(data.tick !== undefined, 'Live economy step requires a tick');
  return Object.freeze({
    tick: tick(data.tick),
    vehicles: readVehicles(data.vehicles),
    collisions: readCollisions(data.collisions),
  });
}

function readAtTick(value: unknown, label: string): number {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(['tick'].includes(key), `Unknown live economy ${label} field`);
  requireContract(data.tick !== undefined, `Live economy ${label} requires a tick`);
  return tick(data.tick);
}

function readArtifactWindows(
  value: unknown,
  ride: RideRecord,
): readonly Readonly<{ fromTick: number; toTick: number }>[] {
  requireContract(Array.isArray(value), 'Live economy artifact windows must be a list');
  requireContract(
    value.length <= LIVE_ECONOMY_TELEMETRY_LIMITS.maximumArtifactWindowsPerRide,
    'Live economy artifact window list is too large',
  );
  const spans: Readonly<{ fromTick: number; toTick: number }>[] = [];
  for (const entry of value) {
    const window = record(entry);
    const vehicleId = boundedId(window.vehicleId, 'artifact window vehicle id');
    requireContract(
      window.suppressed === null ||
        (typeof window.suppressed === 'object' && window.suppressed !== null),
      'Artifact window suppressed span is invalid',
    );
    if (window.suppressed === null || vehicleId !== ride.taxiId) continue;
    const suppressed = record(window.suppressed),
      fromTick = tick(suppressed.fromTick),
      toTick = tick(suppressed.toTick);
    requireContract(toTick >= fromTick, 'Artifact window suppressed span is inverted');
    spans.push(Object.freeze({ fromTick, toTick }));
  }
  return Object.freeze(spans);
}

function readBlockedSeconds(value: unknown): number {
  requireContract(
    typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= LIVE_ECONOMY_TELEMETRY_LIMITS.maximumRideSeconds,
    'Live economy blocked seconds are invalid',
  );
  return value;
}

function zeroCounters(): {
  terminalRides: number;
  settlements: number;
  duplicates: number;
  rejected: number;
  reviews: number;
  civilians: number;
  comfortSamples: number;
  comfortIntervals: number;
  comfortExcludedSamples: number;
  comfortExcludedIntervals: number;
  collisionImpacts: number;
  blockedSeconds: number;
} {
  return {
    terminalRides: 0,
    settlements: 0,
    duplicates: 0,
    rejected: 0,
    reviews: 0,
    civilians: 0,
    comfortSamples: 0,
    comfortIntervals: 0,
    comfortExcludedSamples: 0,
    comfortExcludedIntervals: 0,
    collisionImpacts: 0,
    blockedSeconds: 0,
  };
}

function passengerAboard(state: RideState): boolean {
  return state === 'TO_DROPOFF' || state === 'DROPOFF';
}

function rounded(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Builds the live economy over the real ride lifecycle; it owns no world, store or renderer. */
export function createLiveEconomyComposition(
  options: LiveEconomyCompositionOptions,
): LiveEconomyComposition {
  const data = record(options);
  for (const key of Object.keys(data))
    requireContract(
      (optionFields as readonly string[]).includes(key),
      'Unknown live economy option',
    );
  requireContract(data.lifecycle !== undefined, 'Live economy requires the 061 lifecycle');
  requireContract(data.graph !== undefined, 'Live economy requires the real lane graph');
  requireContract(
    data.artifactWindows === undefined || typeof data.artifactWindows === 'function',
    'Live economy artifact windows port is invalid',
  );
  requireContract(
    data.blockedSeconds === undefined || typeof data.blockedSeconds === 'function',
    'Live economy blocked seconds port is invalid',
  );
  const lifecycle = readLifecycle(data.lifecycle),
    graph = data.graph as LaneGraph;
  requireContract(
    typeof graph.getDirectedPath === 'function' && typeof graph.getLane === 'function',
    'Live economy lane graph is invalid',
  );
  const namespace =
      data.namespace === undefined ? 'city:live-economy' : boundedId(data.namespace, 'namespace'),
    sampleIntervalTicks =
      data.sampleIntervalTicks === undefined ? 6 : number(data.sampleIntervalTicks, 1, 60),
    economy = createFleetEconomy({
      namespace,
      ...(data.clock === undefined ? {} : { clock: data.clock as EconomyClock }),
      ...(data.schedule === undefined ? {} : { schedule: data.schedule as TariffSchedule }),
      ...(data.reviewModelVersion === undefined
        ? {}
        : { reviewModelVersion: data.reviewModelVersion as string }),
    });
  requireContract(
    Number.isSafeInteger(sampleIntervalTicks),
    'Live economy comfort interval must be an integer',
  );
  const clock = economy.clock;
  const trackers = new Map<string, ComfortTracker>(),
    impactFacts = new Map<string, LiveEconomyCollisionFact[]>(),
    settled = new Set<string>(),
    settledOrder: string[] = [],
    counters = zeroCounters();
  let epoch: LiveEconomyEpoch = LIVE_ECONOMY_FIRST_EPOCH,
    lastTick = 0,
    lastSettlement: RideSettlement | null = null,
    lastReview: RideReview | null = null,
    retainedCollisionFacts = 0,
    disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Live economy composition disposed');
  }

  function assertTick(atTick: number): void {
    assertLive();
    requireContract(atTick >= lastTick, 'Live economy refuses a tick before its clock');
  }

  function markSettled(rideId: string): void {
    settled.add(rideId);
    settledOrder.push(rideId);
    while (settledOrder.length > LIVE_ECONOMY_TELEMETRY_LIMITS.retainedSettledRides) {
      const oldest = settledOrder.shift();
      if (oldest !== undefined) settled.delete(oldest);
    }
  }

  function trackerFor(
    ride: RideRecord,
    vehicle: LiveEconomyObservedVehicle,
  ): ComfortTracker | null {
    const classId = vehicle.classId ?? null;
    if (classId === null) return null;
    const existing = trackers.get(ride.rideId);
    if (existing !== undefined) return existing.classId === classId ? existing : null;
    const capability = vehicleClass(classId).grip * 9.81;
    const tracker: ComfortTracker = {
      classId,
      lateralLimitMps2:
        Number.isFinite(capability) && capability > 0 ? Math.round(capability * 1e6) / 1e6 : null,
      vehicleId: vehicle.vehicleId,
      samples: [],
      blockedTicks: 0,
      lastSampleTick: null,
      droppedSamples: 0,
    };
    trackers.set(ride.rideId, tracker);
    return tracker;
  }

  function sampleOf(vehicle: LiveEconomyObservedVehicle, atTick: number): ComfortSample {
    const speedMps = Math.abs(vehicle.speedMps),
      heading = vehicle.headingRad;
    return Object.freeze({
      tick: atTick,
      speedMps,
      controlMode: vehicle.controlMode,
      ...(heading === undefined
        ? {}
        : {
            velocityMps: Object.freeze({
              x: speedMps * Math.cos(heading),
              y: 0,
              z: speedMps * Math.sin(heading),
            }),
          }),
    });
  }

  /**
   * Counts the authoritative blocked frames of every passenger ride. A missing frame or a missing
   * ride is not a blocked second: the counter only moves on a real observed fact.
   */
  function observeBlocked(
    atTick: number,
    vehicles: ReadonlyMap<string, LiveEconomyObservedVehicle>,
  ): void {
    for (const ride of lifecycle.active()) {
      if (!passengerAboard(ride.state)) continue;
      const vehicle = vehicles.get(ride.taxiId);
      if (vehicle?.blocked !== true) continue;
      const tracker = trackerFor(ride, vehicle);
      if (tracker === null) continue;
      tracker.blockedTicks = Math.min(
        tracker.blockedTicks + 1,
        LIVE_ECONOMY_TELEMETRY_LIMITS.maximumRideSeconds * clock.tickHz,
      );
      if (tracker.lastSampleTick === null) tracker.lastSampleTick = atTick;
    }
  }

  function sampleComfort(
    atTick: number,
    vehicles: ReadonlyMap<string, LiveEconomyObservedVehicle>,
  ): number {
    let samples = 0;
    for (const ride of lifecycle.active()) {
      if (!passengerAboard(ride.state)) continue;
      const vehicle = vehicles.get(ride.taxiId);
      if (vehicle === undefined) continue;
      const tracker = trackerFor(ride, vehicle);
      if (tracker === null) continue;
      if (tracker.lastSampleTick !== null && atTick - tracker.lastSampleTick < sampleIntervalTicks)
        continue;
      tracker.lastSampleTick = atTick;
      if (tracker.samples.length >= LIVE_ECONOMY_TELEMETRY_LIMITS.maximumSamplesPerRide) {
        tracker.droppedSamples += 1;
        continue;
      }
      tracker.samples.push(sampleOf(vehicle, atTick));
      counters.comfortSamples += 1;
      samples += 1;
    }
    return samples;
  }

  /** Retains the real 028 facts until the ride they belong to is evaluated. */
  function recordCollisions(collisions: readonly LiveEconomyCollisionFact[]): void {
    for (const fact of collisions) {
      const vehicleIds =
        fact.otherEntityId === fact.vehicleId
          ? [fact.vehicleId]
          : [fact.vehicleId, fact.otherEntityId];
      for (const vehicleId of vehicleIds) {
        const facts = impactFacts.get(vehicleId) ?? [];
        if (facts.some((entry) => entry.incidentId === fact.incidentId)) continue;
        if (facts.length >= LIVE_ECONOMY_TELEMETRY_LIMITS.maximumCollisionsPerVehicle) {
          facts.shift();
          retainedCollisionFacts -= 1;
        }
        facts.push(fact);
        retainedCollisionFacts += 1;
        impactFacts.set(vehicleId, facts);
        while (
          retainedCollisionFacts > LIVE_ECONOMY_TELEMETRY_LIMITS.maximumCollisionFacts &&
          impactFacts.size > 0
        ) {
          const oldest = impactFacts.keys().next().value;
          if (oldest === undefined) break;
          const dropped = impactFacts.get(oldest);
          impactFacts.delete(oldest);
          retainedCollisionFacts -= dropped?.length ?? 0;
        }
      }
    }
  }

  /** Real 028 incidents of the ride with the passenger aboard, in deterministic order. */
  function impactsForRide(ride: RideRecord): readonly LiveEconomyCollisionFact[] {
    const facts = impactFacts.get(ride.taxiId);
    if (facts === undefined || facts.length === 0) return Object.freeze([]);
    let boardingTick: number | null = null;
    for (const transition of ride.transitions) {
      if (transition.event === 'PICKUP_COMPLETE') boardingTick = transition.tick;
    }
    if (boardingTick === null) return Object.freeze([]);
    const matched = facts
      .filter((fact) => fact.tick >= boardingTick! && fact.tick <= ride.updatedTick)
      .sort((left, right) =>
        left.tick !== right.tick
          ? left.tick - right.tick
          : left.incidentId < right.incidentId
            ? -1
            : left.incidentId > right.incidentId
              ? 1
              : 0,
      );
    return matched.length === 0 ? Object.freeze([]) : Object.freeze(matched);
  }

  /** Removes the impacts only after the settlement accepted them, so a failed settlement retries. */
  function consumeRideImpacts(
    ride: RideRecord,
    impacts: readonly LiveEconomyCollisionFact[],
  ): void {
    if (impacts.length === 0) return;
    const facts = impactFacts.get(ride.taxiId);
    if (facts === undefined) return;
    const consumed = new Set(impacts.map((fact) => fact.incidentId));
    const remaining = facts.filter((fact) => !consumed.has(fact.incidentId));
    retainedCollisionFacts -= facts.length - remaining.length;
    if (remaining.length === 0) impactFacts.delete(ride.taxiId);
    else impactFacts.set(ride.taxiId, remaining);
  }

  function artifactSpansForRide(
    ride: RideRecord,
  ): readonly Readonly<{ fromTick: number; toTick: number }>[] {
    const provider = options.artifactWindows;
    if (provider === undefined) return Object.freeze([]);
    return readArtifactWindows(provider(ride), ride);
  }

  /**
   * Derives the 139 terms of one ride exactly once, with the 088 spans known at settlement. The real
   * impacts enter the same read model as a separate aggregate, so suppression never erases the
   * incident consequence.
   */
  function comfortSnapshot(
    ride: RideRecord,
    atTick: number,
    impacts: readonly LiveEconomyCollisionFact[],
  ): ComfortMetricsSnapshot | null {
    const tracker = trackers.get(ride.rideId);
    if (tracker === undefined) return null;
    if (tracker.samples.length === 0 && impacts.length === 0) return null;
    const suppressedSpans = artifactSpansForRide(ride);
    const derivation = deriveComfortIntervals({
      samples: tracker.samples,
      suppressedSpans,
      lateralLimitMps2: tracker.lateralLimitMps2,
      tickHz: clock.tickHz,
    });
    counters.comfortExcludedSamples += derivation.excludedSamples;
    counters.comfortExcludedIntervals += derivation.excludedIntervals;
    const service: ComfortMetrics = createComfortMetrics({ retainedKeys: 128, retainedRides: 4 });
    try {
      for (const interval of derivation.intervals) {
        const outcome = service.ingest({
          eventId: `live-comfort:${ride.rideId}:${interval.fromTick}:${interval.toTick}`,
          kind: 'PASSENGER_INTERVAL',
          rideId: ride.rideId,
          vehicleId: tracker.vehicleId,
          controlMode: interval.controlMode ?? 'AUTO',
          learningEligible: interval.controlMode === 'LEARNING',
          fromTick: interval.fromTick,
          toTick: interval.toTick,
          durationSeconds: interval.durationSeconds,
          longitudinalAccelerationMps2: interval.longitudinalAccelerationMps2,
          lateralAccelerationMps2: interval.lateralAccelerationMps2,
          lateralLimitMps2: interval.lateralLimitMps2,
        });
        if (outcome.status === 'ACCEPTED') counters.comfortIntervals += 1;
      }
      for (const fact of impacts) {
        const outcome = service.ingest({
          eventId: `live-comfort-impact:${fact.incidentId}`,
          kind: 'PASSENGER_IMPACT',
          rideId: ride.rideId,
          vehicleId: tracker.vehicleId,
          tick: fact.tick,
          incidentId: fact.incidentId,
          impulseNs: fact.impulseNs,
        });
        if (outcome.status === 'ACCEPTED') counters.collisionImpacts += 1;
      }
      const snapshot = service.snapshot({ tick: atTick });
      return snapshot.rides.length === 0 ? null : snapshot;
    } finally {
      service.dispose();
    }
  }

  /** Real 137 blocked seconds when the caller owns them, else the observed 058 blocked frames. */
  function blockedSecondsForRide(ride: RideRecord): number {
    const provider = options.blockedSeconds;
    if (provider !== undefined) {
      const provided = provider(ride);
      if (provided !== null && provided !== undefined) return readBlockedSeconds(provided);
    }
    const tracker = trackers.get(ride.rideId);
    if (tracker === undefined) return 0;
    return rounded(
      Math.min(
        tracker.blockedTicks / clock.tickHz,
        LIVE_ECONOMY_TELEMETRY_LIMITS.maximumRideSeconds,
      ),
    );
  }

  function releaseTracker(rideId: string): void {
    trackers.delete(rideId);
  }

  function settleVisibleTerminalRides(atTick: number): {
    results: EconomyRideResult[];
    settled: number;
    duplicates: number;
    rejected: number;
  } {
    const results: EconomyRideResult[] = [];
    let settledNow = 0,
      duplicatesNow = 0,
      rejectedNow = 0;
    for (const ride of lifecycle.terminal()) {
      if (settled.has(ride.rideId)) continue;
      if (ride.updatedTick > atTick) continue;
      const impacts = impactsForRide(ride),
        blockedSeconds = blockedSecondsForRide(ride),
        comfort = comfortSnapshot(ride, ride.updatedTick, impacts),
        result = economy.ingestRideOutcome({
          ride,
          graph,
          comfort,
          blockedSeconds,
        });
      consumeRideImpacts(ride, impacts);
      counters.blockedSeconds = rounded(counters.blockedSeconds + blockedSeconds);
      results.push(result);
      counters.terminalRides += 1;
      if (result.settlement.status === 'ACCEPTED') {
        settledNow += 1;
        counters.settlements += 1;
        if (result.settlement.settlement !== null) lastSettlement = result.settlement.settlement;
      } else if (result.settlement.status === 'DUPLICATE') {
        duplicatesNow += 1;
        counters.duplicates += 1;
      } else {
        rejectedNow += 1;
        counters.rejected += 1;
        if (result.settlement.reason === 'CIVILIAN_NOT_BILLABLE') counters.civilians += 1;
      }
      if (result.review?.status === 'ACCEPTED') {
        counters.reviews += 1;
        if (result.review.review !== null) lastReview = result.review.review;
      }
      markSettled(ride.rideId);
      releaseTracker(ride.rideId);
    }
    return { results, settled: settledNow, duplicates: duplicatesNow, rejected: rejectedNow };
  }

  function result(
    atTick: number,
    duplicate: boolean,
    settledNow: number,
    duplicatesNow: number,
    rejectedNow: number,
    reviewsNow: number,
    samples: number,
    results: readonly EconomyRideResult[],
  ): LiveEconomyStepResult {
    return Object.freeze({
      version: LIVE_ECONOMY_COMPOSITION_VERSION,
      tick: atTick,
      duplicate,
      settlements: Object.freeze([...results]),
      settled: settledNow,
      duplicates: duplicatesNow,
      rejected: rejectedNow,
      reviews: reviewsNow,
      comfortSamples: samples,
      comfortIntervals: counters.comfortIntervals,
    });
  }

  function step(value: unknown): LiveEconomyStepResult {
    assertLive();
    const request = readStepInput(value);
    assertTick(request.tick);
    if (request.tick === lastTick) {
      // A re-delivered tick is a real duplicate: no settlement, no review and no comfort sample.
      return result(request.tick, true, 0, 0, 0, 0, 0, []);
    }
    lastTick = request.tick;
    const frame = new Map<string, LiveEconomyObservedVehicle>();
    for (const vehicle of request.vehicles) frame.set(vehicle.vehicleId, vehicle);
    recordCollisions(request.collisions ?? []);
    observeBlocked(request.tick, frame);
    const samples = sampleComfort(request.tick, frame),
      settledResult = settleVisibleTerminalRides(request.tick);
    return result(
      request.tick,
      false,
      settledResult.settled,
      settledResult.duplicates,
      settledResult.rejected,
      settledResult.results.filter((entry) => entry.review?.status === 'ACCEPTED').length,
      samples,
      settledResult.results,
    );
  }

  function flush(value: unknown): LiveEconomyStepResult {
    assertLive();
    const atTick = readAtTick(value, 'flush');
    assertTick(atTick);
    lastTick = Math.max(lastTick, atTick);
    const settledResult = settleVisibleTerminalRides(atTick);
    return result(
      atTick,
      false,
      settledResult.settled,
      settledResult.duplicates,
      settledResult.rejected,
      settledResult.results.filter((entry) => entry.review?.status === 'ACCEPTED').length,
      0,
      settledResult.results,
    );
  }

  function beginEpoch(value: unknown): LiveEconomyEpochResult {
    assertLive();
    const atTick = readAtTick(value, 'epoch');
    assertTick(atTick);
    lastTick = Math.max(lastTick, atTick);
    const preservedRevenueMinorUnits = economy.ledger.totals().netRevenueMinorUnits,
      preservedSettlements = economy.ledger.totals().settlements,
      preservedReviews = economy.reviews.getStats().accepted;
    trackers.clear();
    impactFacts.clear();
    retainedCollisionFacts = 0;
    epoch = Object.freeze({
      index: epoch.index + 1,
      startTick: atTick,
      resets: epoch.resets + 1,
    });
    return Object.freeze({
      epoch,
      preservedRevenueMinorUnits,
      preservedSettlements,
      preservedReviews,
    });
  }

  return Object.freeze({
    version: LIVE_ECONOMY_COMPOSITION_VERSION,
    economy,
    clock,
    step,
    flush,
    beginEpoch,
    read(): LiveEconomySnapshot | null {
      if (disposed) return null;
      return readLiveEconomySnapshot({
        atTick: lastTick,
        epoch,
        totals: economy.ledger.totals(),
        kpi: economy.kpi.snapshot(lastTick),
        lastSettlement,
        lastReview,
        counters: Object.freeze({ ...counters }),
      });
    },
    snapshot(atTick?: number): FleetEconomySnapshot | null {
      if (disposed) return null;
      return economy.snapshot(atTick ?? lastTick);
    },
    stats(): LiveEconomyCompositionStats {
      return Object.freeze({
        version: LIVE_ECONOMY_COMPOSITION_VERSION,
        tick: disposed ? 0 : lastTick,
        epoch,
        settledRides: disposed ? 0 : settled.size,
        activeComfortTrackers: disposed ? 0 : trackers.size,
        terminalRides: disposed ? 0 : counters.terminalRides,
        settlements: disposed ? 0 : counters.settlements,
        duplicates: disposed ? 0 : counters.duplicates,
        rejected: disposed ? 0 : counters.rejected,
        reviews: disposed ? 0 : counters.reviews,
        civilians: disposed ? 0 : counters.civilians,
        comfortSamples: disposed ? 0 : counters.comfortSamples,
        comfortIntervals: disposed ? 0 : counters.comfortIntervals,
        comfortExcludedSamples: disposed ? 0 : counters.comfortExcludedSamples,
        comfortExcludedIntervals: disposed ? 0 : counters.comfortExcludedIntervals,
        collisionImpacts: disposed ? 0 : counters.collisionImpacts,
        blockedSeconds: disposed ? 0 : counters.blockedSeconds,
        historyScans: 0 as const,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      trackers.clear();
      impactFacts.clear();
      retainedCollisionFacts = 0;
      settled.clear();
      settledOrder.length = 0;
      economy.dispose();
    },
  });
}
