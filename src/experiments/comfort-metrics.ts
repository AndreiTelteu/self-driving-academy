import type { RideState } from '../fleet';
import { parameterRegistry } from '../profiles';
import { requireContract } from '../sessions';
import { ARTIFACT_FILTER_TICK_HZ } from '../telemetry';
import { controlModes } from '../vehicles';
import type { ControlMode } from '../vehicles';

/**
 * 139 comfort metrics: incremental passenger comfort aggregates over idempotent events.
 *
 * The service owns no clock, world, renderer, DOM, profile or camera. It accumulates counters,
 * sums and peaks from accepted events, so a snapshot never rescans a history: `historyScans` is
 * structurally `0` and no sample history is retained.
 *
 * Four rules are structural:
 *
 * 1. Only passenger intervals are aggregated, and every taxi is aggregated in every control mode
 *    (`AUTO`, `MANUAL`, `LEARNING`). The learning eligibility of the 069 segment is recorded as a
 *    fact and never used as a filter, so a taxi outside the camera and a taxi that is not
 *    learning-eligible contribute exactly like a visible, eligible one.
 * 2. The 088 artefact filter is the only exclusion source. A 030 recovery teleport and the impulse
 *    of a real collision are artefacts, so no interval inside or across a suppressed span can
 *    become comfort of the command.
 * 3. A real impact stays a separate consequence of the passenger experience. It is counted in its
 *    own aggregate and reaches the review model apart from every comfort term; it never inflates a
 *    comfort violation.
 * 4. A missing denominator is `UNAVAILABLE` with `value: null`, never an apparently perfect score;
 *    a real zero with a real denominator stays a real zero.
 *
 * The derivation of the intervals and the summary of the aggregates are exported as pure functions,
 * so the 121 mission gate, the 082 dashboard and the review model read the same numbers from the
 * same source instead of keeping parallel calculations.
 *
 * Events may arrive out of tick order between different rides; the aggregates are sums, counters
 * and peaks, so the final snapshot is independent of the arrival order of independent rides. The
 * intervals of one ride, in contrast, are sequential by nature: they are accepted in tick order,
 * because the jerk of an interval is the difference to the previous interval of the same ride.
 */
export const COMFORT_METRICS_VERSION = '139-comfort-metrics-v1' as const;

/** Alias used by composition roots that name the contract by its exported symbol. */
export const comfortMetricsVersion = COMFORT_METRICS_VERSION;

/** Closed event vocabulary. The discriminator is `kind`. */
export const comfortEventKinds = ['PASSENGER_INTERVAL', 'PASSENGER_IMPACT'] as const;
export type ComfortEventKind = (typeof comfortEventKinds)[number];

export const comfortIngestStatuses = ['ACCEPTED', 'DUPLICATE', 'REJECTED'] as const;
export type ComfortIngestStatus = (typeof comfortIngestStatuses)[number];

/** Closed rejection vocabulary; a rejected event never changes an aggregate. */
export const comfortRejectionReasons = [
  'INVALID_SHAPE',
  'UNKNOWN_FIELD',
  'UNKNOWN_KIND',
  'INVALID_IDENTITY',
  'INVALID_NUMBER',
  'INCONSISTENT_STATE',
  'LIMIT_EXCEEDED',
  'OUT_OF_ORDER',
] as const;
export type ComfortRejectionReason = (typeof comfortRejectionReasons)[number];

/** Every control mode is aggregated; the order is the canonical snapshot order. */
export const COMFORT_CONTROL_MODES = controlModes;
export type ComfortControlMode = ControlMode;

/**
 * Fixed simulation rate of the 085 recorder. It is a declared constant of the contract, never a
 * wall clock: the module never reads the host time.
 */
export const COMFORT_SIMULATION_HZ = ARTIFACT_FILTER_TICK_HZ;

/**
 * Provenance of the two comfort thresholds. The values are the shipped defaults of the project
 * driving-parameter catalog, so the comfort gates are real project figures and not numbers invented
 * for a metric. A published profile can tune them for the longitudinal controller; the comfort
 * metric keeps the catalog default and never follows a profile.
 */
export const COMFORT_THRESHOLD_SOURCE = Object.freeze({
  maxAccelerationMps2: 'comfort_deceleration',
  maxJerkMps3: 'acceleration_jerk',
  catalog: 'project driving-parameter catalog default',
});

/** The catalog defaults: `comfort_deceleration` = 2 m/s² and `acceleration_jerk` = 2 m/s³. */
export const COMFORT_THRESHOLDS = Object.freeze({
  maxAccelerationMps2: parameterRegistry.comfort_deceleration.default,
  maxJerkMps3: parameterRegistry.acceleration_jerk.default,
});

/**
 * Numerical tolerance of the threshold comparison. The metrics are integrated from 60 Hz ticks, so
 * a drive that sits exactly on the threshold can land a few ULPs above it; the tolerance keeps the
 * verdict stable without hiding a real exceedance.
 */
export const COMFORT_LIMIT_EPSILON = 1e-9;

export interface ComfortThresholds {
  readonly maxAccelerationMps2: number;
  readonly maxJerkMps3: number;
}

export const COMFORT_METRICS_LIMITS = Object.freeze({
  version: COMFORT_METRICS_VERSION,
  /** Bounded idempotency memory; the oldest accepted key is evicted first. */
  retainedKeys: 8192,
  /** Bounded per-ride read model; the oldest ride is retired first. */
  retainedRides: 512,
  /** Code units per accepted identity. */
  idCodeUnits: 1024,
  /** Upper bound of every accumulated counter/sum. */
  maximumSum: Number.MAX_SAFE_INTEGER,
  /** One interval may not describe more than one simulated minute. */
  maximumIntervalSeconds: 60,
  /** One interval may not describe more than a simulated hour of ticks. */
  maximumIntervalTicks: 3_600,
  /** Refused acceleration magnitudes; they are not road-vehicle behaviour. */
  maximumAccelerationMps2: 1_000,
  /** Refused jerk magnitudes. */
  maximumJerkMps3: 100_000,
  /** Refused impact impulses. */
  maximumImpulseNs: 1e12,
  /** Refused speeds of a real road vehicle. */
  maximumSpeedMps: 150,
});

/**
 * The 061 ride states that carry the passenger. `TO_PICKUP` and `PICKUP` have an empty cabin;
 * `TO_DROPOFF` and `DROPOFF` transport the passenger; the terminal states have ended the ride.
 */
export const COMFORT_PASSENGER_RIDE_STATES = Object.freeze(['TO_DROPOFF', 'DROPOFF'] as const);

/** Passenger presence derived from the real 061 ride lifecycle, never asserted freely. */
export function comfortPassengerAboard(rideState: RideState): boolean {
  return (COMFORT_PASSENGER_RIDE_STATES as readonly string[]).includes(rideState);
}

/** One tick span of the real 088 suppressed range. */
export interface ComfortSpan {
  readonly fromTick: number;
  readonly toTick: number;
}

/** A real velocity vector of the 085 observation. */
export interface ComfortVelocityMps {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * One measured sample of the ride. `speedMps` is the real speed of the 085 observation and the
 * optional velocity vector is the real vector of the same observation; with both, the lateral
 * component of the acceleration is measured as well.
 */
export interface ComfortSampleFact {
  readonly tick: number;
  readonly speedMps: number;
  /** Frozen 069 control mode of the segment the sample belongs to. */
  readonly controlMode?: ControlMode;
  readonly velocityMps?: ComfortVelocityMps | null;
}

export interface ComfortDerivationInput {
  readonly samples: readonly ComfortSampleFact[];
  /** The 088 suppressed spans; the only exclusion source of the comfort metric. */
  readonly suppressedSpans: readonly ComfortSpan[];
  /** Real 085 capability of the vehicle class; `null` when it cannot be certified. */
  readonly lateralLimitMps2?: number | null;
  /** Fixed simulation rate; defaults to the 060/085 rate of 60 Hz. */
  readonly tickHz?: number;
}

/** One passenger interval: the measured comfort between two consecutive usable samples. */
export interface ComfortInterval {
  readonly fromTick: number;
  readonly toTick: number;
  readonly durationSeconds: number;
  /** Signed longitudinal acceleration, from the real speed of the two samples. */
  readonly longitudinalAccelerationMps2: number;
  /** Magnitude of the lateral component of the real velocity change; `null` when not measured. */
  readonly lateralAccelerationMps2: number | null;
  /** The real capability limit the lateral magnitude is compared with; `null` when unknown. */
  readonly lateralLimitMps2: number | null;
  /** The 069 control mode of the interval; `null` when the caller did not declare one. */
  readonly controlMode: ControlMode | null;
}

export interface ComfortDerivation {
  /** Samples that entered the metric. */
  readonly usedSamples: number;
  /** Samples dropped because the 088 filter suppressed their tick. */
  readonly excludedSamples: number;
  readonly intervals: readonly ComfortInterval[];
  /** Intervals dropped because they cross a suppressed span. */
  readonly excludedIntervals: number;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function readSampleFact(value: unknown): ComfortSampleFact {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Comfort sample must be an object',
  );
  const data = value as Record<string, unknown>;
  requireContract(
    typeof data.tick === 'number' && Number.isSafeInteger(data.tick) && data.tick >= 0,
    'Comfort sample tick must be a nonnegative integer',
  );
  requireContract(
    typeof data.speedMps === 'number' &&
      Number.isFinite(data.speedMps) &&
      data.speedMps >= 0 &&
      data.speedMps <= COMFORT_METRICS_LIMITS.maximumSpeedMps,
    'Comfort sample speed is invalid',
  );
  const controlMode = data.controlMode;
  if (controlMode !== undefined && controlMode !== null) {
    requireContract(
      (controlModes as readonly string[]).includes(controlMode as string),
      'Unknown comfort control mode',
    );
  }
  const velocity = data.velocityMps;
  if (velocity !== undefined && velocity !== null) {
    requireContract(
      typeof velocity === 'object' && velocity !== null && !Array.isArray(velocity),
      'Comfort velocity must be an object',
    );
    const vector = velocity as Record<string, unknown>;
    for (const axis of ['x', 'y', 'z'] as const) {
      requireContract(
        typeof vector[axis] === 'number' && Number.isFinite(vector[axis]),
        'Comfort velocity component is invalid',
      );
    }
  }
  return Object.freeze({
    tick: data.tick,
    speedMps: data.speedMps,
    ...(controlMode === undefined || controlMode === null
      ? {}
      : { controlMode: controlMode as ControlMode }),
    ...(velocity === undefined || velocity === null
      ? {}
      : {
          velocityMps: Object.freeze({
            x: (velocity as Record<string, unknown>).x as number,
            y: (velocity as Record<string, unknown>).y as number,
            z: (velocity as Record<string, unknown>).z as number,
          }),
        }),
  });
}

function readSpan(value: unknown): ComfortSpan {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Comfort span must be an object',
  );
  const data = value as Record<string, unknown>;
  requireContract(
    typeof data.fromTick === 'number' &&
      Number.isSafeInteger(data.fromTick) &&
      data.fromTick >= 0 &&
      typeof data.toTick === 'number' &&
      Number.isSafeInteger(data.toTick) &&
      data.toTick >= data.fromTick,
    'Comfort span is invalid',
  );
  return Object.freeze({ fromTick: data.fromTick, toTick: data.toTick });
}

/**
 * The lateral component of the real velocity change: the part of the acceleration that is
 * perpendicular to the direction of travel. It is `null` when the caller did not supply the real
 * velocity vectors, never a fabricated zero.
 */
function lateralAccelerationMps2(
  from: ComfortSampleFact,
  to: ComfortSampleFact,
  durationSeconds: number,
): number | null {
  const first = from.velocityMps;
  const second = to.velocityMps;
  if (first === undefined || first === null) return null;
  if (second === undefined || second === null) return null;
  const dvx = (second.x - first.x) / durationSeconds;
  const dvy = (second.y - first.y) / durationSeconds;
  const dvz = (second.z - first.z) / durationSeconds;
  const meanX = (first.x + second.x) / 2;
  const meanY = (first.y + second.y) / 2;
  const meanZ = (first.z + second.z) / 2;
  const magnitude = Math.hypot(meanX, meanY, meanZ);
  if (magnitude < 1e-9) return null;
  const ux = meanX / magnitude;
  const uy = meanY / magnitude;
  const uz = meanZ / magnitude;
  const along = dvx * ux + dvy * uy + dvz * uz;
  return Math.hypot(dvx - along * ux, dvy - along * uy, dvz - along * uz);
}

/**
 * The single derivation of the comfort intervals.
 *
 * The 088 suppressed spans are the only exclusion: a sample inside a span is dropped and an
 * interval that crosses a span is dropped as well, so a 030 recovery teleport and the impulse of a
 * real collision can never become comfort of the command. The intervals themselves are plain
 * measurements of the real telemetry, in tick order, with the real control mode of the segment.
 */
export function deriveComfortIntervals(input: unknown): ComfortDerivation {
  requireContract(
    typeof input === 'object' && input !== null && !Array.isArray(input),
    'Comfort derivation requires an object',
  );
  const data = input as Record<string, unknown>;
  requireContract(Array.isArray(data.samples), 'Comfort derivation requires samples');
  requireContract(
    Array.isArray(data.suppressedSpans),
    'Comfort derivation requires suppressed spans',
  );
  const tickHz = data.tickHz === undefined ? COMFORT_SIMULATION_HZ : data.tickHz;
  requireContract(
    typeof tickHz === 'number' && Number.isFinite(tickHz) && tickHz > 0,
    'Comfort derivation tick rate is invalid',
  );
  const lateralLimitMps2 =
    data.lateralLimitMps2 === undefined || data.lateralLimitMps2 === null
      ? null
      : data.lateralLimitMps2;
  if (lateralLimitMps2 !== null)
    requireContract(
      typeof lateralLimitMps2 === 'number' &&
        Number.isFinite(lateralLimitMps2) &&
        lateralLimitMps2 > 0 &&
        lateralLimitMps2 <= COMFORT_METRICS_LIMITS.maximumAccelerationMps2,
      'Comfort lateral limit is invalid',
    );
  const spans = (data.suppressedSpans as readonly unknown[]).map((entry) => readSpan(entry));
  const samples = (data.samples as readonly unknown[]).map((entry) => readSampleFact(entry));
  let previousTick = -1;
  for (const sample of samples) {
    requireContract(sample.tick > previousTick, 'Comfort samples must be strictly increasing');
    previousTick = sample.tick;
  }
  const suppressed = (at: number): boolean =>
    spans.some((span) => at >= span.fromTick && at <= span.toTick);
  const crosses = (from: number, to: number): boolean =>
    spans.some((span) => span.fromTick <= to && span.toTick >= from);

  const used: ComfortSampleFact[] = [];
  let excludedSamples = 0;
  for (const sample of samples) {
    if (suppressed(sample.tick)) {
      excludedSamples += 1;
      continue;
    }
    used.push(sample);
  }

  const intervals: ComfortInterval[] = [];
  let excludedIntervals = 0;
  for (let index = 0; index + 1 < used.length; index += 1) {
    const from = used[index]!;
    const to = used[index + 1]!;
    if (crosses(from.tick, to.tick)) {
      excludedIntervals += 1;
      continue;
    }
    const durationSeconds = (to.tick - from.tick) / tickHz;
    intervals.push(
      Object.freeze({
        fromTick: from.tick,
        toTick: to.tick,
        durationSeconds,
        longitudinalAccelerationMps2: (to.speedMps - from.speedMps) / durationSeconds,
        lateralAccelerationMps2: lateralAccelerationMps2(from, to, durationSeconds),
        lateralLimitMps2,
        controlMode: from.controlMode ?? null,
      }),
    );
  }
  return Object.freeze({
    usedSamples: used.length,
    excludedSamples,
    intervals: Object.freeze(intervals),
    excludedIntervals,
  });
}

/** The jerk values of consecutive intervals, exactly as the 121 mission computes them. */
export function comfortJerkValues(intervals: readonly ComfortInterval[]): readonly number[] {
  const jerks: number[] = [];
  for (let index = 0; index + 1 < intervals.length; index += 1) {
    const previous = intervals[index]!;
    const next = intervals[index + 1]!;
    jerks.push(
      (next.longitudinalAccelerationMps2 - previous.longitudinalAccelerationMps2) /
        next.durationSeconds,
    );
  }
  return jerks;
}

export interface ComfortSummary {
  readonly peakAccelerationMps2: number;
  readonly meanAccelerationAbsMps2: number;
  readonly peakLateralAccelerationMps2: number;
  readonly meanLateralAccelerationMps2: number;
  readonly peakJerkMps3: number;
  readonly accelerationSamples: number;
  readonly jerkSamples: number;
  readonly lateralSamples: number;
  readonly accelerationViolations: number;
  readonly jerkViolations: number;
  /** Lateral exceedances of the real 085 capability limit of the vehicle class. */
  readonly lateralViolations: number;
}

/**
 * The single summary of the comfort intervals. The 121 mission gate and the 139 service use this
 * function, so a comfort verdict cannot diverge between them.
 */
export function summarizeComfortIntervals(
  intervals: readonly ComfortInterval[],
  thresholds: ComfortThresholds = COMFORT_THRESHOLDS,
): ComfortSummary {
  let peakAcceleration = 0;
  let sumAbsAcceleration = 0;
  let peakLateral = 0;
  let sumLateral = 0;
  let lateralSamples = 0;
  let accelerationViolations = 0;
  let lateralViolations = 0;
  for (const interval of intervals) {
    const magnitude = Math.abs(interval.longitudinalAccelerationMps2);
    peakAcceleration = Math.max(peakAcceleration, magnitude);
    sumAbsAcceleration += magnitude;
    if (magnitude > thresholds.maxAccelerationMps2 + COMFORT_LIMIT_EPSILON)
      accelerationViolations += 1;
    if (interval.lateralAccelerationMps2 !== null) {
      lateralSamples += 1;
      const lateral = Math.abs(interval.lateralAccelerationMps2);
      peakLateral = Math.max(peakLateral, lateral);
      sumLateral += lateral;
      if (
        interval.lateralLimitMps2 !== null &&
        lateral > interval.lateralLimitMps2 + COMFORT_LIMIT_EPSILON
      )
        lateralViolations += 1;
    }
  }
  const jerks = comfortJerkValues(intervals);
  let peakJerk = 0;
  let jerkViolations = 0;
  for (const jerk of jerks) {
    const magnitude = Math.abs(jerk);
    peakJerk = Math.max(peakJerk, magnitude);
    if (magnitude > thresholds.maxJerkMps3 + COMFORT_LIMIT_EPSILON) jerkViolations += 1;
  }
  return Object.freeze({
    peakAccelerationMps2: round(peakAcceleration),
    meanAccelerationAbsMps2: round(
      intervals.length === 0 ? 0 : sumAbsAcceleration / intervals.length,
    ),
    peakLateralAccelerationMps2: round(peakLateral),
    meanLateralAccelerationMps2: round(lateralSamples === 0 ? 0 : sumLateral / lateralSamples),
    peakJerkMps3: round(peakJerk),
    accelerationSamples: intervals.length,
    jerkSamples: jerks.length,
    lateralSamples,
    accelerationViolations,
    jerkViolations,
    lateralViolations,
  });
}

export type ComfortVerdictStatus = 'PASSED' | 'FAILED' | 'INSUFFICIENT_DATA';
export type ComfortVerdictReason = 'ACCELERATION_LIMIT' | 'JERK_LIMIT' | 'BOTH_LIMITS';

export interface ComfortVerdictInput {
  readonly intervals: number;
  readonly jerkSamples: number;
  readonly accelerationViolations: number;
  readonly jerkViolations: number;
}

export interface ComfortVerdict {
  readonly status: ComfortVerdictStatus;
  readonly reason: ComfortVerdictReason | null;
}

/**
 * The verdict of one passenger experience, shared by the 121 mission gate and the 139 read model.
 * A too short experience cannot produce a verdict; a real exceedance always fails.
 */
export function comfortVerdict(input: ComfortVerdictInput, minimumSamples: number): ComfortVerdict {
  requireContract(
    Number.isSafeInteger(minimumSamples) && minimumSamples >= 2,
    'Comfort minimum sample count is invalid',
  );
  if (input.intervals < minimumSamples)
    return Object.freeze({ status: 'INSUFFICIENT_DATA' as const, reason: null });
  const acceleration = input.accelerationViolations > 0;
  const jerk = input.jerkViolations > 0;
  if (!acceleration && !jerk) return Object.freeze({ status: 'PASSED' as const, reason: null });
  return Object.freeze({
    status: 'FAILED' as const,
    reason:
      acceleration && jerk
        ? ('BOTH_LIMITS' as const)
        : acceleration
          ? ('ACCELERATION_LIMIT' as const)
          : ('JERK_LIMIT' as const),
  });
}

/** One accepted passenger interval. */
export interface ComfortPassengerIntervalEvent {
  readonly eventId: string;
  readonly kind: 'PASSENGER_INTERVAL';
  readonly rideId: string;
  readonly vehicleId: string;
  /** Frozen 069 control mode of the segment. */
  readonly controlMode: ControlMode;
  /** Frozen 069 learning eligibility; only a LEARNING segment is eligible. */
  readonly learningEligible: boolean;
  readonly fromTick: number;
  readonly toTick: number;
  readonly durationSeconds: number;
  readonly longitudinalAccelerationMps2: number;
  /** `null` when the lateral component could not be measured. */
  readonly lateralAccelerationMps2: number | null;
  /** The real 085 capability limit of the vehicle class; `null` when unknown. */
  readonly lateralLimitMps2: number | null;
}

/** One real impact that happened while the passenger was aboard. */
export interface ComfortPassengerImpactEvent {
  readonly eventId: string;
  readonly kind: 'PASSENGER_IMPACT';
  readonly rideId: string;
  readonly vehicleId: string;
  readonly tick: number;
  readonly incidentId: string;
  readonly impulseNs: number;
}

export type ComfortEvent = ComfortPassengerIntervalEvent | ComfortPassengerImpactEvent;

export interface ComfortFleetCounts {
  readonly vehicles: number;
  readonly taxis: number;
  readonly civilians: number;
}

/** The comfort aggregate of one scope: the whole fleet, one control mode or one ride. */
export interface ComfortAggregate {
  /** `ALL` for the fleet scope, the control mode otherwise. */
  readonly mode: ControlMode | 'ALL';
  /** Accepted passenger intervals. */
  readonly intervals: number;
  /** Sum of the real duration of the accepted intervals. */
  readonly passengerSeconds: number;
  /** Jerk pairs derived from consecutive intervals of the same ride. */
  readonly jerkSamples: number;
  /** Intervals with a measured lateral acceleration. */
  readonly lateralSamples: number;
  readonly peakAccelerationMps2: number;
  readonly meanAccelerationAbsMps2: number;
  readonly peakLateralAccelerationMps2: number;
  readonly meanLateralAccelerationMps2: number;
  readonly peakJerkMps3: number;
  readonly accelerationViolations: number;
  readonly jerkViolations: number;
  readonly lateralViolations: number;
}

/** The comfort aggregate of one ride, with the real impacts of that ride kept apart. */
export interface ComfortRideAggregate extends ComfortAggregate {
  readonly rideId: string;
  readonly vehicleId: string;
  /** Every control mode the ride was aggregated in; a mixed ride lists all of them. */
  readonly controlModes: readonly ControlMode[];
  /** Real impacts with a passenger on this ride; never part of the comfort numbers. */
  readonly impacts: number;
}

/** The real impacts of the passenger experience; they never enter a comfort aggregate. */
export interface ComfortImpactAggregate {
  readonly impacts: number;
  readonly impulseSumNs: number;
  readonly peakImpulseNs: number;
  /** Retained rides with at least one passenger impact. */
  readonly affectedRides: number;
}

/** One frozen read model over the accepted aggregates. No list or history is read to build it. */
export interface ComfortMetricsSnapshot {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly version: typeof COMFORT_METRICS_VERSION;
  readonly tick: number;
  readonly simulatedSeconds: number;
  /** Optional whole-fleet context; `null` when the caller did not declare it. */
  readonly fleet: ComfortFleetCounts | null;
  readonly thresholds: ComfortThresholds;
  readonly overall: ComfortAggregate;
  /** Canonical order: AUTO, MANUAL, LEARNING. */
  readonly byMode: readonly ComfortAggregate[];
  /** The bounded per-ride read model, sorted by ride id. */
  readonly rides: readonly ComfortRideAggregate[];
  readonly impacts: ComfortImpactAggregate;
  /** Structural proof that the snapshot performed no history scan. */
  readonly historyScans: 0;
  readonly snapshotCalls: number;
}

export interface ComfortIngestResult {
  readonly status: ComfortIngestStatus;
  /** Event id for an accepted or duplicate event; `null` for a rejected payload. */
  readonly eventId: string | null;
  /** Closed rejection reason; `null` for accepted/duplicate events. */
  readonly reason: ComfortRejectionReason | null;
}

export interface ComfortBatchResult {
  readonly events: number;
  readonly accepted: number;
  readonly duplicates: number;
  readonly rejected: number;
}

export interface ComfortMetricsStats {
  readonly version: typeof COMFORT_METRICS_VERSION;
  /** Ingest attempts, including duplicates and rejections. */
  readonly events: number;
  readonly accepted: number;
  readonly duplicates: number;
  readonly rejected: number;
  /** Always `0`: aggregates are incremental and no history is ever rescanned. */
  readonly historyScans: 0;
  readonly retainedKeys: number;
  readonly droppedKeys: number;
  readonly retainedRides: number;
  readonly droppedRides: number;
  readonly snapshotCalls: number;
  readonly minTick: number | null;
  readonly maxTick: number | null;
  readonly lastRejection: ComfortRejectionReason | null;
  readonly disposed: boolean;
}

export interface ComfortMetricsResetOptions {
  /** Keeps the ingest/snapshot counters when `true`; aggregates and keys are always cleared. */
  readonly preserveStats?: boolean;
}

export interface ComfortMetricsReset {
  readonly preserveStats: boolean;
  readonly clearedKeys: number;
  readonly clearedRides: number;
}

export interface ComfortMetricsOptions {
  /** Bounded idempotency memory; defaults to `COMFORT_METRICS_LIMITS.retainedKeys`. */
  readonly retainedKeys?: number;
  /** Bounded per-ride read model; defaults to `COMFORT_METRICS_LIMITS.retainedRides`. */
  readonly retainedRides?: number;
}

export interface ComfortMetrics {
  readonly version: typeof COMFORT_METRICS_VERSION;
  ingest(event: unknown): ComfortIngestResult;
  ingestMany(events: readonly unknown[]): ComfortBatchResult;
  snapshot(input: unknown): ComfortMetricsSnapshot;
  getStats(): ComfortMetricsStats;
  reset(options?: unknown): ComfortMetricsReset;
  dispose(): void;
}

class ComfortMetricsRejection extends Error {
  readonly reason: ComfortRejectionReason;
  constructor(reason: ComfortRejectionReason) {
    super(`Comfort event rejected: ${reason}`);
    this.name = 'ComfortMetricsRejection';
    this.reason = reason;
  }
}

interface MutableAggregate {
  intervals: number;
  passengerSeconds: number;
  jerkSamples: number;
  lateralSamples: number;
  accelerationSum: number;
  lateralSum: number;
  peakAcceleration: number;
  peakLateral: number;
  peakJerk: number;
  accelerationViolations: number;
  jerkViolations: number;
  lateralViolations: number;
}

interface MutableRide {
  readonly rideId: string;
  vehicleId: string;
  readonly modes: Set<ControlMode>;
  readonly aggregate: MutableAggregate;
  impacts: number;
  lastToTick: number | null;
  lastAcceleration: number | null;
}

type ParsedEvent =
  | {
      readonly kind: 'PASSENGER_INTERVAL';
      readonly eventId: string;
      readonly rideId: string;
      readonly vehicleId: string;
      readonly controlMode: ControlMode;
      readonly learningEligible: boolean;
      readonly fromTick: number;
      readonly toTick: number;
      readonly durationSeconds: number;
      readonly longitudinalAccelerationMps2: number;
      readonly lateralAccelerationMps2: number | null;
      readonly lateralLimitMps2: number | null;
    }
  | {
      readonly kind: 'PASSENGER_IMPACT';
      readonly eventId: string;
      readonly rideId: string;
      readonly vehicleId: string;
      readonly tick: number;
      readonly incidentId: string;
      readonly impulseNs: number;
    };

const intervalFields = [
  'eventId',
  'kind',
  'rideId',
  'vehicleId',
  'controlMode',
  'learningEligible',
  'fromTick',
  'toTick',
  'durationSeconds',
  'longitudinalAccelerationMps2',
  'lateralAccelerationMps2',
  'lateralLimitMps2',
] as const;
const impactFields = [
  'eventId',
  'kind',
  'rideId',
  'vehicleId',
  'tick',
  'incidentId',
  'impulseNs',
] as const;
const snapshotFields = ['fleet', 'tick', 'simulatedSeconds'] as const;
const optionKeys = ['retainedKeys', 'retainedRides'] as const;

function reject(reason: ComfortRejectionReason): never {
  throw new ComfortMetricsRejection(reason);
}

function plainEvent(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) reject('INVALID_SHAPE');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) reject('INVALID_SHAPE');
  return value as Record<string, unknown>;
}

function readClosedFields(
  data: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): void {
  const keys = Object.keys(data);
  if (keys.length < required.length || keys.length > required.length + optional.length)
    reject('UNKNOWN_FIELD');
  for (const key of required) if (!Object.hasOwn(data, key)) reject('INVALID_SHAPE');
  for (const key of keys)
    if (!required.includes(key) && !optional.includes(key)) reject('UNKNOWN_FIELD');
}

function readIdentity(value: unknown): string {
  if (typeof value !== 'string') reject('INVALID_IDENTITY');
  if (value.length === 0 || value.length > COMFORT_METRICS_LIMITS.idCodeUnits)
    reject('INVALID_IDENTITY');
  if (value.trim() !== value) reject('INVALID_IDENTITY');
  return value;
}

function readTickValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    reject('INVALID_NUMBER');
  return value;
}

function readBoundedNumber(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    reject('INVALID_NUMBER');
  return value;
}

function readChoice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value))
    reject('UNKNOWN_KIND');
  return value as T;
}

function readFlag(value: unknown): boolean {
  if (typeof value !== 'boolean') reject('INVALID_SHAPE');
  return value;
}

function readOptionalNumber(value: unknown, maximum: number): number | null {
  if (value === null) return null;
  return readBoundedNumber(value, 0, maximum);
}

function parseEvent(value: unknown): ParsedEvent {
  const data = plainEvent(value);
  const kind = readChoice(data.kind, comfortEventKinds);
  if (kind === 'PASSENGER_INTERVAL') {
    readClosedFields(data, intervalFields, []);
    const controlMode = readChoice(data.controlMode, controlModes);
    const learningEligible = readFlag(data.learningEligible);
    if (learningEligible !== (controlMode === 'LEARNING')) reject('INCONSISTENT_STATE');
    const fromTick = readTickValue(data.fromTick);
    const toTick = readTickValue(data.toTick);
    if (toTick <= fromTick) reject('INVALID_NUMBER');
    if (toTick - fromTick > COMFORT_METRICS_LIMITS.maximumIntervalTicks) reject('LIMIT_EXCEEDED');
    const durationSeconds = readBoundedNumber(
      data.durationSeconds,
      0,
      COMFORT_METRICS_LIMITS.maximumIntervalSeconds,
    );
    if (durationSeconds <= 0) reject('INVALID_NUMBER');
    const lateralAccelerationMps2 = readOptionalNumber(
      data.lateralAccelerationMps2,
      COMFORT_METRICS_LIMITS.maximumAccelerationMps2,
    );
    const lateralLimitMps2 = readOptionalNumber(
      data.lateralLimitMps2,
      COMFORT_METRICS_LIMITS.maximumAccelerationMps2,
    );
    if (lateralLimitMps2 !== null && lateralLimitMps2 <= 0) reject('INVALID_NUMBER');
    return {
      kind,
      eventId: readIdentity(data.eventId),
      rideId: readIdentity(data.rideId),
      vehicleId: readIdentity(data.vehicleId),
      controlMode,
      learningEligible,
      fromTick,
      toTick,
      durationSeconds,
      longitudinalAccelerationMps2: readBoundedNumber(
        data.longitudinalAccelerationMps2,
        -COMFORT_METRICS_LIMITS.maximumAccelerationMps2,
        COMFORT_METRICS_LIMITS.maximumAccelerationMps2,
      ),
      lateralAccelerationMps2,
      lateralLimitMps2,
    };
  }
  readClosedFields(data, impactFields, []);
  return {
    kind,
    eventId: readIdentity(data.eventId),
    rideId: readIdentity(data.rideId),
    vehicleId: readIdentity(data.vehicleId),
    tick: readTickValue(data.tick),
    incidentId: readIdentity(data.incidentId),
    impulseNs: readBoundedNumber(data.impulseNs, 0, COMFORT_METRICS_LIMITS.maximumImpulseNs),
  };
}

function plainSnapshotInput(value: unknown): Record<string, unknown> {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Comfort snapshot requires an object',
  );
  const prototype: unknown = Object.getPrototypeOf(value);
  requireContract(
    prototype === Object.prototype || prototype === null,
    'Comfort snapshot requires plain data',
  );
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.length < 1 || keys.length > snapshotFields.length) reject('UNKNOWN_FIELD');
  if (!Object.hasOwn(data, 'tick')) reject('INVALID_SHAPE');
  for (const key of keys)
    if (!(snapshotFields as readonly string[]).includes(key)) reject('UNKNOWN_FIELD');
  return data;
}

function readCountField(value: unknown, label: string): number {
  requireContract(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    `Fleet ${label} count must be a nonnegative integer`,
  );
  return value;
}

function readFleet(value: unknown): ComfortFleetCounts {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as { counts?: unknown }).counts === 'function',
    'Comfort snapshot requires a fleet counts port',
  );
  const raw: unknown = (value as { counts: () => unknown }).counts();
  requireContract(
    typeof raw === 'object' && raw !== null && !Array.isArray(raw),
    'Fleet counts must be an object',
  );
  const counts = raw as Record<string, unknown>;
  const vehicles = readCountField(counts.vehicles, 'vehicle');
  const taxis = readCountField(counts.taxis, 'taxi');
  const civilians = readCountField(counts.civilians, 'civilian');
  requireContract(
    vehicles === taxis + civilians,
    'Fleet counts must include every vehicle exactly once',
  );
  return Object.freeze({ vehicles, taxis, civilians });
}

function zeroAggregate(): MutableAggregate {
  return {
    intervals: 0,
    passengerSeconds: 0,
    jerkSamples: 0,
    lateralSamples: 0,
    accelerationSum: 0,
    lateralSum: 0,
    peakAcceleration: 0,
    peakLateral: 0,
    peakJerk: 0,
    accelerationViolations: 0,
    jerkViolations: 0,
    lateralViolations: 0,
  };
}

function freezeAggregate(mode: ControlMode | 'ALL', aggregate: MutableAggregate): ComfortAggregate {
  return Object.freeze({
    mode,
    intervals: aggregate.intervals,
    passengerSeconds: round(aggregate.passengerSeconds),
    jerkSamples: aggregate.jerkSamples,
    lateralSamples: aggregate.lateralSamples,
    peakAccelerationMps2: round(aggregate.peakAcceleration),
    meanAccelerationAbsMps2: round(
      aggregate.intervals === 0 ? 0 : aggregate.accelerationSum / aggregate.intervals,
    ),
    peakLateralAccelerationMps2: round(aggregate.peakLateral),
    meanLateralAccelerationMps2: round(
      aggregate.lateralSamples === 0 ? 0 : aggregate.lateralSum / aggregate.lateralSamples,
    ),
    peakJerkMps3: round(aggregate.peakJerk),
    accelerationViolations: aggregate.accelerationViolations,
    jerkViolations: aggregate.jerkViolations,
    lateralViolations: aggregate.lateralViolations,
  });
}

export function createComfortMetrics(options: ComfortMetricsOptions = {}): ComfortMetrics {
  const option = plainEvent(options);
  readClosedFields(option, [], optionKeys);
  const retainedKeys = Object.hasOwn(option, 'retainedKeys')
    ? readBoundedNumber(option.retainedKeys, 1, COMFORT_METRICS_LIMITS.retainedKeys)
    : COMFORT_METRICS_LIMITS.retainedKeys;
  requireContract(
    Number.isSafeInteger(retainedKeys),
    'Comfort metrics retained key capacity must be an integer',
  );
  const retainedRides = Object.hasOwn(option, 'retainedRides')
    ? readBoundedNumber(option.retainedRides, 1, COMFORT_METRICS_LIMITS.retainedRides)
    : COMFORT_METRICS_LIMITS.retainedRides;
  requireContract(
    Number.isSafeInteger(retainedRides),
    'Comfort metrics retained ride capacity must be an integer',
  );

  const keys = new Map<string, true>();
  let overall = zeroAggregate();
  const byMode = new Map<ControlMode, MutableAggregate>(
    controlModes.map((mode) => [mode, zeroAggregate()]),
  );
  const rides = new Map<string, MutableRide>();
  let impactCount = 0;
  let impactImpulseSum = 0;
  let impactPeakImpulse = 0;
  let eventsTotal = 0;
  let acceptedTotal = 0;
  let duplicates = 0;
  let rejected = 0;
  let droppedKeys = 0;
  let droppedRides = 0;
  let snapshotCalls = 0;
  let minTick: number | null = null;
  let maxTick: number | null = null;
  let lastRejection: ComfortRejectionReason | null = null;
  let disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Comfort metrics disposed');
  }

  function nextCounter(value: number): number {
    if (value >= COMFORT_METRICS_LIMITS.maximumSum) reject('LIMIT_EXCEEDED');
    return value + 1;
  }

  function nextSum(current: number, delta: number): number {
    const next = current + delta;
    if (!Number.isFinite(next) || next > COMFORT_METRICS_LIMITS.maximumSum)
      reject('LIMIT_EXCEEDED');
    return next;
  }

  function noteTick(atTick: number): void {
    minTick = minTick === null ? atTick : Math.min(minTick, atTick);
    maxTick = maxTick === null ? atTick : Math.max(maxTick, atTick);
  }

  function remember(key: string): void {
    keys.set(key, true);
    while (keys.size > retainedKeys) {
      const oldest = keys.keys().next().value;
      if (oldest === undefined) break;
      keys.delete(oldest);
      droppedKeys += 1;
    }
  }

  function rideOf(rideId: string, vehicleId: string): MutableRide {
    const existing = rides.get(rideId);
    if (existing !== undefined) return existing;
    const created: MutableRide = {
      rideId,
      vehicleId,
      modes: new Set<ControlMode>(),
      aggregate: zeroAggregate(),
      impacts: 0,
      lastToTick: null,
      lastAcceleration: null,
    };
    rides.set(rideId, created);
    while (rides.size > retainedRides) {
      const oldest = rides.keys().next().value;
      if (oldest === undefined) break;
      rides.delete(oldest);
      droppedRides += 1;
    }
    return created;
  }

  /** Applies one parsed interval to the fleet aggregate, the mode aggregate and the ride. */
  function applyInterval(event: Extract<ParsedEvent, { kind: 'PASSENGER_INTERVAL' }>): void {
    const existing = rides.get(event.rideId);
    // Consecutive intervals share their boundary tick; a real overlap or a step back is refused.
    if (
      existing !== undefined &&
      existing.lastToTick !== null &&
      event.fromTick < existing.lastToTick
    )
      reject('OUT_OF_ORDER');
    const ride = rideOf(event.rideId, event.vehicleId);
    const magnitude = Math.abs(event.longitudinalAccelerationMps2);
    const exceedsAcceleration =
      magnitude > COMFORT_THRESHOLDS.maxAccelerationMps2 + COMFORT_LIMIT_EPSILON;
    const lateral =
      event.lateralAccelerationMps2 === null ? null : Math.abs(event.lateralAccelerationMps2);
    const exceedsLateral =
      lateral !== null &&
      event.lateralLimitMps2 !== null &&
      lateral > event.lateralLimitMps2 + COMFORT_LIMIT_EPSILON;
    // The jerk of an interval is the difference to the previous interval of the same ride.
    const jerk =
      ride.lastAcceleration === null
        ? null
        : (event.longitudinalAccelerationMps2 - ride.lastAcceleration) / event.durationSeconds;
    const jerkMagnitude = jerk === null ? 0 : Math.abs(jerk);
    const exceedsJerk =
      jerk !== null && jerkMagnitude > COMFORT_THRESHOLDS.maxJerkMps3 + COMFORT_LIMIT_EPSILON;

    // Every new value is computed before a single accumulator is written.
    const targets = [overall, byMode.get(event.controlMode)!, ride.aggregate];
    const next = targets.map((target) => ({
      intervals: nextCounter(target.intervals),
      passengerSeconds: nextSum(target.passengerSeconds, event.durationSeconds),
      jerkSamples: jerk === null ? target.jerkSamples : nextCounter(target.jerkSamples),
      lateralSamples: lateral === null ? target.lateralSamples : nextCounter(target.lateralSamples),
      accelerationSum: nextSum(target.accelerationSum, magnitude),
      lateralSum: lateral === null ? target.lateralSum : nextSum(target.lateralSum, lateral),
      peakAcceleration: Math.max(target.peakAcceleration, magnitude),
      peakLateral: lateral === null ? target.peakLateral : Math.max(target.peakLateral, lateral),
      peakJerk: jerk === null ? target.peakJerk : Math.max(target.peakJerk, jerkMagnitude),
      accelerationViolations: exceedsAcceleration
        ? nextCounter(target.accelerationViolations)
        : target.accelerationViolations,
      jerkViolations: exceedsJerk ? nextCounter(target.jerkViolations) : target.jerkViolations,
      lateralViolations: exceedsLateral
        ? nextCounter(target.lateralViolations)
        : target.lateralViolations,
    }));
    for (let index = 0; index < targets.length; index += 1)
      Object.assign(targets[index]!, next[index]!);

    ride.modes.add(event.controlMode);
    ride.lastToTick = event.toTick;
    ride.lastAcceleration = event.longitudinalAccelerationMps2;
    noteTick(event.toTick);
  }

  /** Applies one real impact; it never touches a comfort aggregate. */
  function applyImpact(event: Extract<ParsedEvent, { kind: 'PASSENGER_IMPACT' }>): void {
    const ride = rideOf(event.rideId, event.vehicleId);
    impactCount = nextCounter(impactCount);
    impactImpulseSum = nextSum(impactImpulseSum, event.impulseNs);
    impactPeakImpulse = Math.max(impactPeakImpulse, event.impulseNs);
    ride.impacts = nextCounter(ride.impacts);
    noteTick(event.tick);
  }

  function result(
    status: ComfortIngestStatus,
    eventId: string | null,
    reason: ComfortRejectionReason | null,
  ): ComfortIngestResult {
    return Object.freeze({ status, eventId, reason });
  }

  function ingest(event: unknown): ComfortIngestResult {
    assertLive();
    requireContract(
      eventsTotal < COMFORT_METRICS_LIMITS.maximumSum,
      'Comfort metrics event counter exhausted',
    );
    eventsTotal += 1;
    try {
      const parsed = parseEvent(event);
      if (keys.has(parsed.eventId)) {
        duplicates += 1;
        return result('DUPLICATE', parsed.eventId, null);
      }
      if (parsed.kind === 'PASSENGER_INTERVAL') applyInterval(parsed);
      else applyImpact(parsed);
      remember(parsed.eventId);
      acceptedTotal += 1;
      return result('ACCEPTED', parsed.eventId, null);
    } catch (error: unknown) {
      if (error instanceof ComfortMetricsRejection) {
        rejected += 1;
        lastRejection = error.reason;
        return result('REJECTED', null, error.reason);
      }
      throw error;
    }
  }

  function ingestMany(events: readonly unknown[]): ComfortBatchResult {
    assertLive();
    requireContract(Array.isArray(events), 'Comfort ingestMany requires an array of events');
    let accepted = 0,
      duplicate = 0,
      failed = 0;
    for (let index = 0; index < events.length; index += 1) {
      const entry = ingest(events[index]);
      if (entry.status === 'ACCEPTED') accepted += 1;
      else if (entry.status === 'DUPLICATE') duplicate += 1;
      else failed += 1;
    }
    return Object.freeze({
      events: events.length,
      accepted,
      duplicates: duplicate,
      rejected: failed,
    });
  }

  function snapshot(input: unknown): ComfortMetricsSnapshot {
    assertLive();
    const data = plainSnapshotInput(input);
    const atTick = readTickValue(data.tick);
    const simulatedSeconds =
      data.simulatedSeconds === undefined
        ? 0
        : readBoundedNumber(data.simulatedSeconds, 0, Number.MAX_SAFE_INTEGER);
    const fleet = data.fleet === undefined ? null : readFleet(data.fleet);
    const rideAggregates = [...rides.values()]
      .map((ride) =>
        Object.freeze({
          ...freezeAggregate('ALL', ride.aggregate),
          rideId: ride.rideId,
          vehicleId: ride.vehicleId,
          controlModes: Object.freeze([...ride.modes].sort()),
          impacts: ride.impacts,
        }),
      )
      .sort((left, right) =>
        left.rideId < right.rideId ? -1 : left.rideId > right.rideId ? 1 : 0,
      );
    let affectedRides = 0;
    for (const ride of rides.values()) if (ride.impacts > 0) affectedRides += 1;
    snapshotCalls += 1;
    return Object.freeze({
      schemaVersion: 1 as const,
      units: 'SI' as const,
      version: COMFORT_METRICS_VERSION,
      tick: atTick,
      simulatedSeconds,
      fleet,
      thresholds: Object.freeze({ ...COMFORT_THRESHOLDS }),
      overall: freezeAggregate('ALL', overall),
      byMode: Object.freeze(controlModes.map((mode) => freezeAggregate(mode, byMode.get(mode)!))),
      rides: Object.freeze(rideAggregates),
      impacts: Object.freeze({
        impacts: impactCount,
        impulseSumNs: round(impactImpulseSum),
        peakImpulseNs: round(impactPeakImpulse),
        affectedRides,
      }),
      historyScans: 0 as const,
      snapshotCalls,
    });
  }

  function getStats(): ComfortMetricsStats {
    return Object.freeze({
      version: COMFORT_METRICS_VERSION,
      events: disposed ? 0 : eventsTotal,
      accepted: disposed ? 0 : acceptedTotal,
      duplicates: disposed ? 0 : duplicates,
      rejected: disposed ? 0 : rejected,
      historyScans: 0 as const,
      retainedKeys: disposed ? 0 : keys.size,
      droppedKeys: disposed ? 0 : droppedKeys,
      retainedRides: disposed ? 0 : rides.size,
      droppedRides: disposed ? 0 : droppedRides,
      snapshotCalls: disposed ? 0 : snapshotCalls,
      minTick: disposed ? null : minTick,
      maxTick: disposed ? null : maxTick,
      lastRejection: disposed ? null : lastRejection,
      disposed,
    });
  }

  function reset(options: unknown = undefined): ComfortMetricsReset {
    assertLive();
    const data = options === undefined ? {} : plainEvent(options);
    readClosedFields(data, [], ['preserveStats']);
    const preserveStats = data.preserveStats === undefined ? false : data.preserveStats;
    if (typeof preserveStats !== 'boolean')
      throw new Error('Comfort reset preserveStats must be a boolean');
    const clearedKeys = keys.size;
    const clearedRides = rides.size;
    keys.clear();
    rides.clear();
    overall = zeroAggregate();
    for (const mode of controlModes) byMode.set(mode, zeroAggregate());
    impactCount = 0;
    impactImpulseSum = 0;
    impactPeakImpulse = 0;
    minTick = null;
    maxTick = null;
    if (!preserveStats) {
      eventsTotal = 0;
      acceptedTotal = 0;
      duplicates = 0;
      rejected = 0;
      droppedKeys = 0;
      droppedRides = 0;
      snapshotCalls = 0;
      lastRejection = null;
    }
    return Object.freeze({ preserveStats, clearedKeys, clearedRides });
  }

  return Object.freeze({
    version: COMFORT_METRICS_VERSION,
    ingest,
    ingestMany,
    snapshot,
    getStats,
    reset,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      keys.clear();
      rides.clear();
      overall = zeroAggregate();
      for (const mode of controlModes) byMode.set(mode, zeroAggregate());
      impactCount = 0;
      impactImpulseSum = 0;
      impactPeakImpulse = 0;
      eventsTotal = 0;
      acceptedTotal = 0;
      duplicates = 0;
      rejected = 0;
      droppedKeys = 0;
      droppedRides = 0;
      snapshotCalls = 0;
      minTick = null;
      maxTick = null;
      lastRejection = null;
    },
  });
}

/** The version of the review model that reads the comfort read model. */
export const COMFORT_REVIEW_MODEL_VERSION = '139-comfort-review-v1' as const;

/**
 * The versioned coefficients of the comfort term of the module 22 rating formula
 * (`rating = clamp(5 − delayPenalty − comfortPenalty − …, 0, 5)`). The penalty is the share of
 * violated passenger intervals per family, scaled by the points of the family and capped by the
 * rating base, so a comfortable drive keeps the full score and a rough drive cannot exceed the
 * base. The values are the project's calibration proposal, versioned with the model.
 */
export const COMFORT_REVIEW_COEFFICIENTS = Object.freeze({
  version: COMFORT_REVIEW_MODEL_VERSION,
  /** The rating base of the module 22 formula. */
  ratingBase: 5,
  /** Rating points removed per unit of violated interval fraction, per family. */
  accelerationPenaltyPoints: 2,
  jerkPenaltyPoints: 2,
  lateralPenaltyPoints: 1,
  /** The comfort penalty can never exceed the rating base. */
  maximumPenalty: 5,
});

export interface ComfortReviewModel {
  readonly version: typeof COMFORT_REVIEW_MODEL_VERSION;
  /** `null` without a passenger interval: no exposure, no certified comfort term. */
  readonly comfortPenalty: number | null;
  /** `5 − comfortPenalty`; `null` without a passenger interval. */
  readonly comfortScore: number | null;
  /** Passenger intervals the term was derived from. */
  readonly comfortIntervals: number;
  readonly accelerationPenalty: number;
  readonly jerkPenalty: number;
  readonly lateralPenalty: number;
  /** The real impacts of the passenger experience; they never enter a comfort term. */
  readonly impacts: ComfortImpactAggregate;
}

/**
 * The comfort term of the review model, read from the same aggregates as the mission gate and the
 * dashboard. The real impacts travel beside it, because the rating counts the incident while the
 * comfort of the command does not.
 */
export function comfortReviewModel(snapshot: ComfortMetricsSnapshot): ComfortReviewModel {
  requireContract(
    typeof snapshot === 'object' &&
      snapshot !== null &&
      typeof snapshot.overall === 'object' &&
      snapshot.overall !== null,
    'Comfort review model requires a comfort snapshot',
  );
  const overall = snapshot.overall;
  const accelerationPenalty =
    overall.intervals === 0
      ? 0
      : (overall.accelerationViolations / overall.intervals) *
        COMFORT_REVIEW_COEFFICIENTS.accelerationPenaltyPoints;
  const jerkPenalty =
    overall.jerkSamples === 0
      ? 0
      : (overall.jerkViolations / overall.jerkSamples) *
        COMFORT_REVIEW_COEFFICIENTS.jerkPenaltyPoints;
  const lateralPenalty =
    overall.lateralSamples === 0
      ? 0
      : (overall.lateralViolations / overall.lateralSamples) *
        COMFORT_REVIEW_COEFFICIENTS.lateralPenaltyPoints;
  if (overall.intervals === 0)
    return Object.freeze({
      version: COMFORT_REVIEW_MODEL_VERSION,
      comfortPenalty: null,
      comfortScore: null,
      comfortIntervals: 0,
      accelerationPenalty: 0,
      jerkPenalty: 0,
      lateralPenalty: 0,
      impacts: snapshot.impacts,
    });
  const penalty = Math.min(
    COMFORT_REVIEW_COEFFICIENTS.maximumPenalty,
    accelerationPenalty + jerkPenalty + lateralPenalty,
  );
  return Object.freeze({
    version: COMFORT_REVIEW_MODEL_VERSION,
    comfortPenalty: round(penalty),
    comfortScore: round(Math.max(0, COMFORT_REVIEW_COEFFICIENTS.ratingBase - penalty)),
    comfortIntervals: overall.intervals,
    accelerationPenalty: round(accelerationPenalty),
    jerkPenalty: round(jerkPenalty),
    lateralPenalty: round(lateralPenalty),
    impacts: snapshot.impacts,
  });
}
