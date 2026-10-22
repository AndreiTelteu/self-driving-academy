import { parameterEvidenceSpecs } from './parameter-evidence';
import type { ParameterEvidenceReadModel } from './parameter-evidence';
import type { ParameterKey } from '../profiles';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  IntentionalVehicleNormalization,
} from '../telemetry';
import { normalizationPercentile } from '../telemetry';

export const SPEED_ESTIMATOR_VERSION = '094-speed-estimator-v1' as const;
export const SPEED_ESTIMATOR_KEYS = Object.freeze([
  'speed_delta_urban',
  'speed_delta_residential',
  'curve_lateral_accel',
  'intersection_approach_speed',
] as const);
export type SpeedEstimatorKey = (typeof SPEED_ESTIMATOR_KEYS)[number];
export interface SpeedEstimatorObservation {
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly roadKind: 'URBAN' | 'RESIDENTIAL' | 'OTHER';
  readonly postedLimitMps: number;
  readonly speedSamples: readonly { readonly tick: number; readonly speedMps: number }[];
  readonly intersectionApproach: boolean;
  readonly curveRadiusM: number | null;
  readonly normalized: IntentionalVehicleNormalization | null;
}
export interface SpeedCandidate {
  readonly key: SpeedEstimatorKey;
  readonly status: 'CANDIDATE' | 'UNOBSERVED';
  readonly value: number | null;
  readonly confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'NONE';
  readonly quality: number;
  readonly sourceEpisodeCount: number;
  readonly contextBreakdown: ParameterEvidenceReadModel['contextBreakdown'];
  readonly reason: string | null;
}
export interface SpeedEstimatorResult {
  readonly version: typeof SPEED_ESTIMATOR_VERSION;
  readonly candidates: Readonly<Record<SpeedEstimatorKey, SpeedCandidate>>;
}
const specs = new Map(parameterEvidenceSpecs.map((spec) => [spec.key, spec]));

function candidate(
  key: SpeedEstimatorKey,
  reads: Map<ParameterKey, ParameterEvidenceReadModel>,
  values: readonly number[],
): SpeedCandidate {
  const evidence = reads.get(key);
  const spec = specs.get(key)!;
  const valid = values.filter(Number.isFinite);
  if (!evidence || evidence.status !== 'READY' || valid.length === 0)
    return Object.freeze({
      key,
      status: 'UNOBSERVED',
      value: null,
      confidence: 'NONE',
      quality: 0,
      sourceEpisodeCount: evidence?.distinctEpisodes ?? 0,
      contextBreakdown: evidence?.contextBreakdown ?? Object.freeze([]),
      reason: !evidence
        ? 'NO_QUALIFYING_EVIDENCE'
        : evidence.status === 'READY'
          ? 'NO_MATCHING_OBSERVATIONS'
          : evidence.noEstimate,
    });
  const value = Math.max(
    spec.min,
    Math.min(
      spec.max,
      normalizationPercentile(
        [...valid].sort((a, b) => a - b),
        0.5,
      ),
    ),
  );
  const quality = Math.min(
    1,
    (evidence.quality * valid.length) / Math.max(1, evidence.distinctEpisodes),
  );
  return Object.freeze({
    key,
    status: 'CANDIDATE',
    value,
    confidence: quality >= 0.8 ? 'HIGH' : quality >= 0.5 ? 'MODERATE' : 'LOW',
    quality,
    sourceEpisodeCount: evidence.distinctEpisodes,
    contextBreakdown: evidence.contextBreakdown,
    reason: null,
  });
}

/** Candidate estimator only. Reads 093 thresholds and 089 intentional normalized curve demand. */
export function estimateSpeedParameters(
  evidenceReadModel: readonly ParameterEvidenceReadModel[],
  observations: readonly SpeedEstimatorObservation[],
): SpeedEstimatorResult {
  const reads = new Map<ParameterKey, ParameterEvidenceReadModel>();
  for (const entry of evidenceReadModel) {
    if (!SPEED_ESTIMATOR_KEYS.includes(entry.key as SpeedEstimatorKey) && specs.has(entry.key))
      continue;
    if (!specs.has(entry.key)) throw new Error(`Unknown evidence key: ${entry.key}`);
    reads.set(entry.key, entry);
  }
  const samples = new Map<SpeedEstimatorKey, number[]>(
    SPEED_ESTIMATOR_KEYS.map((key) => [key, []]),
  );
  for (const row of observations) {
    if (!Number.isFinite(row.postedLimitMps) || row.postedLimitMps <= 0)
      throw new Error('Invalid speed observation');
    // Only authoritative FREE_TRAFFIC/ELIGIBLE/LEARNING observations can be preferred speed.
    if (
      row.eligibility.label !== 'FREE_TRAFFIC' ||
      row.eligibility.windowClass !== 'ELIGIBLE' ||
      row.eligibility.controlMode !== 'LEARNING' ||
      !row.eligibility.learningEligible
    )
      continue;
    const prefix = row.artifacts.windowClass === 'PREFIX_ELIGIBLE' ? row.artifacts.prefix : null;
    if (
      prefix === null ||
      row.artifacts.windowId !== row.eligibility.windowId ||
      row.artifacts.segmentId !== row.eligibility.segmentId ||
      row.artifacts.vehicleId !== row.eligibility.vehicleId ||
      row.artifacts.incarnation !== row.eligibility.incarnation
    )
      continue;
    if (
      row.normalized &&
      (row.normalized.opportunityId !== row.eligibility.opportunityId ||
        row.normalized.windowId !== row.eligibility.windowId ||
        row.normalized.segmentId !== row.eligibility.segmentId ||
        row.normalized.eligibilityClass !== 'ELIGIBLE')
    )
      throw new Error('Mismatched 089 normalization context');
    const speedSamples = row.speedSamples.filter((sample) => {
      if (
        !Number.isSafeInteger(sample.tick) ||
        !Number.isFinite(sample.speedMps) ||
        sample.speedMps < 0
      )
        throw new Error('Invalid speed sample');
      return sample.tick >= prefix.fromTick && sample.tick <= prefix.toTick;
    });
    for (const sample of speedSamples) {
      if (row.roadKind === 'URBAN')
        samples.get('speed_delta_urban')!.push(sample.speedMps - row.postedLimitMps);
      if (row.roadKind === 'RESIDENTIAL')
        samples.get('speed_delta_residential')!.push(sample.speedMps - row.postedLimitMps);
      if (row.intersectionApproach)
        samples.get('intersection_approach_speed')!.push(sample.speedMps);
    }
    if (row.curveRadiusM !== null) {
      if (!Number.isFinite(row.curveRadiusM) || row.curveRadiusM <= 0)
        throw new Error('Invalid curve radius');
      if (row.normalized?.demandStatus === 'INTENTIONAL')
        samples
          .get('curve_lateral_accel')!
          .push(
            row.normalized.features.lateralDemand *
              row.normalized.capability.maxLateralAccelerationMps2,
          );
    }
  }
  const result = Object.create(null) as Record<SpeedEstimatorKey, SpeedCandidate>;
  for (const key of SPEED_ESTIMATOR_KEYS) result[key] = candidate(key, reads, samples.get(key)!);
  return Object.freeze({ version: SPEED_ESTIMATOR_VERSION, candidates: Object.freeze(result) });
}

/** Keep compile-time coverage tied to 093's owner declarations. */
const _speedOwner: readonly ParameterKey[] = SPEED_ESTIMATOR_KEYS;
void _speedOwner;
