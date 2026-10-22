import { choice, fields, number, record, requireContract, tick } from '../sessions';
import type { LaneGraph, RoadAccess, RouteStatus } from '../world';
import type { Vector3 } from '../vehicles';
import type { BehaviorActor, BehaviorFacts, BehaviorScope } from './behavior-fsm';
import { parseBehaviorFacts } from './behavior-fsm';

/**
 * 054 blocked-route recovery and MANUAL→AUTO re-entry policy.
 *
 * The module is a pure 10 Hz decision on authoritative observations: it never owns a clock, a
 * planner, a physical body, an authoritative pose writer or a route search of its own. Lack of
 * progress is derived from the authoritative longitudinal speed plus the real 033 lane graph, and
 * every recovery action is an explicit request against an existing contract:
 *
 * - `REQUEST_REROUTE` builds a descriptor for the real [041 route planner](../Docs/route-planner.md)
 *   (origin/destination/access/blocked set and a deterministic `costVersion`), never a second search;
 * - `REQUEST_RECOVERY` builds a descriptor whose `road` field is exactly 030's `RecoveryRoadProof`,
 *   derived from the real 033 directed path; the physical placement remains 030's native port;
 * - `DRIVE_TO_LANE` only reports the lane and the geometric error; 046–049/024 own the actuation.
 *
 * The 045 BLOCKED state stays the single state owner: `blockedRecoveryBehaviorFacts` raises
 * `BehaviorFacts.routeBlocked` and nothing else, so the reason set of 045 is not duplicated.
 */
export const BLOCKED_RECOVERY_LIMITS = Object.freeze({
  version: '054-blocked-recovery-v1' as const,
  observationVersion: '054-progress-observation-v1' as const,
  actors: 110,
  identityCodeUnits: 256,
  routeVersionCodeUnits: 128,
  blockedLanes: 64,
  tickHz: 60,
  /** No progress is declared when the authoritative longitudinal speed is below this value. */
  minimumProgressMps: 0.3,
  /** Consecutive stagnant ticks before the 045 BLOCKED fact is raised (2 s at 60 Hz). */
  stagnationTicksToBlock: 120,
  /** Bounded wait from the block start before a dynamic blockage asks for a reroute (3 s). */
  waitTicksBeforeReroute: 180,
  /** Minimum separation between two reroute requests in one episode (5 s). */
  rerouteCooldownTicks: 300,
  /** Bounded reroute attempts per episode before escalating to 030 or staying blocked. */
  maximumRerouteAttempts: 2,
  /** Consecutive progressing ticks required to release an episode (anti-flapping hysteresis). */
  releaseHoldTicks: 12,
  /** Off-centre tolerance; beyond it the re-entry plan is a real drive back to the lane centre. */
  reentryLateralToleranceM: 1,
  /** Real 033 lane-corridor height tolerance used for the location query. */
  locateMaxHeightDifferenceM: 1.5,
  /** The module retains no actor, episode or decision history. */
  retainedHistory: 0,
});

export type BlockedRecoveryReason =
  | 'NO_OBSERVATION'
  | 'OBSERVATION_UNAVAILABLE'
  | 'MISSING_LANE_GRAPH'
  | 'PROGRESS'
  | 'STAGNATION_WITHIN_THRESHOLD'
  | 'NO_PROGRESS_LEADER_STANDSTILL'
  | 'NO_PROGRESS_BLOCKED_LANE_AHEAD'
  | 'NO_PROGRESS_NO_FEASIBLE_SUCCESSOR'
  | 'NO_PROGRESS_ROUTE_BLOCKED'
  | 'NO_PROGRESS_OFF_GRAPH'
  | 'NO_PROGRESS_UNEXPLAINED';

export type BlockedRecoveryCause = Extract<BlockedRecoveryReason, `NO_PROGRESS_${string}`>;

export type BlockedRecoveryAction =
  'UNKNOWN' | 'CONTINUE' | 'WAIT' | 'REQUEST_REROUTE' | 'REQUEST_RECOVERY' | 'STAY_BLOCKED';

/** Monotone escalation stage of one episode; it never decreases while the episode is open. */
export type BlockedRecoveryStage = 'NONE' | 'WAITING' | 'REROUTE' | 'RECOVERY' | 'STAY_BLOCKED';

/** Why the escalation stopped at STAY_BLOCKED. Every terminal action names its own cause. */
export type BlockedRecoveryLimitation = 'NONE' | 'ESCALATION_NOT_PERMITTED' | 'NO_RECOVERY_TARGET';

export const BLOCKED_RECOVERY_STAGE_ORDINAL: Readonly<Record<BlockedRecoveryStage, number>> =
  Object.freeze({
    NONE: 0,
    WAITING: 1,
    REROUTE: 2,
    RECOVERY: 3,
    STAY_BLOCKED: 4,
  });

const ROUTE_STATUSES = Object.freeze([
  'READY',
  'BLOCKED',
  'UNREACHABLE',
  'ORIGIN_UNKNOWN',
  'DESTINATION_UNKNOWN',
  'SERVICE_ACCESS_MISMATCH',
  'BUDGET_EXHAUSTED',
] as const);
const ACTIONS = Object.freeze([
  'UNKNOWN',
  'CONTINUE',
  'WAIT',
  'REQUEST_REROUTE',
  'REQUEST_RECOVERY',
  'STAY_BLOCKED',
] as const);
const STAGES = Object.freeze(['NONE', 'WAITING', 'REROUTE', 'RECOVERY', 'STAY_BLOCKED'] as const);
const REASONS = Object.freeze([
  'NO_OBSERVATION',
  'OBSERVATION_UNAVAILABLE',
  'MISSING_LANE_GRAPH',
  'PROGRESS',
  'STAGNATION_WITHIN_THRESHOLD',
  'NO_PROGRESS_LEADER_STANDSTILL',
  'NO_PROGRESS_BLOCKED_LANE_AHEAD',
  'NO_PROGRESS_NO_FEASIBLE_SUCCESSOR',
  'NO_PROGRESS_ROUTE_BLOCKED',
  'NO_PROGRESS_OFF_GRAPH',
  'NO_PROGRESS_UNEXPLAINED',
] as const);

/** Caller-owned latch. Carrying it forward is what makes an episode continuous and bounded. */
export interface BlockedRecoveryState {
  /** First decision tick of the current stagnation run; null while moving. */
  readonly stagnantSinceTick: number | null;
  /** Tick-delta accumulation of stagnant authoritative ticks (single sample, then +delta). */
  readonly stagnantTicks: number;
  /** First tick of the current BLOCKED episode; null while no block was raised. */
  readonly blockedSinceTick: number | null;
  readonly stage: BlockedRecoveryStage;
  readonly rerouteAttempts: number;
  readonly lastRerouteTick: number | null;
  readonly escalatedTick: number | null;
  /** Progressing ticks accumulated since the last stagnation (release hysteresis). */
  readonly clearTicks: number;
  readonly lastDecisionTick: number | null;
}
export const BLOCKED_RECOVERY_EMPTY_STATE: BlockedRecoveryState = Object.freeze({
  stagnantSinceTick: null,
  stagnantTicks: 0,
  blockedSinceTick: null,
  stage: 'NONE' as const,
  rerouteAttempts: 0,
  lastRerouteTick: null,
  escalatedTick: null,
  clearTicks: 0,
  lastDecisionTick: null,
});

/** Real 041 planner context: the caller's current versions and blocked set, never hidden state. */
export interface BlockedRecoveryPlannerContext {
  readonly origin: string;
  readonly destination: string;
  readonly access: RoadAccess;
  readonly graphVersion: string;
  readonly costVersion: string;
  readonly blocked: readonly string[];
}

/** Authoritative progress observation: 044/033 facts plus the physical truth of the subject. */
export interface BlockedRecoveryObservation {
  readonly version: '054-progress-observation-v1';
  readonly units: 'SI';
  readonly tick: number;
  readonly access: RoadAccess;
  /** Authoritative longitudinal speed of the subject. */
  readonly speedMps: number;
  readonly laneId: string | null;
  /** Authoritative world pose, read-only. The module never writes it. */
  readonly positionM: Vector3;
  /** Null reports a semantically identified lane even when the vehicle travels backwards. */
  readonly headingRad: number | null;
  readonly leaderId: string | null;
  readonly leaderGapM: number | null;
  readonly leaderSpeedMps: number | null;
  /** Real 041 status for the subject's current route; anything but READY means no route. */
  readonly routeStatus: RouteStatus;
  /** Lane already known by the caller to be untraversable (blocked set / live obstacle lane). */
  readonly blockedLaneAheadId: string | null;
  readonly planner: BlockedRecoveryPlannerContext | null;
  /** Explicit host policy: a 030 recovery escalation may be requested for this actor. */
  readonly allowRecoveryEscalation: boolean;
}

export interface BlockedRecoveryInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  /** Real 033 lane graph; null reports MISSING/LOST graph instead of inventing lanes. */
  readonly graph: LaneGraph | null;
  readonly observation: BlockedRecoveryObservation | null;
  readonly state: BlockedRecoveryState;
}

/** Exactly the shape the real 041 planner/cache accepts; blocked changes always change the version. */
export interface BlockedRerouteRequest {
  readonly version: '054-blocked-recovery-v1';
  readonly origin: string;
  readonly destination: string;
  readonly access: RoadAccess;
  readonly graphVersion: string;
  readonly costVersion: string;
  readonly blocked: readonly string[];
  readonly attempt: number;
}

/** Exactly 030's RecoveryRoadProof plus the explicit intent; the physical move stays 030-owned. */
export interface BlockedRecoveryRequest {
  readonly version: '054-blocked-recovery-v1';
  readonly intent: 'RECOVERY_TO_VALID_POINT';
  readonly actor: BehaviorActor;
  readonly tick: number;
  readonly reason: BlockedRecoveryCause;
  readonly road: Readonly<{
    mapId: string;
    laneId: string;
    access: RoadAccess;
    start: Vector3;
    end: Vector3;
    widthM: number;
  }> | null;
}

export interface BlockedRecoveryDecision extends BehaviorScope {
  readonly version: '054-blocked-recovery-v1';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly observationTick: number | null;
  /** True when 045 must raise its BLOCKED state through `BehaviorFacts.routeBlocked`. */
  readonly blocked: boolean;
  /** The cause (motiv) of the decision; distinguishable per failure family. */
  readonly reason: BlockedRecoveryReason;
  /** The concrete recovery policy for this decision slice. */
  readonly action: BlockedRecoveryAction;
  /** Monotone episode stage; never decreases while the episode is open. */
  readonly stage: BlockedRecoveryStage;
  readonly limitation: BlockedRecoveryLimitation;
  readonly stagnantTicks: number;
  readonly requiredStagnantTicks: number;
  readonly stagnantSinceTick: number | null;
  readonly blockedSinceTick: number | null;
  readonly blockedLaneAheadId: string | null;
  readonly locatedLaneId: string | null;
  readonly rerouteAttempts: number;
  readonly rerouteCooldownRemainingTicks: number | null;
  readonly reroute: BlockedRerouteRequest | null;
  readonly recovery: BlockedRecoveryRequest | null;
  /** The latch the caller must carry into the next decision. */
  readonly state: BlockedRecoveryState;
  readonly retainedHistory: 0;
}

export interface AuthorityReentryInput extends BehaviorScope {
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly graph: LaneGraph | null;
  readonly observation: AuthorityReentryObservation | null;
}

/** Authoritative re-entry observation after an authority handover. */
export interface AuthorityReentryObservation {
  readonly version: '054-progress-observation-v1';
  readonly units: 'SI';
  readonly tick: number;
  readonly access: RoadAccess;
  /** Authoritative world pose, read-only. The module never writes it. */
  readonly positionM: Vector3;
  readonly headingRad: number | null;
  /** Real 041 status from the located lane to the destination; null is never a silent success. */
  readonly routeStatus: RouteStatus | null;
  readonly destination: string | null;
  /** Authoritative lane the host's own recovery point belongs to; null when none is known. */
  readonly recoveryLaneId: string | null;
  /** Explicit host policy: a 030 recovery escalation may be requested for this actor. */
  readonly allowRecoveryEscalation: boolean;
}

export type AuthorityReentryAction =
  'UNKNOWN' | 'CONTINUE' | 'DRIVE_TO_LANE' | 'REQUEST_RECOVERY' | 'REENTRY_IMPOSSIBLE';

export type AuthorityReentryReason =
  | 'NO_OBSERVATION'
  | 'OBSERVATION_UNAVAILABLE'
  | 'MANUAL_AUTHORITY'
  | 'MISSING_LANE_GRAPH'
  | 'ON_LANE'
  | 'OFF_CENTRE_LANE'
  | 'NO_LANE_IN_TOLERANCE'
  | 'ROUTE_NOT_PROVEN'
  | 'RECOVERY_REQUESTED'
  | 'RECOVERY_DISALLOWED'
  | 'NO_RECOVERY_TARGET';

export interface AuthorityReentryDecision extends BehaviorScope {
  readonly version: '054-blocked-recovery-v1';
  readonly actor: BehaviorActor;
  readonly decisionTick: number;
  readonly observationTick: number | null;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly action: AuthorityReentryAction;
  readonly reason: AuthorityReentryReason;
  readonly targetLaneId: string | null;
  readonly distanceToLaneM: number | null;
  readonly lateralOffsetM: number | null;
  readonly headingErrorRad: number | null;
  readonly recovery: BlockedRecoveryRequest | null;
  /** Literal contract assertion: no decision of this module carries or writes a pose. */
  readonly teleportsVehicle: false;
  readonly retainedHistory: 0;
}

let evaluating = false;
export function getBlockedRecoveryStats() {
  return Object.freeze({
    evaluating,
    retainedActors: 0,
    retainedEpisodes: 0,
    retainedHistory: 0,
  });
}

function identity(
  value: unknown,
  limit: number = BLOCKED_RECOVERY_LIMITS.identityCodeUnits,
): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= limit &&
      value.trim() === value,
    'Invalid blocked-recovery identity',
  );
  return value;
}
function access(value: unknown): RoadAccess {
  return choice(value, ['TAXI', 'CIVIL'] as const);
}
function point(value: unknown): Vector3 {
  const data = fields(value, ['x', 'y', 'z']);
  return Object.freeze({
    x: number(data.x, -1e6, 1e6),
    y: number(data.y, -1e6, 1e6),
    z: number(data.z, -1e6, 1e6),
  });
}
function actorOf(value: unknown): BehaviorActor {
  const data = fields(value, ['id', 'incarnation']);
  return Object.freeze({ id: identity(data.id), incarnation: tick(data.incarnation) });
}
/** Deterministic UTF-16 FNV-1a over the sorted, de-duplicated blocked lanes. */
function blockedSignature(values: readonly string[]): string {
  const sorted = [...new Set(values)].sort();
  let hash = 2166136261;
  for (const value of sorted) {
    for (let index = 0; index < value.length; index++)
      hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
    hash = Math.imul(hash ^ 0x1f, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
/**
 * Deterministic version derivation for a reroute request. The result changes whenever the blocked
 * set or the attempt index changes, so the real 041 cache and the 219 route cache can never serve a
 * route computed for a different blockage or for an earlier attempt. The caller may instead supply
 * its own next version; the derivation only removes the possibility of a stale reuse.
 */
export function blockedRerouteCostVersion(
  base: string,
  blocked: readonly string[],
  attempt: number,
): string {
  const version = identity(base, BLOCKED_RECOVERY_LIMITS.routeVersionCodeUnits - 16),
    value = tick(attempt);
  return `${version}:b${blockedSignature(blocked)}-r${value}`;
}

function readBlockedLanes(value: unknown): readonly string[] {
  requireContract(
    Array.isArray(value) && value.length <= BLOCKED_RECOVERY_LIMITS.blockedLanes,
    'Blocked lane set capacity',
  );
  requireContract(
    Object.getPrototypeOf(value) === Array.prototype &&
      Reflect.ownKeys(value).length === value.length + 1,
    'Invalid blocked lane array',
  );
  const lanes: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    requireContract(
      descriptor !== undefined && 'value' in descriptor && descriptor.enumerable === true,
      'Invalid blocked lane entry',
    );
    lanes.push(identity(descriptor.value));
  }
  requireContract(new Set(lanes).size === lanes.length, 'Duplicate blocked lane');
  return Object.freeze(lanes);
}

function plannerOf(value: unknown): BlockedRecoveryPlannerContext {
  const data = fields(value, [
    'origin',
    'destination',
    'access',
    'graphVersion',
    'costVersion',
    'blocked',
  ]);
  return Object.freeze({
    origin: identity(data.origin),
    destination: identity(data.destination),
    access: access(data.access),
    graphVersion: identity(data.graphVersion, BLOCKED_RECOVERY_LIMITS.routeVersionCodeUnits),
    costVersion: identity(data.costVersion, BLOCKED_RECOVERY_LIMITS.routeVersionCodeUnits),
    blocked: readBlockedLanes(data.blocked),
  });
}

function observationOf(value: unknown): BlockedRecoveryObservation {
  const data = fields(value, [
    'version',
    'units',
    'tick',
    'access',
    'speedMps',
    'laneId',
    'positionM',
    'headingRad',
    'leaderId',
    'leaderGapM',
    'leaderSpeedMps',
    'routeStatus',
    'blockedLaneAheadId',
    'planner',
    'allowRecoveryEscalation',
  ]);
  requireContract(
    data.version === BLOCKED_RECOVERY_LIMITS.observationVersion && data.units === 'SI',
    'Blocked-recovery observation version/units',
  );
  const heading = data.headingRad === null ? null : number(data.headingRad, -Math.PI, Math.PI),
    leaderId = data.leaderId === null ? null : identity(data.leaderId),
    leaderGapM = data.leaderGapM === null ? null : number(data.leaderGapM, 0, 10000),
    leaderSpeedMps = data.leaderSpeedMps === null ? null : number(data.leaderSpeedMps, 0, 100),
    allowRecoveryEscalation = data.allowRecoveryEscalation;
  requireContract(
    typeof allowRecoveryEscalation === 'boolean',
    'Blocked-recovery escalation policy flag',
  );
  if (leaderId === null)
    requireContract(
      leaderGapM === null && leaderSpeedMps === null,
      'Leader gap/speed without leader',
    );
  else requireContract(leaderGapM !== null && leaderSpeedMps !== null, 'Leader without gap/speed');
  return Object.freeze({
    version: BLOCKED_RECOVERY_LIMITS.observationVersion,
    units: 'SI',
    tick: tick(data.tick),
    access: access(data.access),
    speedMps: number(data.speedMps, 0, 100),
    laneId: data.laneId === null ? null : identity(data.laneId),
    positionM: point(data.positionM),
    headingRad: heading,
    leaderId,
    leaderGapM,
    leaderSpeedMps,
    routeStatus: choice(data.routeStatus, ROUTE_STATUSES),
    blockedLaneAheadId: data.blockedLaneAheadId === null ? null : identity(data.blockedLaneAheadId),
    planner: data.planner === null ? null : plannerOf(data.planner),
    allowRecoveryEscalation,
  });
}

function stateOf(value: unknown): BlockedRecoveryState {
  const data = fields(value, [
    'stagnantSinceTick',
    'stagnantTicks',
    'blockedSinceTick',
    'stage',
    'rerouteAttempts',
    'lastRerouteTick',
    'escalatedTick',
    'clearTicks',
    'lastDecisionTick',
  ]);
  return Object.freeze({
    stagnantSinceTick: data.stagnantSinceTick === null ? null : tick(data.stagnantSinceTick),
    stagnantTicks: tick(data.stagnantTicks),
    blockedSinceTick: data.blockedSinceTick === null ? null : tick(data.blockedSinceTick),
    stage: choice(data.stage, STAGES),
    rerouteAttempts: number(data.rerouteAttempts, 0, 1024),
    lastRerouteTick: data.lastRerouteTick === null ? null : tick(data.lastRerouteTick),
    escalatedTick: data.escalatedTick === null ? null : tick(data.escalatedTick),
    clearTicks: tick(data.clearTicks),
    lastDecisionTick: data.lastDecisionTick === null ? null : tick(data.lastDecisionTick),
  });
}

/** Real 033 location; the tolerance is the lane corridor itself, never an invented wider one. */
function locate(
  graph: LaneGraph,
  observation: BlockedRecoveryObservation,
): Readonly<{
  laneId: string;
  distanceM: number;
  lateralOffsetM: number | null;
  headingErrorRad: number | null;
}> | null {
  const projection = graph.locateLane({
    positionM: observation.positionM,
    access: observation.access,
    maxHeightDifferenceM: BLOCKED_RECOVERY_LIMITS.locateMaxHeightDifferenceM,
    ...(observation.headingRad === null ? {} : { headingRad: observation.headingRad }),
  });
  return projection === null
    ? null
    : Object.freeze({
        laneId: projection.lane.id,
        distanceM: projection.distanceM,
        lateralOffsetM: projection.lateralOffsetM,
        headingErrorRad: projection.headingErrorRad,
      });
}

/** Real 033 directed geometry projected onto 030's RecoveryRoadProof shape. */
function roadProof(
  graph: LaneGraph,
  laneId: string,
  roadAccess: RoadAccess,
): BlockedRecoveryRequest['road'] {
  const path = graph.getDirectedPath(laneId),
    lane = graph.getLane(laneId, roadAccess);
  if (!path || !lane || path.points.length < 2) return null;
  return Object.freeze({
    mapId: graph.mapId,
    laneId,
    access: roadAccess,
    start: path.points[0],
    end: path.points[path.points.length - 1],
    widthM: lane.widthM,
  });
}

function recoveryTarget(
  graph: LaneGraph | null,
  observation: BlockedRecoveryObservation,
  locatedLaneId: string | null,
): BlockedRecoveryRequest['road'] {
  if (graph === null) return null;
  const laneId = locatedLaneId ?? observation.laneId;
  return laneId === null ? null : roadProof(graph, laneId, observation.access);
}

function emptyDecision(
  scope: BehaviorScope,
  actor: BehaviorActor,
  decisionTick: number,
  observationTick: number | null,
  reason: BlockedRecoveryReason,
  action: BlockedRecoveryAction,
  state: BlockedRecoveryState,
  extra: Partial<BlockedRecoveryDecision> = {},
): BlockedRecoveryDecision {
  return Object.freeze({
    version: BLOCKED_RECOVERY_LIMITS.version,
    sessionId: scope.sessionId,
    worldEpoch: scope.worldEpoch,
    actor,
    decisionTick,
    observationTick,
    blocked: false,
    reason,
    action,
    stage: state.stage,
    limitation: 'NONE' as const,
    stagnantTicks: state.stagnantTicks,
    requiredStagnantTicks: BLOCKED_RECOVERY_LIMITS.stagnationTicksToBlock,
    stagnantSinceTick: state.stagnantSinceTick,
    blockedSinceTick: state.blockedSinceTick,
    blockedLaneAheadId: null,
    locatedLaneId: null,
    rerouteAttempts: state.rerouteAttempts,
    rerouteCooldownRemainingTicks: null,
    reroute: null,
    recovery: null,
    state,
    retainedHistory: 0 as const,
    ...extra,
  });
}

/**
 * Pure 054 gate on the lack of progress. Deterministic reason priority:
 * off-graph → blocked lane ahead → no feasible successor → blocked route → queue standstill →
 * unexplained stagnation. Structural causes block immediately; the dynamic one needs the declared
 * standstill threshold. Escalation inside one episode is monotone (WAIT → REROUTE → RECOVERY or
 * STAY_BLOCKED) and bounded by `maximumRerouteAttempts`.
 */
export function evaluateBlockedRecovery(input: BlockedRecoveryInput): BlockedRecoveryDecision {
  requireContract(!evaluating, 'Reentrant blocked-recovery evaluation');
  evaluating = true;
  try {
    const value = fields(input, [
      'sessionId',
      'worldEpoch',
      'actor',
      'decisionTick',
      'graph',
      'observation',
      'state',
    ]);
    const scope = Object.freeze({
        sessionId: identity(value.sessionId),
        worldEpoch: tick(value.worldEpoch),
      }),
      actor = actorOf(value.actor),
      decisionTick = tick(value.decisionTick),
      state = stateOf(value.state),
      graph = value.graph === null ? null : (value.graph as LaneGraph),
      observation = value.observation === null ? null : observationOf(value.observation);
    requireContract(
      graph === null ||
        (typeof graph.locateLane === 'function' && typeof graph.getConnections === 'function'),
      'Blocked recovery needs the real 033 lane graph',
    );
    requireContract(
      state.lastDecisionTick === null || decisionTick > state.lastDecisionTick,
      'Blocked-recovery decision tick must advance',
    );
    if (observation === null)
      return emptyDecision(scope, actor, decisionTick, null, 'NO_OBSERVATION', 'UNKNOWN', state);
    const delta = state.lastDecisionTick === null ? 1 : decisionTick - state.lastDecisionTick;
    if (observation.tick > decisionTick || decisionTick - observation.tick > 6)
      return emptyDecision(
        scope,
        actor,
        decisionTick,
        observation.tick,
        'OBSERVATION_UNAVAILABLE',
        'UNKNOWN',
        state,
      );
    // Real 033 location of the authoritative pose; no caller flag substitutes for it, and a missing
    // graph abstains instead of pretending the vehicle is off the graph.
    if (graph === null)
      return emptyDecision(
        scope,
        actor,
        decisionTick,
        observation.tick,
        'MISSING_LANE_GRAPH',
        'UNKNOWN',
        state,
      );
    const located = locate(graph, observation);
    const successors =
      graph === null
        ? 0
        : graph.getConnections(located?.laneId ?? observation.laneId ?? '', observation.access)
            .length;
    const blockedLaneAheadId = observation.blockedLaneAheadId,
      routeBlocked = observation.routeStatus !== 'READY',
      leaderStalled =
        observation.leaderSpeedMps !== null &&
        observation.leaderSpeedMps < BLOCKED_RECOVERY_LIMITS.minimumProgressMps;
    // Reason priority: the structural causes dominate the dynamic standstill. A lane with no
    // declared successor only blocks a route that is itself unusable; arriving on the destination
    // lane is a legitimate terminal position, never a "no feasible successor" block.
    const structural: BlockedRecoveryCause | null =
      located === null
        ? 'NO_PROGRESS_OFF_GRAPH'
        : blockedLaneAheadId !== null
          ? 'NO_PROGRESS_BLOCKED_LANE_AHEAD'
          : routeBlocked && successors === 0
            ? 'NO_PROGRESS_NO_FEASIBLE_SUCCESSOR'
            : routeBlocked
              ? 'NO_PROGRESS_ROUTE_BLOCKED'
              : null;
    const stagnant =
      structural !== null || observation.speedMps < BLOCKED_RECOVERY_LIMITS.minimumProgressMps;
    const stagnantTicks = stagnant
        ? state.stagnantTicks === 0
          ? 1
          : state.stagnantTicks + delta
        : 0,
      clearTicks = stagnant ? 0 : state.clearTicks + delta,
      stagnantSinceTick = stagnant ? (state.stagnantSinceTick ?? decisionTick) : null;
    // Anti-flapping release: a brief speed blip does not reset the episode accounting.
    if (!stagnant && clearTicks >= BLOCKED_RECOVERY_LIMITS.releaseHoldTicks)
      return emptyDecision(
        scope,
        actor,
        decisionTick,
        observation.tick,
        'PROGRESS',
        'CONTINUE',
        Object.freeze({
          ...BLOCKED_RECOVERY_EMPTY_STATE,
          lastDecisionTick: decisionTick,
        }),
        {
          stagnantTicks,
          stagnantSinceTick,
          locatedLaneId: located?.laneId ?? null,
        },
      );
    const blocked =
      structural !== null || stagnantTicks >= BLOCKED_RECOVERY_LIMITS.stagnationTicksToBlock;
    /** Within one episode the stage only moves forward; it is what makes the policy anti-flapping. */
    const advance = (
      candidate: BlockedRecoveryStage,
      current: BlockedRecoveryStage,
    ): BlockedRecoveryStage =>
      BLOCKED_RECOVERY_STAGE_ORDINAL[candidate] >= BLOCKED_RECOVERY_STAGE_ORDINAL[current]
        ? candidate
        : current;
    if (!blocked)
      return emptyDecision(
        scope,
        actor,
        decisionTick,
        observation.tick,
        stagnant ? 'STAGNATION_WITHIN_THRESHOLD' : 'PROGRESS',
        stagnant ? 'WAIT' : 'CONTINUE',
        Object.freeze({
          ...state,
          stagnantSinceTick,
          stagnantTicks,
          clearTicks,
          lastDecisionTick: decisionTick,
        }),
        {
          stagnantTicks,
          stagnantSinceTick,
          locatedLaneId: located?.laneId ?? null,
          stage: advance(stagnant ? 'WAITING' : 'NONE', state.stage),
        },
      );
    const reason: BlockedRecoveryCause =
        structural ?? (leaderStalled ? 'NO_PROGRESS_LEADER_STANDSTILL' : 'NO_PROGRESS_UNEXPLAINED'),
      blockedSinceTick = state.blockedSinceTick ?? decisionTick,
      attempts = state.rerouteAttempts,
      cooldownRemaining =
        state.lastRerouteTick === null
          ? null
          : Math.max(
              0,
              BLOCKED_RECOVERY_LIMITS.rerouteCooldownTicks - (decisionTick - state.lastRerouteTick),
            ),
      cooldownElapsed = cooldownRemaining === null || cooldownRemaining === 0,
      strongReroute = observation.planner !== null,
      reroutesLeft = attempts < BLOCKED_RECOVERY_LIMITS.maximumRerouteAttempts,
      // A structural blockage never waits for the standstill window: the route is unusable now.
      wantsReroute =
        structural !== null ||
        decisionTick - blockedSinceTick >= BLOCKED_RECOVERY_LIMITS.waitTicksBeforeReroute,
      target = recoveryTarget(graph, observation, located?.laneId ?? null),
      escalationUsable = observation.allowRecoveryEscalation && target !== null,
      reached: BlockedRecoveryStage = !wantsReroute
        ? 'WAITING'
        : strongReroute && (reroutesLeft || !cooldownElapsed)
          ? 'REROUTE'
          : escalationUsable
            ? 'RECOVERY'
            : 'STAY_BLOCKED',
      stage = advance(reached, state.stage),
      limitation: BlockedRecoveryLimitation =
        stage !== 'STAY_BLOCKED'
          ? 'NONE'
          : !observation.allowRecoveryEscalation
            ? 'ESCALATION_NOT_PERMITTED'
            : 'NO_RECOVERY_TARGET',
      emitReroute = stage === 'REROUTE' && cooldownElapsed && reroutesLeft,
      blockedSet: readonly string[] =
        blockedLaneAheadId === null ||
        (observation.planner !== null && observation.planner.blocked.includes(blockedLaneAheadId))
          ? (observation.planner?.blocked ?? Object.freeze([]))
          : [...(observation.planner?.blocked ?? []), blockedLaneAheadId],
      reroute: BlockedRerouteRequest | null =
        emitReroute && observation.planner !== null
          ? Object.freeze({
              version: BLOCKED_RECOVERY_LIMITS.version,
              origin: observation.planner.origin,
              destination: observation.planner.destination,
              access: observation.planner.access,
              graphVersion: observation.planner.graphVersion,
              costVersion: blockedRerouteCostVersion(
                observation.planner.costVersion,
                blockedSet,
                attempts + 1,
              ),
              blocked: Object.freeze([...blockedSet]),
              attempt: attempts + 1,
            })
          : null,
      emitRecovery = stage === 'RECOVERY' && state.escalatedTick === null,
      recovery: BlockedRecoveryRequest | null = emitRecovery
        ? Object.freeze({
            version: BLOCKED_RECOVERY_LIMITS.version,
            intent: 'RECOVERY_TO_VALID_POINT' as const,
            actor,
            tick: decisionTick,
            reason,
            road: target,
          })
        : null,
      action: BlockedRecoveryAction =
        stage === 'WAITING'
          ? 'WAIT'
          : stage === 'REROUTE'
            ? reroute === null
              ? 'WAIT'
              : 'REQUEST_REROUTE'
            : stage === 'RECOVERY'
              ? recovery === null
                ? 'WAIT'
                : 'REQUEST_RECOVERY'
              : 'STAY_BLOCKED',
      nextRerouteAttempts = attempts + (reroute === null ? 0 : 1);
    return Object.freeze({
      version: BLOCKED_RECOVERY_LIMITS.version,
      ...scope,
      actor,
      decisionTick,
      observationTick: observation.tick,
      blocked: true,
      reason,
      action,
      stage,
      limitation,
      stagnantTicks,
      requiredStagnantTicks: BLOCKED_RECOVERY_LIMITS.stagnationTicksToBlock,
      stagnantSinceTick,
      blockedSinceTick,
      blockedLaneAheadId,
      locatedLaneId: located?.laneId ?? null,
      rerouteAttempts: nextRerouteAttempts,
      rerouteCooldownRemainingTicks: cooldownRemaining,
      reroute,
      recovery,
      state: Object.freeze({
        stagnantSinceTick,
        stagnantTicks,
        blockedSinceTick,
        stage,
        rerouteAttempts: nextRerouteAttempts,
        lastRerouteTick: reroute === null ? state.lastRerouteTick : decisionTick,
        escalatedTick: recovery === null ? state.escalatedTick : decisionTick,
        clearTicks,
        lastDecisionTick: decisionTick,
      }),
      retainedHistory: 0 as const,
    });
  } finally {
    evaluating = false;
  }
}

/**
 * Pure 054 re-entry plan after an authority handover. It locates the real lane with 033 and either
 * reports the lane to drive back to, or asks explicitly for a 030 recovery to a valid point. It has
 * no write path to the authoritative pose and never teleports the vehicle: the driving chain
 * 046–049/024 owns the lateral/longitudinal move, and 030 owns every physical placement.
 */
export function evaluateAuthorityReentry(input: AuthorityReentryInput): AuthorityReentryDecision {
  requireContract(!evaluating, 'Reentrant authority re-entry evaluation');
  evaluating = true;
  try {
    const value = fields(input, [
      'sessionId',
      'worldEpoch',
      'actor',
      'decisionTick',
      'authority',
      'graph',
      'observation',
    ]);
    const scope = Object.freeze({
        sessionId: identity(value.sessionId),
        worldEpoch: tick(value.worldEpoch),
      }),
      actor = actorOf(value.actor),
      decisionTick = tick(value.decisionTick),
      authority = choice(value.authority, ['AUTO', 'MANUAL', 'LEARNING'] as const),
      graph = value.graph === null ? null : (value.graph as LaneGraph);
    requireContract(
      graph === null || typeof graph.locateLane === 'function',
      'Authority re-entry needs the real 033 lane graph',
    );
    const decision = (
      action: AuthorityReentryAction,
      reason: AuthorityReentryReason,
      extra: Partial<AuthorityReentryDecision> = {},
    ): AuthorityReentryDecision =>
      Object.freeze({
        version: BLOCKED_RECOVERY_LIMITS.version,
        ...scope,
        actor,
        decisionTick,
        observationTick: null,
        authority,
        action,
        reason,
        targetLaneId: null,
        distanceToLaneM: null,
        lateralOffsetM: null,
        headingErrorRad: null,
        recovery: null,
        teleportsVehicle: false as const,
        retainedHistory: 0 as const,
        ...extra,
      });
    if (value.observation === null) return decision('UNKNOWN', 'NO_OBSERVATION');
    const data = fields(value.observation, [
        'version',
        'units',
        'tick',
        'access',
        'positionM',
        'headingRad',
        'routeStatus',
        'destination',
        'recoveryLaneId',
        'allowRecoveryEscalation',
      ]),
      observation: AuthorityReentryObservation = Object.freeze({
        version: BLOCKED_RECOVERY_LIMITS.observationVersion,
        units: 'SI',
        tick: tick(data.tick),
        access: access(data.access),
        positionM: point(data.positionM),
        headingRad: data.headingRad === null ? null : number(data.headingRad, -Math.PI, Math.PI),
        routeStatus: data.routeStatus === null ? null : choice(data.routeStatus, ROUTE_STATUSES),
        destination: data.destination === null ? null : identity(data.destination),
        recoveryLaneId: data.recoveryLaneId === null ? null : identity(data.recoveryLaneId),
        allowRecoveryEscalation: booleanOf(data.allowRecoveryEscalation),
      });
    requireContract(
      data.version === BLOCKED_RECOVERY_LIMITS.observationVersion && data.units === 'SI',
      'Authority re-entry observation version/units',
    );
    requireContract(
      observation.tick <= decisionTick && decisionTick - observation.tick <= 6,
      'Authority re-entry observation is stale or from the future',
    );
    // The human owns the vehicle while MANUAL/LEARNING; re-entry is an AUTO-only concern.
    if (authority !== 'AUTO')
      return decision('CONTINUE', 'MANUAL_AUTHORITY', { observationTick: observation.tick });
    if (graph === null)
      return decision('UNKNOWN', 'MISSING_LANE_GRAPH', { observationTick: observation.tick });
    const projection = graph.locateLane({
        positionM: observation.positionM,
        access: observation.access,
        maxHeightDifferenceM: BLOCKED_RECOVERY_LIMITS.locateMaxHeightDifferenceM,
        ...(observation.headingRad === null ? {} : { headingRad: observation.headingRad }),
      }),
      laneId = projection?.lane.id ?? null,
      lateralOffsetM = projection?.lateralOffsetM ?? null,
      headingErrorRad = projection?.headingErrorRad ?? null,
      distanceToLaneM = projection?.distanceM ?? null,
      road = (target: string | null): BlockedRecoveryRequest['road'] =>
        target === null ? null : roadProof(graph, target, observation.access),
      /** Explicit 030 escalation: permitted by host policy, and only with a real 033 road proof. */
      escalation = (
        proof: BlockedRecoveryRequest['road'],
        reason: BlockedRecoveryCause,
        detail: Partial<AuthorityReentryDecision>,
      ): AuthorityReentryDecision => {
        if (!observation.allowRecoveryEscalation)
          return decision('REENTRY_IMPOSSIBLE', 'RECOVERY_DISALLOWED', detail);
        if (proof === null) return decision('REENTRY_IMPOSSIBLE', 'NO_RECOVERY_TARGET', detail);
        return decision('REQUEST_RECOVERY', 'RECOVERY_REQUESTED', {
          ...detail,
          recovery: Object.freeze({
            version: BLOCKED_RECOVERY_LIMITS.version,
            intent: 'RECOVERY_TO_VALID_POINT' as const,
            actor,
            tick: decisionTick,
            reason,
            road: proof,
          }),
        });
      };
    // Off every 033 corridor: only an explicit 030 placement can put the vehicle back on the graph.
    if (laneId === null)
      return escalation(road(observation.recoveryLaneId), 'NO_PROGRESS_OFF_GRAPH', {
        observationTick: observation.tick,
      });
    const offCentre =
      lateralOffsetM !== null &&
      Math.abs(lateralOffsetM) > BLOCKED_RECOVERY_LIMITS.reentryLateralToleranceM;
    const geometry = {
      observationTick: observation.tick,
      targetLaneId: laneId,
      distanceToLaneM,
      lateralOffsetM,
      headingErrorRad,
    };
    if (!offCentre) return decision('CONTINUE', 'ON_LANE', geometry);
    // A drive back to the lane is only claimed when the real 041 planner proved that route.
    if (observation.routeStatus !== 'READY') {
      if (observation.routeStatus === null && !observation.allowRecoveryEscalation)
        return decision('REENTRY_IMPOSSIBLE', 'ROUTE_NOT_PROVEN', geometry);
      return escalation(road(laneId), 'NO_PROGRESS_ROUTE_BLOCKED', geometry);
    }
    return decision('DRIVE_TO_LANE', 'OFF_CENTRE_LANE', geometry);
  } finally {
    evaluating = false;
  }
}

function booleanOf(value: unknown): boolean {
  requireContract(typeof value === 'boolean', 'Expected boolean');
  return value;
}

/**
 * 045 bridge. It only raises or preserves `routeBlocked`; every other fact and the whole 045 reason
 * set stay untouched, so no second state machine and no duplicated reason code is introduced.
 */
export function blockedRecoveryBehaviorFacts(
  base: BehaviorFacts,
  decision: BlockedRecoveryDecision,
): BehaviorFacts | null {
  const facts = parseBehaviorFacts(base),
    diagnostic = record(decision);
  requireContract(
    diagnostic.version === BLOCKED_RECOVERY_LIMITS.version,
    'Blocked-recovery/FSM version mismatch',
  );
  const action = choice(diagnostic.action, ACTIONS),
    blocked = diagnostic.blocked;
  requireContract(typeof blocked === 'boolean', 'Blocked-recovery blocked flag');
  choice(diagnostic.reason, REASONS);
  // No observation means no opinion: the caller keeps its own route-blocked fact untouched. An
  // explicit block raises the fact; any other action preserves every other 045 fact verbatim.
  if (action === 'UNKNOWN') return null;
  if (blocked) return facts.routeBlocked ? facts : Object.freeze({ ...facts, routeBlocked: true });
  return facts;
}
