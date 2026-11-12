import {
  choice,
  createStableId,
  list,
  number,
  randomUint32,
  record,
  requireContract,
  tick,
} from '../sessions';
import { boundedId, compareText, plainFields, requireRequired } from './contracts';
import {
  CHALLENGE_SCHEMA_VERSION,
  CHALLENGE_TICK_HZ,
  challengeEvaluatorIds,
  challengeFamilies,
  challengeObjectiveKinds,
  challengeSessionKinds,
  challengeVerdictReasons,
  challengeVerdictStatuses,
  createChallengeCapabilities,
  createChallengeTemplateCatalog,
  eligibleChallengeTemplates,
  evaluateChallenge,
  parseChallengeObjectiveSnapshot,
  parseChallengeTemplateCatalog,
  planChallengeAttempt,
} from './challenges';
import type {
  ChallengeAttemptPlan,
  ChallengeCapabilities,
  ChallengeObjectiveSnapshot,
  ChallengeSessionKind,
  ChallengeTemplate,
  ChallengeTemplateCatalog,
  ChallengeVerdict,
} from './challenges';

/**
 * 232 challenge director: when a challenge is offered, what taking it costs, and how its lifecycle
 * survives a pause, a reload, an R restart and a session change.
 *
 * The director owns no clock, renderer, DOM, fleet dispatcher or XP ledger. It is a pure state
 * machine over:
 *
 * - the delivered 231 catalog and its pure evaluators;
 * - an explicit world snapshot the caller hands in (session identity, the player's taxi, the real
 *   060 dispatch assignment, the passenger, the pickup zone and the reachable zones);
 * - a bounded route port that answers the real 041-style question "how long from here to there".
 *
 * Five structural rules:
 *
 * 1. **One offer, one instance.** At most one visible offer and at most one live instance exist. A
 *    second request inside the same window is refused by name (`OFFER_ALREADY_ACTIVE`,
 *    `INSTANCE_ALREADY_ACTIVE`); nothing is overwritten silently.
 * 2. **An offer never touches a ride.** Offering is read-only with respect to the real dispatch
 *    assignment and the passenger: the result echoes exactly what it saw and reports
 *    `rideCancelled: false`, `assignmentChanged: false`, `passengerMoved: false`. Accepting needs a
 *    free taxi; a taxi that is already dispatched or already carries a passenger refuses by name
 *    (`TAXI_ASSIGNED`, `PASSENGER_ABOARD`) and the passenger stays where they are.
 * 3. **Saved seed.** Every offer carries its own uint32 seed and every instance persists the seed,
 *    the attempt, the objective snapshot, the deadline, the session identity and the world epoch.
 *    Target, margin, incident budget and concrete zones all come from that seed through the 231
 *    planner, so a reload cannot produce a different challenge.
 * 4. **Bounded memory.** The cooldown is a simulated-tick deadline; the anti-repetition history is a
 *    FIFO bounded by entries *and* code units; terminal instances are retained up to a fixed cap and
 *    a fixed code-unit budget. Nothing scales with play time or with the number of offers.
 * 5. **Simulated time only.** The objective clock is the authoritative 60 Hz tick handed in by the
 *    caller. `advance({ ticks, paused: true })` freezes it, so a pause does not burn a deadline.
 *    There is no wall clock and no `Math.random` anywhere in the module.
 *
 * Reward credit is deliberately absent: a terminal outcome records the authored policy and
 * `claimed: false`. 233 connects the real ledger, the records and the panel.
 */

export const CHALLENGE_DIRECTOR_VERSION = '232-challenge-director-v1' as const;
export const CHALLENGE_DIRECTOR_STATE_VERSION = '232-challenge-director-state-v1' as const;
export const CHALLENGE_DIRECTOR_NAMESPACE = '232-challenge-director-v1' as const;

/**
 * Fixed budgets. A longer play session cannot grow the history, the retained outcomes or the number
 * of live instances. The manifest field `challengeHistoryEntries` is `null`
 * (Docs/performance-budgets.json), so this PBI establishes the finite admission cap and reports the
 * gap instead of pretending the budget was already calibrated.
 */
export const CHALLENGE_DIRECTOR_LIMITS = Object.freeze({
  version: CHALLENGE_DIRECTOR_VERSION,
  /** Authoritative challenge tick rate; the deadline is expressed in these ticks. */
  tickHz: CHALLENGE_TICK_HZ,
  /** Visible offers at one time. */
  activeOffers: 1,
  /** Live (accepted or active) instances at one time. */
  activeInstances: 1,
  /** Cooldown after any terminal result, in active ticks: three minutes at 60 Hz. */
  cooldownTicks: 10_800,
  /** An unanswered offer expires after 45 active seconds. */
  offerWindowTicks: 2_700,
  /** The most recent templates are avoided while an eligible alternative exists. */
  recentTemplates: 3,
  /** Bounded anti-repetition history entries (FIFO). */
  historyEntries: 24,
  /** Bounded UTF-16 code units retained by the history identities. */
  historyCodeUnits: 4_096,
  /** Bounded retained terminal instances for counters and evidence. */
  retainedOutcomes: 32,
  /** Bounded code units retained by terminal instance identities. */
  outcomeCodeUnits: 16_384,
  /** Deterministic route probes per offer: a single walk, never a rerandomisation loop. */
  routeProbesPerOffer: 8,
  /** Offers/restarts per template inside one session. */
  attemptsPerTemplate: 8,
  /** Spare seconds the authored deadline must keep over the real route estimate. */
  feasibilitySlackSeconds: 5,
  /** Lifecycle transitions retained per instance; the closed graph needs at most three. */
  transitionsPerInstance: 4,
  /** Code units per session, taxi, zone and instance identity. */
  idCodeUnits: 256,
});

/** The closed lifecycle vocabulary. */
export const challengeInstanceStates = [
  'OFFERED',
  'ACCEPTED',
  'ACTIVE',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'DECLINED',
  'EXPIRED',
] as const;
export type ChallengeInstanceState = (typeof challengeInstanceStates)[number];

export const CHALLENGE_TERMINAL_STATES = [
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'DECLINED',
  'EXPIRED',
] as const;
export type ChallengeTerminalState = (typeof CHALLENGE_TERMINAL_STATES)[number];

/**
 * The whole transition graph. Every other transition is refused with `INVALID_STATE`, so a terminal
 * instance can never revive and an offer can never jump straight to `ACTIVE`.
 */
export const CHALLENGE_DIRECTOR_TRANSITIONS: Readonly<
  Record<ChallengeInstanceState, readonly ChallengeInstanceState[]>
> = Object.freeze({
  OFFERED: Object.freeze(['ACCEPTED', 'DECLINED', 'EXPIRED'] as const),
  ACCEPTED: Object.freeze(['ACTIVE', 'CANCELLED'] as const),
  ACTIVE: Object.freeze(['COMPLETED', 'FAILED', 'CANCELLED'] as const),
  COMPLETED: Object.freeze([] as const),
  FAILED: Object.freeze([] as const),
  CANCELLED: Object.freeze([] as const),
  DECLINED: Object.freeze([] as const),
  EXPIRED: Object.freeze([] as const),
});

export function challengeDirectorTransitionAllowed(
  from: ChallengeInstanceState,
  to: ChallengeInstanceState,
): boolean {
  return (CHALLENGE_DIRECTOR_TRANSITIONS[from] as readonly string[]).includes(to);
}

/** Closed refusal vocabulary. There is no open error channel. */
export const challengeDirectorRefusals = [
  'OFFERS_DISABLED',
  'OFFER_ALREADY_ACTIVE',
  'INSTANCE_ALREADY_ACTIVE',
  'COOLDOWN_ACTIVE',
  'NO_ELIGIBLE_TEMPLATE',
  'NO_FREE_TAXI',
  'TAXI_ASSIGNED',
  'PASSENGER_ABOARD',
  'SESSION_INVALID',
  'SESSION_TRANSFER_IN_PROGRESS',
  'ROUTE_UNREACHABLE',
  'DEADLINE_INFEASIBLE',
  'UNKNOWN_INSTANCE',
  'INVALID_STATE',
  'ATTEMPT_LIMIT',
  'BOUND_TO_TAXI',
  'INVALID_REQUEST',
  'SNAPSHOT_INVALID',
] as const;
export type ChallengeDirectorRefusal = (typeof challengeDirectorRefusals)[number];

/** Closed cancellation vocabulary; every entry is explicit and none of them costs XP. */
export const challengeCancellationReasons = [
  'PLAYER_CANCELLED',
  'CITY_RESET',
  'SESSION_LEFT',
  'RESTART',
  'RIDE_CANCELLED',
  'OFFERS_DISABLED',
] as const;
export type ChallengeCancellationReason = (typeof challengeCancellationReasons)[number];

/** Real 060 taxi statuses the preflight understands. */
export const challengeTaxiStatuses = [
  'AVAILABLE',
  'ASSIGNED',
  'BLOCKED',
  'DAMAGED',
  'OFFLINE',
] as const;
export type ChallengeTaxiStatus = (typeof challengeTaxiStatuses)[number];

/** Director-level failure reasons that are not 231 gameplay verdicts. */
export const CHALLENGE_DIRECTOR_DEADLINE_REASON = 'DEADLINE_EXPIRED' as const;
export const CHALLENGE_DIRECTOR_OFFER_EXPIRED_REASON = 'OFFER_EXPIRED' as const;

/* ---------------------------------------------------------------------------------------------
 * Inputs
 * ------------------------------------------------------------------------------------------- */

export interface ChallengeAssignmentEcho {
  readonly assignmentId: string;
  readonly requestId: string;
  readonly taxiId: string;
  readonly customerId: string;
}

export interface ChallengeTaxiState {
  readonly taxiId: string;
  readonly status: ChallengeTaxiStatus;
  /** Free taxis in the fleet, not counting the player's taxi when it is busy. */
  readonly freeTaxis: number;
}

/** Everything the preflight reads. It is a snapshot: the director never mutates it. */
export interface ChallengeWorldSnapshot {
  readonly sessionKind: ChallengeSessionKind;
  readonly sessionId: string;
  readonly worldEpoch: number;
  /** Authoritative simulated tick; offering may only move it forward. */
  readonly simulatedTick: number;
  readonly transferInProgress: boolean;
  readonly taxi: ChallengeTaxiState;
  /** The real dispatch claim of the player's taxi, or `null` when it is not dispatched. */
  readonly assignment: ChallengeAssignmentEcho | null;
  readonly passengerAboard: boolean;
  /** Real map zone where the challenge passenger boards. */
  readonly pickupZoneId: string;
  /** Real map zone used by objectives that declare no zone of their own. */
  readonly fallbackDropoffZoneId: string;
  /** Concrete zone ids a real route can reach from the pickup. */
  readonly reachableZoneIds: readonly string[];
  /** The real 231 capability snapshot validated by `createChallengeCapabilities`. */
  readonly capabilities: unknown;
}

export interface ChallengeRouteEstimate {
  readonly reachable: boolean;
  /** Real route duration in seconds; ignored when `reachable` is false. */
  readonly seconds: number;
  readonly graphVersion: string;
}

/**
 * The only world query the director performs. The composition layer backs it with the real 041
 * planner; a test or the report backs it with a deterministic double. The director probes at most
 * `routeProbesPerOffer` candidates per offer.
 */
export interface ChallengeRoutePort {
  estimate(input: {
    readonly taxiId: string;
    readonly templateId: string;
    readonly pickupZoneId: string;
    readonly dropoffZoneId: string;
  }): ChallengeRouteEstimate;
}

/* ---------------------------------------------------------------------------------------------
 * Records
 * ------------------------------------------------------------------------------------------- */

export interface ChallengeStateTransition {
  readonly from: ChallengeInstanceState;
  readonly to: ChallengeInstanceState;
  readonly tick: number;
  readonly reason: string;
}

export interface ChallengeRewardOutcome {
  /** `true` only for an Academy completion; 233 credits it through the real ledger. */
  readonly xpEligible: boolean;
  /** Authored 231 XP for the first family completion of the day, never paid by 232. */
  readonly academyXp: number;
  readonly claimed: false;
  /** Stable identity 233 keys the ledger row on; `null` when nothing is earned. */
  readonly rewardKey: string | null;
}

export interface ChallengeOutcome {
  readonly status: ChallengeTerminalState;
  readonly reason: string;
  readonly tick: number;
  /** The real 231 verdict for a gameplay completion or failure; `null` otherwise. */
  readonly verdict: ChallengeVerdict | null;
  readonly reward: ChallengeRewardOutcome;
  readonly penalty: 'NONE';
  readonly xpDelta: 0;
  readonly reputationDelta: 0;
}

/** One visible offer and one live instance share this record. */
export interface ChallengeDirectorInstance {
  readonly instanceId: string;
  readonly templateId: string;
  readonly templateVersion: string;
  readonly family: string;
  readonly title: string;
  readonly label: string;
  readonly state: ChallengeInstanceState;
  readonly seed: number;
  readonly attempt: number;
  readonly sessionKind: ChallengeSessionKind;
  readonly sessionId: string;
  readonly worldEpoch: number;
  /** Absolute simulated tick of the offer. */
  readonly offeredAtTick: number;
  readonly offerExpiresAtTick: number;
  readonly acceptedAtTick: number | null;
  readonly activatedAtTick: number | null;
  readonly endedAtTick: number | null;
  /** The player's taxi bound at acceptance; `null` while the offer is only displayed. */
  readonly taxiId: string | null;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  /** Common 059/060 request identity of the reserved challenge ride. */
  readonly rideRequestId: string;
  readonly academyXp: number;
  /** Authored duration derived from the 231 reference duration and the seed margin. */
  readonly durationTicks: number;
  /**
   * Objective snapshot. Its `deadlineTick` is anchored to the activation tick; while the instance is
   * only offered it shows the latest deadline an immediate acceptance would produce.
   */
  readonly objective: ChallengeObjectiveSnapshot;
  readonly route: Readonly<{ readonly seconds: number; readonly graphVersion: string }>;
  readonly outcome: ChallengeOutcome | null;
  readonly transitions: readonly ChallengeStateTransition[];
}

export interface ChallengeHistoryEntry {
  readonly templateId: string;
  readonly family: string;
  readonly result: ChallengeTerminalState;
  readonly seed: number;
  readonly tick: number;
}

export interface ChallengeReservation {
  readonly version: typeof CHALLENGE_DIRECTOR_VERSION;
  readonly instanceId: string;
  readonly taxiId: string;
  readonly rideRequestId: string;
  readonly pickupZoneId: string;
  readonly dropoffZoneId: string;
  /** The real dispatcher must stop dispatching this taxi until the challenge ends. */
  readonly dispatchSuspended: true;
  readonly reservedAtTick: number;
}

/** Explicit proof that the offer left the real ride alone. */
export interface ChallengeInterruption {
  readonly ride: string | null;
  readonly passenger: string | null;
  readonly rideCancelled: false;
  readonly assignmentChanged: false;
  readonly passengerMoved: false;
}

export interface ChallengeOfferRefusal {
  readonly status: 'REFUSED';
  readonly code: ChallengeDirectorRefusal;
  readonly message: string;
  readonly detail: readonly string[];
}

export interface ChallengeOfferedResult {
  readonly status: 'OFFERED';
  readonly instance: ChallengeDirectorInstance;
  readonly interruption: ChallengeInterruption;
}

export type ChallengeOfferResult = ChallengeOfferedResult | ChallengeOfferRefusal;

export interface ChallengeAcceptedResult {
  readonly status: 'ACCEPTED';
  /** `true` when the same acceptance was applied again; nothing was reserved twice. */
  readonly duplicate: boolean;
  readonly instance: ChallengeDirectorInstance;
  readonly reservation: ChallengeReservation;
}

export type ChallengeAcceptResult = ChallengeAcceptedResult | ChallengeOfferRefusal;

export interface ChallengeDeclinedResult {
  readonly status: 'DECLINED';
  readonly duplicate: boolean;
  readonly instance: ChallengeDirectorInstance;
  readonly outcome: ChallengeOutcome;
  /** A refusal costs nothing: no XP, no reward, no reputation. */
  readonly xpDelta: 0;
  readonly reputationDelta: 0;
  readonly rewardGranted: false;
  readonly penalty: 'NONE';
  readonly cooldownUntilTick: number;
}

export type ChallengeDeclineResult = ChallengeDeclinedResult | ChallengeOfferRefusal;

export interface ChallengeActivatedResult {
  readonly status: 'ACTIVE';
  readonly duplicate: boolean;
  readonly instance: ChallengeDirectorInstance;
}

export type ChallengeActivateResult = ChallengeActivatedResult | ChallengeOfferRefusal;

export interface ChallengeEvaluateResult {
  readonly status: 'COMPLETED' | 'FAILED' | 'IN_PROGRESS' | 'DUPLICATE';
  readonly instance: ChallengeDirectorInstance;
  readonly verdict: ChallengeVerdict | null;
}

export type ChallengeEvaluateOutcome = ChallengeEvaluateResult | ChallengeOfferRefusal;

export interface ChallengeCancelledResult {
  readonly status: 'CANCELLED';
  readonly duplicate: boolean;
  readonly instance: ChallengeDirectorInstance;
  readonly outcome: ChallengeOutcome;
}

export type ChallengeCancelOutcome = ChallengeCancelledResult | ChallengeOfferRefusal;

export interface ChallengeChangeVehicleResult {
  readonly status: 'BOUND' | 'UNCHANGED';
  readonly instance: ChallengeDirectorInstance;
  readonly duplicateInstances: 0;
  readonly duplicateRewards: 0;
}

export type ChallengeChangeVehicleOutcome = ChallengeChangeVehicleResult | ChallengeOfferRefusal;

export interface ChallengeAdvanceResult {
  readonly simulatedTick: number;
  readonly paused: boolean;
  readonly expiredOffers: number;
  readonly expiredInstances: number;
  readonly activeOfferId: string | null;
  readonly activeInstanceId: string | null;
}

export interface ChallengeToggleResult {
  readonly enabled: boolean;
  readonly retractedOffers: number;
  readonly activeInstanceId: string | null;
}

export interface ChallengeDirectorSnapshot {
  readonly version: typeof CHALLENGE_DIRECTOR_STATE_VERSION;
  readonly enabled: boolean;
  readonly simulatedTick: number;
  readonly sessionKind: ChallengeSessionKind | null;
  readonly sessionId: string | null;
  readonly worldEpoch: number | null;
  readonly rngSeed: number;
  readonly offerCount: number;
  readonly refusedOffers: number;
  readonly cooldownUntilTick: number | null;
  readonly instances: readonly ChallengeDirectorInstance[];
  readonly history: readonly ChallengeHistoryEntry[];
  readonly attempts: readonly Readonly<{ templateId: string; attempts: number }>[];
  readonly totals: Readonly<Record<ChallengeInstanceState, number>>;
  readonly droppedHistory: number;
  readonly droppedOutcomes: number;
}

export interface ChallengeRestoreResult {
  readonly status: 'RESTORED';
  readonly simulatedTick: number;
  readonly instances: number;
  readonly history: number;
}

export type ChallengeRestoreOutcome = ChallengeRestoreResult | ChallengeOfferRefusal;

export interface ChallengeDirectorStats {
  readonly version: typeof CHALLENGE_DIRECTOR_VERSION;
  readonly enabled: boolean;
  readonly simulatedTick: number;
  readonly offers: number;
  readonly refusedOffers: number;
  readonly accepted: number;
  readonly activated: number;
  readonly completed: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly declined: number;
  readonly expiredOffers: number;
  readonly cooldownRemainingTicks: number;
  readonly activeOfferId: string | null;
  readonly activeInstanceId: string | null;
  readonly liveOffers: number;
  readonly liveInstances: number;
  readonly retained: number;
  readonly history: number;
  readonly historyCodeUnits: number;
  readonly droppedHistory: number;
  readonly droppedOutcomes: number;
  readonly byState: Readonly<Record<ChallengeInstanceState, number>>;
  readonly totals: Readonly<Record<ChallengeInstanceState, number>>;
}

export interface ChallengeDirector {
  readonly version: typeof CHALLENGE_DIRECTOR_VERSION;
  offer(value: unknown): ChallengeOfferResult;
  accept(value: unknown): ChallengeAcceptResult;
  decline(value: unknown): ChallengeDeclineResult;
  activate(value: unknown): ChallengeActivateResult;
  evaluate(value: unknown): ChallengeEvaluateOutcome;
  cancel(value: unknown): ChallengeCancelOutcome;
  expire(value: unknown): ChallengeAdvanceResult;
  advance(value: unknown): ChallengeAdvanceResult;
  restart(value: unknown): ChallengeActivateResult;
  changeVehicle(value: unknown): ChallengeChangeVehicleOutcome;
  setOffersEnabled(value: unknown): ChallengeToggleResult;
  reset(value: unknown): ChallengeAdvanceResult;
  instances(): readonly ChallengeDirectorInstance[];
  instance(instanceId: string): ChallengeDirectorInstance | undefined;
  history(): readonly ChallengeHistoryEntry[];
  snapshot(): ChallengeDirectorSnapshot;
  restore(value: unknown): ChallengeRestoreOutcome;
  stats(): ChallengeDirectorStats;
}

export interface ChallengeDirectorOptions {
  readonly catalog?: unknown;
  readonly routes: unknown;
  /** The saved director seed; the next offer seed is derived from it deterministically. */
  readonly seed: number;
  readonly enabled?: boolean;
}

/* ---------------------------------------------------------------------------------------------
 * Small readers
 * ------------------------------------------------------------------------------------------- */

function refusal(
  code: ChallengeDirectorRefusal,
  message: string,
  detail: readonly string[] = [],
): ChallengeOfferRefusal {
  return Object.freeze({
    status: 'REFUSED' as const,
    code,
    message,
    detail: Object.freeze([...detail]),
  });
}

function freezeTransition(transition: ChallengeStateTransition): ChallengeStateTransition {
  return Object.freeze({ ...transition });
}

function zeroStates(): Record<ChallengeInstanceState, number> {
  return {
    OFFERED: 0,
    ACCEPTED: 0,
    ACTIVE: 0,
    COMPLETED: 0,
    FAILED: 0,
    CANCELLED: 0,
    DECLINED: 0,
    EXPIRED: 0,
  };
}

function isTerminalState(state: ChallengeInstanceState): state is ChallengeTerminalState {
  return (CHALLENGE_TERMINAL_STATES as readonly string[]).includes(state);
}

function readSeed(value: unknown, label: string): number {
  const seed = number(value, 0, 0xffff_ffff);
  requireContract(Number.isInteger(seed), `${label} must be a uint32 seed`);
  return seed;
}

function readTaxi(value: unknown): ChallengeTaxiState {
  const data = plainFields(value, ['taxiId', 'status', 'freeTaxis'], 'challenge taxi');
  for (const key of ['taxiId', 'status', 'freeTaxis'] as const)
    requireRequired(data, key, 'challenge taxi');
  const freeTaxis = tick(data.freeTaxis);
  requireContract(freeTaxis <= 32, 'Challenge taxi capacity exceeded');
  return Object.freeze({
    taxiId: boundedId(data.taxiId, CHALLENGE_DIRECTOR_LIMITS.idCodeUnits, 'challenge taxi'),
    status: choice(data.status, challengeTaxiStatuses),
    freeTaxis,
  });
}

const assignmentFields = ['assignmentId', 'requestId', 'taxiId', 'customerId'] as const;

function readAssignment(value: unknown): ChallengeAssignmentEcho | null {
  if (value === null) return null;
  const data = plainFields(value, assignmentFields, 'challenge assignment');
  for (const key of assignmentFields) requireRequired(data, key, 'challenge assignment');
  return Object.freeze({
    assignmentId: boundedId(
      data.assignmentId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge assignment',
    ),
    requestId: boundedId(
      data.requestId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge assignment request',
    ),
    taxiId: boundedId(data.taxiId, CHALLENGE_DIRECTOR_LIMITS.idCodeUnits, 'challenge assignment'),
    customerId: boundedId(
      data.customerId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge assignment customer',
    ),
  });
}

const worldFields = [
  'sessionKind',
  'sessionId',
  'worldEpoch',
  'simulatedTick',
  'transferInProgress',
  'taxi',
  'assignment',
  'passengerAboard',
  'pickupZoneId',
  'fallbackDropoffZoneId',
  'reachableZoneIds',
  'capabilities',
] as const;

interface ReadWorld {
  readonly sessionKind: ChallengeSessionKind;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly simulatedTick: number;
  readonly transferInProgress: boolean;
  readonly taxi: ChallengeTaxiState;
  readonly assignment: ChallengeAssignmentEcho | null;
  readonly passengerAboard: boolean;
  readonly pickupZoneId: string;
  readonly fallbackDropoffZoneId: string;
  readonly reachableZoneIds: readonly string[];
  readonly capabilities: ChallengeCapabilities;
}

function readWorld(value: unknown): ReadWorld {
  const data = plainFields(value, worldFields, 'challenge world');
  for (const key of worldFields) requireRequired(data, key, 'challenge world');
  requireContract(
    typeof data.transferInProgress === 'boolean' && typeof data.passengerAboard === 'boolean',
    'Challenge world flags are booleans',
  );
  const reachableZoneIds = list(data.reachableZoneIds, (entry) =>
    boundedId(entry, CHALLENGE_DIRECTOR_LIMITS.idCodeUnits, 'challenge reachable zone'),
  );
  requireContract(
    reachableZoneIds.length <= 256 && new Set(reachableZoneIds).size === reachableZoneIds.length,
    'Challenge reachable zone capacity or duplicate',
  );
  return Object.freeze({
    sessionKind: choice(data.sessionKind, challengeSessionKinds),
    sessionId: boundedId(
      data.sessionId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge session',
    ),
    worldEpoch: tick(data.worldEpoch),
    simulatedTick: tick(data.simulatedTick),
    transferInProgress: data.transferInProgress,
    taxi: readTaxi(data.taxi),
    assignment: readAssignment(data.assignment),
    passengerAboard: data.passengerAboard,
    pickupZoneId: boundedId(
      data.pickupZoneId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge pickup zone',
    ),
    fallbackDropoffZoneId: boundedId(
      data.fallbackDropoffZoneId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge fallback dropoff zone',
    ),
    reachableZoneIds: Object.freeze([...reachableZoneIds]),
    capabilities: createChallengeCapabilities(data.capabilities),
  });
}

function readRoutePort(value: unknown): ChallengeRoutePort {
  requireContract(
    typeof value === 'object' &&
      value !== null &&
      typeof (value as ChallengeRoutePort).estimate === 'function',
    'Challenge routes must expose estimate(input)',
  );
  const port = value as ChallengeRoutePort,
    receiver = value;
  return Object.freeze({
    estimate: (input: Parameters<ChallengeRoutePort['estimate']>[0]) =>
      port.estimate.call(receiver, input),
  });
}

function readRouteEstimate(value: unknown): ChallengeRouteEstimate {
  const data = plainFields(value, ['reachable', 'seconds', 'graphVersion'], 'challenge route');
  for (const key of ['reachable', 'seconds', 'graphVersion'] as const)
    requireRequired(data, key, 'challenge route');
  requireContract(typeof data.reachable === 'boolean', 'Challenge route reachability is a boolean');
  return Object.freeze({
    reachable: data.reachable,
    seconds: number(data.seconds, 0, 86_400),
    graphVersion: boundedId(data.graphVersion, 64, 'challenge route graph version'),
  });
}

/* ---------------------------------------------------------------------------------------------
 * Snapshot readers
 * ------------------------------------------------------------------------------------------- */

const transitionFields = ['from', 'to', 'tick', 'reason'] as const;
const rewardFields = ['xpEligible', 'academyXp', 'claimed', 'rewardKey'] as const;
const outcomeFields = [
  'status',
  'reason',
  'tick',
  'verdict',
  'reward',
  'penalty',
  'xpDelta',
  'reputationDelta',
] as const;
const routeFactFields = ['seconds', 'graphVersion'] as const;
const instanceFields = [
  'instanceId',
  'templateId',
  'templateVersion',
  'family',
  'title',
  'label',
  'state',
  'seed',
  'attempt',
  'sessionKind',
  'sessionId',
  'worldEpoch',
  'offeredAtTick',
  'offerExpiresAtTick',
  'acceptedAtTick',
  'activatedAtTick',
  'endedAtTick',
  'taxiId',
  'pickupZoneId',
  'dropoffZoneId',
  'rideRequestId',
  'academyXp',
  'durationTicks',
  'objective',
  'route',
  'outcome',
  'transitions',
] as const;
const historyFields = ['templateId', 'family', 'result', 'seed', 'tick'] as const;
const snapshotFields = [
  'version',
  'enabled',
  'simulatedTick',
  'sessionKind',
  'sessionId',
  'worldEpoch',
  'rngSeed',
  'offerCount',
  'refusedOffers',
  'cooldownUntilTick',
  'instances',
  'history',
  'attempts',
  'totals',
  'droppedHistory',
  'droppedOutcomes',
] as const;
const attemptRowFields = ['templateId', 'attempts'] as const;
const verdictFields = [
  'version',
  'evaluatorId',
  'evaluatorVersion',
  'objectiveKind',
  'status',
  'reason',
  'progress',
  'target',
  'measured',
  'deadlineTick',
  'evaluatedTick',
  'expired',
  'incidents',
  'completedAtTick',
  'fingerprint',
] as const;

function readRewardOutcome(value: unknown): ChallengeRewardOutcome {
  const data = plainFields(value, rewardFields, 'challenge reward outcome');
  for (const key of rewardFields) requireRequired(data, key, 'challenge reward outcome');
  requireContract(typeof data.xpEligible === 'boolean', 'Challenge XP eligibility is a boolean');
  requireContract(data.claimed === false, '232 never claims a challenge reward');
  return Object.freeze({
    xpEligible: data.xpEligible,
    academyXp: tick(data.academyXp),
    claimed: false as const,
    rewardKey:
      data.rewardKey === null
        ? null
        : boundedId(data.rewardKey, CHALLENGE_DIRECTOR_LIMITS.idCodeUnits, 'challenge reward key'),
  });
}

function readVerdict(value: unknown): ChallengeVerdict {
  const data = plainFields(value, verdictFields, 'challenge verdict');
  for (const key of verdictFields) requireRequired(data, key, 'challenge verdict');
  requireContract(data.version === CHALLENGE_SCHEMA_VERSION, 'Challenge verdict schema version');
  const incidents = record(data.incidents);
  requireContract(
    typeof incidents.used === 'number' &&
      typeof incidents.budget === 'number' &&
      typeof incidents.exceeded === 'boolean',
    'Challenge verdict incident summary',
  );
  requireContract(
    data.completedAtTick === null || Number.isSafeInteger(data.completedAtTick),
    'Challenge verdict completion tick',
  );
  requireContract(
    typeof data.fingerprint === 'string' && data.fingerprint.startsWith('fnv1a32:'),
    'Challenge verdict fingerprint',
  );
  const measured = record(data.measured);
  const readMeasured = (key: string): number => {
    requireContract(key in measured, `Challenge measured field ${key}`);
    return number(measured[key], -1_000_000, 1_000_000);
  };
  return Object.freeze({
    version: CHALLENGE_SCHEMA_VERSION,
    evaluatorId: choice(data.evaluatorId, challengeEvaluatorIds),
    evaluatorVersion: boundedId(data.evaluatorVersion, 64, 'challenge evaluator version'),
    objectiveKind: choice(data.objectiveKind, challengeObjectiveKinds),
    status: choice(data.status, challengeVerdictStatuses),
    reason: choice(data.reason, challengeVerdictReasons),
    progress: tick(data.progress),
    target: tick(data.target),
    measured: Object.freeze({
      samplesExamined: tick(readMeasured('samplesExamined')),
      checkpointsReached: tick(readMeasured('checkpointsReached')),
      zonesVisited: tick(readMeasured('zonesVisited')),
      dropoffs: tick(readMeasured('dropoffs')),
      parkedAttempts: tick(readMeasured('parkedAttempts')),
      peakAccelerationMps2: readMeasured('peakAccelerationMps2'),
      peakJerkMps3: readMeasured('peakJerkMps3'),
      validDriftSeconds: readMeasured('validDriftSeconds'),
      rotationOnlyTicks: tick(readMeasured('rotationOnlyTicks')),
      collisionTicks: tick(readMeasured('collisionTicks')),
      distinctDestroyed: tick(readMeasured('distinctDestroyed')),
      orderViolations: tick(readMeasured('orderViolations')),
      stopViolationTicks: tick(readMeasured('stopViolationTicks')),
      learningObserved: tick(readMeasured('learningObserved')),
    }),
    deadlineTick: tick(data.deadlineTick),
    evaluatedTick: tick(data.evaluatedTick),
    expired: data.expired === true,
    incidents: Object.freeze({
      used: tick(incidents.used),
      budget: tick(incidents.budget),
      exceeded: incidents.exceeded === true,
    }),
    completedAtTick: data.completedAtTick === null ? null : tick(data.completedAtTick),
    fingerprint: data.fingerprint,
  });
}

function readOutcome(value: unknown): ChallengeOutcome | null {
  if (value === null) return null;
  const data = plainFields(value, outcomeFields, 'challenge outcome');
  for (const key of outcomeFields) requireRequired(data, key, 'challenge outcome');
  requireContract(data.penalty === 'NONE', 'A challenge outcome carries no penalty');
  requireContract(data.xpDelta === 0, 'A challenge outcome never changes XP');
  requireContract(data.reputationDelta === 0, 'A challenge outcome never changes reputation');
  return Object.freeze({
    status: choice(data.status, CHALLENGE_TERMINAL_STATES),
    reason: boundedId(data.reason, 64, 'challenge outcome reason'),
    tick: tick(data.tick),
    verdict: data.verdict === null ? null : readVerdict(data.verdict),
    reward: readRewardOutcome(data.reward),
    penalty: 'NONE' as const,
    xpDelta: 0 as const,
    reputationDelta: 0 as const,
  });
}

function readTransition(value: unknown): ChallengeStateTransition {
  const data = plainFields(value, transitionFields, 'challenge transition');
  for (const key of transitionFields) requireRequired(data, key, 'challenge transition');
  const from = choice(data.from, challengeInstanceStates);
  const to = choice(data.to, challengeInstanceStates);
  const reason = boundedId(data.reason, 64, 'challenge transition reason');
  const creationMarker = from === 'OFFERED' && to === 'OFFERED' && reason === 'OFFER_CREATED';
  requireContract(
    creationMarker || challengeDirectorTransitionAllowed(from, to),
    `Challenge transition ${from} -> ${to} is not part of the closed graph`,
  );
  return freezeTransition({ from, to, tick: tick(data.tick), reason });
}

function readInstance(
  value: unknown,
  catalog: ChallengeTemplateCatalog,
): ChallengeDirectorInstance {
  const data = plainFields(value, instanceFields, 'challenge instance');
  for (const key of instanceFields) requireRequired(data, key, 'challenge instance');
  const templateId = boundedId(
    data.templateId,
    CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
    'challenge instance template',
  );
  const template = catalog.templates.find((entry) => entry.templateId === templateId);
  requireContract(template !== undefined, `Unknown challenge instance template: ${templateId}`);
  const route = plainFields(data.route, routeFactFields, 'challenge instance route');
  for (const key of routeFactFields) requireRequired(route, key, 'challenge instance route');
  const transitions = list(data.transitions, readTransition);
  requireContract(
    transitions.length > 0 &&
      transitions.length <= CHALLENGE_DIRECTOR_LIMITS.transitionsPerInstance,
    'Challenge transition capacity',
  );
  const creationMarkers = transitions.filter(
    (entry) => entry.from === 'OFFERED' && entry.to === 'OFFERED',
  );
  requireContract(
    creationMarkers.length <= 1 &&
      (creationMarkers.length === 0 || transitions[0] === creationMarkers[0]),
    'Challenge creation marker must be the first transition',
  );
  const objective = parseChallengeObjectiveSnapshot(data.objective);
  requireContract(
    objective.evaluatorId === template.evaluatorId &&
      objective.objectiveKind === template.objectiveKind,
    'Challenge instance objective does not belong to its template',
  );
  const state = choice(data.state, challengeInstanceStates);
  const taxiIdRaw = data.taxiId;
  const taxiId =
    taxiIdRaw === null
      ? null
      : boundedId(taxiIdRaw, CHALLENGE_DIRECTOR_LIMITS.idCodeUnits, 'challenge taxi');
  requireContract(
    state === 'OFFERED' ? taxiId === null : taxiId !== null,
    'Only an offered challenge has no reserved taxi',
  );
  const acceptedAtTick = data.acceptedAtTick === null ? null : tick(data.acceptedAtTick);
  const activatedAtTick = data.activatedAtTick === null ? null : tick(data.activatedAtTick);
  const endedAtTick = data.endedAtTick === null ? null : tick(data.endedAtTick);
  const accepted = ['ACCEPTED', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(state);
  requireContract(
    accepted === (acceptedAtTick !== null),
    'Only an accepted challenge has an acceptance tick',
  );
  const started = state === 'ACTIVE' || state === 'COMPLETED' || state === 'FAILED';
  if (started)
    requireContract(activatedAtTick !== null, 'A started challenge has an activation tick');
  if (state === 'OFFERED' || state === 'ACCEPTED' || state === 'DECLINED' || state === 'EXPIRED')
    requireContract(activatedAtTick === null, 'An unstarted challenge has no activation tick');
  requireContract(
    isTerminalState(state) === (endedAtTick !== null),
    'A terminal challenge has an end tick and a live one does not',
  );
  const outcome = readOutcome(data.outcome);
  requireContract(
    isTerminalState(state) === (outcome !== null),
    'A terminal challenge carries its outcome and a live one does not',
  );
  if (outcome !== null)
    requireContract(outcome.status === state, 'A challenge outcome matches its terminal state');
  const attempt = tick(data.attempt);
  requireContract(
    attempt >= 1 && attempt <= CHALLENGE_DIRECTOR_LIMITS.attemptsPerTemplate,
    'Challenge instance attempt is inside the per-template cap',
  );
  const offeredAtTick = tick(data.offeredAtTick);
  const offerExpiresAtTick = tick(data.offerExpiresAtTick);
  requireContract(
    offerExpiresAtTick >= offeredAtTick,
    'A challenge offer cannot expire before it is offered',
  );
  return Object.freeze({
    instanceId: boundedId(
      data.instanceId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge instance',
    ),
    templateId,
    templateVersion: boundedId(data.templateVersion, 32, 'challenge instance version'),
    family: choice(data.family, challengeFamilies),
    title: boundedId(data.title, CHALLENGE_DIRECTOR_LIMITS.idCodeUnits, 'challenge instance title'),
    label: boundedId(data.label, CHALLENGE_DIRECTOR_LIMITS.idCodeUnits, 'challenge instance label'),
    state,
    seed: readSeed(data.seed, 'Challenge instance seed'),
    attempt,
    sessionKind: choice(data.sessionKind, challengeSessionKinds),
    sessionId: boundedId(
      data.sessionId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge session',
    ),
    worldEpoch: tick(data.worldEpoch),
    offeredAtTick,
    offerExpiresAtTick,
    acceptedAtTick,
    activatedAtTick,
    endedAtTick,
    taxiId,
    pickupZoneId: boundedId(
      data.pickupZoneId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge pickup zone',
    ),
    dropoffZoneId: boundedId(
      data.dropoffZoneId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge dropoff zone',
    ),
    rideRequestId: boundedId(
      data.rideRequestId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge ride request',
    ),
    academyXp: tick(data.academyXp),
    durationTicks: tick(data.durationTicks),
    objective,
    route: Object.freeze({
      seconds: number(route.seconds, 0, 86_400),
      graphVersion: boundedId(route.graphVersion, 64, 'challenge route graph version'),
    }),
    outcome,
    transitions: Object.freeze([...transitions]),
  });
}

function readHistoryEntry(value: unknown): ChallengeHistoryEntry {
  const data = plainFields(value, historyFields, 'challenge history entry');
  for (const key of historyFields) requireRequired(data, key, 'challenge history entry');
  return Object.freeze({
    templateId: boundedId(
      data.templateId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge history template',
    ),
    family: choice(data.family, challengeFamilies),
    result: choice(data.result, CHALLENGE_TERMINAL_STATES),
    seed: readSeed(data.seed, 'Challenge history seed'),
    tick: tick(data.tick),
  });
}

function historyCodeUnits(entries: readonly ChallengeHistoryEntry[]): number {
  return entries.reduce(
    (total, entry) => total + entry.templateId.length + entry.family.length + entry.result.length,
    0,
  );
}

function instanceCodeUnits(instance: ChallengeDirectorInstance): number {
  return instance.instanceId.length + instance.title.length + instance.templateId.length;
}

/* ---------------------------------------------------------------------------------------------
 * The director
 * ------------------------------------------------------------------------------------------- */

export function createChallengeDirector(options: unknown): ChallengeDirector {
  const optionFields = ['catalog', 'routes', 'seed', 'enabled'] as const;
  const data = plainFields(options, optionFields, 'challenge director option');
  for (const key of ['routes', 'seed'] as const)
    requireRequired(data, key, 'challenge director option');
  if (data.enabled !== undefined)
    requireContract(typeof data.enabled === 'boolean', 'Challenge director enabled flag');
  const catalog = parseChallengeTemplateCatalog(
    data.catalog === undefined ? createChallengeTemplateCatalog() : data.catalog,
  );
  const routes = readRoutePort(data.routes);

  let enabled = data.enabled === undefined ? true : data.enabled;
  let simulatedTick = 0;
  let sessionKind: ChallengeSessionKind | null = null;
  let sessionId: string | null = null;
  let worldEpoch: number | null = null;
  let rngSeed = readSeed(data.seed, 'Challenge director seed');
  let offerCount = 0;
  let refusedOffers = 0;
  let cooldownUntilTick: number | null = null;
  let instances: ChallengeDirectorInstance[] = [];
  let history: ChallengeHistoryEntry[] = [];
  let attempts = new Map<string, number>();
  const totals = zeroStates();
  let droppedHistory = 0;
  let droppedOutcomes = 0;

  function templateFor(templateId: string): ChallengeTemplate {
    const template = catalog.templates.find((entry) => entry.templateId === templateId);
    requireContract(template !== undefined, `Unknown challenge template: ${templateId}`);
    return template;
  }

  function attemptsFor(templateId: string): number {
    return attempts.get(templateId) ?? 0;
  }

  function replaceInstance(next: ChallengeDirectorInstance): void {
    const index = instances.findIndex((entry) => entry.instanceId === next.instanceId);
    requireContract(index >= 0, `Unknown challenge instance: ${next.instanceId}`);
    instances[index] = next;
  }

  function liveOffer(): ChallengeDirectorInstance | null {
    return instances.find((entry) => entry.state === 'OFFERED') ?? null;
  }

  function liveInstance(): ChallengeDirectorInstance | null {
    return (
      instances.find((entry) => entry.state === 'ACCEPTED' || entry.state === 'ACTIVE') ?? null
    );
  }

  function rewardKeyOf(instance: ChallengeDirectorInstance): string {
    return createStableId('challenge-reward', CHALLENGE_DIRECTOR_NAMESPACE, [
      instance.family,
      instance.templateId,
      instance.sessionId,
      String(instance.worldEpoch),
      instance.instanceId,
    ]);
  }

  function outcomeFor(
    instance: ChallengeDirectorInstance,
    status: ChallengeTerminalState,
    reason: string,
    atTick: number,
    verdict: ChallengeVerdict | null,
  ): ChallengeOutcome {
    const earns = status === 'COMPLETED' && instance.sessionKind === 'ACADEMY';
    return Object.freeze({
      status,
      reason,
      tick: atTick,
      verdict,
      reward: Object.freeze({
        xpEligible: earns,
        academyXp: earns ? instance.academyXp : 0,
        claimed: false as const,
        rewardKey: earns ? rewardKeyOf(instance) : null,
      }),
      penalty: 'NONE' as const,
      xpDelta: 0 as const,
      reputationDelta: 0 as const,
    });
  }

  function trimHistory(): void {
    while (history.length > CHALLENGE_DIRECTOR_LIMITS.historyEntries) {
      history.shift();
      droppedHistory += 1;
    }
    while (
      history.length > 0 &&
      historyCodeUnits(history) > CHALLENGE_DIRECTOR_LIMITS.historyCodeUnits
    ) {
      history.shift();
      droppedHistory += 1;
    }
  }

  function retainOutcomes(): void {
    const terminal = instances.filter((entry) => isTerminalState(entry.state));
    let units = terminal.reduce((total, entry) => total + instanceCodeUnits(entry), 0);
    let excess = terminal.length - CHALLENGE_DIRECTOR_LIMITS.retainedOutcomes;
    const dropped: ChallengeDirectorInstance[] = [];
    while ((excess > 0 || units > CHALLENGE_DIRECTOR_LIMITS.outcomeCodeUnits) && terminal.length) {
      const oldest = terminal.shift()!;
      units -= instanceCodeUnits(oldest);
      dropped.push(oldest);
      excess -= 1;
    }
    if (dropped.length === 0) return;
    const ids = new Set(dropped.map((entry) => entry.instanceId));
    instances = instances.filter((entry) => !ids.has(entry.instanceId));
    droppedOutcomes += dropped.length;
  }

  function pushHistory(instance: ChallengeDirectorInstance, result: ChallengeTerminalState): void {
    history.push(
      Object.freeze({
        templateId: instance.templateId,
        family: instance.family,
        result,
        seed: instance.seed,
        tick: simulatedTick,
      }),
    );
    trimHistory();
  }

  function startCooldown(): void {
    cooldownUntilTick = simulatedTick + CHALLENGE_DIRECTOR_LIMITS.cooldownTicks;
  }

  function transition(
    instance: ChallengeDirectorInstance,
    to: ChallengeInstanceState,
    reason: string,
    atTick: number,
    patch: Partial<ChallengeDirectorInstance> = {},
  ): ChallengeDirectorInstance {
    requireContract(
      challengeDirectorTransitionAllowed(instance.state, to),
      `Challenge transition ${instance.state} -> ${to} is not allowed`,
    );
    const transitions = [
      ...instance.transitions,
      freezeTransition({ from: instance.state, to, tick: atTick, reason }),
    ];
    requireContract(
      transitions.length <= CHALLENGE_DIRECTOR_LIMITS.transitionsPerInstance,
      'Challenge transition capacity',
    );
    totals[to] += 1;
    return Object.freeze({
      ...instance,
      ...patch,
      state: to,
      transitions: Object.freeze(transitions),
    });
  }

  function terminalize(
    instance: ChallengeDirectorInstance,
    to: ChallengeTerminalState,
    reason: string,
    atTick: number,
    verdict: ChallengeVerdict | null,
  ): ChallengeDirectorInstance {
    const next = transition(instance, to, reason, atTick, {
      endedAtTick: atTick,
      outcome: outcomeFor(instance, to, reason, atTick, verdict),
    });
    replaceInstance(next);
    pushHistory(next, to);
    startCooldown();
    retainOutcomes();
    return next;
  }

  function expireAtTick(): { expiredOffers: number; expiredInstances: number } {
    let expiredOffers = 0;
    let expiredInstances = 0;
    for (const instance of [...instances]) {
      if (instance.state === 'OFFERED' && simulatedTick >= instance.offerExpiresAtTick) {
        terminalize(
          instance,
          'EXPIRED',
          CHALLENGE_DIRECTOR_OFFER_EXPIRED_REASON,
          instance.offerExpiresAtTick,
          null,
        );
        expiredOffers += 1;
        continue;
      }
      if (instance.state === 'ACTIVE' && simulatedTick >= instance.objective.deadlineTick) {
        terminalize(
          instance,
          'FAILED',
          CHALLENGE_DIRECTOR_DEADLINE_REASON,
          instance.objective.deadlineTick,
          null,
        );
        expiredInstances += 1;
      }
    }
    return { expiredOffers, expiredInstances };
  }

  function advanceResult(
    paused: boolean,
    expiredOffers: number,
    expiredInstances: number,
  ): ChallengeAdvanceResult {
    const offer = liveOffer(),
      instance = liveInstance();
    return Object.freeze({
      simulatedTick,
      paused,
      expiredOffers,
      expiredInstances,
      activeOfferId: offer === null ? null : offer.instanceId,
      activeInstanceId: instance === null ? null : instance.instanceId,
    });
  }

  function requireInstance(value: unknown, label: string): ChallengeDirectorInstance {
    const id = boundedId(value, CHALLENGE_DIRECTOR_LIMITS.idCodeUnits, label);
    const instance = instances.find((entry) => entry.instanceId === id);
    requireContract(instance !== undefined, `Unknown challenge instance: ${id}`);
    return instance;
  }

  function freezeInstance(instance: ChallengeDirectorInstance): ChallengeDirectorInstance {
    return Object.freeze({
      ...instance,
      transitions: Object.freeze(instance.transitions.map((entry) => freezeTransition(entry))),
      outcome: instance.outcome,
    });
  }

  function preflight(world: ReadWorld): ChallengeOfferRefusal | null {
    if (!enabled)
      return refusal(
        'OFFERS_DISABLED',
        'Challenge offers are turned off; the toggle never changes a live instance',
      );
    if (world.transferInProgress)
      return refusal(
        'SESSION_TRANSFER_IN_PROGRESS',
        'A session transfer is in progress; no offer is generated',
      );
    if (sessionId !== null && (sessionId !== world.sessionId || worldEpoch !== world.worldEpoch))
      return refusal('SESSION_INVALID', 'The world snapshot belongs to another session', [
        `bound:${sessionId}@${String(worldEpoch)}`,
        `world:${world.sessionId}@${String(world.worldEpoch)}`,
      ]);
    if (sessionKind !== null && sessionKind !== world.sessionKind)
      return refusal('SESSION_INVALID', 'The world snapshot belongs to another session kind', [
        `bound:${sessionKind}`,
        `world:${world.sessionKind}`,
      ]);
    const offer = liveOffer();
    if (offer !== null)
      return refusal(
        'OFFER_ALREADY_ACTIVE',
        'A challenge offer is already visible; a second one never overwrites it',
        [offer.instanceId],
      );
    const instance = liveInstance();
    if (instance !== null)
      return refusal(
        'INSTANCE_ALREADY_ACTIVE',
        'A challenge instance is already live; finish or cancel it first',
        [instance.instanceId],
      );
    if (cooldownUntilTick !== null && simulatedTick < cooldownUntilTick)
      return refusal('COOLDOWN_ACTIVE', 'The challenge cooldown is still running', [
        String(cooldownUntilTick - simulatedTick),
      ]);
    if (world.taxi.status !== 'AVAILABLE' && world.taxi.freeTaxis === 0)
      return refusal(
        'NO_FREE_TAXI',
        'No free taxi exists for a challenge; a dispatch is never interrupted',
        [`taxi:${world.taxi.taxiId}:${world.taxi.status}`],
      );
    return null;
  }

  /**
   * Deterministic walk over the eligible candidates. The seed picks the starting index; a candidate
   * is skipped only by a real preflight rule (attempt cap, unreachable zone, unreachable route,
   * infeasible deadline), so the result is a single bounded walk rather than a rerandomisation loop.
   */
  function selectCandidate(
    world: ReadWorld,
    seed: number,
  ): { instance: ChallengeDirectorInstance } | ChallengeOfferRefusal {
    const eligibility = eligibleChallengeTemplates(catalog, world.capabilities);
    if (eligibility.eligible.length === 0)
      return refusal(
        'NO_ELIGIBLE_TEMPLATE',
        'No catalog template is realisable in this session',
        eligibility.excluded.flatMap((entry) => entry.missing),
      );
    const recent = new Set(
      history
        .slice()
        .reverse()
        .map((entry) => entry.templateId)
        .filter((templateId, index, all) => all.indexOf(templateId) === index)
        .slice(0, CHALLENGE_DIRECTOR_LIMITS.recentTemplates),
    );
    const preferred = eligibility.eligible.filter((templateId) => !recent.has(templateId));
    const candidates = preferred.length > 0 ? preferred : eligibility.eligible;
    const start =
      randomUint32(seed, `${CHALLENGE_DIRECTOR_NAMESPACE}:template`, 0) % candidates.length;
    const detail: string[] = [];
    const probes = Math.min(candidates.length, CHALLENGE_DIRECTOR_LIMITS.routeProbesPerOffer);
    for (let offset = 0; offset < probes; offset += 1) {
      const templateId = candidates[(start + offset) % candidates.length]!;
      const used = attemptsFor(templateId);
      if (used >= CHALLENGE_DIRECTOR_LIMITS.attemptsPerTemplate) {
        detail.push(`ATTEMPT_LIMIT:${templateId}`);
        continue;
      }
      const template = templateFor(templateId);
      let plan: ChallengeAttemptPlan;
      try {
        plan = planChallengeAttempt({
          template,
          catalogVersion: catalog.version,
          capabilities: world.capabilities,
          sessionKind: world.sessionKind,
          seed,
          attempt: used + 1,
          startedTick: 0,
        });
      } catch (error) {
        detail.push(`EXCLUDED:${templateId}:${error instanceof Error ? error.message : ''}`);
        continue;
      }
      const unreachableZones = plan.objective.zoneIds.filter(
        (zoneId) => !world.reachableZoneIds.includes(zoneId),
      );
      if (unreachableZones.length > 0) {
        detail.push(
          ...unreachableZones.map((zoneId) => `ROUTE_UNREACHABLE:${templateId}:${zoneId}`),
        );
        continue;
      }
      const dropoffZoneId = plan.objective.zoneIds[0] ?? world.fallbackDropoffZoneId;
      const estimate = readRouteEstimate(
        routes.estimate({
          taxiId: world.taxi.taxiId,
          templateId,
          pickupZoneId: world.pickupZoneId,
          dropoffZoneId,
        }),
      );
      if (!estimate.reachable) {
        detail.push(`ROUTE_UNREACHABLE:${templateId}:${dropoffZoneId}`);
        continue;
      }
      const authoredSeconds = template.deadline.referenceSeconds * (1 + plan.deadline.margin);
      if (estimate.seconds > authoredSeconds - CHALLENGE_DIRECTOR_LIMITS.feasibilitySlackSeconds) {
        detail.push(`DEADLINE_INFEASIBLE:${templateId}:${estimate.seconds}s>${authoredSeconds}s`);
        continue;
      }
      const offerExpiresAtTick = simulatedTick + CHALLENGE_DIRECTOR_LIMITS.offerWindowTicks;
      const objective = parseChallengeObjectiveSnapshot({
        ...plan.objective,
        deadlineTick: offerExpiresAtTick + plan.deadline.durationTicks,
      });
      return {
        instance: freezeInstance({
          instanceId: plan.instanceId,
          templateId: template.templateId,
          templateVersion: template.version,
          family: template.family,
          title: template.title,
          label: template.label,
          state: 'OFFERED',
          seed,
          attempt: used + 1,
          sessionKind: world.sessionKind,
          sessionId: world.sessionId,
          worldEpoch: world.worldEpoch,
          offeredAtTick: simulatedTick,
          offerExpiresAtTick,
          acceptedAtTick: null,
          activatedAtTick: null,
          endedAtTick: null,
          taxiId: null,
          pickupZoneId: world.pickupZoneId,
          dropoffZoneId,
          rideRequestId: createStableId('challenge-ride', CHALLENGE_DIRECTOR_NAMESPACE, [
            plan.instanceId,
          ]),
          academyXp: template.rewardPolicy.academyXp,
          durationTicks: plan.deadline.durationTicks,
          objective,
          route: Object.freeze({ seconds: estimate.seconds, graphVersion: estimate.graphVersion }),
          outcome: null,
          transitions: Object.freeze([
            freezeTransition({
              from: 'OFFERED',
              to: 'OFFERED',
              tick: simulatedTick,
              reason: 'OFFER_CREATED',
            }),
          ]),
        }),
      };
    }
    return refusal(
      'NO_ELIGIBLE_TEMPLATE',
      'Every deterministic candidate was excluded by a real preflight rule',
      detail,
    );
  }

  function reservationOf(instance: ChallengeDirectorInstance): ChallengeReservation {
    requireContract(instance.taxiId !== null, 'A reservation needs its taxi');
    return Object.freeze({
      version: CHALLENGE_DIRECTOR_VERSION,
      instanceId: instance.instanceId,
      taxiId: instance.taxiId,
      rideRequestId: instance.rideRequestId,
      pickupZoneId: instance.pickupZoneId,
      dropoffZoneId: instance.dropoffZoneId,
      dispatchSuspended: true as const,
      reservedAtTick: instance.acceptedAtTick ?? simulatedTick,
    });
  }

  function offer(value: unknown): ChallengeOfferResult {
    const request = plainFields(value, ['world', 'seed'], 'challenge offer request');
    requireRequired(request, 'world', 'challenge offer request');
    const world = readWorld(request.world);
    requireContract(
      world.simulatedTick >= simulatedTick,
      'The challenge clock never moves backwards',
    );
    simulatedTick = world.simulatedTick;
    // Close an expired offer first so the preflight counts a real, current window.
    expireAtTick();
    const blocked = preflight(world);
    if (blocked !== null) {
      refusedOffers += 1;
      return blocked;
    }
    if (sessionKind === null) {
      sessionKind = world.sessionKind;
      sessionId = world.sessionId;
      worldEpoch = world.worldEpoch;
    }
    const seed =
      request.seed === undefined ? nextOfferSeed() : readSeed(request.seed, 'Challenge offer seed');
    const selected = selectCandidate(world, seed);
    if (!('instance' in selected)) {
      refusedOffers += 1;
      return selected;
    }
    offerCount += 1;
    totals.OFFERED += 1;
    attempts.set(selected.instance.templateId, selected.instance.attempt);
    instances.push(selected.instance);
    return Object.freeze({
      status: 'OFFERED' as const,
      instance: selected.instance,
      interruption: Object.freeze({
        ride: world.assignment === null ? null : world.assignment.assignmentId,
        passenger: world.assignment === null ? null : world.assignment.customerId,
        rideCancelled: false as const,
        assignmentChanged: false as const,
        passengerMoved: false as const,
      }),
    });
  }

  function nextOfferSeed(): number {
    return randomUint32(rngSeed, `${CHALLENGE_DIRECTOR_NAMESPACE}:offer`, offerCount);
  }

  function accept(value: unknown): ChallengeAcceptResult {
    const request = plainFields(
      value,
      ['instanceId', 'taxi', 'assignment', 'passengerAboard'],
      'challenge accept request',
    );
    for (const key of ['instanceId', 'taxi', 'assignment', 'passengerAboard'] as const)
      requireRequired(request, key, 'challenge accept request');
    requireContract(
      typeof request.passengerAboard === 'boolean',
      'Challenge acceptance needs the real passenger flag',
    );
    const instance = requireInstance(request.instanceId, 'challenge accept instance');
    const taxi = readTaxi(request.taxi);
    const assignment = readAssignment(request.assignment);
    if (instance.state === 'OFFERED' && simulatedTick >= instance.offerExpiresAtTick) {
      const expired = terminalize(
        instance,
        'EXPIRED',
        CHALLENGE_DIRECTOR_OFFER_EXPIRED_REASON,
        instance.offerExpiresAtTick,
        null,
      );
      return refusal('INVALID_STATE', 'The offer has expired', [expired.instanceId]);
    }
    if (instance.state === 'ACCEPTED' || instance.state === 'ACTIVE')
      return Object.freeze({
        status: 'ACCEPTED' as const,
        duplicate: true,
        instance,
        reservation: reservationOf(instance),
      });
    if (instance.state !== 'OFFERED')
      return refusal('INVALID_STATE', `A ${instance.state} offer cannot be accepted`, [
        instance.instanceId,
      ]);
    if (request.passengerAboard)
      return refusal(
        'PASSENGER_ABOARD',
        'The taxi carries a passenger; the existing ride is never abandoned',
        [instance.instanceId],
      );
    if (assignment !== null)
      return refusal(
        'TAXI_ASSIGNED',
        'The taxi is dispatched; the existing assignment is never replaced',
        [assignment.assignmentId],
      );
    if (taxi.status !== 'AVAILABLE')
      return refusal('NO_FREE_TAXI', 'The player taxi cannot take a challenge right now', [
        `${taxi.taxiId}:${taxi.status}`,
      ]);
    const next = transition(instance, 'ACCEPTED', 'ACCEPTED_BY_PLAYER', simulatedTick, {
      taxiId: taxi.taxiId,
      acceptedAtTick: simulatedTick,
    });
    replaceInstance(next);
    return Object.freeze({
      status: 'ACCEPTED' as const,
      duplicate: false,
      instance: next,
      reservation: reservationOf(next),
    });
  }

  function decline(value: unknown): ChallengeDeclineResult {
    const request = plainFields(value, ['instanceId'], 'challenge decline request');
    requireRequired(request, 'instanceId', 'challenge decline request');
    const instance = requireInstance(request.instanceId, 'challenge decline instance');
    if (instance.state !== 'OFFERED' && instance.state !== 'DECLINED')
      return refusal('INVALID_STATE', `A ${instance.state} challenge cannot be declined`, [
        instance.instanceId,
      ]);
    const duplicate = instance.state === 'DECLINED';
    const next = duplicate
      ? instance
      : terminalize(instance, 'DECLINED', 'DECLINED_BY_PLAYER', simulatedTick, null);
    return Object.freeze({
      status: 'DECLINED' as const,
      duplicate,
      instance: next,
      outcome: next.outcome!,
      xpDelta: 0 as const,
      reputationDelta: 0 as const,
      rewardGranted: false as const,
      penalty: 'NONE' as const,
      cooldownUntilTick: cooldownUntilTick ?? simulatedTick,
    });
  }

  function activate(value: unknown): ChallengeActivateResult {
    const request = plainFields(value, ['instanceId'], 'challenge activate request');
    requireRequired(request, 'instanceId', 'challenge activate request');
    const instance = requireInstance(request.instanceId, 'challenge activate instance');
    if (instance.state === 'ACTIVE')
      return Object.freeze({ status: 'ACTIVE' as const, duplicate: true, instance });
    if (instance.state !== 'ACCEPTED')
      return refusal('INVALID_STATE', `A ${instance.state} challenge cannot become active`, [
        instance.instanceId,
      ]);
    const objective = parseChallengeObjectiveSnapshot({
      ...instance.objective,
      deadlineTick: simulatedTick + instance.durationTicks,
    });
    const next = transition(instance, 'ACTIVE', 'RIDE_STARTED', simulatedTick, {
      activatedAtTick: simulatedTick,
      objective,
    });
    replaceInstance(next);
    return Object.freeze({ status: 'ACTIVE' as const, duplicate: false, instance: next });
  }

  function evaluate(value: unknown): ChallengeEvaluateOutcome {
    const request = plainFields(value, ['instanceId', 'facts'], 'challenge evaluate request');
    for (const key of ['instanceId', 'facts'] as const)
      requireRequired(request, key, 'challenge evaluate request');
    const instance = requireInstance(request.instanceId, 'challenge evaluate instance');
    if (isTerminalState(instance.state))
      return Object.freeze({
        status: 'DUPLICATE' as const,
        instance,
        verdict: instance.outcome === null ? null : instance.outcome.verdict,
      });
    if (instance.state !== 'ACTIVE')
      return refusal('INVALID_STATE', `A ${instance.state} challenge has no running objective`, [
        instance.instanceId,
      ]);
    const verdict = evaluateChallenge({ objective: instance.objective, facts: request.facts });
    requireContract(
      instance.activatedAtTick === null || verdict.evaluatedTick >= instance.activatedAtTick,
      'A challenge verdict cannot be evaluated before the objective started',
    );
    if (verdict.status === 'INCOMPLETE')
      return Object.freeze({ status: 'IN_PROGRESS' as const, instance, verdict });
    const to: 'COMPLETED' | 'FAILED' = verdict.status === 'PASSED' ? 'COMPLETED' : 'FAILED';
    const next = terminalize(instance, to, verdict.reason, verdict.evaluatedTick, verdict);
    return Object.freeze({ status: to, instance: next, verdict });
  }

  function cancel(value: unknown): ChallengeCancelOutcome {
    const request = plainFields(value, ['instanceId', 'reason'], 'challenge cancel request');
    for (const key of ['instanceId', 'reason'] as const)
      requireRequired(request, key, 'challenge cancel request');
    const instance = requireInstance(request.instanceId, 'challenge cancel instance');
    const reason = choice(request.reason, challengeCancellationReasons);
    if (instance.state === 'CANCELLED')
      return Object.freeze({
        status: 'CANCELLED' as const,
        duplicate: true,
        instance,
        outcome: instance.outcome!,
      });
    const allowed = instance.state === 'ACCEPTED' || instance.state === 'ACTIVE';
    if (!allowed)
      return refusal('INVALID_STATE', `A ${instance.state} challenge cannot be cancelled`, [
        instance.instanceId,
      ]);
    const next = terminalize(instance, 'CANCELLED', reason, simulatedTick, null);
    return Object.freeze({
      status: 'CANCELLED' as const,
      duplicate: false,
      instance: next,
      outcome: next.outcome!,
    });
  }

  function advance(value: unknown): ChallengeAdvanceResult {
    const request = plainFields(value, ['ticks', 'paused'], 'challenge advance request');
    for (const key of ['ticks', 'paused'] as const)
      requireRequired(request, key, 'challenge advance request');
    requireContract(typeof request.paused === 'boolean', 'Challenge advance needs the pause flag');
    const ticks = tick(request.ticks);
    if (!request.paused) {
      requireContract(
        simulatedTick + ticks <= Number.MAX_SAFE_INTEGER,
        'The challenge clock would overflow',
      );
      simulatedTick += ticks;
    }
    const expired = expireAtTick();
    return advanceResult(request.paused, expired.expiredOffers, expired.expiredInstances);
  }

  function expire(value: unknown): ChallengeAdvanceResult {
    return advance(value);
  }

  function restart(value: unknown): ChallengeActivateResult {
    const request = plainFields(
      value,
      ['instanceId', 'capabilities', 'seed'],
      'challenge restart request',
    );
    for (const key of ['instanceId', 'capabilities'] as const)
      requireRequired(request, key, 'challenge restart request');
    const instance = requireInstance(request.instanceId, 'challenge restart instance');
    if (instance.state !== 'ACTIVE' && instance.state !== 'ACCEPTED' && instance.state !== 'FAILED')
      return refusal('INVALID_STATE', `A ${instance.state} challenge cannot be restarted`, [
        instance.instanceId,
      ]);
    const template = templateFor(instance.templateId);
    const used = Math.max(attemptsFor(instance.templateId), instance.attempt);
    if (used >= CHALLENGE_DIRECTOR_LIMITS.attemptsPerTemplate)
      return refusal('ATTEMPT_LIMIT', 'R is refused: the per-template attempt cap is reached', [
        `${instance.templateId}:${String(used)}`,
      ]);
    const capabilities = createChallengeCapabilities(request.capabilities);
    const seed =
      request.seed === undefined
        ? randomUint32(rngSeed, `${CHALLENGE_DIRECTOR_NAMESPACE}:restart`, used)
        : readSeed(request.seed, 'Challenge restart seed');
    const plan = planChallengeAttempt({
      template,
      catalogVersion: catalog.version,
      capabilities,
      sessionKind: instance.sessionKind,
      seed,
      attempt: used + 1,
      startedTick: 0,
    });
    if (!isTerminalState(instance.state))
      terminalize(instance, 'CANCELLED', 'RESTART', simulatedTick, null);
    const objective = parseChallengeObjectiveSnapshot({
      ...plan.objective,
      deadlineTick: simulatedTick + plan.deadline.durationTicks,
    });
    const next = freezeInstance({
      ...instance,
      instanceId: plan.instanceId,
      seed,
      attempt: used + 1,
      state: 'ACTIVE',
      offeredAtTick: simulatedTick,
      offerExpiresAtTick: simulatedTick + CHALLENGE_DIRECTOR_LIMITS.offerWindowTicks,
      acceptedAtTick: simulatedTick,
      activatedAtTick: simulatedTick,
      endedAtTick: null,
      taxiId: instance.taxiId,
      pickupZoneId: instance.pickupZoneId,
      dropoffZoneId: plan.objective.zoneIds[0] ?? instance.dropoffZoneId,
      rideRequestId: createStableId('challenge-ride', CHALLENGE_DIRECTOR_NAMESPACE, [
        plan.instanceId,
      ]),
      academyXp: template.rewardPolicy.academyXp,
      durationTicks: plan.deadline.durationTicks,
      objective,
      route: instance.route,
      outcome: null,
      transitions: Object.freeze([
        freezeTransition({
          from: 'OFFERED',
          to: 'ACCEPTED',
          tick: simulatedTick,
          reason: 'RESTART_NEW_INSTANCE',
        }),
        freezeTransition({
          from: 'ACCEPTED',
          to: 'ACTIVE',
          tick: simulatedTick,
          reason: 'RESTART_NEW_INSTANCE',
        }),
      ]),
    });
    instances.push(next);
    attempts.set(next.templateId, next.attempt);
    totals.ACCEPTED += 1;
    totals.ACTIVE += 1;
    return Object.freeze({ status: 'ACTIVE' as const, duplicate: false, instance: next });
  }

  function changeVehicle(value: unknown): ChallengeChangeVehicleOutcome {
    const request = plainFields(value, ['instanceId', 'taxiId'], 'challenge vehicle request');
    for (const key of ['instanceId', 'taxiId'] as const)
      requireRequired(request, key, 'challenge vehicle request');
    const instance = requireInstance(request.instanceId, 'challenge vehicle instance');
    const taxiId = boundedId(
      request.taxiId,
      CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
      'challenge taxi',
    );
    if (instance.state !== 'ACCEPTED' && instance.state !== 'ACTIVE')
      return refusal('INVALID_STATE', 'Only a live challenge is bound to a taxi', [
        instance.instanceId,
      ]);
    if (instance.taxiId !== taxiId)
      return refusal(
        'BOUND_TO_TAXI',
        'The challenge stays bound to the taxi it reserved; no instance or reward is duplicated',
        [instance.taxiId ?? '', taxiId],
      );
    return Object.freeze({
      status: 'UNCHANGED' as const,
      instance,
      duplicateInstances: 0 as const,
      duplicateRewards: 0 as const,
    });
  }

  function setOffersEnabled(value: unknown): ChallengeToggleResult {
    const request = plainFields(value, ['enabled'], 'challenge toggle request');
    requireRequired(request, 'enabled', 'challenge toggle request');
    requireContract(typeof request.enabled === 'boolean', 'Challenge toggle needs a boolean');
    enabled = request.enabled;
    let retractedOffers = 0;
    if (!enabled) {
      const offer = liveOffer();
      if (offer !== null) {
        terminalize(offer, 'EXPIRED', 'OFFERS_DISABLED', simulatedTick, null);
        retractedOffers = 1;
      }
    }
    const instance = liveInstance();
    return Object.freeze({
      enabled,
      retractedOffers,
      activeInstanceId: instance === null ? null : instance.instanceId,
    });
  }

  function reset(value: unknown): ChallengeAdvanceResult {
    const request = plainFields(value, ['reason'], 'challenge reset request');
    requireRequired(request, 'reason', 'challenge reset request');
    const reason = choice(request.reason, challengeCancellationReasons);
    for (const instance of [...instances]) {
      if (instance.state === 'OFFERED') {
        terminalize(instance, 'EXPIRED', reason, simulatedTick, null);
        continue;
      }
      if (isTerminalState(instance.state)) continue;
      terminalize(instance, 'CANCELLED', reason, simulatedTick, null);
    }
    return advanceResult(false, 0, 0);
  }

  function snapshot(): ChallengeDirectorSnapshot {
    return Object.freeze({
      version: CHALLENGE_DIRECTOR_STATE_VERSION,
      enabled,
      simulatedTick,
      sessionKind,
      sessionId,
      worldEpoch,
      rngSeed,
      offerCount,
      refusedOffers,
      cooldownUntilTick,
      instances: Object.freeze(instances.map((entry) => freezeInstance(entry))),
      history: Object.freeze(history.map((entry) => Object.freeze({ ...entry }))),
      attempts: Object.freeze(
        [...attempts.entries()]
          .sort(([left], [right]) => compareText(left, right))
          .map(([templateId, count]) => Object.freeze({ templateId, attempts: count })),
      ),
      totals: Object.freeze({ ...totals }),
      droppedHistory,
      droppedOutcomes,
    });
  }

  function restore(value: unknown): ChallengeRestoreOutcome {
    try {
      const data = plainFields(value, snapshotFields, 'challenge director snapshot');
      for (const key of snapshotFields) requireRequired(data, key, 'challenge director snapshot');
      requireContract(
        data.version === CHALLENGE_DIRECTOR_STATE_VERSION,
        'Unsupported challenge director snapshot version',
      );
      requireContract(typeof data.enabled === 'boolean', 'Snapshot enabled flag');
      const restoredInstances = list(data.instances, (entry) => readInstance(entry, catalog));
      const restoredHistory = list(data.history, readHistoryEntry);
      const restoredAttempts = list(data.attempts, (entry) => {
        const row = plainFields(entry, attemptRowFields, 'challenge attempt row');
        for (const key of attemptRowFields) requireRequired(row, key, 'challenge attempt row');
        const count = tick(row.attempts);
        requireContract(
          count <= CHALLENGE_DIRECTOR_LIMITS.attemptsPerTemplate,
          'Challenge attempt row exceeds the per-template cap',
        );
        return Object.freeze({
          templateId: boundedId(
            row.templateId,
            CHALLENGE_DIRECTOR_LIMITS.idCodeUnits,
            'challenge attempt template',
          ),
          attempts: count,
        });
      });
      requireContract(
        new Set(restoredInstances.map((entry) => entry.instanceId)).size ===
          restoredInstances.length,
        'Duplicate challenge instance in the snapshot',
      );
      requireContract(
        restoredInstances.filter((entry) => entry.state === 'OFFERED').length <=
          CHALLENGE_DIRECTOR_LIMITS.activeOffers,
        'Snapshot holds more than one visible offer',
      );
      requireContract(
        restoredInstances.filter((entry) => entry.state === 'ACCEPTED' || entry.state === 'ACTIVE')
          .length <= CHALLENGE_DIRECTOR_LIMITS.activeInstances,
        'Snapshot holds more than one live instance',
      );
      requireContract(
        restoredHistory.length <= CHALLENGE_DIRECTOR_LIMITS.historyEntries &&
          historyCodeUnits(restoredHistory) <= CHALLENGE_DIRECTOR_LIMITS.historyCodeUnits,
        'Snapshot history exceeds the finite cap',
      );
      const nextTotals = zeroStates();
      const restoredTotals = plainFields(data.totals, challengeInstanceStates, 'challenge totals');
      for (const state of challengeInstanceStates) nextTotals[state] = tick(restoredTotals[state]);
      requireContract(
        (data.sessionKind === null) === (data.sessionId === null) &&
          (data.sessionKind === null) === (data.worldEpoch === null),
        'Snapshot session identity is incomplete',
      );
      const nextSessionKind =
        data.sessionKind === null ? null : choice(data.sessionKind, challengeSessionKinds);
      const nextSessionId =
        data.sessionId === null
          ? null
          : boundedId(data.sessionId, CHALLENGE_DIRECTOR_LIMITS.idCodeUnits, 'challenge session');
      const nextWorldEpoch = data.worldEpoch === null ? null : tick(data.worldEpoch);
      if (nextSessionId !== null)
        for (const instance of restoredInstances)
          requireContract(
            instance.sessionId === nextSessionId &&
              instance.worldEpoch === nextWorldEpoch &&
              instance.sessionKind === nextSessionKind,
            'A restored challenge belongs to another session',
          );
      const droppedHistoryValue = tick(data.droppedHistory);
      const droppedOutcomesValue = tick(data.droppedOutcomes);
      // Apply only after every field validated, so a rejected snapshot changes nothing.
      enabled = data.enabled;
      simulatedTick = tick(data.simulatedTick);
      sessionKind = nextSessionKind;
      sessionId = nextSessionId;
      worldEpoch = nextWorldEpoch;
      rngSeed = readSeed(data.rngSeed, 'Challenge director snapshot seed');
      offerCount = tick(data.offerCount);
      refusedOffers = tick(data.refusedOffers);
      cooldownUntilTick = data.cooldownUntilTick === null ? null : tick(data.cooldownUntilTick);
      for (const state of challengeInstanceStates) totals[state] = nextTotals[state];
      instances = restoredInstances.map((entry) => freezeInstance(entry));
      history = [...restoredHistory];
      attempts = new Map(restoredAttempts.map((entry) => [entry.templateId, entry.attempts]));
      droppedHistory = droppedHistoryValue;
      droppedOutcomes = droppedOutcomesValue;
      return Object.freeze({
        status: 'RESTORED' as const,
        simulatedTick,
        instances: instances.length,
        history: history.length,
      });
    } catch (error) {
      return refusal(
        'SNAPSHOT_INVALID',
        error instanceof Error ? error.message : 'Invalid challenge director snapshot',
      );
    }
  }

  function stats(): ChallengeDirectorStats {
    const byState = zeroStates();
    for (const instance of instances) byState[instance.state] += 1;
    const offer = liveOffer(),
      instance = liveInstance();
    return Object.freeze({
      version: CHALLENGE_DIRECTOR_VERSION,
      enabled,
      simulatedTick,
      offers: totals.OFFERED,
      refusedOffers,
      accepted: totals.ACCEPTED,
      activated: totals.ACTIVE,
      completed: totals.COMPLETED,
      failed: totals.FAILED,
      cancelled: totals.CANCELLED,
      declined: totals.DECLINED,
      expiredOffers: totals.EXPIRED,
      cooldownRemainingTicks:
        cooldownUntilTick === null ? 0 : Math.max(0, cooldownUntilTick - simulatedTick),
      activeOfferId: offer === null ? null : offer.instanceId,
      activeInstanceId: instance === null ? null : instance.instanceId,
      liveOffers: byState.OFFERED,
      liveInstances: byState.ACCEPTED + byState.ACTIVE,
      retained: instances.length,
      history: history.length,
      historyCodeUnits: historyCodeUnits(history),
      droppedHistory,
      droppedOutcomes,
      byState: Object.freeze({ ...byState }),
      totals: Object.freeze({ ...totals }),
    });
  }

  return Object.freeze({
    version: CHALLENGE_DIRECTOR_VERSION,
    offer,
    accept,
    decline,
    activate,
    evaluate,
    cancel,
    expire,
    advance,
    restart,
    changeVehicle,
    setOffersEnabled,
    reset,
    instances: () => Object.freeze([...instances]),
    instance: (instanceId: string) => instances.find((entry) => entry.instanceId === instanceId),
    history: () => Object.freeze([...history]),
    snapshot,
    restore,
    stats,
  });
}
