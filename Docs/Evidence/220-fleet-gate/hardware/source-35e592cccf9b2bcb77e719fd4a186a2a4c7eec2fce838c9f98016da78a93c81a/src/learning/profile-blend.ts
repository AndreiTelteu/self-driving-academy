import { assessEvidenceConfidence, confidenceThreshold } from './evidence-confidence';
import type {
  ConfidenceCandidate,
  ConfidenceEpisode,
  ContradictionIndicator,
  ContradictionSeverity,
  EvidenceSufficiency,
} from './evidence-confidence';
import type { ParameterEvidenceReadModel } from './parameter-evidence';
import { getParameterDefinition } from '../profiles';
import type { ParameterKey, ParameterUnit } from '../profiles';

export const PROFILE_BLEND_VERSION = '101-profile-blend-v1' as const;

/**
 * Starting calibration for the profile step. Every value is a documented policy, not a
 * statistical guarantee; the step is bounded per update and never pulls toward a safe base.
 */
export const PROFILE_BLEND_POLICY = Object.freeze({
  /** Effective episodes needed for half of the step before the hard cap. */
  saturationEpisodes: 4,
  /** Hard ceiling for one update: no single segment can replace the profile. */
  maxUpdateWeight: 0.6,
  /** A demonstration with fewer than two effective episodes is evidence, not a habit. */
  novelEvidenceEpisodeLimit: 2,
  novelEvidenceWeightCap: 0.15,
  /** Recency half-life for episode weighting; the caller chooses the clock. */
  recencyHalfLifeSeconds: 24 * 60 * 60,
  /** Very old evidence still counts, but never below this share of a recent episode. */
  recencyFloor: 0.05,
  /** Moderate contradiction keeps the observation but halves the applied step. */
  moderateContradictionFactor: 0.5,
  /** Severe contradiction never moves the profile. */
  severeContradictionFactor: 0,
});

export const blendResolutions = [
  'APPLIED',
  'APPLIED_WITH_INTERVAL',
  'HELD_UNOBSERVED',
  'HELD_WEAK',
  'HELD_CONTRADICTION',
  'HELD_INTERVAL_ONLY',
] as const;
export type BlendResolution = (typeof blendResolutions)[number];

/** A 100 confidence episode plus the age that feeds the recency memory. */
export interface ProfileBlendEpisode extends ConfidenceEpisode {
  /** Seconds between this observation and the blend instant; 0 is the freshly measured episode. */
  readonly ageSeconds: number;
}

/** Provenance of one update, kept so the panel can explain what moved the profile. */
export interface ProfileBlendUpdate {
  readonly sequence: number;
  readonly key: ParameterKey;
  readonly previousValue: number;
  readonly estimate: number | null;
  readonly newValue: number;
  readonly learningWeight: number;
  readonly quality: number;
  readonly countSaturation: number;
  readonly effectiveEpisodeCount: number;
  readonly distinctEpisodeCount: number;
  readonly recencyFactor: number;
  readonly evidenceState: EvidenceSufficiency;
  readonly contradictionSeverity: ContradictionSeverity;
  readonly interval: readonly [number, number] | null;
  readonly resolution: BlendResolution;
  readonly changed: boolean;
  readonly clampedToBounds: boolean;
  readonly episodeIdentities: readonly string[];
  readonly newestAgeSeconds: number | null;
  readonly oldestAgeSeconds: number | null;
}

export interface ProfileBlendInput {
  readonly key: ParameterKey;
  /** Current profile value used as the anchor of the update. */
  readonly oldValue: number;
  /** 093 read model for this key; null means the caller could not supply evidence. */
  readonly evidence: ParameterEvidenceReadModel | null;
  readonly episodes: readonly ProfileBlendEpisode[];
  readonly candidate: ConfidenceCandidate;
  /** Earlier updates for the same key, in chronological order. */
  readonly history?: readonly ProfileBlendUpdate[];
}

export interface ProfileBlendResult {
  readonly version: typeof PROFILE_BLEND_VERSION;
  readonly key: ParameterKey;
  readonly unit: ParameterUnit;
  readonly min: number;
  readonly max: number;
  readonly previousValue: number;
  readonly estimate: number | null;
  readonly value: number;
  readonly learningWeight: number;
  readonly resolution: BlendResolution;
  readonly interval: readonly [number, number] | null;
  readonly contradiction: ContradictionIndicator;
  readonly changed: boolean;
  readonly clampedToBounds: boolean;
  readonly update: ProfileBlendUpdate;
  readonly history: readonly ProfileBlendUpdate[];
  /** This module never publishes a profile or writes a version. */
  readonly published: false;
  /** Values stay candidate-only; 092 `implemented`/`estimable` are not touched. */
  readonly learned: false;
  readonly unchanged: boolean;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function assertEpisode(row: ProfileBlendEpisode, index: number): void {
  if (!row || typeof row.opportunityId !== 'string' || row.opportunityId.length === 0)
    throw new Error(`Invalid profile blend episode ${index}: opportunityId`);
  if (!Number.isSafeInteger(row.occurrence) || row.occurrence < 0)
    throw new Error(`Invalid profile blend episode ${index}: occurrence`);
  if (!Number.isFinite(row.observedTicks) || row.observedTicks < 0)
    throw new Error(`Invalid profile blend episode ${index}: observedTicks`);
  if (!Number.isFinite(row.ageSeconds) || row.ageSeconds < 0)
    throw new Error(`Invalid profile blend episode ${index}: ageSeconds`);
  if (row.value !== undefined && !Number.isFinite(row.value))
    throw new Error(`Invalid profile blend episode ${index}: value`);
  if (row.correlatedWith !== undefined && row.correlatedWith.length === 0)
    throw new Error(`Invalid profile blend episode ${index}: correlatedWith`);
}

/**
 * Mirror of the 100 effective-count deduplication so recency is not inflated by repeated frames
 * or by correlated windows of the same encounter.
 */
function recencyRepresentatives(
  episodes: readonly ProfileBlendEpisode[],
): readonly ProfileBlendEpisode[] {
  const unique = new Map<string, ProfileBlendEpisode>();
  episodes.forEach((row, index) => {
    assertEpisode(row, index);
    const identity = `${row.opportunityId}\u0000${row.occurrence}`;
    const existing = unique.get(identity);
    if (!existing || row.observedTicks > existing.observedTicks) unique.set(identity, row);
  });
  const groups = new Map<string, ProfileBlendEpisode>();
  for (const row of unique.values()) {
    const group = row.correlatedWith ?? `${row.opportunityId}\u0000${row.occurrence}`;
    const existing = groups.get(group);
    if (!existing || row.observedTicks > existing.observedTicks) groups.set(group, row);
  }
  return [...groups.values()];
}

function recencyDecay(ageSeconds: number): number {
  const { recencyHalfLifeSeconds, recencyFloor } = PROFILE_BLEND_POLICY;
  return Math.max(recencyFloor, 0.5 ** (ageSeconds / recencyHalfLifeSeconds));
}

/**
 * Exposure-weighted mean recency of the deduplicated episodes. Recent episodes dominate, while a
 * very old history keeps a floor instead of being erased.
 */
function recencyFactor(
  representatives: readonly ProfileBlendEpisode[],
  minimumEpisodeTicks: number,
): number {
  let totalExposure = 0;
  let weightedRecency = 0;
  for (const row of representatives) {
    const exposure = Math.min(1, row.observedTicks / Math.max(1, minimumEpisodeTicks));
    totalExposure += exposure;
    weightedRecency += exposure * recencyDecay(row.ageSeconds);
  }
  return totalExposure > 0 ? weightedRecency / totalExposure : 0;
}

function contradictionFactor(severity: ContradictionSeverity): number {
  if (severity === 'SEVERE') return PROFILE_BLEND_POLICY.severeContradictionFactor;
  if (severity === 'MODERATE') return PROFILE_BLEND_POLICY.moderateContradictionFactor;
  return 1;
}

function freezeInterval(
  interval: readonly [number, number] | null,
): readonly [number, number] | null {
  return interval ? (Object.freeze([interval[0], interval[1]]) as readonly [number, number]) : null;
}

function assertHistory(history: readonly ProfileBlendUpdate[], key: ParameterKey): void {
  for (const [index, update] of history.entries()) {
    if (!update || update.key !== key)
      throw new Error(`Invalid profile blend history ${index}: key mismatch for ${key}`);
  }
}

/**
 * Applies one documented update:
 *
 *   newValue = oldValue + learningWeight × (estimate − oldValue)
 *
 * `learningWeight` combines 100 evidence quality, effective-episode saturation and recency. It is
 * capped per update (`maxUpdateWeight`, and a lower cap for a single demonstration). `UNOBSERVED`
 * and `WEAK` evidence leave the value exactly unchanged, `ZERO` is a real estimate and is applied,
 * and a severe contradiction keeps the value plus the observed interval. There is deliberately no
 * shrink toward a base or "safe" profile: consistent risky evidence must not be forced to conform.
 * The result is an in-memory candidate only; nothing is published and no 092 capability changes.
 */
export function blendProfileValue(input: ProfileBlendInput): ProfileBlendResult {
  const { key, oldValue, evidence, episodes, candidate } = input;
  if (!Number.isFinite(oldValue)) throw new Error(`Invalid profile blend old value for ${key}`);
  const definition = getParameterDefinition(key);
  const prior = Object.freeze([...(input.history ?? [])]);
  assertHistory(prior, key);

  const assessment = assessEvidenceConfidence({ key, evidence, episodes, candidate });
  const threshold = confidenceThreshold(key);
  const representatives = recencyRepresentatives(episodes);
  const recency = round(recencyFactor(representatives, threshold.minimumEpisodeTicks));
  const ages = representatives.map((row) => row.ageSeconds);
  const newestAgeSeconds = ages.length > 0 ? round(Math.min(...ages)) : null;
  const oldestAgeSeconds = ages.length > 0 ? round(Math.max(...ages)) : null;
  const episodeIdentities = Object.freeze(
    representatives.map((row) => `${row.opportunityId}#${row.occurrence}`),
  );

  const effective = assessment.effectiveEpisodeCount;
  const saturation = round(effective / (effective + PROFILE_BLEND_POLICY.saturationEpisodes));
  const quality = assessment.quality;
  const severity = assessment.contradiction.severity;

  const hold = (resolution: BlendResolution, estimate: number | null): ProfileBlendUpdate => ({
    sequence: prior.length,
    key,
    previousValue: oldValue,
    estimate,
    newValue: oldValue,
    learningWeight: 0,
    quality,
    countSaturation: saturation,
    effectiveEpisodeCount: effective,
    distinctEpisodeCount: assessment.distinctEpisodeCount,
    recencyFactor: recency,
    evidenceState: assessment.evidenceState,
    contradictionSeverity: severity,
    interval: freezeInterval(assessment.contradiction.interval),
    resolution,
    changed: false,
    clampedToBounds: false,
    episodeIdentities,
    newestAgeSeconds,
    oldestAgeSeconds,
  });

  let update: ProfileBlendUpdate;
  let estimate: number | null = null;

  if (severity === 'SEVERE') {
    update = hold('HELD_CONTRADICTION', null);
  } else if (assessment.state === 'UNOBSERVED') {
    update = hold('HELD_UNOBSERVED', null);
  } else if (assessment.state === 'WEAK') {
    update = hold('HELD_WEAK', null);
  } else {
    estimate = assessment.state === 'ZERO' ? 0 : assessment.value;
    if (estimate === null || !Number.isFinite(estimate)) {
      // OBSERVED with an interval but no point value: keep the interval, do not average it away.
      update = hold('HELD_INTERVAL_ONLY', null);
    } else {
      const rawWeight = quality * saturation * recency * contradictionFactor(severity);
      const cap =
        effective < PROFILE_BLEND_POLICY.novelEvidenceEpisodeLimit
          ? PROFILE_BLEND_POLICY.novelEvidenceWeightCap
          : PROFILE_BLEND_POLICY.maxUpdateWeight;
      const learningWeight = round(Math.max(0, Math.min(cap, rawWeight)));
      const rawValue = oldValue + learningWeight * (estimate - oldValue);
      const clampedToBounds = rawValue < definition.min || rawValue > definition.max;
      const newValue = round(Math.min(definition.max, Math.max(definition.min, rawValue)));
      update = {
        sequence: prior.length,
        key,
        previousValue: oldValue,
        estimate,
        newValue,
        learningWeight,
        quality,
        countSaturation: saturation,
        effectiveEpisodeCount: effective,
        distinctEpisodeCount: assessment.distinctEpisodeCount,
        recencyFactor: recency,
        evidenceState: assessment.evidenceState,
        contradictionSeverity: severity,
        interval: freezeInterval(assessment.contradiction.interval),
        resolution: severity === 'MODERATE' ? 'APPLIED_WITH_INTERVAL' : 'APPLIED',
        changed: newValue !== oldValue,
        clampedToBounds,
        episodeIdentities,
        newestAgeSeconds,
        oldestAgeSeconds,
      };
    }
  }

  const frozenUpdate = Object.freeze(update);
  const history = Object.freeze([...prior, frozenUpdate]);
  return Object.freeze({
    version: PROFILE_BLEND_VERSION,
    key,
    unit: definition.unit,
    min: definition.min,
    max: definition.max,
    previousValue: oldValue,
    estimate: frozenUpdate.estimate,
    value: frozenUpdate.newValue,
    learningWeight: frozenUpdate.learningWeight,
    resolution: frozenUpdate.resolution,
    interval: frozenUpdate.interval,
    contradiction: assessment.contradiction,
    changed: frozenUpdate.changed,
    clampedToBounds: frozenUpdate.clampedToBounds,
    update: frozenUpdate,
    history,
    published: false,
    learned: false,
    unchanged: !frozenUpdate.changed,
  });
}
