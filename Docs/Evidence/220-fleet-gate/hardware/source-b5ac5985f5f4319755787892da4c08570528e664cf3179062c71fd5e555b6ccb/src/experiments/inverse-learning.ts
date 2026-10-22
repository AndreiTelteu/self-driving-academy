import {
  createParameterEvidenceLedger,
  estimateAccelerationParameters,
  estimateFollowingParameters,
  estimateLaneChangeParameters,
  estimateSignalParameters,
  estimateSpeedParameters,
  estimateStopYieldParameters,
  parameterEvidenceSpecs,
} from '../learning';
import type {
  AccelerationEstimatorObservation,
  FollowingEstimatorObservation,
  LaneEstimatorObservation,
  ParameterEvidenceReadModel,
  SignalEstimatorObservation,
  SpeedEstimatorObservation,
  StopYieldEstimatorObservation,
} from '../learning';
import type { ParameterKey } from '../profiles';
import { deriveScenarioSeed, randomUnit } from '../sessions';
import {
  ELIGIBILITY_VERSION,
  NORMALIZATION_VERSION,
  OPPORTUNITY_VERSION,
  opportunitySuccessOutcomes,
} from '../telemetry';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  IntentionalVehicleNormalization,
  OpportunityDenominators,
  OpportunityKind,
  OpportunityOutcome,
  OpportunityRecord,
  PreferenceEvidenceRecord,
} from '../telemetry';
import { VEHICLE_CLASSES, VEHICLE_CLASS_VERSION } from '../vehicles';
import type { VehicleClassId } from '../vehicles';

/**
 * 105 inverse validation: known profiles are demonstrated through the real 094–099 estimators on
 * independent scenario streams, then every M key is compared with an explicit per-key tolerance.
 * This module is an offline harness: it has no profile, store, publication or ledger-write path.
 */
export const INVERSE_LEARNING_VERSION = '105-inverse-learning-v1' as const;
export const INVERSE_LEARNING_ROOT_SEED = 105_000 as const;
export const INVERSE_LEARNING_TICK_HZ = 60 as const;

export const inverseProfileIds = ['PRUDENT', 'IMPULSIVE', 'RECKLESS', 'MIXED'] as const;
export type InverseProfileId = (typeof inverseProfileIds)[number];

export const inverseScenarioIds = [
  'FREE_FLOW',
  'FOLLOWING',
  'LONGITUDINAL',
  'SIGNALIZED',
  'STOP_YIELD',
  'LANE_CHANGE',
] as const;
export type InverseScenarioId = (typeof inverseScenarioIds)[number];

export type InverseDemonstrationVariant = 'PROFILE' | 'SPARSE' | 'CONTRADICTORY';
export type InverseEstimatorOwner = '094' | '095' | '096' | '097' | '098' | '099';

export type InverseEvaluationStatus =
  'WITHIN_TOLERANCE' | 'OUTSIDE_TOLERANCE' | 'NOT_IDENTIFIABLE' | 'NO_ESTIMATE';

export interface KnownProfileTarget {
  readonly key: ParameterKey;
  readonly value: number;
}

export interface KnownProfile {
  readonly profileId: InverseProfileId;
  readonly description: string;
  readonly targets: readonly KnownProfileTarget[];
}

/** Explicit targets for the 24 `initial_learning_target` keys. R/extension keys are excluded. */
export const knownProfiles: readonly KnownProfile[] = Object.freeze([
  Object.freeze({
    profileId: 'PRUDENT',
    description: 'Cautious, early braking and long following distance.',
    targets: Object.freeze([
      { key: 'speed_delta_urban', value: -2 },
      { key: 'speed_delta_residential', value: -1.5 },
      { key: 'curve_lateral_accel', value: 1.8 },
      { key: 'intersection_approach_speed', value: 7.5 },
      { key: 'desired_acceleration', value: 1.2 },
      { key: 'comfort_deceleration', value: 2.2 },
      { key: 'acceleration_jerk', value: 1.5 },
      { key: 'brake_reaction_delay', value: 0.45 },
      { key: 'following_time_headway', value: 2.4 },
      { key: 'following_min_gap', value: 4 },
      { key: 'queue_standstill_gap', value: 2.5 },
      { key: 'following_speed_gain', value: 0.5 },
      { key: 'red_stop_probability', value: 1 },
      { key: 'green_start_delay', value: 0.9 },
      { key: 'red_stop_line_offset', value: 1.2 },
      { key: 'late_red_brake_threshold', value: 2.6 },
      { key: 'stop_full_probability', value: 1 },
      { key: 'stop_dwell_time', value: 1.4 },
      { key: 'stop_line_offset', value: 1.1 },
      { key: 'yield_time_gap', value: 4.5 },
      { key: 'lane_change_front_gap', value: 18 },
      { key: 'lane_change_back_gap', value: 16 },
      { key: 'lane_change_speed_gain', value: 2.5 },
      { key: 'lane_change_cooldown', value: 8 },
    ] as const),
  }),
  Object.freeze({
    profileId: 'IMPULSIVE',
    description: 'Impatient but not reckless: quick starts, short gaps, occasional rolling stop.',
    targets: Object.freeze([
      { key: 'speed_delta_urban', value: 3.5 },
      { key: 'speed_delta_residential', value: 2.5 },
      { key: 'curve_lateral_accel', value: 3.6 },
      { key: 'intersection_approach_speed', value: 11 },
      { key: 'desired_acceleration', value: 2.8 },
      { key: 'comfort_deceleration', value: 3.4 },
      { key: 'acceleration_jerk', value: 3.8 },
      { key: 'brake_reaction_delay', value: 0.25 },
      { key: 'following_time_headway', value: 1.1 },
      { key: 'following_min_gap', value: 2 },
      { key: 'queue_standstill_gap', value: 1.4 },
      { key: 'following_speed_gain', value: 1.1 },
      { key: 'red_stop_probability', value: 0.75 },
      { key: 'green_start_delay', value: 0.35 },
      { key: 'red_stop_line_offset', value: 0.6 },
      { key: 'late_red_brake_threshold', value: 1.4 },
      { key: 'stop_full_probability', value: 0.6 },
      { key: 'stop_dwell_time', value: 0.5 },
      { key: 'stop_line_offset', value: 0.8 },
      { key: 'yield_time_gap', value: 2.6 },
      { key: 'lane_change_front_gap', value: 9 },
      { key: 'lane_change_back_gap', value: 7 },
      { key: 'lane_change_speed_gain', value: 4.5 },
      { key: 'lane_change_cooldown', value: 3.5 },
    ] as const),
  }),
  Object.freeze({
    profileId: 'RECKLESS',
    description: 'High speed, late braking, very short following and frequent violations.',
    targets: Object.freeze([
      { key: 'speed_delta_urban', value: 9 },
      { key: 'speed_delta_residential', value: 6 },
      { key: 'curve_lateral_accel', value: 6.5 },
      { key: 'intersection_approach_speed', value: 16 },
      { key: 'desired_acceleration', value: 4.5 },
      { key: 'comfort_deceleration', value: 5.5 },
      { key: 'acceleration_jerk', value: 7 },
      { key: 'brake_reaction_delay', value: 0.15 },
      { key: 'following_time_headway', value: 0.6 },
      { key: 'following_min_gap', value: 1 },
      { key: 'queue_standstill_gap', value: 0.7 },
      { key: 'following_speed_gain', value: 1.7 },
      { key: 'red_stop_probability', value: 0.35 },
      { key: 'green_start_delay', value: 0.15 },
      { key: 'red_stop_line_offset', value: 0.3 },
      { key: 'late_red_brake_threshold', value: 0.8 },
      { key: 'stop_full_probability', value: 0.2 },
      { key: 'stop_dwell_time', value: 0.2 },
      { key: 'stop_line_offset', value: 0.4 },
      { key: 'yield_time_gap', value: 1.3 },
      { key: 'lane_change_front_gap', value: 4 },
      { key: 'lane_change_back_gap', value: 3 },
      { key: 'lane_change_speed_gain', value: 7.5 },
      { key: 'lane_change_cooldown', value: 1.5 },
    ] as const),
  }),
  Object.freeze({
    profileId: 'MIXED',
    description: 'Inconsistent driver: prudent speed, impatient following and mixed signals.',
    targets: Object.freeze([
      { key: 'speed_delta_urban', value: 1.5 },
      { key: 'speed_delta_residential', value: -0.5 },
      { key: 'curve_lateral_accel', value: 3 },
      { key: 'intersection_approach_speed', value: 9 },
      { key: 'desired_acceleration', value: 2 },
      { key: 'comfort_deceleration', value: 2.9 },
      { key: 'acceleration_jerk', value: 2.6 },
      { key: 'brake_reaction_delay', value: 0.35 },
      { key: 'following_time_headway', value: 1.6 },
      { key: 'following_min_gap', value: 2.8 },
      { key: 'queue_standstill_gap', value: 1.8 },
      { key: 'following_speed_gain', value: 0.8 },
      { key: 'red_stop_probability', value: 0.85 },
      { key: 'green_start_delay', value: 0.5 },
      { key: 'red_stop_line_offset', value: 0.9 },
      { key: 'late_red_brake_threshold', value: 2 },
      { key: 'stop_full_probability', value: 0.85 },
      { key: 'stop_dwell_time', value: 0.9 },
      { key: 'stop_line_offset', value: 0.9 },
      { key: 'yield_time_gap', value: 3.4 },
      { key: 'lane_change_front_gap', value: 12 },
      { key: 'lane_change_back_gap', value: 9.5 },
      { key: 'lane_change_speed_gain', value: 3.2 },
      { key: 'lane_change_cooldown', value: 5 },
    ] as const),
  }),
]);

export interface KeyTolerance {
  readonly key: ParameterKey;
  readonly context: string;
  readonly absoluteTolerance: number;
  readonly relativeTolerance: number;
  readonly justifiedBy: string;
}

/**
 * One documented tolerance per M key. The effective bound is
 * `absolute + relative × |target|`: an absolute floor for sampling/quantization plus a proportional
 * allowance for spread that grows with the magnitude of the target. No key shares a default value.
 */
export const inverseTolerances: readonly KeyTolerance[] = Object.freeze([
  {
    key: 'speed_delta_urban',
    context: 'FREE_TRAFFIC urban median of (speed − posted limit) over ≥10 s',
    absoluteTolerance: 0.2,
    relativeTolerance: 0.05,
    justifiedBy:
      'Speed samples are quantized per 20 Hz frame and the median absorbs free-flow spread; 0.2 m/s covers the posting-limit rounding (0.1 m/s) plus the ±0.04 m/s seeded sample noise, and 5% covers higher urban limits.',
  },
  {
    key: 'speed_delta_residential',
    context: 'FREE_TRAFFIC residential median of (speed − posted limit) over ≥10 s',
    absoluteTolerance: 0.2,
    relativeTolerance: 0.05,
    justifiedBy:
      'Residential limits are lower, so the same 0.2 m/s posting/quantization floor dominates; the relative part stays at 5% because the estimator uses the same median over a 10 s window.',
  },
  {
    key: 'curve_lateral_accel',
    context: 'FREE_TRAFFIC curve: intentional 089 lateral demand × class lateral ceiling',
    absoluteTolerance: 0.25,
    relativeTolerance: 0.08,
    justifiedBy:
      'The value is reconstructed from p90 class-normalized lateral demand times the 023 sedan ceiling (grip 1.3 × 9.81 m/s²), so the demand percentile and the ceiling rounding dominate; 8% covers demand variation across curve radii.',
  },
  {
    key: 'intersection_approach_speed',
    context: 'FREE_TRAFFIC explicitly marked approach median speed',
    absoluteTolerance: 0.4,
    relativeTolerance: 0.03,
    justifiedBy:
      'An approach window contains deceleration, so the median is a spread statistic rather than a single cruise value; 0.4 m/s covers the approach profile spread and 3% covers faster arterials.',
  },
  {
    key: 'desired_acceleration',
    context: 'FREE_TRAFFIC complete intentional 089 acceleration demand × sedan force/mass',
    absoluteTolerance: 0.15,
    relativeTolerance: 0.05,
    justifiedBy:
      'Demand is a dimensionless p90 fraction mapped to the sedan reference ceiling (6500 N / 1400 kg ≈ 4.643 m/s²); 0.15 m/s² covers the trimmed p50 and the class-capability rounding, 5% covers the demand spread.',
  },
  {
    key: 'comfort_deceleration',
    context: 'FREE_TRAFFIC complete intentional 089 deceleration demand × sedan brake ceiling',
    absoluteTolerance: 0.2,
    relativeTolerance: 0.05,
    justifiedBy:
      'The deceleration ceiling is 8 m/s², so one demand percentage point is 0.08 m/s²; 0.2 m/s² covers the trimmed p50 plus the p90-to-p50 difference and 5% covers stronger braking.',
  },
  {
    key: 'acceleration_jerk',
    context: 'FREE_TRAFFIC tick-to-tick |SI jerk| samples, trimmed p50',
    absoluteTolerance: 0.3,
    relativeTolerance: 0.1,
    justifiedBy:
      'Jerk is differenced at the fixed 60 Hz tick, so a single-frame acceleration change is amplified; 0.3 m/s³ covers the 1/60 s differencing noise and 10% covers the outer-tail trimming of the p50.',
  },
  {
    key: 'brake_reaction_delay',
    context: 'observable stimulus, reactionDurationTicks / 60',
    absoluteTolerance: 0.02,
    relativeTolerance: 0.02,
    justifiedBy:
      'The reaction is an integer tick count divided by 60, so one tick is 0.0167 s; the 0.02 s absolute floor is exactly that quantization and 2% keeps the bound proportional for longer reactions.',
  },
  {
    key: 'following_time_headway',
    context: 'LEADER moving episodes fitted as gap = minGap + headway × speed',
    absoluteTolerance: 0.08,
    relativeTolerance: 0.03,
    justifiedBy:
      'The OLS slope divides gap quantization (0.01 m seeded noise) by the ego-speed spread (≥15 m/s), giving ~0.001 s; 0.08 s covers gap measurement and lateral offset in the fitted line, 3% covers headway spread.',
  },
  {
    key: 'following_min_gap',
    context: 'LEADER moving episodes, OLS intercept at zero speed',
    absoluteTolerance: 0.15,
    relativeTolerance: 0.03,
    justifiedBy:
      'The intercept is the fitted gap at 0 m/s, which extrapolates from the lowest observed speed; 0.15 m covers that extrapolation plus the RMS residual rounding and 3% covers larger gaps.',
  },
  {
    key: 'queue_standstill_gap',
    context: 'LEADER QUEUE_STANDSTILL episodes with both speeds ≤ 0.1 m/s',
    absoluteTolerance: 0.15,
    relativeTolerance: 0.03,
    justifiedBy:
      'The queue value is the arithmetic mean of measured standstill gaps, so the 0.01 m seeded measurement noise and the 0.1 m/s stop qualification define a 0.15 m floor; 3% covers longer vehicles.',
  },
  {
    key: 'following_speed_gain',
    context: 'LEADER moving episodes with a separately observed speedGain',
    absoluteTolerance: 0.05,
    relativeTolerance: 0.03,
    justifiedBy:
      'Speed gain is a mean of observed per-episode ratios in 1/s, not a fit coefficient; 0.05 covers the per-episode observation rounding and 3% covers gains above 1/s.',
  },
  {
    key: 'red_stop_probability',
    context: 'certain RED opportunities, compliant HELD / certain denominator',
    absoluteTolerance: 0.03,
    relativeTolerance: 0.02,
    justifiedBy:
      'The value is a ratio over a certain opportunity count, so its granularity is 1/N; 0.03 is smaller than one count at the fixture denominators (N ≥ 15) and 2% covers stricter fixtures, not a statistical confidence interval.',
  },
  {
    key: 'green_start_delay',
    context: 'unblocked GREEN departures, (departureTick − onsetTick) / 60',
    absoluteTolerance: 0.02,
    relativeTolerance: 0.03,
    justifiedBy:
      'Onset and departure are integer ticks at 60 Hz, so the mean carries a 0.0167 s quantization; 0.02 s is that floor and 3% covers fixtures with few departures.',
  },
  {
    key: 'red_stop_line_offset',
    context: 'certain RED opportunities, mean measured stopLineOffsetM',
    absoluteTolerance: 0.1,
    relativeTolerance: 0.03,
    justifiedBy:
      'The stop-line offset is the mean of metre measurements rounded to 0.05 m; 0.1 m is two rounding steps and 3% covers larger offsets.',
  },
  {
    key: 'late_red_brake_threshold',
    context: 'certain RED opportunities, mean brakeThresholdMps2',
    absoluteTolerance: 0.05,
    relativeTolerance: 0.04,
    justifiedBy:
      'The threshold is a mean of deceleration measurements rounded to 0.05 m/s²; 0.05 is exactly one rounding step and 4% covers thresholds near the 6 m/s² upper bound.',
  },
  {
    key: 'stop_full_probability',
    context: 'certain FREE_TRAFFIC STOP_LINE facts, full stops / certain denominator',
    absoluteTolerance: 0.03,
    relativeTolerance: 0.02,
    justifiedBy:
      'A full-stop ratio shares the 1/N opportunity granularity; 0.03 is below one count at N ≥ 15 and 2% covers the stricter 1/20 fixtures, without inventing a binomial interval.',
  },
  {
    key: 'stop_dwell_time',
    context: 'measured dwellTicks of full STOP_LINE stops / 60',
    absoluteTolerance: 0.02,
    relativeTolerance: 0.03,
    justifiedBy:
      'Dwell is measured in whole ticks at 60 Hz, so the mean has a 0.0167 s quantization; 0.02 s is that floor and 3% covers dwell times above 1 s.',
  },
  {
    key: 'stop_line_offset',
    context: 'certain FREE_TRAFFIC STOP_LINE facts, mean measured offset',
    absoluteTolerance: 0.1,
    relativeTolerance: 0.03,
    justifiedBy:
      'Same metre measurement as the RED offset but taken at a STOP line; 0.1 m covers two 0.05 m rounding steps and 3% covers offsets of several metres.',
  },
  {
    key: 'yield_time_gap',
    context: 'YIELD interval [max refused, min accepted] of signed 052 separations',
    absoluteTolerance: 0.15,
    relativeTolerance: 0.05,
    justifiedBy:
      'Only opposed YIELDED/PROCEEDED facts identify the threshold, and the result is an interval whose endpoints are measured separations; 0.15 s pads the interval-edge rounding and 5% covers wider separations.',
  },
  {
    key: 'lane_change_front_gap',
    context: 'optional LANE_CHANGE interval [max rejected, min completed] front gap',
    absoluteTolerance: 0.3,
    relativeTolerance: 0.04,
    justifiedBy:
      'The front gap is measured at the manoeuvre and only an accepted/rejected interval identifies the threshold; 0.3 m covers the gap measurement rounding and 4% covers gaps of tens of metres.',
  },
  {
    key: 'lane_change_back_gap',
    context: 'optional LANE_CHANGE interval [max rejected, min completed] back gap',
    absoluteTolerance: 0.3,
    relativeTolerance: 0.04,
    justifiedBy:
      'The back gap uses the same manoeuvre-time measurement as the front gap but a different reference vehicle; 0.3 m covers its own rounding and 4% covers the larger gaps.',
  },
  {
    key: 'lane_change_speed_gain',
    context: 'optional LANE_CHANGE interval of observed speedAdvantageMps',
    absoluteTolerance: 0.15,
    relativeTolerance: 0.05,
    justifiedBy:
      'The advantage is a speed difference in m/s recorded per optional manoeuvre; 0.15 m/s covers the difference rounding and 5% covers advantages near 10 m/s.',
  },
  {
    key: 'lane_change_cooldown',
    context: 'optional completed manoeuvres, mean cooldownTicks / 60',
    absoluteTolerance: 0.05,
    relativeTolerance: 0.03,
    justifiedBy:
      'The cooldown is a measured tick interval divided by 60; 0.05 s allows for manoeuvre-boundary tick assignment and 3% covers long cooldowns up to 30 s.',
  },
]);

export interface KeyIdentifiabilityRule {
  readonly key: ParameterKey;
  readonly minimumEpisodes: number;
  readonly requiresVariedSpeeds: boolean;
  /** The key needs accepted and rejected observations, not a one-sided observed bound. */
  readonly requiresOpposedOutcomes: boolean;
  readonly rule: string;
}

export const inverseIdentifiabilityRules: readonly KeyIdentifiabilityRule[] = Object.freeze(
  parameterEvidenceSpecs.map((spec) =>
    Object.freeze({
      key: spec.key,
      minimumEpisodes: spec.minimumEpisodes,
      requiresVariedSpeeds: spec.requiresVariedSpeeds,
      requiresOpposedOutcomes:
        spec.key === 'yield_time_gap' ||
        spec.key === 'lane_change_front_gap' ||
        spec.key === 'lane_change_back_gap' ||
        spec.key === 'lane_change_speed_gain',
      rule:
        spec.key === 'following_time_headway' || spec.key === 'following_min_gap'
          ? 'Identified only by ≥3 LEADER episodes spanning ≥2 speed bands; one speed leaves an unidentified intercept and slope.'
          : spec.key === 'yield_time_gap' ||
              spec.key === 'lane_change_front_gap' ||
              spec.key === 'lane_change_back_gap' ||
              spec.key === 'lane_change_speed_gain'
            ? `Needs ≥${spec.minimumEpisodes} facts with both accepted and rejected outcomes; successes alone give only an observed bound, not a threshold.`
            : `Needs ≥${spec.minimumEpisodes} qualifying episode(s) in ${spec.contexts.join('/')}; otherwise the key stays unobserved instead of receiving a default.`,
    }),
  ),
);

export type InverseObservationSet = Readonly<{
  speed: readonly SpeedEstimatorObservation[];
  following: readonly FollowingEstimatorObservation[];
  acceleration: readonly AccelerationEstimatorObservation[];
  signal: readonly SignalEstimatorObservation[];
  stopYield: readonly StopYieldEstimatorObservation[];
  lane: readonly LaneEstimatorObservation[];
}>;

export interface InverseDemonstration {
  readonly version: typeof INVERSE_LEARNING_VERSION;
  readonly profileId: InverseProfileId;
  readonly scenarioId: InverseScenarioId;
  readonly variant: InverseDemonstrationVariant;
  readonly seed: number;
  readonly owner: InverseEstimatorOwner;
  readonly contributingKeys: readonly ParameterKey[];
  readonly evidence: readonly ParameterEvidenceReadModel[];
  readonly denominators: OpportunityDenominators;
  readonly observations: InverseObservationSet;
}

export interface InverseLearningPorts {
  readonly speed: typeof estimateSpeedParameters;
  readonly following: typeof estimateFollowingParameters;
  readonly acceleration: typeof estimateAccelerationParameters;
  readonly signal: typeof estimateSignalParameters;
  readonly stopYield: typeof estimateStopYieldParameters;
  readonly lane: typeof estimateLaneChangeParameters;
}

export const realInverseLearningPorts: InverseLearningPorts = Object.freeze({
  speed: estimateSpeedParameters,
  following: estimateFollowingParameters,
  acceleration: estimateAccelerationParameters,
  signal: estimateSignalParameters,
  stopYield: estimateStopYieldParameters,
  lane: estimateLaneChangeParameters,
});

export interface InverseEvidenceSummary {
  readonly status: string;
  readonly distinctEpisodes: number;
  readonly sampleCount: number;
  readonly contexts: readonly string[];
}

export interface InverseKeyResult {
  readonly key: ParameterKey;
  readonly scenarioId: string;
  readonly scenarioIds: readonly InverseScenarioId[];
  readonly target: number;
  readonly estimate: number | null;
  readonly interval: readonly [number, number] | null;
  readonly error: number | null;
  readonly absoluteError: number | null;
  readonly tolerance: Readonly<{ absolute: number; relative: number; effective: number }>;
  readonly status: InverseEvaluationStatus;
  readonly identifiable: boolean;
  readonly estimatorStatus: string;
  readonly estimatorReason: string | null;
  readonly reason: string;
  readonly evidence: InverseEvidenceSummary;
  readonly context: string;
}

export interface InverseScenarioSummary {
  readonly scenarioId: string;
  readonly kind: 'PROFILE' | 'PROBE';
  readonly probe: 'SPARSE_EVIDENCE' | 'CONTRADICTORY_EVIDENCE' | 'OUT_OF_TOLERANCE' | null;
  readonly profileId: InverseProfileId;
  readonly expectedFailure: boolean;
  readonly keys: number;
  readonly withinTolerance: number;
  readonly outsideTolerance: number;
  readonly notIdentifiable: number;
  readonly noEstimate: number;
  readonly passed: boolean;
  readonly retainedFailures: readonly string[];
}

export interface InverseScenarioResult extends InverseScenarioSummary {
  readonly demonstrationSeeds: readonly number[];
  readonly results: readonly InverseKeyResult[];
}

export interface InverseLearningReport {
  readonly version: typeof INVERSE_LEARNING_VERSION;
  readonly rootSeed: number;
  readonly tickHz: number;
  readonly contract: Readonly<{
    profiles: readonly InverseProfileId[];
    demonstrationScenarios: readonly InverseScenarioId[];
    evaluationStatuses: readonly InverseEvaluationStatus[];
    keys: readonly ParameterKey[];
    identifiableKeys: number;
    unidentifiableRuleCount: number;
  }>;
  readonly scenarios: readonly InverseScenarioResult[];
  readonly overall: Readonly<{
    keysEvaluated: number;
    withinTolerance: number;
    outsideTolerance: number;
    notIdentifiable: number;
    noEstimate: number;
    profileFailures: number;
    retainedProbeFailures: number;
    pass: boolean;
  }>;
}

const M_KEYS: readonly ParameterKey[] = Object.freeze(
  parameterEvidenceSpecs.map((spec) => spec.key),
);
const specsByOwner = new Map<InverseEstimatorOwner, readonly ParameterKey[]>();
for (const owner of ['094', '095', '096', '097', '098', '099'] as const) {
  specsByOwner.set(
    owner,
    Object.freeze(
      parameterEvidenceSpecs
        .filter((spec) => spec.estimatorOwner === owner)
        .map((spec) => spec.key),
    ),
  );
}
const specByKey = new Map(parameterEvidenceSpecs.map((spec) => [spec.key, spec]));
const toleranceByKey = new Map(inverseTolerances.map((entry) => [entry.key, entry]));
const ruleByKey = new Map(inverseIdentifiabilityRules.map((entry) => [entry.key, entry]));
const targetByProfile = new Map<InverseProfileId, Map<ParameterKey, number>>();
for (const profile of knownProfiles) {
  const targets = new Map<ParameterKey, number>();
  for (const entry of profile.targets) {
    const spec = specByKey.get(entry.key);
    if (!spec) throw new Error(`105 target is not an M key: ${entry.key}`);
    if (!(entry.value >= spec.min && entry.value <= spec.max))
      throw new Error(`105 target outside the 092 range: ${profile.profileId}/${entry.key}`);
    if (targets.has(entry.key)) throw new Error(`105 duplicate target key: ${entry.key}`);
    targets.set(entry.key, entry.value);
  }
  if (targets.size !== M_KEYS.length || M_KEYS.some((key) => !targets.has(key)))
    throw new Error(`105 profile must declare exactly the 24 M keys: ${profile.profileId}`);
  targetByProfile.set(profile.profileId, targets);
}

export const scenarioOwners: Readonly<Record<InverseScenarioId, InverseEstimatorOwner>> =
  Object.freeze({
    FREE_FLOW: '094',
    FOLLOWING: '096',
    LONGITUDINAL: '095',
    SIGNALIZED: '097',
    STOP_YIELD: '098',
    LANE_CHANGE: '099',
  });

/** Identity carriers used by the synthetic 086/087/088 records; no gameplay object is touched. */
const SESSION_ID = 'session-105-inverse';
const WORLD_EPOCH = 1;
const VEHICLE_ID = 'taxi-105';
const INCARNATION = 'taxi-105-incarnation';
const SEGMENT_ID = 'segment-105';
const LEADER_ID = 'leader-105';
const QUEUE_LEADER_ID = 'leader-queue-105';

type LedgerOutcome = 'STOPPED' | 'CROSSED_WITHOUT_STOP' | 'HELD' | 'CROSSED';

interface LedgerFact {
  readonly roadType: string;
  readonly speedSamples?: readonly { readonly tick: number; readonly speedMps: number }[];
  readonly headway?: { readonly gapM: number; readonly speedMps: number };
  readonly stopOutcome?: LedgerOutcome;
  readonly greenStartDelayS?: number;
  readonly laneChangeOutcome?: 'COMPLETED' | 'ABORTED';
}

interface DemonstrationCore {
  readonly opportunity: OpportunityRecord;
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly ledger: LedgerFact;
}
type SpeedRow = SpeedEstimatorObservation & DemonstrationCore;
type FollowingRow = FollowingEstimatorObservation & DemonstrationCore;
type AccelerationRow = AccelerationEstimatorObservation & DemonstrationCore;
type SignalRow = SignalEstimatorObservation &
  DemonstrationCore & { readonly normalized?: IntentionalVehicleNormalization };
type StopYieldRow = StopYieldEstimatorObservation & DemonstrationCore;
type LaneRow = LaneEstimatorObservation & DemonstrationCore;
type AnyRow = SpeedRow | FollowingRow | AccelerationRow | SignalRow | StopYieldRow | LaneRow;

function windowContext(
  scenarioId: InverseScenarioId,
  index: number,
  kind: OpportunityKind,
  label: 'FREE_TRAFFIC' | 'LEADER',
  outcome: OpportunityOutcome,
  ticks = 900,
): DemonstrationCore {
  const id = `105-${scenarioId}-${index}`;
  const success = opportunitySuccessOutcomes.includes(outcome);
  const opportunity: OpportunityRecord = Object.freeze({
    id,
    kind,
    state: 'RESOLVED',
    outcome,
    result: success ? 'SUCCESS' : 'FAILURE',
    truncationReason: null,
    vehicleId: VEHICLE_ID,
    incarnation: INCARNATION,
    segmentIds: Object.freeze([SEGMENT_ID]),
    learningEligible: true,
    occurrence: 0,
    openedTick: 0,
    lastTick: ticks,
    resolvedTick: ticks,
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
  const windowClass = label === 'FREE_TRAFFIC' ? 'ELIGIBLE' : 'EXTERNAL_CONSTRAINT';
  const eligibility = Object.freeze({
    windowId: 'window-' + id,
    opportunityId: id,
    kind,
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: VEHICLE_ID,
    incarnation: INCARNATION,
    segmentId: SEGMENT_ID,
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 0,
    lastTick: ticks,
    observationCount: ticks,
    reaction: Object.freeze({ open: false as const, reason: 'SEGMENT_EXCLUDED' as const }),
    windowClass,
    label,
  }) as EligibilityWindowRecord;
  const artifacts = Object.freeze({
    windowId: 'window-' + id,
    sessionId: SESSION_ID,
    worldEpoch: WORLD_EPOCH,
    segmentId: SEGMENT_ID,
    vehicleId: VEHICLE_ID,
    incarnation: INCARNATION,
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: 0,
    endTick: ticks,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    artifacts: Object.freeze([]),
    artifactCount: 0,
    boundaryTick: null,
    boundaryCause: null,
    suppressed: null,
    openedTick: 0,
    lastTick: ticks,
    observationCount: ticks,
    windowClass: 'PREFIX_ELIGIBLE',
    prefix: Object.freeze({ fromTick: 0, toTick: ticks, ticks }),
  }) as FilteredWindowRecord;
  return Object.freeze({
    opportunity,
    eligibility,
    artifacts,
    ledger: Object.freeze({ roadType: 'urban' }),
  });
}

const SEDAN_CAPABILITY = Object.freeze({
  maxAccelerationMps2: VEHICLE_CLASSES.sedan.engineForceN / VEHICLE_CLASSES.sedan.massKg,
  maxDecelerationMps2: VEHICLE_CLASSES.sedan.brakeAcceleration,
  maxLateralAccelerationMps2: VEHICLE_CLASSES.sedan.grip * 9.81,
});

function normalizedWindow(
  core: DemonstrationCore,
  classId: VehicleClassId,
  demands: { acceleration: number; deceleration: number; lateral: number },
): IntentionalVehicleNormalization {
  const capability = SEDAN_CAPABILITY;
  const accelerationDemand = demands.acceleration / capability.maxAccelerationMps2;
  const decelerationDemand = demands.deceleration / capability.maxDecelerationMps2;
  const lateralDemand = demands.lateral / capability.maxLateralAccelerationMps2;
  return Object.freeze({
    version: NORMALIZATION_VERSION,
    featureId: `feature-${core.opportunity.id}`,
    windowId: core.eligibility.windowId,
    opportunityId: core.opportunity.id,
    kind: core.opportunity.kind,
    segmentId: SEGMENT_ID,
    vehicleId: VEHICLE_ID,
    incarnation: INCARNATION,
    classId,
    classVersion: VEHICLE_CLASS_VERSION,
    capability,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    eligibilityClass: 'ELIGIBLE',
    usableFromTick: 0,
    usableToTick: 900,
    usableTicks: 900,
    sampledTicks: 900,
    sampleCoverage: 1,
    saturationFraction: 0.98,
    minSaturatedTicks: 6,
    openedTick: 0,
    lastTick: 900,
    observationCount: 900,
    windowClass: 'NORMALIZED',
    demandStatus: 'INTENTIONAL',
    features: Object.freeze({
      accelerationDemand,
      decelerationDemand,
      lateralDemand,
      aggressiveness: Math.max(accelerationDemand, decelerationDemand, lateralDemand),
      aggressivenessIsLowerBound: false,
      demandPercentile: 0.9,
      raw: Object.freeze({
        longitudinalAccelerationMps2: demands.acceleration,
        longitudinalDecelerationMps2: demands.deceleration,
        lateralAccelerationMps2: demands.lateral,
      }),
      intent: Object.freeze({
        throttle: 0.4,
        brake: 0.2,
        steering: 0.1,
      }),
    }),
    capabilityMarks: Object.freeze([] as const),
  });
}

function noise(seed: number, key: string, index: number, amplitude: number): number {
  return (randomUnit(seed, key, index) * 2 - 1) * amplitude;
}

function round(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function speedSamples(
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

function speedRow(
  core: DemonstrationCore,
  options: {
    readonly roadKind: 'URBAN' | 'RESIDENTIAL' | 'OTHER';
    readonly postedLimitMps: number;
    readonly samples: readonly { readonly tick: number; readonly speedMps: number }[];
    readonly intersectionApproach: boolean;
    readonly curveRadiusM: number | null;
    readonly normalized: IntentionalVehicleNormalization | null;
    readonly roadType: string;
  },
): SpeedRow {
  return Object.freeze({
    ...core,
    ledger: Object.freeze({
      roadType: options.roadType,
      speedSamples: options.samples,
    }),
    roadKind: options.roadKind,
    postedLimitMps: options.postedLimitMps,
    speedSamples: options.samples,
    intersectionApproach: options.intersectionApproach,
    curveRadiusM: options.curveRadiusM,
    normalized: options.normalized,
  }) as SpeedRow;
}

function targetOf(profileId: InverseProfileId, key: ParameterKey): number {
  const value = targetByProfile.get(profileId)?.get(key);
  if (value === undefined) throw new Error(`Missing known-profile target: ${profileId}/${key}`);
  return value;
}

function freeFlowRows(seed: number, profileId: InverseProfileId): readonly SpeedRow[] {
  const rows: SpeedRow[] = [];
  let index = 0;
  for (let episode = 0; episode < 3; episode += 1) {
    const core = windowContext('FREE_FLOW', index++, 'GREEN', 'FREE_TRAFFIC', 'RELEASED');
    rows.push(
      speedRow(core, {
        roadKind: 'URBAN',
        postedLimitMps: 14,
        samples: speedSamples(
          seed,
          `urban-${episode}`,
          14 + targetOf(profileId, 'speed_delta_urban'),
          31,
          0.04,
        ),
        intersectionApproach: false,
        curveRadiusM: null,
        normalized: null,
        roadType: 'urban',
      }),
    );
  }
  for (let episode = 0; episode < 3; episode += 1) {
    const core = windowContext('FREE_FLOW', index++, 'GREEN', 'FREE_TRAFFIC', 'RELEASED');
    rows.push(
      speedRow(core, {
        roadKind: 'RESIDENTIAL',
        postedLimitMps: 8.5,
        samples: speedSamples(
          seed,
          `residential-${episode}`,
          8.5 + targetOf(profileId, 'speed_delta_residential'),
          31,
          0.04,
        ),
        intersectionApproach: false,
        curveRadiusM: null,
        normalized: null,
        roadType: 'residential',
      }),
    );
  }
  for (let episode = 0; episode < 3; episode += 1) {
    const core = windowContext('FREE_FLOW', index++, 'GREEN', 'FREE_TRAFFIC', 'RELEASED');
    rows.push(
      speedRow(core, {
        roadKind: 'OTHER',
        postedLimitMps: 12,
        samples: speedSamples(
          seed,
          `approach-${episode}`,
          targetOf(profileId, 'intersection_approach_speed'),
          31,
          0.15,
        ),
        intersectionApproach: true,
        curveRadiusM: null,
        normalized: null,
        roadType: 'other',
      }),
    );
  }
  for (let episode = 0; episode < 3; episode += 1) {
    const core = windowContext('FREE_FLOW', index++, 'GREEN', 'FREE_TRAFFIC', 'RELEASED');
    rows.push(
      speedRow(core, {
        roadKind: 'OTHER',
        postedLimitMps: 12,
        samples: Object.freeze([]),
        intersectionApproach: false,
        curveRadiusM: 42 + episode * 8,
        normalized: normalizedWindow(core, 'sedan', {
          acceleration: targetOf(profileId, 'desired_acceleration'),
          deceleration: targetOf(profileId, 'comfort_deceleration'),
          lateral: targetOf(profileId, 'curve_lateral_accel'),
        }),
        roadType: 'other',
      }),
    );
  }
  return Object.freeze(rows);
}

function followingRows(
  seed: number,
  profileId: InverseProfileId,
  variant: InverseDemonstrationVariant,
): readonly FollowingRow[] {
  const rows: FollowingRow[] = [];
  const headway = targetOf(profileId, 'following_time_headway');
  const minimumGap = targetOf(profileId, 'following_min_gap');
  const gain = targetOf(profileId, 'following_speed_gain');
  const queueGap = targetOf(profileId, 'queue_standstill_gap');
  const speeds = variant === 'SPARSE' ? [10, 10, 10] : [4.5, 9.5, 14.5, 19.5];
  const gaps =
    variant === 'CONTRADICTORY'
      ? [30, 4, 32, 3]
      : speeds.map(
          (speed, index) => minimumGap + headway * speed + noise(seed, 'gap', index, 0.03),
        );
  for (const [index, speed] of speeds.entries()) {
    const core = windowContext('FOLLOWING', index, 'GREEN', 'LEADER', 'RELEASED', 240);
    const gap = round(gaps[index]!, 6);
    rows.push(
      Object.freeze({
        ...core,
        ledger: Object.freeze({
          roadType: 'urban',
          headway: Object.freeze({ gapM: gap, speedMps: speed }),
        }),
        context: 'LEADER',
        gapM: gap,
        speedMps: speed,
        leaderId: LEADER_ID,
        leaderSpeedMps: speed + 0.2,
        speedGain: round(gain + noise(seed, 'gain', index, 0.01), 6),
      }) as FollowingRow,
    );
  }
  for (let index = 0; index < 3 && variant !== 'SPARSE'; index += 1) {
    const core = windowContext(
      'FOLLOWING',
      speeds.length + index,
      'STOP',
      'LEADER',
      'STOPPED',
      180,
    );
    const gap = round(queueGap + noise(seed, 'queue', index, 0.03), 6);
    rows.push(
      Object.freeze({
        ...core,
        ledger: Object.freeze({
          roadType: 'urban',
          headway: Object.freeze({ gapM: gap, speedMps: 0.05 }),
        }),
        context: 'QUEUE_STANDSTILL',
        gapM: gap,
        speedMps: 0.05,
        leaderId: QUEUE_LEADER_ID,
        leaderSpeedMps: 0.05,
      }) as FollowingRow,
    );
  }
  return Object.freeze(rows);
}

function longitudinalRows(seed: number, profileId: InverseProfileId): readonly AccelerationRow[] {
  const rows: AccelerationRow[] = [];
  const acceleration = targetOf(profileId, 'desired_acceleration');
  const deceleration = targetOf(profileId, 'comfort_deceleration');
  const jerk = targetOf(profileId, 'acceleration_jerk');
  const reaction = targetOf(profileId, 'brake_reaction_delay');
  for (let index = 0; index < 4; index += 1) {
    const core = windowContext('LONGITUDINAL', index, 'GREEN', 'FREE_TRAFFIC', 'RELEASED');
    const normalized = normalizedWindow(core, 'sedan', {
      acceleration,
      deceleration,
      lateral: targetOf(profileId, 'curve_lateral_accel'),
    });
    const reactionEvidence: PreferenceEvidenceRecord = Object.freeze({
      version: ELIGIBILITY_VERSION,
      windowId: core.eligibility.windowId,
      opportunityId: core.opportunity.id,
      kind: core.eligibility.kind,
      vehicleId: VEHICLE_ID,
      incarnation: INCARNATION,
      reactionDurationTicks: Math.round(reaction * INVERSE_LEARNING_TICK_HZ),
      reactionDurationSeconds:
        Math.round(reaction * INVERSE_LEARNING_TICK_HZ) / INVERSE_LEARNING_TICK_HZ,
    });
    rows.push(
      Object.freeze({
        ...core,
        ledger: Object.freeze({ roadType: 'urban' }),
        normalized,
        jerkSamplesMps3: Object.freeze([
          round(jerk + noise(seed, 'jerk-a', index, 0.15), 6),
          round(jerk, 6),
          round(jerk + noise(seed, 'jerk-b', index, 0.1), 6),
          round(jerk + noise(seed, 'jerk-c', index, 0.1), 6),
          round(jerk, 6),
          round(jerk + noise(seed, 'jerk-d', index, 0.15), 6),
        ]),
        reactionEvidence,
      }) as AccelerationRow,
    );
  }
  return Object.freeze(rows);
}

interface SignalShape {
  readonly certain: number;
  readonly held: number;
}

const signalShapes: Readonly<Record<InverseProfileId, SignalShape>> = Object.freeze({
  PRUDENT: Object.freeze({ certain: 4, held: 4 }),
  IMPULSIVE: Object.freeze({ certain: 4, held: 3 }),
  RECKLESS: Object.freeze({ certain: 20, held: 7 }),
  MIXED: Object.freeze({ certain: 20, held: 17 }),
});

function signalRows(
  profileId: InverseProfileId,
  variant: InverseDemonstrationVariant,
): { rows: readonly SignalRow[]; denominators: OpportunityDenominators } {
  const rows: SignalRow[] = [];
  const shape = variant === 'SPARSE' ? { certain: 1, held: 1 } : signalShapes[profileId];
  const offset = targetOf(profileId, 'red_stop_line_offset');
  const brake = targetOf(profileId, 'late_red_brake_threshold');
  for (let index = 0; index < shape.certain; index += 1) {
    const held = index < shape.held;
    const core = windowContext(
      'SIGNALIZED',
      index,
      'RED',
      'FREE_TRAFFIC',
      held ? 'HELD' : 'CROSSED',
    );
    rows.push(
      Object.freeze({
        ...core,
        ledger: Object.freeze({
          roadType: 'urban',
          stopOutcome: held ? ('HELD' as const) : ('CROSSED' as const),
        }),
        stopLineOffsetM: offset,
        brakeThresholdMps2: brake,
        normalized: normalizedWindow(core, 'sedan', {
          acceleration: 1,
          deceleration: brake,
          lateral: 1,
        }),
      }) as SignalRow,
    );
  }
  if (variant !== 'SPARSE') {
    const delay = targetOf(profileId, 'green_start_delay');
    for (let index = 0; index < 3; index += 1) {
      const core = windowContext(
        'SIGNALIZED',
        shape.certain + index,
        'GREEN',
        'FREE_TRAFFIC',
        'RELEASED',
      );
      const ticks = Math.round(delay * INVERSE_LEARNING_TICK_HZ);
      rows.push(
        Object.freeze({
          ...core,
          ledger: Object.freeze({
            roadType: 'urban',
            greenStartDelayS: ticks / INVERSE_LEARNING_TICK_HZ,
          }),
          greenOnsetTick: 120,
          departureTick: 120 + ticks,
        }) as SignalRow,
      );
    }
    const blockedCore = windowContext(
      'SIGNALIZED',
      shape.certain + 3,
      'GREEN',
      'FREE_TRAFFIC',
      'MISSED',
    );
    rows.push(
      Object.freeze({
        ...blockedCore,
        ledger: Object.freeze({ roadType: 'urban' }),
        greenOnsetTick: 120,
        departureTick: 300,
        departureBlockedByLeader: true,
      }) as SignalRow,
    );
  }
  const byKind = [
    Object.freeze({
      kind: 'RED' as const,
      total: shape.certain,
      certain: shape.certain,
      success: shape.held,
      failure: shape.certain - shape.held,
      incomplete: 0,
      entered: shape.certain,
      learningEligibleCertain: shape.certain,
    }),
  ];
  return Object.freeze({
    rows: Object.freeze(rows),
    denominators: Object.freeze({
      version: OPPORTUNITY_VERSION,
      total: shape.certain,
      certain: shape.certain,
      success: shape.held,
      failure: shape.certain - shape.held,
      incomplete: 0,
      entered: shape.certain,
      learningEligibleCertain: shape.certain,
      byKind: Object.freeze(byKind),
      truncatedByReason: Object.freeze([]),
    }),
  });
}

interface StopYieldShape {
  readonly certain: number;
  readonly full: number;
}

const stopShapes: Readonly<Record<InverseProfileId, StopYieldShape>> = Object.freeze({
  PRUDENT: Object.freeze({ certain: 5, full: 5 }),
  IMPULSIVE: Object.freeze({ certain: 5, full: 3 }),
  RECKLESS: Object.freeze({ certain: 15, full: 3 }),
  MIXED: Object.freeze({ certain: 20, full: 17 }),
});

function stopYieldRows(
  profileId: InverseProfileId,
  variant: InverseDemonstrationVariant,
): { rows: readonly StopYieldRow[]; denominators: OpportunityDenominators } {
  const rows: StopYieldRow[] = [];
  const shape = stopShapes[profileId];
  const dwell = targetOf(profileId, 'stop_dwell_time');
  const offset = targetOf(profileId, 'stop_line_offset');
  for (let index = 0; index < shape.certain; index += 1) {
    const full = index < shape.full;
    const core = windowContext(
      'STOP_YIELD',
      index,
      'STOP',
      'FREE_TRAFFIC',
      full ? 'STOPPED' : 'CROSSED_WITHOUT_STOP',
    );
    rows.push(
      Object.freeze({
        ...core,
        ledger: Object.freeze({
          roadType: 'urban',
          stopOutcome: full ? ('STOPPED' as const) : ('CROSSED_WITHOUT_STOP' as const),
        }),
        stopCause: 'STOP_LINE',
        fullStop: full,
        rollingStop: full ? undefined : true,
        dwellTicks: full ? Math.round(dwell * INVERSE_LEARNING_TICK_HZ) : undefined,
        stopLineOffsetM: offset,
      }) as StopYieldRow,
    );
  }
  const target = targetOf(profileId, 'yield_time_gap');
  const contradictory = variant === 'CONTRADICTORY';
  const accepted = contradictory ? [target - 1, target - 0.8] : [target + 0.4, target + 0.9];
  const refused = contradictory ? [target + 1, target + 0.8] : [target - 0.4, target - 0.9];
  const outcomes: readonly { outcome: 'PROCEEDED' | 'YIELDED'; gap: number }[] = [
    { outcome: 'PROCEEDED', gap: accepted[0]! },
    { outcome: 'PROCEEDED', gap: accepted[1]! },
    { outcome: 'YIELDED', gap: refused[0]! },
    { outcome: 'YIELDED', gap: refused[1]! },
  ];
  for (const [index, entry] of outcomes.entries()) {
    const core = windowContext(
      'STOP_YIELD',
      shape.certain + index,
      'YIELD',
      'LEADER',
      entry.outcome,
    );
    rows.push(
      Object.freeze({
        ...core,
        ledger: Object.freeze({
          roadType: 'urban',
          headway: Object.freeze({ gapM: 15, speedMps: 6 }),
        }),
        yieldGapS: entry.gap,
      }) as StopYieldRow,
    );
  }
  const byKind = [
    Object.freeze({
      kind: 'STOP' as const,
      total: shape.certain,
      certain: shape.certain,
      success: shape.full,
      failure: shape.certain - shape.full,
      incomplete: 0,
      entered: shape.certain,
      learningEligibleCertain: shape.certain,
    }),
    Object.freeze({
      kind: 'YIELD' as const,
      total: 4,
      certain: 4,
      success: 4,
      failure: 0,
      incomplete: 0,
      entered: 4,
      learningEligibleCertain: 4,
    }),
  ];
  return Object.freeze({
    rows: Object.freeze(rows),
    denominators: Object.freeze({
      version: OPPORTUNITY_VERSION,
      total: shape.certain + 4,
      certain: shape.certain + 4,
      success: shape.full + 4,
      failure: shape.certain - shape.full,
      incomplete: 0,
      entered: shape.certain + 4,
      learningEligibleCertain: shape.certain + 4,
      byKind: Object.freeze(byKind),
      truncatedByReason: Object.freeze([]),
    }),
  });
}

function laneRows(
  profileId: InverseProfileId,
  variant: InverseDemonstrationVariant,
): readonly LaneRow[] {
  const rows: LaneRow[] = [];
  const front = targetOf(profileId, 'lane_change_front_gap');
  const back = targetOf(profileId, 'lane_change_back_gap');
  const gain = targetOf(profileId, 'lane_change_speed_gain');
  const cooldown = targetOf(profileId, 'lane_change_cooldown');
  const contradictory = variant === 'CONTRADICTORY';
  const completedOffsets = contradictory ? [-2, -1.5, -1] : [2, 2.5, 1.5];
  const rejectedOffsets = contradictory ? [2, 1.5] : [-2, -1];
  const completed: readonly { front: number; back: number; gain: number }[] = completedOffsets.map(
    (value) => ({
      front: front + value,
      back: back + value,
      gain: gain + (contradictory ? value : value * 0.25),
    }),
  );
  const rejected: readonly { front: number; back: number; gain: number }[] = rejectedOffsets.map(
    (value) => ({
      front: front + value,
      back: back + value,
      gain: gain + (contradictory ? value : value * 0.25),
    }),
  );
  let index = 0;
  for (const entry of completed) {
    const core = windowContext('LANE_CHANGE', index++, 'LANE_CHANGE', 'FREE_TRAFFIC', 'COMPLETED');
    rows.push(
      Object.freeze({
        ...core,
        ledger: Object.freeze({ roadType: 'urban', laneChangeOutcome: 'COMPLETED' as const }),
        routeRequired: false,
        outcome: 'COMPLETED',
        frontGapM: round(entry.front, 6),
        backGapM: round(entry.back, 6),
        speedAdvantageMps: round(entry.gain, 6),
        cooldownTicks: Math.round(cooldown * INVERSE_LEARNING_TICK_HZ),
      }) as LaneRow,
    );
  }
  for (const entry of rejected) {
    const core = windowContext('LANE_CHANGE', index++, 'LANE_CHANGE', 'FREE_TRAFFIC', 'ABORTED');
    rows.push(
      Object.freeze({
        ...core,
        ledger: Object.freeze({ roadType: 'urban', laneChangeOutcome: 'ABORTED' as const }),
        routeRequired: false,
        outcome: 'ABORTED',
        frontGapM: round(entry.front, 6),
        backGapM: round(entry.back, 6),
        speedAdvantageMps: round(entry.gain, 6),
      }) as LaneRow,
    );
  }
  return Object.freeze(rows);
}

function emptyDenominators(): OpportunityDenominators {
  return Object.freeze({
    version: OPPORTUNITY_VERSION,
    total: 0,
    certain: 0,
    success: 0,
    failure: 0,
    incomplete: 0,
    entered: 0,
    learningEligibleCertain: 0,
    byKind: Object.freeze([]),
    truncatedByReason: Object.freeze([]),
  });
}

function emptyObservations(): InverseObservationSet {
  return Object.freeze({
    speed: Object.freeze([]),
    following: Object.freeze([]),
    acceleration: Object.freeze([]),
    signal: Object.freeze([]),
    stopYield: Object.freeze([]),
    lane: Object.freeze([]),
  });
}

function buildEvidence(rows: readonly AnyRow[]): readonly ParameterEvidenceReadModel[] {
  const ledger = createParameterEvidenceLedger();
  for (const row of rows) {
    ledger.observe({
      eligibility: row.eligibility,
      opportunity: row.opportunity,
      artifacts: row.artifacts,
      normalized: 'normalized' in row ? (row.normalized ?? undefined) : undefined,
      roadType: row.ledger.roadType,
      speedSamples: row.ledger.speedSamples,
      headway: row.ledger.headway,
      stopOutcome: row.ledger.stopOutcome,
      greenStartDelayS: row.ledger.greenStartDelayS,
      laneChangeOutcome: row.ledger.laneChangeOutcome,
    });
  }
  return ledger.readAll();
}

/**
 * Generates one scenario stream for a known profile. The estimator observations are the same objects
 * that feed the 093 ledger, so the read model and the estimator input cannot drift apart. All noise
 * comes from `randomUnit` with a derived seed; no `Math.random` is used anywhere.
 */
export function generateDemonstration(
  profileId: InverseProfileId,
  scenarioId: InverseScenarioId,
  variant: InverseDemonstrationVariant = 'PROFILE',
): InverseDemonstration {
  if (!inverseProfileIds.includes(profileId))
    throw new Error(`Unknown inverse profile: ${profileId}`);
  if (!inverseScenarioIds.includes(scenarioId))
    throw new Error(`Unknown inverse scenario: ${scenarioId}`);
  const seed = deriveScenarioSeed(
    INVERSE_LEARNING_ROOT_SEED,
    `${profileId}:${scenarioId}:${variant}`,
  );
  let observations = emptyObservations();
  let denominators = emptyDenominators();
  let rows: readonly AnyRow[] = [];
  switch (scenarioId) {
    case 'FREE_FLOW':
      rows = variant === 'PROFILE' ? freeFlowRows(seed, profileId) : [];
      observations = Object.freeze({
        ...observations,
        speed: rows as readonly SpeedRow[],
      });
      break;
    case 'FOLLOWING': {
      rows = followingRows(seed, profileId, variant);
      observations = Object.freeze({
        ...observations,
        following: rows as readonly FollowingRow[],
      });
      break;
    }
    case 'LONGITUDINAL':
      rows = variant === 'PROFILE' ? longitudinalRows(seed, profileId) : [];
      observations = Object.freeze({
        ...observations,
        acceleration: rows as readonly AccelerationRow[],
      });
      break;
    case 'SIGNALIZED': {
      const signal = signalRows(profileId, variant);
      rows = signal.rows;
      denominators = signal.denominators;
      observations = Object.freeze({
        ...observations,
        signal: rows as readonly SignalRow[],
      });
      break;
    }
    case 'STOP_YIELD': {
      const stopYield = stopYieldRows(profileId, variant);
      rows = stopYield.rows;
      denominators = stopYield.denominators;
      observations = Object.freeze({
        ...observations,
        stopYield: rows as readonly StopYieldRow[],
      });
      break;
    }
    case 'LANE_CHANGE':
      rows = variant === 'SPARSE' ? [] : laneRows(profileId, variant);
      observations = Object.freeze({
        ...observations,
        lane: rows as readonly LaneRow[],
      });
      break;
  }
  const owner = scenarioOwners[scenarioId];
  return Object.freeze({
    version: INVERSE_LEARNING_VERSION,
    profileId,
    scenarioId,
    variant,
    seed,
    owner,
    contributingKeys: specsByOwner.get(owner)!,
    evidence: buildEvidence(rows),
    denominators,
    observations,
  });
}

interface CandidateView {
  readonly status: string;
  readonly value: number | null;
  readonly interval: readonly [number, number] | null;
  readonly reason: string | null;
}

function candidateView(candidate: {
  readonly status: string;
  readonly value: number | null;
  readonly interval?: readonly [number, number] | null;
  readonly reason: string | null;
}): CandidateView {
  return Object.freeze({
    status: candidate.status,
    value: candidate.value,
    interval: candidate.interval ?? null,
    reason: candidate.reason,
  });
}

function estimateOwner(
  demonstration: InverseDemonstration,
  ports: InverseLearningPorts,
): ReadonlyMap<ParameterKey, CandidateView> {
  const evidence = demonstration.evidence;
  const candidates = new Map<ParameterKey, CandidateView>();
  switch (demonstration.owner) {
    case '094': {
      const result = ports.speed(evidence, demonstration.observations.speed);
      for (const key of specsByOwner.get('094')!) {
        candidates.set(
          key,
          candidateView(result.candidates[key as keyof typeof result.candidates]),
        );
      }
      break;
    }
    case '095': {
      const result = ports.acceleration(evidence, demonstration.observations.acceleration);
      for (const key of specsByOwner.get('095')!) {
        candidates.set(
          key,
          candidateView(result.candidates[key as keyof typeof result.candidates]),
        );
      }
      break;
    }
    case '096': {
      const result = ports.following(evidence, demonstration.observations.following);
      for (const key of specsByOwner.get('096')!) {
        candidates.set(
          key,
          candidateView(result.candidates[key as keyof typeof result.candidates]),
        );
      }
      break;
    }
    case '097': {
      const result = ports.signal(
        evidence,
        demonstration.denominators,
        demonstration.observations.signal,
      );
      for (const key of specsByOwner.get('097')!) {
        candidates.set(
          key,
          candidateView(result.candidates[key as keyof typeof result.candidates]),
        );
      }
      break;
    }
    case '098': {
      const result = ports.stopYield(
        evidence,
        demonstration.denominators,
        demonstration.observations.stopYield,
      );
      for (const key of specsByOwner.get('098')!) {
        candidates.set(
          key,
          candidateView(result.candidates[key as keyof typeof result.candidates]),
        );
      }
      break;
    }
    case '099': {
      const result = ports.lane(evidence, demonstration.observations.lane);
      for (const key of specsByOwner.get('099')!) {
        candidates.set(
          key,
          candidateView(result.candidates[key as keyof typeof result.candidates]),
        );
      }
      break;
    }
  }
  return candidates;
}

function unobservedEvidence(key: ParameterKey): ParameterEvidenceReadModel {
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

function evidenceSummary(evidence: ParameterEvidenceReadModel): InverseEvidenceSummary {
  return Object.freeze({
    status: evidence.status,
    distinctEpisodes: evidence.distinctEpisodes,
    sampleCount: evidence.sampleCount,
    contexts: Object.freeze(
      evidence.contextBreakdown.map(
        (row) => `${row.label}/${row.roadType}/${row.speedBand}×${row.episodes}`,
      ),
    ),
  });
}

function distinctSpeedBands(evidence: ParameterEvidenceReadModel): number {
  return new Set(
    evidence.contextBreakdown.map((row) => row.speedBand).filter((band) => band !== 'UNKNOWN'),
  ).size;
}

interface ScenarioRun {
  readonly scenarioId: string;
  readonly probe: 'SPARSE_EVIDENCE' | 'CONTRADICTORY_EVIDENCE' | 'OUT_OF_TOLERANCE' | null;
  readonly profileId: InverseProfileId;
  readonly variant: InverseDemonstrationVariant;
  readonly scenarios: readonly InverseScenarioId[];
}

function probePorts(base: InverseLearningPorts, profileId: InverseProfileId): InverseLearningPorts {
  return Object.freeze({
    ...base,
    speed: ((evidence, observations) => {
      const real = base.speed(evidence, observations);
      const target = targetOf(profileId, 'speed_delta_urban');
      const faulty = Object.freeze({
        ...real.candidates.speed_delta_urban,
        value: target + 4,
      });
      return Object.freeze({
        ...real,
        candidates: Object.freeze({ ...real.candidates, speed_delta_urban: faulty }),
      });
    }) as InverseLearningPorts['speed'],
  });
}

function evaluateKey(
  key: ParameterKey,
  scenario: ScenarioRun,
  evidence: ParameterEvidenceReadModel,
  candidate: CandidateView,
  usedScenarios: readonly InverseScenarioId[],
): InverseKeyResult {
  const target = targetOf(scenario.profileId, key);
  const tolerance = toleranceByKey.get(key);
  const rule = ruleByKey.get(key);
  const spec = specByKey.get(key);
  if (!tolerance || !rule || !spec) throw new Error(`Missing 105 contract data for ${key}`);
  const effective = tolerance.absoluteTolerance + tolerance.relativeTolerance * Math.abs(target);
  const evidenceReady =
    evidence.status === 'READY' && evidence.distinctEpisodes >= rule.minimumEpisodes;
  const varied = !rule.requiresVariedSpeeds || distinctSpeedBands(evidence) > 1;
  const intervalValid =
    candidate.interval !== null && candidate.interval[0] <= candidate.interval[1];
  const opposed = !rule.requiresOpposedOutcomes || (intervalValid && candidate.interval !== null);
  const hasThreshold = candidate.value !== null || intervalValid;
  let identifiable =
    evidenceReady && varied && opposed && hasThreshold && candidate.status === 'CANDIDATE';
  let reason: string;
  if (!evidenceReady)
    reason =
      evidence.status === 'READY'
        ? 'INSUFFICIENT_EVIDENCE'
        : evidence.status === 'NO_EVIDENCE'
          ? 'NO_QUALIFYING_EVIDENCE'
          : 'INSUFFICIENT_EVIDENCE';
  else if (!varied) reason = 'SINGLE_SPEED_EVIDENCE';
  else if (!opposed) reason = 'OPPOSED_OUTCOMES_REQUIRED';
  else if (!hasThreshold) reason = 'ESTIMATOR_NOT_IDENTIFIED';
  else if (candidate.status !== 'CANDIDATE') reason = 'ESTIMATOR_NOT_CANDIDATE';
  else reason = 'IDENTIFIABLE';

  let estimate: number | null = null;
  let interval: readonly [number, number] | null = null;
  if (identifiable) {
    if (candidate.value !== null) estimate = candidate.value;
    else if (intervalValid) interval = candidate.interval;
    else identifiable = false;
  }
  if (!identifiable) {
    const inverted = candidate.interval !== null && candidate.interval[0] > candidate.interval[1];
    // A precise number (or an inverted interval) for a key the evidence cannot identify is
    // rejected, never reported as an estimate.
    if (inverted)
      reason =
        scenario.probe === 'CONTRADICTORY_EVIDENCE'
          ? 'CONTRADICTORY_EVIDENCE'
          : 'INVALID_ESTIMATOR_INTERVAL';
    else if (candidate.value !== null || candidate.interval !== null) {
      if (reason !== 'OPPOSED_OUTCOMES_REQUIRED')
        reason = 'UNIDENTIFIABLE_ESTIMATOR_VALUE_REJECTED';
    } else if (scenario.probe === 'CONTRADICTORY_EVIDENCE') {
      reason = 'CONTRADICTORY_EVIDENCE';
    }
    estimate = null;
    interval = null;
  }
  const error = estimate === null ? null : round(estimate - target, 9);
  let status: InverseEvaluationStatus;
  let absoluteError: number | null = error === null ? null : Math.abs(error);
  if (!identifiable) status = 'NOT_IDENTIFIABLE';
  else if (estimate !== null) {
    status = absoluteError! <= effective ? 'WITHIN_TOLERANCE' : 'OUTSIDE_TOLERANCE';
  } else if (interval !== null) {
    const [low, high] = interval;
    const distance = target < low ? low - target : target > high ? target - high : 0;
    absoluteError = round(distance, 9);
    status =
      target >= low - effective && target <= high + effective
        ? 'WITHIN_TOLERANCE'
        : 'OUTSIDE_TOLERANCE';
  } else status = 'NO_ESTIMATE';

  return Object.freeze({
    key,
    scenarioId: scenario.scenarioId,
    scenarioIds: Object.freeze([...usedScenarios]),
    target,
    estimate,
    interval,
    error,
    absoluteError,
    tolerance: Object.freeze({
      absolute: tolerance.absoluteTolerance,
      relative: tolerance.relativeTolerance,
      effective: round(effective, 9),
    }),
    status,
    identifiable,
    estimatorStatus: candidate.status,
    estimatorReason: candidate.reason,
    reason,
    evidence: evidenceSummary(evidence),
    context: tolerance.context,
  });
}

function summarize(
  scenario: ScenarioRun,
  keys: number,
  results: readonly InverseKeyResult[],
  demonstrationSeeds: readonly number[],
): InverseScenarioResult {
  const withinTolerance = results.filter((row) => row.status === 'WITHIN_TOLERANCE').length;
  const outsideTolerance = results.filter((row) => row.status === 'OUTSIDE_TOLERANCE').length;
  const notIdentifiable = results.filter((row) => row.status === 'NOT_IDENTIFIABLE').length;
  const noEstimate = results.filter((row) => row.status === 'NO_ESTIMATE').length;
  const expectedFailure = scenario.probe === 'OUT_OF_TOLERANCE';
  const passed = expectedFailure
    ? outsideTolerance > 0
    : outsideTolerance === 0 && noEstimate === 0;
  return Object.freeze({
    scenarioId: scenario.scenarioId,
    kind: scenario.probe === null ? 'PROFILE' : 'PROBE',
    probe: scenario.probe,
    profileId: scenario.profileId,
    expectedFailure,
    keys,
    withinTolerance,
    outsideTolerance,
    notIdentifiable,
    noEstimate,
    passed,
    retainedFailures: Object.freeze(
      results
        .filter((row) => row.status === 'OUTSIDE_TOLERANCE' || row.status === 'NO_ESTIMATE')
        .map((row) => `${row.key}:${row.status}`),
    ),
    demonstrationSeeds: Object.freeze([...demonstrationSeeds]),
    results: Object.freeze([...results]),
  });
}

const SCENARIO_RUNS: readonly ScenarioRun[] = Object.freeze([
  Object.freeze({
    scenarioId: 'PROFILE_PRUDENT',
    probe: null,
    profileId: 'PRUDENT',
    variant: 'PROFILE',
    scenarios: inverseScenarioIds,
  }),
  Object.freeze({
    scenarioId: 'PROFILE_IMPULSIVE',
    probe: null,
    profileId: 'IMPULSIVE',
    variant: 'PROFILE',
    scenarios: inverseScenarioIds,
  }),
  Object.freeze({
    scenarioId: 'PROFILE_RECKLESS',
    probe: null,
    profileId: 'RECKLESS',
    variant: 'PROFILE',
    scenarios: inverseScenarioIds,
  }),
  Object.freeze({
    scenarioId: 'PROFILE_MIXED',
    probe: null,
    profileId: 'MIXED',
    variant: 'PROFILE',
    scenarios: inverseScenarioIds,
  }),
  Object.freeze({
    scenarioId: 'SPARSE_EVIDENCE',
    probe: 'SPARSE_EVIDENCE',
    profileId: 'MIXED',
    variant: 'SPARSE',
    scenarios: Object.freeze(['FOLLOWING', 'SIGNALIZED'] as const),
  }),
  Object.freeze({
    scenarioId: 'CONTRADICTORY_EVIDENCE',
    probe: 'CONTRADICTORY_EVIDENCE',
    profileId: 'MIXED',
    variant: 'CONTRADICTORY',
    scenarios: Object.freeze(['FOLLOWING', 'STOP_YIELD', 'LANE_CHANGE'] as const),
  }),
  Object.freeze({
    scenarioId: 'OUT_OF_TOLERANCE_PROBE',
    probe: 'OUT_OF_TOLERANCE',
    profileId: 'PRUDENT',
    variant: 'PROFILE',
    scenarios: inverseScenarioIds,
  }),
]);

/**
 * Runs the four known profiles plus three contract probes through the real estimators. The report is
 * frozen data; it never mutates a profile, a store, the 093 ledger or the 092 catalog.
 */
export function evaluateInverseLearning(
  options: { readonly ports?: Partial<InverseLearningPorts> } = {},
): InverseLearningReport {
  const basePorts: InverseLearningPorts = Object.freeze({
    ...realInverseLearningPorts,
    ...options.ports,
  });
  const scenarioResults: InverseScenarioResult[] = [];
  for (const scenario of SCENARIO_RUNS) {
    const ports =
      scenario.probe === 'OUT_OF_TOLERANCE' ? probePorts(basePorts, scenario.profileId) : basePorts;
    const demonstrations = scenario.scenarios.map((scenarioId) =>
      generateDemonstration(scenario.profileId, scenarioId, scenario.variant),
    );
    const candidates = new Map<ParameterKey, CandidateView>();
    const evidenceByKey = new Map<ParameterKey, ParameterEvidenceReadModel>();
    const usedByKey = new Map<ParameterKey, InverseScenarioId>();
    for (const demonstration of demonstrations) {
      for (const [key, candidate] of estimateOwner(demonstration, ports)) {
        candidates.set(key, candidate);
        usedByKey.set(key, demonstration.scenarioId);
        const read = demonstration.evidence.find((entry) => entry.key === key);
        evidenceByKey.set(key, read ?? unobservedEvidence(key));
      }
    }
    const results = M_KEYS.map((key) =>
      evaluateKey(
        key,
        scenario,
        evidenceByKey.get(key) ?? unobservedEvidence(key),
        candidates.get(key) ??
          Object.freeze({
            status: 'UNOBSERVED',
            value: null,
            interval: null,
            reason: 'NO_QUALIFYING_EVIDENCE',
          }),
        usedByKey.has(key) ? [usedByKey.get(key)!] : [],
      ),
    );
    scenarioResults.push(
      summarize(
        scenario,
        M_KEYS.length,
        results,
        demonstrations.map((demonstration) => demonstration.seed),
      ),
    );
  }
  const allResults = scenarioResults.flatMap((scenario) => scenario.results);
  const profileResults = scenarioResults.filter((scenario) => scenario.kind === 'PROFILE');
  const probeResults = scenarioResults.filter((scenario) => scenario.kind === 'PROBE');
  const count = (status: InverseEvaluationStatus): number =>
    allResults.filter((row) => row.status === status).length;
  const profileFailures = profileResults.reduce(
    (sum, scenario) => sum + scenario.outsideTolerance + scenario.noEstimate,
    0,
  );
  const retainedProbeFailures = probeResults.reduce(
    (sum, scenario) => sum + scenario.outsideTolerance,
    0,
  );
  return Object.freeze({
    version: INVERSE_LEARNING_VERSION,
    rootSeed: INVERSE_LEARNING_ROOT_SEED,
    tickHz: INVERSE_LEARNING_TICK_HZ,
    contract: Object.freeze({
      profiles: Object.freeze([...inverseProfileIds]),
      demonstrationScenarios: Object.freeze([...inverseScenarioIds]),
      evaluationStatuses: Object.freeze([
        'WITHIN_TOLERANCE',
        'OUTSIDE_TOLERANCE',
        'NOT_IDENTIFIABLE',
        'NO_ESTIMATE',
      ] as const),
      keys: Object.freeze([...M_KEYS]),
      identifiableKeys: inverseTolerances.length,
      unidentifiableRuleCount: inverseIdentifiabilityRules.length,
    }),
    scenarios: Object.freeze(scenarioResults),
    overall: Object.freeze({
      keysEvaluated: allResults.length,
      withinTolerance: count('WITHIN_TOLERANCE'),
      outsideTolerance: count('OUTSIDE_TOLERANCE'),
      notIdentifiable: count('NOT_IDENTIFIABLE'),
      noEstimate: count('NO_ESTIMATE'),
      profileFailures,
      retainedProbeFailures,
      pass:
        profileFailures === 0 &&
        probeResults.every((scenario) => scenario.passed) &&
        allResults.every((row) => row.status !== 'NOT_IDENTIFIABLE' || row.estimate === null),
    }),
  });
}
