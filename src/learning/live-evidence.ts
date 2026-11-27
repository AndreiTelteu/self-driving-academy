import { createParameterEvidenceLedger, parameterEvidenceSpecs } from './parameter-evidence';
import type {
  EvidenceObservation,
  ParameterEvidenceEpisode,
  ParameterEvidenceReadModel,
} from './parameter-evidence';
import { estimateSpeedParameters } from './speed-estimator';
import type { SpeedEstimatorObservation } from './speed-estimator';
import { estimateStopYieldParameters } from './stop-yield-estimator';
import type { StopYieldEstimatorObservation } from './stop-yield-estimator';
import type { ConfidenceCandidate } from './evidence-confidence';
import type { ProfileBlendEpisode } from './profile-blend';
import { getParameterDefinition } from '../profiles';
import type { ParameterKey } from '../profiles';
import { OPPORTUNITY_VERSION, opportunityKinds, opportunitySuccessOutcomes } from '../telemetry';
import type {
  EligibilityWindowRecord,
  FilteredWindowRecord,
  LiveTelemetrySegmentRead,
  OpportunityDenominators,
  OpportunityRecord,
  TickSampleObservation,
} from '../telemetry';

/**
 * PBI 273 live evidence adapter.
 *
 * A closed 272 segment is already a real 085/086/087/088 observation. This module projects those
 * facts into the existing 093 read models, calls the existing 094/098 estimators and returns the
 * payload the real 103 queue consumes. It does not create a second estimator, a second opportunity
 * registry or a second segment store.
 *
 * The only structural adaptation is the 088 artifact window: 272 keeps one artifact window per
 * segment, while 093 correlates a window with the 087 opportunity identity. The adapter re-keys the
 * real prefix and artifacts to the eligibility window identity without changing ticks, completeness
 * or vehicle/segment facts. No evidence, sample or estimate is fabricated.
 */
export const LIVE_EVIDENCE_VERSION = '273-live-evidence-v1' as const;

export const liveEvidenceKeys = Object.freeze([
  'stop_full_probability',
  'speed_delta_urban',
  'speed_delta_residential',
  'stop_dwell_time',
  'intersection_approach_speed',
  'stop_line_offset',
] as const satisfies readonly ParameterKey[]);
export type LiveEvidenceKey = (typeof liveEvidenceKeys)[number];

export interface LiveEvidenceCandidateView {
  readonly key: ParameterKey;
  readonly status: string;
  readonly value: number | null;
  readonly interval: readonly [number, number] | null;
  readonly evidenceStatus: ParameterEvidenceReadModel['status'];
  readonly distinctEpisodes: number;
  readonly reason: string | null;
}

export interface LiveEvidenceObservations {
  readonly opportunities: number;
  readonly resolvedOpportunities: number;
  readonly eligibleWindows: number;
  readonly speedWindows: number;
  readonly stopOpportunities: number;
  readonly prefixTicks: number;
}

export interface LiveEvidencePayload {
  readonly version: typeof LIVE_EVIDENCE_VERSION;
  readonly segmentId: string;
  readonly key: ParameterKey;
  readonly baseValue: number;
  readonly evidence: ParameterEvidenceReadModel;
  readonly episodes: readonly ProfileBlendEpisode[];
  readonly candidate: ConfidenceCandidate;
  readonly evidenceReady: boolean;
  readonly candidateReady: boolean;
  readonly insufficient: boolean;
  readonly reason: string | null;
  readonly observations: LiveEvidenceObservations;
  readonly candidates: readonly LiveEvidenceCandidateView[];
}

export interface LiveEvidenceOptions {
  /** Current value of the selected key at the segment's base version. */
  readonly baseValue: (key: ParameterKey) => number;
}

function median(values: readonly number[]): number | null {
  const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (finite.length === 0) return null;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 === 1 ? finite[middle]! : (finite[middle - 1]! + finite[middle]!) / 2;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * The authored 032 map encodes arterial (30 mph = 13.4 m/s) and residential (25 mph = 11.2 m/s)
 * limits. A different limit is honestly `OTHER` rather than being coerced into one of them.
 */
export function liveRoadType(speedLimitMps: number | null): 'URBAN' | 'RESIDENTIAL' | 'OTHER' {
  if (speedLimitMps === null || !Number.isFinite(speedLimitMps) || speedLimitMps <= 0)
    return 'OTHER';
  if (Math.abs(speedLimitMps - 13.4) <= 0.3) return 'URBAN';
  if (Math.abs(speedLimitMps - 11.2) <= 0.3) return 'RESIDENTIAL';
  return 'OTHER';
}

function roadTypeLabel(kind: 'URBAN' | 'RESIDENTIAL' | 'OTHER'): string {
  return kind === 'URBAN' ? 'urban' : kind === 'RESIDENTIAL' ? 'residential' : 'other';
}

function eligibilityWindowFor(
  segment: LiveTelemetrySegmentRead,
  opportunity: OpportunityRecord,
): EligibilityWindowRecord | null {
  const summary = segment.summary;
  const rows = segment.windows.filter(
    (windowRecord) =>
      windowRecord.opportunityId === opportunity.id &&
      windowRecord.kind === opportunity.kind &&
      windowRecord.vehicleId === opportunity.vehicleId &&
      windowRecord.incarnation === opportunity.incarnation &&
      windowRecord.segmentId === summary.segmentId,
  );
  const usable = rows.filter((windowRecord) => windowRecord.windowClass !== 'EXCLUDED');
  const pool = usable.length > 0 ? usable : rows;
  return (
    [...pool].sort(
      (left, right) =>
        right.lastTick - left.lastTick || left.windowId.localeCompare(right.windowId),
    )[0] ?? null
  );
}

/** Re-key the real segment artifact window to the 087 window identity without changing its facts. */
function projectArtifacts(
  segment: LiveTelemetrySegmentRead,
  eligibilityWindow: EligibilityWindowRecord,
): FilteredWindowRecord | null {
  const artifact = segment.artifactWindow;
  if (artifact === null) return null;
  return Object.freeze({
    ...artifact,
    windowId: eligibilityWindow.windowId,
    segmentId: segment.summary.segmentId,
    vehicleId: segment.summary.vehicleId,
    incarnation: eligibilityWindow.incarnation,
    controlMode: segment.summary.controlMode,
    learningEligible: segment.summary.learningEligible,
    startTick: segment.summary.startTick,
    endTick: segment.summary.endTick,
  }) as FilteredWindowRecord;
}

function speedOf(sample: TickSampleObservation): number {
  const velocity = sample.state.velocityMps;
  return Math.hypot(velocity.x, velocity.y, velocity.z);
}

function speedSamplesBetween(
  samples: readonly TickSampleObservation[],
  fromTick: number,
  toTick: number,
): readonly { readonly tick: number; readonly speedMps: number }[] {
  return Object.freeze(
    samples
      .filter((sample) => sample.tick >= fromTick && sample.tick <= toTick)
      .map((sample) => Object.freeze({ tick: sample.tick, speedMps: speedOf(sample) })),
  );
}

function denominatorsFor(opportunities: readonly OpportunityRecord[]): OpportunityDenominators {
  const byKind = opportunityKinds.map((kind) => {
    const rows = opportunities.filter((opportunity) => opportunity.kind === kind);
    const certain = rows.filter(
      (opportunity) => opportunity.state === 'RESOLVED' && opportunity.outcome !== null,
    );
    const success = certain.filter(
      (opportunity) =>
        opportunity.outcome !== null && opportunitySuccessOutcomes.includes(opportunity.outcome),
    ).length;
    return Object.freeze({
      kind,
      total: rows.length,
      certain: certain.length,
      success,
      failure: certain.length - success,
      incomplete: rows.filter((opportunity) => opportunity.state === 'TRUNCATED').length,
      entered: rows.filter((opportunity) => opportunity.state === 'ENTERED').length,
      learningEligibleCertain: certain.filter((opportunity) => opportunity.learningEligible).length,
    });
  });
  const total = opportunities.length;
  const certain = byKind.reduce((sum, row) => sum + row.certain, 0);
  const success = byKind.reduce((sum, row) => sum + row.success, 0);
  const failure = byKind.reduce((sum, row) => sum + row.failure, 0);
  const incomplete = byKind.reduce((sum, row) => sum + row.incomplete, 0);
  const entered = byKind.reduce((sum, row) => sum + row.entered, 0);
  const learningEligibleCertain = byKind.reduce((sum, row) => sum + row.learningEligibleCertain, 0);
  const reasons = new Map<string, number>();
  for (const opportunity of opportunities) {
    if (opportunity.state !== 'TRUNCATED' || opportunity.truncationReason === null) continue;
    reasons.set(opportunity.truncationReason, (reasons.get(opportunity.truncationReason) ?? 0) + 1);
  }
  return Object.freeze({
    version: OPPORTUNITY_VERSION,
    total,
    certain,
    success,
    failure,
    incomplete,
    entered,
    learningEligibleCertain,
    byKind: Object.freeze(byKind),
    truncatedByReason: Object.freeze(
      [...reasons.entries()]
        .map(([reason, count]) =>
          Object.freeze({
            reason: reason as OpportunityDenominators['truncatedByReason'][number]['reason'],
            count,
          }),
        )
        .sort((left, right) => left.reason.localeCompare(right.reason)),
    ),
  });
}

function readEpisodes(
  ledger: ReturnType<typeof createParameterEvidenceLedger>,
  key: ParameterKey,
): readonly ParameterEvidenceEpisode[] {
  return ledger.readEpisodes(key);
}

function blendEpisodes(
  ledger: ReturnType<typeof createParameterEvidenceLedger>,
  key: ParameterKey,
  values: ReadonlyMap<string, { readonly value?: number; readonly speedMps?: number }>,
): readonly ProfileBlendEpisode[] {
  return Object.freeze(
    readEpisodes(ledger, key).map((episode) => {
      const extra = values.get(`${key}\u0000${episode.opportunityId}\u0000${episode.occurrence}`);
      return Object.freeze({
        opportunityId: episode.opportunityId,
        occurrence: episode.occurrence,
        observedTicks: episode.observedTicks,
        ageSeconds: 0,
        ...(extra?.value === undefined ? {} : { value: extra.value }),
        ...(extra?.speedMps === undefined ? {} : { speedMps: extra.speedMps }),
      });
    }),
  );
}

function candidateOf(
  key: ParameterKey,
  candidate: ConfidenceCandidate | undefined,
): ConfidenceCandidate {
  return candidate ?? Object.freeze({ key, status: 'UNOBSERVED', value: null, interval: null });
}

/**
 * Builds the one job payload for a closed live segment. The selected key is deterministic: a real
 * STOP fact wins, then urban speed, then residential speed, and a segment without any qualifying
 * fact still produces `speed_delta_urban` with `NO_EVIDENCE` so the queue can answer `NO_CHANGE`
 * instead of a fabricated version.
 */
export function deriveLiveLearningPayload(
  segment: LiveTelemetrySegmentRead,
  options: LiveEvidenceOptions,
): LiveEvidencePayload {
  if (
    segment.summary.controlMode !== 'LEARNING' ||
    !segment.summary.learningEligible ||
    segment.summary.completeness !== 'CLOSED'
  )
    throw new Error('Live evidence requires a closed eligible LEARNING segment');
  if (segment.artifactWindow === null) {
    const ledger = createParameterEvidenceLedger();
    return assemblePayload({
      segment,
      ledger,
      key: 'speed_delta_urban',
      candidate: candidateOf('speed_delta_urban', undefined),
      episodeValues: new Map(),
      observations: {
        opportunities: segment.opportunities.length,
        resolvedOpportunities: 0,
        eligibleWindows: 0,
        speedWindows: 0,
        stopOpportunities: 0,
        prefixTicks: 0,
      },
      candidates: [],
      baseValue: options.baseValue,
    });
  }

  const samples = Object.freeze(
    segment.samples
      .map((readout) => readout.observation)
      .sort((left, right) => left.tick - right.tick),
  );
  const ledger = createParameterEvidenceLedger();
  const speedObservations: SpeedEstimatorObservation[] = [];
  const stopObservations: StopYieldEstimatorObservation[] = [];
  const episodeValues = new Map<string, { readonly value?: number; readonly speedMps?: number }>();
  let eligibleWindows = 0;
  let resolvedOpportunities = 0;
  const prefixTicks = segment.artifactWindow.prefix?.ticks ?? 0;

  for (const opportunity of segment.opportunities) {
    if (opportunity.state !== 'RESOLVED' || opportunity.result === null) continue;
    if (!opportunity.learningEligible) continue;
    const eligibilityWindow = eligibilityWindowFor(segment, opportunity);
    if (eligibilityWindow === null) continue;
    const artifacts = projectArtifacts(segment, eligibilityWindow);
    if (artifacts === null) continue;
    resolvedOpportunities += 1;
    if (eligibilityWindow.windowClass === 'ELIGIBLE') eligibleWindows += 1;
    const prefix = artifacts.prefix;
    const windowSamples =
      prefix === null ? [] : speedSamplesBetween(samples, prefix.fromTick, prefix.toTick);
    const limits = segment.samples
      .filter((sample) => sample.observation.tick >= (prefix?.fromTick ?? 0))
      .filter((sample) => sample.observation.tick <= (prefix?.toTick ?? -1))
      .map((sample) => sample.observation.speedLimitMps)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const postedLimitMps = median(limits);
    const roadKind = liveRoadType(postedLimitMps);
    const stopOutcome =
      opportunity.kind === 'STOP' &&
      (opportunity.outcome === 'STOPPED' || opportunity.outcome === 'CROSSED_WITHOUT_STOP')
        ? opportunity.outcome
        : undefined;
    if (windowSamples.length === 0 && stopOutcome === undefined) continue;

    const observation: EvidenceObservation = Object.freeze({
      eligibility: eligibilityWindow,
      opportunity,
      artifacts,
      roadType: roadTypeLabel(roadKind),
      ...(windowSamples.length === 0 ? {} : { speedSamples: windowSamples }),
      ...(stopOutcome === undefined ? {} : { stopOutcome }),
    });
    ledger.observe(observation);

    const identity = `${opportunity.id}\u0000${opportunity.occurrence}`;
    const medianSpeed = median(windowSamples.map((sample) => sample.speedMps));
    if (postedLimitMps !== null && medianSpeed !== null) {
      const delta = round(medianSpeed - postedLimitMps);
      for (const key of [
        'speed_delta_urban',
        'speed_delta_residential',
        'intersection_approach_speed',
      ] as const)
        episodeValues.set(`${key}\u0000${identity}`, {
          value: key === 'intersection_approach_speed' ? round(medianSpeed) : delta,
          speedMps: round(medianSpeed),
        });
    }
    if (stopOutcome !== undefined) {
      const full = stopOutcome === 'STOPPED';
      const dwellTicks =
        full && opportunity.resolvedTick !== null
          ? samples.filter(
              (sample) =>
                sample.tick >= opportunity.openedTick &&
                sample.tick <= opportunity.resolvedTick! &&
                speedOf(sample) <= 0.1,
            ).length
          : 0;
      for (const key of [
        'stop_full_probability',
        'red_stop_probability',
        'red_stop_line_offset',
        'late_red_brake_threshold',
      ] as const)
        episodeValues.set(`${key}\u0000${identity}`, {
          value: full ? 1 : 0,
          ...(medianSpeed === null ? {} : { speedMps: round(medianSpeed) }),
        });
      episodeValues.set(`stop_dwell_time\u0000${identity}`, {
        value: round(dwellTicks / 60),
        ...(medianSpeed === null ? {} : { speedMps: round(medianSpeed) }),
      });
    }

    if (
      eligibilityWindow.windowClass === 'ELIGIBLE' &&
      eligibilityWindow.label === 'FREE_TRAFFIC' &&
      postedLimitMps !== null &&
      windowSamples.length > 0
    ) {
      speedObservations.push(
        Object.freeze({
          eligibility: eligibilityWindow,
          artifacts,
          roadKind,
          postedLimitMps,
          speedSamples: windowSamples,
          intersectionApproach:
            opportunity.stimulus.stopLineId !== null || opportunity.stimulus.signalId !== null,
          curveRadiusM: null,
          normalized: null,
        }),
      );
    }

    if (stopOutcome !== undefined) {
      const stopCause =
        eligibilityWindow.windowClass === 'ELIGIBLE'
          ? ('STOP_LINE' as const)
          : eligibilityWindow.label === 'LEADER'
            ? ('LEADER' as const)
            : eligibilityWindow.label === 'BLOCKED_GREEN'
              ? ('BLOCKED' as const)
              : undefined;
      const full = stopOutcome === 'STOPPED';
      const dwell =
        full && opportunity.resolvedTick !== null
          ? samples.filter(
              (sample) =>
                sample.tick >= opportunity.openedTick &&
                sample.tick <= opportunity.resolvedTick! &&
                speedOf(sample) <= 0.1,
            ).length
          : undefined;
      stopObservations.push(
        Object.freeze({
          eligibility: eligibilityWindow,
          opportunity,
          artifacts,
          ...(stopCause === undefined ? {} : { stopCause }),
          ...(full ? { fullStop: true } : { rollingStop: true }),
          ...(dwell === undefined ? {} : { dwellTicks: dwell }),
        }),
      );
    }
  }

  const denominators = denominatorsFor(segment.opportunities);
  const reads = ledger.readAll();
  const speedResult = estimateSpeedParameters(reads, speedObservations);
  const stopResult = estimateStopYieldParameters(reads, denominators, stopObservations);
  const candidateMap = new Map<ParameterKey, ConfidenceCandidate>();
  for (const [key, candidate] of Object.entries(speedResult.candidates))
    candidateMap.set(key as ParameterKey, candidate);
  for (const [key, candidate] of Object.entries(stopResult.candidates))
    candidateMap.set(key as ParameterKey, candidate);

  const hasStop = stopObservations.length > 0;
  const hasUrban = speedObservations.some((row) => row.roadKind === 'URBAN');
  const hasResidential = speedObservations.some((row) => row.roadKind === 'RESIDENTIAL');
  const preferred: ParameterKey = hasStop
    ? 'stop_full_probability'
    : hasUrban
      ? 'speed_delta_urban'
      : hasResidential
        ? 'speed_delta_residential'
        : 'speed_delta_urban';
  const readyKeys = liveEvidenceKeys.filter((key) => {
    const candidate = candidateMap.get(key);
    return candidate?.status === 'CANDIDATE' && ledger.read(key).status === 'READY';
  });
  const selected = readyKeys.includes(preferred as LiveEvidenceKey)
    ? preferred
    : (readyKeys[0] ?? preferred);
  const candidate = candidateOf(selected, candidateMap.get(selected));
  const observations: LiveEvidenceObservations = Object.freeze({
    opportunities: segment.opportunities.length,
    resolvedOpportunities,
    eligibleWindows,
    speedWindows: speedObservations.length,
    stopOpportunities: stopObservations.length,
    prefixTicks,
  });
  const candidateViews: LiveEvidenceCandidateView[] = [];
  const seen = new Set<ParameterKey>();
  for (const key of [selected, ...liveEvidenceKeys] as ParameterKey[]) {
    if (seen.has(key)) continue;
    seen.add(key);
    const row = candidateMap.get(key);
    if (row === undefined) continue;
    const read = ledger.read(key);
    candidateViews.push(
      Object.freeze({
        key,
        status: row.status,
        value: row.value,
        interval: row.interval ?? null,
        evidenceStatus: read.status,
        distinctEpisodes: read.distinctEpisodes,
        reason:
          row.status === 'CANDIDATE'
            ? read.status === 'READY'
              ? null
              : read.noEstimate
            : ((row as { readonly reason?: string | null }).reason ?? read.noEstimate),
      }),
    );
  }
  return assemblePayload({
    segment,
    ledger,
    key: selected,
    candidate,
    episodeValues,
    observations,
    candidates: candidateViews,
    baseValue: options.baseValue,
  });
}

interface AssembleInput {
  readonly segment: LiveTelemetrySegmentRead;
  readonly ledger: ReturnType<typeof createParameterEvidenceLedger>;
  readonly key: ParameterKey;
  readonly candidate: ConfidenceCandidate;
  readonly episodeValues: ReadonlyMap<
    string,
    { readonly value?: number; readonly speedMps?: number }
  >;
  readonly observations: LiveEvidenceObservations;
  readonly candidates: readonly LiveEvidenceCandidateView[];
  readonly baseValue: (key: ParameterKey) => number;
}

function assemblePayload(input: AssembleInput): LiveEvidencePayload {
  const definition = getParameterDefinition(input.key);
  const evidence = input.ledger.read(input.key);
  const episodes = blendEpisodes(input.ledger, input.key, input.episodeValues);
  const evidenceReady = evidence.status === 'READY';
  const candidateReady = input.candidate.status === 'CANDIDATE' && input.candidate.value !== null;
  const reason = !evidenceReady
    ? (evidence.noEstimate ?? 'INSUFFICIENT_DISTINCT_EPISODES_OR_VARIATION')
    : !candidateReady
      ? ((input.candidate as { readonly reason?: string | null }).reason ??
        'NO_MATCHING_OBSERVATIONS')
      : null;
  const baseValue = input.baseValue(input.key);
  if (!Number.isFinite(baseValue))
    throw new Error(`Live evidence has no finite base value for ${input.key}`);
  // The catalog remains the numeric envelope; the estimator itself already stays inside it.
  if (baseValue < definition.min || baseValue > definition.max)
    throw new Error(`Live evidence base value for ${input.key} is outside the 092 catalog`);
  return Object.freeze({
    version: LIVE_EVIDENCE_VERSION,
    segmentId: input.segment.summary.segmentId,
    key: input.key,
    baseValue,
    evidence,
    episodes,
    candidate: input.candidate,
    evidenceReady,
    candidateReady,
    insufficient: !evidenceReady || !candidateReady,
    reason,
    observations: input.observations,
    candidates: Object.freeze(input.candidates),
  });
}

/** Keep the 093 policy visible to readers; the adapter never invents a key outside this set. */
export const LIVE_EVIDENCE_POLICY = Object.freeze({
  sourceContract: '093-parameter-evidence-v1',
  estimators: Object.freeze(['094-speed-estimator-v1', '098-stop-yield-estimator-v1']),
  keys: liveEvidenceKeys,
  evidenceKeys: parameterEvidenceSpecs.length,
  artifactCorrelation: 'SEGMENT_PREFIX_TO_ELIGIBILITY_WINDOW',
  inventedEvidence: false,
});
