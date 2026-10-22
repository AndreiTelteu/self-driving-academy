import { record, requireContract, text, tick } from '../sessions';
import { rideStates } from '../fleet';
import type { RideState } from '../fleet';
import { parameterRegistry } from '../profiles';
import { ARTIFACT_FILTER_TICK_HZ } from '../telemetry';
import type { FilteredWindowRecord, TickSampleReadout } from '../telemetry';
import { controlModes } from '../vehicles';
import type { ControlMode } from '../vehicles';
import { boundedId, plainFields, requireRequired } from './contracts';
import { parseMissionCatalog } from './definitions';
import type { MissionCatalog, MissionDefinition } from './definitions';

/**
 * 121 comfort objective for the passenger ride.
 *
 * The objective is explicit and separate from style fidelity: it evaluates only acceleration and
 * jerk while a passenger is aboard, and its result never reads or reports a style score. The
 * measurement reuses the real 088 artefact filter: every 088 window hands over its suppressed
 * span, and no sample inside a suppressed span, and no interval that crosses one, enters the
 * metric. A 030 recovery teleport therefore cannot fabricate a comfort violation, because 088
 * already labels it `TELEPORT` and suppresses the boundary tick and everything after it.
 *
 * Every input is a real contract of the project, never an invented number:
 *
 * - the thresholds are the shipped defaults of the project driving-parameter catalog
 *   (`comfort_deceleration` and `acceleration_jerk`), frozen as mission constants; no published
 *   or manually tuned profile is read at runtime and the comfort objective is not a profile key;
 * - the passenger is derived from the real 061 ride lifecycle (`TO_DROPOFF`/`DROPOFF` carry the
 *   passenger, `TO_PICKUP`/`PICKUP` do not), so passenger presence cannot be asserted freely;
 * - the samples come from the real 085 tick-sample recorder through
 *   {@link comfortTelemetryFromTickSamples}, and the segment facts come from the real 069
 *   MANUAL/LEARNING segment lifecycle;
 * - the exclusions come from the real 088 artefact filter windows.
 *
 * Units are SI. Ticks are authoritative 60 Hz simulation ticks; the module owns no wall clock,
 * DOM, renderer, profile store or random source.
 */
export const COMFORT_SCHEMA_VERSION = '121-mission-comfort-v1' as const;
export const COMFORT_OBJECTIVE_ID = 'passenger-comfort' as const;
export const COMFORT_MISSION_ID = 'campaign-5-comfort-ride' as const;
export const COMFORT_TICK_HZ = ARTIFACT_FILTER_TICK_HZ;

export const COMFORT_LIMITS = Object.freeze({
  version: COMFORT_SCHEMA_VERSION,
  /** Speed samples accepted for one ride window. */
  samples: 20_000,
  /** 088 windows accepted for one evaluation. */
  windows: 64,
  /** 069 segments accepted for one evaluation. */
  segments: 16,
  /** Distinct suppressed spans accepted for one evaluation. */
  spans: 64,
  /** Code units for a ride, vehicle, segment or objective identity. */
  idCodeUnits: 256,
  /** Code units for the objective label. */
  labelCodeUnits: 160,
});

/**
 * Provenance of the two thresholds. The values are read from the shipped project driving-parameter
 * catalog, so the comfort gate is a real project figure and not a number invented for the mission.
 * A published profile can tune `comfort_deceleration`/`acceleration_jerk` for the longitudinal
 * controller; the comfort objective keeps the catalog default and never follows a profile.
 */
export const COMFORT_THRESHOLD_SOURCE = Object.freeze({
  maxAccelerationMps2: 'comfort_deceleration',
  maxJerkMps3: 'acceleration_jerk',
  catalog: 'project driving-parameter catalog default',
});

/**
 * Calibration thresholds taken from the shipped catalog defaults:
 * `comfort_deceleration` = 2 m/s² (the project's own comfortable longitudinal magnitude) and
 * `acceleration_jerk` = 2 m/s³ (the jerk rate the longitudinal controller itself uses). A peak
 * above either limit fails the ride, and the count of exceedances is reported per metric.
 */
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

/** Real 069 segment facts for the evaluated window. */
export interface ComfortSegmentFacts {
  readonly segmentId: string;
  readonly controlMode: ControlMode;
  readonly learningEligible: boolean;
  readonly startTick: number;
  readonly endTick: number;
}

export interface ComfortObjective {
  readonly version: typeof COMFORT_SCHEMA_VERSION;
  readonly units: 'SI';
  readonly objectiveId: string;
  readonly label: string;
  /** Comfort is only defined with a passenger aboard; a solo drive cannot satisfy it. */
  readonly passengerRequired: true;
  /** The only accepted discontinuity policy; reuses the 088 suppressed spans. */
  readonly artifactPolicy: 'EXCLUDE_ARTIFACT_SUPPRESSED_SPANS';
  /** Explicit separation from the imitation score. */
  readonly separation: Readonly<{
    readonly styleFidelity: 'NOT_USED';
    readonly styleScore: 'NOT_USED';
  }>;
  /** Where the two thresholds come from; the objective never reads a profile. */
  readonly thresholdSource: typeof COMFORT_THRESHOLD_SOURCE;
  readonly thresholds: ComfortThresholds;
  readonly evaluation: Readonly<{
    /** Maximum evaluated ride length in ticks; a longer ride is refused, not truncated silently. */
    readonly windowTicks: number;
    /** Minimum number of usable acceleration intervals for a verdict. */
    readonly minimumSamples: number;
  }>;
}

const objectiveFields = [
  'version',
  'units',
  'objectiveId',
  'label',
  'passengerRequired',
  'artifactPolicy',
  'separation',
  'thresholdSource',
  'thresholds',
  'evaluation',
] as const;
const separationFields = ['styleFidelity', 'styleScore'] as const;
const thresholdSourceFields = ['maxAccelerationMps2', 'maxJerkMps3', 'catalog'] as const;
const thresholdFields = ['maxAccelerationMps2', 'maxJerkMps3'] as const;
const evaluationFields = ['windowTicks', 'minimumSamples'] as const;

export const COMFORT_OBJECTIVE: ComfortObjective = Object.freeze({
  version: COMFORT_SCHEMA_VERSION,
  units: 'SI' as const,
  objectiveId: COMFORT_OBJECTIVE_ID,
  label: 'Cursă cu obiectiv de confort: pasager la bord, fără accelerații sau jerk peste prag',
  passengerRequired: true as const,
  artifactPolicy: 'EXCLUDE_ARTIFACT_SUPPRESSED_SPANS' as const,
  separation: Object.freeze({
    styleFidelity: 'NOT_USED' as const,
    styleScore: 'NOT_USED' as const,
  }),
  thresholdSource: COMFORT_THRESHOLD_SOURCE,
  thresholds: Object.freeze({ ...COMFORT_THRESHOLDS }),
  evaluation: Object.freeze({ windowTicks: 7_200, minimumSamples: 8 }),
});

function positiveNumber(value: unknown, maximum: number, label: string): number {
  requireContract(
    typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= maximum,
    `Invalid ${label}`,
  );
  return value;
}

export function parseComfortObjective(value: unknown): ComfortObjective {
  const data = plainFields(value, objectiveFields, 'comfort objective');
  for (const key of objectiveFields) requireRequired(data, key, 'comfort objective');
  requireContract(
    data.version === COMFORT_SCHEMA_VERSION && data.units === 'SI',
    'Unsupported comfort objective version or units',
  );
  requireContract(data.passengerRequired === true, 'Comfort objective requires a passenger');
  requireContract(
    data.artifactPolicy === 'EXCLUDE_ARTIFACT_SUPPRESSED_SPANS',
    'Comfort objective requires the 088 suppressed spans',
  );
  const separation = plainFields(data.separation, separationFields, 'comfort separation');
  requireContract(
    separation.styleFidelity === 'NOT_USED' && separation.styleScore === 'NOT_USED',
    'Comfort objective cannot use style fidelity or a style score',
  );
  const source = plainFields(
    data.thresholdSource,
    thresholdSourceFields,
    'comfort threshold source',
  );
  requireContract(
    source.maxAccelerationMps2 === COMFORT_THRESHOLD_SOURCE.maxAccelerationMps2 &&
      source.maxJerkMps3 === COMFORT_THRESHOLD_SOURCE.maxJerkMps3 &&
      source.catalog === COMFORT_THRESHOLD_SOURCE.catalog,
    'Comfort objective must keep the catalog threshold source',
  );
  const thresholds = plainFields(data.thresholds, thresholdFields, 'comfort thresholds');
  const evaluation = plainFields(data.evaluation, evaluationFields, 'comfort evaluation');
  const windowTicks = evaluation.windowTicks;
  requireContract(
    typeof windowTicks === 'number' && Number.isSafeInteger(windowTicks) && windowTicks > 0,
    'Invalid comfort evaluation window',
  );
  const minimumSamples = evaluation.minimumSamples;
  requireContract(
    typeof minimumSamples === 'number' &&
      Number.isSafeInteger(minimumSamples) &&
      minimumSamples >= 2 &&
      minimumSamples <= COMFORT_LIMITS.samples,
    'Invalid comfort minimum sample count',
  );
  return Object.freeze({
    version: COMFORT_SCHEMA_VERSION,
    units: 'SI' as const,
    objectiveId: boundedId(data.objectiveId, COMFORT_LIMITS.idCodeUnits, 'comfort objective'),
    label: boundedId(data.label, COMFORT_LIMITS.labelCodeUnits, 'comfort objective label'),
    passengerRequired: true as const,
    artifactPolicy: 'EXCLUDE_ARTIFACT_SUPPRESSED_SPANS' as const,
    separation: Object.freeze({
      styleFidelity: 'NOT_USED' as const,
      styleScore: 'NOT_USED' as const,
    }),
    thresholdSource: COMFORT_THRESHOLD_SOURCE,
    thresholds: Object.freeze({
      maxAccelerationMps2: positiveNumber(
        thresholds.maxAccelerationMps2,
        100,
        'comfort acceleration threshold',
      ),
      maxJerkMps3: positiveNumber(thresholds.maxJerkMps3, 1_000, 'comfort jerk threshold'),
    }),
    evaluation: Object.freeze({ windowTicks, minimumSamples }),
  });
}

export const comfortStatuses = [
  'PASSED',
  'FAILED',
  'NO_PASSENGER',
  'INSUFFICIENT_DATA',
  'WINDOW_EXCEEDED',
] as const;
export type ComfortStatus = (typeof comfortStatuses)[number];

export const comfortFailureReasons = ['ACCELERATION_LIMIT', 'JERK_LIMIT', 'BOTH_LIMITS'] as const;
export type ComfortFailureReason = (typeof comfortFailureReasons)[number];

/**
 * The 061 ride states that carry the passenger. `TO_PICKUP` and `PICKUP` have an empty cabin;
 * `TO_DROPOFF` and `DROPOFF` transport the passenger; the terminal states have ended the ride.
 */
export const COMFORT_PASSENGER_RIDE_STATES = Object.freeze(['TO_DROPOFF', 'DROPOFF'] as const);

/** Passenger presence derived from the real 061 ride lifecycle, never asserted freely. */
export function comfortPassengerAboard(rideState: RideState): boolean {
  return (COMFORT_PASSENGER_RIDE_STATES as readonly string[]).includes(rideState);
}

export interface ComfortSpeedSample {
  readonly tick: number;
  readonly speedMps: number;
}

/**
 * The real 085 telemetry of one ride, projected for the comfort metric. `samples` carries the
 * recorded speed per tick and `recordedAccelerationMps2` the longitudinal acceleration that the
 * recorder stored, so the derived acceleration can be cross-checked against the real physics.
 * A ride may span several segments (a recovery reopens one), so the projection keeps every
 * segment identity it read.
 */
export interface ComfortTelemetry {
  readonly segmentIds: readonly string[];
  readonly controlMode: ControlMode;
  readonly learningEligible: boolean;
  readonly samples: readonly ComfortSpeedSample[];
  readonly recordedAccelerationMps2: readonly number[];
}

/** Projects real 085 tick-sample readouts into the comfort telemetry shape. */
export function comfortTelemetryFromTickSamples(
  readouts: readonly TickSampleReadout[],
): ComfortTelemetry {
  requireContract(
    Array.isArray(readouts) && readouts.length > 0,
    'Comfort telemetry needs at least one tick sample',
  );
  requireContract(readouts.length <= COMFORT_LIMITS.samples, 'Comfort telemetry capacity exceeded');
  const samples: ComfortSpeedSample[] = [];
  const recordedAccelerationMps2: number[] = [];
  const segmentIds: string[] = [];
  let previousTick = -1;
  let controlMode: ControlMode = 'MANUAL';
  let learningEligible = false;
  for (const readout of readouts) {
    const at = tick(readout.observation.tick);
    requireContract(at > previousTick, 'Comfort telemetry ticks must strictly increase');
    previousTick = at;
    const velocity = readout.observation.state.velocityMps;
    const speedMps = Math.hypot(velocity.x, velocity.y, velocity.z);
    requireContract(
      Number.isFinite(speedMps) && speedMps >= 0 && speedMps <= 150,
      'Invalid comfort telemetry speed',
    );
    const acceleration = readout.observation.physics.longitudinalAccelerationMps2;
    requireContract(
      Number.isFinite(acceleration) && Math.abs(acceleration) <= 1_000,
      'Invalid comfort telemetry acceleration',
    );
    if (samples.length === 0) {
      controlMode = readout.controlMode;
      learningEligible = readout.learningEligible;
      segmentIds.push(readout.segmentId);
    } else {
      requireContract(
        readout.controlMode === controlMode && readout.learningEligible === learningEligible,
        'Comfort telemetry must keep one control mode',
      );
      if (readout.segmentId !== segmentIds[segmentIds.length - 1])
        segmentIds.push(readout.segmentId);
    }
    samples.push(Object.freeze({ tick: at, speedMps }));
    recordedAccelerationMps2.push(acceleration);
  }
  return Object.freeze({
    segmentIds: Object.freeze(segmentIds),
    controlMode,
    learningEligible,
    samples: Object.freeze(samples),
    recordedAccelerationMps2: Object.freeze(recordedAccelerationMps2),
  });
}

export interface ComfortRide {
  readonly rideId: string;
  readonly vehicleId: string;
  /** Real 061 ride state; the passenger presence is derived from it. */
  readonly rideState: RideState;
  /** Real 069 segment facts for the evaluated window. */
  readonly segments: readonly ComfortSegmentFacts[];
  readonly startTick: number;
  readonly endTick: number;
  readonly samples: readonly ComfortSpeedSample[];
  /** Real 088 windows for this ride; their suppressed spans are the only exclusion source. */
  readonly artifactWindows: readonly FilteredWindowRecord[];
}

export interface ComfortMetrics {
  readonly peakAccelerationMps2: number;
  readonly meanAccelerationAbsMps2: number;
  readonly peakJerkMps3: number;
  readonly accelerationSamples: number;
  readonly jerkSamples: number;
  readonly accelerationViolations: number;
  readonly jerkViolations: number;
}

export interface ComfortResult {
  readonly version: typeof COMFORT_SCHEMA_VERSION;
  readonly objectiveId: string;
  readonly rideId: string;
  readonly vehicleId: string;
  readonly rideState: RideState;
  readonly passengerAboard: boolean;
  readonly segments: readonly ComfortSegmentFacts[];
  readonly status: ComfortStatus;
  readonly reason: ComfortFailureReason | null;
  readonly thresholds: ComfortThresholds;
  readonly window: Readonly<{
    readonly startTick: number;
    readonly endTick: number;
    readonly evaluatedEndTick: number;
    readonly ticks: number;
  }>;
  readonly samples: Readonly<{
    readonly received: number;
    readonly insideWindow: number;
    readonly used: number;
    readonly excluded: number;
    readonly outsideWindow: number;
  }>;
  readonly intervals: Readonly<{
    readonly acceleration: number;
    readonly jerk: number;
    readonly excluded: number;
  }>;
  readonly exclusions: Readonly<{
    readonly windows: number;
    readonly spans: number;
    readonly ticks: number;
    readonly teleports: number;
    readonly collisions: number;
    readonly pauses: number;
  }>;
  readonly metrics: ComfortMetrics;
  /** Comfort never reports an imitation/style outcome. */
  readonly styleFidelity: null;
  readonly styleScoreUsed: false;
}

const rideFields = [
  'rideId',
  'vehicleId',
  'rideState',
  'segments',
  'startTick',
  'endTick',
  'samples',
  'artifactWindows',
] as const;
const segmentFields = [
  'segmentId',
  'controlMode',
  'learningEligible',
  'startTick',
  'endTick',
] as const;
const sampleFields = ['tick', 'speedMps'] as const;
const spanFields = ['fromTick', 'toTick', 'ticks'] as const;

interface SuppressedSpan {
  readonly fromTick: number;
  readonly toTick: number;
}

interface ExcludedArtifactCounts {
  teleports: number;
  collisions: number;
  pauses: number;
}

function readSegment(value: unknown): ComfortSegmentFacts {
  const data = plainFields(value, segmentFields, 'comfort segment');
  for (const key of segmentFields) requireRequired(data, key, 'comfort segment');
  const controlMode = data.controlMode;
  requireContract(
    (controlModes as readonly string[]).includes(controlMode as string),
    'Unknown comfort segment control mode',
  );
  const learningEligible = data.learningEligible;
  requireContract(
    typeof learningEligible === 'boolean' && learningEligible === (controlMode === 'LEARNING'),
    'Comfort segment eligibility must match the control mode',
  );
  const startTick = tick(data.startTick);
  const endTick = tick(data.endTick);
  requireContract(endTick >= startTick, 'Comfort segment ends before it starts');
  return Object.freeze({
    segmentId: boundedId(data.segmentId, COMFORT_LIMITS.idCodeUnits, 'comfort segment'),
    controlMode: controlMode as ControlMode,
    learningEligible,
    startTick,
    endTick,
  });
}

function readRide(value: unknown): ComfortRide {
  const data = plainFields(value, rideFields, 'comfort ride');
  for (const key of rideFields) requireRequired(data, key, 'comfort ride');
  const rideState = data.rideState;
  requireContract(
    (rideStates as readonly string[]).includes(rideState as string),
    'Unknown comfort ride state',
  );
  requireContract(Array.isArray(data.segments), 'Comfort segments must be an array');
  requireContract(
    data.segments.length >= 1 && data.segments.length <= COMFORT_LIMITS.segments,
    'Comfort segment capacity exceeded',
  );
  const segments = data.segments.map((entry: unknown) => readSegment(entry));
  for (let index = 1; index < segments.length; index += 1)
    requireContract(
      segments[index]!.startTick > segments[index - 1]!.endTick,
      'Comfort segments must not overlap',
    );
  const startTick = tick(data.startTick);
  const endTick = tick(data.endTick);
  requireContract(endTick > startTick, 'Comfort ride window is empty');
  requireContract(
    segments[0]!.startTick === startTick && segments[segments.length - 1]!.endTick === endTick,
    'Comfort ride window must match its segments',
  );
  requireContract(Array.isArray(data.samples), 'Comfort samples must be an array');
  requireContract(
    data.samples.length <= COMFORT_LIMITS.samples,
    'Comfort sample capacity exceeded',
  );
  let previous = -1;
  const samples = data.samples.map((entry: unknown) => {
    const sample = plainFields(entry, sampleFields, 'comfort sample');
    for (const key of sampleFields) requireRequired(sample, key, 'comfort sample');
    const at = tick(sample.tick);
    requireContract(at > previous, 'Comfort samples must be strictly increasing');
    previous = at;
    requireContract(
      typeof sample.speedMps === 'number' &&
        Number.isFinite(sample.speedMps) &&
        sample.speedMps >= 0 &&
        sample.speedMps <= 150,
      'Invalid comfort speed sample',
    );
    return Object.freeze({ tick: at, speedMps: sample.speedMps });
  });
  requireContract(Array.isArray(data.artifactWindows), 'Comfort artifact windows must be an array');
  requireContract(
    data.artifactWindows.length <= COMFORT_LIMITS.windows,
    'Comfort artifact window capacity exceeded',
  );
  const artifactWindows = data.artifactWindows.map((entry: unknown) => {
    const window = record(entry);
    requireContract(
      window.windowClass === 'PREFIX_ELIGIBLE' || window.windowClass === 'FULLY_SUPPRESSED',
      'Unknown comfort artifact window class',
    );
    requireContract(Array.isArray(window.artifacts), 'Comfort artifact window lacks artefacts');
    if (window.suppressed !== null) {
      const span = plainFields(window.suppressed, spanFields, 'comfort suppressed span');
      for (const key of spanFields) requireRequired(span, key, 'comfort suppressed span');
      const fromTick = tick(span.fromTick);
      const toTick = tick(span.toTick);
      requireContract(toTick >= fromTick, 'Comfort suppressed span is inverted');
    }
    return entry as FilteredWindowRecord;
  });
  return Object.freeze({
    rideId: text(data.rideId),
    vehicleId: text(data.vehicleId),
    rideState: rideState as RideState,
    segments: Object.freeze(segments),
    startTick,
    endTick,
    samples: Object.freeze(samples),
    artifactWindows: Object.freeze(artifactWindows),
  });
}

function artifactCounts(window: FilteredWindowRecord, counts: ExcludedArtifactCounts): void {
  for (const artifact of window.artifacts) {
    if (artifact.kind === 'TELEPORT') counts.teleports += 1;
    else if (artifact.kind === 'COLLISION') counts.collisions += 1;
    else if (artifact.kind === 'PAUSE') counts.pauses += 1;
  }
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function emptyMetrics(): ComfortMetrics {
  return Object.freeze({
    peakAccelerationMps2: 0,
    meanAccelerationAbsMps2: 0,
    peakJerkMps3: 0,
    accelerationSamples: 0,
    jerkSamples: 0,
    accelerationViolations: 0,
    jerkViolations: 0,
  });
}

export function evaluateComfortRide(
  rideInput: unknown,
  objectiveInput: unknown = COMFORT_OBJECTIVE,
): ComfortResult {
  const objective = parseComfortObjective(objectiveInput);
  const ride = readRide(rideInput);
  const windowTicks = ride.endTick - ride.startTick;
  const evaluatedEndTick = Math.min(
    ride.endTick,
    ride.startTick + objective.evaluation.windowTicks,
  );
  const passengerAboard = comfortPassengerAboard(ride.rideState);

  const spans: SuppressedSpan[] = [];
  const counts: ExcludedArtifactCounts = { teleports: 0, collisions: 0, pauses: 0 };
  for (const window of ride.artifactWindows) {
    artifactCounts(window, counts);
    if (window.suppressed !== null)
      spans.push(
        Object.freeze({ fromTick: window.suppressed.fromTick, toTick: window.suppressed.toTick }),
      );
  }
  requireContract(spans.length <= COMFORT_LIMITS.spans, 'Comfort span capacity exceeded');

  const suppressed = (at: number): boolean =>
    spans.some((span) => at >= span.fromTick && at <= span.toTick);
  const crosses = (from: number, to: number): boolean =>
    spans.some((span) => span.fromTick <= to && span.toTick >= from);

  const insideWindow = ride.samples.filter(
    (sample) => sample.tick >= ride.startTick && sample.tick <= evaluatedEndTick,
  );
  for (const sample of insideWindow)
    requireContract(
      ride.segments.some(
        (segment) => sample.tick >= segment.startTick && sample.tick <= segment.endTick,
      ),
      'Comfort sample does not belong to a declared 069 segment',
    );
  const used = insideWindow.filter((sample) => !suppressed(sample.tick));
  const outsideWindow = ride.samples.length - insideWindow.length;
  const excludedSamples = insideWindow.length - used.length;
  const suppressedTicks = spans.reduce(
    (total, span) =>
      total +
      Math.max(
        0,
        Math.min(span.toTick, evaluatedEndTick) - Math.max(span.fromTick, ride.startTick) + 1,
      ),
    0,
  );

  const base = {
    version: COMFORT_SCHEMA_VERSION,
    objectiveId: objective.objectiveId,
    rideId: ride.rideId,
    vehicleId: ride.vehicleId,
    rideState: ride.rideState,
    passengerAboard,
    segments: ride.segments,
    thresholds: objective.thresholds,
    window: Object.freeze({
      startTick: ride.startTick,
      endTick: ride.endTick,
      evaluatedEndTick,
      ticks: windowTicks,
    }),
    samples: Object.freeze({
      received: ride.samples.length,
      insideWindow: insideWindow.length,
      used: used.length,
      excluded: excludedSamples,
      outsideWindow,
    }),
    exclusions: Object.freeze({
      windows: ride.artifactWindows.length,
      spans: spans.length,
      ticks: suppressedTicks,
      teleports: counts.teleports,
      collisions: counts.collisions,
      pauses: counts.pauses,
    }),
    styleFidelity: null,
    styleScoreUsed: false as const,
  };

  if (!passengerAboard)
    return Object.freeze({
      ...base,
      status: 'NO_PASSENGER' as const,
      reason: null,
      intervals: Object.freeze({ acceleration: 0, jerk: 0, excluded: 0 }),
      metrics: emptyMetrics(),
    });

  if (windowTicks > objective.evaluation.windowTicks)
    return Object.freeze({
      ...base,
      status: 'WINDOW_EXCEEDED' as const,
      reason: null,
      intervals: Object.freeze({ acceleration: 0, jerk: 0, excluded: 0 }),
      metrics: emptyMetrics(),
    });

  const accelerations: { readonly value: number; readonly durationS: number }[] = [];
  let excludedIntervals = 0;
  for (let index = 0; index + 1 < used.length; index += 1) {
    const from = used[index]!;
    const to = used[index + 1]!;
    if (crosses(from.tick, to.tick)) {
      excludedIntervals += 1;
      continue;
    }
    const durationS = (to.tick - from.tick) / COMFORT_TICK_HZ;
    accelerations.push(
      Object.freeze({ value: (to.speedMps - from.speedMps) / durationS, durationS }),
    );
  }

  const jerks: number[] = [];
  for (let index = 0; index + 1 < accelerations.length; index += 1) {
    const previous = accelerations[index]!;
    const next = accelerations[index + 1]!;
    jerks.push((next.value - previous.value) / next.durationS);
  }

  let peakAcceleration = 0;
  let sumAbsAcceleration = 0;
  let accelerationViolations = 0;
  for (const entry of accelerations) {
    const magnitude = Math.abs(entry.value);
    peakAcceleration = Math.max(peakAcceleration, magnitude);
    sumAbsAcceleration += magnitude;
    if (magnitude > objective.thresholds.maxAccelerationMps2 + COMFORT_LIMIT_EPSILON)
      accelerationViolations += 1;
  }
  let peakJerk = 0;
  let jerkViolations = 0;
  for (const value of jerks) {
    const magnitude = Math.abs(value);
    peakJerk = Math.max(peakJerk, magnitude);
    if (magnitude > objective.thresholds.maxJerkMps3 + COMFORT_LIMIT_EPSILON) jerkViolations += 1;
  }

  const metrics: ComfortMetrics = Object.freeze({
    peakAccelerationMps2: round(peakAcceleration),
    meanAccelerationAbsMps2: round(
      accelerations.length === 0 ? 0 : sumAbsAcceleration / accelerations.length,
    ),
    peakJerkMps3: round(peakJerk),
    accelerationSamples: accelerations.length,
    jerkSamples: jerks.length,
    accelerationViolations,
    jerkViolations,
  });

  const status: ComfortStatus =
    accelerations.length < objective.evaluation.minimumSamples
      ? 'INSUFFICIENT_DATA'
      : accelerationViolations > 0 && jerkViolations > 0
        ? 'FAILED'
        : accelerationViolations > 0
          ? 'FAILED'
          : jerkViolations > 0
            ? 'FAILED'
            : 'PASSED';
  const reason: ComfortFailureReason | null =
    status !== 'FAILED'
      ? null
      : accelerationViolations > 0 && jerkViolations > 0
        ? 'BOTH_LIMITS'
        : accelerationViolations > 0
          ? 'ACCELERATION_LIMIT'
          : 'JERK_LIMIT';

  return Object.freeze({
    ...base,
    status,
    reason,
    intervals: Object.freeze({
      acceleration: accelerations.length,
      jerk: jerks.length,
      excluded: excludedIntervals,
    }),
    metrics,
  });
}

/**
 * The comfort mission keeps the 116 lifecycle for the ride counter and adds the explicit comfort
 * objective as its completion gate: a dropoff alone completes nothing when comfort failed.
 */
export function comfortMissionDefinition(): MissionDefinition {
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    missionId: COMFORT_MISSION_ID,
    version: '1',
    title: 'Cursa cu obiectiv de confort',
    objectives: Object.freeze([
      Object.freeze({
        objectiveId: 'comfort-dropoffs',
        kind: 'DROPOFFS' as const,
        label: 'Finalizează o cursă cu obiectivul de confort îndeplinit',
        target: 1,
        difficultyTargets: Object.freeze({ NORMAL: 1 }),
        minDurationS: null,
        profileId: null,
      }),
    ]),
    rewards: Object.freeze([
      Object.freeze({ rewardId: 'xp', kind: 'XP' as const, amount: 100, unlockId: null }),
      Object.freeze({
        rewardId: 'unlock-analysis',
        kind: 'UNLOCK_ANALYSIS_TOOL' as const,
        amount: 0,
        unlockId: 'analysis:comfort-review',
      }),
    ]),
    replay: Object.freeze({
      profileSource: 'CURRENT' as const,
      snapshotId: null,
      scenarioId: null,
      comparisonProfileIds: Object.freeze([]),
    }),
    windowTicks: null,
    incidentBudget: 1,
    prerequisites: Object.freeze([]),
  });
}

export function createComfortMissionCatalog(
  namespace: string = 'campaign:121-comfort',
): MissionCatalog {
  return parseMissionCatalog({
    schemaVersion: 1,
    units: 'SI',
    version: '116-mission-schema-v1',
    namespace,
    missions: [comfortMissionDefinition()],
  });
}

export interface ComfortMissionOutcome {
  readonly missionId: string;
  readonly objectiveId: string;
  readonly status: 'COMPLETED' | 'FAILED';
  readonly reason: ComfortFailureReason | 'NOT_PASSED' | null;
  readonly comfortStatus: ComfortStatus;
  /** Reported separately; never derived from the comfort metric. */
  readonly styleFidelity: null;
}

/** The only accepted completion path: the 116 mission ids must match and comfort must pass. */
export function comfortMissionOutcome(input: unknown): ComfortMissionOutcome {
  const data = plainFields(input, ['missionId', 'result'], 'comfort mission outcome');
  for (const key of ['missionId', 'result'] as const)
    requireRequired(data, key, 'comfort mission outcome');
  requireContract(data.missionId === COMFORT_MISSION_ID, 'Unknown comfort mission');
  const result = data.result as ComfortResult;
  requireContract(
    typeof result === 'object' &&
      result !== null &&
      result.version === COMFORT_SCHEMA_VERSION &&
      result.styleFidelity === null &&
      result.styleScoreUsed === false,
    'Comfort mission requires a comfort result',
  );
  requireContract(
    (comfortStatuses as readonly string[]).includes(result.status),
    'Unknown comfort status',
  );
  const passed = result.status === 'PASSED';
  return Object.freeze({
    missionId: COMFORT_MISSION_ID,
    objectiveId: result.objectiveId,
    status: passed ? ('COMPLETED' as const) : ('FAILED' as const),
    reason: passed ? null : (result.reason ?? 'NOT_PASSED'),
    comfortStatus: result.status,
    styleFidelity: null,
  });
}

/** Sorted objective ids of the comfort catalog; used by evidence and UI wiring. */
export function comfortMissionIds(): readonly string[] {
  return Object.freeze(
    createComfortMissionCatalog()
      .missions.map((mission) => mission.missionId)
      .sort(),
  );
}
