import { parameterEvidenceSpecs } from './parameter-evidence';
import type { ParameterEvidenceReadModel } from './parameter-evidence';
import { VEHICLE_CLASSES } from '../vehicles';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  NormalizedVehicleWindow,
  PreferenceEvidenceRecord,
} from '../telemetry';
import { parameterDefinitions } from '../profiles';
import type { ParameterKey } from '../profiles';

export const ACCELERATION_ESTIMATOR_VERSION = '095-acceleration-estimator-v1' as const;
export const ACCELERATION_ESTIMATOR_KEYS = Object.freeze([
  'desired_acceleration',
  'comfort_deceleration',
  'acceleration_jerk',
  'brake_reaction_delay',
] as const);
export type AccelerationEstimatorKey = (typeof ACCELERATION_ESTIMATOR_KEYS)[number];
export interface AccelerationEstimatorObservation {
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly normalized: NormalizedVehicleWindow;
  /** Tick-to-tick SI jerk derived from authoritative 085 acceleration samples. */
  readonly jerkSamplesMps3: readonly number[];
  /** 087's accepted observable-stimulus response; absent means NOT_OBSERVED. */
  readonly reactionEvidence: PreferenceEvidenceRecord | null;
}
export interface AccelerationCandidate {
  readonly key: AccelerationEstimatorKey;
  readonly status: 'CANDIDATE' | 'UNOBSERVED';
  readonly value: number | null;
  readonly confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'NONE';
  readonly quality: number;
  readonly sourceEpisodeCount: number;
  readonly contextBreakdown: ParameterEvidenceReadModel['contextBreakdown'];
  readonly reason: string | null;
}
export interface AccelerationEstimatorResult {
  readonly version: typeof ACCELERATION_ESTIMATOR_VERSION;
  readonly candidates: Readonly<Record<AccelerationEstimatorKey, AccelerationCandidate>>;
  readonly excludedCapabilityLowerBounds: number;
  readonly excludedArtifactWindows: number;
  readonly normalizationBreakdown: readonly {
    readonly classId: 'sedan' | 'compact';
    readonly episodeCount: number;
    readonly accelerationDemandP50: number;
    readonly decelerationDemandP50: number;
    readonly lateralDemandP50: number;
    readonly rawAccelerationMps2P50: number;
    readonly rawDecelerationMps2P50: number;
    readonly rawLateralAccelerationMps2P50: number;
  }[];
}
const specs = new Map(parameterEvidenceSpecs.map((spec) => [spec.key, spec]));
const definitions = new Map(parameterDefinitions.map((entry) => [entry.key, entry]));
function quantile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  // Reject outer 10% as outliers, then use deterministic nearest-rank quantiles.
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * 0.1);
  const clean = sorted.slice(trim, Math.max(trim + 1, sorted.length - trim));
  return clean[Math.min(clean.length - 1, Math.ceil(clean.length * p) - 1)]!;
}
function buildCandidate(
  key: AccelerationEstimatorKey,
  read: ParameterEvidenceReadModel | undefined,
  values: readonly number[],
): AccelerationCandidate {
  const valid = values.filter(Number.isFinite);
  if (!read || read.status !== 'READY' || valid.length === 0)
    return Object.freeze({
      key,
      status: 'UNOBSERVED',
      value: null,
      confidence: 'NONE',
      quality: 0,
      sourceEpisodeCount: read?.distinctEpisodes ?? 0,
      contextBreakdown: read?.contextBreakdown ?? Object.freeze([]),
      reason:
        read?.status === 'READY'
          ? 'NO_MATCHING_OBSERVATIONS'
          : (read?.noEstimate ?? 'NO_QUALIFYING_EVIDENCE'),
    });
  const definition = definitions.get(key)!;
  const value = Math.max(definition.min, Math.min(definition.max, quantile(valid, 0.5)));
  const quality = Math.min(1, (read.quality * valid.length) / Math.max(1, read.distinctEpisodes));
  return Object.freeze({
    key,
    status: 'CANDIDATE',
    value,
    confidence: quality >= 0.8 ? 'HIGH' : quality >= 0.5 ? 'MODERATE' : 'LOW',
    quality,
    sourceEpisodeCount: read.distinctEpisodes,
    contextBreakdown: read.contextBreakdown,
    reason: null,
  });
}

/** Candidate-only robust estimator. CAPABILITY_LIMITED observations are retained only as counted lower bounds. */
export function estimateAccelerationParameters(
  evidenceReadModel: readonly ParameterEvidenceReadModel[],
  observations: readonly AccelerationEstimatorObservation[],
): AccelerationEstimatorResult {
  const reads = new Map<ParameterKey, ParameterEvidenceReadModel>();
  for (const row of evidenceReadModel) {
    if (!specs.has(row.key)) throw new Error(`Unknown evidence key: ${row.key}`);
    reads.set(row.key, row);
  }
  const values = new Map<AccelerationEstimatorKey, number[]>(
    ACCELERATION_ESTIMATOR_KEYS.map((key) => [key, []]),
  );
  let excludedCapabilityLowerBounds = 0;
  let excludedArtifactWindows = 0;
  const normalization = new Map<'sedan' | 'compact', NormalizedVehicleWindow[]>([
    ['sedan', []],
    ['compact', []],
  ]);
  for (const row of observations) {
    if (
      row.artifacts.windowId !== row.eligibility.windowId ||
      row.artifacts.segmentId !== row.eligibility.segmentId ||
      row.artifacts.vehicleId !== row.eligibility.vehicleId ||
      row.artifacts.incarnation !== row.eligibility.incarnation ||
      row.normalized.windowId !== row.eligibility.windowId ||
      row.normalized.opportunityId !== row.eligibility.opportunityId ||
      row.normalized.segmentId !== row.eligibility.segmentId ||
      row.normalized.vehicleId !== row.eligibility.vehicleId ||
      row.normalized.incarnation !== row.eligibility.incarnation
    )
      throw new Error('Mismatched 087/088/089 observation identity');
    if (
      row.artifacts.windowClass !== 'PREFIX_ELIGIBLE' ||
      row.artifacts.completeness !== 'COMPLETE' ||
      row.artifacts.artifacts.length > 0 ||
      row.eligibility.label !== 'FREE_TRAFFIC' ||
      row.eligibility.windowClass !== 'ELIGIBLE' ||
      !row.eligibility.learningEligible ||
      row.eligibility.controlMode !== 'LEARNING'
    ) {
      excludedArtifactWindows++;
      continue;
    }
    if (
      row.normalized.demandStatus === 'CAPABILITY_LIMITED' ||
      row.normalized.features.aggressivenessIsLowerBound
    ) {
      excludedCapabilityLowerBounds++;
      continue;
    }
    if (row.normalized.completeness !== 'COMPLETE') {
      excludedArtifactWindows++;
      continue;
    }
    normalization.get(row.normalized.classId)!.push(row.normalized);
    const f = row.normalized.features;
    // Class-neutral demand fractions map to the project's sedan reference ceilings, not the observed class.
    values
      .get('desired_acceleration')!
      .push(
        (f.accelerationDemand * VEHICLE_CLASSES.sedan.engineForceN) / VEHICLE_CLASSES.sedan.massKg,
      );
    values
      .get('comfort_deceleration')!
      .push(f.decelerationDemand * VEHICLE_CLASSES.sedan.brakeAcceleration);
    values.get('acceleration_jerk')!.push(...row.jerkSamplesMps3.map(Math.abs));
    if (
      row.reactionEvidence &&
      row.eligibility.observable &&
      row.reactionEvidence.windowId === row.eligibility.windowId &&
      row.reactionEvidence.opportunityId === row.eligibility.opportunityId &&
      row.reactionEvidence.vehicleId === row.eligibility.vehicleId &&
      row.reactionEvidence.incarnation === row.eligibility.incarnation &&
      row.reactionEvidence.reactionDurationTicks !== null
    ) {
      values.get('brake_reaction_delay')!.push(row.reactionEvidence.reactionDurationTicks / 60);
    }
  }
  const candidates = Object.create(null) as Record<AccelerationEstimatorKey, AccelerationCandidate>;
  for (const key of ACCELERATION_ESTIMATOR_KEYS)
    candidates[key] = buildCandidate(key, reads.get(key), values.get(key)!);
  const normalizationBreakdown = (['sedan', 'compact'] as const).map((classId) => {
    const features = normalization.get(classId)!.map((entry) => entry.features);
    return Object.freeze({
      classId,
      episodeCount: features.length,
      accelerationDemandP50: quantile(
        features.map((feature) => feature.accelerationDemand),
        0.5,
      ),
      decelerationDemandP50: quantile(
        features.map((feature) => feature.decelerationDemand),
        0.5,
      ),
      lateralDemandP50: quantile(
        features.map((feature) => feature.lateralDemand),
        0.5,
      ),
      rawAccelerationMps2P50: quantile(
        features.map((feature) => feature.raw.longitudinalAccelerationMps2),
        0.5,
      ),
      rawDecelerationMps2P50: quantile(
        features.map((feature) => feature.raw.longitudinalDecelerationMps2),
        0.5,
      ),
      rawLateralAccelerationMps2P50: quantile(
        features.map((feature) => feature.raw.lateralAccelerationMps2),
        0.5,
      ),
    });
  });
  return Object.freeze({
    version: ACCELERATION_ESTIMATOR_VERSION,
    candidates: Object.freeze(candidates),
    excludedCapabilityLowerBounds,
    excludedArtifactWindows,
    normalizationBreakdown: Object.freeze(normalizationBreakdown),
  });
}
