import type { ParameterEvidenceReadModel } from './parameter-evidence';
import type { SpeedCandidate } from './speed-estimator';
import type { AccelerationCandidate } from './acceleration-estimator';
import type { StopYieldCandidate } from './stop-yield-estimator';
import { compileCruiseProfile, compileLongitudinalProfile, projectStopProfile } from '../autonomy';
import { parsePublishableDrivingProfile } from '../profiles';
import type { DrivingProfile } from '../profiles';

/** Deliberately narrow prototype surface. It is not a 24-key publisher or a LEARNED profile. */
export const EARLY_LOOP_KEYS = Object.freeze([
  'speed_delta_urban',
  'desired_acceleration',
  'stop_full_probability',
] as const);
export type EarlyLoopKey = (typeof EARLY_LOOP_KEYS)[number];
export type EarlyLoopCandidates = Readonly<{
  speed_delta_urban: SpeedCandidate;
  desired_acceleration: AccelerationCandidate;
  stop_full_probability: StopYieldCandidate;
}>;
export interface EarlyLoopSource {
  readonly segmentIds: readonly string[];
  readonly opportunityIds: readonly string[];
}
export interface EarlyLoopValue {
  readonly base: number;
  readonly candidate: number | null;
  readonly value: number;
  readonly blend: number;
  readonly quality: number;
  readonly sourceEpisodeCount: number;
  readonly source: EarlyLoopSource;
  readonly unchangedReason: string | null;
}
export interface EarlyLoopProfile {
  readonly version: '204-early-loop-v1';
  readonly publication: 'IN_MEMORY_AUTO_ONLY';
  readonly values: Readonly<Record<EarlyLoopKey, EarlyLoopValue>>;
}

/** Controller-owned capabilities compiled from a validated profile with only the three early values overlaid. */
export interface EarlyLoopControllerProfiles {
  readonly profile: DrivingProfile;
  readonly cruise: ReturnType<typeof compileCruiseProfile>;
  readonly longitudinal: ReturnType<typeof compileLongitudinalProfile>;
  readonly stop: ReturnType<typeof projectStopProfile>;
}

/**
 * Bridges the in-memory early-loop values into the existing 046/047/051 validation boundaries.
 * Source/provenance and evidence metadata are copied verbatim; this never labels a value LEARNED.
 */
export function compileEarlyLoopControllerProfiles(
  mode: 'AUTO' | 'MANUAL' | 'LEARNING',
  base: DrivingProfile,
  early: EarlyLoopProfile,
): EarlyLoopControllerProfiles | null {
  if (earlyLoopForMode(mode, early) === null) return null;
  const parameters = { ...base.parameters };
  for (const key of EARLY_LOOP_KEYS) {
    const value = early.values[key];
    if (value.candidate !== null) parameters[key] = value.value;
  }
  const profile = parsePublishableDrivingProfile({
    ...base,
    versionId: `${base.versionId}-204-early`,
    parameters,
    checksum: `${base.checksum}:204-early-loop-v1`,
  });
  return Object.freeze({
    profile,
    cruise: compileCruiseProfile(profile),
    longitudinal: compileLongitudinalProfile(profile),
    stop: projectStopProfile(profile),
  });
}

const BLEND_CAP = 0.25;

/**
 * Applies only READY 093 evidence and candidate values from 094/095/098. The 25% cap is
 * multiplied by candidate quality; missing/refused evidence keeps the base exactly unchanged.
 */
export function composeEarlyLoopProfile(
  base: Readonly<Record<EarlyLoopKey, number>>,
  evidence: readonly ParameterEvidenceReadModel[],
  candidates: EarlyLoopCandidates,
  sourceByKey: Readonly<Record<EarlyLoopKey, EarlyLoopSource>>,
): EarlyLoopProfile {
  const evidenceByKey = new Map(evidence.map((entry) => [entry.key, entry]));
  const values = Object.create(null) as Record<EarlyLoopKey, EarlyLoopValue>;
  for (const key of EARLY_LOOP_KEYS) {
    const read = evidenceByKey.get(key);
    const candidate = candidates[key];
    const source = Object.freeze({
      segmentIds: Object.freeze([...sourceByKey[key].segmentIds]),
      opportunityIds: Object.freeze([...sourceByKey[key].opportunityIds]),
    });
    if (!Number.isFinite(base[key])) throw new Error(`Invalid base value for ${key}`);
    const usable =
      read?.status === 'READY' &&
      candidate.status === 'CANDIDATE' &&
      candidate.value !== null &&
      Number.isFinite(candidate.value) &&
      candidate.quality > 0 &&
      source.segmentIds.length > 0 &&
      source.opportunityIds.length > 0;
    const quality = usable ? Math.max(0, Math.min(1, candidate.quality)) : 0;
    const blend = quality * BLEND_CAP;
    const value = usable ? base[key] + blend * (candidate.value! - base[key]) : base[key];
    values[key] = Object.freeze({
      base: base[key],
      candidate: usable ? candidate.value : null,
      value,
      blend,
      quality,
      sourceEpisodeCount: usable ? candidate.sourceEpisodeCount : 0,
      source,
      unchangedReason: usable
        ? null
        : read?.status !== 'READY'
          ? (read?.noEstimate ?? 'NO_QUALIFYING_EVIDENCE')
          : (candidate.reason ?? 'CANDIDATE_UNAVAILABLE'),
    });
  }
  return Object.freeze({
    version: '204-early-loop-v1',
    publication: 'IN_MEMORY_AUTO_ONLY',
    values: Object.freeze(values),
  });
}

/** MANUAL is an explicit no-op so callers cannot accidentally learn from it. */
export function earlyLoopForMode(
  mode: 'AUTO' | 'MANUAL' | 'LEARNING',
  profile: EarlyLoopProfile,
): EarlyLoopProfile | null {
  return mode === 'MANUAL' ? null : mode === 'AUTO' ? profile : null;
}
