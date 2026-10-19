import {
  choice,
  createStableId,
  fields,
  list,
  number,
  record,
  requireContract,
  text,
  tick as readTick,
} from '../sessions';
import { VEHICLE_CLASS_VERSION } from '../vehicles';
import type { VehicleClassId } from '../vehicles';
import { mechanicalCapabilities } from './tick-samples';
import type { TickSampleCapabilities } from './tick-samples';
import { artifactWindowClasses, windowCompletenessStates } from './artifact-filter';
import type {
  CompletenessReason,
  FilteredWindowRecord,
  WindowCompleteness,
} from './artifact-filter';
import { eligibilityWindowClasses } from './eligibility-windows';
import type { EligibilityWindowClass, EligibilityWindowRecord } from './eligibility-windows';
import type { OpportunityKind } from './opportunities';

/**
 * 089 class normalization: the layer that turns a realized acceleration/braking/cornering demand
 * inside an ELIGIBLE, artefact-filtered window into class-independent features, so that a later
 * estimator can read a **style** instead of a **capability**.
 *
 * It owns no clock, physics world, renderer, DOM, scheduler, event bus or storage and never
 * publishes. It consumes the already authoritative facts of its owners and never re-derives them:
 *   - 023 `vehicleClass` / 085 `mechanicalCapabilities` - the class ceilings used as the
 *     normalization denominators (acceleration, braking and lateral);
 *   - 087 `createEligibilityWindows` - the window's class/label. Only an ELIGIBLE window is
 *     normalized; an EXTERNAL_CONSTRAINT or EXCLUDED window is refused with the 087 class as the
 *     reason. 089 never re-labels and never duplicates the 087 vocabulary;
 *   - 088 `createArtifactFilter` - the usable prefix and the `COMPLETE`/`PARTIAL`/`TRUNCATED`
 *     degree. 089 features attach to the usable prefix only and carry the 088 degree; a
 *     `FULLY_SUPPRESSED` or `TRUNCATED` window is refused and never normalized as if complete;
 *   - 047/049 and the recorder - the realized per-tick SI demands and the executed command
 *     (`throttle`/`brake`/`steering`). 089 computes no physics and invents no measurement.
 *
 * Criterion 1 is enforced by construction: every demand is divided by the **own** class ceiling, so
 * the same command and the same style yield the same normalized value in a sedan and in a compact
 * even though the raw values differ by the mechanical difference of the classes. A class with a
 * lower ceiling is therefore never read as prudent: its saturating style still normalizes to the
 * same demand fraction.
 *
 * Criterion 2 is enforced by construction: the record is a discriminated union. A
 * `CapabilityLimitedVehicleNormalization` is a different TypeScript type from an
 * `IntentionalVehicleNormalization` and carries a non-empty `capabilityMarks` list plus the
 * `limitingChannel`; `emitIntentFeature` accepts **only** the intentional record and re-checks at
 * runtime, so a saturated window can never be consumed as a deliberate style. A saturating realized
 * demand is itself a proof that the requested demand was at least the ceiling, so the normalized
 * value is reported as an explicit **lower bound** rather than as a choice.
 */

export const NORMALIZATION_VERSION = '089-vehicle-normalization-v1' as const;

/** Fixed simulation rate, used only to express a tick span in seconds; no wall clock is read. */
export const NORMALIZATION_TICK_HZ = 60;

/** Amortization period of one 219 decision (every six 60 Hz ticks); documents the probe only. */
export const NORMALIZATION_DECISION_PERIOD_TICKS = 6;

/** The robust order statistic used for every window demand: the 90th percentile. */
export const NORMALIZATION_DEMAND_PERCENTILE = 0.9;

/** A sample counts toward a capability mark when its demand fraction is at least this. */
export const NORMALIZATION_SATURATION_FRACTION = 0.95;

/** A capability mark is raised only for a **sustained** saturation, never for one transient tick. */
export const NORMALIZATION_MIN_SATURATED_TICKS = 3;

/** Fewer usable samples than this cannot describe a style. */
export const NORMALIZATION_MIN_SAMPLES = 3;

/**
 * Documented tolerance for "the same style normalizes to the same value". It is a difference of two
 * dimensionless demand fractions, not of two accelerations, so the class capability difference has
 * already been divided out.
 */
export const NORMALIZATION_EQUALITY_TOLERANCE = 0.05;

/** The closed channel vocabulary of a capability mark; the ceiling of the named channel is binding. */
export const capabilityLimitChannels = [
  'LONGITUDINAL_ACCELERATION',
  'LONGITUDINAL_DECELERATION',
  'LATERAL',
] as const;
export type CapabilityLimitChannel = (typeof capabilityLimitChannels)[number];

export const capabilityMarkReasons = ['CAPABILITY_LIMITED'] as const;
export type CapabilityMarkReason = (typeof capabilityMarkReasons)[number];

/**
 * The closed refusal vocabulary. A refused window gets **no** features at all, so a window that
 * cannot be normalized never silently reads as a mild or deliberate style.
 */
export const normalizationRefusals = [
  'NOT_ELIGIBLE_WINDOW',
  'WINDOW_FULLY_SUPPRESSED',
  'WINDOW_TRUNCATED',
  'NO_USABLE_SAMPLES',
  'INSUFFICIENT_SAMPLES',
] as const;
export type NormalizationRefusal = (typeof normalizationRefusals)[number];

export const normalizationDemandStatuses = ['INTENTIONAL', 'CAPABILITY_LIMITED'] as const;
export type NormalizationDemandStatus = (typeof normalizationDemandStatuses)[number];

/** Realized per-tick SI demand plus the command that produced it. */
export interface VehicleNormalizationSample {
  readonly tick: number;
  /** Signed realized longitudinal acceleration, m/s². */
  readonly longitudinalAccelerationMps2: number;
  /** Realized lateral acceleration magnitude, m/s². */
  readonly lateralAccelerationMps2: number;
  /** Executed command; the class-independent intent. */
  readonly throttle: number;
  readonly brake: number;
  readonly steering: number;
}

export interface NormalizationObservation {
  /** Evaluation tick; monotone across calls, exactly like the 087/088 layers. */
  readonly tick: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  /** Real 023 class of the vehicle; the only source of the normalization ceilings. */
  readonly classId: VehicleClassId;
  /** The 087 record this window belongs to; its class is consumed, never re-derived. */
  readonly eligibility: EligibilityWindowRecord;
  /** The 088 window that owns the usable span; its degree is consumed, never re-derived. */
  readonly artifacts: FilteredWindowRecord;
  /** Realized samples; only those inside the usable span take part in the features. */
  readonly samples: readonly VehicleNormalizationSample[];
}

/** One explicit, closed capability mark with the limiting channel and the evidence. */
export interface CapabilityLimitMark {
  readonly reason: CapabilityMarkReason;
  readonly channel: CapabilityLimitChannel;
  /** The 023/085 class ceiling of the channel, m/s². */
  readonly limitMps2: number;
  /** Peak realized demand fraction observed on the channel (dimensionless, ≥ saturationFraction). */
  readonly peakFraction: number;
  readonly saturatedTicks: number;
  readonly sampledTicks: number;
  readonly saturationFraction: number;
}

/** The class-independent features of one window. All fractions are dimensionless demand ratios. */
export interface NormalizedVehicleFeatures {
  /** p90 of max(0, a_long)/maxAcceleration; 0 when the window never accelerates. */
  readonly accelerationDemand: number;
  /** p90 of max(0, -a_long)/maxDeceleration; 0 when the window never brakes. */
  readonly decelerationDemand: number;
  /** p90 of |a_lat|/maxLateralAcceleration; 0 when the window never corners. */
  readonly lateralDemand: number;
  /** max of the three demands: the single style scalar, comparable across classes. */
  readonly aggressiveness: number;
  /** True when at least one ceiling saturated, so `aggressiveness` is a floor on the intent. */
  readonly aggressivenessIsLowerBound: boolean;
  /** The order statistic used above (documented, not a magic scale). */
  readonly demandPercentile: number;
  /** The raw realized p90 values, in SI, kept for transparency and cross-class comparison. */
  readonly raw: {
    readonly longitudinalAccelerationMps2: number;
    readonly longitudinalDecelerationMps2: number;
    readonly lateralAccelerationMps2: number;
  };
  /** The class-independent command intent: p90 of the executed throttle/brake/|steering|. */
  readonly intent: {
    readonly throttle: number;
    readonly brake: number;
    readonly steering: number;
  };
}

interface NormalizationWindowBase {
  readonly version: typeof NORMALIZATION_VERSION;
  readonly featureId: string;
  /** The 087 window identity this feature attaches to. */
  readonly windowId: string;
  readonly opportunityId: string;
  readonly kind: OpportunityKind;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly classId: VehicleClassId;
  readonly classVersion: typeof VEHICLE_CLASS_VERSION;
  /** The 023/085 figures used as the denominators. */
  readonly capability: TickSampleCapabilities;
  /** Consumed from 088; `TRUNCATED`/`FULLY_SUPPRESSED` never reach here. */
  readonly completeness: WindowCompleteness;
  readonly completenessReason: CompletenessReason;
  /** The 087 class; always `ELIGIBLE` on a normalized record. */
  readonly eligibilityClass: EligibilityWindowClass;
  /** The intersection of the 087 span and the 088 usable prefix. */
  readonly usableFromTick: number;
  readonly usableToTick: number;
  readonly usableTicks: number;
  readonly sampledTicks: number;
  /** sampledTicks / usableTicks in (0, 1]; 1 means the prefix was fully observed. */
  readonly sampleCoverage: number;
  readonly saturationFraction: number;
  readonly minSaturatedTicks: number;
  /** Cadence-visible. */
  readonly openedTick: number;
  readonly lastTick: number;
  /** Cadence-visible: how many evaluations touched this window. Never used for identity. */
  readonly observationCount: number;
}

/** A window whose demand stayed below every ceiling: the feature measures a choice. */
export interface IntentionalVehicleNormalization extends NormalizationWindowBase {
  readonly windowClass: 'NORMALIZED';
  readonly demandStatus: 'INTENTIONAL';
  readonly features: NormalizedVehicleFeatures;
  readonly capabilityMarks: readonly [];
}

/** A window whose demand saturated at least one ceiling: the feature is a lower bound on intent. */
export interface CapabilityLimitedVehicleNormalization extends NormalizationWindowBase {
  readonly windowClass: 'NORMALIZED';
  readonly demandStatus: 'CAPABILITY_LIMITED';
  readonly features: NormalizedVehicleFeatures;
  /** Non-empty by construction. */
  readonly capabilityMarks: readonly CapabilityLimitMark[];
  /** The channel that saturated first, in the documented `capabilityLimitChannels` order. */
  readonly limitingChannel: CapabilityLimitChannel;
}

export type NormalizedVehicleWindow =
  IntentionalVehicleNormalization | CapabilityLimitedVehicleNormalization;

/** A window that cannot be normalized; it carries no features at all. */
export interface RefusedVehicleNormalization {
  readonly version: typeof NORMALIZATION_VERSION;
  readonly windowClass: 'REFUSED';
  readonly featureId: string;
  readonly windowId: string;
  readonly opportunityId: string;
  readonly kind: OpportunityKind;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly classId: VehicleClassId;
  readonly classVersion: typeof VEHICLE_CLASS_VERSION;
  readonly refusal: NormalizationRefusal;
  readonly completeness: WindowCompleteness | null;
  readonly completenessReason: CompletenessReason | null;
  readonly eligibilityClass: EligibilityWindowClass;
  readonly features: null;
  readonly capabilityMarks: readonly [];
  readonly usableFromTick: number | null;
  readonly usableToTick: number | null;
  readonly usableTicks: number;
  readonly sampledTicks: number;
  readonly openedTick: number;
  readonly lastTick: number;
  readonly observationCount: number;
}

export type VehicleNormalizationRecord = NormalizedVehicleWindow | RefusedVehicleNormalization;

export interface NormalizationRefusalDenominator {
  readonly refusal: NormalizationRefusal;
  readonly count: number;
}

export interface CapabilityChannelDenominator {
  readonly channel: CapabilityLimitChannel;
  readonly count: number;
}

export interface NormalizationDenominators {
  readonly version: typeof NORMALIZATION_VERSION;
  /** Every window ever evaluated; each one is normalized or refused, never both. */
  readonly total: number;
  readonly normalized: number;
  readonly intentional: number;
  readonly capabilityLimited: number;
  readonly refused: number;
  readonly byRefusal: readonly NormalizationRefusalDenominator[];
  /** How many normalized windows saturated each channel; a window may appear in more than one. */
  readonly byChannel: readonly CapabilityChannelDenominator[];
  readonly usableTicks: number;
  readonly sampledTicks: number;
  readonly intentEmitted: number;
  readonly intentRefused: number;
}

export interface NormalizationStats {
  readonly version: typeof NORMALIZATION_VERSION;
  readonly disposed: boolean;
  readonly maxWindows: number;
  /** Cumulative since construction; survives eviction and `dispose()`. */
  readonly windowsEvaluated: number;
  readonly observationCalls: number;
  readonly normalizedTotal: number;
  readonly intentionalTotal: number;
  readonly capabilityLimitedTotal: number;
  readonly refusedTotal: number;
  readonly downgradedTotal: number;
  readonly upgradedTotal: number;
  readonly rejectedTotal: number;
  readonly retiredTotal: number;
  readonly skippedTicks: number;
  readonly intentEmitted: number;
  readonly intentRefused: number;
  /** Live owned resources; every one returns to zero after `dispose()`. */
  readonly retained: number;
  readonly capabilityLimitedRetained: number;
  readonly identityCodeUnits: number;
  readonly estimatedBytes: number;
  readonly estimatedBytesMaximum: number;
}

export interface NormalizationOptions {
  readonly maxWindows?: number;
  readonly saturationFraction?: number;
  readonly minSaturatedTicks?: number;
  readonly minSamples?: number;
}

/** The estimator-facing pure-intent feature of an intentional window. */
export interface IntentFeatureRecord {
  readonly version: typeof NORMALIZATION_VERSION;
  readonly featureId: string;
  readonly windowId: string;
  readonly opportunityId: string;
  readonly kind: OpportunityKind;
  readonly classId: VehicleClassId;
  readonly windowClass: 'NORMALIZED';
  readonly demandStatus: 'INTENTIONAL';
  readonly completeness: WindowCompleteness;
  readonly completenessReason: CompletenessReason;
  readonly usableTicks: number;
  readonly sampledTicks: number;
  readonly demandPercentile: number;
  readonly aggressiveness: number;
  readonly accelerationDemand: number;
  readonly decelerationDemand: number;
  readonly lateralDemand: number;
}

export interface VehicleNormalizer {
  readonly version: typeof NORMALIZATION_VERSION;
  /** Normalizes (or explicitly refuses) one eligible, filtered window. */
  observe(input: NormalizationObservation): VehicleNormalizationRecord;
  /** The only path that turns an intentional window into an estimator feature; refuses the rest. */
  emitIntentFeature(entry: IntentionalVehicleNormalization): IntentFeatureRecord;
  getWindow(opportunityId: string): VehicleNormalizationRecord | null;
  getWindows(): readonly VehicleNormalizationRecord[];
  getDenominators(): NormalizationDenominators;
  getStats(): NormalizationStats;
  dispose(): void;
}

export const NORMALIZATION_CAPACITY = Object.freeze({
  minimum: 32,
  /** Mirrors 086/087/088 so the bounded owners share the manifest `diagnosticSamples` figure. */
  default: 4096,
  maximum: 7168,
});

/** Fixed dense slots: 10 feature numbers + up to 3 marks × 4 numbers + headroom. */
export const NORMALIZATION_DENSE_SLOTS = 32;
export const NORMALIZATION_BYTES_PER_RECORD = NORMALIZATION_DENSE_SLOTS * 8;
export const NORMALIZATION_IDENTITY_CODE_UNITS_CEILING = 1024;
export const NORMALIZATION_RECORD_BYTES_CEILING =
  NORMALIZATION_BYTES_PER_RECORD + NORMALIZATION_IDENTITY_CODE_UNITS_CEILING * 2;
/** `Docs/performance-budgets.json` `proposedCapacities.recorderRamBytes`. */
export const NORMALIZATION_RECORDER_RAM_BYTES = 33_554_432;

const sampleFields = [
  'tick',
  'longitudinalAccelerationMps2',
  'lateralAccelerationMps2',
  'throttle',
  'brake',
  'steering',
] as const;
const optionKeys = ['maxWindows', 'saturationFraction', 'minSaturatedTicks', 'minSamples'] as const;
const classIds = ['sedan', 'compact'] as const;
const opportunityKindValues = ['STOP', 'RED', 'GREEN', 'YIELD', 'LANE_CHANGE'] as const;
const completenessReasonValues = [
  'SEGMENT_CLOSED',
  'OPEN_SEGMENT',
  'TRUNCATED_BY_ARTIFACT',
  'OBSERVATION_GAP',
  'RECOVERY',
  'SHUTDOWN',
  'SEGMENT_INCOMPLETE',
  'DATA_LOSS',
  'CHECKPOINT_LOST',
] as const satisfies readonly CompletenessReason[];

const readEnum = <const T extends readonly string[]>(
  value: unknown,
  options: T,
  message: string,
): T[number] => {
  requireContract(typeof value === 'string' && options.includes(value as T[number]), message);
  return value as T[number];
};

const identity = (value: unknown, message: string, maximum = 256): string => {
  const result = text(value);
  requireContract(result.length <= maximum, message);
  return result;
};

const spanOf = (value: unknown, message: string): { fromTick: number; toTick: number } => {
  const data = record(value);
  const fromTick = readTick(data.fromTick);
  const toTick = readTick(data.toTick);
  requireContract(toTick >= fromTick, message);
  return Object.freeze({ fromTick, toTick });
};

interface EligibilityView {
  readonly windowClass: EligibilityWindowClass;
  readonly windowId: string;
  readonly opportunityId: string;
  readonly kind: OpportunityKind;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly openedTick: number;
  readonly lastTick: number;
}

/** Narrow, defensive view of the 087 record: only the fields 089 consumes, still validated. */
const readEligibility = (value: unknown): EligibilityView => {
  const data = record(value);
  return Object.freeze({
    windowClass: readEnum(
      data.windowClass,
      eligibilityWindowClasses,
      'Unknown normalization eligibility window class',
    ),
    windowId: identity(data.windowId, 'Normalization eligibility window identity'),
    opportunityId: identity(data.opportunityId, 'Normalization opportunity identity'),
    kind: readEnum(data.kind, opportunityKindValues, 'Unknown normalization opportunity kind'),
    segmentId: identity(data.segmentId, 'Normalization eligibility segment identity'),
    vehicleId: identity(data.vehicleId, 'Normalization eligibility vehicle identity'),
    incarnation: identity(data.incarnation, 'Normalization eligibility incarnation'),
    openedTick: readTick(data.openedTick),
    lastTick: readTick(data.lastTick),
  });
};

interface ArtifactsView {
  readonly windowClass: 'PREFIX_ELIGIBLE' | 'FULLY_SUPPRESSED';
  readonly completeness: WindowCompleteness;
  readonly completenessReason: CompletenessReason;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly prefix: { readonly fromTick: number; readonly toTick: number } | null;
}

/** Narrow, defensive view of the 088 record: only the fields 089 consumes, still validated. */
const readArtifacts = (value: unknown): ArtifactsView => {
  const data = record(value);
  const windowClass = readEnum(
    data.windowClass,
    artifactWindowClasses,
    'Unknown normalization artifact window class',
  );
  const prefix =
    data.prefix === null
      ? null
      : spanOf(data.prefix, 'Normalization artifact prefix is not a valid span');
  requireContract(
    (windowClass === 'PREFIX_ELIGIBLE') === (prefix !== null),
    'Normalization artifact window class and prefix disagree',
  );
  return Object.freeze({
    windowClass,
    completeness: readEnum(
      data.completeness,
      windowCompletenessStates,
      'Unknown normalization completeness degree',
    ),
    completenessReason: readEnum(
      data.completenessReason,
      completenessReasonValues,
      'Unknown normalization completeness reason',
    ),
    segmentId: identity(data.segmentId, 'Normalization artifact segment identity'),
    vehicleId: identity(data.vehicleId, 'Normalization artifact vehicle identity'),
    prefix,
  });
};

const readSample = (value: unknown): VehicleNormalizationSample => {
  const data = fields(value, sampleFields);
  return Object.freeze({
    tick: readTick(data.tick),
    longitudinalAccelerationMps2: number(data.longitudinalAccelerationMps2, -100, 100),
    lateralAccelerationMps2: number(data.lateralAccelerationMps2, -100, 100),
    throttle: number(data.throttle, 0, 1),
    brake: number(data.brake, 0, 1),
    steering: number(data.steering, -1, 1),
  });
};

/**
 * Deterministic nearest-rank order statistic `sorted[ceil(n·p) − 1]`, clamped; an empty input is 0.
 * Exported so a reader can reproduce the exact feature value instead of trusting a magic scale.
 */
export function normalizationPercentile(sortedValues: readonly number[], fraction: number): number {
  requireContract(
    Number.isFinite(fraction) && fraction > 0 && fraction <= 1,
    'Invalid normalization percentile fraction',
  );
  const size = sortedValues.length;
  if (size === 0) return 0;
  const index = Math.min(size - 1, Math.max(0, Math.ceil(size * fraction) - 1));
  return sortedValues[index]!;
}

interface ChannelEvidence {
  readonly channel: CapabilityLimitChannel;
  readonly limitMps2: number;
  readonly peakFraction: number;
  readonly saturatedTicks: number;
}

interface DemandEvidence {
  readonly accelerationDemand: number;
  readonly decelerationDemand: number;
  readonly lateralDemand: number;
  readonly raw: NormalizedVehicleFeatures['raw'];
  readonly intent: NormalizedVehicleFeatures['intent'];
  readonly channels: readonly ChannelEvidence[];
}

const ascending = (values: number[]): number[] => values.sort((left, right) => left - right);

/**
 * The documented normalization formula. For every usable sample:
 *   accelFraction = max(0, a_long) / maxAccelerationMps2
 *   decelFraction = max(0, −a_long) / maxDecelerationMps2
 *   latFraction   = |a_lat| / maxLateralAccelerationMps2
 * Each channel demand is the p90 of its fraction; a channel is marked `CAPABILITY_LIMITED` when at
 * least `minSaturatedTicks` samples reach `saturationFraction` of the class ceiling.
 */
function demandEvidence(
  samples: readonly VehicleNormalizationSample[],
  capability: TickSampleCapabilities,
  saturationFraction: number,
  minSaturatedTicks: number,
): DemandEvidence {
  const acceleration: number[] = [];
  const deceleration: number[] = [];
  const lateral: number[] = [];
  const rawAcceleration: number[] = [];
  const rawDeceleration: number[] = [];
  const rawLateral: number[] = [];
  const throttle: number[] = [];
  const brake: number[] = [];
  const steering: number[] = [];
  let saturatedAcceleration = 0;
  let saturatedDeceleration = 0;
  let saturatedLateral = 0;
  let peakAcceleration = 0;
  let peakDeceleration = 0;
  let peakLateral = 0;
  for (const sample of samples) {
    const value = sample.longitudinalAccelerationMps2;
    const accelerationFraction = Math.max(0, value) / capability.maxAccelerationMps2;
    const decelerationFraction = Math.max(0, -value) / capability.maxDecelerationMps2;
    const lateralFraction =
      Math.abs(sample.lateralAccelerationMps2) / capability.maxLateralAccelerationMps2;
    acceleration.push(accelerationFraction);
    deceleration.push(decelerationFraction);
    lateral.push(lateralFraction);
    rawAcceleration.push(Math.max(0, value));
    rawDeceleration.push(Math.max(0, -value));
    rawLateral.push(Math.abs(sample.lateralAccelerationMps2));
    throttle.push(sample.throttle);
    brake.push(sample.brake);
    steering.push(Math.abs(sample.steering));
    if (accelerationFraction >= saturationFraction) saturatedAcceleration += 1;
    if (decelerationFraction >= saturationFraction) saturatedDeceleration += 1;
    if (lateralFraction >= saturationFraction) saturatedLateral += 1;
    if (accelerationFraction > peakAcceleration) peakAcceleration = accelerationFraction;
    if (decelerationFraction > peakDeceleration) peakDeceleration = decelerationFraction;
    if (lateralFraction > peakLateral) peakLateral = lateralFraction;
  }
  const candidates: readonly ChannelEvidence[] = [
    {
      channel: 'LONGITUDINAL_ACCELERATION',
      limitMps2: capability.maxAccelerationMps2,
      peakFraction: peakAcceleration,
      saturatedTicks: saturatedAcceleration,
    },
    {
      channel: 'LONGITUDINAL_DECELERATION',
      limitMps2: capability.maxDecelerationMps2,
      peakFraction: peakDeceleration,
      saturatedTicks: saturatedDeceleration,
    },
    {
      channel: 'LATERAL',
      limitMps2: capability.maxLateralAccelerationMps2,
      peakFraction: peakLateral,
      saturatedTicks: saturatedLateral,
    },
  ];
  const fraction = NORMALIZATION_DEMAND_PERCENTILE;
  return {
    accelerationDemand: normalizationPercentile(ascending(acceleration), fraction),
    decelerationDemand: normalizationPercentile(ascending(deceleration), fraction),
    lateralDemand: normalizationPercentile(ascending(lateral), fraction),
    raw: Object.freeze({
      longitudinalAccelerationMps2: normalizationPercentile(ascending(rawAcceleration), fraction),
      longitudinalDecelerationMps2: normalizationPercentile(ascending(rawDeceleration), fraction),
      lateralAccelerationMps2: normalizationPercentile(ascending(rawLateral), fraction),
    }),
    intent: Object.freeze({
      throttle: normalizationPercentile(ascending(throttle), fraction),
      brake: normalizationPercentile(ascending(brake), fraction),
      steering: normalizationPercentile(ascending(steering), fraction),
    }),
    channels: Object.freeze(
      candidates.filter((candidate) => candidate.saturatedTicks >= minSaturatedTicks),
    ),
  };
}

export function createVehicleNormalizer(options: NormalizationOptions = {}): VehicleNormalizer {
  const config = record(options);
  for (const key of Object.keys(config))
    requireContract(
      optionKeys.includes(key as (typeof optionKeys)[number]),
      'Unknown vehicle normalization option',
    );
  const maxWindows =
    config.maxWindows === undefined ? NORMALIZATION_CAPACITY.default : readTick(config.maxWindows);
  requireContract(
    maxWindows >= NORMALIZATION_CAPACITY.minimum && maxWindows <= NORMALIZATION_CAPACITY.maximum,
    'Normalization store capacity out of range',
  );
  requireContract(
    maxWindows * NORMALIZATION_RECORD_BYTES_CEILING <= NORMALIZATION_RECORDER_RAM_BYTES,
    'Normalization store cannot fit the recorder RAM budget',
  );
  const saturationFraction =
    config.saturationFraction === undefined
      ? NORMALIZATION_SATURATION_FRACTION
      : number(config.saturationFraction, 0.5, 1);
  const minSaturatedTicks =
    config.minSaturatedTicks === undefined
      ? NORMALIZATION_MIN_SATURATED_TICKS
      : readTick(config.minSaturatedTicks);
  requireContract(minSaturatedTicks >= 1, 'Normalization saturation window out of range');
  const minSamples =
    config.minSamples === undefined ? NORMALIZATION_MIN_SAMPLES : readTick(config.minSamples);
  requireContract(minSamples >= 1, 'Normalization minimum sample count out of range');

  let disposed = false;
  let sessionId: string | null = null;
  let worldEpoch: number | null = null;
  let lastObservedTick: number | null = null;
  let windowsEvaluated = 0;
  let observationCalls = 0;
  let normalizedTotal = 0;
  let intentionalTotal = 0;
  let capabilityLimitedTotal = 0;
  let refusedTotal = 0;
  let downgradedTotal = 0;
  let upgradedTotal = 0;
  let rejectedTotal = 0;
  let retiredTotal = 0;
  let skippedTicks = 0;
  let intentEmitted = 0;
  let intentRefused = 0;
  let usableTicksTotal = 0;
  let sampledTicksTotal = 0;

  const refusalCounts = new Map<NormalizationRefusal, number>(
    normalizationRefusals.map((refusal) => [refusal, 0]),
  );
  const channelCounts = new Map<CapabilityLimitChannel, number>(
    capabilityLimitChannels.map((channel) => [channel, 0]),
  );
  const retained = new Map<string, VehicleNormalizationRecord>();
  const order: string[] = [];

  const alive = () => requireContract(!disposed, 'Vehicle normalization disposed');

  const identityCodeUnitsOf = (entry: VehicleNormalizationRecord): number =>
    entry.featureId.length +
    entry.windowId.length +
    entry.opportunityId.length +
    entry.segmentId.length +
    entry.vehicleId.length +
    entry.incarnation.length;

  function refusal(input: {
    readonly featureId: string;
    readonly windowId: string;
    readonly opportunityId: string;
    readonly kind: OpportunityKind;
    readonly segmentId: string;
    readonly vehicleId: string;
    readonly incarnation: string;
    readonly classId: VehicleClassId;
    readonly refusal: NormalizationRefusal;
    readonly eligibilityClass: EligibilityWindowClass;
    readonly completeness: WindowCompleteness | null;
    readonly completenessReason: CompletenessReason | null;
    readonly usable: { readonly fromTick: number; readonly toTick: number } | null;
    readonly sampledTicks: number;
    readonly openedTick: number;
    readonly lastTick: number;
    readonly observationCount: number;
  }): RefusedVehicleNormalization {
    refusalCounts.set(input.refusal, (refusalCounts.get(input.refusal) ?? 0) + 1);
    refusedTotal += 1;
    const usableTicks =
      input.usable === null ? 0 : Math.max(0, input.usable.toTick - input.usable.fromTick + 1);
    return Object.freeze({
      version: NORMALIZATION_VERSION,
      windowClass: 'REFUSED',
      featureId: input.featureId,
      windowId: input.windowId,
      opportunityId: input.opportunityId,
      kind: input.kind,
      segmentId: input.segmentId,
      vehicleId: input.vehicleId,
      incarnation: input.incarnation,
      classId: input.classId,
      classVersion: VEHICLE_CLASS_VERSION,
      refusal: input.refusal,
      completeness: input.completeness,
      completenessReason: input.completenessReason,
      eligibilityClass: input.eligibilityClass,
      features: null,
      capabilityMarks: Object.freeze([]) as readonly [],
      usableFromTick: input.usable?.fromTick ?? null,
      usableToTick: input.usable?.toTick ?? null,
      usableTicks,
      sampledTicks: input.sampledTicks,
      openedTick: input.openedTick,
      lastTick: input.lastTick,
      observationCount: input.observationCount,
    });
  }

  const store = (entry: VehicleNormalizationRecord): void => {
    const previous = retained.get(entry.opportunityId);
    if (previous === undefined) {
      windowsEvaluated += 1;
      order.push(entry.opportunityId);
      while (order.length > maxWindows) {
        const oldest = order.shift();
        if (oldest === undefined) break;
        retained.delete(oldest);
        retiredTotal += 1;
      }
    } else if (previous.windowClass === 'NORMALIZED' && entry.windowClass === 'REFUSED') {
      downgradedTotal += 1;
    } else if (previous.windowClass === 'REFUSED' && entry.windowClass === 'NORMALIZED') {
      upgradedTotal += 1;
    }
    retained.set(entry.opportunityId, entry);
  };

  const evaluate = (value: NormalizationObservation): VehicleNormalizationRecord => {
    const data = record(value);
    const tick = readTick(data.tick);
    const observationSession = identity(data.sessionId, 'Normalization session identity');
    const observationEpoch = readTick(data.worldEpoch);
    if (sessionId === null && worldEpoch === null) {
      sessionId = observationSession;
      worldEpoch = observationEpoch;
    }
    requireContract(
      observationSession === sessionId && observationEpoch === worldEpoch,
      'Normalization observation belongs to another session or world epoch',
    );
    if (lastObservedTick !== null) {
      requireContract(tick >= lastObservedTick, 'Normalization observation tick regressed');
      skippedTicks += tick - lastObservedTick - 1;
    }
    lastObservedTick = tick;
    observationCalls += 1;

    const segmentId = identity(data.segmentId, 'Normalization segment identity');
    const vehicleId = identity(data.vehicleId, 'Normalization vehicle identity');
    const incarnation = identity(data.incarnation, 'Normalization incarnation');
    const classId = choice(data.classId, classIds);
    const eligibility = readEligibility(data.eligibility);
    const artifacts = readArtifacts(data.artifacts);
    const rawSamples = list(data.samples, readSample);
    // The 087 window and the 088 window must describe the same subject; a mismatch is a contract
    // violation of the caller, never a silent cross-window mix.
    requireContract(
      eligibility.segmentId === segmentId &&
        artifacts.segmentId === segmentId &&
        eligibility.vehicleId === vehicleId &&
        artifacts.vehicleId === vehicleId &&
        eligibility.incarnation === incarnation,
      'Normalization input crosses window identities',
    );
    requireContract(
      eligibility.openedTick <= tick && eligibility.lastTick <= tick,
      'Normalization window ends after the evaluation tick',
    );
    for (let index = 1; index < rawSamples.length; index += 1)
      requireContract(
        rawSamples[index]!.tick > rawSamples[index - 1]!.tick,
        'Normalization samples must increase monotonically',
      );

    const capability = mechanicalCapabilities(classId);
    const featureId = createStableId('vehicle-normalization-feature', observationSession, [
      String(observationEpoch),
      eligibility.opportunityId,
    ]);
    const base = {
      featureId,
      windowId: eligibility.windowId,
      opportunityId: eligibility.opportunityId,
      kind: eligibility.kind,
      segmentId,
      vehicleId,
      incarnation,
      classId,
      eligibilityClass: eligibility.windowClass,
      openedTick: eligibility.openedTick,
      lastTick: eligibility.lastTick,
      observationCount: (retained.get(eligibility.opportunityId)?.observationCount ?? 0) + 1,
    };

    if (eligibility.windowClass !== 'ELIGIBLE') {
      const entry = refusal({
        ...base,
        refusal: 'NOT_ELIGIBLE_WINDOW',
        completeness: artifacts.completeness,
        completenessReason: artifacts.completenessReason,
        usable: null,
        sampledTicks: 0,
      });
      store(entry);
      return entry;
    }

    const usable =
      artifacts.prefix === null
        ? null
        : Object.freeze({
            fromTick: Math.max(artifacts.prefix.fromTick, eligibility.openedTick),
            toTick: Math.min(artifacts.prefix.toTick, eligibility.lastTick),
          });
    const usableTicks = usable === null ? 0 : Math.max(0, usable.toTick - usable.fromTick + 1);
    const samples =
      usable === null || usableTicks === 0
        ? []
        : rawSamples.filter(
            (sample) => sample.tick >= usable.fromTick && sample.tick <= usable.toTick,
          );

    if (artifacts.windowClass === 'FULLY_SUPPRESSED') {
      const entry = refusal({
        ...base,
        refusal: 'WINDOW_FULLY_SUPPRESSED',
        completeness: artifacts.completeness,
        completenessReason: artifacts.completenessReason,
        usable: null,
        sampledTicks: samples.length,
      });
      store(entry);
      return entry;
    }
    if (usable === null || usableTicks === 0) {
      const entry = refusal({
        ...base,
        refusal: 'NO_USABLE_SAMPLES',
        completeness: artifacts.completeness,
        completenessReason: artifacts.completenessReason,
        usable,
        sampledTicks: samples.length,
      });
      store(entry);
      return entry;
    }
    if (artifacts.completeness === 'TRUNCATED') {
      const entry = refusal({
        ...base,
        refusal: 'WINDOW_TRUNCATED',
        completeness: artifacts.completeness,
        completenessReason: artifacts.completenessReason,
        usable,
        sampledTicks: samples.length,
      });
      store(entry);
      return entry;
    }
    if (samples.length === 0) {
      const entry = refusal({
        ...base,
        refusal: 'NO_USABLE_SAMPLES',
        completeness: artifacts.completeness,
        completenessReason: artifacts.completenessReason,
        usable,
        sampledTicks: 0,
      });
      store(entry);
      return entry;
    }
    if (samples.length < minSamples) {
      const entry = refusal({
        ...base,
        refusal: 'INSUFFICIENT_SAMPLES',
        completeness: artifacts.completeness,
        completenessReason: artifacts.completenessReason,
        usable,
        sampledTicks: samples.length,
      });
      store(entry);
      return entry;
    }

    const evidence = demandEvidence(samples, capability, saturationFraction, minSaturatedTicks);
    const features: NormalizedVehicleFeatures = Object.freeze({
      accelerationDemand: evidence.accelerationDemand,
      decelerationDemand: evidence.decelerationDemand,
      lateralDemand: evidence.lateralDemand,
      aggressiveness: Math.max(
        evidence.accelerationDemand,
        evidence.decelerationDemand,
        evidence.lateralDemand,
      ),
      aggressivenessIsLowerBound: evidence.channels.length > 0,
      demandPercentile: NORMALIZATION_DEMAND_PERCENTILE,
      raw: evidence.raw,
      intent: evidence.intent,
    });
    const windowBase = {
      ...base,
      version: NORMALIZATION_VERSION,
      classVersion: VEHICLE_CLASS_VERSION,
      capability,
      completeness: artifacts.completeness,
      completenessReason: artifacts.completenessReason,
      usableFromTick: usable.fromTick,
      usableToTick: usable.toTick,
      usableTicks,
      sampledTicks: samples.length,
      sampleCoverage: samples.length / usableTicks,
      saturationFraction,
      minSaturatedTicks,
      features,
    };
    usableTicksTotal += usableTicks;
    sampledTicksTotal += samples.length;
    normalizedTotal += 1;
    if (evidence.channels.length === 0) {
      intentionalTotal += 1;
      const entry: IntentionalVehicleNormalization = Object.freeze({
        ...windowBase,
        windowClass: 'NORMALIZED',
        demandStatus: 'INTENTIONAL',
        capabilityMarks: Object.freeze([]) as readonly [],
      });
      store(entry);
      return entry;
    }
    capabilityLimitedTotal += 1;
    for (const channel of evidence.channels)
      channelCounts.set(channel.channel, (channelCounts.get(channel.channel) ?? 0) + 1);
    const entry: CapabilityLimitedVehicleNormalization = Object.freeze({
      ...windowBase,
      windowClass: 'NORMALIZED',
      demandStatus: 'CAPABILITY_LIMITED',
      capabilityMarks: Object.freeze(
        evidence.channels.map((channel) =>
          Object.freeze({
            reason: 'CAPABILITY_LIMITED' as const,
            channel: channel.channel,
            limitMps2: channel.limitMps2,
            peakFraction: channel.peakFraction,
            saturatedTicks: channel.saturatedTicks,
            sampledTicks: samples.length,
            saturationFraction,
          }),
        ),
      ),
      limitingChannel: evidence.channels[0]!.channel,
    });
    store(entry);
    return entry;
  };

  return Object.freeze({
    version: NORMALIZATION_VERSION,
    observe(value: NormalizationObservation): VehicleNormalizationRecord {
      alive();
      // A malformed or contradictory input is refused with an explicit cumulative counter, before
      // any window state is touched, exactly like the 087/088 store.
      try {
        return evaluate(value);
      } catch (error: unknown) {
        rejectedTotal += 1;
        throw error;
      }
    },
    emitIntentFeature(entry: IntentionalVehicleNormalization): IntentFeatureRecord {
      alive();
      const owned = retained.get(entry.opportunityId);
      // The runtime gate: the window must still be owned by this layer and still be an intentional
      // normalized window. A capability-limited window or a forged object is refused and counted.
      const valid =
        owned !== undefined &&
        owned.windowClass === 'NORMALIZED' &&
        owned.featureId === entry.featureId &&
        owned.demandStatus === 'INTENTIONAL' &&
        entry.windowClass === 'NORMALIZED' &&
        entry.demandStatus === 'INTENTIONAL';
      if (!valid) {
        intentRefused += 1;
        throw new Error(
          'Only an intentional, non-saturated normalized window can become an intent feature',
        );
      }
      intentEmitted += 1;
      return Object.freeze({
        version: NORMALIZATION_VERSION,
        featureId: entry.featureId,
        windowId: entry.windowId,
        opportunityId: entry.opportunityId,
        kind: entry.kind,
        classId: entry.classId,
        windowClass: 'NORMALIZED',
        demandStatus: 'INTENTIONAL',
        completeness: entry.completeness,
        completenessReason: entry.completenessReason,
        usableTicks: entry.usableTicks,
        sampledTicks: entry.sampledTicks,
        demandPercentile: entry.features.demandPercentile,
        aggressiveness: entry.features.aggressiveness,
        accelerationDemand: entry.features.accelerationDemand,
        decelerationDemand: entry.features.decelerationDemand,
        lateralDemand: entry.features.lateralDemand,
      });
    },
    getWindow(opportunityId: string) {
      return retained.get(identity(opportunityId, 'Normalization opportunity identity')) ?? null;
    },
    getWindows: () => Object.freeze([...retained.values()]),
    getDenominators(): NormalizationDenominators {
      return Object.freeze({
        version: NORMALIZATION_VERSION,
        total: windowsEvaluated,
        normalized: normalizedTotal,
        intentional: intentionalTotal,
        capabilityLimited: capabilityLimitedTotal,
        refused: refusedTotal,
        byRefusal: Object.freeze(
          normalizationRefusals.map((refusal) =>
            Object.freeze({ refusal, count: refusalCounts.get(refusal) ?? 0 }),
          ),
        ),
        byChannel: Object.freeze(
          capabilityLimitChannels.map((channel) =>
            Object.freeze({ channel, count: channelCounts.get(channel) ?? 0 }),
          ),
        ),
        usableTicks: usableTicksTotal,
        sampledTicks: sampledTicksTotal,
        intentEmitted,
        intentRefused,
      });
    },
    getStats(): NormalizationStats {
      let identityCodeUnits = 0;
      let capabilityLimitedRetained = 0;
      for (const entry of retained.values()) {
        identityCodeUnits += identityCodeUnitsOf(entry);
        if (entry.windowClass === 'NORMALIZED' && entry.demandStatus === 'CAPABILITY_LIMITED')
          capabilityLimitedRetained += 1;
      }
      return Object.freeze({
        version: NORMALIZATION_VERSION,
        disposed,
        maxWindows,
        windowsEvaluated,
        observationCalls,
        normalizedTotal,
        intentionalTotal,
        capabilityLimitedTotal,
        refusedTotal,
        downgradedTotal,
        upgradedTotal,
        rejectedTotal,
        retiredTotal,
        skippedTicks,
        intentEmitted,
        intentRefused,
        retained: retained.size,
        capabilityLimitedRetained,
        identityCodeUnits,
        estimatedBytes: retained.size * NORMALIZATION_BYTES_PER_RECORD + identityCodeUnits * 2,
        estimatedBytesMaximum: maxWindows * NORMALIZATION_RECORD_BYTES_CEILING,
      });
    },
    dispose() {
      if (disposed) return;
      order.length = 0;
      retained.clear();
      disposed = true;
    },
  });
}
