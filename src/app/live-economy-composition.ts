import {
  deriveComfortIntervals,
  createComfortMetrics,
  type ComfortInterval,
  type ComfortMetrics,
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
 * The composition is a thin adapter between two already accepted owners:
 *
 * - the real 061 lifecycle (`RideRecord`, transitions, planned route) supplies every terminal ride;
 * - the unchanged 209 economy settles that ride once and updates the day/month KPI buckets.
 *
 * The live path adds two things the 209 module deliberately does not own:
 *
 * 1. **A live comfort trace.** While a passenger is aboard, the authoritative speed, heading and
 *    control mode of the observed taxi are reduced to the same 139 passenger intervals the mission
 *    and dashboard read. The trace is kept in a bounded, per-ride `ComfortMetrics` instance, so the
 *    review model consumes the shared 139 aggregates and never invents a comfort term.
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
}

export interface LiveEconomyStepInput {
  readonly tick: number;
  readonly vehicles: readonly LiveEconomyObservedVehicle[];
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

interface ComfortSample {
  readonly tick: number;
  readonly speedMps: number;
  readonly controlMode: ControlMode;
  readonly velocityMps?: Readonly<{ x: number; y: number; z: number }>;
}

interface ComfortTracker {
  readonly service: ComfortMetrics;
  readonly classId: VehicleClassId | null;
  readonly lateralLimitMps2: number | null;
  readonly vehicleId: string;
  previous: ComfortSample | null;
  lastTick: number | null;
  samples: number;
  intervals: number;
}

const optionFields = [
  'lifecycle',
  'graph',
  'namespace',
  'clock',
  'schedule',
  'reviewModelVersion',
  'sampleIntervalTicks',
] as const;
const stepFields = ['tick', 'vehicles'] as const;
const vehicleFields = ['vehicleId', 'speedMps', 'controlMode', 'classId', 'headingRad'] as const;

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
    vehicles.push(
      Object.freeze({
        vehicleId,
        speedMps,
        controlMode,
        ...(classId === undefined ? {} : { classId }),
        ...(heading === undefined ? {} : { headingRad: heading }),
      }),
    );
  }
  return Object.freeze(vehicles);
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
  });
}

function readAtTick(value: unknown, label: string): number {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(['tick'].includes(key), `Unknown live economy ${label} field`);
  requireContract(data.tick !== undefined, `Live economy ${label} requires a tick`);
  return tick(data.tick);
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
  };
}

function passengerAboard(state: RideState): boolean {
  return state === 'TO_DROPOFF' || state === 'DROPOFF';
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
    settled = new Set<string>(),
    settledOrder: string[] = [],
    counters = zeroCounters();
  let epoch: LiveEconomyEpoch = LIVE_ECONOMY_FIRST_EPOCH,
    lastTick = 0,
    lastSettlement: RideSettlement | null = null,
    lastReview: RideReview | null = null,
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
    while (settledOrder.length > 4_096) {
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
      service: createComfortMetrics({ retainedKeys: 64, retainedRides: 4 }),
      classId,
      lateralLimitMps2:
        Number.isFinite(capability) && capability > 0 ? Math.round(capability * 1e6) / 1e6 : null,
      vehicleId: vehicle.vehicleId,
      previous: null,
      lastTick: null,
      samples: 0,
      intervals: 0,
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
      ...(vehicle.classId === undefined || heading === undefined
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

  function intervalEvent(
    ride: RideRecord,
    tracker: ComfortTracker,
    interval: ComfortInterval,
  ): unknown {
    return {
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
    };
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
      if (tracker.lastTick !== null && atTick - tracker.lastTick < sampleIntervalTicks) continue;
      const current = sampleOf(vehicle, atTick);
      if (tracker.previous !== null) {
        const derivation = deriveComfortIntervals({
          samples: [tracker.previous, current],
          suppressedSpans: [],
          lateralLimitMps2: tracker.lateralLimitMps2,
          tickHz: clock.tickHz,
        });
        for (const interval of derivation.intervals) {
          const outcome = tracker.service.ingest(intervalEvent(ride, tracker, interval));
          if (outcome.status === 'ACCEPTED') {
            tracker.intervals += 1;
            counters.comfortIntervals += 1;
          }
        }
      }
      tracker.previous = current;
      tracker.lastTick = atTick;
      tracker.samples += 1;
      counters.comfortSamples += 1;
      samples += 1;
    }
    return samples;
  }

  function comfortSnapshot(
    ride: RideRecord,
    atTick: number,
  ): ReturnType<ComfortMetrics['snapshot']> | null {
    const tracker = trackers.get(ride.rideId);
    if (tracker === undefined || tracker.intervals === 0) return null;
    return tracker.service.snapshot({ tick: atTick });
  }

  function releaseTracker(rideId: string): void {
    const tracker = trackers.get(rideId);
    if (tracker === undefined) return;
    trackers.delete(rideId);
    tracker.service.dispose();
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
      const comfort = comfortSnapshot(ride, ride.updatedTick),
        result = economy.ingestRideOutcome({
          ride,
          graph,
          comfort,
        });
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
    for (const tracker of trackers.values()) tracker.service.dispose();
    trackers.clear();
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
        historyScans: 0 as const,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const tracker of trackers.values()) tracker.service.dispose();
      trackers.clear();
      settled.clear();
      settledOrder.length = 0;
      economy.dispose();
    },
  });
}
