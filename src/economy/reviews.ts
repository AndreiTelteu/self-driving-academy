import { comfortReviewModel } from '../experiments';
import type { ComfortMetricsSnapshot, ComfortReviewModel } from '../experiments';
import { choice, createStableId, randomUnit, requireContract, text, tick } from '../sessions';
import { ContractValidationError } from '../sessions';
import { tariffOutcomeStates } from './tariffs';
import type { TariffOutcomeState } from './tariffs';

/**
 * 209 simulated passenger reviews on the 0–5 scale.
 *
 * A review is produced only from facts of the same ride:
 *
 * - comfort comes from the 139 read model (`ComfortMetricsSnapshot` scoped to the ride), so the
 *   mission gate, the dashboard and the review read the same aggregates;
 * - delay comes from the real 061 lifecycle: the measured trip duration against the planned
 *   reference duration of the same ride;
 * - incidents come from the real 028 impacts the 139 model already keeps separate from comfort,
 *   plus the real 137 blocked seconds with the passenger aboard.
 *
 * The formula and its coefficients are versioned. A ride has at most one review: ingesting it again
 * is `EXISTING` and changes nothing, even when a newer review model is installed, so an upgrade
 * never rewrites history silently. Rewriting is possible only through the explicit, versioned
 * `reissue` path, which replaces the entry instead of adding a second one.
 *
 * A ride without evaluable passenger experience produces no review at all: there is no invented
 * rating, no zero and no "perfect" placeholder.
 */
export const REVIEW_MODEL_VERSION = '209-review-v1' as const;

/** Closed reason vocabulary. Every emitted reason explains one real fact of the ride. */
export const reviewReasonCodes = [
  'EFFICIENT_DELIVERY',
  'ON_TIME',
  'SMOOTH_DRIVE',
  'LATE_ARRIVAL',
  'SEVERE_DELAY',
  'HARD_BRAKING',
  'ABRUPT_ACCELERATION',
  'SHARP_TURNS',
  'COLLISION',
  'BLOCKED_ROUTE',
  'RIDE_FAILED',
  'RIDE_CANCELLED',
] as const;
export type ReviewReasonCode = (typeof reviewReasonCodes)[number];

export const REVIEW_MAX_RATING = 5 as const;

export const reviewEligibilityReasons = [
  'NO_PASSENGER_EXPERIENCE',
  'NO_COMFORT_EXPOSURE',
  'COMFORT_SCOPE_MISMATCH',
] as const;
export type ReviewEligibilityReason = (typeof reviewEligibilityReasons)[number];

export const reviewIngestStatuses = [
  'ACCEPTED',
  'EXISTING',
  'DUPLICATE',
  'REISSUED',
  'NOT_ELIGIBLE',
  'REJECTED',
] as const;
export type ReviewIngestStatus = (typeof reviewIngestStatuses)[number];

export const reviewRejectionReasons = [
  'INVALID_SHAPE',
  'UNKNOWN_FIELD',
  'INVALID_IDENTITY',
  'INVALID_NUMBER',
  'INCONSISTENT_STATE',
  'LIMIT_EXCEEDED',
  'UNKNOWN_RIDE',
  'MODEL_CHANGE_NOT_ACKNOWLEDGED',
] as const;
export type ReviewRejectionReason = (typeof reviewRejectionReasons)[number];

export const REVIEW_LIMITS = Object.freeze({
  version: REVIEW_MODEL_VERSION,
  /** Bounded per-ride read model; the oldest review is retired first. */
  retainedReviews: 2_048,
  /** Bounded idempotency memory; the oldest accepted key is evicted first. */
  retainedKeys: 8_192,
  /** Code units per accepted identity. */
  idCodeUnits: 1_024,
  /** One page of reviews read by the KPI popup. */
  maximumPageSize: 128,
  /** Upper bound of every accumulated counter/sum. */
  maximumSum: Number.MAX_SAFE_INTEGER,
  /** A review cannot be built from a longer trip than one full day. */
  maximumTripSeconds: 86_400,
});

export interface ReviewCoefficients {
  readonly version: string;
  /** The rating base of the module 22 formula. */
  readonly ratingBase: number;
  /** Delay below this grace is not a complaint. */
  readonly delayGraceSeconds: number;
  readonly delayPenaltyPointsPerMinute: number;
  readonly maximumDelayPenalty: number;
  /** Delay above this value also produces the severe reason. */
  readonly severeDelaySeconds: number;
  readonly incidentPenaltyPointsPerImpact: number;
  readonly maximumIncidentPenalty: number;
  /** A single real impact above this impulse is reported as severe. */
  readonly severeImpulseNs: number;
  readonly severeImpulseExtraPenalty: number;
  /** Real blocked seconds with the passenger aboard. */
  readonly blockedPenaltyThresholdSeconds: number;
  readonly blockedPenaltyPoints: number;
  readonly failurePenalty: number;
  readonly cancellationPenalty: number;
  /** Symmetric range of the deterministic customer preference adjustment. */
  readonly preferenceRange: number;
  readonly preferenceSalt: string;
}

/**
 * The shipped V1 calibration proposal, versioned with the model. The comfort points come from
 * 139 (`COMFORT_REVIEW_COEFFICIENTS`), so the two modules never disagree about that term.
 */
export const REVIEW_COEFFICIENTS: ReviewCoefficients = Object.freeze({
  version: REVIEW_MODEL_VERSION,
  ratingBase: 5,
  delayGraceSeconds: 30,
  delayPenaltyPointsPerMinute: 0.5,
  maximumDelayPenalty: 2,
  severeDelaySeconds: 180,
  incidentPenaltyPointsPerImpact: 1,
  maximumIncidentPenalty: 2,
  severeImpulseNs: 6_000,
  severeImpulseExtraPenalty: 0.5,
  blockedPenaltyThresholdSeconds: 60,
  blockedPenaltyPoints: 0.5,
  failurePenalty: 2,
  cancellationPenalty: 1.5,
  preferenceRange: 0.5,
  preferenceSalt: '209-review-preference-v1',
});

function boundedVersion(value: unknown, label: string): string {
  const result = text(value);
  requireContract(
    result.length <= 64 && result.trim() === result,
    `Invalid ${label} version label`,
  );
  return result;
}

function nonNegative(value: unknown, maximum: number, label: string): number {
  requireContract(
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum,
    `${label} is invalid`,
  );
  return value;
}

/** Strict reader of the versioned review coefficients. */
export function parseReviewCoefficients(value: unknown): ReviewCoefficients {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Review coefficients must be an object',
  );
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data),
    allowed = [
      'version',
      'ratingBase',
      'delayGraceSeconds',
      'delayPenaltyPointsPerMinute',
      'maximumDelayPenalty',
      'severeDelaySeconds',
      'incidentPenaltyPointsPerImpact',
      'maximumIncidentPenalty',
      'severeImpulseNs',
      'severeImpulseExtraPenalty',
      'blockedPenaltyThresholdSeconds',
      'blockedPenaltyPoints',
      'failurePenalty',
      'cancellationPenalty',
      'preferenceRange',
      'preferenceSalt',
    ];
  requireContract(
    keys.length === allowed.length && allowed.every((key) => Object.hasOwn(data, key)),
    'Missing or unknown review coefficient field',
  );
  requireContract(data.ratingBase === REVIEW_MAX_RATING, 'Rating base must stay on the 0–5 scale');
  requireContract(
    nonNegative(data.severeDelaySeconds, REVIEW_LIMITS.maximumTripSeconds, 'Severe delay') >=
      nonNegative(data.delayGraceSeconds, REVIEW_LIMITS.maximumTripSeconds, 'Delay grace'),
    'Severe delay cannot precede the delay grace',
  );
  requireContract(
    data.failurePenalty === REVIEW_COEFFICIENTS.failurePenalty,
    'The failure penalty is part of the published rating contract',
  );
  requireContract(
    data.cancellationPenalty === REVIEW_COEFFICIENTS.cancellationPenalty,
    'The cancellation penalty is part of the published rating contract',
  );
  requireContract(
    nonNegative(data.preferenceRange, REVIEW_MAX_RATING, 'Preference range') <= 1,
    'Preference range is too wide',
  );
  return Object.freeze({
    version: boundedVersion(data.version, 'review model'),
    ratingBase: REVIEW_MAX_RATING,
    delayGraceSeconds: nonNegative(
      data.delayGraceSeconds,
      REVIEW_LIMITS.maximumTripSeconds,
      'Delay grace',
    ),
    delayPenaltyPointsPerMinute: nonNegative(
      data.delayPenaltyPointsPerMinute,
      REVIEW_MAX_RATING,
      'Delay penalty',
    ),
    maximumDelayPenalty: nonNegative(
      data.maximumDelayPenalty,
      REVIEW_MAX_RATING,
      'Maximum delay penalty',
    ),
    severeDelaySeconds: nonNegative(
      data.severeDelaySeconds,
      REVIEW_LIMITS.maximumTripSeconds,
      'Severe delay',
    ),
    incidentPenaltyPointsPerImpact: nonNegative(
      data.incidentPenaltyPointsPerImpact,
      REVIEW_MAX_RATING,
      'Incident penalty',
    ),
    maximumIncidentPenalty: nonNegative(
      data.maximumIncidentPenalty,
      REVIEW_MAX_RATING,
      'Maximum incident penalty',
    ),
    severeImpulseNs: nonNegative(data.severeImpulseNs, 1e12, 'Severe impulse'),
    severeImpulseExtraPenalty: nonNegative(
      data.severeImpulseExtraPenalty,
      REVIEW_MAX_RATING,
      'Severe impulse penalty',
    ),
    blockedPenaltyThresholdSeconds: nonNegative(
      data.blockedPenaltyThresholdSeconds,
      REVIEW_LIMITS.maximumTripSeconds,
      'Blocked penalty threshold',
    ),
    blockedPenaltyPoints: nonNegative(
      data.blockedPenaltyPoints,
      REVIEW_MAX_RATING,
      'Blocked penalty',
    ),
    failurePenalty: REVIEW_COEFFICIENTS.failurePenalty,
    cancellationPenalty: REVIEW_COEFFICIENTS.cancellationPenalty,
    preferenceRange: nonNegative(data.preferenceRange, 1, 'Preference range'),
    preferenceSalt: boundedVersion(data.preferenceSalt, 'preference'),
  });
}

export interface ReviewPenalties {
  readonly delay: number;
  readonly comfort: number;
  readonly incident: number;
  readonly failure: number;
}

/** The facts the review must explain, kept with the emitted review for inspection. */
export interface ReviewEvidence {
  readonly terminalState: TariffOutcomeState;
  readonly passengerAboard: boolean;
  readonly delaySeconds: number | null;
  readonly referenceTripDurationSeconds: number;
  readonly actualTripDurationSeconds: number | null;
  readonly comfortModelVersion: string | null;
  /** The 139 comfort term, identical to the one the mission and dashboard read. */
  readonly comfortPenalty: number | null;
  readonly impacts: number;
  readonly peakImpulseNs: number;
  readonly blockedSeconds: number;
}

export interface RideReview {
  readonly reviewId: string;
  readonly rideId: string;
  readonly customerId: string;
  readonly rating: number;
  readonly reasonCodes: readonly ReviewReasonCode[];
  readonly tick: number;
  readonly reviewModelVersion: string;
  /** Real 139 passenger seconds of the ride. */
  readonly exposureSeconds: number;
  /** Real 139 passenger intervals the comfort term was derived from. */
  readonly controlIntervals: number;
  readonly profileVersions: readonly string[];
  readonly preferenceAdjustment: number;
  readonly penalties: ReviewPenalties;
  readonly evidence: ReviewEvidence;
  /** Set only when an explicit, acknowledged model change replaced this review. */
  readonly supersedesReviewId: string | null;
  readonly revision: number;
}

export interface ReviewFacts {
  readonly rideId: string;
  readonly customerId: string;
  readonly terminalState: TariffOutcomeState;
  readonly terminalTick: number;
  /** Real 061 passenger presence: `PICKUP_COMPLETE` happened before the terminal state. */
  readonly passengerAboard: boolean;
  readonly referenceTripDurationSeconds: number;
  readonly actualTripDurationSeconds: number | null;
  /** Real 139 read model scoped to this ride; `null` when no passenger telemetry exists. */
  readonly comfort: ComfortMetricsSnapshot | null;
  /** Real 137 blocked seconds with the passenger aboard. */
  readonly blockedSeconds?: number;
  /** Seed of the simulated customer preference; defaults to the ride id. */
  readonly preferenceSeed?: string;
  readonly profileVersions?: readonly string[];
}

export type ReviewEvaluation =
  | { readonly status: 'EVALUATED'; readonly review: RideReview }
  | { readonly status: 'NOT_ELIGIBLE'; readonly reason: ReviewEligibilityReason };

const factFields = [
  'rideId',
  'customerId',
  'terminalState',
  'terminalTick',
  'passengerAboard',
  'referenceTripDurationSeconds',
  'actualTripDurationSeconds',
  'comfort',
] as const;
const optionalFactFields = ['blockedSeconds', 'preferenceSeed', 'profileVersions'] as const;

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function readIdentity(value: unknown, label: string): string {
  requireContract(
    typeof value === 'string' && value.length > 0 && value.length <= REVIEW_LIMITS.idCodeUnits,
    `Invalid ${label} identity`,
  );
  requireContract(value.trim() === value, `Invalid ${label} identity whitespace`);
  return value;
}

function readComfortScope(value: unknown): ComfortMetricsSnapshot | null {
  if (value === null) return null;
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Review comfort snapshot must be an object',
  );
  const snapshot = value as ComfortMetricsSnapshot;
  requireContract(
    typeof snapshot.overall === 'object' && snapshot.overall !== null,
    'Review comfort snapshot requires aggregates',
  );
  requireContract(
    Array.isArray(snapshot.rides) && Array.isArray(snapshot.byMode),
    'Review comfort snapshot must be the 139 read model',
  );
  requireContract(
    snapshot.rides.length <= 1,
    'Review comfort snapshot must cover at most the reviewed ride',
  );
  return snapshot;
}

function readProfileVersions(value: unknown): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  requireContract(Array.isArray(value), 'Review profile versions must be an array');
  const entries: string[] = [];
  for (const entry of value) entries.push(readIdentity(entry, 'profile version'));
  requireContract(new Set(entries).size === entries.length, 'Duplicate review profile version');
  return Object.freeze(entries.slice().sort());
}

function readFacts(value: unknown): ReviewFacts {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Review facts must be an object',
  );
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  requireContract(
    keys.length >= factFields.length &&
      keys.length <= factFields.length + optionalFactFields.length,
    'Missing or unknown review fact field',
  );
  for (const key of factFields)
    requireContract(Object.hasOwn(data, key), `Missing review fact: ${key}`);
  for (const key of keys)
    requireContract(
      (factFields as readonly string[]).includes(key) ||
        (optionalFactFields as readonly string[]).includes(key),
      `Unknown review fact: ${key}`,
    );
  const rideId = readIdentity(data.rideId, 'review ride'),
    terminalState = choice(data.terminalState, tariffOutcomeStates),
    terminalTick = tick(data.terminalTick);
  requireContract(
    typeof data.passengerAboard === 'boolean',
    'Review requires the real passenger presence',
  );
  const referenceTripDurationSeconds = nonNegative(
    data.referenceTripDurationSeconds,
    REVIEW_LIMITS.maximumTripSeconds,
    'Reference trip duration',
  );
  const actualTripDurationSeconds =
    data.actualTripDurationSeconds === null
      ? null
      : nonNegative(
          data.actualTripDurationSeconds,
          REVIEW_LIMITS.maximumTripSeconds,
          'Actual trip duration',
        );
  requireContract(
    terminalState !== 'COMPLETED' || actualTripDurationSeconds !== null,
    'A completed ride requires the measured trip duration',
  );
  const blockedSeconds =
    data.blockedSeconds === undefined
      ? 0
      : nonNegative(data.blockedSeconds, REVIEW_LIMITS.maximumTripSeconds, 'Blocked seconds');
  const preferenceSeed =
    data.preferenceSeed === undefined
      ? rideId
      : readIdentity(data.preferenceSeed, 'review preference seed');
  return Object.freeze({
    rideId,
    customerId: readIdentity(data.customerId, 'review customer'),
    terminalState,
    terminalTick,
    passengerAboard: data.passengerAboard,
    referenceTripDurationSeconds,
    actualTripDurationSeconds,
    comfort: readComfortScope(data.comfort),
    blockedSeconds,
    preferenceSeed,
    profileVersions: readProfileVersions(data.profileVersions),
  });
}

function readFactsChecked(value: unknown): ReviewFacts {
  try {
    return readFacts(value);
  } catch (error: unknown) {
    if (error instanceof ContractValidationError) reject('INVALID_SHAPE');
    throw error;
  }
}

function reasonOf(comfort: ComfortReviewModel | null): readonly ReviewReasonCode[] {
  if (comfort === null || comfort.comfortIntervals === 0) return Object.freeze([]);
  const reasons: ReviewReasonCode[] = [];
  if (comfort.accelerationPenalty >= 0.5) reasons.push('HARD_BRAKING');
  if (comfort.jerkPenalty >= 0.5) reasons.push('ABRUPT_ACCELERATION');
  if (comfort.lateralPenalty >= 0.5) reasons.push('SHARP_TURNS');
  return Object.freeze(reasons);
}

function orderReasons(reasons: readonly ReviewReasonCode[]): readonly ReviewReasonCode[] {
  const unique = [...new Set(reasons)];
  unique.sort((left, right) => reviewReasonCodes.indexOf(left) - reviewReasonCodes.indexOf(right));
  return Object.freeze(unique);
}

/** Deterministic, versioned customer preference; the same ride always gets the same adjustment. */
export function reviewPreferenceAdjustment(
  seed: string,
  coefficients: ReviewCoefficients = REVIEW_COEFFICIENTS,
): number {
  const unit = randomUnit(0x2090_2090, `${coefficients.preferenceSalt}:${seed}`, 0);
  return round((unit * 2 - 1) * coefficients.preferenceRange);
}

/**
 * The single review evaluation. It never reads a clock, a renderer or a store: every input is a fact
 * of the ride, and an absent fact is never replaced by an invented one.
 */
export function evaluateReview(
  facts: ReviewFacts,
  coefficients: ReviewCoefficients = REVIEW_COEFFICIENTS,
  modelVersion: string = REVIEW_MODEL_VERSION,
  namespace = 'city:economy',
): ReviewEvaluation {
  if (!facts.passengerAboard)
    return Object.freeze({ status: 'NOT_ELIGIBLE' as const, reason: 'NO_PASSENGER_EXPERIENCE' });
  const comfort = facts.comfort === null ? null : comfortReviewModel(facts.comfort);
  if (facts.terminalState === 'COMPLETED' && (comfort === null || comfort.comfortIntervals === 0))
    return Object.freeze({ status: 'NOT_ELIGIBLE' as const, reason: 'NO_COMFORT_EXPOSURE' });

  const delaySeconds =
    facts.actualTripDurationSeconds === null
      ? null
      : Math.max(0, facts.actualTripDurationSeconds - facts.referenceTripDurationSeconds);
  const delayPenalty =
    delaySeconds === null || delaySeconds <= coefficients.delayGraceSeconds
      ? 0
      : Math.min(
          coefficients.maximumDelayPenalty,
          ((delaySeconds - coefficients.delayGraceSeconds) / 60) *
            coefficients.delayPenaltyPointsPerMinute,
        );
  const comfortPenalty =
    comfort === null || comfort.comfortPenalty === null
      ? 0
      : Math.min(REVIEW_MAX_RATING, comfort.comfortPenalty);
  const impacts = comfort === null ? 0 : comfort.impacts.impacts;
  const peakImpulseNs = comfort === null ? 0 : comfort.impacts.peakImpulseNs;
  const blockedSeconds = facts.blockedSeconds ?? 0;
  const incidentPenalty =
    comfort === null
      ? 0
      : Math.min(
          coefficients.maximumIncidentPenalty,
          impacts * coefficients.incidentPenaltyPointsPerImpact +
            (peakImpulseNs > coefficients.severeImpulseNs
              ? coefficients.severeImpulseExtraPenalty
              : 0) +
            (blockedSeconds > coefficients.blockedPenaltyThresholdSeconds
              ? coefficients.blockedPenaltyPoints
              : 0),
        );
  const failurePenalty =
    facts.terminalState === 'FAILED'
      ? coefficients.failurePenalty
      : facts.terminalState === 'CANCELLED'
        ? coefficients.cancellationPenalty
        : 0;
  const preferenceAdjustment = reviewPreferenceAdjustment(
    `${facts.rideId}:${facts.customerId}`,
    coefficients,
  );
  const rating = Math.max(
    0,
    Math.min(
      REVIEW_MAX_RATING,
      Math.round(
        coefficients.ratingBase -
          delayPenalty -
          comfortPenalty -
          incidentPenalty -
          failurePenalty +
          preferenceAdjustment,
      ),
    ),
  );
  const reasons: ReviewReasonCode[] = [];
  if (facts.terminalState === 'FAILED') reasons.push('RIDE_FAILED');
  else if (facts.terminalState === 'CANCELLED') reasons.push('RIDE_CANCELLED');
  else if (delaySeconds !== null && delaySeconds > coefficients.severeDelaySeconds)
    reasons.push('SEVERE_DELAY');
  else if (delaySeconds !== null && delaySeconds > coefficients.delayGraceSeconds)
    reasons.push('LATE_ARRIVAL');
  else reasons.push('ON_TIME');
  reasons.push(...reasonOf(comfort));
  if (impacts > 0) reasons.push('COLLISION');
  if (blockedSeconds > coefficients.blockedPenaltyThresholdSeconds) reasons.push('BLOCKED_ROUTE');
  if (comfort !== null && comfort.comfortIntervals > 0 && comfort.comfortPenalty === 0)
    reasons.push('SMOOTH_DRIVE');
  if (
    facts.terminalState === 'COMPLETED' &&
    (delaySeconds === null || delaySeconds <= coefficients.delayGraceSeconds) &&
    comfortPenalty === 0 &&
    impacts === 0 &&
    blockedSeconds <= coefficients.blockedPenaltyThresholdSeconds
  )
    reasons.push('EFFICIENT_DELIVERY');

  const review: RideReview = Object.freeze({
    reviewId: createStableId('ride-review', namespace, [facts.rideId, modelVersion]),
    rideId: facts.rideId,
    customerId: facts.customerId,
    rating,
    reasonCodes: orderReasons(reasons),
    tick: facts.terminalTick,
    reviewModelVersion: modelVersion,
    exposureSeconds: facts.comfort === null ? 0 : facts.comfort.overall.passengerSeconds,
    controlIntervals: comfort === null ? 0 : comfort.comfortIntervals,
    profileVersions: facts.profileVersions ?? Object.freeze([]),
    preferenceAdjustment,
    penalties: Object.freeze({
      delay: round(delayPenalty),
      comfort: round(comfortPenalty),
      incident: round(incidentPenalty),
      failure: round(failurePenalty),
    }),
    evidence: Object.freeze({
      terminalState: facts.terminalState,
      passengerAboard: facts.passengerAboard,
      delaySeconds: delaySeconds === null ? null : round(delaySeconds),
      referenceTripDurationSeconds: facts.referenceTripDurationSeconds,
      actualTripDurationSeconds: facts.actualTripDurationSeconds,
      comfortModelVersion: comfort === null ? null : comfort.version,
      comfortPenalty: comfort === null ? null : comfort.comfortPenalty,
      impacts,
      peakImpulseNs,
      blockedSeconds: round(blockedSeconds),
    }),
    supersedesReviewId: null,
    revision: 0,
  });
  return Object.freeze({ status: 'EVALUATED' as const, review });
}

export interface ReviewSnapshot {
  readonly version: string;
  readonly tick: number;
  /** Retained reviews, sorted by ride id. */
  readonly reviews: readonly RideReview[];
  readonly reviewCount: number;
  readonly ratingSum: number;
  /** `ratingSum / reviewCount`; `null` without a review, never an invented average. */
  readonly averageRating: number | null;
  /** Counts for the six integer ratings 0–5. */
  readonly ratingHistogram: readonly number[];
  readonly reissuedReviews: number;
  /** Structural proof that a read never rescanned the ledger. */
  readonly historyScans: 0;
}

export interface ReviewLedgerStats {
  readonly version: string;
  readonly events: number;
  readonly accepted: number;
  readonly existing: number;
  readonly duplicates: number;
  readonly notEligible: number;
  readonly rejected: number;
  readonly reissued: number;
  readonly retainedReviews: number;
  readonly droppedReviews: number;
  readonly retainedKeys: number;
  readonly historyScans: 0;
  readonly lastRejection: ReviewRejectionReason | null;
  readonly disposed: boolean;
}

export interface ReviewPage {
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
  readonly reviews: readonly RideReview[];
}

export interface ReviewLedger {
  readonly version: string;
  readonly modelVersion: string;
  ingest(input: unknown): ReviewIngestOutcome;
  reissue(input: unknown): ReviewIngestOutcome;
  review(rideId: string): RideReview | undefined;
  page(offset: unknown, limit: unknown): ReviewPage;
  snapshot(atTick: unknown): ReviewSnapshot;
  getStats(): ReviewLedgerStats;
  reset(options?: unknown): void;
  dispose(): void;
}

export interface ReviewIngestOutcome {
  readonly status: ReviewIngestStatus;
  readonly reason: ReviewEligibilityReason | ReviewRejectionReason | null;
  readonly review: RideReview | null;
  readonly supersedesReviewId: string | null;
}

export interface ReviewLedgerOptions {
  readonly namespace?: string;
  readonly modelVersion?: string;
  readonly coefficients?: ReviewCoefficients;
  readonly retainedReviews?: number;
}

class ReviewRejection extends Error {
  readonly reason: ReviewRejectionReason;
  constructor(reason: ReviewRejectionReason) {
    super(`Review rejected: ${reason}`);
    this.name = 'ReviewRejection';
    this.reason = reason;
  }
}

function reject(reason: ReviewRejectionReason): never {
  throw new ReviewRejection(reason);
}

function parseInput(
  value: unknown,
  extra: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  requireContract(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Review input must be an object',
  );
  const data = value as Record<string, unknown>,
    allowed = ['eventId', 'facts', ...extra, ...optional];
  for (const key of Object.keys(data)) if (!allowed.includes(key)) reject('UNKNOWN_FIELD');
  for (const key of ['eventId', 'facts', ...extra])
    if (!Object.hasOwn(data, key)) reject('INVALID_SHAPE');
  requireContract(
    typeof data.facts === 'object' && data.facts !== null,
    'Review facts are required',
  );
  return data;
}

/** One review per ride: the entry is only ever replaced by an explicit, versioned reissue. */
export function createReviewLedger(options: ReviewLedgerOptions = {}): ReviewLedger {
  const namespace = options.namespace === undefined ? 'city:economy' : text(options.namespace),
    modelVersion =
      options.modelVersion === undefined
        ? REVIEW_MODEL_VERSION
        : boundedVersion(options.modelVersion, 'review model'),
    coefficients = options.coefficients ?? REVIEW_COEFFICIENTS,
    retainedReviews = options.retainedReviews ?? REVIEW_LIMITS.retainedReviews;
  requireContract(
    Number.isSafeInteger(retainedReviews) &&
      retainedReviews >= 1 &&
      retainedReviews <= REVIEW_LIMITS.retainedReviews,
    'Review retention capacity is invalid',
  );
  const reviews = new Map<string, RideReview>(),
    keys = new Map<string, string>();
  let events = 0,
    accepted = 0,
    existing = 0,
    duplicates = 0,
    notEligible = 0,
    rejected = 0,
    reissuedTotal = 0,
    droppedReviews = 0,
    lastRejection: ReviewRejectionReason | null = null,
    disposed = false;

  function assertLive(): void {
    if (disposed) throw new Error('Review ledger disposed');
  }

  function outcome(
    status: ReviewIngestStatus,
    reason: ReviewEligibilityReason | ReviewRejectionReason | null,
    review: RideReview | null,
    supersedesReviewId: string | null = null,
  ): ReviewIngestOutcome {
    return Object.freeze({ status, reason, review, supersedesReviewId });
  }

  function remember(key: string, rideId: string): void {
    keys.set(key, rideId);
    while (keys.size > REVIEW_LIMITS.retainedKeys) {
      const oldest = keys.keys().next().value;
      if (oldest === undefined) break;
      keys.delete(oldest);
    }
  }

  function store(next: RideReview): void {
    reviews.set(next.rideId, next);
    while (reviews.size > retainedReviews) {
      const oldest = reviews.keys().next().value;
      if (oldest === undefined) break;
      reviews.delete(oldest);
      droppedReviews += 1;
    }
  }

  function evaluate(
    facts: ReviewFacts,
    version: string = modelVersion,
  ): RideReview | ReviewEligibilityReason {
    if (facts.comfort !== null) {
      const scoped = facts.comfort.rides[0];
      if (scoped === undefined) {
        if (facts.comfort.overall.intervals > 0) return 'COMFORT_SCOPE_MISMATCH';
      } else if (
        scoped.rideId !== facts.rideId ||
        facts.comfort.overall.intervals !== scoped.intervals
      )
        return 'COMFORT_SCOPE_MISMATCH';
    }
    const evaluation = evaluateReview(facts, coefficients, version, namespace);
    return evaluation.status === 'EVALUATED' ? evaluation.review : evaluation.reason;
  }

  function ingest(input: unknown): ReviewIngestOutcome {
    assertLive();
    events += 1;
    try {
      const data = parseInput(input, []);
      const eventId = readIdentity(data.eventId, 'review event');
      const knownRide = keys.get(eventId);
      if (knownRide !== undefined) {
        duplicates += 1;
        return outcome('DUPLICATE', null, reviews.get(knownRide) ?? null);
      }
      const facts = readFactsChecked(data.facts);
      const prior = reviews.get(facts.rideId);
      if (prior !== undefined) {
        // The ride already has a review: another event id never rewrites it, whatever the model.
        existing += 1;
        remember(eventId, facts.rideId);
        return outcome('EXISTING', null, prior);
      }
      const evaluation = evaluate(facts);
      if (typeof evaluation === 'string') {
        notEligible += 1;
        remember(eventId, facts.rideId);
        return outcome('NOT_ELIGIBLE', evaluation, null);
      }
      store(evaluation);
      remember(eventId, facts.rideId);
      accepted += 1;
      return outcome('ACCEPTED', null, evaluation);
    } catch (error: unknown) {
      if (error instanceof ReviewRejection) {
        rejected += 1;
        lastRejection = error.reason;
        return outcome('REJECTED', error.reason, null);
      }
      throw error;
    }
  }

  function reissue(input: unknown): ReviewIngestOutcome {
    assertLive();
    events += 1;
    try {
      const data = parseInput(input, [], ['acknowledgeModelChange', 'reviewModelVersion']);
      if (data.acknowledgeModelChange !== true) reject('MODEL_CHANGE_NOT_ACKNOWLEDGED');
      const eventId = readIdentity(data.eventId, 'review event'),
        targetVersion =
          data.reviewModelVersion === undefined
            ? modelVersion
            : boundedVersion(data.reviewModelVersion, 'review model'),
        facts = readFactsChecked(data.facts);
      const prior = reviews.get(facts.rideId);
      if (prior === undefined) reject('UNKNOWN_RIDE');
      if (keys.has(eventId)) {
        duplicates += 1;
        return outcome('DUPLICATE', null, prior);
      }
      const evaluation = evaluate(facts, targetVersion);
      if (typeof evaluation === 'string') {
        notEligible += 1;
        return outcome('NOT_ELIGIBLE', evaluation, prior);
      }
      if (evaluation.reviewId === prior.reviewId) {
        existing += 1;
        remember(eventId, facts.rideId);
        return outcome('EXISTING', null, prior);
      }
      const replaced = Object.freeze({
        ...evaluation,
        supersedesReviewId: prior.reviewId,
        revision: prior.revision + 1,
      });
      store(replaced);
      remember(eventId, facts.rideId);
      reissuedTotal += 1;
      return outcome('REISSUED', null, replaced, prior.reviewId);
    } catch (error: unknown) {
      if (error instanceof ReviewRejection) {
        rejected += 1;
        lastRejection = error.reason;
        return outcome('REJECTED', error.reason, null);
      }
      throw error;
    }
  }

  function snapshot(atTick: unknown): ReviewSnapshot {
    assertLive();
    const at = tick(atTick);
    const retained = [...reviews.values()].sort((left, right) =>
      left.rideId < right.rideId ? -1 : left.rideId > right.rideId ? 1 : 0,
    );
    const histogram = [0, 0, 0, 0, 0, 0];
    let ratingSum = 0,
      reissuedCount = 0;
    for (const review of retained) {
      ratingSum += review.rating;
      histogram[review.rating] = (histogram[review.rating] ?? 0) + 1;
      if (review.supersedesReviewId !== null) reissuedCount += 1;
    }
    return Object.freeze({
      version: modelVersion,
      tick: at,
      reviews: Object.freeze(retained),
      reviewCount: retained.length,
      ratingSum,
      averageRating: retained.length === 0 ? null : round(ratingSum / retained.length),
      ratingHistogram: Object.freeze(histogram),
      reissuedReviews: reissuedCount,
      historyScans: 0 as const,
    });
  }

  return Object.freeze({
    version: REVIEW_MODEL_VERSION,
    modelVersion,
    ingest,
    reissue,
    review(rideId: string): RideReview | undefined {
      return disposed ? undefined : reviews.get(rideId);
    },
    page(offset: unknown, limit: unknown): ReviewPage {
      assertLive();
      const start = tick(offset),
        size = tick(limit);
      requireContract(
        size >= 1 && size <= REVIEW_LIMITS.maximumPageSize,
        'Review page size is invalid',
      );
      const all = [...reviews.values()].sort((left, right) =>
        left.rideId < right.rideId ? -1 : left.rideId > right.rideId ? 1 : 0,
      );
      return Object.freeze({
        offset: start,
        limit: size,
        total: all.length,
        reviews: Object.freeze(all.slice(start, start + size)),
      });
    },
    snapshot,
    getStats(): ReviewLedgerStats {
      return Object.freeze({
        version: REVIEW_MODEL_VERSION,
        events: disposed ? 0 : events,
        accepted: disposed ? 0 : accepted,
        existing: disposed ? 0 : existing,
        duplicates: disposed ? 0 : duplicates,
        notEligible: disposed ? 0 : notEligible,
        rejected: disposed ? 0 : rejected,
        reissued: disposed ? 0 : reissuedTotal,
        retainedReviews: disposed ? 0 : reviews.size,
        droppedReviews: disposed ? 0 : droppedReviews,
        retainedKeys: disposed ? 0 : keys.size,
        historyScans: 0 as const,
        lastRejection: disposed ? null : lastRejection,
        disposed,
      });
    },
    reset(): void {
      assertLive();
      reviews.clear();
      keys.clear();
      events = 0;
      accepted = 0;
      existing = 0;
      duplicates = 0;
      notEligible = 0;
      rejected = 0;
      reissuedTotal = 0;
      droppedReviews = 0;
      lastRejection = null;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      reviews.clear();
      keys.clear();
      events = 0;
      accepted = 0;
      existing = 0;
      duplicates = 0;
      notEligible = 0;
      rejected = 0;
      reissuedTotal = 0;
      droppedReviews = 0;
      lastRejection = null;
    },
  });
}
