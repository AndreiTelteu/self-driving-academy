/**
 * PBI 198 — intervention segments and telemetry with a walking character.
 *
 * The contract is a **pure read model**: no clock, no DOM, no Babylon, no `Math.random`, no
 * simulation service, no telemetry writer and no estimator launch. It consumes the delivered
 * authority transitions of PBI 195/196/197 and answers one question per transition:
 *
 *   which driving segment closes, and with what kind — `MANUAL`, `LEARNING` or none at all —
 *   and which estimator candidate would the real PBI 069 gate admit for it?
 *
 * The defect this contract exists to prevent is a walking body that leaks into the driving
 * profile. Walking is therefore not a segment at all: a `WALK` step only counts walked ticks and
 * metres, and the only code path that can create a segment is an accepted `ENTER` (PBI 195/197
 * TAKE) that carries the real `VEHICLE:<id>` authority. There is no way for `WALK` to produce a
 * closed segment or a candidate, however far the character moves.
 *
 * Criterion 1 is the 069 rule, copied rather than re-invented. The real boundary in
 * `src/telemetry/intervention-lifecycle.ts` builds an intake descriptor only when the closed
 * record is `controlMode === 'LEARNING' && learningEligible && completeness === 'CLOSED'` and its
 * world/player/profile/epoch/base-version identity still matches the target. `learningEligible` is
 * frozen when the segment opens (`mode === 'LEARNING' && target.learningEligible`), exactly like
 * 069; a close never re-reads it. A segment truncated by an exit mid-manoeuvre is still `CLOSED`
 * and still eligible, because 069 has no manoeuvre-completion rule — only `DATA_LOSS` makes a
 * segment `INCOMPLETE`, and authority transitions never produce it. `estimatorCandidate` is that
 * same gate as pure data, and the evidence cross-checks it against the real 069 lifecycle.
 *
 * Criterion 2 is the explicit mode. An `ENTER` without an explicit mode opens exactly the 195
 * entry mode (`MANUAL`); it never guesses `LEARNING` from the segment that just closed. A
 * `FOCUS` copies the 193 authority and closes nothing — only a real TAKE or a real exit closes a
 * segment. The state is plain frozen data, serialisable and replayable for PBI 200.
 */
import type { InputAuthority } from '../input';
import type { VehicleState } from '../vehicles';
import { CHARACTER_SAMPLING_HZ } from './clips';
import { VEHICLE_ENTRY_POLICY } from './enter-vehicle';

export const WALKING_SEGMENTS_CONTRACT_VERSION = '198-walking-segments-v1' as const;
export const WALKING_SEGMENT_CANDIDATE_VERSION = '198-estimator-candidate-v1' as const;

/**
 * Real values only: the fixed tick of 192/193/194/195/196/197 and the exact mode an entry may
 * impose in 195. The module invents no timing, no reach and no mode of its own.
 */
export const WALKING_SEGMENTS_POLICY = Object.freeze({
  contract: WALKING_SEGMENTS_CONTRACT_VERSION,
  tickHz: CHARACTER_SAMPLING_HZ,
  /** Exactly the PBI 195 `VEHICLE_ENTRY_POLICY.entryMode`; a TAKE never guesses LEARNING. */
  defaultEntryMode: VEHICLE_ENTRY_POLICY.entryMode,
});

/** The two driving kinds a closed segment can carry; walking is not a kind, it is the absence. */
export const WALKING_SEGMENT_KINDS = Object.freeze(['MANUAL', 'LEARNING'] as const);
export type WalkingSegmentKind = (typeof WALKING_SEGMENT_KINDS)[number];

/** The transitions this read model understands; each one is a delivered 195/196/197 command. */
export const WALKING_SEGMENT_TRANSITIONS = Object.freeze([
  'WALK',
  'ENTER',
  'EXIT',
  'FOCUS',
] as const);
export type WalkingSegmentTransition = (typeof WALKING_SEGMENT_TRANSITIONS)[number];

/** Only the reasons an authority transition itself produces. Nothing is invented. */
export const WALKING_SEGMENT_CLOSE_REASONS = Object.freeze([
  'RETURN_TO_AUTO',
  'VEHICLE_SWITCH',
] as const);
export type WalkingSegmentCloseReason = (typeof WALKING_SEGMENT_CLOSE_REASONS)[number];

/** Contract violations are thrown, never reported as a normal segment result. */
export const WALKING_SEGMENTS_ERROR_CODES = Object.freeze([
  'INVALID_SEGMENT_INPUT',
  'INVALID_SEGMENT_TICK',
  'INVALID_SEGMENT_AUTHORITY',
  'INVALID_SEGMENT_TRANSITION',
  'INVALID_SEGMENT_STATE',
] as const);
export type WalkingSegmentsErrorCode = (typeof WALKING_SEGMENTS_ERROR_CODES)[number];

export class WalkingSegmentsError extends Error {
  readonly code: WalkingSegmentsErrorCode;

  constructor(code: WalkingSegmentsErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'WalkingSegmentsError';
    this.code = code;
  }
}

/**
 * Exactly the PBI 069 `InterventionTarget` fields this gate compares, plus the world identity.
 * The target belongs to the profile owner; it is never inferred from a segment.
 */
export interface WalkingSegmentsTarget {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly playerId: string;
  readonly profileId: string;
  readonly baseVersionId: string;
  readonly learningEpoch: number;
  /** The 069 target eligibility; a LEARNING segment freezes it when it opens. */
  readonly learningEligible: boolean;
}

/** A driving segment that is still open. Walking has no equivalent record. */
export interface WalkingSegmentOpen {
  readonly segmentId: string;
  readonly kind: WalkingSegmentKind;
  readonly vehicleId: string;
  readonly startTick: number;
  /** Frozen at open, exactly the 069 rule; a later target change cannot rewrite it. */
  readonly learningEligible: boolean;
}

/** The real 024 manoeuvre state at the closing transition; carried, never used as a gate. */
export type WalkingSegmentManeuver = VehicleState['maneuverState'];

/** A closed driving segment: what 069 would store after the same authority boundary. */
export interface WalkingSegmentClosed {
  readonly segmentId: string;
  readonly kind: WalkingSegmentKind;
  readonly vehicleId: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly closeReason: WalkingSegmentCloseReason;
  /** `INCOMPLETE` exists only in the 069 rule (`DATA_LOSS`); this contract never emits it. */
  readonly completeness: 'CLOSED' | 'INCOMPLETE';
  readonly learningEligible: boolean;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly playerId: string;
  readonly profileId: string;
  readonly baseVersionId: string;
  readonly learningEpoch: number;
  /** The 024 manoeuvre at the exit; `IDLE`/absent means no manoeuvre was interrupted. */
  readonly maneuverState: WalkingSegmentManeuver | null;
  /** The interrupted manoeuvre, or null when the exit was not in the middle of one. */
  readonly truncatedManeuver: WalkingSegmentManeuver | null;
}

/**
 * The inputs of the real 069 intake gate for one closed segment, as pure data. It is **not** the
 * 069 descriptor: the descriptor adds 069's own record-bytes accounting and operation id, which
 * belong to the telemetry owner. `wouldOpenIntake` is the exact decision, `gate` names the rule.
 */
export interface WalkingSegmentEstimatorCandidate {
  readonly version: typeof WALKING_SEGMENT_CANDIDATE_VERSION;
  readonly gate: '069-CLOSED-LEARNING-ELIGIBLE';
  readonly wouldOpenIntake: true;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly segmentId: string;
  readonly vehicleId: string;
  readonly controlMode: 'LEARNING';
  readonly learningEligible: true;
  readonly completeness: 'CLOSED';
  readonly closeReason: WalkingSegmentCloseReason;
  readonly startTick: number;
  readonly endTick: number;
  readonly playerId: string;
  readonly profileId: string;
  readonly baseVersionId: string;
  readonly learningEpoch: number;
  /** Preserved so a consumer can see that a truncated manoeuvre did **not** change the gate. */
  readonly maneuverState: WalkingSegmentManeuver | null;
  readonly truncatedManeuver: WalkingSegmentManeuver | null;
}

export interface WalkingSegmentsCounters {
  /** Walking steps that produced no segment and no candidate. */
  readonly walkingTicks: number;
  readonly walkingDistanceM: number;
  /** Every command the model received: WALK plus the three authority transitions. */
  readonly commands: number;
  readonly transitions: number;
  readonly entries: number;
  readonly exits: number;
  readonly vehicleSwitches: number;
  readonly focus: number;
  readonly closedSegments: number;
  readonly closedManual: number;
  readonly closedLearning: number;
  readonly candidates: number;
}

/** Frozen, JSON-serialisable state for PBI 200; `parseWalkingSegmentsState` is its inverse. */
export interface WalkingSegmentsState {
  readonly version: typeof WALKING_SEGMENTS_CONTRACT_VERSION;
  readonly tick: number;
  readonly ownerId: string;
  readonly characterId: string;
  readonly target: WalkingSegmentsTarget;
  readonly open: WalkingSegmentOpen | null;
  readonly lastClosed: WalkingSegmentClosed | null;
  readonly counters: WalkingSegmentsCounters;
  readonly nextSegmentSequence: number;
}

export interface WalkingSegmentsOptions {
  readonly ownerId: string;
  readonly characterId: string;
  readonly target: WalkingSegmentsTarget;
  /** A state produced by `snapshot()`; the strict parser validates it before resuming. */
  readonly resume?: unknown;
}

export interface WalkingSegmentsWalkResult {
  readonly transition: 'WALK';
  readonly tick: number;
  readonly authority: InputAuthority;
  readonly closed: null;
  readonly opened: null;
  readonly candidates: readonly [];
  readonly focus: null;
  readonly walking: Readonly<{ distanceM: number; totalDistanceM: number; ticks: number }>;
  readonly state: WalkingSegmentsState;
}

export interface WalkingSegmentsTransitionResult {
  readonly transition: 'ENTER' | 'EXIT' | 'FOCUS';
  readonly tick: number;
  readonly authority: InputAuthority;
  readonly closed: WalkingSegmentClosed | null;
  readonly opened: WalkingSegmentOpen | null;
  readonly candidates: readonly WalkingSegmentEstimatorCandidate[];
  readonly focus: Readonly<{ vehicleId: string; authorityUnchanged: true }> | null;
  readonly walking: null;
  readonly state: WalkingSegmentsState;
}

export type WalkingSegmentsStepResult = WalkingSegmentsWalkResult | WalkingSegmentsTransitionResult;

export interface WalkingSegmentsStepRequest {
  readonly tick: number;
  readonly transition: WalkingSegmentTransition;
  /** The 193 authority after the delivered transition; validated against the open segment. */
  readonly authority: InputAuthority;
  /** Walking only: the real planar displacement of the body this tick, in metres. */
  readonly distanceM?: number;
  /** ENTER only: the delivered 195/197 transition authority before the command. */
  readonly previousAuthority?: InputAuthority;
  /** ENTER/FOCUS only: the car the command names. */
  readonly vehicleId?: string;
  /** ENTER only: the explicit 067/UI choice; absent means exactly the 195 entry mode. */
  readonly mode?: WalkingSegmentKind;
  /** ENTER/EXIT only: the real 024 manoeuvre state at the transition tick. */
  readonly maneuverState?: WalkingSegmentManeuver | null;
}

export interface WalkingSegmentsStats {
  readonly version: typeof WALKING_SEGMENTS_CONTRACT_VERSION;
  readonly tick: number;
  readonly walking: boolean;
  readonly openSegmentId: string | null;
  readonly lastClosedSegmentId: string | null;
  readonly counters: WalkingSegmentsCounters;
}

export interface WalkingSegments {
  readonly version: typeof WALKING_SEGMENTS_CONTRACT_VERSION;
  step(request: WalkingSegmentsStepRequest): WalkingSegmentsStepResult;
  getStats(): WalkingSegmentsStats;
  snapshot(): WalkingSegmentsState;
  dispose(): void;
}

const MANEUVER_STATES: readonly WalkingSegmentManeuver[] = Object.freeze([
  'IDLE',
  'FOLLOWING',
  'STOPPING',
  'TURNING',
  'LANE_CHANGING',
  'RECOVERING',
]);
const AUTHORITY_CONSUMERS = Object.freeze(['CHARACTER', 'VEHICLE'] as const);
const COUNTER_KEYS = Object.freeze([
  'walkingTicks',
  'walkingDistanceM',
  'commands',
  'transitions',
  'entries',
  'exits',
  'vehicleSwitches',
  'focus',
  'closedSegments',
  'closedManual',
  'closedLearning',
  'candidates',
] as const satisfies readonly (keyof WalkingSegmentsCounters)[]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function fail(code: WalkingSegmentsErrorCode, detail: string): never {
  throw new WalkingSegmentsError(code, detail);
}

function text(value: unknown, label: string, code: WalkingSegmentsErrorCode): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    fail(code, `${label} must be a non-empty string`);
  return value;
}

function count(value: unknown, label: string, code: WalkingSegmentsErrorCode): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail(code, `${label} must be a safe non-negative integer`);
  return value;
}

function amount(value: unknown, label: string, code: WalkingSegmentsErrorCode): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    fail(code, `${label} must be a finite non-negative number`);
  return value;
}

function memberOf<T extends string>(
  value: unknown,
  admitted: readonly T[],
  label: string,
  code: WalkingSegmentsErrorCode,
): T {
  if (typeof value !== 'string' || !(admitted as readonly string[]).includes(value))
    fail(code, `${label} must be one of ${admitted.join(', ')}`);
  return value as T;
}

function readAuthority(value: unknown, label: string): InputAuthority {
  if (!isRecord(value)) fail('INVALID_SEGMENT_AUTHORITY', `${label} must be a plain object`);
  const consumer = memberOf(
    value.consumer,
    AUTHORITY_CONSUMERS,
    `${label}.consumer`,
    'INVALID_SEGMENT_AUTHORITY',
  );
  if (consumer === 'CHARACTER')
    return Object.freeze({
      consumer: 'CHARACTER' as const,
      characterId: text(value.characterId, `${label}.characterId`, 'INVALID_SEGMENT_AUTHORITY'),
    });
  return Object.freeze({
    consumer: 'VEHICLE' as const,
    vehicleId: text(value.vehicleId, `${label}.vehicleId`, 'INVALID_SEGMENT_AUTHORITY'),
  });
}

function authorityEntityId(authority: InputAuthority): string {
  return authority.consumer === 'CHARACTER' ? authority.characterId : authority.vehicleId;
}

function sameAuthority(left: InputAuthority, right: InputAuthority): boolean {
  return left.consumer === right.consumer && authorityEntityId(left) === authorityEntityId(right);
}

function authorityOf(authority: InputAuthority): string {
  return `${authority.consumer}:${authorityEntityId(authority)}`;
}

function characterAuthority(characterId: string): InputAuthority {
  return Object.freeze({ consumer: 'CHARACTER' as const, characterId });
}

function vehicleAuthority(vehicleId: string): InputAuthority {
  return Object.freeze({ consumer: 'VEHICLE' as const, vehicleId });
}

function readManeuver(
  value: unknown,
  code: WalkingSegmentsErrorCode = 'INVALID_SEGMENT_INPUT',
): WalkingSegmentManeuver | null {
  if (value === null || value === undefined) return null;
  return memberOf(value, MANEUVER_STATES, 'maneuverState', code);
}

function truncatedManeuverOf(
  maneuver: WalkingSegmentManeuver | null,
): WalkingSegmentManeuver | null {
  return maneuver === null || maneuver === 'IDLE' ? null : maneuver;
}

function readTarget(value: unknown, code: WalkingSegmentsErrorCode): WalkingSegmentsTarget {
  if (!isRecord(value)) fail(code, 'target must be a plain object');
  return Object.freeze({
    sessionId: text(value.sessionId, 'target.sessionId', code),
    worldEpoch: count(value.worldEpoch, 'target.worldEpoch', code),
    playerId: text(value.playerId, 'target.playerId', code),
    profileId: text(value.profileId, 'target.profileId', code),
    baseVersionId: text(value.baseVersionId, 'target.baseVersionId', code),
    learningEpoch: count(value.learningEpoch, 'target.learningEpoch', code),
    learningEligible: readFlag(value.learningEligible, 'target.learningEligible', code),
  });
}

function readFlag(value: unknown, label: string, code: WalkingSegmentsErrorCode): boolean {
  if (typeof value !== 'boolean') fail(code, `${label} must be a boolean`);
  return value;
}

function readCounters(value: unknown): WalkingSegmentsCounters {
  if (!isRecord(value)) fail('INVALID_SEGMENT_STATE', 'counters must be a plain object');
  const counters = {} as Record<keyof WalkingSegmentsCounters, number>;
  for (const key of COUNTER_KEYS)
    counters[key] =
      key === 'walkingDistanceM'
        ? amount(value[key], `counters.${key}`, 'INVALID_SEGMENT_STATE')
        : count(value[key], `counters.${key}`, 'INVALID_SEGMENT_STATE');
  const typed = counters as WalkingSegmentsCounters;
  if (typed.closedSegments !== typed.closedManual + typed.closedLearning)
    fail('INVALID_SEGMENT_STATE', 'closedSegments must equal closedManual + closedLearning');
  if (typed.candidates > typed.closedLearning)
    fail('INVALID_SEGMENT_STATE', 'candidates cannot exceed the closed LEARNING segments');
  if (typed.entries < typed.exits + typed.vehicleSwitches)
    fail('INVALID_SEGMENT_STATE', 'entries must cover every exit and every switch');
  if (typed.transitions !== typed.entries + typed.exits + typed.focus)
    fail('INVALID_SEGMENT_STATE', 'transitions must equal entries + exits + focus');
  if (typed.commands !== typed.walkingTicks + typed.transitions)
    fail('INVALID_SEGMENT_STATE', 'commands must equal walkingTicks + transitions');
  return Object.freeze(typed);
}

function readOpenSegment(value: unknown, tick: number): WalkingSegmentOpen | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) fail('INVALID_SEGMENT_STATE', 'open must be a plain object or null');
  const kind = memberOf(value.kind, WALKING_SEGMENT_KINDS, 'open.kind', 'INVALID_SEGMENT_STATE');
  const learningEligible = readFlag(
    value.learningEligible,
    'open.learningEligible',
    'INVALID_SEGMENT_STATE',
  );
  if (learningEligible && kind !== 'LEARNING')
    fail('INVALID_SEGMENT_STATE', 'only a LEARNING segment can be learning-eligible');
  const startTick = count(value.startTick, 'open.startTick', 'INVALID_SEGMENT_STATE');
  if (startTick > tick) fail('INVALID_SEGMENT_STATE', 'the open segment starts in the future');
  return Object.freeze({
    segmentId: text(value.segmentId, 'open.segmentId', 'INVALID_SEGMENT_STATE'),
    kind,
    vehicleId: text(value.vehicleId, 'open.vehicleId', 'INVALID_SEGMENT_STATE'),
    startTick,
    learningEligible,
  });
}

function readClosedSegment(value: unknown, tick: number): WalkingSegmentClosed | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) fail('INVALID_SEGMENT_STATE', 'lastClosed must be a plain object or null');
  const code = 'INVALID_SEGMENT_STATE' as const;
  const kind = memberOf(value.kind, WALKING_SEGMENT_KINDS, 'lastClosed.kind', code);
  const learningEligible = readFlag(value.learningEligible, 'lastClosed.learningEligible', code);
  if (learningEligible && kind !== 'LEARNING')
    fail(code, 'only a LEARNING segment can be learning-eligible');
  const startTick = count(value.startTick, 'lastClosed.startTick', code);
  const endTick = count(value.endTick, 'lastClosed.endTick', code);
  if (endTick < startTick || endTick > tick)
    fail(code, 'the closed segment ticks are not inside the accepted timeline');
  return Object.freeze({
    segmentId: text(value.segmentId, 'lastClosed.segmentId', code),
    kind,
    vehicleId: text(value.vehicleId, 'lastClosed.vehicleId', code),
    startTick,
    endTick,
    closeReason: memberOf(
      value.closeReason,
      WALKING_SEGMENT_CLOSE_REASONS,
      'lastClosed.closeReason',
      code,
    ),
    completeness: memberOf(
      value.completeness,
      ['CLOSED', 'INCOMPLETE'],
      'lastClosed.completeness',
      code,
    ),
    learningEligible,
    sessionId: text(value.sessionId, 'lastClosed.sessionId', code),
    worldEpoch: count(value.worldEpoch, 'lastClosed.worldEpoch', code),
    playerId: text(value.playerId, 'lastClosed.playerId', code),
    profileId: text(value.profileId, 'lastClosed.profileId', code),
    baseVersionId: text(value.baseVersionId, 'lastClosed.baseVersionId', code),
    learningEpoch: count(value.learningEpoch, 'lastClosed.learningEpoch', code),
    maneuverState: readManeuver(value.maneuverState, code),
    truncatedManeuver: readManeuver(value.truncatedManeuver, code),
  });
}

const emptyCounters = (): WalkingSegmentsCounters =>
  Object.freeze({
    walkingTicks: 0,
    walkingDistanceM: 0,
    commands: 0,
    transitions: 0,
    entries: 0,
    exits: 0,
    vehicleSwitches: 0,
    focus: 0,
    closedSegments: 0,
    closedManual: 0,
    closedLearning: 0,
    candidates: 0,
  });

/**
 * The real PBI 069 intake gate, as a pure function. It is the exact conjunction from
 * `intervention-lifecycle.ts`: the frozen mode must be LEARNING, the frozen eligibility must be
 * true, the record must be CLOSED and the world/player/profile/epoch/base-version identity must
 * still match the target. `target.learningEligible` is deliberately **not** read here: 069 froze the
 * segment's eligibility when it opened, so a later target change cannot retroactively disqualify it.
 */
export function estimatorCandidate(
  segment: WalkingSegmentClosed,
  target: WalkingSegmentsTarget,
): WalkingSegmentEstimatorCandidate | null {
  if (segment.kind !== 'LEARNING') return null;
  if (!segment.learningEligible) return null;
  if (segment.completeness !== 'CLOSED') return null;
  if (segment.sessionId !== target.sessionId || segment.worldEpoch !== target.worldEpoch)
    return null;
  if (segment.playerId !== target.playerId) return null;
  if (segment.profileId !== target.profileId) return null;
  if (segment.learningEpoch !== target.learningEpoch) return null;
  if (segment.baseVersionId !== target.baseVersionId) return null;
  return Object.freeze({
    version: WALKING_SEGMENT_CANDIDATE_VERSION,
    gate: '069-CLOSED-LEARNING-ELIGIBLE' as const,
    wouldOpenIntake: true as const,
    sessionId: segment.sessionId,
    worldEpoch: segment.worldEpoch,
    segmentId: segment.segmentId,
    vehicleId: segment.vehicleId,
    controlMode: 'LEARNING' as const,
    learningEligible: true as const,
    completeness: 'CLOSED' as const,
    closeReason: segment.closeReason,
    startTick: segment.startTick,
    endTick: segment.endTick,
    playerId: segment.playerId,
    profileId: segment.profileId,
    baseVersionId: segment.baseVersionId,
    learningEpoch: segment.learningEpoch,
    maneuverState: segment.maneuverState,
    truncatedManeuver: segment.truncatedManeuver,
  });
}

function readStateDocument(value: unknown): Readonly<{
  tick: number;
  ownerId: string;
  characterId: string;
  target: WalkingSegmentsTarget;
  open: WalkingSegmentOpen | null;
  lastClosed: WalkingSegmentClosed | null;
  counters: WalkingSegmentsCounters;
  nextSegmentSequence: number;
}> {
  const code = 'INVALID_SEGMENT_STATE' as const;
  if (!isRecord(value)) fail(code, 'walking segments state must be a plain object');
  if (value.version !== WALKING_SEGMENTS_CONTRACT_VERSION)
    fail(code, 'unsupported walking segments state version');
  const tick = count(value.tick, 'state.tick', code);
  const target = readTarget(value.target, code);
  const open = readOpenSegment(value.open, tick);
  const lastClosed = readClosedSegment(value.lastClosed, tick);
  const counters = readCounters(value.counters);
  const nextSegmentSequence = count(value.nextSegmentSequence, 'state.nextSegmentSequence', code);
  const openedEver = counters.closedSegments + (open === null ? 0 : 1);
  if (nextSegmentSequence < openedEver)
    fail(code, 'nextSegmentSequence must cover every segment ever opened');
  if (lastClosed !== null && lastClosed.sessionId !== target.sessionId)
    fail(code, 'the last closed segment belongs to another session');
  return Object.freeze({
    tick,
    ownerId: text(value.ownerId, 'state.ownerId', code),
    characterId: text(value.characterId, 'state.characterId', code),
    target,
    open,
    lastClosed,
    counters,
    nextSegmentSequence,
  });
}

/** The strict inverse of `snapshot()`, used by PBI 200 on load. */
export function parseWalkingSegmentsState(value: unknown): WalkingSegmentsState {
  const state = readStateDocument(value);
  return Object.freeze({
    version: WALKING_SEGMENTS_CONTRACT_VERSION,
    tick: state.tick,
    ownerId: state.ownerId,
    characterId: state.characterId,
    target: state.target,
    open: state.open,
    lastClosed: state.lastClosed,
    counters: state.counters,
    nextSegmentSequence: state.nextSegmentSequence,
  });
}

export function createWalkingSegments(options: WalkingSegmentsOptions): WalkingSegments {
  if (!isRecord(options)) fail('INVALID_SEGMENT_INPUT', 'options are required');
  const ownerId = text(options.ownerId, 'ownerId', 'INVALID_SEGMENT_INPUT');
  const characterId = text(options.characterId, 'characterId', 'INVALID_SEGMENT_INPUT');
  const target = readTarget(options.target, 'INVALID_SEGMENT_INPUT');
  const resumed =
    options.resume === undefined || options.resume === null
      ? null
      : readStateDocument(options.resume);
  if (resumed !== null) {
    if (resumed.ownerId !== ownerId || resumed.characterId !== characterId)
      fail('INVALID_SEGMENT_STATE', 'the resumed state belongs to another owner or character');
    if (
      resumed.target.sessionId !== target.sessionId ||
      resumed.target.worldEpoch !== target.worldEpoch ||
      resumed.target.playerId !== target.playerId ||
      resumed.target.profileId !== target.profileId ||
      resumed.target.baseVersionId !== target.baseVersionId ||
      resumed.target.learningEpoch !== target.learningEpoch ||
      resumed.target.learningEligible !== target.learningEligible
    )
      fail('INVALID_SEGMENT_STATE', 'the resumed state belongs to another target');
  }
  let tick = resumed?.tick ?? 0;
  let sequence = resumed?.nextSegmentSequence ?? 0;
  let open: WalkingSegmentOpen | null = resumed?.open ?? null;
  let lastClosed: WalkingSegmentClosed | null = resumed?.lastClosed ?? null;
  let counters: WalkingSegmentsCounters = resumed?.counters ?? emptyCounters();
  let disposed = false;

  const alive = () => fail('INVALID_SEGMENT_STATE', 'walking segments model is disposed');

  const snapshot = (): WalkingSegmentsState =>
    Object.freeze({
      version: WALKING_SEGMENTS_CONTRACT_VERSION,
      tick,
      ownerId,
      characterId,
      target,
      open,
      lastClosed,
      counters,
      nextSegmentSequence: sequence,
    });

  function closeOpen(
    endTick: number,
    closeReason: WalkingSegmentCloseReason,
    maneuverState: WalkingSegmentManeuver | null,
  ): WalkingSegmentClosed {
    if (open === null) fail('INVALID_SEGMENT_TRANSITION', 'there is no open segment to close');
    const segment = open;
    const closed: WalkingSegmentClosed = Object.freeze({
      segmentId: segment.segmentId,
      kind: segment.kind,
      vehicleId: segment.vehicleId,
      startTick: segment.startTick,
      endTick,
      closeReason,
      completeness: 'CLOSED' as const,
      learningEligible: segment.learningEligible,
      sessionId: target.sessionId,
      worldEpoch: target.worldEpoch,
      playerId: target.playerId,
      profileId: target.profileId,
      baseVersionId: target.baseVersionId,
      learningEpoch: target.learningEpoch,
      maneuverState,
      truncatedManeuver: truncatedManeuverOf(maneuverState),
    });
    open = null;
    lastClosed = closed;
    counters = Object.freeze({
      ...counters,
      closedSegments: counters.closedSegments + 1,
      closedManual: counters.closedManual + (closed.kind === 'MANUAL' ? 1 : 0),
      closedLearning: counters.closedLearning + (closed.kind === 'LEARNING' ? 1 : 0),
      candidates: counters.candidates + (estimatorCandidate(closed, target) === null ? 0 : 1),
    });
    return closed;
  }

  function openSegment(
    vehicleId: string,
    kind: WalkingSegmentKind,
    startTick: number,
  ): WalkingSegmentOpen {
    sequence += 1;
    const segment: WalkingSegmentOpen = Object.freeze({
      segmentId: `${ownerId}:segment:${sequence}`,
      kind,
      vehicleId,
      startTick,
      learningEligible: kind === 'LEARNING' && target.learningEligible,
    });
    open = segment;
    return segment;
  }

  function requireCurrentAuthority(authority: InputAuthority): void {
    const expected =
      open === null ? characterAuthority(characterId) : vehicleAuthority(open.vehicleId);
    if (!sameAuthority(authority, expected))
      fail(
        'INVALID_SEGMENT_AUTHORITY',
        `the 193 authority is ${authorityOf(authority)}, but the open state is ${authorityOf(expected)}`,
      );
    if (open === null && authority.consumer !== 'CHARACTER')
      fail('INVALID_SEGMENT_AUTHORITY', 'a walking body cannot hold a vehicle authority');
  }

  function result(
    transition: WalkingSegmentTransition,
    authority: InputAuthority,
    closed: WalkingSegmentClosed | null,
    opened: WalkingSegmentOpen | null,
    focus: Readonly<{ vehicleId: string; authorityUnchanged: true }> | null,
    walking: Readonly<{ distanceM: number; totalDistanceM: number; ticks: number }> | null,
  ): WalkingSegmentsStepResult {
    const candidates =
      closed === null
        ? []
        : [estimatorCandidate(closed, target)].filter(
            (candidate): candidate is WalkingSegmentEstimatorCandidate => candidate !== null,
          );
    const base = {
      tick,
      authority,
      closed,
      opened,
      candidates: Object.freeze(candidates),
      focus,
      walking,
      state: snapshot(),
    };
    if (transition === 'WALK') {
      if (closed !== null || opened !== null || focus !== null || walking === null)
        fail('INVALID_SEGMENT_STATE', 'a walking step cannot produce a segment');
      return Object.freeze({
        ...base,
        transition: 'WALK' as const,
        closed: null,
        opened: null,
        candidates: Object.freeze([]) as readonly [],
        focus: null,
        walking,
      });
    }
    return Object.freeze({
      ...base,
      transition,
      closed,
      opened,
      walking: null,
    }) as WalkingSegmentsTransitionResult;
  }

  return Object.freeze({
    version: WALKING_SEGMENTS_CONTRACT_VERSION,
    step(request: WalkingSegmentsStepRequest): WalkingSegmentsStepResult {
      if (disposed) alive();
      if (!isRecord(request)) fail('INVALID_SEGMENT_INPUT', 'a step request is required');
      const transition = memberOf(
        request.transition,
        WALKING_SEGMENT_TRANSITIONS,
        'transition',
        'INVALID_SEGMENT_TRANSITION',
      );
      const stepTick = count(request.tick, 'tick', 'INVALID_SEGMENT_TICK');
      if (stepTick !== tick + 1)
        fail('INVALID_SEGMENT_TICK', `tick ${stepTick} is not the next fixed tick ${tick + 1}`);
      const authority = readAuthority(request.authority, 'authority');

      if (transition === 'WALK') {
        if (request.vehicleId !== undefined || request.mode !== undefined)
          fail('INVALID_SEGMENT_TRANSITION', 'a WALK step carries no vehicle and no mode');
        requireCurrentAuthority(authority);
        const distanceM = amount(request.distanceM, 'distanceM', 'INVALID_SEGMENT_INPUT');
        tick = stepTick;
        counters = Object.freeze({
          ...counters,
          walkingTicks: counters.walkingTicks + 1,
          walkingDistanceM: counters.walkingDistanceM + distanceM,
          commands: counters.commands + 1,
        });
        return result('WALK', authority, null, null, null, {
          distanceM,
          totalDistanceM: counters.walkingDistanceM,
          ticks: counters.walkingTicks,
        }) as WalkingSegmentsWalkResult;
      }

      if (transition === 'FOCUS') {
        requireCurrentAuthority(authority);
        const vehicleId = text(request.vehicleId, 'vehicleId', 'INVALID_SEGMENT_INPUT');
        if (vehicleId === characterId)
          fail('INVALID_SEGMENT_TRANSITION', 'a character cannot be the FOCUS vehicle');
        tick = stepTick;
        counters = Object.freeze({
          ...counters,
          focus: counters.focus + 1,
          transitions: counters.transitions + 1,
          commands: counters.commands + 1,
        });
        return result(
          'FOCUS',
          authority,
          null,
          null,
          Object.freeze({ vehicleId, authorityUnchanged: true as const }),
          null,
        ) as WalkingSegmentsTransitionResult;
      }

      if (transition === 'ENTER') {
        const vehicleId = text(request.vehicleId, 'vehicleId', 'INVALID_SEGMENT_INPUT');
        if (authority.consumer !== 'VEHICLE' || authority.vehicleId !== vehicleId)
          fail(
            'INVALID_SEGMENT_AUTHORITY',
            `an accepted entry must carry VEHICLE:${vehicleId}, not ${authorityOf(authority)}`,
          );
        if (request.previousAuthority === undefined)
          fail('INVALID_SEGMENT_INPUT', 'an ENTER step needs the delivered previous authority');
        const previous = readAuthority(request.previousAuthority, 'previousAuthority');
        requireCurrentAuthority(previous);
        if (open !== null && open.vehicleId === vehicleId)
          fail('INVALID_SEGMENT_TRANSITION', `the player seat already holds ${vehicleId}`);
        const mode =
          request.mode === undefined
            ? WALKING_SEGMENTS_POLICY.defaultEntryMode
            : memberOf(request.mode, WALKING_SEGMENT_KINDS, 'mode', 'INVALID_SEGMENT_INPUT');
        const switched = open !== null;
        tick = stepTick;
        const closed = switched
          ? closeOpen(stepTick, 'VEHICLE_SWITCH', readManeuver(request.maneuverState))
          : null;
        const opened = openSegment(vehicleId, mode, stepTick);
        counters = Object.freeze({
          ...counters,
          entries: counters.entries + 1,
          vehicleSwitches: counters.vehicleSwitches + (switched ? 1 : 0),
          transitions: counters.transitions + 1,
          commands: counters.commands + 1,
        });
        return result(
          'ENTER',
          authority,
          closed,
          opened,
          null,
          null,
        ) as WalkingSegmentsTransitionResult;
      }

      const previous =
        request.previousAuthority === undefined
          ? null
          : readAuthority(request.previousAuthority, 'previousAuthority');
      if (previous === null || previous.consumer !== 'VEHICLE')
        fail('INVALID_SEGMENT_INPUT', 'an EXIT step needs the delivered vehicle authority');
      if (open === null) fail('INVALID_SEGMENT_TRANSITION', 'there is no vehicle segment to close');
      if (authority.consumer !== 'CHARACTER' || authority.characterId !== characterId)
        fail(
          'INVALID_SEGMENT_AUTHORITY',
          `an accepted exit must carry CHARACTER:${characterId}, not ${authorityOf(authority)}`,
        );
      if (previous.vehicleId !== open.vehicleId)
        fail(
          'INVALID_SEGMENT_AUTHORITY',
          `the exit releases ${previous.vehicleId}, but the open segment is ${open.vehicleId}`,
        );
      tick = stepTick;
      const closed = closeOpen(stepTick, 'RETURN_TO_AUTO', readManeuver(request.maneuverState));
      counters = Object.freeze({
        ...counters,
        exits: counters.exits + 1,
        transitions: counters.transitions + 1,
        commands: counters.commands + 1,
      });
      return result('EXIT', authority, closed, null, null, null) as WalkingSegmentsTransitionResult;
    },
    getStats: () =>
      Object.freeze({
        version: WALKING_SEGMENTS_CONTRACT_VERSION,
        tick,
        walking: open === null,
        openSegmentId: open?.segmentId ?? null,
        lastClosedSegmentId: lastClosed?.segmentId ?? null,
        counters,
      }),
    snapshot,
    dispose() {
      disposed = true;
    },
  });
}
