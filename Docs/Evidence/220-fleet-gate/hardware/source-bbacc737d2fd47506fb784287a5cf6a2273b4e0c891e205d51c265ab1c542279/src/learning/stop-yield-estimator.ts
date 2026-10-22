import { parameterEvidenceSpecs } from './parameter-evidence';
import type { ParameterEvidenceReadModel } from './parameter-evidence';
import type { ParameterKey } from '../profiles';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  OpportunityDenominators,
  OpportunityRecord,
} from '../telemetry';

export const STOP_YIELD_ESTIMATOR_VERSION = '098-stop-yield-estimator-v1' as const;
export const STOP_YIELD_ESTIMATOR_KEYS = Object.freeze([
  'stop_full_probability',
  'stop_dwell_time',
  'stop_line_offset',
  'yield_time_gap',
] as const);
export type StopYieldEstimatorKey = (typeof STOP_YIELD_ESTIMATOR_KEYS)[number];
export interface StopYieldEstimatorObservation {
  readonly eligibility: EligibilityWindowRecord;
  readonly opportunity: OpportunityRecord;
  readonly artifacts: FilteredWindowRecord;
  /** Real STOP decision: traffic-induced stops are not stop-line compliance decisions. */
  readonly stopCause?: 'STOP_LINE' | 'LEADER' | 'QUEUE' | 'BLOCKED';
  readonly rollingStop?: boolean;
  readonly fullStop?: boolean;
  readonly dwellTicks?: number;
  readonly stopLineOffsetM?: number;
  /** Signed 052 interval separation in seconds for this YIELD opportunity. */
  readonly yieldGapS?: number;
  readonly repeatedFrame?: boolean;
}
export interface StopYieldCandidate {
  readonly key: StopYieldEstimatorKey;
  readonly status: 'CANDIDATE' | 'UNOBSERVED' | 'REFUSED';
  readonly value: number | null;
  readonly interval: readonly [number, number] | null;
  readonly bound: number | null;
  readonly confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'NONE';
  readonly quality: number;
  readonly sourceEpisodeCount: number;
  readonly contextBreakdown: ParameterEvidenceReadModel['contextBreakdown'];
  readonly reason: string | null;
}
export interface StopYieldEstimatorResult {
  readonly version: typeof STOP_YIELD_ESTIMATOR_VERSION;
  readonly candidates: Readonly<Record<StopYieldEstimatorKey, StopYieldCandidate>>;
  /** 086 cumulative learning-eligible certain STOP opportunities, before 087 free-traffic filtering. */
  readonly certainStopOpportunityDenominator: number;
  /** 087 FREE_TRAFFIC, real STOP_LINE subset used by stop_full_probability. */
  readonly certainStopDenominator: number;
  readonly totalStopOpportunities: number;
  readonly truncatedStopOpportunities: number;
  readonly certainYieldDenominator: number;
  readonly trafficInducedStopsExcluded: number;
  readonly rollingStops: number;
  readonly duplicateFramesIgnored: number;
}
const specs = new Map(parameterEvidenceSpecs.map((spec) => [spec.key, spec]));
const trafficCauses = new Set(['LEADER', 'QUEUE', 'BLOCKED']);

/** Candidate-only STOP/YIELD estimates. 086 owns the cumulative opportunity denominators. */
export function estimateStopYieldParameters(
  evidenceReadModel: readonly ParameterEvidenceReadModel[],
  denominators: OpportunityDenominators,
  observations: readonly StopYieldEstimatorObservation[],
): StopYieldEstimatorResult {
  const reads = new Map<ParameterKey, ParameterEvidenceReadModel>();
  for (const row of evidenceReadModel) {
    if (!specs.has(row.key)) throw new Error(`Unknown evidence key: ${row.key}`);
    reads.set(row.key, row);
  }
  const stopDenom = denominators.byKind.find((row) => row.kind === 'STOP');
  const yieldDenom = denominators.byKind.find((row) => row.kind === 'YIELD');
  const certainStopOpportunityDenominator = stopDenom?.learningEligibleCertain ?? 0;
  const totalStopOpportunities = stopDenom?.total ?? 0;
  const truncatedStopOpportunities = stopDenom?.incomplete ?? 0;
  const certainYieldDenominator = yieldDenom?.learningEligibleCertain ?? 0;
  const unique = new Map<string, StopYieldEstimatorObservation>();
  let duplicateFramesIgnored = 0;
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
      throw new Error('Mismatched STOP/YIELD observation identity');
    if (
      row.dwellTicks !== undefined &&
      (!Number.isSafeInteger(row.dwellTicks) || row.dwellTicks < 0)
    )
      throw new Error('Invalid exact STOP dwell ticks');
    if (row.stopLineOffsetM !== undefined && !Number.isFinite(row.stopLineOffsetM))
      throw new Error('Invalid STOP line offset');
    if (row.yieldGapS !== undefined && !Number.isFinite(row.yieldGapS))
      throw new Error('Invalid YIELD gap');
    if (row.fullStop === true && o.outcome !== 'STOPPED')
      throw new Error('Full STOP fact contradicts the certain 086 outcome');
    if (row.rollingStop === true && o.outcome !== 'CROSSED_WITHOUT_STOP')
      throw new Error('Rolling STOP fact contradicts the certain 086 outcome');
    const id = `${o.id}\u0000${o.occurrence}`;
    if (unique.has(id)) {
      duplicateFramesIgnored++;
      continue;
    }
    unique.set(id, row);
  }
  const rows = [...unique.values()].filter((r) => {
    const { eligibility: e, opportunity: o, artifacts: a } = r;
    return (
      o.learningEligible &&
      e.learningEligible &&
      e.controlMode === 'LEARNING' &&
      o.state === 'RESOLVED' &&
      a.windowClass === 'PREFIX_ELIGIBLE' &&
      a.prefix !== null &&
      a.prefix.ticks > 0 &&
      a.completeness !== 'TRUNCATED'
    );
  });
  const stopOpportunities = rows.filter((r) => r.opportunity.kind === 'STOP');
  const stops = stopOpportunities.filter((r) => r.eligibility.label === 'FREE_TRAFFIC');
  const stopLine = stops.filter((r) => r.stopCause === 'STOP_LINE');
  const trafficInducedStopsExcluded = stopOpportunities.filter(
    (r) => r.stopCause !== undefined && trafficCauses.has(r.stopCause),
  ).length;
  const certainStopDenominator = stopLine.length;
  const rollingStops = stopLine.filter((r) => r.rollingStop === true).length;
  const stopFacts = stopLine.filter((r) => r.rollingStop !== undefined || r.fullStop !== undefined);
  const fullCount = stopFacts.filter((r) => r.fullStop === true && r.rollingStop !== true).length;
  const dwell = stopLine
    .filter((r) => r.fullStop === true && r.dwellTicks !== undefined)
    .map((r) => r.dwellTicks! / 60);
  const offsets = stopLine
    .filter((r) => r.stopLineOffsetM !== undefined)
    .map((r) => r.stopLineOffsetM!);
  const yields = rows.filter(
    (r) =>
      r.opportunity.kind === 'YIELD' &&
      r.eligibility.label === 'LEADER' &&
      r.yieldGapS !== undefined,
  );
  // Accepted means proceeding through the offered gap; YIELDED means the gap was refused.
  const accepted = yields
    .filter((r) => r.opportunity.outcome === 'PROCEEDED')
    .map((r) => r.yieldGapS!);
  const refused = yields
    .filter((r) => r.opportunity.outcome === 'YIELDED')
    .map((r) => r.yieldGapS!);
  function make(
    key: StopYieldEstimatorKey,
    values: readonly number[],
    value: number | null,
    reason: string | null,
    refuse = false,
    interval: readonly [number, number] | null = null,
    bound: number | null = null,
  ): StopYieldCandidate {
    const read = reads.get(key),
      spec = specs.get(key)!;
    const ready = read?.status === 'READY' && values.length >= spec.minimumEpisodes;
    return Object.freeze({
      key,
      status: refuse ? 'REFUSED' : ready ? 'CANDIDATE' : 'UNOBSERVED',
      value: ready && !refuse ? value : null,
      interval: ready && !refuse ? interval : null,
      bound: ready && !refuse ? bound : null,
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
          : (reason ?? read?.noEstimate ?? 'NO_QUALIFYING_EVIDENCE'),
    });
  }
  const candidates = Object.create(null) as Record<StopYieldEstimatorKey, StopYieldCandidate>;
  candidates.stop_full_probability = make(
    'stop_full_probability',
    stopFacts.map(() => 1),
    stopFacts.length ? fullCount / stopFacts.length : null,
    certainStopDenominator === 0
      ? 'ZERO_ELIGIBLE_STOP_DENOMINATOR'
      : stopOpportunities.length !== certainStopOpportunityDenominator
        ? 'INCOMPLETE_086_STOP_DENOMINATOR_FACTS'
        : stopLine.length !== stops.length || stopFacts.length !== certainStopDenominator
          ? 'INCOMPLETE_STOP_LINE_FACTS'
          : null,
    certainStopDenominator === 0 ||
      stopOpportunities.length !== certainStopOpportunityDenominator ||
      stopLine.length !== stops.length ||
      stopFacts.length !== certainStopDenominator,
  );
  candidates.stop_dwell_time = make(
    'stop_dwell_time',
    dwell,
    dwell.length ? dwell.reduce((a, b) => a + b, 0) / dwell.length : null,
    'NO_MEASURED_FULL_STOP_DWELL',
  );
  candidates.stop_line_offset = make(
    'stop_line_offset',
    offsets,
    offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : null,
    'NO_ELIGIBLE_STOP_LINE_OFFSETS',
  );
  const gapValues = [...refused, ...accepted];
  const gapInterval =
    accepted.length && refused.length
      ? Object.freeze([Math.max(...refused), Math.min(...accepted)] as const)
      : null;
  const gapBound = accepted.length && !refused.length ? Math.min(...accepted) : null;
  candidates.yield_time_gap = make(
    'yield_time_gap',
    gapValues,
    null,
    gapInterval && gapInterval[0] <= gapInterval[1]
      ? null
      : gapBound !== null
        ? null
        : 'NO_ACCEPTED_YIELD_GAP',
    Boolean(gapInterval && gapInterval[0] > gapInterval[1]),
    gapInterval,
    gapBound,
  );
  if (gapInterval && gapInterval[0] <= gapInterval[1]) {
    const read = reads.get('yield_time_gap');
    if (
      read?.status === 'READY' &&
      gapValues.length >= specs.get('yield_time_gap')!.minimumEpisodes
    )
      candidates.yield_time_gap = Object.freeze({
        ...candidates.yield_time_gap,
        status: 'CANDIDATE',
        interval: gapInterval,
        reason: null,
      });
  }
  return Object.freeze({
    version: STOP_YIELD_ESTIMATOR_VERSION,
    candidates: Object.freeze(candidates),
    certainStopOpportunityDenominator,
    certainStopDenominator,
    totalStopOpportunities,
    truncatedStopOpportunities,
    certainYieldDenominator,
    trafficInducedStopsExcluded,
    rollingStops,
    duplicateFramesIgnored,
  });
}
