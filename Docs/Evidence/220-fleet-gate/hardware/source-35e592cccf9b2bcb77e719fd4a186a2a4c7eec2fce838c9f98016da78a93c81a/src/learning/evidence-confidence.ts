import { parameterEvidenceSpecs } from './parameter-evidence';
import type { ParameterEvidenceReadModel } from './parameter-evidence';
import type { ParameterKey, ParameterUnit } from '../profiles';

export const EVIDENCE_CONFIDENCE_VERSION = '100-evidence-confidence-v1' as const;
export const confidenceStates = ['UNOBSERVED', 'WEAK', 'ZERO', 'OBSERVED'] as const;
export type ConfidenceState = (typeof confidenceStates)[number];
export type EvidenceSufficiency = 'UNOBSERVED' | 'WEAK' | 'SUFFICIENT';
export type ContradictionSeverity = 'NONE' | 'MODERATE' | 'SEVERE';
export type ConfidenceUncertainty = 'NONE' | 'LOW' | 'MODERATE' | 'HIGH';
export type ConfidenceLevel = 'HIGH' | 'MODERATE' | 'LOW' | 'NONE';
export type EpisodeOutcome = 'OBSERVED' | 'ACCEPTED' | 'REFUSED';

/**
 * One real 086/087 occurrence with its measured exposure. Multiple frames of the same occurrence
 * are merged; `correlatedWith` groups occurrences that belong to one continuous encounter so they
 * cannot raise confidence independently.
 */
export interface ConfidenceEpisode {
  readonly opportunityId: string;
  readonly occurrence: number;
  readonly windowId?: string;
  /** Measured usable exposure in 60 Hz ticks, not a frame count. */
  readonly observedTicks: number;
  /** Numeric observation for this episode, when the estimator channel provides one. */
  readonly value?: number;
  readonly outcome?: EpisodeOutcome;
  readonly speedMps?: number;
  /** Stable key for correlated episodes (for example one leader encounter). */
  readonly correlatedWith?: string;
}

/** Per-key evidence gate derived from the frozen 093 specification plus this PBI's exposure floor. */
export interface EvidenceConfidenceThreshold {
  readonly key: ParameterKey;
  readonly minimumEffectiveEpisodes: number;
  readonly minimumEpisodeTicks: number;
  readonly requiresVariedSpeeds: boolean;
  readonly unit: ParameterUnit;
  readonly parameterMin: number;
  readonly parameterMax: number;
  readonly moderateContradictionFraction: number;
  readonly severeContradictionFraction: number;
}

const DEFAULT_MINIMUM_EPISODE_TICKS = 30;
const MODERATE_CONTRADICTION_FRACTION = 0.15;
const SEVERE_CONTRADICTION_FRACTION = 0.5;

export const parameterConfidenceThresholds: readonly EvidenceConfidenceThreshold[] = Object.freeze(
  parameterEvidenceSpecs.map((spec) =>
    Object.freeze({
      key: spec.key,
      minimumEffectiveEpisodes: spec.minimumEpisodes,
      minimumEpisodeTicks:
        spec.minimumDurationS > 0
          ? Math.round(spec.minimumDurationS * 60)
          : DEFAULT_MINIMUM_EPISODE_TICKS,
      requiresVariedSpeeds: spec.requiresVariedSpeeds,
      unit: spec.unit,
      parameterMin: spec.min,
      parameterMax: spec.max,
      moderateContradictionFraction: MODERATE_CONTRADICTION_FRACTION,
      severeContradictionFraction: SEVERE_CONTRADICTION_FRACTION,
    }),
  ),
);
if (parameterConfidenceThresholds.length !== 24) {
  throw new Error('Evidence confidence thresholds must cover the 24 M parameters.');
}
const thresholdsByKey = new Map(parameterConfidenceThresholds.map((row) => [row.key, row]));

export function confidenceThreshold(key: ParameterKey): EvidenceConfidenceThreshold {
  const threshold = thresholdsByKey.get(key);
  if (!threshold) throw new Error(`Unknown evidence confidence key: ${key}`);
  return threshold;
}

/** Structural view shared by every 094-099 candidate. Extra estimator fields are ignored. */
export interface ConfidenceCandidate {
  readonly key: string;
  readonly status: string;
  readonly value: number | null;
  readonly interval?: readonly [number, number] | null;
}

export interface EvidenceConfidenceInput {
  readonly key: ParameterKey;
  /** 093 read model for this key; null means the caller could not supply evidence. */
  readonly evidence: ParameterEvidenceReadModel | null;
  readonly episodes: readonly ConfidenceEpisode[];
  readonly candidate?: ConfidenceCandidate | null;
}

export interface ContradictionIndicator {
  readonly detected: boolean;
  readonly severity: ContradictionSeverity;
  readonly interval: readonly [number, number] | null;
  readonly reason: string | null;
}

export interface EvidenceConfidenceAssessment {
  readonly version: typeof EVIDENCE_CONFIDENCE_VERSION;
  readonly key: ParameterKey;
  /** UNOBSERVED, WEAK and ZERO never collapse into one another. */
  readonly state: ConfidenceState;
  readonly evidenceState: EvidenceSufficiency;
  readonly value: number | null;
  readonly zeroObserved: boolean;
  readonly interval: readonly [number, number] | null;
  readonly contradiction: ContradictionIndicator;
  readonly uncertainty: ConfidenceUncertainty;
  readonly confidence: ConfidenceLevel;
  readonly quality: number;
  /** Distinct occurrences after frame and correlated-encounter deduplication. */
  readonly distinctEpisodeCount: number;
  /** Exposure-weighted distinct encounters; never the 20 Hz sample or frame count. */
  readonly effectiveEpisodeCount: number;
  readonly collapsedCorrelatedEpisodes: number;
  readonly frameObservationCount: number;
  /** Reported only to contrast it with the effective count; it never feeds confidence. */
  readonly sampleCount: number;
  readonly exposureSeconds: number;
  readonly shortEpisodeCount: number;
  readonly requiredEffectiveEpisodes: number;
  readonly minimumEpisodeTicks: number;
  readonly variedSpeedBands: number;
  readonly requiresVariedSpeeds: boolean;
  readonly reason: string | null;
  readonly unchanged: true;
  readonly published: false;
}

export interface EvidenceQualitySummary {
  readonly key: ParameterKey;
  readonly evidenceState: EvidenceSufficiency;
  readonly distinctEpisodeCount: number;
  readonly effectiveEpisodeCount: number;
  readonly collapsedCorrelatedEpisodes: number;
  readonly frameObservationCount: number;
  readonly exposureSeconds: number;
  readonly shortEpisodeCount: number;
  readonly requiredEffectiveEpisodes: number;
  readonly minimumEpisodeTicks: number;
  readonly variedSpeedBands: number;
  readonly requiresVariedSpeeds: boolean;
  readonly contradiction: ContradictionIndicator;
  readonly reason: string | null;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function speedBand(speed: number): string {
  return speed < 5 ? 'LOW' : speed < 15 ? 'MID' : 'HIGH';
}
function assertEpisode(row: ConfidenceEpisode, index: number): void {
  if (!row || typeof row.opportunityId !== 'string' || row.opportunityId.length === 0)
    throw new Error(`Invalid evidence episode ${index}: opportunityId`);
  if (!Number.isSafeInteger(row.occurrence) || row.occurrence < 0)
    throw new Error(`Invalid evidence episode ${index}: occurrence`);
  if (!Number.isFinite(row.observedTicks) || row.observedTicks < 0)
    throw new Error(`Invalid evidence episode ${index}: observedTicks`);
  if (row.value !== undefined && !Number.isFinite(row.value))
    throw new Error(`Invalid evidence episode ${index}: value`);
  if (row.speedMps !== undefined && (!Number.isFinite(row.speedMps) || row.speedMps < 0))
    throw new Error(`Invalid evidence episode ${index}: speedMps`);
  if (row.correlatedWith !== undefined && row.correlatedWith.length === 0)
    throw new Error(`Invalid evidence episode ${index}: correlatedWith`);
}

/** Merge repeated frames of one occurrence and keep the largest measured exposure. */
function mergeFrames(episodes: readonly ConfidenceEpisode[]): Map<string, ConfidenceEpisode> {
  const unique = new Map<string, ConfidenceEpisode>();
  episodes.forEach((row, index) => {
    assertEpisode(row, index);
    const identity = `${row.opportunityId}\u0000${row.occurrence}`;
    const existing = unique.get(identity);
    if (!existing || row.observedTicks > existing.observedTicks) unique.set(identity, row);
  });
  return unique;
}

/** Collapse correlated occurrences (one continuous encounter) to their best-exposed member. */
function collapseCorrelated(unique: Map<string, ConfidenceEpisode>): ConfidenceEpisode[] {
  const groups = new Map<string, ConfidenceEpisode>();
  for (const row of unique.values()) {
    const group = row.correlatedWith ?? `${row.opportunityId}\u0000${row.occurrence}`;
    const existing = groups.get(group);
    if (!existing || row.observedTicks > existing.observedTicks) groups.set(group, row);
  }
  return [...groups.values()];
}

interface EpisodeSummary {
  readonly representatives: readonly ConfidenceEpisode[];
  readonly distinctEpisodeCount: number;
  readonly collapsedCorrelatedEpisodes: number;
  readonly frameObservationCount: number;
  readonly effectiveEpisodeCount: number;
  readonly exposureSeconds: number;
  readonly shortEpisodeCount: number;
  readonly variedSpeedBands: number;
}

function summarizeEpisodes(
  episodes: readonly ConfidenceEpisode[],
  threshold: EvidenceConfidenceThreshold,
): EpisodeSummary {
  const unique = mergeFrames(episodes);
  const representatives = collapseCorrelated(unique);
  let effective = 0;
  let observedTicks = 0;
  let short = 0;
  for (const row of representatives) {
    observedTicks += row.observedTicks;
    effective += Math.min(1, row.observedTicks / threshold.minimumEpisodeTicks);
    if (row.observedTicks < threshold.minimumEpisodeTicks) short += 1;
  }
  const bands = new Set(
    representatives
      .map((row) => row.speedMps)
      .filter((speed): speed is number => speed !== undefined)
      .map(speedBand),
  );
  return {
    representatives,
    distinctEpisodeCount: unique.size,
    collapsedCorrelatedEpisodes: unique.size - representatives.length,
    frameObservationCount: episodes.length,
    effectiveEpisodeCount: round(effective),
    exposureSeconds: round(observedTicks / 60),
    shortEpisodeCount: short,
    variedSpeedBands: bands.size,
  };
}

function numericValues(rows: readonly ConfidenceEpisode[]): number[] {
  return rows.map((row) => row.value).filter((value): value is number => value !== undefined);
}

function contradictionFor(
  threshold: EvidenceConfidenceThreshold,
  rows: readonly ConfidenceEpisode[],
  candidate: ConfidenceCandidate | null | undefined,
): ContradictionIndicator {
  const values = numericValues(rows);
  const accepted = rows.filter((row) => row.outcome === 'ACCEPTED');
  const refused = rows.filter((row) => row.outcome === 'REFUSED');
  const acceptedValues = numericValues(accepted);
  const refusedValues = numericValues(refused);
  let severity: ContradictionSeverity = 'NONE';
  let interval: readonly [number, number] | null = null;
  let reason: string | null = null;

  const candidateInterval = candidate?.interval ?? null;
  if (candidateInterval && candidateInterval[0] > candidateInterval[1]) {
    return Object.freeze({
      detected: true,
      severity: 'SEVERE',
      interval: Object.freeze([candidateInterval[1], candidateInterval[0]]) as readonly [
        number,
        number,
      ],
      reason: 'INVERTED_ESTIMATOR_INTERVAL',
    });
  }

  const parameterSpan = threshold.parameterMax - threshold.parameterMin;
  function spreadSeverity(group: readonly number[]): {
    severity: ContradictionSeverity;
    reason: string | null;
  } {
    if (group.length < 2) return { severity: 'NONE', reason: null };
    const span = Math.max(...group) - Math.min(...group);
    const fraction = parameterSpan > 0 ? span / parameterSpan : span > 0 ? 1 : 0;
    if (fraction > threshold.severeContradictionFraction)
      return { severity: 'SEVERE', reason: 'CONTRADICTORY_EPISODE_VALUES' };
    if (fraction > threshold.moderateContradictionFraction)
      return { severity: 'MODERATE', reason: 'DISPERSED_EPISODE_VALUES' };
    return { severity: 'NONE', reason: null };
  }

  if (acceptedValues.length > 0 && refusedValues.length > 0) {
    interval = Object.freeze([
      Math.max(...refusedValues),
      Math.min(...acceptedValues),
    ]) as readonly [number, number];
    if (interval[0] > interval[1]) {
      severity = 'SEVERE';
      reason = 'ACCEPTED_AND_REFUSED_OVERLAP';
    }
  } else if (accepted.length > 0 && refused.length > 0) {
    severity = 'MODERATE';
    reason = 'ACCEPTED_AND_REFUSED_WITHOUT_VALUES';
  }

  // Disagreement inside one behavioural group is contradiction. The spread between accepted and
  // refused values is the observed threshold interval, not a contradiction by itself.
  const comparisonGroups =
    acceptedValues.length > 0 || refusedValues.length > 0
      ? [acceptedValues, refusedValues]
      : [values];
  for (const group of comparisonGroups) {
    const spread = spreadSeverity(group);
    if (spread.severity === 'SEVERE' || (spread.severity === 'MODERATE' && severity === 'NONE')) {
      severity = spread.severity;
      reason = spread.reason;
    }
  }
  if (!interval && values.length >= 2) {
    interval = Object.freeze([Math.min(...values), Math.max(...values)]) as readonly [
      number,
      number,
    ];
  }

  return Object.freeze({
    detected: severity !== 'NONE',
    severity,
    interval,
    reason,
  });
}

function evidenceSufficiency(
  key: ParameterKey,
  evidence: ParameterEvidenceReadModel | null,
  summary: EpisodeSummary,
): { evidenceState: EvidenceSufficiency; reason: string | null } {
  const threshold = confidenceThreshold(key);
  if (evidence && evidence.key !== key)
    throw new Error(`Mismatched evidence read model for ${key}`);
  if (summary.distinctEpisodeCount === 0) {
    if (evidence && evidence.distinctEpisodes > 0)
      return { evidenceState: 'WEAK', reason: 'MISSING_EPISODE_EXPOSURE' };
    return {
      evidenceState: 'UNOBSERVED',
      reason: evidence?.noEstimate ?? 'NO_QUALIFYING_EVIDENCE',
    };
  }
  if (!evidence) return { evidenceState: 'WEAK', reason: 'MISSING_093_READ_MODEL' };
  if (evidence.distinctEpisodes !== summary.distinctEpisodeCount) {
    return { evidenceState: 'WEAK', reason: 'EPISODE_DETAIL_MISMATCH' };
  }
  if (evidence.status !== 'READY') {
    return {
      evidenceState: 'WEAK',
      reason: evidence.noEstimate ?? 'INSUFFICIENT_DISTINCT_EPISODES_OR_VARIATION',
    };
  }
  if (summary.effectiveEpisodeCount < threshold.minimumEffectiveEpisodes) {
    if (summary.shortEpisodeCount > 0) {
      return { evidenceState: 'WEAK', reason: 'SHORT_INTERVAL_BELOW_MINIMUM_EXPOSURE' };
    }
    if (summary.collapsedCorrelatedEpisodes > 0) {
      return {
        evidenceState: 'WEAK',
        reason: 'CORRELATED_EPISODES_REDUCED_EFFECTIVE_COUNT',
      };
    }
    return { evidenceState: 'WEAK', reason: 'INSUFFICIENT_EFFECTIVE_EPISODES' };
  }
  if (threshold.requiresVariedSpeeds && summary.variedSpeedBands < 2) {
    return { evidenceState: 'WEAK', reason: 'VARIED_SPEEDS_REQUIRED' };
  }
  return { evidenceState: 'SUFFICIENT', reason: null };
}

function buildAssessment(input: EvidenceConfidenceInput): EvidenceConfidenceAssessment {
  const { key, evidence, episodes } = input;
  const threshold = confidenceThreshold(key);
  const summary = summarizeEpisodes(episodes, threshold);
  const sufficiency = evidenceSufficiency(key, evidence, summary);
  const contradiction = contradictionFor(threshold, summary.representatives, input.candidate);
  const candidate = input.candidate ?? null;
  if (candidate && candidate.key !== key) throw new Error(`Mismatched candidate key for ${key}`);
  if (candidate && candidate.value !== null && !Number.isFinite(candidate.value))
    throw new Error(`Invalid candidate value for ${key}`);

  let evidenceState = sufficiency.evidenceState;
  let reason = sufficiency.reason;
  if (evidenceState === 'SUFFICIENT' && contradiction.severity === 'SEVERE') {
    evidenceState = 'WEAK';
    reason = contradiction.reason ?? 'CONTRADICTORY_EVIDENCE';
  }
  let state: ConfidenceState;
  if (evidenceState === 'UNOBSERVED') {
    state = 'UNOBSERVED';
  } else if (evidenceState === 'WEAK') {
    state = 'WEAK';
  } else if (!candidate) {
    state = 'WEAK';
    reason = 'NO_ESTIMATOR_CANDIDATE';
  } else if (candidate.status !== 'CANDIDATE') {
    state = 'WEAK';
    reason = 'ESTIMATOR_NOT_READY';
  } else if (candidate.value === 0) {
    state = 'ZERO';
    reason = null;
  } else if (candidate.value !== null) {
    state = 'OBSERVED';
    reason = null;
  } else if (candidate.interval && candidate.interval[0] <= candidate.interval[1]) {
    state = 'OBSERVED';
    reason = null;
  } else {
    state = 'WEAK';
    reason = 'NO_OBSERVED_VALUE';
  }

  const countRatio = Math.min(
    1,
    summary.effectiveEpisodeCount / Math.max(1, threshold.minimumEffectiveEpisodes),
  );
  const penalty =
    contradiction.severity === 'SEVERE' ? 0 : contradiction.severity === 'MODERATE' ? 0.6 : 1;
  const quality = state === 'OBSERVED' || state === 'ZERO' ? round(countRatio * penalty) : 0;
  const confidence: ConfidenceLevel =
    quality >= 0.85 ? 'HIGH' : quality >= 0.6 ? 'MODERATE' : quality > 0 ? 'LOW' : 'NONE';
  const uncertainty: ConfidenceUncertainty =
    state === 'UNOBSERVED'
      ? 'NONE'
      : state === 'WEAK' || contradiction.severity === 'MODERATE'
        ? 'HIGH'
        : summary.effectiveEpisodeCount >= threshold.minimumEffectiveEpisodes * 2
          ? 'LOW'
          : 'MODERATE';

  return Object.freeze({
    version: EVIDENCE_CONFIDENCE_VERSION,
    key,
    state,
    evidenceState,
    value: state === 'OBSERVED' || state === 'ZERO' ? candidate!.value : null,
    zeroObserved: state === 'ZERO',
    interval: contradiction.interval,
    contradiction,
    uncertainty,
    confidence,
    quality,
    distinctEpisodeCount: summary.distinctEpisodeCount,
    effectiveEpisodeCount: summary.effectiveEpisodeCount,
    collapsedCorrelatedEpisodes: summary.collapsedCorrelatedEpisodes,
    frameObservationCount: summary.frameObservationCount,
    sampleCount: evidence?.sampleCount ?? 0,
    exposureSeconds: summary.exposureSeconds,
    shortEpisodeCount: summary.shortEpisodeCount,
    requiredEffectiveEpisodes: threshold.minimumEffectiveEpisodes,
    minimumEpisodeTicks: threshold.minimumEpisodeTicks,
    variedSpeedBands: summary.variedSpeedBands,
    requiresVariedSpeeds: threshold.requiresVariedSpeeds,
    reason,
    unchanged: true,
    published: false,
  });
}

/**
 * Assess one estimator candidate against its 093 evidence and real episode exposures. It never
 * publishes a profile, delta, or 092 capability flag.
 */
export function assessEvidenceConfidence(
  input: EvidenceConfidenceInput,
): EvidenceConfidenceAssessment {
  return buildAssessment(input);
}

/** Per-key evidence quality without any candidate value. */
export function summarizeEvidenceQuality(
  key: ParameterKey,
  evidence: ParameterEvidenceReadModel | null,
  episodes: readonly ConfidenceEpisode[],
): EvidenceQualitySummary {
  const threshold = confidenceThreshold(key);
  const summary = summarizeEpisodes(episodes, threshold);
  const sufficiency = evidenceSufficiency(key, evidence, summary);
  const contradiction = contradictionFor(threshold, summary.representatives, null);
  const evidenceState: EvidenceSufficiency =
    sufficiency.evidenceState === 'SUFFICIENT' && contradiction.severity === 'SEVERE'
      ? 'WEAK'
      : sufficiency.evidenceState;
  const reason =
    evidenceState === 'WEAK'
      ? contradiction.severity === 'SEVERE'
        ? (contradiction.reason ?? 'CONTRADICTORY_EVIDENCE')
        : sufficiency.reason
      : null;
  return Object.freeze({
    key,
    evidenceState,
    distinctEpisodeCount: summary.distinctEpisodeCount,
    effectiveEpisodeCount: summary.effectiveEpisodeCount,
    collapsedCorrelatedEpisodes: summary.collapsedCorrelatedEpisodes,
    frameObservationCount: summary.frameObservationCount,
    exposureSeconds: summary.exposureSeconds,
    shortEpisodeCount: summary.shortEpisodeCount,
    requiredEffectiveEpisodes: threshold.minimumEffectiveEpisodes,
    minimumEpisodeTicks: threshold.minimumEpisodeTicks,
    variedSpeedBands: summary.variedSpeedBands,
    requiresVariedSpeeds: threshold.requiresVariedSpeeds,
    contradiction,
    reason,
  });
}

/** Assess every candidate of a real 094-099 result. Candidate-only integration. */
export function assessEstimatorConfidence<K extends string>(
  result: { readonly candidates: Readonly<Record<K, ConfidenceCandidate>> },
  reads: readonly ParameterEvidenceReadModel[],
  episodesByKey: Partial<Record<ParameterKey, readonly ConfidenceEpisode[]>>,
): readonly EvidenceConfidenceAssessment[] {
  const readByKey = new Map<ParameterKey, ParameterEvidenceReadModel>();
  for (const read of reads) readByKey.set(read.key, read);
  const assessments = (Object.entries(result.candidates) as [K, ConfidenceCandidate][]).map(
    ([key, candidate]) => {
      const typedKey = key as ParameterKey;
      confidenceThreshold(typedKey);
      return buildAssessment({
        key: typedKey,
        evidence: readByKey.get(typedKey) ?? null,
        episodes: episodesByKey[typedKey] ?? [],
        candidate,
      });
    },
  );
  return Object.freeze(assessments);
}
