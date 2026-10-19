import { parameterEvidenceSpecs } from './parameter-evidence';
import type { ParameterEvidenceReadModel } from './parameter-evidence';
import type { ParameterKey } from '../profiles';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  OpportunityDenominators,
  OpportunityRecord,
} from '../telemetry';

export const SIGNAL_ESTIMATOR_VERSION = '097-signal-estimator-v1' as const;
export const SIGNAL_ESTIMATOR_KEYS = Object.freeze([
  'red_stop_probability',
  'green_start_delay',
  'red_stop_line_offset',
  'late_red_brake_threshold',
] as const);
export type SignalEstimatorKey = (typeof SIGNAL_ESTIMATOR_KEYS)[number];
export interface SignalEstimatorObservation {
  readonly eligibility: EligibilityWindowRecord;
  readonly opportunity: OpportunityRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly greenOnsetTick?: number;
  readonly departureTick?: number;
  readonly departureBlockedByLeader?: boolean;
  readonly stopLineOffsetM?: number;
  readonly brakeThresholdMps2?: number;
  readonly repeatedFrame?: boolean;
}
export interface SignalCandidate {
  readonly key: SignalEstimatorKey;
  readonly status: 'CANDIDATE' | 'UNOBSERVED' | 'REFUSED';
  readonly value: number | null;
  readonly confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'NONE';
  readonly quality: number;
  readonly sourceEpisodeCount: number;
  readonly contextBreakdown: ParameterEvidenceReadModel['contextBreakdown'];
  readonly reason: string | null;
}
export interface SignalEstimatorResult {
  readonly version: typeof SIGNAL_ESTIMATOR_VERSION;
  readonly candidates: Readonly<Record<SignalEstimatorKey, SignalCandidate>>;
  readonly totalRedOpportunities: number;
  readonly certainRedDenominator: number;
  readonly truncatedRedOpportunities: number;
  readonly blockedGreenDepartures: number;
  readonly duplicateFramesIgnored: number;
}
const specs = new Map(parameterEvidenceSpecs.map((spec) => [spec.key, spec]));

/** Candidate-only signal estimates. 086 certain denominators, never frames, govern compliance. */
export function estimateSignalParameters(
  evidenceReadModel: readonly ParameterEvidenceReadModel[],
  denominators: OpportunityDenominators,
  observations: readonly SignalEstimatorObservation[],
): SignalEstimatorResult {
  const reads = new Map<ParameterKey, ParameterEvidenceReadModel>();
  for (const row of evidenceReadModel) {
    if (!specs.has(row.key)) throw new Error(`Unknown evidence key: ${row.key}`);
    reads.set(row.key, row);
  }
  const redDenom = denominators.byKind.find((x) => x.kind === 'RED');
  const redTotal = redDenom?.total ?? 0;
  const redCertain = redDenom?.learningEligibleCertain ?? 0;
  const redTruncated = redDenom?.incomplete ?? 0;
  const unique = new Map<string, SignalEstimatorObservation>();
  let duplicateFramesIgnored = 0;
  let blockedGreenDepartures = 0;
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
      throw new Error('Mismatched signal observation identity');
    const key = `${o.id}\u0000${o.occurrence}`;
    if (unique.has(key)) {
      duplicateFramesIgnored++;
      continue;
    }
    unique.set(key, row);
    if (o.kind === 'GREEN' && row.departureTick !== undefined && row.departureBlockedByLeader)
      blockedGreenDepartures++;
  }
  const rows = [...unique.values()].filter(
    (r) =>
      r.opportunity.learningEligible &&
      r.eligibility.learningEligible &&
      r.eligibility.controlMode === 'LEARNING' &&
      r.eligibility.windowClass === 'ELIGIBLE' &&
      r.artifacts.windowClass === 'PREFIX_ELIGIBLE' &&
      r.artifacts.prefix !== null &&
      r.artifacts.prefix.ticks > 0 &&
      r.opportunity.state === 'RESOLVED',
  );
  const red = rows.filter(
    (r) => r.opportunity.kind === 'RED' && r.eligibility.label === 'FREE_TRAFFIC',
  );
  const redOrStopApproaches = rows.filter(
    (r) =>
      (r.opportunity.kind === 'RED' || r.opportunity.kind === 'STOP') &&
      r.eligibility.label === 'FREE_TRAFFIC',
  );
  const green = rows.filter(
    (r) =>
      r.opportunity.kind === 'GREEN' &&
      r.eligibility.label === 'FREE_TRAFFIC' &&
      !r.departureBlockedByLeader &&
      Number.isSafeInteger(r.greenOnsetTick) &&
      Number.isSafeInteger(r.departureTick) &&
      r.departureTick! >= r.greenOnsetTick!,
  );
  const offsets = redOrStopApproaches
    .map((r) => r.stopLineOffsetM)
    .filter((v): v is number => v !== undefined && Number.isFinite(v));
  const brakes = redOrStopApproaches
    .map((r) => r.brakeThresholdMps2)
    .filter((v): v is number => v !== undefined && Number.isFinite(v) && v >= 0);
  const delays = green.map((r) => (r.departureTick! - r.greenOnsetTick!) / 60);
  const redsCertain = red.filter((r) => r.opportunity.result !== null);
  const compliant = redsCertain.filter((r) => r.opportunity.outcome === 'HELD').length;
  function candidate(
    key: SignalEstimatorKey,
    values: readonly number[],
    value: number | null,
    reason: string | null,
    refuse = false,
  ): SignalCandidate {
    const read = reads.get(key);
    const spec = specs.get(key)!;
    const ready = read?.status === 'READY' && values.length >= spec.minimumEpisodes;
    return Object.freeze({
      key,
      status: refuse ? 'REFUSED' : ready ? 'CANDIDATE' : 'UNOBSERVED',
      value: ready && !refuse ? value : null,
      confidence:
        ready && !refuse
          ? read!.quality >= 0.8
            ? 'HIGH'
            : read!.quality >= 0.5
              ? 'MODERATE'
              : 'LOW'
          : 'NONE',
      quality: ready && !refuse ? read!.quality : 0,
      sourceEpisodeCount: read?.distinctEpisodes ?? 0,
      contextBreakdown: read?.contextBreakdown ?? Object.freeze([]),
      reason: refuse
        ? reason
        : ready
          ? null
          : reason?.startsWith('INCOMPLETE_')
            ? reason
            : read?.status === 'READY' && values.length < spec.minimumEpisodes
              ? 'INSUFFICIENT_MATCHING_OPPORTUNITIES'
              : (read?.noEstimate ?? reason ?? 'NO_QUALIFYING_EVIDENCE'),
    });
  }
  const candidates = Object.create(null) as Record<SignalEstimatorKey, SignalCandidate>;
  candidates.red_stop_probability = candidate(
    'red_stop_probability',
    redsCertain.length === redCertain ? redsCertain.map(() => 1) : [],
    redCertain > 0 ? compliant / redCertain : null,
    redCertain === 0
      ? 'ZERO_CERTAIN_RED_DENOMINATOR'
      : redsCertain.length !== redCertain
        ? 'INCOMPLETE_086_RED_DENOMINATOR_FACTS'
        : null,
    redCertain === 0,
  );
  candidates.green_start_delay = candidate(
    'green_start_delay',
    delays,
    delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null,
    'NO_UNBLOCKED_GREEN_DEPARTURES',
  );
  candidates.red_stop_line_offset = candidate(
    'red_stop_line_offset',
    offsets,
    offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : null,
    'NO_ELIGIBLE_RED_STOP_LINE_FACTS',
  );
  candidates.late_red_brake_threshold = candidate(
    'late_red_brake_threshold',
    brakes,
    brakes.length ? brakes.reduce((a, b) => a + b, 0) / brakes.length : null,
    'NO_ELIGIBLE_RED_BRAKE_FACTS',
  );
  return Object.freeze({
    version: SIGNAL_ESTIMATOR_VERSION,
    candidates: Object.freeze(candidates),
    totalRedOpportunities: redTotal,
    certainRedDenominator: redCertain,
    truncatedRedOpportunities: redTruncated,
    blockedGreenDepartures,
    duplicateFramesIgnored,
  });
}
