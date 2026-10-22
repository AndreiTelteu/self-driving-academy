import { fleetClassCompatible, fleetDriverKinds } from '../fleet';
import type { FleetDriverKind } from '../fleet';
import {
  blendProfileValue,
  createParameterEvidenceLedger,
  estimateAccelerationParameters,
  estimateSpeedParameters,
  learningSegmentModes,
  parseLearningJob,
} from '../learning';
import type {
  AccelerationEstimatorKey,
  AccelerationEstimatorObservation,
  ConfidenceCandidate,
  LearningSegmentMode,
  ParameterEvidenceReadModel,
  ProfileBlendEpisode,
  SpeedEstimatorKey,
  SpeedEstimatorObservation,
} from '../learning';
import { getParameterDefinition } from '../profiles';
import type { ParameterKey } from '../profiles';
import { deriveScenarioSeed, randomUnit } from '../sessions';
import {
  ELIGIBILITY_VERSION,
  NORMALIZATION_VERSION,
  OPPORTUNITY_VERSION,
  createVehicleNormalizer,
  mechanicalCapabilities,
} from '../telemetry';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  IntentionalVehicleNormalization,
  NormalizedVehicleFeatures,
  OpportunityKind,
  OpportunityRecord,
  PreferenceEvidenceRecord,
  VehicleNormalizationSample,
} from '../telemetry';
import { VEHICLE_CLASS_VERSION } from '../vehicles';
import type { VehicleClassId } from '../vehicles';
import { INVERSE_LEARNING_VERSION, inverseTolerances, knownProfiles } from './inverse-learning';
import type { InverseProfileId } from './inverse-learning';

/**
 * 106 cross-class fidelity: a deterministic offline harness that demonstrates two known styles on
 * two genuinely different real 023 vehicle classes, normalizes the raw demand through the real 089
 * layer, recovers the style through the real 094/095 estimators, and proves that the shared profile
 * carries style rather than mechanical capability.
 *
 * It does not own a profile, a store, a publisher, a fleet or a worker. `MANUAL` and an ineligible
 * `LEARNING` segment never produce a candidate; an eligible `LEARNING` segment produces an
 * in-memory candidate only. Nothing is published and no 092 flag changes.
 */
export const CROSS_CLASS_FIDELITY_VERSION = '106-cross-class-fidelity-v1' as const;
export const CROSS_CLASS_FIDELITY_ROOT_SEED = 106_000 as const;
export const CROSS_CLASS_FIDELITY_TICK_HZ = 60 as const;
export const MECHANICAL_CAPABILITY_COPY_CODE = 'MECHANICAL_CAPABILITY_COPIED' as const;

/** Two real classes from the 023 catalog; no ceiling is redeclared in this module. */
export const crossClassIds: readonly VehicleClassId[] = Object.freeze(['sedan', 'compact']);

export const crossClassStyleIds = ['CAUTIOUS', 'ASSERTIVE'] as const;
export type CrossClassStyle = (typeof crossClassStyleIds)[number];

/** The two styles are the 105 known profiles restricted to class-normalizable keys. */
export const crossClassStyleSources: Readonly<Record<CrossClassStyle, InverseProfileId>> =
  Object.freeze({
    CAUTIOUS: 'PRUDENT',
    ASSERTIVE: 'IMPULSIVE',
  });

const knownProfileTargets = new Map<InverseProfileId, ReadonlyMap<ParameterKey, number>>();
for (const profile of knownProfiles)
  knownProfileTargets.set(
    profile.profileId,
    new Map(profile.targets.map((target) => [target.key, target.value])),
  );

export const crossClassScenarioIds = ['FREE_FLOW', 'LONGITUDINAL'] as const;
export type CrossClassScenarioId = (typeof crossClassScenarioIds)[number];

export const crossClassKeys: readonly ParameterKey[] = Object.freeze([
  'speed_delta_urban',
  'speed_delta_residential',
  'curve_lateral_accel',
  'intersection_approach_speed',
  'desired_acceleration',
  'comfort_deceleration',
  'acceleration_jerk',
  'brake_reaction_delay',
]);

export type CrossClassTrendDirection = 'ASCENDING' | 'DESCENDING';

/**
 * The documented style ordering. Every acceleration/speed-related key rises from cautious to
 * assertive; the brake reaction delay falls because a cautious driver reacts earlier (longer delay
 * after the stimulus onset is not desirable, so the known cautious profile uses a smaller delay).
 */
export const crossClassTrendKeys: readonly {
  readonly key: ParameterKey;
  readonly direction: CrossClassTrendDirection;
}[] = Object.freeze([
  Object.freeze({ key: 'speed_delta_urban', direction: 'ASCENDING' as const }),
  Object.freeze({ key: 'speed_delta_residential', direction: 'ASCENDING' as const }),
  Object.freeze({ key: 'curve_lateral_accel', direction: 'ASCENDING' as const }),
  Object.freeze({ key: 'intersection_approach_speed', direction: 'ASCENDING' as const }),
  Object.freeze({ key: 'desired_acceleration', direction: 'ASCENDING' as const }),
  Object.freeze({ key: 'comfort_deceleration', direction: 'ASCENDING' as const }),
  Object.freeze({ key: 'acceleration_jerk', direction: 'ASCENDING' as const }),
  Object.freeze({ key: 'brake_reaction_delay', direction: 'DESCENDING' as const }),
]);

export interface CrossClassTolerance {
  readonly key: ParameterKey;
  readonly absoluteTolerance: number;
  readonly relativeTolerance: number;
  readonly effective: number;
  /** `105` reuses the documented inverse-learning bound; `106` widens only the class-reconstructed key. */
  readonly source: '105-INVERSE-TOLERANCE' | '106-CLASS-RECONSTRUCTION';
  readonly justifiedBy: string;
}

const toleranceByKey = new Map(inverseTolerances.map((entry) => [entry.key, entry]));

function maxStyleTarget(key: ParameterKey): number {
  return Math.max(
    Math.abs(crossClassStyleTarget('CAUTIOUS', key)),
    Math.abs(crossClassStyleTarget('ASSERTIVE', key)),
  );
}

export const crossClassTolerances: readonly CrossClassTolerance[] = Object.freeze(
  crossClassKeys.map((key) => {
    const bound = maxStyleTarget(key);
    if (key === 'curve_lateral_accel')
      return Object.freeze({
        key,
        absoluteTolerance: 0.25,
        relativeTolerance: 0.2,
        effective: round(0.25 + 0.2 * bound, 6),
        source: '106-CLASS-RECONSTRUCTION' as const,
        justifiedBy:
          '094 reconstructs the lateral SI candidate with the observed 023 class ceiling, so equal normalized demand on sedan and compact yields candidates with the lateral ceiling ratio (compact/sedan = 1.1538). The 0.25 m/s² floor covers the demand spread and the 20% term covers that documented class reconstruction; it is not a statistical confidence interval.',
      });
    const entry = toleranceByKey.get(key);
    if (!entry) throw new Error(`106 has no 105 tolerance for ${key}`);
    return Object.freeze({
      key,
      absoluteTolerance: entry.absoluteTolerance,
      relativeTolerance: entry.relativeTolerance,
      effective: round(entry.absoluteTolerance + entry.relativeTolerance * bound, 6),
      source: '105-INVERSE-TOLERANCE' as const,
      justifiedBy: `Reuses the 105 per-key bound (absolute + relative × |target|). ${entry.justifiedBy}`,
    });
  }),
);

const toleranceOf = new Map(crossClassTolerances.map((entry) => [entry.key, entry]));

export const unrepresentableBehaviourIds = [
  'PASSENGER_MODIFIER',
  'HAZARD_AVOIDANCE',
  'OFF_ROAD',
  'EXTERNAL_COMMAND',
] as const;
export type UnrepresentableBehaviour = (typeof unrepresentableBehaviourIds)[number];

export interface UnrepresentableCase {
  readonly behaviour: UnrepresentableBehaviour;
  readonly result: 'UNREPRESENTABLE';
  readonly estimate: null;
  /** No parameter is fabricated for a behaviour the learning targets cannot represent. */
  readonly key: null;
  readonly value: null;
  readonly reason: string;
  readonly detail: string;
}

const unrepresentableDefinitions: Readonly<
  Record<UnrepresentableBehaviour, { readonly reason: string; readonly detail: string }>
> = Object.freeze({
  PASSENGER_MODIFIER: Object.freeze({
    reason: 'PASSENGER_CONTEXT_NOT_COMPARABLE',
    detail:
      'A passenger modifier needs comparable episodes with and without a passenger; this harness has no passenger context.',
  }),
  HAZARD_AVOIDANCE: Object.freeze({
    reason: 'EVASIVE_MANOEUVRE_OUTSIDE_LEARNING_TARGETS',
    detail:
      'An evasive swerve around a hazard is a reactive manoeuvre, not a free-traffic or leader preference; the 24 M targets do not describe it.',
  }),
  OFF_ROAD: Object.freeze({
    reason: 'SURFACE_EXCLUDED_BY_ELIGIBILITY',
    detail:
      'Off-road demand is excluded by the eligibility/artefact layers, so it cannot become a style observation.',
  }),
  EXTERNAL_COMMAND: Object.freeze({
    reason: 'SOURCE_NOT_A_DRIVER_CHOICE',
    detail:
      'An external command is not a driver choice, so it is not a learning source even when the raw demand is measurable.',
  }),
});

/** Mechanical capability from the real 023 definition; the module never redeclares a ceiling. */
export interface MechanicalCapabilitySnapshot {
  readonly classId: VehicleClassId;
  readonly classVersion: typeof VEHICLE_CLASS_VERSION;
  readonly maxAccelerationMps2: number;
  readonly maxDecelerationMps2: number;
  readonly maxLateralAccelerationMps2: number;
}

export function crossClassCapability(classId: VehicleClassId): MechanicalCapabilitySnapshot {
  const capability = mechanicalCapabilities(classId);
  return Object.freeze({
    classId,
    classVersion: VEHICLE_CLASS_VERSION,
    maxAccelerationMps2: capability.maxAccelerationMps2,
    maxDecelerationMps2: capability.maxDecelerationMps2,
    maxLateralAccelerationMps2: capability.maxLateralAccelerationMps2,
  });
}

export interface CrossClassDemandSnapshot {
  readonly accelerationDemand: number;
  readonly decelerationDemand: number;
  readonly lateralDemand: number;
  readonly aggressiveness: number;
  readonly raw: NormalizedVehicleFeatures['raw'];
}

export interface CrossClassRouteState {
  readonly routeId: string;
  readonly routeDigest: string;
  readonly observationDigest: string;
  readonly classId: VehicleClassId;
  readonly style: CrossClassStyle;
  readonly scenarioId: CrossClassScenarioId;
  readonly startTick: number;
  readonly endTick: number;
  readonly sampleCount: number;
  readonly postedLimitMps: number;
  readonly cruiseSpeedMps: number;
  readonly distanceM: number;
}

export interface CrossClassWindowSummary {
  readonly windowId: string;
  readonly opportunityId: string;
  readonly classId: VehicleClassId;
  readonly demandStatus: 'INTENTIONAL' | 'CAPABILITY_LIMITED';
  readonly features: NormalizedVehicleFeatures;
}

export interface CrossClassDemonstration {
  readonly version: typeof CROSS_CLASS_FIDELITY_VERSION;
  readonly style: CrossClassStyle;
  readonly classId: VehicleClassId;
  readonly scenarioId: CrossClassScenarioId;
  readonly seed: number;
  readonly capability: MechanicalCapabilitySnapshot;
  readonly evidence: readonly ParameterEvidenceReadModel[];
  readonly speed: readonly SpeedEstimatorObservation[];
  readonly acceleration: readonly AccelerationEstimatorObservation[];
  readonly windows: readonly CrossClassWindowSummary[];
  readonly route: CrossClassRouteState;
}

export interface CrossClassFidelityPorts {
  readonly speed: typeof estimateSpeedParameters;
  readonly acceleration: typeof estimateAccelerationParameters;
}

export const realCrossClassFidelityPorts: CrossClassFidelityPorts = Object.freeze({
  speed: estimateSpeedParameters,
  acceleration: estimateAccelerationParameters,
});

export interface CrossClassKeyRow {
  readonly key: ParameterKey;
  readonly target: number;
  readonly estimate: number | null;
  readonly status: string;
  readonly reason: string | null;
  readonly evidence: Readonly<{
    status: string;
    distinctEpisodes: number;
    sampleCount: number;
    quality: number;
  }>;
  readonly tolerance: Readonly<{
    absolute: number;
    relative: number;
    effective: number;
  }>;
}

export interface CrossClassMechanicalReport {
  readonly classId: VehicleClassId;
  readonly capability: MechanicalCapabilitySnapshot;
  readonly rawP50: Readonly<{
    accelerationMps2: number;
    decelerationMps2: number;
    lateralMps2: number;
  }>;
  readonly normalizedP50: Readonly<{
    acceleration: number;
    deceleration: number;
    lateral: number;
  }>;
  readonly episodeCount: number;
}

export interface CrossClassStyleRun {
  readonly classId: VehicleClassId;
  readonly style: CrossClassStyle;
  readonly capability: MechanicalCapabilitySnapshot;
  readonly demonstrationSeeds: Readonly<{
    freeFlow: number;
    longitudinal: number;
  }>;
  readonly mechanical: CrossClassMechanicalReport;
  readonly keys: readonly CrossClassKeyRow[];
  readonly route: CrossClassRouteState;
}

export interface CrossClassTrendRow {
  readonly key: ParameterKey;
  readonly direction: CrossClassTrendDirection;
  readonly targets: Readonly<{ cautious: number; assertive: number }>;
  readonly estimates: Readonly<{
    sedan: Readonly<{ cautious: number | null; assertive: number | null }>;
    compact: Readonly<{ cautious: number | null; assertive: number | null }>;
  }>;
  readonly classOrderPreserved: Readonly<{ sedan: boolean; compact: boolean }>;
  readonly orderPreserved: boolean;
  readonly tolerance: CrossClassTolerance;
  readonly agreement: number;
  readonly normalizedAgreement: boolean;
  readonly mechanical: Readonly<{
    sedan: Readonly<{ cautious: number; assertive: number }>;
    compact: Readonly<{ cautious: number; assertive: number }>;
    differs: boolean;
  }> | null;
}

export interface MechanicalCopyFinding {
  readonly key: ParameterKey;
  readonly value: number;
  readonly source: 'CLASS_CAPABILITY' | 'RAW_CLASS_MECHANICAL';
  readonly sourceClassId: VehicleClassId;
  readonly channel: 'LONGITUDINAL_ACCELERATION' | 'LONGITUDINAL_DECELERATION' | 'LATERAL';
}

export interface CrossClassProfileValue {
  readonly key: ParameterKey;
  readonly value: number;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly source: 'NORMALIZED_STYLE' | 'INJECTED_OVERRIDE';
}

export interface FleetProfileApplication {
  readonly driverKind: FleetDriverKind;
  readonly profileId: string;
  readonly classes: readonly VehicleClassId[];
  readonly parameters: Readonly<Record<string, number>>;
  /** The common profile never carries a class-specific mechanical override. */
  readonly classSpecificOverrides: readonly [];
}

export interface CrossClassCommonProfile {
  readonly style: CrossClassStyle;
  /** 095 already maps demand to the sedan reference; the sedan run is the class-neutral source. */
  readonly derivedFrom: 'sedan';
  readonly values: readonly CrossClassProfileValue[];
  readonly parameters: Readonly<Record<string, number>>;
  readonly fleetApplication: readonly FleetProfileApplication[];
  readonly sameAcrossDriverKinds: boolean;
  readonly appliedToBothClasses: boolean;
  readonly mechanicalCopied: boolean;
  readonly mechanicalCopyCode: typeof MECHANICAL_CAPABILITY_COPY_CODE | null;
  readonly copiedKeys: readonly ParameterKey[];
  readonly copyFindings: readonly MechanicalCopyFinding[];
}

export interface CrossClassCandidateDelta {
  readonly key: ParameterKey;
  readonly previousValue: number;
  readonly estimate: number;
  readonly newValue: number;
  readonly learningWeight: number;
  readonly resolution: string;
  readonly evidenceState: string;
  readonly effectiveEpisodeCount: number;
  readonly published: false;
  readonly learned: false;
}

export type ModeFidelityReason =
  | 'MANUAL_NO_LEARNING'
  | 'AUTO_NO_LEARNING'
  | 'INELIGIBLE'
  | 'LEARNING_ACCEPTED'
  | 'NO_PROFILE_CHANGE'
  | 'NO_CANDIDATE';

export interface ModeFidelityInput {
  readonly mode: LearningSegmentMode;
  readonly eligible: boolean;
  readonly sameRoute: boolean;
  readonly routeId?: string;
}

export interface ModeFidelityResult {
  readonly mode: LearningSegmentMode;
  readonly eligible: boolean;
  readonly sameRoute: boolean;
  readonly reason: ModeFidelityReason;
  readonly profileChanged: boolean;
  readonly candidate: Readonly<{
    key: ParameterKey;
    status: string;
    value: number;
    reason: string | null;
  }> | null;
  readonly versionId: string | null;
  readonly delta: CrossClassCandidateDelta | null;
  readonly evidence: Readonly<{
    status: string;
    distinctEpisodes: number;
    quality: number;
  }> | null;
  readonly gate: Readonly<{
    status: 'VALID' | 'REJECTED';
    reason: string | null;
    detail: string | null;
  }>;
  readonly route: CrossClassRouteState;
  readonly publication: Readonly<{
    published: false;
    storeWrites: 0;
    fleetMutations: 0;
  }>;
}

export interface CrossClassFidelityOptions {
  readonly ports?: Partial<CrossClassFidelityPorts>;
  /** Deliberate injection used by the detector probe; never used by the default run. */
  readonly commonProfileOverrides?: Readonly<Partial<Record<ParameterKey, number>>>;
}

export interface CrossClassFidelityReport {
  readonly version: typeof CROSS_CLASS_FIDELITY_VERSION;
  readonly rootSeed: number;
  readonly tickHz: number;
  readonly contract: Readonly<{
    classes: readonly VehicleClassId[];
    styles: readonly CrossClassStyle[];
    styleSources: Readonly<Record<CrossClassStyle, InverseProfileId>>;
    scenarios: readonly CrossClassScenarioId[];
    keys: readonly ParameterKey[];
    trendKeys: readonly {
      readonly key: ParameterKey;
      readonly direction: CrossClassTrendDirection;
    }[];
    tolerances: readonly CrossClassTolerance[];
    unrepresentableBehaviours: readonly UnrepresentableBehaviour[];
    referenceClass: 'sedan';
    toleranceSource: typeof INVERSE_LEARNING_VERSION;
  }>;
  readonly classes: readonly Readonly<{
    classId: VehicleClassId;
    capability: MechanicalCapabilitySnapshot;
  }>[];
  readonly runs: readonly CrossClassStyleRun[];
  readonly trend: readonly CrossClassTrendRow[];
  readonly trendPreserved: boolean;
  readonly normalizedAgreement: boolean;
  readonly commonProfiles: readonly CrossClassCommonProfile[];
  readonly mechanicalCopied: boolean;
  readonly mechanicalCopyCode: typeof MECHANICAL_CAPABILITY_COPY_CODE | null;
  readonly modeFidelity: Readonly<{
    manual: ModeFidelityResult;
    learningEligible: ModeFidelityResult;
    learningIneligible: ModeFidelityResult;
    routeIdentical: boolean;
    manualMatchesActualGate: boolean;
    learningEligibleMatchesActualGate: boolean;
    learningIneligibleMatchesActualGate: boolean;
  }>;
  readonly unrepresentable: readonly UnrepresentableCase[];
  readonly outOfScopeManoeuvre: UnrepresentableCase &
    Readonly<{ manoeuvre: string; description: string }>;
  readonly overall: Readonly<{
    styles: number;
    classes: number;
    keys: number;
    runs: number;
    keyRows: number;
    trendPreserved: boolean;
    normalizedAgreement: boolean;
    mechanicalCopied: boolean;
    commonProfileSameAcrossKinds: boolean;
    commonProfileNoClassOverrides: boolean;
    manualNoLearning: boolean;
    learningEligibleChanged: boolean;
    learningIneligibleUnchanged: boolean;
    sameRoute: boolean;
    unrepresentableReported: boolean;
    storeWrites: 0;
    fleetMutations: 0;
    profilePublications: 0;
    pass: boolean;
  }>;
}

const SESSION_ID = 'session-106-cross-class';
const WORLD_EPOCH = 1;
const SEGMENT_ID = 'segment-106';
const ROUTE_ID = 'route-106';

/** A style target is taken verbatim from the 105 known profile; no number is invented here. */
export function crossClassStyleTarget(style: CrossClassStyle, key: ParameterKey): number {
  const profileId = crossClassStyleSources[style];
  const value = knownProfileTargets.get(profileId)?.get(key);
  if (value === undefined) throw new Error(`106 missing 105 style target: ${style}/${key}`);
  return value;
}

for (const entry of crossClassTrendKeys) {
  const cautious = crossClassStyleTarget('CAUTIOUS', entry.key);
  const assertive = crossClassStyleTarget('ASSERTIVE', entry.key);
  const ordered = entry.direction === 'ASCENDING' ? cautious < assertive : cautious > assertive;
  if (!ordered) throw new Error(`106 style ordering contract is broken for ${entry.key}`);
}

const accelerationKeys = new Set<ParameterKey>([
  'desired_acceleration',
  'comfort_deceleration',
  'acceleration_jerk',
  'brake_reaction_delay',
]);

interface WindowCore {
  readonly opportunity: OpportunityRecord;
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
}

function round(value: number, decimals = 9): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function noise(seed: number, key: string, index: number, amplitude: number): number {
  return (randomUnit(seed, key, index) * 2 - 1) * amplitude;
}

function digest(seed: number): string {
  return seed.toString(16).padStart(8, '0');
}

function windowContext(
  scenarioId: CrossClassScenarioId,
  style: CrossClassStyle,
  classId: VehicleClassId,
  index: number,
  ticks: number,
): WindowCore {
  const id = `106-${scenarioId}-${style}-${classId}-${index}`;
  const vehicleId = `taxi-106-${classId}`;
  const incarnation = `taxi-106-${classId}-incarnation`;
  const lastTick = ticks - 1;
  const opportunity: OpportunityRecord = Object.freeze({
    id,
    kind: 'GREEN' as OpportunityKind,
    state: 'RESOLVED',
    outcome: 'RELEASED',
    result: 'SUCCESS',
    truncationReason: null,
    vehicleId,
    incarnation,
    segmentIds: Object.freeze([SEGMENT_ID]),
    learningEligible: true,
    occurrence: 0,
    openedTick: 0,
    lastTick,
    resolvedTick: lastTick,
    observationCount: ticks,
    stimulus: Object.freeze({
      stopLineId: null,
      signalId: null,
      intersectionId: null,
      movementId: null,
      movementPhaseStartedTick: null,
      fromLaneId: null,
      toLaneId: null,
      relationIds: Object.freeze([]),
    }),
  });
  const eligibility = Object.freeze({
    windowId: `wnd-${id}`,
    opportunityId: id,
    kind: 'GREEN' as OpportunityKind,
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId,
    incarnation,
    segmentId: SEGMENT_ID,
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 0,
    lastTick,
    observationCount: ticks,
    reaction: Object.freeze({ open: false as const, reason: 'SEGMENT_EXCLUDED' as const }),
    windowClass: 'ELIGIBLE',
    label: 'FREE_TRAFFIC',
  }) as EligibilityWindowRecord;
  const artifacts = Object.freeze({
    windowId: `wnd-${id}`,
    sessionId: SESSION_ID,
    worldEpoch: WORLD_EPOCH,
    segmentId: SEGMENT_ID,
    vehicleId,
    incarnation,
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 0,
    endTick: lastTick,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    artifacts: Object.freeze([]),
    artifactCount: 0,
    boundaryTick: null,
    boundaryCause: null,
    suppressed: null,
    openedTick: 0,
    lastTick,
    observationCount: ticks,
    windowClass: 'PREFIX_ELIGIBLE',
    prefix: Object.freeze({ fromTick: 0, toTick: lastTick, ticks }),
  }) as FilteredWindowRecord;
  return Object.freeze({ opportunity, eligibility, artifacts });
}

function styleFractions(style: CrossClassStyle): Readonly<{
  acceleration: number;
  deceleration: number;
  lateral: number;
}> {
  const reference = crossClassCapability('sedan');
  return Object.freeze({
    acceleration:
      crossClassStyleTarget(style, 'desired_acceleration') / reference.maxAccelerationMps2,
    deceleration:
      crossClassStyleTarget(style, 'comfort_deceleration') / reference.maxDecelerationMps2,
    lateral:
      crossClassStyleTarget(style, 'curve_lateral_accel') / reference.maxLateralAccelerationMps2,
  });
}

/**
 * The same dimensionless style demand is multiplied by the **current class** ceiling, so the raw
 * SI values differ by the real mechanical difference while 089 divides exactly that difference back
 * out. Half the ticks are positive acceleration and half are braking, so both p90 demands exist.
 */
function rawSamples(
  seed: number,
  style: CrossClassStyle,
  classId: VehicleClassId,
  ticks: number,
): readonly VehicleNormalizationSample[] {
  const capability = crossClassCapability(classId);
  const fractions = styleFractions(style);
  const samples: VehicleNormalizationSample[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    const accelerating = tick % 2 === 0;
    const pulse = Math.floor(tick / 2);
    const accelerationNoise = 1 + noise(seed, `accel-${classId}`, pulse, 0.02);
    const decelerationNoise = 1 + noise(seed, `decel-${classId}`, pulse, 0.02);
    const lateralNoise = 1 + noise(seed, `lateral-${classId}`, tick, 0.02);
    const longitudinal = accelerating
      ? fractions.acceleration * accelerationNoise * capability.maxAccelerationMps2
      : -fractions.deceleration * decelerationNoise * capability.maxDecelerationMps2;
    samples.push(
      Object.freeze({
        tick,
        longitudinalAccelerationMps2: round(longitudinal, 6),
        lateralAccelerationMps2: round(
          fractions.lateral * lateralNoise * capability.maxLateralAccelerationMps2,
          6,
        ),
        throttle: accelerating ? 0.55 : 0.15,
        brake: accelerating ? 0.05 : 0.45,
        steering: 0.12,
      }),
    );
  }
  return Object.freeze(samples);
}

function normalizeWindow(
  core: WindowCore,
  seed: number,
  style: CrossClassStyle,
  classId: VehicleClassId,
  ticks: number,
): IntentionalVehicleNormalization {
  const normalizer = createVehicleNormalizer({ maxWindows: 32 });
  try {
    const record = normalizer.observe({
      tick: ticks - 1,
      sessionId: SESSION_ID,
      worldEpoch: WORLD_EPOCH,
      segmentId: SEGMENT_ID,
      vehicleId: core.eligibility.vehicleId,
      incarnation: core.eligibility.incarnation,
      classId,
      eligibility: core.eligibility,
      artifacts: core.artifacts,
      samples: rawSamples(seed, style, classId, ticks),
    });
    if (record.windowClass !== 'NORMALIZED' || record.demandStatus !== 'INTENTIONAL')
      throw new Error(
        `106 normalization did not produce an intentional normalization record: ${record.featureId}`,
      );
    return record;
  } finally {
    normalizer.dispose();
  }
}

function windowSummary(
  classId: VehicleClassId,
  normalized: IntentionalVehicleNormalization,
): CrossClassWindowSummary {
  return Object.freeze({
    windowId: normalized.windowId,
    opportunityId: normalized.opportunityId,
    classId,
    demandStatus: normalized.demandStatus,
    features: normalized.features,
  });
}

function speedSeries(
  seed: number,
  key: string,
  base: number,
  count: number,
  amplitude: number,
  step = 30,
): readonly { readonly tick: number; readonly speedMps: number }[] {
  return Object.freeze(
    Array.from({ length: count }, (_, index) =>
      Object.freeze({
        tick: index * step,
        speedMps: Math.max(0, base + noise(seed, key, index, amplitude)),
      }),
    ),
  );
}

function routeState(
  style: CrossClassStyle,
  classId: VehicleClassId,
  scenarioId: CrossClassScenarioId,
  salt: string,
): CrossClassRouteState {
  const seed = deriveScenarioSeed(
    CROSS_CLASS_FIDELITY_ROOT_SEED,
    `route:${style}:${classId}:${scenarioId}:${salt}`,
  );
  const observationSeed = deriveScenarioSeed(
    CROSS_CLASS_FIDELITY_ROOT_SEED,
    `${style}:${classId}:${scenarioId}`,
  );
  return Object.freeze({
    routeId: ROUTE_ID,
    routeDigest: digest(seed),
    observationDigest: digest(observationSeed),
    classId,
    style,
    scenarioId,
    startTick: 120,
    endTick: 120 + 240,
    sampleCount: 241,
    postedLimitMps: 12,
    cruiseSpeedMps: round(9 + randomUnit(seed, 'route-speed', 0) * 5, 4),
    distanceM: round(1800 + randomUnit(seed, 'route-distance', 0) * 900, 3),
  });
}

function buildFreeFlowDemonstration(
  seed: number,
  style: CrossClassStyle,
  classId: VehicleClassId,
): {
  speed: readonly SpeedEstimatorObservation[];
  evidence: readonly ParameterEvidenceReadModel[];
  windows: readonly CrossClassWindowSummary[];
} {
  const speed: SpeedEstimatorObservation[] = [];
  const windows: CrossClassWindowSummary[] = [];
  const ledger = createParameterEvidenceLedger();
  const definitions = [
    {
      roadKind: 'URBAN' as const,
      key: 'speed_delta_urban' as const,
      roadType: 'urban',
      postedLimitMps: 14,
      amplitude: 0.04,
    },
    {
      roadKind: 'RESIDENTIAL' as const,
      key: 'speed_delta_residential' as const,
      roadType: 'residential',
      postedLimitMps: 8.5,
      amplitude: 0.04,
    },
  ];
  let index = 0;
  for (const definition of definitions) {
    const delta = crossClassStyleTarget(style, definition.key);
    for (let episode = 0; episode < 3; episode += 1) {
      const core = windowContext('FREE_FLOW', style, classId, index++, 901);
      const samples = speedSeries(
        seed,
        `${definition.key}-${classId}-${episode}`,
        definition.postedLimitMps + delta,
        31,
        definition.amplitude,
      );
      speed.push(
        Object.freeze({
          ...core,
          roadKind: definition.roadKind,
          postedLimitMps: definition.postedLimitMps,
          speedSamples: samples,
          intersectionApproach: false,
          curveRadiusM: null,
          normalized: null,
        }) as SpeedEstimatorObservation,
      );
      ledger.observe({
        eligibility: core.eligibility,
        opportunity: core.opportunity,
        artifacts: core.artifacts,
        roadType: definition.roadType,
        speedSamples: samples,
      });
    }
  }
  const approach = crossClassStyleTarget(style, 'intersection_approach_speed');
  for (let episode = 0; episode < 3; episode += 1) {
    const core = windowContext('FREE_FLOW', style, classId, index++, 901);
    const samples = speedSeries(seed, `approach-${classId}-${episode}`, approach, 31, 0.15);
    speed.push(
      Object.freeze({
        ...core,
        roadKind: 'OTHER',
        postedLimitMps: 12,
        speedSamples: samples,
        intersectionApproach: true,
        curveRadiusM: null,
        normalized: null,
      }) as SpeedEstimatorObservation,
    );
    ledger.observe({
      eligibility: core.eligibility,
      opportunity: core.opportunity,
      artifacts: core.artifacts,
      roadType: 'other',
      speedSamples: samples,
    });
  }
  for (let episode = 0; episode < 3; episode += 1) {
    const core = windowContext('FREE_FLOW', style, classId, index++, 240);
    const normalized = normalizeWindow(core, seed, style, classId, 240);
    windows.push(windowSummary(classId, normalized));
    speed.push(
      Object.freeze({
        ...core,
        roadKind: 'OTHER',
        postedLimitMps: 12,
        speedSamples: Object.freeze([]),
        intersectionApproach: false,
        curveRadiusM: 42 + episode * 8,
        normalized,
      }) as SpeedEstimatorObservation,
    );
    ledger.observe({
      eligibility: core.eligibility,
      opportunity: core.opportunity,
      artifacts: core.artifacts,
      normalized,
      roadType: 'other',
    });
  }
  return Object.freeze({
    speed: Object.freeze(speed),
    evidence: ledger.readAll(),
    windows: Object.freeze(windows),
  });
}

function buildLongitudinalDemonstration(
  seed: number,
  style: CrossClassStyle,
  classId: VehicleClassId,
): {
  acceleration: readonly AccelerationEstimatorObservation[];
  evidence: readonly ParameterEvidenceReadModel[];
  windows: readonly CrossClassWindowSummary[];
} {
  const acceleration: AccelerationEstimatorObservation[] = [];
  const windows: CrossClassWindowSummary[] = [];
  const ledger = createParameterEvidenceLedger();
  const jerk = crossClassStyleTarget(style, 'acceleration_jerk');
  const reaction = crossClassStyleTarget(style, 'brake_reaction_delay');
  const reactionTicks = Math.round(reaction * CROSS_CLASS_FIDELITY_TICK_HZ);
  for (let index = 0; index < 4; index += 1) {
    const core = windowContext('LONGITUDINAL', style, classId, index, 240);
    const normalized = normalizeWindow(core, seed, style, classId, 240);
    windows.push(windowSummary(classId, normalized));
    const reactionEvidence: PreferenceEvidenceRecord = Object.freeze({
      version: ELIGIBILITY_VERSION,
      windowId: core.eligibility.windowId,
      opportunityId: core.opportunity.id,
      kind: core.eligibility.kind,
      vehicleId: core.eligibility.vehicleId,
      incarnation: core.eligibility.incarnation,
      reactionDurationTicks: reactionTicks,
      reactionDurationSeconds: reactionTicks / CROSS_CLASS_FIDELITY_TICK_HZ,
    });
    acceleration.push(
      Object.freeze({
        ...core,
        normalized,
        jerkSamplesMps3: Object.freeze([
          round(jerk + noise(seed, `jerk-${classId}-a`, index, 0.1), 6),
          round(jerk, 6),
          round(jerk + noise(seed, `jerk-${classId}-b`, index, 0.1), 6),
          round(jerk + noise(seed, `jerk-${classId}-c`, index, 0.1), 6),
          round(jerk, 6),
          round(jerk + noise(seed, `jerk-${classId}-d`, index, 0.1), 6),
        ]),
        reactionEvidence,
      }) as AccelerationEstimatorObservation,
    );
    ledger.observe({
      eligibility: core.eligibility,
      opportunity: core.opportunity,
      artifacts: core.artifacts,
      normalized,
      roadType: 'urban',
    });
  }
  return Object.freeze({
    acceleration: Object.freeze(acceleration),
    evidence: ledger.readAll(),
    windows: Object.freeze(windows),
  });
}

/**
 * Deterministic demonstration for one style on one real class. The same style fractions are used on
 * both classes, so the normalized demand is shared while the raw demand reflects the class ceiling.
 */
export function generateClassDemonstration(
  style: CrossClassStyle,
  classId: VehicleClassId,
  scenario: CrossClassScenarioId,
): CrossClassDemonstration {
  if (!crossClassStyleIds.includes(style)) throw new Error(`Unknown 106 style: ${style}`);
  if (!crossClassIds.includes(classId)) throw new Error(`Unknown 106 class: ${classId}`);
  if (!crossClassScenarioIds.includes(scenario))
    throw new Error(`Unknown 106 scenario: ${scenario}`);
  const seed = deriveScenarioSeed(
    CROSS_CLASS_FIDELITY_ROOT_SEED,
    `${style}:${classId}:${scenario}`,
  );
  const capability = crossClassCapability(classId);
  if (scenario === 'FREE_FLOW') {
    const built = buildFreeFlowDemonstration(seed, style, classId);
    return Object.freeze({
      version: CROSS_CLASS_FIDELITY_VERSION,
      style,
      classId,
      scenarioId: scenario,
      seed,
      capability,
      evidence: built.evidence,
      speed: built.speed,
      acceleration: Object.freeze([]),
      windows: built.windows,
      route: routeState(style, classId, scenario, 'shared'),
    });
  }
  const built = buildLongitudinalDemonstration(seed, style, classId);
  return Object.freeze({
    version: CROSS_CLASS_FIDELITY_VERSION,
    style,
    classId,
    scenarioId: scenario,
    seed,
    capability,
    evidence: built.evidence,
    speed: Object.freeze([]),
    acceleration: built.acceleration,
    windows: built.windows,
    route: routeState(style, classId, scenario, 'shared'),
  });
}

function evidenceSummary(read: ParameterEvidenceReadModel): CrossClassKeyRow['evidence'] {
  return Object.freeze({
    status: read.status,
    distinctEpisodes: read.distinctEpisodes,
    sampleCount: read.sampleCount,
    quality: read.quality,
  });
}

function evidenceFor(
  key: ParameterKey,
  freeFlow: readonly ParameterEvidenceReadModel[],
  longitudinal: readonly ParameterEvidenceReadModel[],
): ParameterEvidenceReadModel {
  const source = accelerationKeys.has(key) ? longitudinal : freeFlow;
  const found = source.find((entry) => entry.key === key);
  if (found) return found;
  return Object.freeze({
    key,
    status: 'NO_EVIDENCE',
    distinctEpisodes: 0,
    contextBreakdown: Object.freeze([]),
    sampleCount: 0,
    quality: 0,
    uncertainty: 'NONE',
    unchanged: true,
    noEstimate: 'NO_QUALIFYING_EVIDENCE',
  });
}

function candidateFor(
  key: ParameterKey,
  speed: ReturnType<CrossClassFidelityPorts['speed']>,
  acceleration: ReturnType<CrossClassFidelityPorts['acceleration']>,
): Readonly<{ status: string; value: number | null; reason: string | null }> {
  if (accelerationKeys.has(key)) {
    const candidate = acceleration.candidates[key as AccelerationEstimatorKey];
    return Object.freeze({
      status: candidate.status,
      value: candidate.value,
      reason: candidate.reason,
    });
  }
  const candidate = speed.candidates[key as SpeedEstimatorKey];
  return Object.freeze({
    status: candidate.status,
    value: candidate.value,
    reason: candidate.reason,
  });
}

function keyRowsFor(
  style: CrossClassStyle,
  freeFlow: CrossClassDemonstration,
  longitudinal: CrossClassDemonstration,
  speed: ReturnType<CrossClassFidelityPorts['speed']>,
  acceleration: ReturnType<CrossClassFidelityPorts['acceleration']>,
): readonly CrossClassKeyRow[] {
  return Object.freeze(
    crossClassKeys.map((key) => {
      const target = crossClassStyleTarget(style, key);
      const tolerance = toleranceOf.get(key);
      if (!tolerance) throw new Error(`106 missing tolerance for ${key}`);
      const candidate = candidateFor(key, speed, acceleration);
      return Object.freeze({
        key,
        target,
        estimate: candidate.status === 'CANDIDATE' ? candidate.value : null,
        status: candidate.status,
        reason: candidate.reason,
        evidence: evidenceSummary(evidenceFor(key, freeFlow.evidence, longitudinal.evidence)),
        tolerance: Object.freeze({
          absolute: tolerance.absoluteTolerance,
          relative: tolerance.relativeTolerance,
          effective: round(
            tolerance.absoluteTolerance + tolerance.relativeTolerance * Math.abs(target),
            6,
          ),
        }),
      });
    }),
  );
}

function createStyleRun(
  style: CrossClassStyle,
  classId: VehicleClassId,
  ports: CrossClassFidelityPorts,
): CrossClassStyleRun {
  const freeFlow = generateClassDemonstration(style, classId, 'FREE_FLOW');
  const longitudinal = generateClassDemonstration(style, classId, 'LONGITUDINAL');
  const speed = ports.speed(freeFlow.evidence, freeFlow.speed);
  const acceleration = ports.acceleration(longitudinal.evidence, longitudinal.acceleration);
  const breakdown = acceleration.normalizationBreakdown.find((row) => row.classId === classId);
  if (!breakdown) throw new Error(`106 estimator did not report the ${classId} breakdown`);
  const capability = crossClassCapability(classId);
  const mechanical: CrossClassMechanicalReport = Object.freeze({
    classId,
    capability,
    rawP50: Object.freeze({
      accelerationMps2: breakdown.rawAccelerationMps2P50,
      decelerationMps2: breakdown.rawDecelerationMps2P50,
      lateralMps2: breakdown.rawLateralAccelerationMps2P50,
    }),
    normalizedP50: Object.freeze({
      acceleration: breakdown.accelerationDemandP50,
      deceleration: breakdown.decelerationDemandP50,
      lateral: breakdown.lateralDemandP50,
    }),
    episodeCount: breakdown.episodeCount,
  });
  return Object.freeze({
    classId,
    style,
    capability,
    demonstrationSeeds: Object.freeze({ freeFlow: freeFlow.seed, longitudinal: longitudinal.seed }),
    mechanical,
    keys: keyRowsFor(style, freeFlow, longitudinal, speed, acceleration),
    route: longitudinal.route,
  });
}

function estimateOf(run: CrossClassStyleRun, key: ParameterKey): number | null {
  return run.keys.find((row) => row.key === key)?.estimate ?? null;
}

const mechanicalKeyChannels: Readonly<
  Partial<
    Record<
      ParameterKey,
      {
        readonly raw: 'accelerationMps2' | 'decelerationMps2' | 'lateralMps2';
        readonly channel: MechanicalCopyFinding['channel'];
      }
    >
  >
> = Object.freeze({
  desired_acceleration: Object.freeze({
    raw: 'accelerationMps2' as const,
    channel: 'LONGITUDINAL_ACCELERATION' as const,
  }),
  comfort_deceleration: Object.freeze({
    raw: 'decelerationMps2' as const,
    channel: 'LONGITUDINAL_DECELERATION' as const,
  }),
  curve_lateral_accel: Object.freeze({
    raw: 'lateralMps2' as const,
    channel: 'LATERAL' as const,
  }),
});

function capabilityChannelValue(
  classId: VehicleClassId,
  channel: MechanicalCopyFinding['channel'],
): number {
  const capability = crossClassCapability(classId);
  if (channel === 'LONGITUDINAL_ACCELERATION') return capability.maxAccelerationMps2;
  if (channel === 'LONGITUDINAL_DECELERATION') return capability.maxDecelerationMps2;
  return capability.maxLateralAccelerationMps2;
}

const MECHANICAL_COPY_EPSILON = 1e-6;

/**
 * A profile value equal to a class ceiling or to the non-reference class's raw realized p50 is a
 * copied mechanical value, not a style. This is the detector behind `MECHANICAL_CAPABILITY_COPIED`.
 */
function detectMechanicalCopy(
  values: readonly CrossClassProfileValue[],
  reference: CrossClassStyleRun,
  compact: CrossClassStyleRun,
): readonly MechanicalCopyFinding[] {
  const findings: MechanicalCopyFinding[] = [];
  for (const row of values) {
    const mapping = mechanicalKeyChannels[row.key];
    if (!mapping) continue;
    for (const classId of crossClassIds) {
      const capability = capabilityChannelValue(classId, mapping.channel);
      if (Math.abs(row.value - capability) <= MECHANICAL_COPY_EPSILON)
        findings.push(
          Object.freeze({
            key: row.key,
            value: row.value,
            source: 'CLASS_CAPABILITY' as const,
            sourceClassId: classId,
            channel: mapping.channel,
          }),
        );
    }
    const raw = compact.mechanical.rawP50[mapping.raw];
    if (
      Math.abs(row.value - raw) <= MECHANICAL_COPY_EPSILON &&
      compact.classId !== reference.classId
    )
      findings.push(
        Object.freeze({
          key: row.key,
          value: row.value,
          source: 'RAW_CLASS_MECHANICAL' as const,
          sourceClassId: compact.classId,
          channel: mapping.channel,
        }),
      );
  }
  return Object.freeze(findings);
}

function buildCommonProfile(
  style: CrossClassStyle,
  runs: readonly CrossClassStyleRun[],
  overrides: Readonly<Partial<Record<ParameterKey, number>>>,
): CrossClassCommonProfile {
  const reference = runs.find((run) => run.style === style && run.classId === 'sedan');
  const compact = runs.find((run) => run.style === style && run.classId === 'compact');
  if (!reference || !compact) throw new Error(`106 missing class run for ${style}`);
  const values = crossClassKeys.map((key) => {
    const definition = getParameterDefinition(key);
    const injected = overrides[key];
    const estimate = estimateOf(reference, key);
    const value = injected ?? estimate;
    if (value === null || !Number.isFinite(value))
      throw new Error(`106 common profile has no numeric value for ${style}/${key}`);
    return Object.freeze({
      key,
      value,
      unit: definition.unit,
      min: definition.min,
      max: definition.max,
      source:
        injected === undefined ? ('NORMALIZED_STYLE' as const) : ('INJECTED_OVERRIDE' as const),
    });
  });
  const parameters = Object.freeze(
    Object.fromEntries(values.map((row) => [row.key, row.value])),
  ) as Readonly<Record<string, number>>;
  const profileId = `106-common-${style.toLowerCase()}`;
  const fleetApplication = fleetDriverKinds.map((driverKind) =>
    Object.freeze({
      driverKind,
      profileId,
      classes: Object.freeze(
        crossClassIds.filter((classId) => fleetClassCompatible(driverKind, classId)),
      ),
      parameters,
      classSpecificOverrides: Object.freeze([] as const),
    }),
  );
  const first = fleetApplication[0];
  if (!first) throw new Error('106 fleet kind list is empty');
  const sameAcrossDriverKinds = fleetApplication.every(
    (application) => JSON.stringify(application.parameters) === JSON.stringify(first.parameters),
  );
  const appliedToBothClasses = fleetApplication.every(
    (application) =>
      application.classes.length === crossClassIds.length &&
      crossClassIds.every((classId) => application.classes.includes(classId)),
  );
  const copyFindings = detectMechanicalCopy(values, reference, compact);
  const copiedKeys = Object.freeze([...new Set(copyFindings.map((finding) => finding.key))]);
  return Object.freeze({
    style,
    derivedFrom: 'sedan',
    values: Object.freeze(values),
    parameters,
    fleetApplication: Object.freeze(fleetApplication),
    sameAcrossDriverKinds,
    appliedToBothClasses,
    mechanicalCopied: copyFindings.length > 0,
    mechanicalCopyCode: copyFindings.length > 0 ? MECHANICAL_CAPABILITY_COPY_CODE : null,
    copiedKeys,
    copyFindings,
  });
}

function buildTrend(runs: readonly CrossClassStyleRun[]): readonly CrossClassTrendRow[] {
  return Object.freeze(
    crossClassTrendKeys.map(({ key, direction }) => {
      const targetCautious = crossClassStyleTarget('CAUTIOUS', key);
      const targetAssertive = crossClassStyleTarget('ASSERTIVE', key);
      const estimateFor = (classId: VehicleClassId, style: CrossClassStyle): number | null => {
        const run = runs.find((entry) => entry.classId === classId && entry.style === style);
        return run ? estimateOf(run, key) : null;
      };
      const sedan = Object.freeze({
        cautious: estimateFor('sedan', 'CAUTIOUS'),
        assertive: estimateFor('sedan', 'ASSERTIVE'),
      });
      const compact = Object.freeze({
        cautious: estimateFor('compact', 'CAUTIOUS'),
        assertive: estimateFor('compact', 'ASSERTIVE'),
      });
      const ordered = (cautious: number | null, assertive: number | null): boolean => {
        if (cautious === null || assertive === null) return false;
        return direction === 'ASCENDING' ? cautious < assertive : cautious > assertive;
      };
      const sedanOrder = ordered(sedan.cautious, sedan.assertive);
      const compactOrder = ordered(compact.cautious, compact.assertive);
      const tolerance = toleranceOf.get(key);
      if (!tolerance) throw new Error(`106 missing tolerance for ${key}`);
      const differences = [
        sedan.cautious !== null && compact.cautious !== null
          ? sedan.cautious - compact.cautious
          : null,
        sedan.assertive !== null && compact.assertive !== null
          ? sedan.assertive - compact.assertive
          : null,
      ].filter((value): value is number => value !== null);
      const agreement =
        differences.length === 0
          ? Number.POSITIVE_INFINITY
          : Math.max(...differences.map(Math.abs));
      const normalizedAgreement = differences.length === 2 && agreement <= tolerance.effective;
      const mapping = mechanicalKeyChannels[key];
      let mechanical: CrossClassTrendRow['mechanical'] = null;
      if (mapping) {
        const rawFor = (classId: VehicleClassId, style: CrossClassStyle): number => {
          const run = runs.find((entry) => entry.classId === classId && entry.style === style);
          if (!run) throw new Error(`106 missing ${classId}/${style} run`);
          return run.mechanical.rawP50[mapping.raw];
        };
        const sedanValues = Object.freeze({
          cautious: rawFor('sedan', 'CAUTIOUS'),
          assertive: rawFor('sedan', 'ASSERTIVE'),
        });
        const compactValues = Object.freeze({
          cautious: rawFor('compact', 'CAUTIOUS'),
          assertive: rawFor('compact', 'ASSERTIVE'),
        });
        mechanical = Object.freeze({
          sedan: sedanValues,
          compact: compactValues,
          differs:
            Math.abs(sedanValues.cautious - compactValues.cautious) > MECHANICAL_COPY_EPSILON &&
            Math.abs(sedanValues.assertive - compactValues.assertive) > MECHANICAL_COPY_EPSILON,
        });
      }
      return Object.freeze({
        key,
        direction,
        targets: Object.freeze({ cautious: targetCautious, assertive: targetAssertive }),
        estimates: Object.freeze({ sedan, compact }),
        classOrderPreserved: Object.freeze({ sedan: sedanOrder, compact: compactOrder }),
        orderPreserved: sedanOrder && compactOrder,
        tolerance,
        agreement,
        normalizedAgreement,
        mechanical,
      });
    }),
  );
}

function buildUnrepresentable(): readonly UnrepresentableCase[] {
  return Object.freeze(
    unrepresentableBehaviourIds.map((behaviour) => {
      const definition = unrepresentableDefinitions[behaviour];
      return Object.freeze({
        behaviour,
        result: 'UNREPRESENTABLE' as const,
        estimate: null,
        key: null,
        value: null,
        reason: definition.reason,
        detail: definition.detail,
      });
    }),
  );
}

function modeReason(
  input: ModeFidelityInput,
  gate: ModeFidelityResult['gate'],
): ModeFidelityReason {
  if (input.mode === 'MANUAL') return 'MANUAL_NO_LEARNING';
  if (input.mode === 'AUTO') return 'AUTO_NO_LEARNING';
  if (!input.eligible) return 'INELIGIBLE';
  return gate.status === 'VALID' ? 'LEARNING_ACCEPTED' : 'NO_CANDIDATE';
}

function unobservedRead(key: ParameterKey): ParameterEvidenceReadModel {
  return Object.freeze({
    key,
    status: 'NO_EVIDENCE',
    distinctEpisodes: 0,
    contextBreakdown: Object.freeze([]),
    sampleCount: 0,
    quality: 0,
    uncertainty: 'NONE',
    unchanged: true,
    noEstimate: 'NO_QUALIFYING_EVIDENCE',
  });
}

/**
 * One route/state is demonstrated in both control modes. MANUAL and ineligible LEARNING never
 * produce a candidate; an eligible LEARNING segment produces an in-memory blend candidate tied to
 * the real 093 evidence and the real 095 estimate. The physical route is derived from the
 * style/class/scenario only, so the mode cannot change the route unless `sameRoute` is false.
 */
export function evaluateModeFidelity(
  input: ModeFidelityInput,
  options: { readonly ports?: Partial<CrossClassFidelityPorts> } = {},
): ModeFidelityResult {
  if (!learningSegmentModes.includes(input.mode))
    throw new Error(`Unknown 106 control mode: ${String(input.mode)}`);
  const ports: CrossClassFidelityPorts = Object.freeze({
    ...realCrossClassFidelityPorts,
    ...(options.ports ?? {}),
  });
  const style: CrossClassStyle = 'ASSERTIVE';
  const classId: VehicleClassId = 'sedan';
  const demonstration = generateClassDemonstration(style, classId, 'LONGITUDINAL');
  const acceleration = ports.acceleration(demonstration.evidence, demonstration.acceleration);
  const candidate = acceleration.candidates.desired_acceleration;
  const evidence =
    demonstration.evidence.find((entry) => entry.key === 'desired_acceleration') ??
    unobservedRead('desired_acceleration');
  const definition = getParameterDefinition('desired_acceleration');
  const episodes: readonly ProfileBlendEpisode[] = Object.freeze(
    demonstration.acceleration.map((row) =>
      Object.freeze({
        opportunityId: row.eligibility.opportunityId,
        occurrence: 0,
        observedTicks: row.artifacts.prefix?.ticks ?? 0,
        ageSeconds: 0,
        value: candidate.value ?? undefined,
      }),
    ),
  );
  const candidateView: ConfidenceCandidate = Object.freeze({
    key: 'desired_acceleration',
    status: candidate.status,
    value: candidate.value,
  });
  const parsed = parseLearningJob({
    playerId: 'player-106',
    profileId: 'profile-106',
    learningEpoch: 1,
    baseVersionId: 'base-106',
    segmentId: `segment-106-${input.mode.toLowerCase()}-${input.sameRoute ? 'shared' : 'split'}`,
    mode: input.mode,
    eligible: input.eligible,
    order: 1,
    sessionId: SESSION_ID,
    worldEpoch: WORLD_EPOCH,
    key: 'desired_acceleration',
    baseValue: definition.default,
    evidence,
    episodes,
    candidate: candidateView,
  });
  const gate: ModeFidelityResult['gate'] =
    parsed.status === 'VALID'
      ? Object.freeze({ status: 'VALID' as const, reason: null, detail: null })
      : Object.freeze({
          status: 'REJECTED' as const,
          reason: parsed.reason,
          detail: parsed.detail,
        });
  const route = routeState(
    style,
    classId,
    'LONGITUDINAL',
    input.sameRoute ? 'shared' : `mode:${input.mode}`,
  );
  const publication = Object.freeze({
    published: false as const,
    storeWrites: 0 as const,
    fleetMutations: 0 as const,
  });

  if (input.mode !== 'LEARNING' || !input.eligible)
    return Object.freeze({
      mode: input.mode,
      eligible: input.eligible,
      sameRoute: input.sameRoute,
      reason: modeReason(input, gate),
      profileChanged: false,
      candidate: null,
      versionId: null,
      delta: null,
      evidence: Object.freeze({
        status: evidence.status,
        distinctEpisodes: evidence.distinctEpisodes,
        quality: evidence.quality,
      }),
      gate,
      route,
      publication,
    });

  if (candidate.status !== 'CANDIDATE' || candidate.value === null)
    return Object.freeze({
      mode: input.mode,
      eligible: input.eligible,
      sameRoute: input.sameRoute,
      reason: 'NO_CANDIDATE' as const,
      profileChanged: false,
      candidate: null,
      versionId: null,
      delta: null,
      evidence: Object.freeze({
        status: evidence.status,
        distinctEpisodes: evidence.distinctEpisodes,
        quality: evidence.quality,
      }),
      gate,
      route,
      publication,
    });

  const blended = blendProfileValue({
    key: 'desired_acceleration',
    oldValue: definition.default,
    evidence,
    episodes,
    candidate: candidateView,
  });
  const changed = blended.changed && blended.estimate !== null;
  const delta: CrossClassCandidateDelta | null = changed
    ? Object.freeze({
        key: 'desired_acceleration',
        previousValue: blended.previousValue,
        estimate: blended.estimate!,
        newValue: blended.value,
        learningWeight: blended.learningWeight,
        resolution: blended.resolution,
        evidenceState: blended.update.evidenceState,
        effectiveEpisodeCount: blended.update.effectiveEpisodeCount,
        published: false as const,
        learned: false as const,
      })
    : null;
  return Object.freeze({
    mode: input.mode,
    eligible: input.eligible,
    sameRoute: input.sameRoute,
    reason: changed ? ('LEARNING_ACCEPTED' as const) : ('NO_PROFILE_CHANGE' as const),
    profileChanged: changed,
    candidate: changed
      ? Object.freeze({
          key: 'desired_acceleration',
          status: candidate.status,
          value: candidate.value,
          reason: candidate.reason,
        })
      : null,
    versionId: changed ? `candidate-106-desired_acceleration-${input.routeId ?? ROUTE_ID}` : null,
    delta,
    evidence: Object.freeze({
      status: evidence.status,
      distinctEpisodes: evidence.distinctEpisodes,
      quality: evidence.quality,
    }),
    gate,
    route,
    publication,
  });
}

/**
 * Runs the frozen 106 report. The default run uses the real 089 normalization and the real 094/095
 * estimators; an injected port or profile override exists only to prove that the harness detects a
 * deliberate failure. No profile is published and no store or fleet is mutated.
 */
export function evaluateCrossClassFidelity(
  options: CrossClassFidelityOptions = {},
): CrossClassFidelityReport {
  const ports: CrossClassFidelityPorts = Object.freeze({
    ...realCrossClassFidelityPorts,
    ...(options.ports ?? {}),
  });
  const runs: CrossClassStyleRun[] = [];
  for (const style of crossClassStyleIds)
    for (const classId of crossClassIds) runs.push(createStyleRun(style, classId, ports));
  const trend = buildTrend(runs);
  const commonProfiles = Object.freeze(
    crossClassStyleIds.map((style) =>
      buildCommonProfile(style, runs, options.commonProfileOverrides ?? {}),
    ),
  );
  const mechanicalCopied = commonProfiles.some((profile) => profile.mechanicalCopied);
  const manual = evaluateModeFidelity(
    { mode: 'MANUAL', eligible: false, sameRoute: true },
    { ports },
  );
  const learningEligible = evaluateModeFidelity(
    { mode: 'LEARNING', eligible: true, sameRoute: true },
    { ports },
  );
  const learningIneligible = evaluateModeFidelity(
    { mode: 'LEARNING', eligible: false, sameRoute: true },
    { ports },
  );
  const routeIdentical =
    JSON.stringify(manual.route) === JSON.stringify(learningEligible.route) &&
    JSON.stringify(manual.route) === JSON.stringify(learningIneligible.route);
  const unrepresentable = buildUnrepresentable();
  const hazard = unrepresentable.find((entry) => entry.behaviour === 'HAZARD_AVOIDANCE');
  if (!hazard) throw new Error('106 missing the out-of-scope hazard manoeuvre');
  const outOfScopeManoeuvre = Object.freeze({
    ...hazard,
    manoeuvre: 'EVASIVE_SWERVE_AROUND_HAZARD',
    description:
      'An out-of-scope evasive swerve around a stopped hazard: the route state is measurable, but no learning key or preference estimate is fabricated for it.',
  });
  const trendPreserved = trend.every((row) => row.orderPreserved);
  const normalizedAgreement = trend.every((row) => row.normalizedAgreement);
  const commonProfileSameAcrossKinds = commonProfiles.every(
    (profile) => profile.sameAcrossDriverKinds,
  );
  const commonProfileNoClassOverrides = commonProfiles.every((profile) =>
    profile.fleetApplication.every(
      (application) => application.classSpecificOverrides.length === 0,
    ),
  );
  const manualNoLearning =
    !manual.profileChanged &&
    manual.candidate === null &&
    manual.versionId === null &&
    manual.delta === null &&
    manual.reason === 'MANUAL_NO_LEARNING' &&
    manual.gate.status === 'REJECTED';
  const learningEligibleChanged =
    learningEligible.profileChanged &&
    learningEligible.candidate !== null &&
    learningEligible.versionId !== null &&
    learningEligible.delta !== null &&
    learningEligible.gate.status === 'VALID' &&
    learningEligible.evidence?.status === 'READY';
  const learningIneligibleUnchanged =
    !learningIneligible.profileChanged &&
    learningIneligible.candidate === null &&
    learningIneligible.versionId === null &&
    learningIneligible.delta === null &&
    learningIneligible.reason === 'INELIGIBLE' &&
    learningIneligible.gate.status === 'REJECTED';
  const unrepresentableReported =
    unrepresentable.length === unrepresentableBehaviourIds.length &&
    unrepresentable.every(
      (entry) =>
        entry.result === 'UNREPRESENTABLE' &&
        entry.estimate === null &&
        entry.key === null &&
        entry.value === null &&
        entry.reason.length > 0,
    ) &&
    outOfScopeManoeuvre.result === 'UNREPRESENTABLE' &&
    outOfScopeManoeuvre.estimate === null;
  const manualMatchesActualGate =
    manual.gate.status === 'REJECTED' && manual.gate.reason === 'MANUAL_SEGMENT_NOT_LEARNABLE';
  const learningEligibleMatchesActualGate = learningEligible.gate.status === 'VALID';
  const learningIneligibleMatchesActualGate =
    learningIneligible.gate.status === 'REJECTED' &&
    learningIneligible.gate.reason === 'SEGMENT_INELIGIBLE';
  const overall = Object.freeze({
    styles: crossClassStyleIds.length,
    classes: crossClassIds.length,
    keys: crossClassKeys.length,
    runs: runs.length,
    keyRows: runs.length * crossClassKeys.length,
    trendPreserved,
    normalizedAgreement,
    mechanicalCopied,
    commonProfileSameAcrossKinds,
    commonProfileNoClassOverrides,
    manualNoLearning,
    learningEligibleChanged,
    learningIneligibleUnchanged,
    sameRoute: routeIdentical,
    unrepresentableReported,
    storeWrites: 0 as const,
    fleetMutations: 0 as const,
    profilePublications: 0 as const,
    pass:
      trendPreserved &&
      normalizedAgreement &&
      !mechanicalCopied &&
      commonProfileSameAcrossKinds &&
      commonProfileNoClassOverrides &&
      manualNoLearning &&
      learningEligibleChanged &&
      learningIneligibleUnchanged &&
      routeIdentical &&
      unrepresentableReported &&
      manualMatchesActualGate &&
      learningEligibleMatchesActualGate &&
      learningIneligibleMatchesActualGate,
  });
  return Object.freeze({
    version: CROSS_CLASS_FIDELITY_VERSION,
    rootSeed: CROSS_CLASS_FIDELITY_ROOT_SEED,
    tickHz: CROSS_CLASS_FIDELITY_TICK_HZ,
    contract: Object.freeze({
      classes: Object.freeze([...crossClassIds]),
      styles: Object.freeze([...crossClassStyleIds]),
      styleSources: crossClassStyleSources,
      scenarios: Object.freeze([...crossClassScenarioIds]),
      keys: Object.freeze([...crossClassKeys]),
      trendKeys: crossClassTrendKeys,
      tolerances: crossClassTolerances,
      unrepresentableBehaviours: Object.freeze([...unrepresentableBehaviourIds]),
      referenceClass: 'sedan' as const,
      toleranceSource: INVERSE_LEARNING_VERSION,
    }),
    classes: Object.freeze(
      crossClassIds.map((classId) =>
        Object.freeze({ classId, capability: crossClassCapability(classId) }),
      ),
    ),
    runs: Object.freeze(runs),
    trend,
    trendPreserved,
    normalizedAgreement,
    commonProfiles,
    mechanicalCopied,
    mechanicalCopyCode: mechanicalCopied ? MECHANICAL_CAPABILITY_COPY_CODE : null,
    modeFidelity: Object.freeze({
      manual,
      learningEligible,
      learningIneligible,
      routeIdentical,
      manualMatchesActualGate,
      learningEligibleMatchesActualGate,
      learningIneligibleMatchesActualGate,
    }),
    unrepresentable,
    outOfScopeManoeuvre,
    overall,
  });
}

/** Documents the 089/095 invariant explicitly for a reader of the report. */
export const CROSS_CLASS_NORMALIZATION_NOTE = Object.freeze({
  version: NORMALIZATION_VERSION,
  demandPercentile: 0.9,
  formula:
    'accelFraction = max(0, a_long) / maxAccelerationMps2; decelFraction = max(0, -a_long) / maxDecelerationMps2; latFraction = |a_lat| / maxLateralAccelerationMps2',
  referenceClass: 'sedan',
  note: 'Raw SI demand is class-specific; the normalized fractions are the style. 095 maps longitudinal demand onto the sedan reference, while 094 reports the curve candidate with the observed class ceiling, which is why only curve_lateral_accel carries the wider 106 tolerance.',
} as const);

/** Re-exported telemetry versions keep the report traceable to the real owners. */
export const CROSS_CLASS_TELEMETRY_VERSIONS = Object.freeze({
  eligibility: ELIGIBILITY_VERSION,
  normalization: NORMALIZATION_VERSION,
  opportunity: OPPORTUNITY_VERSION,
} as const);
