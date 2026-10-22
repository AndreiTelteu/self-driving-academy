import { choice, fields, number, record, requireContract, tick } from '../sessions';
import type { LaneGraph } from '../world';
import type { Vector3 } from '../vehicles';
import type { BehaviorActor, BehaviorFacts, BehaviorScope } from './behavior-fsm';
import { parseBehaviorFacts } from './behavior-fsm';
import { evaluateAuthorityReentry } from './blocked-recovery';
import type {
  AuthorityReentryAction,
  AuthorityReentryObservation,
  AuthorityReentryReason,
  BlockedRecoveryRequest,
} from './blocked-recovery';

/**
 * 071 takeover/return continuity contract.
 *
 * It is the continuity layer **on top of** 054, never a second copy of it. The re-entry decision is
 * 054's `evaluateAuthorityReentry` and this module re-exposes it verbatim in `reentry`/`reentryReason`
 * — it does not re-derive a lane, a route or a recovery target. What 071 adds is the ownership the
 * dependencies deliberately leave out:
 *
 * - **Physical continuity.** It measures the authoritative pose/velocity/angular/drivetrain/damage
 *   channels across one handover step, bounds each channel with the reported physical scalars
 *   (`speed·dt`, `|yawRate|·dt`, `a·dt`), and reports every excess explicitly. It never writes,
 *   clamps, repairs or re-initialises a body: there is no pose/transform/velocity setter and the
 *   decision carries `teleportsVehicle: false`.
 * - **Command continuity.** It measures the step between the last MANUAL/LEARNING effective command
 *   and the first AUTONOMY target against the documented `maximumCommandStepPerTick` jerk bound and
 *   reports the excess; it never silently rate-limits or rewrites the command (024 is the arbiter).
 * - **Frozen outcome.** It raises the 045 BLOCKED fact (`routeBlocked`) exactly when 054 reports that
 *   no feasible in-graph re-entry exists, so the reason set of 045 and the decision vocabulary of 054
 *   are reused and not duplicated.
 *
 * Physical handover stays owned by 024/066/069 (no teleport), the physical placement by 030 and the
 * drive back to the lane by 046–049/024. This module only observes and reports.
 */
export const TAKEOVER_CONTINUITY_LIMITS = Object.freeze({
  version: '071-takeover-continuity-v1' as const,
  observationVersion: '054-progress-observation-v1' as const,
  actors: 110,
  identityCodeUnits: 256,
  tickHz: 60,
  dtSeconds: 1 / 60,
  /** Absolute ceiling accepted for the reported authoritative speed (SI, m/s). */
  maximumSpeedMps: 100,
  /** Slack added to the derived pose/heading/velocity bounds for float noise only. */
  positionEpsilonM: 1e-3,
  headingEpsilonRad: 1e-3,
  velocityEpsilonMps: 1e-3,
  yawRateEpsilonRadps: 1e-3,
  /** Documented ceiling on the physical translational acceleration of one authoritative step. */
  maximumHandoverAccelerationMps2: 12,
  /** Documented ceiling on the physical angular acceleration of one authoritative step. */
  maximumHandoverAngularAccelerationRadps2: 12,
  maximumYawRateRadps: 12,
  /** Documented command/target continuity bound: largest absolute channel step accepted per handover. */
  maximumCommandStepPerTick: 0.5,
  /** The module retains no actor, handover or decision history. */
  retainedHistory: 0,
});

/** 069 segment close reasons that a MANUAL/LEARNING→next-mode boundary can carry. */
const TAKEOVER_SEGMENT_CLOSE_REASONS = Object.freeze(['RETURN_TO_AUTO', 'MODE_CHANGE'] as const);

/** The 071 continuity verdict. The distinguishable re-entry cause lives in `reentryReason` (054). */
export type TakeoverContinuityReason =
  'STATE_PRESERVED' | 'STATE_CONTINUITY_VIOLATION' | 'REENTRY_ABSTAINED';

export type TakeoverContinuityViolation =
  | 'POSITION_STEP'
  | 'HEADING_STEP'
  | 'VELOCITY_STEP'
  | 'YAW_RATE_STEP'
  | 'DRIVETRAIN_CHANGE'
  | 'DAMAGE_CHANGE';

export type TakeoverCommandContinuity = 'WITHIN_BOUND' | 'EXCEEDS_BOUND' | 'UNKNOWN';

/** Authoritative physical state of the subject at one tick; read-only, never written by this module. */
export interface TakeoverPhysicalState {
  /** Authoritative tick the sample belongs to. */
  readonly tick: number;
  /** Authoritative world pose, read-only. */
  readonly positionM: Vector3;
  readonly headingRad: number;
  /** Authoritative world-frame linear velocity, read-only. */
  readonly velocityMps: Vector3;
  readonly yawRateRadps: number;
  /** Authoritative 027 drivetrain direction; a handover may not shift it. */
  readonly drivetrainDirection: 'NONE' | 'FORWARD' | 'REVERSE';
  /** Authoritative 029 accumulated damage in [0,1]; a handover may not repair it. */
  readonly damage: number;
}

/** Effective command of one source at the handover, in the 024 channel space. */
export interface TakeoverCommand {
  readonly source: 'PLAYER' | 'AUTONOMY';
  readonly throttle: number;
  readonly brake: number;
  readonly steering: number;
  readonly handbrake: boolean;
}

export interface TakeoverContinuityInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  /** Tick of the first AUTONOMY command, i.e. the handover tick. */
  readonly decisionTick: number;
  /** Authority under which `decisionTick` ran: only AUTO seeks a re-entry. */
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  /** Mode of the segment this transition closes, or null when no MANUAL/LEARNING segment was open. */
  readonly closedMode: 'MANUAL' | 'LEARNING' | null;
  /** Caller-reported real 028 collision on the handover step; a physical impulse, never a re-init. */
  readonly collisionObserved: boolean;
  /** Real 033 lane graph; null reports MISSING/LOST graph instead of inventing lanes. */
  readonly graph: LaneGraph | null;
  /** Authoritative state at the last MANUAL/LEARNING tick (`decisionTick - 1`). */
  readonly before: TakeoverPhysicalState;
  /** Authoritative state at the handover tick. */
  readonly after: TakeoverPhysicalState;
  readonly lastManualCommand: TakeoverCommand | null;
  readonly firstAutonomyCommand: TakeoverCommand | null;
  readonly observation: AuthorityReentryObservation | null;
}

export interface TakeoverContinuityMeasured {
  readonly positionM: number;
  readonly headingRad: number;
  readonly velocityMps: number;
  readonly yawRateRadps: number;
}

export interface TakeoverContinuityBounds {
  readonly positionM: number;
  readonly headingRad: number;
  readonly velocityMps: number;
  readonly yawRateRadps: number;
}

export interface TakeoverContinuityDecision extends BehaviorScope {
  readonly version: '071-takeover-continuity-v1';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly closedMode: 'MANUAL' | 'LEARNING' | null;
  /** 069 close reason the caller must use for the closed segment; null when none was open. */
  readonly segmentCloseReason: 'RETURN_TO_AUTO' | 'MODE_CHANGE' | null;
  /** True when this module raised the 045 BLOCKED fact through `routeBlocked`. */
  readonly blocked: boolean;
  readonly reason: TakeoverContinuityReason;
  /** 054's enumerated cause, preserved verbatim; null only when 071 abstained before delegating. */
  readonly reentryReason: AuthorityReentryReason | null;
  readonly reentry: AuthorityReentryAction;
  readonly targetLaneId: string | null;
  readonly distanceToLaneM: number | null;
  readonly lateralOffsetM: number | null;
  readonly headingErrorRad: number | null;
  readonly recovery: BlockedRecoveryRequest | null;
  readonly collisionObserved: boolean;
  /** True when every authoritative channel was carried within its documented bound. */
  readonly statePreserved: boolean;
  /** Enumerated continuity violations; empty when nothing was violated. Never silently clamped. */
  readonly violations: readonly TakeoverContinuityViolation[];
  readonly measured: TakeoverContinuityMeasured;
  readonly bounds: TakeoverContinuityBounds;
  readonly drivetrainPreserved: boolean;
  readonly damagePreserved: boolean;
  readonly commandStep: number | null;
  readonly commandStepBound: number;
  readonly commandContinuity: TakeoverCommandContinuity;
  /** What the owner must do about an over-bound command step: this module reports, it never rewrites. */
  readonly commandHandling: 'NONE' | 'REPORTED';
  /** Literal contract assertion: no decision of this module carries or writes a pose/transform. */
  readonly teleportsVehicle: false;
  readonly retainedHistory: 0;
}

let evaluating = false;
export function getTakeoverContinuityStats() {
  return Object.freeze({
    evaluating,
    retainedActors: 0,
    retainedHandovers: 0,
    retainedHistory: 0,
  });
}

function identity(
  value: unknown,
  limit: number = TAKEOVER_CONTINUITY_LIMITS.identityCodeUnits,
): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= limit &&
      value.trim() === value,
    'Invalid takeover-continuity identity',
  );
  return value;
}

function actorOf(value: unknown): BehaviorActor {
  const data = fields(value, ['id', 'incarnation']);
  return Object.freeze({ id: identity(data.id), incarnation: tick(data.incarnation) });
}

function point(value: unknown): Vector3 {
  const data = fields(value, ['x', 'y', 'z']);
  return Object.freeze({
    x: number(data.x, -1e6, 1e6),
    y: number(data.y, -1e6, 1e6),
    z: number(data.z, -1e6, 1e6),
  });
}

function physicalStateOf(value: unknown): TakeoverPhysicalState {
  const data = fields(value, [
    'tick',
    'positionM',
    'headingRad',
    'velocityMps',
    'yawRateRadps',
    'drivetrainDirection',
    'damage',
  ]);
  return Object.freeze({
    tick: tick(data.tick),
    positionM: point(data.positionM),
    headingRad: number(data.headingRad, -Math.PI, Math.PI),
    velocityMps: point(data.velocityMps),
    yawRateRadps: number(
      data.yawRateRadps,
      -TAKEOVER_CONTINUITY_LIMITS.maximumYawRateRadps,
      TAKEOVER_CONTINUITY_LIMITS.maximumYawRateRadps,
    ),
    drivetrainDirection: choice(data.drivetrainDirection, ['NONE', 'FORWARD', 'REVERSE'] as const),
    damage: number(data.damage, 0, 1),
  });
}

function commandOf(value: unknown): TakeoverCommand {
  const data = fields(value, ['source', 'throttle', 'brake', 'steering', 'handbrake']);
  const handbrake = data.handbrake;
  requireContract(typeof handbrake === 'boolean', 'Takeover command handbrake flag');
  return Object.freeze({
    source: choice(data.source, ['PLAYER', 'AUTONOMY'] as const),
    throttle: number(data.throttle, 0, 1),
    brake: number(data.brake, 0, 1),
    steering: number(data.steering, -1, 1),
    handbrake,
  });
}

/** Wraps an angle difference into [-π, π] so a handover across the ±π seam is not a false step. */
function angleDelta(after: number, before: number): number {
  let delta = after - before;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}

function distanceM(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function speedMps(value: Vector3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function velocityDeltaMps(after: Vector3, before: Vector3): number {
  return Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
}

function segmentCloseReason(
  closedMode: 'MANUAL' | 'LEARNING' | null,
  authority: 'AUTO' | 'MANUAL' | 'LEARNING',
): 'RETURN_TO_AUTO' | 'MODE_CHANGE' | null {
  if (closedMode === null) return null;
  return authority === 'AUTO' ? 'RETURN_TO_AUTO' : 'MODE_CHANGE';
}

/** Documented ownership map, exposed as data so a reader cannot infer the split from prose alone. */
export const TAKEOVER_CONTINUITY_OWNERSHIP: Readonly<Record<string, string>> = Object.freeze({
  physicalHandover: '024 controller + 066 authority + 069 segment bridge (no teleport, no re-init)',
  reentryDecision: '054 evaluateAuthorityReentry (this module re-exposes it verbatim)',
  blockedState:
    '045 behavior FSM via BehaviorFacts.routeBlocked (this module only raises the fact)',
  physicalPlacement: '030 recovery, requested through the 054 REQUEST_RECOVERY descriptor',
  driveBackToLane: '046-049 lateral/longitudinal control actuated by 024',
  clock: '012 lifecycle + 008 fixed tick + 219 scheduling',
  suspension: '070 pause/focus owner',
  continuityMeasurement: '071 (this module: measures and reports, never writes)',
  disagreement:
    'the physical producer (021/024) stays authoritative; 071 reports STATE_CONTINUITY_VIOLATION and never repairs, clamps or blocks on its own',
});

function emptyDecision(
  scope: BehaviorScope,
  actor: BehaviorActor,
  decisionTick: number,
  authority: 'AUTO' | 'MANUAL' | 'LEARNING',
  closedMode: 'MANUAL' | 'LEARNING' | null,
  collisionObserved: boolean,
  measured: TakeoverContinuityMeasured,
  bounds: TakeoverContinuityBounds,
  drivetrainPreserved: boolean,
  damagePreserved: boolean,
  violations: readonly TakeoverContinuityViolation[],
  commandStep: number | null,
  extra: Partial<TakeoverContinuityDecision> = {},
): TakeoverContinuityDecision {
  return Object.freeze({
    version: TAKEOVER_CONTINUITY_LIMITS.version,
    sessionId: scope.sessionId,
    worldEpoch: scope.worldEpoch,
    actor,
    decisionTick,
    authority,
    closedMode,
    segmentCloseReason: segmentCloseReason(closedMode, authority),
    blocked: false,
    reason: violations.length === 0 ? ('STATE_PRESERVED' as const) : 'STATE_CONTINUITY_VIOLATION',
    reentryReason: null,
    reentry: 'UNKNOWN' as const,
    targetLaneId: null,
    distanceToLaneM: null,
    lateralOffsetM: null,
    headingErrorRad: null,
    recovery: null,
    collisionObserved,
    statePreserved: violations.length === 0,
    violations,
    measured,
    bounds,
    drivetrainPreserved,
    damagePreserved,
    commandStep,
    commandStepBound: TAKEOVER_CONTINUITY_LIMITS.maximumCommandStepPerTick,
    commandContinuity:
      commandStep === null
        ? ('UNKNOWN' as const)
        : commandStep <= TAKEOVER_CONTINUITY_LIMITS.maximumCommandStepPerTick
          ? ('WITHIN_BOUND' as const)
          : ('EXCEEDS_BOUND' as const),
    commandHandling:
      commandStep !== null && commandStep > TAKEOVER_CONTINUITY_LIMITS.maximumCommandStepPerTick
        ? ('REPORTED' as const)
        : ('NONE' as const),
    teleportsVehicle: false as const,
    retainedHistory: 0 as const,
    ...extra,
  });
}

function commandStepOf(
  after: TakeoverCommand | null,
  before: TakeoverCommand | null,
): number | null {
  if (after === null || before === null) return null;
  const handbrake = after.handbrake === before.handbrake ? 0 : 1;
  return Math.max(
    Math.abs(after.throttle - before.throttle),
    Math.abs(after.brake - before.brake),
    Math.abs(after.steering - before.steering),
    handbrake,
  );
}

/**
 * Pure continuity decision for one MANUAL/LEARNING→next-authority handover. Deterministic and
 * bounded: it delegates the re-entry to 054 and reports the physical/command continuity itself.
 */
export function evaluateTakeoverContinuity(
  input: TakeoverContinuityInput,
): TakeoverContinuityDecision {
  requireContract(!evaluating, 'Reentrant takeover-continuity evaluation');
  evaluating = true;
  try {
    const value = fields(input, [
        'sessionId',
        'worldEpoch',
        'actor',
        'decisionTick',
        'authority',
        'closedMode',
        'collisionObserved',
        'graph',
        'before',
        'after',
        'lastManualCommand',
        'firstAutonomyCommand',
        'observation',
      ]),
      scope = Object.freeze({
        sessionId: identity(value.sessionId),
        worldEpoch: tick(value.worldEpoch),
      }),
      actor = actorOf(value.actor),
      decisionTick = tick(value.decisionTick),
      authority = choice(value.authority, ['AUTO', 'MANUAL', 'LEARNING'] as const),
      closedMode =
        value.closedMode === null
          ? null
          : choice(value.closedMode, ['MANUAL', 'LEARNING'] as const),
      collisionObserved = value.collisionObserved;
    requireContract(typeof collisionObserved === 'boolean', 'Takeover continuity collision flag');
    const graph = value.graph === null ? null : (value.graph as LaneGraph);
    requireContract(
      graph === null ||
        (typeof graph.locateLane === 'function' && typeof graph.getLane === 'function'),
      'Takeover continuity needs the real 033 lane graph',
    );
    const before = physicalStateOf(value.before),
      after = physicalStateOf(value.after);
    // The handover spans exactly one authoritative step; anything else is a caller error, not a
    // continuity result, so it rejects instead of being reported as a fabricated clean handover.
    requireContract(
      after.tick === decisionTick && before.tick + 1 === after.tick,
      'Takeover continuity handover must span exactly one authoritative step',
    );
    const lastManualCommand =
        value.lastManualCommand === null ? null : commandOf(value.lastManualCommand),
      firstAutonomyCommand =
        value.firstAutonomyCommand === null ? null : commandOf(value.firstAutonomyCommand);

    const measured: TakeoverContinuityMeasured = Object.freeze({
        positionM: distanceM(after.positionM, before.positionM),
        headingRad: Math.abs(angleDelta(after.headingRad, before.headingRad)),
        velocityMps: velocityDeltaMps(after.velocityMps, before.velocityMps),
        yawRateRadps: Math.abs(after.yawRateRadps - before.yawRateRadps),
      }),
      // Derived from the authoritative physical truth of the step, so a legitimate one-tick advance
      // is never flagged; a reset/teleport (unchanged speed but a large pose jump, or a re-initialised
      // velocity) exceeds the same bound.
      bounds: TakeoverContinuityBounds = Object.freeze({
        positionM:
          Math.max(speedMps(before.velocityMps), speedMps(after.velocityMps)) *
            TAKEOVER_CONTINUITY_LIMITS.dtSeconds +
          TAKEOVER_CONTINUITY_LIMITS.positionEpsilonM,
        headingRad:
          Math.max(Math.abs(before.yawRateRadps), Math.abs(after.yawRateRadps)) *
            TAKEOVER_CONTINUITY_LIMITS.dtSeconds +
          TAKEOVER_CONTINUITY_LIMITS.headingEpsilonRad,
        velocityMps:
          TAKEOVER_CONTINUITY_LIMITS.maximumHandoverAccelerationMps2 *
            TAKEOVER_CONTINUITY_LIMITS.dtSeconds +
          TAKEOVER_CONTINUITY_LIMITS.velocityEpsilonMps,
        yawRateRadps:
          TAKEOVER_CONTINUITY_LIMITS.maximumHandoverAngularAccelerationRadps2 *
            TAKEOVER_CONTINUITY_LIMITS.dtSeconds +
          TAKEOVER_CONTINUITY_LIMITS.yawRateEpsilonRadps,
      }),
      drivetrainPreserved = after.drivetrainDirection === before.drivetrainDirection,
      damagePreserved = after.damage === before.damage,
      // A declared real collision is a physical impulse, never a re-initialisation: the kinematic
      // channels are still measured and reported, but only the strict channels gate `statePreserved`.
      impulse = collisionObserved,
      violations: TakeoverContinuityViolation[] = [];
    if (measured.positionM > bounds.positionM) violations.push('POSITION_STEP');
    if (measured.headingRad > bounds.headingRad) violations.push('HEADING_STEP');
    if (!impulse && measured.velocityMps > bounds.velocityMps) violations.push('VELOCITY_STEP');
    if (!impulse && measured.yawRateRadps > bounds.yawRateRadps) violations.push('YAW_RATE_STEP');
    if (!drivetrainPreserved) violations.push('DRIVETRAIN_CHANGE');
    if (!damagePreserved) violations.push('DAMAGE_CHANGE');
    const frozenViolations = Object.freeze([...violations]),
      commandStep = commandStepOf(firstAutonomyCommand, lastManualCommand),
      base = emptyDecision(
        scope,
        actor,
        decisionTick,
        authority,
        closedMode,
        collisionObserved,
        measured,
        bounds,
        drivetrainPreserved,
        damagePreserved,
        frozenViolations,
        commandStep,
      );
    // The human owns the vehicle while MANUAL/LEARNING; re-entry is an AUTO-only concern. 054 is the
    // single author of that decision, so it is delegated even in the abstention paths.
    const reentry = evaluateAuthorityReentry({
      sessionId: scope.sessionId,
      worldEpoch: scope.worldEpoch,
      actor,
      decisionTick,
      authority,
      graph,
      observation:
        value.observation === null ? null : (value.observation as AuthorityReentryObservation),
    });
    // No feasible in-graph re-entry: BLOCKED with the 054 cause. A proven drive back to the lane and
    // an on-lane continuation are feasible re-entries, and a 030 placement request is the documented
    // remedy offered together with the block (Docs/08: "marcat BLOCKED și oferă recuperarea
    // explicită"), which is why it is surfaced as `reentry` and not as a silent success.
    const blocked =
      reentry.action === 'REQUEST_RECOVERY' || reentry.action === 'REENTRY_IMPOSSIBLE';
    return Object.freeze({
      ...base,
      blocked,
      reason:
        frozenViolations.length === 0
          ? reentry.action === 'UNKNOWN'
            ? 'REENTRY_ABSTAINED'
            : 'STATE_PRESERVED'
          : 'STATE_CONTINUITY_VIOLATION',
      reentryReason: reentry.reason,
      reentry: reentry.action,
      targetLaneId: reentry.targetLaneId,
      distanceToLaneM: reentry.distanceToLaneM,
      lateralOffsetM: reentry.lateralOffsetM,
      headingErrorRad: reentry.headingErrorRad,
      recovery: reentry.recovery,
    });
  } finally {
    evaluating = false;
  }
}

/**
 * 045 bridge. It only raises or preserves `routeBlocked`; the whole 045 reason set stays untouched,
 * so the takeover outcome becomes the existing `BLOCKED`/`BLOCKED_ROUTE` state without a second
 * state machine. An abstention (no observation / no graph) keeps the caller's own fact untouched.
 */
export function takeoverContinuityBehaviorFacts(
  base: BehaviorFacts,
  decision: TakeoverContinuityDecision,
): BehaviorFacts | null {
  const facts = parseBehaviorFacts(base),
    diagnostic = record(decision);
  requireContract(
    diagnostic.version === TAKEOVER_CONTINUITY_LIMITS.version,
    'Takeover-continuity/FSM version mismatch',
  );
  if (diagnostic.reentry === 'UNKNOWN') return null;
  const blocked = diagnostic.blocked;
  requireContract(typeof blocked === 'boolean', 'Takeover-continuity blocked flag');
  choice(diagnostic.reentry, [
    'UNKNOWN',
    'CONTINUE',
    'DRIVE_TO_LANE',
    'REQUEST_RECOVERY',
    'REENTRY_IMPOSSIBLE',
  ] as const);
  if (blocked) return facts.routeBlocked ? facts : Object.freeze({ ...facts, routeBlocked: true });
  return facts;
}

export { TAKEOVER_SEGMENT_CLOSE_REASONS };
