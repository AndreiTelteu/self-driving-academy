import { parameterEvidenceSpecs } from './parameter-evidence';
import type { ParameterEvidenceReadModel } from './parameter-evidence';
import type { ParameterKey } from '../profiles';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  OpportunityRecord,
} from '../telemetry';

export const LANE_ESTIMATOR_VERSION = '099-lane-estimator-v1' as const;
export const LANE_ESTIMATOR_KEYS = Object.freeze([
  'lane_change_front_gap',
  'lane_change_back_gap',
  'lane_change_speed_gain',
  'lane_change_cooldown',
] as const);
export type LaneEstimatorKey = (typeof LANE_ESTIMATOR_KEYS)[number];
export interface LaneEstimatorObservation {
  readonly eligibility: EligibilityWindowRecord;
  readonly opportunity: OpportunityRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly routeRequired: boolean;
  readonly outcome: 'COMPLETED' | 'REJECTED' | 'ABORTED';
  readonly frontGapM: number;
  readonly backGapM: number;
  readonly speedAdvantageMps: number;
  /** Exact optional manoeuvre to manoeuvre elapsed ticks, when available. */
  readonly cooldownTicks?: number;
  readonly repeatedFrame?: boolean;
}
export interface LaneCandidate {
  readonly key: LaneEstimatorKey;
  readonly status: 'CANDIDATE' | 'UNOBSERVED' | 'UNIDENTIFIED';
  readonly value: number | null;
  readonly interval: readonly [number, number] | null;
  readonly bound: number | null;
  readonly confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'NONE';
  readonly quality: number;
  readonly sourceEpisodeCount: number;
  readonly contextBreakdown: ParameterEvidenceReadModel['contextBreakdown'];
  readonly reason: string | null;
}
export interface LaneEstimatorResult {
  readonly version: typeof LANE_ESTIMATOR_VERSION;
  readonly candidates: Readonly<Record<LaneEstimatorKey, LaneCandidate>>;
  readonly routeForcedExcluded: number;
  readonly optionalOpportunityCount: number;
  readonly duplicateFramesIgnored: number;
}
const specs = new Map(parameterEvidenceSpecs.map((spec) => [spec.key, spec]));

/** Candidate-only optional lane-change estimator; route-forced manoeuvres remain separate. */
export function estimateLaneChangeParameters(
  evidenceReadModel: readonly ParameterEvidenceReadModel[],
  observations: readonly LaneEstimatorObservation[],
): LaneEstimatorResult {
  const reads = new Map<ParameterKey, ParameterEvidenceReadModel>();
  for (const row of evidenceReadModel) {
    if (!specs.has(row.key)) throw new Error(`Unknown evidence key: ${row.key}`);
    reads.set(row.key, row);
  }
  const unique = new Map<string, LaneEstimatorObservation>();
  let duplicateFramesIgnored = 0,
    routeForcedExcluded = 0;
  for (const row of observations) {
    const { eligibility: e, opportunity: o, artifacts: a } = row;
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
      throw new Error('Mismatched lane-change observation identity');
    if (
      ![row.frontGapM, row.backGapM, row.speedAdvantageMps].every(Number.isFinite) ||
      row.frontGapM < 0 ||
      row.backGapM < 0 ||
      (row.cooldownTicks !== undefined &&
        (!Number.isSafeInteger(row.cooldownTicks) || row.cooldownTicks < 0))
    )
      throw new Error('Invalid lane-change observation values');
    if (
      (row.outcome === 'COMPLETED' && o.outcome !== 'COMPLETED') ||
      (row.outcome !== 'COMPLETED' && o.outcome !== 'ABORTED')
    )
      throw new Error('Lane-change fact contradicts the certain 086 outcome');
    const id = `${o.id}\u0000${o.occurrence}`;
    if (unique.has(id)) {
      duplicateFramesIgnored++;
      continue;
    }
    unique.set(id, row);
    if (row.routeRequired) routeForcedExcluded++;
  }
  const rows = [...unique.values()].filter(
    (r) =>
      !r.routeRequired &&
      r.opportunity.kind === 'LANE_CHANGE' &&
      r.opportunity.learningEligible &&
      r.eligibility.learningEligible &&
      r.eligibility.controlMode === 'LEARNING' &&
      r.opportunity.state === 'RESOLVED' &&
      r.artifacts.windowClass === 'PREFIX_ELIGIBLE' &&
      r.artifacts.prefix !== null &&
      r.artifacts.prefix.ticks > 0 &&
      r.artifacts.completeness !== 'TRUNCATED',
  );
  const accepted = rows.filter((r) => r.outcome === 'COMPLETED');
  const rejected = rows.filter((r) => r.outcome !== 'COMPLETED');
  function candidate(
    key: LaneEstimatorKey,
    value: number | null,
    values: readonly number[],
    interval: readonly [number, number] | null,
    bound: number | null,
    reason: string | null,
    unidentified = false,
  ): LaneCandidate {
    const read = reads.get(key),
      spec = specs.get(key)!;
    const ready = read?.status === 'READY' && values.length >= spec.minimumEpisodes;
    return Object.freeze({
      key,
      status: ready ? (unidentified ? 'UNIDENTIFIED' : 'CANDIDATE') : 'UNOBSERVED',
      value: ready && !unidentified ? value : null,
      interval: ready ? interval : null,
      bound: ready ? bound : null,
      confidence:
        ready && !unidentified
          ? read!.quality >= 0.8
            ? 'HIGH'
            : read!.quality >= 0.5
              ? 'MODERATE'
              : 'LOW'
          : 'NONE',
      quality: ready && !unidentified ? read!.quality : 0,
      sourceEpisodeCount: read?.distinctEpisodes ?? 0,
      contextBreakdown: read?.contextBreakdown ?? Object.freeze([]),
      reason: ready
        ? unidentified
          ? reason
          : null
        : (reason ?? read?.noEstimate ?? 'NO_QUALIFYING_EVIDENCE'),
    });
  }
  const candidates = Object.create(null) as Record<LaneEstimatorKey, LaneCandidate>;
  for (const [key, field] of [
    ['lane_change_front_gap', 'frontGapM'],
    ['lane_change_back_gap', 'backGapM'],
    ['lane_change_speed_gain', 'speedAdvantageMps'],
  ] as const) {
    const pass = accepted.map((r) => r[field]),
      fail = rejected.map((r) => r[field]);
    const interval =
      pass.length && fail.length
        ? Object.freeze([Math.max(...fail), Math.min(...pass)] as const)
        : null;
    const bound = pass.length && !fail.length ? Math.min(...pass) : null;
    const crossed = Boolean(interval && interval[0] > interval[1]);
    candidates[key] = candidate(
      key,
      interval ? null : pass.length ? Math.min(...pass) : null,
      [...pass, ...fail],
      interval,
      bound,
      pass.length ? 'OBSERVED_BOUND_ONLY' : 'NO_ACCEPTED_OPTIONAL_MANOEUVRE',
      crossed,
    );
  }
  const cooldowns = rows
    .filter((r) => r.outcome === 'COMPLETED' && r.cooldownTicks !== undefined)
    .map((r) => r.cooldownTicks! / 60);
  candidates.lane_change_cooldown = candidate(
    'lane_change_cooldown',
    cooldowns.length ? cooldowns.reduce((a, b) => a + b, 0) / cooldowns.length : null,
    cooldowns,
    null,
    null,
    'NO_MEASURED_OPTIONAL_COOLDOWN',
  );
  return Object.freeze({
    version: LANE_ESTIMATOR_VERSION,
    candidates: Object.freeze(candidates),
    routeForcedExcluded,
    optionalOpportunityCount: rows.length,
    duplicateFramesIgnored,
  });
}
