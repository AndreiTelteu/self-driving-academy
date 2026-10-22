import { parameterEvidenceSpecs } from './parameter-evidence';
import type { ParameterEvidenceReadModel } from './parameter-evidence';
import type { ParameterKey } from '../profiles';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  OpportunityRecord,
} from '../telemetry';

export const FOLLOWING_ESTIMATOR_VERSION = '096-following-estimator-v1' as const;
export const FOLLOWING_ESTIMATOR_KEYS = Object.freeze([
  'following_time_headway',
  'following_min_gap',
  'queue_standstill_gap',
  'following_speed_gain',
] as const);
export type FollowingEstimatorKey = (typeof FOLLOWING_ESTIMATOR_KEYS)[number];
export interface FollowingEstimatorObservation {
  readonly eligibility: EligibilityWindowRecord;
  readonly opportunity: OpportunityRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly context: 'LEADER' | 'QUEUE_STANDSTILL';
  readonly gapM: number;
  readonly speedMps: number;
  readonly leaderId: string;
  readonly leaderSpeedMps: number;
  /** Observed ego speed response per unit leader speed change, when available. */
  readonly speedGain?: number;
}
export interface FollowingCandidate {
  readonly key: FollowingEstimatorKey;
  readonly status: 'CANDIDATE' | 'UNOBSERVED' | 'UNIDENTIFIED';
  readonly value: number | null;
  readonly confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'NONE';
  readonly quality: number;
  readonly sourceEpisodeCount: number;
  readonly contextBreakdown: ParameterEvidenceReadModel['contextBreakdown'];
  readonly reason: string | null;
  readonly residualRmsM: number | null;
}
export interface FollowingEstimatorResult {
  readonly version: typeof FOLLOWING_ESTIMATOR_VERSION;
  readonly candidates: Readonly<Record<FollowingEstimatorKey, FollowingCandidate>>;
  readonly leaderChangeSplits: number;
}
const specs = new Map(parameterEvidenceSpecs.map((spec) => [spec.key, spec]));

/** Candidate-only fit of gap = minimum gap + time headway × ego speed. */
export function estimateFollowingParameters(
  evidenceReadModel: readonly ParameterEvidenceReadModel[],
  observations: readonly FollowingEstimatorObservation[],
): FollowingEstimatorResult {
  const reads = new Map<ParameterKey, ParameterEvidenceReadModel>();
  for (const row of evidenceReadModel) {
    if (!specs.has(row.key)) throw new Error(`Unknown evidence key: ${row.key}`);
    reads.set(row.key, row);
  }
  const unique = new Map<string, FollowingEstimatorObservation>();
  let leaderChangeSplits = 0;
  let previousLeader: string | null = null;
  for (const row of observations) {
    const { eligibility: e, opportunity: o, artifacts: a } = row;
    if (
      !Number.isFinite(row.gapM) ||
      row.gapM < 0 ||
      !Number.isFinite(row.speedMps) ||
      row.speedMps < 0 ||
      !Number.isFinite(row.leaderSpeedMps) ||
      row.leaderSpeedMps < 0 ||
      !row.leaderId
    )
      throw new Error('Invalid following observation');
    if (
      e.opportunityId !== o.id ||
      e.kind !== o.kind ||
      e.vehicleId !== o.vehicleId ||
      e.incarnation !== o.incarnation ||
      a.windowId !== e.windowId ||
      a.segmentId !== e.segmentId ||
      a.vehicleId !== e.vehicleId ||
      a.incarnation !== e.incarnation ||
      !o.segmentIds.includes(e.segmentId) ||
      a.controlMode !== e.controlMode ||
      a.learningEligible !== e.learningEligible
    )
      throw new Error('Mismatched following opportunity identity');
    const valid =
      o.state === 'RESOLVED' &&
      o.learningEligible &&
      e.learningEligible &&
      e.controlMode === 'LEARNING' &&
      e.label === 'LEADER' &&
      e.windowClass === 'EXTERNAL_CONSTRAINT' &&
      a.windowClass === 'PREFIX_ELIGIBLE' &&
      a.prefix !== null &&
      a.prefix.ticks > 0;
    if (!valid) continue;
    if (row.context === 'LEADER') {
      if (previousLeader !== null && previousLeader !== row.leaderId) leaderChangeSplits++;
      previousLeader = row.leaderId;
    }
    const id = `${o.id}\u0000${o.occurrence}\u0000${row.leaderId}`;
    if (!unique.has(id)) unique.set(id, row);
  }
  const moving = [...unique.values()].filter(
    (row) => row.context === 'LEADER' && row.speedMps > 0.1 && row.leaderSpeedMps > 0.1,
  );
  const queue = [...unique.values()].filter(
    (row) => row.context === 'QUEUE_STANDSTILL' && row.speedMps <= 0.1 && row.leaderSpeedMps <= 0.1,
  );
  const head = moving.map((x) => x.speedMps);
  const gaps = moving.map((x) => x.gapM);
  const meanX = head.length ? head.reduce((a, b) => a + b, 0) / head.length : 0;
  const meanY = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const variance = head.reduce((s, x) => s + (x - meanX) ** 2, 0);
  const slope =
    variance > 1e-9
      ? head.reduce((s, x, i) => s + (x - meanX) * (gaps[i]! - meanY), 0) / variance
      : null;
  const intercept = slope === null ? null : meanY - slope * meanX;
  const residualRms =
    slope === null
      ? null
      : Math.sqrt(
          gaps.reduce((s, y, i) => s + (y - (intercept! + slope * head[i]!)) ** 2, 0) / gaps.length,
        );
  const speedGainValues = moving
    .map((x) => x.speedGain)
    .filter((x): x is number => x !== undefined && Number.isFinite(x));
  function result(
    key: FollowingEstimatorKey,
    values: readonly unknown[],
    status: 'CANDIDATE' | 'UNOBSERVED' | 'UNIDENTIFIED',
    value: number | null,
    reason: string | null,
    rms: number | null,
  ): FollowingCandidate {
    const evidence = reads.get(key);
    const spec = specs.get(key)!;
    const sufficient = values.length >= spec.minimumEpisodes;
    const clipped = value === null ? null : Math.max(spec.min, Math.min(spec.max, value));
    const quality =
      evidence?.status === 'READY' && sufficient && clipped !== null
        ? Math.max(0, Math.min(1, 1 - (rms ?? 0) / Math.max(1, Math.abs(clipped))))
        : 0;
    return Object.freeze({
      key,
      status:
        evidence?.status === 'READY' && sufficient
          ? status
          : status === 'UNIDENTIFIED'
            ? status
            : 'UNOBSERVED',
      value: evidence?.status === 'READY' && sufficient ? clipped : null,
      confidence:
        quality >= 0.8 ? 'HIGH' : quality >= 0.5 ? 'MODERATE' : quality > 0 ? 'LOW' : 'NONE',
      quality,
      sourceEpisodeCount: evidence?.distinctEpisodes ?? 0,
      contextBreakdown: evidence?.contextBreakdown ?? Object.freeze([]),
      reason:
        evidence?.status !== 'READY'
          ? (evidence?.noEstimate ?? 'NO_QUALIFYING_EVIDENCE')
          : !sufficient
            ? 'INSUFFICIENT_MATCHING_OBSERVATION_EPISODES'
            : reason,
      residualRmsM: rms,
    });
  }
  const varied = new Set(moving.map((x) => x.speedMps.toFixed(1))).size > 1;
  const identifiable =
    varied && slope !== null && intercept !== null && slope >= 0 && intercept >= 0;
  const candidates = Object.create(null) as Record<FollowingEstimatorKey, FollowingCandidate>;
  candidates.following_time_headway = result(
    'following_time_headway',
    moving,
    identifiable ? 'CANDIDATE' : moving.length ? 'UNIDENTIFIED' : 'UNOBSERVED',
    identifiable ? slope : null,
    identifiable ? null : 'WEAK_IDENTIFICATION_SPEED_VARIATION_REQUIRED',
    residualRms,
  );
  candidates.following_min_gap = result(
    'following_min_gap',
    moving,
    identifiable ? 'CANDIDATE' : moving.length ? 'UNIDENTIFIED' : 'UNOBSERVED',
    identifiable ? intercept : null,
    identifiable ? null : 'WEAK_IDENTIFICATION_SPEED_VARIATION_REQUIRED',
    residualRms,
  );
  candidates.queue_standstill_gap = result(
    'queue_standstill_gap',
    queue,
    queue.length ? 'CANDIDATE' : 'UNOBSERVED',
    queue.length ? queue.reduce((s, x) => s + x.gapM, 0) / queue.length : null,
    queue.length ? null : 'NO_STANDSTILL_QUEUE_EPISODES',
    null,
  );
  candidates.following_speed_gain = result(
    'following_speed_gain',
    speedGainValues,
    speedGainValues.length ? 'CANDIDATE' : 'UNOBSERVED',
    speedGainValues.length
      ? speedGainValues.reduce((a, b) => a + b, 0) / speedGainValues.length
      : null,
    speedGainValues.length ? null : 'NO_SPEED_GAIN_OBSERVATIONS',
    null,
  );
  return Object.freeze({
    version: FOLLOWING_ESTIMATOR_VERSION,
    candidates: Object.freeze(candidates),
    leaderChangeSplits,
  });
}
