import { FOLLOW_POLICY_KEYS, FOLLOW_POLICY_LIMITS } from '../autonomy';
import type { FollowPolicyKey } from '../autonomy';
import { getParameterDefinition } from '../profiles';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../telemetry';

/**
 * 172 follow estimator: estimates the four 171 following keys from demonstrated episodes while
 * keeping cut-in, closing time-to-contact, leader adoption and hysteresis in separate episodes.
 *
 * The estimator inverts the delivered `171-follow-policy-v1` arithmetic instead of inventing a
 * second following model: each key is measured from the diagnostic the policy already emits
 * (`bindingConstraint`) plus the committed target, the 048 preference and the caller state of the
 * same tick. It is candidate-only: it never publishes a profile, never writes to a store, never
 * flips a 092 `implemented` flag and never changes the 171 semantics. It reads the key list, the
 * tick rate, the 5 m lead floor and the 30 m/s mechanical coverage directly from 171, and the
 * catalog ranges from the 092 registry, so measurement and decision use the same constants.
 */
export const FOLLOW_ESTIMATOR_VERSION = '172-follow-estimator-v1' as const;
export const FOLLOW_ESTIMATOR_KEYS = FOLLOW_POLICY_KEYS;
export type FollowEstimatorKey = FollowPolicyKey;
export type FollowEstimatorEpisode = 'CUT_IN' | 'CLOSING_TTC' | 'LEADER_CHANGE' | 'HYSTERESIS';

export const followEstimatorReasons = [
  'NO_ELIGIBLE_EPISODES',
  'INSUFFICIENT_DISTINCT_EPISODES',
  'UNCERTAINTY_ABOVE_THRESHOLD',
  'NO_CUT_IN_EPISODE',
  'CUT_IN_WITHOUT_REDUCTION',
  'CUT_IN_FACTOR_OUT_OF_ENVELOPE',
  'NO_CLOSING_EPISODE',
  'TTC_CAP_NOT_BOUND',
  'TTC_COMMIT_NOT_ABOVE_LEAD',
  'TTC_THRESHOLD_OUT_OF_ENVELOPE',
  'NO_LEADER_CHANGE',
  'LEADER_CHANGE_WITHOUT_ACCELERATION',
  'LEADER_HOLD_CENSORED',
  'LEADER_HOLD_INTERRUPTED_BY_REDUCTION',
  'LEADER_DELAY_CONSTRAINED',
  'NO_HYSTERESIS_EPISODE',
  'NO_BAND_OSCILLATION',
  'HYSTERESIS_LOWER_BOUND_UNOBSERVED',
  'HYSTERESIS_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_BAND_BOUNDS',
  'HYSTERESIS_BOUND_OUT_OF_ENVELOPE',
] as const;
export type FollowEstimatorReason = (typeof followEstimatorReasons)[number];

export const followEpisodeRefusals = [
  'NOT_LEARNING_ELIGIBLE',
  'NO_USABLE_PREFIX',
  'DUPLICATE_EPISODE',
] as const;
export type FollowEpisodeRefusal = (typeof followEpisodeRefusals)[number];

export const followEpisodeExclusions = [
  'NO_CUT_IN_EPISODE',
  'CUT_IN_WITHOUT_REDUCTION',
  'CUT_IN_FACTOR_OUT_OF_ENVELOPE',
  'NO_CLOSING_EPISODE',
  'TTC_CAP_NOT_BOUND',
  'TTC_COMMIT_NOT_ABOVE_LEAD',
  'TTC_THRESHOLD_OUT_OF_ENVELOPE',
  'NO_LEADER_CHANGE',
  'LEADER_CHANGE_WITHOUT_ACCELERATION',
  'LEADER_HOLD_CENSORED',
  'LEADER_HOLD_INTERRUPTED_BY_REDUCTION',
  'LEADER_DELAY_CONSTRAINED',
  'NO_HYSTERESIS_EPISODE',
  'NO_BAND_OSCILLATION',
  'HYSTERESIS_LOWER_BOUND_UNOBSERVED',
  'HYSTERESIS_UPPER_BOUND_UNOBSERVED',
  'CONTRADICTORY_BAND_BOUNDS',
  'HYSTERESIS_BOUND_OUT_OF_ENVELOPE',
] as const;
export type FollowEpisodeExclusion = (typeof followEpisodeExclusions)[number];

/** The 171 binding that decided the tick, re-admitted exactly as `evaluateFollowPolicy` reports it. */
export const followEvidenceBindings = [
  'NONE',
  'FOLLOWING_TARGET',
  'CUT_IN_BLEND',
  'LEADER_DELAY',
  'TTC_CAP',
  'HYSTERESIS',
  'CONTACT_FLOOR',
  'STOP_REQUIRED',
] as const;
export type FollowEvidenceBinding = (typeof followEvidenceBindings)[number];

export const FOLLOW_ESTIMATOR_LIMITS = Object.freeze({
  version: FOLLOW_ESTIMATOR_VERSION,
  idCodeUnits: FOLLOW_POLICY_LIMITS.idCodeUnits,
  maximumSeed: 4_294_967_295,
  /** The 171 tick rate; a held adoption is converted with exactly this cadence. */
  tickHz: FOLLOW_POLICY_LIMITS.tickHz,
  /** The delivered 046/048 targets cover speeds up to 30 m/s. */
  maximumCoveredSpeedMps: FOLLOW_POLICY_LIMITS.maximumCoveredSpeedMps,
  /** Bounded admission for an observed gap. */
  maximumGapM: FOLLOW_POLICY_LIMITS.maximumCoveredGapM,
  /** Same hard traffic floor as 171: a lead inside it zeroes the target and hides every key. */
  minimumLeadGapM: FOLLOW_POLICY_LIMITS.minimumLeadGapM,
  maximumObservedSpeedMps: 100,
  minimumEstimateEpisodes: 2,
  minimumValidationEpisodes: 2,
  /** A held band needs two samples per side to prove an oscillation instead of a drift. */
  minimumBandSamples: 2,
  /** Equality tolerance for the requested/committed and gap arithmetic. */
  ratioTolerance: 1e-6,
  /** MAD → sigma (1,4826) times the asymptotic standard error of a median (1,2533). */
  uncertainMedianFactor: 1.8584,
  /** `ceil(delay · 60)` fixes the delay within half a tick; that is the measurement floor. */
  leaderDelayTickQuantisationS: 1 / 120,
  uncertaintyFloor: Object.freeze({
    cutin_brake_response: 0.02,
    closing_ttc_threshold: 0.05,
    leader_change_delay: 1 / 120,
    following_hysteresis: 0.02,
  }),
  maximumUncertainty: Object.freeze({
    cutin_brake_response: 0.15,
    closing_ttc_threshold: 0.5,
    leader_change_delay: 0.1,
    following_hysteresis: 0.5,
  }),
  validationTolerance: Object.freeze({
    cutin_brake_response: 0.1,
    closing_ttc_threshold: 0.5,
    leader_change_delay: 0.05,
    following_hysteresis: 0.2,
  }),
  retainedHistory: 0,
});

export const followEligibleEpisodes: Readonly<Record<FollowEstimatorKey, FollowEstimatorEpisode>> =
  Object.freeze({
    cutin_brake_response: 'CUT_IN',
    closing_ttc_threshold: 'CLOSING_TTC',
    leader_change_delay: 'LEADER_CHANGE',
    following_hysteresis: 'HYSTERESIS',
  });

export const followEligibleContexts: Readonly<Record<FollowEstimatorKey, string>> = Object.freeze({
  cutin_brake_response:
    'un cut-in real declarat de observație, în care 048 cere o reducere sub angajamentul anterior, ' +
    'măsurat ca fracțiunea din diferență aplicată imediat de 171',
  closing_ttc_threshold:
    'o apropiere reală de lider (viteză de închidere pozitivă, decalaj peste podeaua de 5 m) în care ' +
    'plafonul de contact al 171 limitează efectiv ținta sub preferința 048',
  leader_change_delay:
    'o schimbare reală de lider fără cut-in, în care adoptarea liderului nou ar însemna accelerare, ' +
    'măsurată ca numărul de tick-uri ținute înainte de adopție',
  following_hysteresis:
    'o oscilație reală a decalajului în jurul decalajului dorit al 048, cu eșantioane ținute în bandă ' +
    'și eșantioane care ies din ea',
});

export const followGroupConstraints = Object.freeze([
  Object.freeze({
    id: 'CUT_IN_AND_TTC_SHARE_BRAKE',
    keys: Object.freeze(['cutin_brake_response', 'closing_ttc_threshold'] as const),
    explanation:
      'Cut-in-ul și plafonul timpului până la contact împart aceeași frânare: pe un tick de cut-in ' +
      '171 aplică reacția, apoi plafonul de contact peste ea, deci aceeași reducere poate fi ' +
      'explicată de oricare dintre chei. De aceea un episod de cut-in nu este admis la măsurarea ' +
      'pragului TTC, iar un episod TTC trebuie să nu declare cut-in; altfel una dintre valori ar fi ' +
      'dedusă din cealaltă.',
  }),
  Object.freeze({
    id: 'HYSTERESIS_DEPENDS_ON_GAP_BAND',
    keys: Object.freeze(['following_hysteresis'] as const),
    explanation:
      'Histerezisul este identificabil numai față de banda de decalaj a lui 048: cheia ține ' +
      'angajamentul cât timp |decalaj − decalaj dorit| rămâne sub toleranță. Fără eșantioane ' +
      'ținute și eșantioane care ies din bandă, cheia rămâne neobservată; o singură latură a benzii ' +
      'este doar o limită, nu o valoare. Când decalajul nu oscilează, banda nu se separă de câștigul ' +
      'de viteză al lui 048.',
  }),
  Object.freeze({
    id: 'LEADER_CHANGE_REQUIRES_NO_CUT_IN',
    keys: Object.freeze(['leader_change_delay'] as const),
    explanation:
      'Întârzierea se măsoară doar la un lider nou apărut fără cut-in: politica 171 adoptă ' +
      'cut-in-ul imediat și nu îl poate amâna, deci un astfel de episod nu poate dovedi niciodată ' +
      'întârzierea. O reducere se adoptă pe loc chiar și în timpul ținerii, deci o ținere întreruptă ' +
      'de o frânare lasă cheia neobservată.',
  }),
  Object.freeze({
    id: 'FOLLOW_KEYS_FROM_ONE_TRAJECTORY',
    keys: FOLLOW_POLICY_KEYS,
    explanation:
      'Cele patru chei pot fi observate în aceeași călătorie, dar nu din aceleași fapte: cut-in-ul ' +
      'cere o interpunere declarată, pragul TTC cere o închidere în care plafonul leagă, întârzierea ' +
      'cere un lider nou fără cut-in, iar histerezisul cere o oscilație reală în bandă. Un set care ' +
      'conține doar un tip de fapt lasă celelalte chei neobservate, în loc să le deducă din ' +
      'traiectoria comună.',
  }),
]);

export interface FollowEvidenceSample {
  readonly tick: number;
  readonly egoSpeedMps: number;
  /** Observed leader of the tick; all four are null when the lane ahead is free. */
  readonly leaderId: string | null;
  readonly leaderIncarnation: number | null;
  readonly leadGapM: number | null;
  readonly leadSpeedMps: number | null;
  /** The 048 desired gap of the same tick; null without a leader. */
  readonly desiredGapM: number | null;
  /** Leader identity of the previous tick, as the caller state carried it. */
  readonly previousLeaderId: string | null;
  readonly previousLeaderIncarnation: number | null;
  /** Commitment of the previous tick; null when 171 had no commitment yet. */
  readonly previousCommittedMps: number | null;
  readonly cutIn: boolean;
  readonly stopRequired: boolean;
  /** True when `evaluateFollowPolicy` applied the keys, i.e. the command reason was FOLLOW_POLICY. */
  readonly policyActive: boolean;
  /** The 048 preference of the tick, before the 171 layer. */
  readonly requestedTargetMps: number;
  /** The 171 committed target of the same tick. */
  readonly committedTargetMps: number;
  /** The 171 binding that decided the committed target. */
  readonly binding: FollowEvidenceBinding;
}

export interface FollowEvidenceEpisode {
  /** Stable physical identity of the demonstration, never a frame count. */
  readonly episodeId: string;
  /** 086 occurrence ordinal; `episodeId + occurrence` is the deduplicated evidence identity. */
  readonly occurrence: number;
  readonly eligibility: EligibilityWindowRecord;
  readonly artifacts: FilteredWindowRecord;
  readonly samples: readonly FollowEvidenceSample[];
}

export interface FollowEstimatorInput {
  readonly episodes: readonly FollowEvidenceEpisode[];
  /** Explicit seed for the deterministic estimate/validation split; a wall clock never splits. */
  readonly splitSeed: number;
}

export interface FollowValidation {
  readonly status: 'VALIDATED' | 'OUTSIDE_TOLERANCE' | 'TOO_SMALL' | 'NO_DATA';
  readonly episodes: number;
  readonly value: number | null;
  readonly error: number | null;
  readonly tolerance: number;
  readonly detail: string;
}

export interface FollowKeyEstimate {
  readonly key: FollowEstimatorKey;
  readonly episode: FollowEstimatorEpisode;
  readonly unit: string;
  readonly eligibleContext: string;
  readonly status: 'CANDIDATE' | 'UNOBSERVED';
  readonly value: number | null;
  readonly rawValue: number | null;
  readonly clamped: boolean;
  readonly uncertainty: number | null;
  readonly uncertaintyThreshold: number;
  readonly sourceEpisodes: number;
  readonly sourceSamples: number;
  readonly excluded: Readonly<Record<string, number>>;
  readonly reason: FollowEstimatorReason | null;
  readonly validation: FollowValidation;
}

export interface FollowCompatibility {
  readonly policyVersion: '171-follow-policy-v1';
  readonly candidateOnly: true;
  readonly changesPolicySemantics: false;
  readonly catalogRanges: Readonly<
    Record<
      FollowEstimatorKey,
      { readonly min: number; readonly max: number; readonly unit: string }
    >
  >;
}

export interface FollowEstimatorResult {
  readonly version: typeof FOLLOW_ESTIMATOR_VERSION;
  readonly splitSeed: number;
  readonly keys: Readonly<Record<FollowEstimatorKey, FollowKeyEstimate>>;
  readonly groupConstraints: typeof followGroupConstraints;
  readonly admittedEpisodes: readonly string[];
  readonly refusedEpisodes: readonly {
    readonly episodeId: string;
    readonly reason: FollowEpisodeRefusal;
  }[];
  readonly compatibility: FollowCompatibility;
}

interface AdmittedSample {
  readonly tick: number;
  readonly egoSpeedMps: number;
  readonly leaderId: string | null;
  readonly leaderIncarnation: number | null;
  readonly leadGapM: number | null;
  readonly leadSpeedMps: number | null;
  readonly desiredGapM: number | null;
  readonly previousLeaderId: string | null;
  readonly previousLeaderIncarnation: number | null;
  readonly previousCommittedMps: number | null;
  readonly cutIn: boolean;
  readonly stopRequired: boolean;
  readonly policyActive: boolean;
  readonly requestedTargetMps: number;
  readonly committedTargetMps: number;
  readonly binding: FollowEvidenceBinding;
  readonly leaderChanged: boolean;
}

interface AdmittedEpisode {
  readonly id: string;
  readonly samples: readonly AdmittedSample[];
}

function fail(message: string): never {
  throw new Error(message);
}
function identity(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > FOLLOW_ESTIMATOR_LIMITS.idCodeUnits ||
    value.trim() !== value
  )
    fail(`Invalid follow evidence ${field}`);
  return value;
}
function optionalIdentity(value: unknown, field: string): string | null {
  return value === null ? null : identity(value, field);
}
function finite(value: unknown, minimum: number, maximum: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    fail(`Invalid follow evidence ${field}`);
  return value;
}
function optionalFinite(
  value: unknown,
  minimum: number,
  maximum: number,
  field: string,
): number | null {
  return value === null ? null : finite(value, minimum, maximum, field);
}
function count(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(`Invalid follow evidence ${field}`);
  return value;
}
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b),
    middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
function admitSample(value: unknown): AdmittedSample {
  if (!value || typeof value !== 'object') fail('Invalid follow evidence sample');
  const sample = value as FollowEvidenceSample,
    tick = count(sample.tick, 'sample tick'),
    egoSpeedMps = finite(
      sample.egoSpeedMps,
      0,
      FOLLOW_ESTIMATOR_LIMITS.maximumObservedSpeedMps,
      'sample speed',
    ),
    leaderId = optionalIdentity(sample.leaderId, 'sample leader id'),
    leaderIncarnation =
      sample.leaderIncarnation === null
        ? null
        : count(sample.leaderIncarnation, 'sample incarnation'),
    leadGapM = optionalFinite(
      sample.leadGapM,
      0,
      FOLLOW_ESTIMATOR_LIMITS.maximumGapM,
      'sample lead gap',
    ),
    leadSpeedMps = optionalFinite(
      sample.leadSpeedMps,
      0,
      FOLLOW_ESTIMATOR_LIMITS.maximumObservedSpeedMps,
      'sample lead speed',
    ),
    desiredGapM = optionalFinite(
      sample.desiredGapM,
      0,
      FOLLOW_ESTIMATOR_LIMITS.maximumGapM,
      'sample desired gap',
    ),
    previousLeaderId = optionalIdentity(sample.previousLeaderId, 'sample previous leader id'),
    previousLeaderIncarnation =
      sample.previousLeaderIncarnation === null
        ? null
        : count(sample.previousLeaderIncarnation, 'sample previous incarnation'),
    previousCommittedMps = optionalFinite(
      sample.previousCommittedMps,
      0,
      FOLLOW_ESTIMATOR_LIMITS.maximumCoveredSpeedMps,
      'sample previous commitment',
    ),
    requestedTargetMps = finite(
      sample.requestedTargetMps,
      0,
      FOLLOW_ESTIMATOR_LIMITS.maximumCoveredSpeedMps,
      'sample requested target',
    ),
    committedTargetMps = finite(
      sample.committedTargetMps,
      0,
      FOLLOW_ESTIMATOR_LIMITS.maximumCoveredSpeedMps,
      'sample committed target',
    );
  for (const field of ['cutIn', 'stopRequired', 'policyActive'] as const)
    if (typeof sample[field] !== 'boolean') fail(`Invalid follow evidence sample ${field}`);
  if (!(followEvidenceBindings as readonly string[]).includes(sample.binding))
    fail('Invalid follow evidence sample binding');
  requireLeaderFacts({ leaderId, leaderIncarnation, leadGapM, leadSpeedMps }, 'sample');
  requireLeaderFacts(
    { leaderId: previousLeaderId, leaderIncarnation: previousLeaderIncarnation },
    'sample previous',
  );
  if ((desiredGapM === null) !== (leaderId === null))
    fail('Incomplete follow evidence sample desired gap');
  return Object.freeze({
    tick,
    egoSpeedMps,
    leaderId,
    leaderIncarnation,
    leadGapM,
    leadSpeedMps,
    desiredGapM,
    previousLeaderId,
    previousLeaderIncarnation,
    previousCommittedMps,
    cutIn: sample.cutIn,
    stopRequired: sample.stopRequired,
    policyActive: sample.policyActive,
    requestedTargetMps,
    committedTargetMps,
    binding: sample.binding,
    leaderChanged: previousLeaderId !== leaderId || previousLeaderIncarnation !== leaderIncarnation,
  });
}
function requireLeaderFacts(
  facts: {
    readonly leaderId: string | null;
    readonly leaderIncarnation: number | null;
    readonly leadGapM?: number | null;
    readonly leadSpeedMps?: number | null;
  },
  field: string,
): void {
  const hasLeader = facts.leaderId !== null,
    complete =
      hasLeader === (facts.leaderIncarnation !== null) &&
      (facts.leadGapM === undefined || hasLeader === (facts.leadGapM !== null)) &&
      (facts.leadSpeedMps === undefined || hasLeader === (facts.leadSpeedMps !== null));
  if (!complete) fail(`Incomplete follow evidence ${field} leader facts`);
}
function admitEpisode(value: unknown): AdmittedEpisode | FollowEpisodeRefusal {
  if (!value || typeof value !== 'object') fail('Invalid follow evidence episode');
  const episode = value as FollowEvidenceEpisode,
    id = identity(episode.episodeId, 'episode id'),
    eligibility = episode.eligibility,
    artifacts = episode.artifacts;
  count(episode.occurrence, 'episode occurrence');
  if (!eligibility || typeof eligibility !== 'object') fail('Invalid follow evidence eligibility');
  if (!artifacts || typeof artifacts !== 'object') fail('Invalid follow evidence artifacts');
  if (
    !Number.isSafeInteger(artifacts.prefix === null ? -1 : artifacts.prefix.fromTick) ||
    (artifacts.prefix !== null &&
      (!Number.isSafeInteger(artifacts.prefix.toTick) ||
        artifacts.prefix.toTick < artifacts.prefix.fromTick))
  )
    fail('Invalid follow evidence prefix');
  if (
    eligibility.windowClass === 'EXCLUDED' ||
    eligibility.controlMode !== 'LEARNING' ||
    eligibility.learningEligible !== true
  )
    return 'NOT_LEARNING_ELIGIBLE';
  if (artifacts.windowClass !== 'PREFIX_ELIGIBLE' || artifacts.prefix === null)
    return 'NO_USABLE_PREFIX';
  for (const key of ['windowId', 'segmentId', 'vehicleId', 'incarnation'] as const)
    if (eligibility[key] !== artifacts[key]) fail('Mismatched follow evidence identity');
  const prefix = artifacts.prefix,
    samples: AdmittedSample[] = [];
  let previousTick = -1;
  for (const sample of episode.samples as readonly unknown[]) {
    const admitted = admitSample(sample);
    if (admitted.tick < prefix.fromTick || admitted.tick > prefix.toTick) continue;
    if (admitted.tick <= previousTick) fail('Follow evidence samples are not strictly ordered');
    previousTick = admitted.tick;
    samples.push(admitted);
  }
  return Object.freeze({ id, samples: Object.freeze(samples) });
}
function hash(seed: number, text: string): number {
  let value = 0x811c9dc5;
  for (const character of `${seed}:${text}`) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}
/** Deterministic interleaved split: every second identity by seeded hash goes to validation. */
function splitEpisodes(
  ids: readonly string[],
  seed: number,
): ReadonlyMap<string, 'ESTIMATE' | 'VALIDATION'> {
  const ordered = [...new Set(ids)].sort((a, b) => {
    const difference = hash(seed, a) - hash(seed, b);
    return difference === 0 ? (a < b ? -1 : a > b ? 1 : 0) : difference;
  });
  return new Map(
    ordered.map((id, index) => [id, index % 2 === 0 ? 'ESTIMATE' : 'VALIDATION'] as const),
  );
}
function splitOf(
  split: ReadonlyMap<string, 'ESTIMATE' | 'VALIDATION'>,
  id: string,
): 'ESTIMATE' | 'VALIDATION' {
  return split.get(id) ?? 'ESTIMATE';
}
function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
function frozenCounts(counts: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries([...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))));
}
function catalogRange(key: FollowEstimatorKey) {
  const definition = getParameterDefinition(key);
  return Object.freeze({ min: definition.min, max: definition.max, unit: definition.unit });
}
function compatibility(): FollowCompatibility {
  return Object.freeze({
    policyVersion: FOLLOW_POLICY_LIMITS.version,
    candidateOnly: true,
    changesPolicySemantics: false,
    catalogRanges: Object.freeze(
      Object.fromEntries(FOLLOW_ESTIMATOR_KEYS.map((key) => [key, catalogRange(key)])) as Record<
        FollowEstimatorKey,
        { min: number; max: number; unit: string }
      >,
    ),
  });
}
function emptyValidation(key: FollowEstimatorKey): FollowValidation {
  return Object.freeze({
    status: 'NO_DATA',
    episodes: 0,
    value: null,
    error: null,
    tolerance: FOLLOW_ESTIMATOR_LIMITS.validationTolerance[key],
    detail: 'no independent demonstration episodes',
  });
}
function unobserved(
  key: FollowEstimatorKey,
  reason: FollowEstimatorReason,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: FollowValidation = emptyValidation(key),
  uncertainty: number | null = null,
): FollowKeyEstimate {
  return Object.freeze({
    key,
    episode: followEligibleEpisodes[key],
    unit: getParameterDefinition(key).unit,
    eligibleContext: followEligibleContexts[key],
    status: 'UNOBSERVED',
    value: null,
    rawValue: null,
    clamped: false,
    uncertainty,
    uncertaintyThreshold: FOLLOW_ESTIMATOR_LIMITS.maximumUncertainty[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason,
    validation,
  });
}
function candidate(
  key: FollowEstimatorKey,
  rawValue: number,
  uncertainty: number,
  episodes: number,
  samples: number,
  excluded: ReadonlyMap<string, number>,
  validation: FollowValidation,
): FollowKeyEstimate | FollowEstimatorReason {
  if (uncertainty > FOLLOW_ESTIMATOR_LIMITS.maximumUncertainty[key])
    return 'UNCERTAINTY_ABOVE_THRESHOLD';
  const range = catalogRange(key),
    value = Math.max(range.min, Math.min(range.max, rawValue));
  return Object.freeze({
    key,
    episode: followEligibleEpisodes[key],
    unit: range.unit,
    eligibleContext: followEligibleContexts[key],
    status: 'CANDIDATE',
    value,
    rawValue,
    clamped: value !== rawValue,
    uncertainty,
    uncertaintyThreshold: FOLLOW_ESTIMATOR_LIMITS.maximumUncertainty[key],
    sourceEpisodes: episodes,
    sourceSamples: samples,
    excluded: frozenCounts(excluded),
    reason: null,
    validation,
  });
}
function continuousValidation(
  key: FollowEstimatorKey,
  estimate: number,
  values: readonly number[],
): FollowValidation {
  const tolerance = FOLLOW_ESTIMATOR_LIMITS.validationTolerance[key];
  if (values.length < FOLLOW_ESTIMATOR_LIMITS.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: values.length,
      value: values.length === 0 ? null : median(values),
      error: values.length === 0 ? null : Math.abs(median(values) - estimate),
      tolerance,
      detail: `validation set has ${values.length} of the required ${FOLLOW_ESTIMATOR_LIMITS.minimumValidationEpisodes} episodes`,
    });
  const value = median(values),
    error = Math.abs(value - estimate),
    unit = getParameterDefinition(key).unit;
  return Object.freeze({
    status: error <= tolerance ? 'VALIDATED' : 'OUTSIDE_TOLERANCE',
    episodes: values.length,
    value,
    error,
    tolerance,
    detail: `held-out estimate ${value.toFixed(4)} ${unit} differs by ${error.toFixed(4)} ${unit}`,
  });
}
function uncertaintyOf(key: FollowEstimatorKey, values: readonly number[]): number {
  const centre = median(values),
    deviation = median(values.map((value) => Math.abs(value - centre)));
  return Math.max(
    FOLLOW_ESTIMATOR_LIMITS.uncertaintyFloor[key],
    (FOLLOW_ESTIMATOR_LIMITS.uncertainMedianFactor * deviation) / Math.sqrt(values.length),
  );
}
function floorApplied(sample: AdmittedSample): boolean {
  return (
    sample.stopRequired ||
    (sample.leadGapM !== null && sample.leadGapM <= FOLLOW_ESTIMATOR_LIMITS.minimumLeadGapM)
  );
}
/**
 * Cut-in response from the blend of the delivered policy: the committed target moves from the
 * previous commitment towards the 048 preference by exactly the key, so the key is the fraction of
 * the offered reduction that was applied.
 */
function cutInValue(episode: AdmittedEpisode, excluded: Map<string, number>) {
  const tolerance = FOLLOW_ESTIMATOR_LIMITS.ratioTolerance,
    values: number[] = [];
  let issue: FollowEpisodeExclusion | null = null;
  for (const sample of episode.samples) {
    if (!sample.cutIn) continue;
    if (!sample.policyActive) {
      issue ??= 'NO_CUT_IN_EPISODE';
      continue;
    }
    if (floorApplied(sample)) {
      issue ??= 'CUT_IN_WITHOUT_REDUCTION';
      continue;
    }
    if (sample.previousCommittedMps === null) {
      issue ??= 'CUT_IN_WITHOUT_REDUCTION';
      continue;
    }
    if (sample.binding !== 'CUT_IN_BLEND') {
      issue ??= 'CUT_IN_WITHOUT_REDUCTION';
      continue;
    }
    const offered = sample.previousCommittedMps - sample.requestedTargetMps;
    if (offered <= tolerance) {
      issue ??= 'CUT_IN_WITHOUT_REDUCTION';
      continue;
    }
    const factor = (sample.previousCommittedMps - sample.committedTargetMps) / offered;
    if (factor < -tolerance || factor > 1 + tolerance) {
      issue ??= 'CUT_IN_FACTOR_OUT_OF_ENVELOPE';
      continue;
    }
    values.push(Math.max(0, Math.min(1, factor)));
  }
  if (values.length === 0) {
    increment(excluded, issue ?? 'NO_CUT_IN_EPISODE');
    return null;
  }
  return { value: median(values), samples: values.length };
}
/**
 * Closing threshold inverted from the contact cap: while the ego closes on the leader the committed
 * target is `leadSpeed + (gap − 5 m) / threshold`, so the threshold is the remaining margin divided
 * by the closing speed the policy allowed. Only a tick where the cap actually bound is a value; a
 * non-binding cap is a bound, not an observation.
 */
function closingValue(episode: AdmittedEpisode, excluded: Map<string, number>) {
  const tolerance = FOLLOW_ESTIMATOR_LIMITS.ratioTolerance,
    range = catalogRange('closing_ttc_threshold'),
    values: number[] = [];
  let issue: FollowEpisodeExclusion | null = null;
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    if (sample.leadGapM === null || sample.leadSpeedMps === null) continue;
    if (floorApplied(sample)) {
      issue ??= 'NO_CLOSING_EPISODE';
      continue;
    }
    if (sample.egoSpeedMps - sample.leadSpeedMps <= tolerance) {
      issue ??= 'NO_CLOSING_EPISODE';
      continue;
    }
    // A cut-in and a leader change belong to their own episodes; the same tick would mix keys.
    if (sample.cutIn || sample.leaderChanged) continue;
    if (sample.binding !== 'TTC_CAP') {
      issue ??= 'TTC_CAP_NOT_BOUND';
      continue;
    }
    const aboveLead = sample.committedTargetMps - sample.leadSpeedMps;
    if (aboveLead <= tolerance) {
      issue ??= 'TTC_COMMIT_NOT_ABOVE_LEAD';
      continue;
    }
    const threshold = (sample.leadGapM - FOLLOW_ESTIMATOR_LIMITS.minimumLeadGapM) / aboveLead;
    if (threshold < range.min - tolerance || threshold > range.max + tolerance) {
      issue ??= 'TTC_THRESHOLD_OUT_OF_ENVELOPE';
      continue;
    }
    values.push(Math.max(range.min, Math.min(range.max, threshold)));
  }
  if (values.length === 0) {
    increment(excluded, issue ?? 'NO_CLOSING_EPISODE');
    return null;
  }
  return { value: median(values), samples: values.length };
}
/**
 * Leader adoption delay from the hold of the delivered policy: a new leader without cut-in whose
 * adoption would accelerate is held for `ceil(delay · 60)` ticks, so the count of held ticks is the
 * measured delay within half a tick. A reduction is adopted on the spot and an adoption that was
 * clamped by the contact cap is not an observation of the delay.
 */
function leaderDelayValue(episode: AdmittedEpisode, excluded: Map<string, number>) {
  const samples = episode.samples,
    tolerance = FOLLOW_ESTIMATOR_LIMITS.ratioTolerance;
  let issue: FollowEpisodeExclusion | null = null;
  for (let index = 0; index < samples.length; index += 1) {
    const change = samples[index]!;
    if (!change.policyActive || change.cutIn || !change.leaderChanged) continue;
    // The first tick of a window has no caller commitment yet: there is nothing to hold.
    if (change.previousCommittedMps === null || change.leaderId === null) continue;
    if (change.requestedTargetMps <= change.previousCommittedMps + tolerance) {
      issue ??= 'LEADER_CHANGE_WITHOUT_ACCELERATION';
      continue;
    }
    if (change.binding !== 'LEADER_DELAY') {
      if (Math.abs(change.committedTargetMps - change.requestedTargetMps) <= tolerance)
        // The adoption was not delayed at all: a real zero, measured from a real leader change.
        return { value: 0, samples: 1 };
      issue ??= 'LEADER_DELAY_CONSTRAINED';
      continue;
    }
    let held = 1,
      adoption = -1,
      interrupted = false,
      censored = true;
    for (let position = index + 1; position < samples.length; position += 1) {
      const sample = samples[position]!;
      if (sample.leaderId !== change.leaderId) {
        censored = true;
        break;
      }
      // A reduction of the previous commitment is adopted on the spot and ends the hold early.
      if (
        sample.previousCommittedMps !== null &&
        sample.requestedTargetMps < sample.previousCommittedMps - tolerance
      ) {
        interrupted = true;
        break;
      }
      if (sample.binding === 'LEADER_DELAY') {
        held += 1;
        continue;
      }
      if (sample.binding === 'FOLLOWING_TARGET') adoption = position;
      censored = false;
      break;
    }
    if (interrupted) {
      issue ??= 'LEADER_HOLD_INTERRUPTED_BY_REDUCTION';
      continue;
    }
    if (censored || adoption < 0) {
      issue ??= 'LEADER_HOLD_CENSORED';
      continue;
    }
    const ticks = Math.min(held, FOLLOW_POLICY_LIMITS.maximumLeaderChangeTicks);
    return {
      value: (ticks - 0.5) / FOLLOW_ESTIMATOR_LIMITS.tickHz,
      samples: ticks,
    };
  }
  increment(excluded, issue ?? 'NO_LEADER_CHANGE');
  return null;
}
interface BandBounds {
  readonly lower: number;
  readonly upper: number;
  readonly samples: number;
}
/**
 * Hysteresis band from the samples the policy actually held and the samples that left the band:
 * a held sample proves `|gap − desired| < band`, a moved one proves `|gap − desired| ≥ band`.
 */
function bandBounds(
  episode: AdmittedEpisode,
  excluded: Map<string, number>,
): { lower: number; upper: number; samples: number } | null {
  const held: number[] = [],
    moved: number[] = [],
    signs: number[] = [];
  for (const sample of episode.samples) {
    if (!sample.policyActive) continue;
    if (sample.leadGapM === null || sample.desiredGapM === null) continue;
    if (sample.cutIn || sample.leaderChanged || floorApplied(sample) || sample.binding === 'NONE')
      continue;
    const signed = sample.leadGapM - sample.desiredGapM,
      deviation = Math.abs(signed);
    if (sample.binding === 'HYSTERESIS') {
      held.push(deviation);
      signs.push(signed);
    } else if (sample.binding === 'FOLLOWING_TARGET' && sample.previousCommittedMps !== null)
      moved.push(deviation);
  }
  if (held.length === 0 && moved.length === 0) {
    increment(excluded, 'NO_HYSTERESIS_EPISODE');
    return null;
  }
  if (held.length < FOLLOW_ESTIMATOR_LIMITS.minimumBandSamples) {
    increment(excluded, 'HYSTERESIS_LOWER_BOUND_UNOBSERVED');
    return null;
  }
  if (moved.length < FOLLOW_ESTIMATOR_LIMITS.minimumBandSamples) {
    increment(excluded, 'HYSTERESIS_UPPER_BOUND_UNOBSERVED');
    return null;
  }
  if (!(signs.some((value) => value > 0) && signs.some((value) => value < 0))) {
    increment(excluded, 'NO_BAND_OSCILLATION');
    return null;
  }
  const lower = Math.max(...held),
    upper = Math.min(...moved),
    range = catalogRange('following_hysteresis');
  if (upper > range.max + FOLLOW_ESTIMATOR_LIMITS.ratioTolerance) {
    increment(excluded, 'HYSTERESIS_BOUND_OUT_OF_ENVELOPE');
    return null;
  }
  if (lower >= upper) {
    increment(excluded, 'CONTRADICTORY_BAND_BOUNDS');
    return null;
  }
  return { lower, upper, samples: held.length + moved.length };
}
interface EpisodeValue {
  readonly id: string;
  readonly value: number;
  readonly samples: number;
}
function collectValues(
  episodes: readonly AdmittedEpisode[],
  measure: (
    episode: AdmittedEpisode,
    excluded: Map<string, number>,
  ) => { value: number; samples: number } | null,
): { values: EpisodeValue[]; excluded: Map<string, number> } {
  const values: EpisodeValue[] = [],
    excluded = new Map<string, number>();
  for (const episode of episodes) {
    const measured = measure(episode, excluded);
    if (measured !== null)
      values.push({ id: episode.id, value: measured.value, samples: measured.samples });
  }
  return { values, excluded };
}
/** Closed precedence: the reason names the most specific unusable fact of the set. */
const noValueReason: Readonly<Record<FollowEstimatorKey, readonly FollowEstimatorReason[]>> =
  Object.freeze({
    cutin_brake_response: [
      'CUT_IN_FACTOR_OUT_OF_ENVELOPE',
      'CUT_IN_WITHOUT_REDUCTION',
      'NO_CUT_IN_EPISODE',
    ],
    closing_ttc_threshold: [
      'TTC_THRESHOLD_OUT_OF_ENVELOPE',
      'TTC_COMMIT_NOT_ABOVE_LEAD',
      'TTC_CAP_NOT_BOUND',
      'NO_CLOSING_EPISODE',
    ],
    leader_change_delay: [
      'LEADER_HOLD_INTERRUPTED_BY_REDUCTION',
      'LEADER_DELAY_CONSTRAINED',
      'LEADER_HOLD_CENSORED',
      'LEADER_CHANGE_WITHOUT_ACCELERATION',
      'NO_LEADER_CHANGE',
    ],
    following_hysteresis: [
      'CONTRADICTORY_BAND_BOUNDS',
      'NO_BAND_OSCILLATION',
      'HYSTERESIS_BOUND_OUT_OF_ENVELOPE',
      'HYSTERESIS_UPPER_BOUND_UNOBSERVED',
      'HYSTERESIS_LOWER_BOUND_UNOBSERVED',
      'NO_HYSTERESIS_EPISODE',
    ],
  });
function reasonFor(
  key: FollowEstimatorKey,
  excluded: ReadonlyMap<string, number>,
): FollowEstimatorReason {
  return (
    noValueReason[key].find((reason) => excluded.has(reason)) ??
    ('NO_ELIGIBLE_EPISODES' as FollowEstimatorReason)
  );
}
function estimateContinuous(
  key: FollowEstimatorKey,
  episodes: readonly AdmittedEpisode[],
  seed: number,
  measure: (
    episode: AdmittedEpisode,
    excluded: Map<string, number>,
  ) => { value: number; samples: number } | null,
): FollowKeyEstimate {
  const { values, excluded } = collectValues(episodes, measure),
    split = splitEpisodes(
      values.map((entry) => entry.id),
      seed,
    ),
    estimateValues = values.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationValues = values.filter((entry) => splitOf(split, entry.id) === 'VALIDATION'),
    estimateSamples = estimateValues.reduce((sum, entry) => sum + entry.samples, 0);
  if (values.length === 0) return unobserved(key, reasonFor(key, excluded), 0, 0, excluded);
  if (estimateValues.length < FOLLOW_ESTIMATOR_LIMITS.minimumEstimateEpisodes)
    return unobserved(
      key,
      'INSUFFICIENT_DISTINCT_EPISODES',
      values.length,
      values.reduce((sum, entry) => sum + entry.samples, 0),
      excluded,
    );
  const numbers = estimateValues.map((entry) => entry.value),
    estimate = median(numbers),
    uncertainty = uncertaintyOf(key, numbers),
    validation = continuousValidation(
      key,
      estimate,
      validationValues.map((entry) => entry.value),
    ),
    result = candidate(
      key,
      estimate,
      uncertainty,
      estimateValues.length,
      estimateSamples,
      excluded,
      validation,
    );
  return typeof result === 'string'
    ? unobserved(
        key,
        result,
        estimateValues.length,
        estimateSamples,
        excluded,
        validation,
        uncertainty,
      )
    : result;
}
function bandValidation(
  estimate: number,
  bounds: readonly BandBounds[],
  tolerance: number,
): FollowValidation {
  if (bounds.length < FOLLOW_ESTIMATOR_LIMITS.minimumValidationEpisodes)
    return Object.freeze({
      status: 'TOO_SMALL',
      episodes: bounds.length,
      value:
        bounds.length === 0 ? null : median(bounds.map((entry) => (entry.lower + entry.upper) / 2)),
      error: null,
      tolerance,
      detail: `validation set has ${bounds.length} of the required ${FOLLOW_ESTIMATOR_LIMITS.minimumValidationEpisodes} episodes`,
    });
  const held = bounds.map((entry) => entry.lower),
    moved = bounds.map((entry) => entry.upper),
    value = median(bounds.map((entry) => (entry.lower + entry.upper) / 2)),
    inconsistent = [
      ...held.filter((deviation) => deviation > estimate + tolerance),
      ...moved.filter((deviation) => deviation < estimate - tolerance),
    ];
  return Object.freeze({
    status: inconsistent.length === 0 ? 'VALIDATED' : 'OUTSIDE_TOLERANCE',
    episodes: bounds.length,
    value,
    error: Math.abs(value - estimate),
    tolerance,
    detail: `${bounds.length} held-out bands agree with ${estimate.toFixed(4)} m`,
  });
}
function hysteresisEstimate(episodes: readonly AdmittedEpisode[], seed: number): FollowKeyEstimate {
  const excluded = new Map<string, number>(),
    bands: (BandBounds & { id: string })[] = [];
  for (const episode of episodes) {
    const measured = bandBounds(episode, excluded);
    if (measured !== null) bands.push({ id: episode.id, ...measured });
  }
  if (bands.length === 0)
    return unobserved(
      'following_hysteresis',
      reasonFor('following_hysteresis', excluded),
      0,
      0,
      excluded,
    );
  const split = splitEpisodes(
      bands.map((entry) => entry.id),
      seed,
    ),
    estimateBands = bands.filter((entry) => splitOf(split, entry.id) === 'ESTIMATE'),
    validationBands = bands.filter((entry) => splitOf(split, entry.id) === 'VALIDATION'),
    estimateSamples = estimateBands.reduce((sum, entry) => sum + entry.samples, 0);
  if (estimateBands.length < FOLLOW_ESTIMATOR_LIMITS.minimumEstimateEpisodes)
    return unobserved(
      'following_hysteresis',
      'INSUFFICIENT_DISTINCT_EPISODES',
      bands.length,
      bands.reduce((sum, entry) => sum + entry.samples, 0),
      excluded,
    );
  const lower = Math.max(...estimateBands.map((entry) => entry.lower)),
    upper = Math.min(...estimateBands.map((entry) => entry.upper));
  if (lower >= upper)
    return unobserved(
      'following_hysteresis',
      'CONTRADICTORY_BAND_BOUNDS',
      estimateBands.length,
      estimateSamples,
      excluded,
    );
  const value = (lower + upper) / 2,
    uncertainty = (upper - lower) / 2,
    validation = bandValidation(
      value,
      validationBands,
      FOLLOW_ESTIMATOR_LIMITS.validationTolerance.following_hysteresis,
    ),
    result = candidate(
      'following_hysteresis',
      value,
      uncertainty,
      estimateBands.length,
      estimateSamples,
      excluded,
      validation,
    );
  return typeof result === 'string'
    ? unobserved(
        'following_hysteresis',
        result,
        estimateBands.length,
        estimateSamples,
        excluded,
        validation,
        uncertainty,
      )
    : result;
}

/**
 * Estimates the four 171 following keys from demonstrated episodes. The same episodes and the same
 * `splitSeed` always produce the same estimates, the same split and the same refusals.
 */
export function estimateFollowPolicyStyle(input: FollowEstimatorInput): FollowEstimatorResult {
  if (!input || typeof input !== 'object') fail('Invalid follow estimator input');
  const splitSeed = count(input.splitSeed, 'split seed');
  if (splitSeed > FOLLOW_ESTIMATOR_LIMITS.maximumSeed) fail('Follow split seed out of range');
  if (!Array.isArray(input.episodes)) fail('Invalid follow evidence episode list');
  const admitted: AdmittedEpisode[] = [],
    refused: { episodeId: string; reason: FollowEpisodeRefusal }[] = [],
    seen = new Set<string>();
  for (const value of input.episodes as readonly unknown[]) {
    const result = admitEpisode(value);
    if (typeof result === 'string') {
      const raw = value as FollowEvidenceEpisode;
      refused.push({
        episodeId: typeof raw.episodeId === 'string' ? raw.episodeId : '',
        reason: result,
      });
      continue;
    }
    const identityKey = `${result.id}\u0000${(value as FollowEvidenceEpisode).occurrence}`;
    if (seen.has(identityKey)) {
      refused.push({ episodeId: result.id, reason: 'DUPLICATE_EPISODE' });
      continue;
    }
    seen.add(identityKey);
    admitted.push(result);
  }
  const keys = {
    cutin_brake_response: estimateContinuous(
      'cutin_brake_response',
      admitted,
      splitSeed,
      cutInValue,
    ),
    closing_ttc_threshold: estimateContinuous(
      'closing_ttc_threshold',
      admitted,
      splitSeed,
      closingValue,
    ),
    leader_change_delay: estimateContinuous(
      'leader_change_delay',
      admitted,
      splitSeed,
      leaderDelayValue,
    ),
    following_hysteresis: hysteresisEstimate(admitted, splitSeed),
  } as Record<FollowEstimatorKey, FollowKeyEstimate>;
  return Object.freeze({
    version: FOLLOW_ESTIMATOR_VERSION,
    splitSeed,
    keys: Object.freeze(keys),
    groupConstraints: followGroupConstraints,
    admittedEpisodes: Object.freeze(admitted.map((episode) => episode.id)),
    refusedEpisodes: Object.freeze(refused.map((entry) => Object.freeze(entry))),
    compatibility: compatibility(),
  });
}
