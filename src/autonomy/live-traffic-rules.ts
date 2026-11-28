import { createStableId, requireContract, tick as readTick } from '../sessions';
import type { ContractContext } from '../sessions';
import type { DrivingProfile } from '../profiles';
import type { Vector3 } from '../vehicles';
import { createEventBus } from '../simulation';
import type { EventBus } from '../simulation';
import {
  createIntersectionConflicts,
  createSignalController,
  createStopRules,
  parseMapPriorityPolicy,
  predictPriorityArrival,
} from '../world';
import type {
  LaneGraph,
  MapPriorityPolicy,
  Movement,
  MovementSignal,
  RoadAccess,
  RoadMap,
  RouteStatus,
} from '../world';
import { evaluateSignalPolicy, projectSignalProfile, signalOpportunityKey } from './signal-policy';
import { evaluateStopPolicy, projectStopProfile } from './stop-policy';
import type { StopPolicyDecision, StopPolicyObservation } from './stop-policy';
import { evaluateLaneChange, projectLaneChangeProfile } from './lane-change-policy';
import type { LaneChangeObservation, LaneChangeState } from './lane-change-policy';
import { evaluateYieldPolicy, projectYieldProfile } from './yield-policy';
import type { YieldPolicyDecision } from './yield-policy';
import { BLOCKED_RECOVERY_EMPTY_STATE, evaluateBlockedRecovery } from './blocked-recovery';
import type { BlockedRecoveryState } from './blocked-recovery';

/**
 * PBI283 — live traffic rules adapter.
 *
 * One 036 controller advances the authored phases on the authoritative tick. The same 058 actor
 * snapshot is then evaluated by the delivered policies without a second simulation, ledger or
 * store:
 *
 * - 050 signal policy on the subject's own 036 movement and authored signal line;
 * - 037 STOP opportunities read back through `getOpportunity` and decided by 051, so an
 *   authoritative full-stop proof, a profile rolling stop and a real line crossing stay distinct;
 * - 038 priority rules + 052 yield intervals over the same live observations;
 * - 053 lane-change gates with an explicit caller-held latch and cooldown;
 * - 054 blocked recovery on the real 033 graph.
 *
 * The adapter never writes the authoritative pose, physics or route. It returns per-actor hold
 * commands plus explicit lane-change/recovery requests; 058 executes them against the existing 041
 * planner and 024/047 actuation. Player observations are only classified from actual 036/037
 * evidence; a stop that the traffic imposes is never labelled as the driver's own STOP intent.
 */
export const LIVE_TRAFFIC_RULES_VERSION = '283-live-traffic-rules-v1' as const;
export const LIVE_TRAFFIC_RULES_LIMITS = Object.freeze({
  version: LIVE_TRAFFIC_RULES_VERSION,
  actors: 110,
  externalVehicles: 32,
  retainedViolations: 64,
  tickHz: 60,
  decisionPeriodTicks: 6,
  /** Authoritative front-bumper datum of a class-023 body, measured from its centre. */
  frontDatumM: 2,
  /** Combined physical envelope removed from a centre-to-centre lane gap. */
  vehicleEnvelopeM: 4,
  /** Conservative approach deceleration used at exactly the authored stop point. */
  stopDecelerationMps2: 2.4,
  /** Explicit owner launch prediction for a stopped subject at an all-way conflict. */
  launchAccelerationMps2: 1.5,
  /** Local conflict horizon: actors farther than this cannot affect the declared gap. */
  conflictHorizonM: 120,
  /** The 052 horizon covers every candidate exit plus the largest allowed gap. */
  yieldHorizonS: 60,
  /** Downstream storage required before entering a junction (do not block the box). */
  exitStorageM: 0.1,
  /** Speed below which a leader is considered part of the same queue. */
  queueSpeedMps: 0.5,
  rollingStopMps: 2,
  graphVersion: '033-lane-graph-v1',
  costVersion: 'route-cost-v1',
  retainedHistory: 0,
});

export type LiveTrafficHoldKind = 'SIGNAL' | 'STOP' | 'YIELD' | 'BLOCKED';
export type LiveTrafficReason =
  | 'RED_APPROACH'
  | 'RED_HOLD'
  | 'GREEN_START_DELAY'
  | 'STOP_APPROACH'
  | 'STOP_HOLD'
  | 'STOP_DWELL'
  | 'YIELD_WAIT'
  | 'YIELD_UNKNOWN'
  | 'BLOCKED'
  | 'PROCEED';

export interface LiveTrafficActorView {
  readonly vehicleId: string;
  readonly incarnation: number;
  readonly access: RoadAccess;
  readonly authority: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly laneId: string;
  readonly laneProgressM: number;
  readonly routeLaneIds: readonly string[];
  readonly positionM: Vector3;
  readonly headingRad: number;
  readonly speedMps: number;
  readonly profile: DrivingProfile;
  readonly seed: number;
  readonly leader: Readonly<{ id: string; gapM: number; speedMps: number }> | null;
  readonly routeStatus: RouteStatus;
  readonly destinationLaneId: string | null;
}

export interface LiveTrafficExternalView {
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly positionM: Vector3;
  readonly headingRad: number;
  readonly speedMps: number;
}

export interface LiveTrafficViolationEvent {
  readonly version: '283-traffic-violation-v1';
  readonly eventId: string;
  readonly tick: number;
  readonly vehicleId: string;
  readonly kind: 'RED_LIGHT' | 'STOP_LINE';
  readonly reason: 'CROSSED_RED_SIGNAL' | 'CROSSED_STOP_WITHOUT_FULL_STOP';
  readonly evidence: '036-SIGNAL-CROSSING' | '037-STOP-LINE-CROSSED';
  readonly signalId: string | null;
  readonly intersectionId: string | null;
  readonly movementId: string | null;
  readonly stopLineId: string | null;
  readonly speedMps: number;
  readonly frontDistanceBeforeM: number;
  readonly frontDistanceAfterM: number;
}

export interface LiveTrafficCommand {
  readonly vehicleId: string;
  readonly hold: boolean;
  readonly reason: LiveTrafficReason;
  readonly holdKind: LiveTrafficHoldKind | null;
  /** Upper target for 047/048; null means no override beyond the cruise/following target. */
  readonly targetMps: number | null;
  /** Remaining centre advance allowed before the authoritative hold point; null is unlimited. */
  readonly maxAdvanceM: number | null;
  readonly signalState: 'RED' | 'YELLOW' | 'GREEN' | null;
  readonly stopLineId: string | null;
  /** 053 validated target lane for the existing 041 planner continuation. */
  readonly laneChangeTargetLaneId: string | null;
  /** 054 explicit recovery request; 058 owns the route/placement execution. */
  readonly recovery: Readonly<{
    readonly action: 'REQUEST_REROUTE' | 'REQUEST_RECOVERY' | 'STAY_BLOCKED';
    readonly reason: string;
  }> | null;
}

export interface LiveTrafficRouteFacts {
  readonly intersectionId: string;
  readonly movementId: string;
  readonly distanceM: number;
  readonly clearanceM: number;
  readonly relations: readonly Readonly<{
    relationId: string;
    distanceM: number;
    clearanceM: number;
  }>[];
}

export interface LiveTrafficRulesFrame {
  readonly version: typeof LIVE_TRAFFIC_RULES_VERSION;
  readonly tick: number;
  readonly signals: readonly MovementSignal[];
  readonly routes: ReadonlyMap<string, LiveTrafficRouteFacts>;
  readonly commands: ReadonlyMap<string, LiveTrafficCommand>;
  readonly violations: readonly LiveTrafficViolationEvent[];
}

export interface LiveTrafficRulesStats {
  readonly samples: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
}

export interface LiveTrafficRulesReport {
  readonly version: typeof LIVE_TRAFFIC_RULES_VERSION;
  readonly tick: number;
  readonly mapId: string;
  readonly actors: number;
  readonly signals: Readonly<{
    programs: number;
    movements: number;
    phaseChanges: number;
    redHolds: number;
    redStops: number;
    redProceedByProfile: number;
    greenStartDelays: number;
  }>;
  readonly stop: Readonly<{
    approaches: number;
    fullStops: number;
    rollingStops: number;
    lineCrossings: number;
    trafficCausedStops: number;
    holds: number;
  }>;
  readonly yield: Readonly<{
    checks: number;
    holds: number;
    accepted: number;
    unknown: number;
    deadlockBreaks: number;
  }>;
  readonly laneChange: Readonly<{
    attempts: number;
    validated: number;
    applied: number;
    refusedFrontGap: number;
    refusedBackGap: number;
    refusedAdvantage: number;
    refusedCooldown: number;
    otherRefusals: number;
  }>;
  readonly blocked: Readonly<{
    episodes: number;
    rerouteRequests: number;
    recoveryRequests: number;
    stayBlocked: number;
    applied: number;
    stalledRecoveries: number;
  }>;
  readonly violations: Readonly<{
    total: number;
    redLight: number;
    stopLine: number;
  }>;
  readonly cost: LiveTrafficRulesStats;
  readonly retainedHistory: 0;
  readonly disposed: boolean;
}

export interface LiveTrafficRules {
  readonly version: typeof LIVE_TRAFFIC_RULES_VERSION;
  readonly mapId: string;
  step(input: {
    readonly tick: number;
    readonly actors: readonly LiveTrafficActorView[];
    readonly externalVehicles?: readonly LiveTrafficExternalView[];
  }): LiveTrafficRulesFrame;
  violations(): readonly LiveTrafficViolationEvent[];
  /** Last frozen frame (signals/routes/commands/violations) for review and probes. */
  frame(): LiveTrafficRulesFrame | null;
  opportunity(vehicleId: string): ReturnType<ReturnType<typeof createStopRules>['getOpportunity']>;
  yieldDecision(vehicleId: string): YieldPolicyDecision | null;
  /** Read-only all-way arrival queue, bounded by the live junction membership. */
  stopQueues(): Readonly<Record<string, readonly string[]>>;
  report(): LiveTrafficRulesReport;
  /** 058 reports whether it actually executed the requested route continuation/recovery. */
  noteLaneChange(vehicleId: string, applied: boolean): void;
  noteRecovery(vehicleId: string, applied: boolean): void;
  getStats(): Readonly<{
    controller: ReturnType<ReturnType<typeof createSignalController>['getStats']>;
    stopVehicles: number;
    retainedActors: number;
    retainedViolations: number;
    samples: number;
    disposed: boolean;
  }>;
  dispose(): void;
}

interface PreparedLine {
  readonly stopLineId: string;
  readonly laneId: string;
  readonly intersectionId: string | null;
  readonly signalId: string | null;
  readonly a: Vector3;
  readonly b: Vector3;
  readonly normal: Readonly<{ x: number; z: number }>;
}

interface PreparedMovement {
  readonly intersectionId: string;
  readonly movementId: string;
  readonly fromLaneId: string;
  readonly toLaneId: string;
  readonly clearanceM: number;
  readonly headingRad: number;
}

interface PreparedJunction {
  readonly id: string;
  readonly signalized: boolean;
  readonly stopControlled: boolean;
  readonly movements: readonly Movement[];
}

interface CompiledPolicies {
  readonly versionId: string;
  readonly signal: ReturnType<typeof projectSignalProfile>;
  readonly stop: ReturnType<typeof projectStopProfile>;
  readonly lane: ReturnType<typeof projectLaneChangeProfile>;
  readonly yield: ReturnType<typeof projectYieldProfile>;
}

interface Approach {
  readonly movement: PreparedMovement;
  readonly distanceToEntryM: number;
  readonly distanceToStopLineM: number | null;
  readonly signal: MovementSignal | null;
}

interface HoldState {
  readonly kind: LiveTrafficHoldKind;
  readonly line: PreparedLine | null;
  readonly offsetM: number;
  readonly hardStop: boolean;
  readonly reason: LiveTrafficReason;
  readonly signalState: 'RED' | 'YELLOW' | 'GREEN' | null;
  readonly profileVersionId: string;
  readonly nextDecisionTick: number;
}

interface DecidedCommand {
  readonly hold: HoldState | null;
  readonly laneChangeTargetLaneId: string | null;
  readonly recovery: LiveTrafficCommand['recovery'];
  readonly signalState: 'RED' | 'YELLOW' | 'GREEN' | null;
  readonly reason: LiveTrafficReason;
}

interface ViolationStore {
  readonly events: LiveTrafficViolationEvent[];
  readonly byId: Map<string, LiveTrafficViolationEvent>;
}

interface SignalCrossingState {
  readonly lineId: string;
  readonly distanceM: number;
  readonly tick: number;
}

const EMPTY_COMMAND = (vehicleId: string): LiveTrafficCommand =>
  Object.freeze({
    vehicleId,
    hold: false,
    reason: 'PROCEED' as const,
    holdKind: null,
    targetMps: null,
    maxAdvanceM: null,
    signalState: null,
    stopLineId: null,
    laneChangeTargetLaneId: null,
    recovery: null,
  });

function summarize(samples: readonly number[]): LiveTrafficRulesStats {
  if (samples.length === 0)
    return Object.freeze({ samples: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0 });
  const sorted = [...samples].sort((left, right) => left - right);
  const at = (fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))))]!;
  return Object.freeze({
    samples: sorted.length,
    meanMs: sorted.reduce((total, value) => total + value, 0) / sorted.length,
    p50Ms: at(0.5),
    p95Ms: Math.max(at(0.95), at(0.5)),
    maxMs: sorted[sorted.length - 1]!,
  });
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : 0;
}

function point(value: Vector3): Vector3 {
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function headingOf(from: Vector3, to: Vector3): number {
  return Math.atan2(to.z - from.z, to.x - from.x);
}

function axisOfHeading(headingRad: number): 'X' | 'Z' {
  return Math.abs(Math.cos(headingRad)) >= Math.abs(Math.sin(headingRad)) ? 'X' : 'Z';
}

function laneHeading(map: RoadMap, laneId: string): number {
  const lane = map.lanes.find((candidate) => candidate.id === laneId)!,
    path = map.geometry.paths.find((candidate) => candidate.id === lane.geometryId)!;
  const first = map.geometry.nodes.find((node) => node.id === path.nodeIds[0]!)!.positionM,
    last = map.geometry.nodes.find(
      (node) => node.id === path.nodeIds[path.nodeIds.length - 1]!,
    )!.positionM;
  return headingOf(first, last);
}

function movementHeading(map: RoadMap, movement: Movement): number {
  const path = map.geometry.paths.find((candidate) => candidate.id === movement.geometryId);
  if (path !== undefined && path.nodeIds.length >= 2) {
    const first = map.geometry.nodes.find((node) => node.id === path.nodeIds[0]!)!.positionM,
      last = map.geometry.nodes.find(
        (node) => node.id === path.nodeIds[path.nodeIds.length - 1]!,
      )!.positionM;
    return headingOf(first, last);
  }
  return laneHeading(map, movement.fromLaneId);
}

function movementLength(map: RoadMap, movement: Movement): number {
  const path = map.geometry.paths.find((candidate) => candidate.id === movement.geometryId);
  if (path === undefined) return LIVE_TRAFFIC_RULES_LIMITS.vehicleEnvelopeM;
  let lengthM = 0;
  for (let index = 0; index < path.nodeIds.length - 1; index += 1) {
    const from = map.geometry.nodes.find((node) => node.id === path.nodeIds[index]!)!.positionM,
      to = map.geometry.nodes.find((node) => node.id === path.nodeIds[index + 1]!)!.positionM;
    lengthM += Math.hypot(to.x - from.x, to.z - from.z);
  }
  return lengthM + LIVE_TRAFFIC_RULES_LIMITS.vehicleEnvelopeM;
}

function prepareLines(map: RoadMap, graph: LaneGraph, kind: 'SIGNAL'): readonly PreparedLine[] {
  const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM])),
    paths = new Map(map.geometry.paths.map((path) => [path.id, path.nodeIds])),
    result: PreparedLine[] = [];
  for (const line of map.stopLines) {
    if (line.kind !== kind) continue;
    const ids = paths.get(line.geometryId)!,
      a = nodes.get(ids[0]!)!,
      b = nodes.get(ids[1]!)!;
    const dx = b.x - a.x,
      dz = b.z - a.z,
      length = Math.hypot(dx, dz);
    if (length <= 1e-9) continue;
    const lane = graph.getLane(line.laneId);
    if (lane === null) continue;
    const projection = graph.projectOnLane(line.laneId, {
      positionM: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 },
      access: lane.access[0]!,
      maxHeightDifferenceM: 1.5,
    });
    if (projection === null || projection.headingRad === null) continue;
    let nx = -dz / length,
      nz = dx / length;
    const alignment = nx * Math.cos(projection.headingRad) + nz * Math.sin(projection.headingRad);
    if (Math.abs(alignment) < 0.5) continue;
    if (alignment < 0) {
      nx = -nx;
      nz = -nz;
    }
    result.push(
      Object.freeze({
        stopLineId: line.id,
        laneId: line.laneId,
        intersectionId: line.intersectionId!,
        signalId: line.signalId!,
        a: point(a),
        b: point(b),
        normal: Object.freeze({ x: nx, z: nz }),
      }),
    );
  }
  return Object.freeze(result.sort((left, right) => (left.stopLineId < right.stopLineId ? -1 : 1)));
}

function lineDistance(line: PreparedLine, p: Vector3): number {
  return (line.a.x - p.x) * line.normal.x + (line.a.z - p.z) * line.normal.z;
}

function frontPositionOf(view: LiveTrafficActorView): Vector3 {
  const forward = LIVE_TRAFFIC_RULES_LIMITS.frontDatumM;
  return Object.freeze({
    x: view.positionM.x + Math.cos(view.headingRad) * forward,
    y: view.positionM.y,
    z: view.positionM.z + Math.sin(view.headingRad) * forward,
  });
}

function routeNextLane(view: LiveTrafficActorView): string | null {
  const index = view.routeLaneIds.indexOf(view.laneId);
  return index >= 0 && index + 1 < view.routeLaneIds.length ? view.routeLaneIds[index + 1]! : null;
}

/**
 * Deterministic authored 283 sidecar for the live map. The 032 schema has no priority field, so
 * every incompatible pair receives one explicit rule: a signalized junction is controlled by 036
 * (EQUAL), while an unsignalized junction resolves the east-west axis first and, inside one axis,
 * the through movement before a turn. The choice is the city content of this adapter, never the
 * array/render order of the map.
 */
export function createLivePriorityPolicy(map: RoadMap): MapPriorityPolicy {
  const conflicts = createIntersectionConflicts(map),
    movements = new Map(
      map.intersections.flatMap((junction) =>
        junction.movements.map((movement) => [movement.id, movement] as const),
      ),
    ),
    signalized = new Set(map.signals.map((program) => program.intersectionId)),
    seen = new Set<string>(),
    rules: {
      intersectionId: string;
      movementIds: [string, string];
      priorityMovementId: string | null;
    }[] = [];
  for (const junction of map.intersections)
    for (const movement of junction.movements)
      for (const relation of conflicts.getIncompatible(junction.id, movement.id)) {
        const pair = [...relation.movementIds].sort() as [string, string],
          key = `${junction.id}|${pair[0]}|${pair[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        let priorityMovementId: string | null = null;
        if (!signalized.has(junction.id)) {
          const first = movements.get(pair[0]!)!,
            second = movements.get(pair[1]!)!;
          const firstHeading = laneHeading(map, first.fromLaneId),
            secondHeading = laneHeading(map, second.fromLaneId),
            firstAxis = axisOfHeading(firstHeading),
            secondAxis = axisOfHeading(secondHeading);
          if (firstAxis !== secondAxis)
            priorityMovementId = firstAxis === 'X' ? first.id : second.id;
          else {
            const firstStraight = axisOfHeading(movementHeading(map, first)) === firstAxis,
              secondStraight = axisOfHeading(movementHeading(map, second)) === secondAxis;
            if (firstStraight !== secondStraight)
              priorityMovementId = firstStraight ? first.id : second.id;
            // Same axis and same through/turn class: the city has one explicit deterministic
            // precedence (the lexicographically first authored movement). This is map content,
            // not array or render order, and it prevents an unresolved EQUAL deadlock at a
            // four-way STOP.
            else priorityMovementId = pair[0];
          }
        }
        rules.push({ intersectionId: junction.id, movementIds: pair, priorityMovementId });
      }
  return Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    mapId: map.mapId,
    versionId: '283-live-priority-v1',
    rules: Object.freeze(
      rules
        .map((rule) => Object.freeze(rule))
        .sort((left, right) =>
          `${left.intersectionId}|${left.movementIds[0]}|${left.movementIds[1]}` <
          `${right.intersectionId}|${right.movementIds[0]}|${right.movementIds[1]}`
            ? -1
            : 1,
        ),
    ),
  });
}

export function createLiveTrafficRules(input: {
  readonly map: unknown;
  readonly graph: LaneGraph;
  readonly context: ContractContext;
  readonly eventBus?: EventBus;
}): LiveTrafficRules {
  const map = input.map as RoadMap,
    graph = input.graph,
    context = Object.freeze({ ...input.context }),
    sessionId = context.sessionId,
    worldEpoch = context.worldEpoch;
  requireContract(graph.mapId === map.mapId, 'Live traffic rules graph/map mismatch');
  const priority = parseMapPriorityPolicy(createLivePriorityPolicy(map), map),
    priorityPolicy = priority.policy,
    conflicts = priority.conflicts,
    lanes = new Map(map.lanes.map((lane) => [lane.id, lane])),
    junctions = new Map<string, PreparedJunction>(
      map.intersections.map((junction) => [
        junction.id,
        Object.freeze({
          id: junction.id,
          signalized: map.signals.some((program) => program.intersectionId === junction.id),
          stopControlled: map.stopLines.some(
            (line) => line.kind === 'STOP' && line.intersectionId === junction.id,
          ),
          movements: Object.freeze([...junction.movements]),
        }),
      ]),
    ),
    movements: readonly PreparedMovement[] = Object.freeze(
      map.intersections.flatMap((junction) =>
        junction.movements.map((movement) =>
          Object.freeze({
            intersectionId: junction.id,
            movementId: movement.id,
            fromLaneId: movement.fromLaneId,
            toLaneId: movement.toLaneId,
            clearanceM: movementLength(map, movement),
            headingRad: movementHeading(map, movement),
          }),
        ),
      ),
    ),
    movementByLanePair = new Map(
      movements.map((movement) => [`${movement.fromLaneId}|${movement.toLaneId}`, movement]),
    ),
    signalLines = prepareLines(map, graph, 'SIGNAL'),
    signalLinesByLane = new Map<string, PreparedLine[]>(),
    movementsByLane = new Map<string, PreparedMovement[]>(),
    movementByIntersection = new Map<string, PreparedMovement[]>();
  for (const line of signalLines) {
    const list = signalLinesByLane.get(line.laneId) ?? [];
    list.push(line);
    signalLinesByLane.set(line.laneId, list);
  }
  for (const movement of movements) {
    const list = movementsByLane.get(movement.fromLaneId) ?? [];
    list.push(movement);
    movementsByLane.set(movement.fromLaneId, list);
    const intersectionList = movementByIntersection.get(movement.intersectionId) ?? [];
    intersectionList.push(movement);
    movementByIntersection.set(movement.intersectionId, intersectionList);
  }
  const ruleByRelation = new Map<string, string | null>();
  for (const rule of priorityPolicy.rules) {
    const relation = conflicts.getRelation(
      rule.intersectionId,
      rule.movementIds[0],
      rule.movementIds[1],
    );
    if (relation !== null) ruleByRelation.set(relation.id, rule.priorityMovementId);
  }
  const bus =
      input.eventBus ??
      createEventBus({
        sessionId,
        worldEpoch,
        maxEventsPerEpoch: 200_000,
        maxEventCodeUnits: 65_536,
      }),
    ownsBus = input.eventBus === undefined;
  let controller: ReturnType<typeof createSignalController> | null = null;
  const stopRules = createStopRules(input.map, { sessionId, worldEpoch }, { dwellS: 0.05 }),
    stopLines = Object.freeze(
      stopRules.getZones().map((zone) =>
        Object.freeze({
          stopLineId: zone.stopLineId,
          laneId: zone.laneId,
          intersectionId: null,
          signalId: null,
          a: zone.points[0],
          b: zone.points[1],
          normal: zone.normal,
        } satisfies PreparedLine),
      ),
    ),
    lineById = new Map<string, PreparedLine>(
      [...signalLines, ...stopLines].map((line) => [line.stopLineId, line]),
    ),
    stopLineIntersection = new Map(
      map.stopLines
        .filter((line) => line.kind === 'STOP' && line.intersectionId !== null)
        .map((line) => [line.id, line.intersectionId!] as const),
    ),
    stopLinesByLane = new Map<string, PreparedLine[]>();
  for (const line of stopLines) {
    const list = stopLinesByLane.get(line.laneId) ?? [];
    list.push(line);
    stopLinesByLane.set(line.laneId, list);
  }
  const profileCache = new Map<string, CompiledPolicies>(),
    laneState = new Map<string, LaneChangeState>(),
    blockedState = new Map<string, BlockedRecoveryState>(),
    blockedActive = new Set<string>(),
    committedStop = new Set<string>(),
    trafficStopActive = new Set<string>(),
    stayBlockedActive = new Set<string>(),
    yieldSince = new Map<string, number>(),
    stallSince = new Map<string, number>(),
    stopQueue = new Map<string, Map<string, number>>(),
    queuedJunction = new Map<string, string>(),
    lastYieldDecision = new Map<string, YieldPolicyDecision>(),
    decisionPhase = new Map<string, number>(),
    lastReason = new Map<string, LiveTrafficReason>(),
    lastStopEpisode = new Map<string, string>(),
    lastSignalDistance = new Map<string, SignalCrossingState>(),
    lastFullStop = new Map<string, string>(),
    releasedStop = new Map<string, string>(),
    decisionCommand = new Map<string, DecidedCommand>(),
    violationsStore: ViolationStore = {
      events: [],
      byId: new Map<string, LiveTrafficViolationEvent>(),
    },
    costSamples: number[] = [];
  let currentSignals: readonly MovementSignal[] = Object.freeze([]),
    lastTick: number | null = null,
    lastActorCount = 0,
    lastFrame: LiveTrafficRulesFrame | null = null,
    disposed = false,
    controllerPhaseChanges = 0;
  const counters = {
    redStops: 0,
    redProceedByProfile: 0,
    greenStartDelays: 0,
    redHolds: 0,
    stopApproaches: 0,
    fullStops: 0,
    rollingStops: 0,
    lineCrossings: 0,
    trafficCausedStops: 0,
    stopHolds: 0,
    yieldChecks: 0,
    yieldHolds: 0,
    yieldAccepted: 0,
    yieldUnknown: 0,
    yieldDeadlockBreaks: 0,
    laneAttempts: 0,
    laneValidated: 0,
    laneApplied: 0,
    laneRefusedFront: 0,
    laneRefusedBack: 0,
    laneRefusedAdvantage: 0,
    laneRefusedCooldown: 0,
    laneOtherRefusals: 0,
    blockedEpisodes: 0,
    rerouteRequests: 0,
    recoveryRequests: 0,
    stayBlocked: 0,
    recoveriesApplied: 0,
    stalledRecoveries: 0,
    redLightViolations: 0,
    stopLineViolations: 0,
  };
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const live = (): void => {
    if (disposed) fail('Live traffic rules disposed');
  };
  const compiled = (profile: DrivingProfile): CompiledPolicies => {
    const existing = profileCache.get(profile.versionId);
    if (existing !== undefined) return existing;
    const result = Object.freeze({
      versionId: profile.versionId,
      signal: projectSignalProfile(profile),
      stop: projectStopProfile(profile),
      lane: projectLaneChangeProfile(profile),
      yield: projectYieldProfile(profile),
    });
    profileCache.set(profile.versionId, result);
    return result;
  };
  const controllerFor = (tick: number): ReturnType<typeof createSignalController> => {
    if (controller === null)
      controller = createSignalController(input.map, {
        context: {
          schemaVersion: 1,
          units: 'SI',
          sessionId,
          worldEpoch,
        },
        eventBus: bus,
        initialTick: tick,
      });
    return controller;
  };
  const signalsForTick = (): readonly MovementSignal[] => {
    const engine = controller!,
      result: MovementSignal[] = [];
    for (const program of map.signals) {
      const snapshot = engine.getSignal(program.id);
      if (snapshot === null) continue;
      const phase = program.phases.find((candidate) => candidate.id === snapshot.phaseId);
      if (phase === undefined) continue;
      for (const movement of phase.movementStates) {
        const signal = engine.getMovementSignal(program.intersectionId, movement.movementId);
        if (signal !== null) result.push(signal);
      }
    }
    return Object.freeze(
      result.sort((left, right) =>
        left.intersectionId === right.intersectionId
          ? left.movementId < right.movementId
            ? -1
            : 1
          : left.intersectionId < right.intersectionId
            ? -1
            : 1,
      ),
    );
  };
  const signalFor = (intersectionId: string, movementId: string): MovementSignal | null =>
    controller?.getMovementSignal(intersectionId, movementId) ?? null;
  const approachFor = (view: LiveTrafficActorView): Approach | null => {
    const next = routeNextLane(view);
    if (next === null) return null;
    const movement = movementByLanePair.get(`${view.laneId}|${next}`);
    if (movement === undefined) return null;
    const junction = junctions.get(movement.intersectionId);
    if (junction === undefined) return null;
    const path = graph.getDirectedPath(view.laneId);
    if (path === null) return null;
    const distanceToEntryM = Math.max(
      0,
      path.lengthM - view.laneProgressM - LIVE_TRAFFIC_RULES_LIMITS.frontDatumM,
    );
    const signalLine = junction.signalized
        ? ((signalLinesByLane.get(view.laneId) ?? []).find(
            (candidate) => candidate.intersectionId === movement.intersectionId,
          ) ?? null)
        : null,
      signal = signalLine === null ? null : signalFor(movement.intersectionId, movement.movementId);
    return Object.freeze({
      movement,
      distanceToEntryM,
      distanceToStopLineM:
        signalLine === null ? null : lineDistance(signalLine, frontPositionOf(view)),
      signal,
    });
  };
  const movementForLaneHeading = (
    laneId: string,
    headingRad: number,
    intersectionId: string | null,
  ): PreparedMovement | null => {
    const candidates = (movementsByLane.get(laneId) ?? []).filter(
      (movement) => intersectionId === null || movement.intersectionId === intersectionId,
    );
    let best: PreparedMovement | null = null,
      bestError = Number.POSITIVE_INFINITY;
    for (const movement of candidates) {
      const error = Math.abs(
        Math.atan2(
          Math.sin(movement.headingRad - headingRad),
          Math.cos(movement.headingRad - headingRad),
        ),
      );
      if (error < bestError) {
        best = movement;
        bestError = error;
      }
    }
    return best;
  };
  const recordViolation = (event: LiveTrafficViolationEvent): void => {
    if (violationsStore.byId.has(event.eventId)) return;
    violationsStore.byId.set(event.eventId, event);
    violationsStore.events.push(event);
    if (violationsStore.events.length > LIVE_TRAFFIC_RULES_LIMITS.retainedViolations) {
      const removed = violationsStore.events.shift();
      if (removed !== undefined) violationsStore.byId.delete(removed.eventId);
    }
  };
  const violationId = (
    kind: LiveTrafficViolationEvent['kind'],
    vehicleId: string,
    lineId: string,
    tick: number,
  ): string =>
    createStableId('traffic-violation', sessionId, [
      String(worldEpoch),
      kind,
      vehicleId,
      lineId,
      String(tick),
    ]);
  const observePlayerStop = (
    view: LiveTrafficActorView | LiveTrafficExternalView,
    access: RoadAccess,
    laneId: string | null,
    frontPositionM: Vector3,
    headingRad: number,
    speedMps: number,
    tick: number,
    incarnation: string,
    classifyViolation: boolean,
  ): void => {
    const previousOpportunity = stopRules.getOpportunity(view.vehicleId),
      previousDistance = previousOpportunity?.distanceToStopLineM ?? 0;
    const events = stopRules.observe({
      sessionId,
      worldEpoch,
      tick,
      vehicleId: view.vehicleId,
      incarnation,
      laneId,
      access,
      frontPositionM,
      headingRad,
      speedMps,
      discontinuity: false,
    });
    for (const event of events) {
      if (event.type === 'FULL_STOP') {
        const opportunityId = (event.payload as { opportunityId: string }).opportunityId;
        lastFullStop.set(view.vehicleId, opportunityId);
        counters.fullStops += 1;
      } else if (event.type === 'STOP_LINE_CROSSED') {
        const payload = event.payload as { opportunityId: string; stopLineId: string };
        counters.lineCrossings += 1;
        if (classifyViolation && lastFullStop.get(view.vehicleId) !== payload.opportunityId) {
          const violation = Object.freeze({
            version: '283-traffic-violation-v1' as const,
            eventId: violationId('STOP_LINE', view.vehicleId, payload.stopLineId, tick),
            tick,
            vehicleId: view.vehicleId,
            kind: 'STOP_LINE' as const,
            reason: 'CROSSED_STOP_WITHOUT_FULL_STOP' as const,
            evidence: '037-STOP-LINE-CROSSED' as const,
            signalId: null,
            intersectionId: null,
            movementId: null,
            stopLineId: payload.stopLineId,
            speedMps,
            frontDistanceBeforeM: previousDistance,
            frontDistanceAfterM: 0,
          });
          counters.stopLineViolations += 1;
          recordViolation(violation);
        }
      }
    }
  };
  const observePlayerSignal = (
    vehicleId: string,
    headingRad: number,
    laneId: string | null,
    frontPositionM: Vector3,
    speedMps: number,
    tick: number,
  ): void => {
    if (laneId === null) return;
    const lines = signalLinesByLane.get(laneId);
    if (lines === undefined || lines.length === 0) return;
    const line = lines
      .filter((candidate) => lineDistance(candidate, frontPositionM) >= -2)
      .sort(
        (left, right) => lineDistance(left, frontPositionM) - lineDistance(right, frontPositionM),
      )[0];
    if (line === undefined || line.intersectionId === null || line.signalId === null) return;
    const movement = movementForLaneHeading(laneId, headingRad, line.intersectionId);
    if (movement === null) return;
    const signal = signalFor(line.intersectionId, movement.movementId);
    if (signal === null) return;
    const distanceM = lineDistance(line, frontPositionM),
      key = `${vehicleId}|${line.stopLineId}`,
      previous = lastSignalDistance.get(key);
    if (previous !== undefined && previous.tick === tick) return;
    if (
      previous !== undefined &&
      previous.tick + 1 === tick &&
      previous.distanceM > 0 &&
      distanceM <= 0 &&
      signal.state === 'RED'
    ) {
      const violation = Object.freeze({
        version: '283-traffic-violation-v1' as const,
        eventId: violationId('RED_LIGHT', vehicleId, line.stopLineId, tick),
        tick,
        vehicleId,
        kind: 'RED_LIGHT' as const,
        reason: 'CROSSED_RED_SIGNAL' as const,
        evidence: '036-SIGNAL-CROSSING' as const,
        signalId: line.signalId,
        intersectionId: line.intersectionId,
        movementId: movement.movementId,
        stopLineId: line.stopLineId,
        speedMps,
        frontDistanceBeforeM: previous.distanceM,
        frontDistanceAfterM: distanceM,
      });
      counters.redLightViolations += 1;
      recordViolation(violation);
    }
    lastSignalDistance.set(key, Object.freeze({ lineId: line.stopLineId, distanceM, tick }));
    // A vehicle is only on one line of a lane at a time; stale keys are dropped with the actor.
    if (lastSignalDistance.size > LIVE_TRAFFIC_RULES_LIMITS.actors * 4) {
      for (const [entryKey, value] of lastSignalDistance)
        if (tick - value.tick > 120) lastSignalDistance.delete(entryKey);
    }
  };
  const yieldDecisionFor = (
    subject: LiveTrafficActorView,
    approach: Approach,
    views: readonly LiveTrafficActorView[],
    tick: number,
  ): YieldPolicyDecision | null => {
    const policies = compiled(subject.profile),
      subjectMovement = approach.movement;
    const relations = conflicts.getIncompatible(
      subjectMovement.intersectionId,
      subjectMovement.movementId,
    );
    if (relations.length === 0) return null;
    const launch = (distanceM: number, clearanceM: number, speedMps: number) => {
      if (distanceM + clearanceM <= 0)
        return Object.freeze({ state: 'CLEARED' as const, timeToEntryS: null, timeToExitS: null });
      if (distanceM <= 0)
        return Object.freeze({
          state: 'OCCUPYING' as const,
          timeToEntryS: 0,
          timeToExitS: speedMps > 0.01 ? Math.min(60, (distanceM + clearanceM) / speedMps) : null,
        });
      if (speedMps > 0.1) {
        const predicted = predictPriorityArrival(distanceM, clearanceM, speedMps);
        return predicted.timeToEntryS === null
          ? predicted
          : Object.freeze({
              ...predicted,
              timeToEntryS: Math.min(60, predicted.timeToEntryS),
              timeToExitS:
                predicted.timeToExitS === null
                  ? null
                  : Math.min(60, Math.max(predicted.timeToEntryS, predicted.timeToExitS)),
            });
      }
      const acceleration = LIVE_TRAFFIC_RULES_LIMITS.launchAccelerationMps2,
        entryS = Math.sqrt((2 * distanceM) / acceleration),
        exitS = Math.sqrt((2 * (distanceM + clearanceM)) / acceleration);
      return Object.freeze({
        state: 'APPROACHING' as const,
        timeToEntryS: Math.min(60, entryS),
        timeToExitS: Math.min(60, exitS),
      });
    };
    const subjectArrival = launch(
      Math.max(0.001, approach.distanceToEntryM),
      subjectMovement.clearanceM,
      subject.speedMps,
    );
    if (subjectArrival.timeToEntryS === null || subjectArrival.timeToExitS === null) return null;
    const candidates = relations.map((relation) =>
      Object.freeze({
        relationId: relation.id,
        entryS: Math.max(0, subjectArrival.timeToEntryS!),
        exitS: Math.max(0, subjectArrival.timeToExitS!),
      }),
    );
    const subjectQueueRank = queueRank(subjectMovement.intersectionId, subject.vehicleId);
    const relevant = views
      .filter((view) => view.vehicleId !== subject.vehicleId)
      .map((view) => {
        const other = approachFor(view);
        if (other === null || other.movement.intersectionId !== subjectMovement.intersectionId)
          return null;
        if (other.distanceToEntryM > LIVE_TRAFFIC_RULES_LIMITS.conflictHorizonM) return null;
        const otherOpportunity = stopRules.getOpportunity(view.vehicleId);
        if (otherOpportunity === null && other.distanceToEntryM > 5) return null;
        // A vehicle behind this subject in the same all-way queue is not entitled yet; it must
        // wait for its turn instead of starving the first arrival with a smaller predicted gap.
        if (queueRank(subjectMovement.intersectionId, view.vehicleId) > subjectQueueRank)
          return null;
        return { view, approach: other };
      })
      .filter(
        (entry): entry is { view: LiveTrafficActorView; approach: Approach } => entry !== null,
      );
    const actors = [
      Object.freeze({
        id: subject.vehicleId,
        incarnation: subject.incarnation,
        active: true,
        observable: true,
        routeKnown: true,
      }),
      ...relevant.map((entry) =>
        Object.freeze({
          id: entry.view.vehicleId,
          incarnation: entry.view.incarnation,
          active: true,
          observable: true,
          routeKnown: true,
        }),
      ),
    ];
    const pairs: {
      relationId: string;
      otherActorId: string;
      priority: 'YIELD' | 'PRIORITY' | 'EQUAL';
      arrival: ReturnType<typeof launch> | null;
    }[] = [];
    for (const candidate of candidates)
      for (const entry of relevant) {
        const otherMovement = entry.approach.movement.movementId;
        if (otherMovement === subjectMovement.movementId) {
          pairs.push({
            relationId: candidate.relationId,
            otherActorId: entry.view.vehicleId,
            priority: 'PRIORITY',
            arrival: null,
          });
          continue;
        }
        const relation = conflicts.getRelation(
          subjectMovement.intersectionId,
          subjectMovement.movementId,
          otherMovement,
        );
        const priority =
          relation === null || !relation.incompatible
            ? 'PRIORITY'
            : ruleByRelation.get(relation.id) === subjectMovement.movementId
              ? 'PRIORITY'
              : ruleByRelation.get(relation.id) === otherMovement
                ? 'YIELD'
                : 'EQUAL';
        pairs.push({
          relationId: candidate.relationId,
          otherActorId: entry.view.vehicleId,
          priority,
          arrival:
            priority === 'PRIORITY'
              ? null
              : launch(
                  Math.max(0.001, entry.approach.distanceToEntryM),
                  entry.approach.movement.clearanceM,
                  entry.view.speedMps,
                ),
        });
      }
    const decision = evaluateYieldPolicy({
      version: '052-yield-interval-v1',
      units: 'SI',
      sessionId,
      worldEpoch,
      subjectId: subject.vehicleId,
      observationTick: tick,
      decisionTick: tick,
      profile: policies.yield,
      coverage: 'COMPLETE_HORIZON',
      horizonS: LIVE_TRAFFIC_RULES_LIMITS.yieldHorizonS,
      discontinuity: false,
      actors,
      candidates,
      pairs,
    });
    lastYieldDecision.set(subject.vehicleId, decision);
    return decision;
  };
  const laneGaps = (
    subject: LiveTrafficActorView,
    targetLaneId: string,
    views: readonly LiveTrafficActorView[],
    externals: readonly LiveTrafficExternalView[],
  ): { frontGapM: number | null; backGapM: number | null } => {
    const subjectProjection = graph.projectOnLane(targetLaneId, {
        positionM: subject.positionM,
        access: subject.access,
      }),
      subjectLongitudinalM = subjectProjection?.longitudinalM ?? subject.laneProgressM;
    let frontGapM: number | null = null,
      backGapM: number | null = null;
    const consider = (positionM: Vector3, access: RoadAccess, vehicleId: string): void => {
      if (vehicleId === subject.vehicleId) return;
      const projection = graph.projectOnLane(targetLaneId, { positionM, access });
      if (projection === null) return;
      const lane = lanes.get(targetLaneId);
      if (lane === undefined || projection.distanceM > lane.widthM / 2 + 0.5) return;
      const delta = projection.longitudinalM - subjectLongitudinalM,
        gap = Math.max(0, Math.abs(delta) - LIVE_TRAFFIC_RULES_LIMITS.vehicleEnvelopeM);
      if (delta > 0) frontGapM = frontGapM === null ? gap : Math.min(frontGapM, gap);
      else backGapM = backGapM === null ? gap : Math.min(backGapM, gap);
    };
    for (const view of views) consider(view.positionM, view.access, view.vehicleId);
    for (const external of externals)
      consider(
        external.positionM,
        external.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL',
        external.vehicleId,
      );
    return { frontGapM, backGapM };
  };
  const lineForStop = (stopLineId: string | null): PreparedLine | null =>
    stopLineId === null ? null : (lineById.get(stopLineId) ?? null);
  const pastStopLine = (view: LiveTrafficActorView): boolean => {
    const lines = stopLinesByLane.get(view.laneId);
    if (lines === undefined) return false;
    const front = frontPositionOf(view);
    return lines.some((line) => lineDistance(line, front) < 0);
  };
  /**
   * PBI283 all-way arrival order. The 037 opportunity start tick is the real arrival proof; ties
   * use the stable vehicle ID. The queue is per junction and bounded by the live actor cap.
   */
  const queueRank = (intersectionId: string, vehicleId: string): number => {
    const queue = stopQueue.get(intersectionId);
    if (queue === undefined) return Number.POSITIVE_INFINITY;
    const ordered = [...queue.entries()].sort(
      ([leftId, leftTick], [rightId, rightTick]) =>
        leftTick - rightTick || (leftId < rightId ? -1 : leftId > rightId ? 1 : 0),
    );
    const index = ordered.findIndex(([id]) => id === vehicleId);
    return index < 0 ? Number.POSITIVE_INFINITY : index;
  };
  const updateStopQueue = (view: LiveTrafficActorView): void => {
    const previousJunction = queuedJunction.get(view.vehicleId) ?? null;
    if (view.authority !== 'AUTO') {
      if (previousJunction !== null) stopQueue.get(previousJunction)?.delete(view.vehicleId);
      queuedJunction.delete(view.vehicleId);
      return;
    }
    const opportunity = stopRules.getOpportunity(view.vehicleId),
      intersectionId =
        opportunity === null ? null : (stopLineIntersection.get(opportunity.stopLineId) ?? null);
    if (previousJunction !== null && previousJunction !== intersectionId) {
      stopQueue.get(previousJunction)?.delete(view.vehicleId);
      queuedJunction.delete(view.vehicleId);
    }
    if (intersectionId === null || opportunity === null) return;
    const queue = stopQueue.get(intersectionId) ?? new Map<string, number>();
    if (opportunity.crossed) {
      queue.delete(view.vehicleId);
      if (queue.size === 0) stopQueue.delete(intersectionId);
      queuedJunction.delete(view.vehicleId);
      return;
    }
    if (!queue.has(view.vehicleId)) {
      if (queue.size >= LIVE_TRAFFIC_RULES_LIMITS.actors) return;
      queue.set(view.vehicleId, opportunity.startedTick);
      stopQueue.set(intersectionId, queue);
      queuedJunction.set(view.vehicleId, intersectionId);
    }
  };
  const isFirstArrival = (intersectionId: string, vehicleId: string): boolean =>
    queueRank(intersectionId, vehicleId) === 0;
  const exitSpaceAvailable = (
    view: LiveTrafficActorView,
    approach: Approach,
    views: readonly LiveTrafficActorView[],
    externals: readonly LiveTrafficExternalView[],
  ): boolean => {
    const targetLaneId = approach.movement.toLaneId,
      lane = lanes.get(targetLaneId);
    if (lane === undefined) return false;
    const blocked = (positionM: Vector3, access: RoadAccess, vehicleId: string): boolean => {
      if (vehicleId === view.vehicleId) return false;
      const projection = graph.projectOnLane(targetLaneId, { positionM, access });
      return (
        projection !== null &&
        projection.distanceM <= lane.widthM / 2 + 0.5 &&
        projection.longitudinalM < LIVE_TRAFFIC_RULES_LIMITS.exitStorageM
      );
    };
    for (const other of views)
      if (blocked(other.positionM, other.access, other.vehicleId)) return false;
    for (const external of externals)
      if (
        blocked(
          external.positionM,
          external.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL',
          external.vehicleId,
        )
      )
        return false;
    return true;
  };
  const holdCommand = (
    vehicleId: string,
    hold: HoldState,
    tick: number,
    view: LiveTrafficActorView,
  ): LiveTrafficCommand => {
    void tick;
    const front = frontPositionOf(view);
    let remainingM = 0,
      targetMps = 0,
      maxAdvanceM = 0;
    if (!hold.hardStop && hold.line !== null) {
      remainingM = lineDistance(hold.line, front) - hold.offsetM;
      if (remainingM > 0) {
        targetMps = Math.sqrt(2 * LIVE_TRAFFIC_RULES_LIMITS.stopDecelerationMps2 * remainingM);
        maxAdvanceM = remainingM;
      }
    }
    return Object.freeze({
      vehicleId,
      hold: true,
      reason: hold.reason,
      holdKind: hold.kind,
      targetMps: Math.max(0, targetMps),
      maxAdvanceM: Math.max(0, maxAdvanceM),
      signalState: hold.signalState,
      stopLineId: hold.line?.stopLineId ?? null,
      laneChangeTargetLaneId: null,
      recovery: null,
    });
  };
  const decide = (
    view: LiveTrafficActorView,
    tick: number,
    views: readonly LiveTrafficActorView[],
    externals: readonly LiveTrafficExternalView[],
    decisionDue: boolean,
  ): DecidedCommand => {
    const policies = compiled(view.profile),
      approach = approachFor(view);
    if (view.authority !== 'AUTO')
      return Object.freeze({
        hold: null,
        laneChangeTargetLaneId: null,
        recovery: null,
        signalState: approach?.signal?.state ?? null,
        reason: 'PROCEED',
      });
    if (!decisionDue) {
      const cached = decisionCommand.get(view.vehicleId);
      if (cached !== undefined) return cached;
    }
    let hold: HoldState | null = null,
      laneChangeTargetLaneId: string | null = null,
      recovery: LiveTrafficCommand['recovery'] = null,
      signalState: 'RED' | 'YELLOW' | 'GREEN' | null = approach?.signal?.state ?? null,
      reason: LiveTrafficReason = 'PROCEED',
      stopDecision: StopPolicyDecision | null = null;
    // 050: the subject's own 036 movement is the only signal authority.
    if (approach !== null && approach.signal !== null) {
      const snapshot = controller!.getSignal(approach.signal.signalId),
        phaseStartedTick = snapshot?.phaseStartedTick ?? tick,
        observation = Object.freeze({
          version: '050-signal-observation-v1' as const,
          units: 'SI' as const,
          tick,
          signalId: approach.signal.signalId,
          intersectionId: approach.signal.intersectionId,
          movementId: approach.movement.movementId,
          phaseId: approach.signal.phaseId,
          state: approach.signal.state,
          phaseElapsedS: Math.max(0, (tick - phaseStartedTick) / LIVE_TRAFFIC_RULES_LIMITS.tickHz),
          distanceToStopLineM: approach.distanceToStopLineM,
        }),
        signalDecision = evaluateSignalPolicy({
          sessionId,
          worldEpoch,
          actor: Object.freeze({ id: view.vehicleId, incarnation: view.incarnation }),
          decisionTick: tick,
          speedMps: view.speedMps,
          seed: view.seed,
          opportunityKey: signalOpportunityKey({
            sessionId,
            worldEpoch,
            vehicleId: view.vehicleId,
            incarnation: view.incarnation,
            intersectionId: approach.signal.intersectionId,
            movementId: approach.movement.movementId,
            phaseStartedTick,
          }),
          profile: policies.signal,
          observation,
        });
      signalState = signalDecision.signalState;
      const line =
        signalLinesByLane
          .get(view.laneId)
          ?.find((candidate) => candidate.intersectionId === approach.signal!.intersectionId) ??
        null;
      if (signalDecision.action === 'STOP') {
        counters.redHolds += 1;
        if (
          signalDecision.reason === 'STOP_LINE_APPROACH' ||
          signalDecision.reason === 'STOP_LINE_HOLD'
        ) {
          hold = Object.freeze({
            kind: 'SIGNAL',
            line,
            offsetM: policies.signal.redStopLineOffsetM,
            hardStop: signalDecision.reason === 'STOP_LINE_HOLD',
            reason: signalDecision.stopRequested ? 'RED_APPROACH' : 'RED_HOLD',
            signalState,
            profileVersionId: policies.versionId,
            nextDecisionTick: tick + LIVE_TRAFFIC_RULES_LIMITS.decisionPeriodTicks,
          });
          reason = signalDecision.stopRequested ? 'RED_APPROACH' : 'RED_HOLD';
        } else if (signalDecision.reason === 'LATE_RED_BRAKE') {
          hold = Object.freeze({
            kind: 'SIGNAL',
            line,
            offsetM: policies.signal.redStopLineOffsetM,
            hardStop: false,
            reason: 'RED_HOLD',
            signalState,
            profileVersionId: policies.versionId,
            nextDecisionTick: tick + LIVE_TRAFFIC_RULES_LIMITS.decisionPeriodTicks,
          });
          reason = 'RED_HOLD';
        }
      } else if (signalDecision.action === 'START_DELAY') {
        counters.greenStartDelays += 1;
        hold = Object.freeze({
          kind: 'SIGNAL',
          line,
          offsetM: policies.signal.redStopLineOffsetM,
          hardStop: true,
          reason: 'GREEN_START_DELAY',
          signalState,
          profileVersionId: policies.versionId,
          nextDecisionTick: tick + LIVE_TRAFFIC_RULES_LIMITS.decisionPeriodTicks,
        });
        reason = 'GREEN_START_DELAY';
      } else if (signalDecision.reason === 'CROSS_RED_BY_PROFILE') {
        counters.redProceedByProfile += 1;
      }
    }
    // 037/051: the STOP proof is independent from a red decision.
    const opportunity = stopRules.getOpportunity(view.vehicleId),
      leaderStop =
        view.leader !== null &&
        view.leader.speedMps <= LIVE_TRAFFIC_RULES_LIMITS.queueSpeedMps &&
        view.leader.gapM <= 30
          ? 'LEADER_OR_QUEUE'
          : 'NONE',
      observation: StopPolicyObservation | null =
        opportunity === null
          ? null
          : Object.freeze({
              version: '051-stop-observation-v1' as const,
              units: 'SI' as const,
              tick: opportunity.tick,
              opportunityId: opportunity.opportunityId,
              stopLineId: opportunity.stopLineId,
              distanceToStopLineM: Math.max(-1000, Math.min(1000, opportunity.distanceToStopLineM)),
              speedMps: view.speedMps,
              stationaryDurationS:
                opportunity.stationaryDurationS === null
                  ? null
                  : Math.min(60, opportunity.stationaryDurationS),
              crossed: opportunity.crossed,
            });
    stopDecision = evaluateStopPolicy({
      sessionId,
      worldEpoch,
      actor: Object.freeze({ id: view.vehicleId, incarnation: view.incarnation }),
      decisionTick: tick,
      seed: view.seed,
      profile: policies.stop,
      observation,
      leaderStop,
    });
    if (opportunity !== null && lastStopEpisode.get(view.vehicleId) !== opportunity.opportunityId) {
      lastStopEpisode.set(view.vehicleId, opportunity.opportunityId);
      counters.stopApproaches += 1;
    }
    if (opportunity === null) releasedStop.delete(view.vehicleId);
    else if (releasedStop.get(view.vehicleId) !== opportunity.opportunityId) {
      if (stopDecision.action === 'RELEASE')
        releasedStop.set(view.vehicleId, opportunity.opportunityId);
    }
    const stopReleased =
      opportunity !== null && releasedStop.get(view.vehicleId) === opportunity.opportunityId;
    const committedStopLine =
      opportunity?.crossed === true ||
      stopDecision.reason === 'STOP_LINE_CROSSED' ||
      committedStop.has(view.vehicleId) ||
      pastStopLine(view);
    if (committedStopLine) committedStop.add(view.vehicleId);
    else if (approach === null) committedStop.delete(view.vehicleId);
    if (opportunity === null && leaderStop === 'LEADER_OR_QUEUE') {
      if (!trafficStopActive.has(view.vehicleId)) {
        trafficStopActive.add(view.vehicleId);
        counters.trafficCausedStops += 1;
      }
    } else trafficStopActive.delete(view.vehicleId);
    if (
      hold === null &&
      !stopReleased &&
      (stopDecision.action === 'APPROACH' || stopDecision.action === 'HOLD')
    ) {
      counters.stopHolds += 1;
      const line = lineForStop(opportunity?.stopLineId ?? null);
      hold = Object.freeze({
        kind: 'STOP',
        line,
        offsetM: policies.stop.stopLineOffsetM,
        hardStop: stopDecision.reason === 'STOP_HOLD',
        reason:
          stopDecision.reason === 'DWELL_IN_PROGRESS' || stopDecision.reason === 'STOP_HOLD'
            ? 'STOP_HOLD'
            : 'STOP_APPROACH',
        signalState,
        profileVersionId: policies.versionId,
        nextDecisionTick: tick + LIVE_TRAFFIC_RULES_LIMITS.decisionPeriodTicks,
      });
      reason = hold.reason;
    } else if (hold === null && stopDecision.action === 'ROLL_THROUGH') {
      counters.rollingStops += 1;
      reason = 'PROCEED';
    } else if (hold === null && stopDecision.action === 'RELEASE') {
      reason = 'PROCEED';
    }
    // 038/052: stop-controlled junctions only. A signaled junction is owned by 050.
    if (
      hold === null &&
      approach !== null &&
      !exitSpaceAvailable(view, approach, views, externals)
    ) {
      const line =
        approach.signal === null
          ? lineForStop(opportunity?.stopLineId ?? null)
          : (signalLines.find(
              (candidate) =>
                candidate.intersectionId === approach.signal!.intersectionId &&
                candidate.laneId === view.laneId,
            ) ?? null);
      hold = Object.freeze({
        kind: 'YIELD',
        line,
        offsetM:
          approach.signal === null
            ? policies.stop.stopLineOffsetM
            : policies.signal.redStopLineOffsetM,
        hardStop: line === null,
        reason: 'YIELD_WAIT',
        signalState,
        profileVersionId: policies.versionId,
        nextDecisionTick: tick + LIVE_TRAFFIC_RULES_LIMITS.decisionPeriodTicks,
      });
      reason = 'YIELD_WAIT';
    }
    if (
      hold === null &&
      approach !== null &&
      !committedStopLine &&
      junctions.get(approach.movement.intersectionId)?.stopControlled === true &&
      (approach.distanceToEntryM <= 20 ||
        stopDecision.action === 'RELEASE' ||
        stopDecision.action === 'ROLL_THROUGH')
    ) {
      const yielded = yieldDecisionFor(view, approach, views, tick);
      const firstArrival =
        opportunity === null ||
        opportunity.crossed ||
        isFirstArrival(approach.movement.intersectionId, view.vehicleId);
      if (yielded !== null && !firstArrival) {
        counters.yieldChecks += 1;
        counters.yieldHolds += 1;
        const line = lineForStop(opportunity?.stopLineId ?? null);
        hold = Object.freeze({
          kind: 'YIELD',
          line,
          offsetM: policies.stop.stopLineOffsetM,
          hardStop: false,
          reason: 'YIELD_WAIT',
          signalState,
          profileVersionId: policies.versionId,
          nextDecisionTick: tick + LIVE_TRAFFIC_RULES_LIMITS.decisionPeriodTicks,
        });
        reason = 'YIELD_WAIT';
      } else if (yielded !== null) {
        counters.yieldChecks += 1;
        if (yielded.action === 'REFUSE' || yielded.action === 'UNKNOWN') {
          if (yielded.action === 'UNKNOWN') counters.yieldUnknown += 1;
          if (!yieldSince.has(view.vehicleId)) yieldSince.set(view.vehicleId, tick);
          const waitingTicks = tick - (yieldSince.get(view.vehicleId) ?? tick),
            conflictingActive = views.some((other) => {
              if (other.vehicleId === view.vehicleId) return false;
              const otherApproach = approachFor(other);
              if (
                otherApproach === null ||
                otherApproach.movement.intersectionId !== approach.movement.intersectionId ||
                otherApproach.movement.movementId === approach.movement.movementId ||
                other.speedMps <= 0.1 ||
                otherApproach.distanceToEntryM > 10
              )
                return false;
              const relation = conflicts.getRelation(
                approach.movement.intersectionId,
                approach.movement.movementId,
                otherApproach.movement.movementId,
              );
              return relation?.incompatible === true;
            });
          // PBI283 live deadlock breaker: after a completed own STOP and 8 s without any moving
          // conflicting actor, a stationary priority queue cannot hold the junction forever. The
          // normal 052 gap decision keeps priority whenever a conflicting actor is actually moving.
          if (!conflictingActive && waitingTicks >= 480) {
            counters.yieldDeadlockBreaks += 1;
            yieldSince.delete(view.vehicleId);
            reason = 'PROCEED';
          } else {
            counters.yieldHolds += 1;
            const line = lineForStop(opportunity?.stopLineId ?? null);
            hold = Object.freeze({
              kind: 'YIELD',
              line,
              offsetM: policies.stop.stopLineOffsetM,
              hardStop: false,
              reason: yielded.action === 'UNKNOWN' ? 'YIELD_UNKNOWN' : 'YIELD_WAIT',
              signalState,
              profileVersionId: policies.versionId,
              nextDecisionTick: tick + LIVE_TRAFFIC_RULES_LIMITS.decisionPeriodTicks,
            });
            reason = hold.reason;
          }
        } else {
          counters.yieldAccepted += 1;
          yieldSince.delete(view.vehicleId);
        }
      } else yieldSince.delete(view.vehicleId);
    }
    // 053: optional change only while proceeding and at the caller's 10 Hz cadence.
    if (hold === null && decisionDue) {
      const neighbors = graph.getNeighbors(view.laneId, view.access),
        candidates = [
          ...(neighbors.left === null ? [] : [{ lane: neighbors.left, side: 'LEFT' as const }]),
          ...(neighbors.right === null ? [] : [{ lane: neighbors.right, side: 'RIGHT' as const }]),
        ];
      for (const candidate of candidates) {
        const gaps = laneGaps(view, candidate.lane.id, views, externals),
          targetLaneSpeedMps = candidate.lane.speedLimitMps * 0.8,
          intent =
            view.leader !== null && view.leader.speedMps + 0.5 < targetLaneSpeedMps
              ? ('OPTIONAL_OVERTAKE' as const)
              : ('NONE' as const),
          observation: LaneChangeObservation = Object.freeze({
            version: '053-lane-observation-v1' as const,
            units: 'SI' as const,
            tick,
            targetLaneId: candidate.lane.id,
            coverage: 'COMPLETE' as const,
            frontGapM: gaps.frontGapM,
            backGapM: gaps.backGapM,
            targetLaneSpeedMps,
          }),
          adjacencyNeighbors = Object.freeze([
            ...(neighbors.left === null
              ? []
              : [Object.freeze({ laneId: neighbors.left.id, side: 'LEFT' as const })]),
            ...(neighbors.right === null
              ? []
              : [Object.freeze({ laneId: neighbors.right.id, side: 'RIGHT' as const })]),
          ]),
          decision = evaluateLaneChange({
            sessionId,
            worldEpoch,
            actor: Object.freeze({ id: view.vehicleId, incarnation: view.incarnation }),
            decisionTick: tick,
            profile: policies.lane,
            state: laneState.get(view.vehicleId) ?? { committed: null, lastChangeTick: null },
            adjacency: Object.freeze({
              version: '053-lane-adjacency-v1' as const,
              mapId: map.mapId,
              currentLaneId: view.laneId,
              access: view.access,
              neighbors: adjacencyNeighbors,
            }),
            observation,
            speedMps: view.speedMps,
            ownLaneLeaderSpeedMps: view.leader?.speedMps ?? null,
            intent,
          });
        laneState.set(view.vehicleId, decision.state);
        if (intent === 'NONE') break;
        counters.laneAttempts += 1;
        if (decision.action === 'CHANGE' && decision.reason === 'OPTIONAL_CHANGE_VALIDATED') {
          counters.laneValidated += 1;
          laneChangeTargetLaneId = decision.targetLaneId;
          break;
        }
        if (decision.reason === 'INSUFFICIENT_FRONT_GAP') counters.laneRefusedFront += 1;
        else if (decision.reason === 'INSUFFICIENT_BACK_GAP') counters.laneRefusedBack += 1;
        else if (decision.reason === 'INSUFFICIENT_SPEED_GAIN') counters.laneRefusedAdvantage += 1;
        else if (decision.reason === 'COOLDOWN_ACTIVE') counters.laneRefusedCooldown += 1;
        else counters.laneOtherRefusals += 1;
      }
    }
    // 054: only an unexplained stagnation may become a BLOCKED episode.
    if (
      hold === null &&
      decisionDue &&
      reason === 'PROCEED' &&
      view.speedMps <= 0.3 &&
      view.leader === null &&
      approach === null
    ) {
      const state = blockedState.get(view.vehicleId) ?? BLOCKED_RECOVERY_EMPTY_STATE,
        blocked = evaluateBlockedRecovery({
          sessionId,
          worldEpoch,
          actor: Object.freeze({ id: view.vehicleId, incarnation: view.incarnation }),
          decisionTick: tick,
          graph,
          observation: {
            version: '054-progress-observation-v1',
            units: 'SI',
            tick,
            access: view.access,
            speedMps: view.speedMps,
            laneId: view.laneId,
            positionM: view.positionM,
            headingRad: view.headingRad,
            leaderId: null,
            leaderGapM: null,
            leaderSpeedMps: null,
            routeStatus: view.routeStatus,
            blockedLaneAheadId: state.stagnantTicks >= 120 ? view.laneId : null,
            planner:
              view.destinationLaneId === null
                ? null
                : {
                    origin: view.laneId,
                    destination: view.destinationLaneId,
                    access: view.access,
                    graphVersion: LIVE_TRAFFIC_RULES_LIMITS.graphVersion,
                    costVersion: LIVE_TRAFFIC_RULES_LIMITS.costVersion,
                    blocked: [],
                  },
            allowRecoveryEscalation: false,
          },
          state,
        });
      blockedState.set(view.vehicleId, blocked.state);
      if (blocked.blocked) {
        if (!blockedActive.has(view.vehicleId)) {
          blockedActive.add(view.vehicleId);
          counters.blockedEpisodes += 1;
        }
        hold = Object.freeze({
          kind: 'BLOCKED',
          line: null,
          offsetM: 0,
          hardStop: true,
          reason: 'BLOCKED',
          signalState,
          profileVersionId: policies.versionId,
          nextDecisionTick: tick + LIVE_TRAFFIC_RULES_LIMITS.decisionPeriodTicks,
        });
        reason = 'BLOCKED';
        if (blocked.action === 'REQUEST_REROUTE' || blocked.action === 'REQUEST_RECOVERY') {
          if (blocked.action === 'REQUEST_REROUTE') counters.rerouteRequests += 1;
          else counters.recoveryRequests += 1;
          recovery = Object.freeze({
            action: blocked.action,
            reason: blocked.reason,
          });
        } else if (blocked.action === 'STAY_BLOCKED') {
          if (!stayBlockedActive.has(view.vehicleId)) {
            stayBlockedActive.add(view.vehicleId);
            counters.stayBlocked += 1;
          }
        } else stayBlockedActive.delete(view.vehicleId);
      } else blockedActive.delete(view.vehicleId);
      if (!blocked.blocked) stayBlockedActive.delete(view.vehicleId);
    } else if (hold === null && reason === 'PROCEED' && view.speedMps > 0.3) {
      blockedState.set(view.vehicleId, BLOCKED_RECOVERY_EMPTY_STATE);
      blockedActive.delete(view.vehicleId);
      stayBlockedActive.delete(view.vehicleId);
    }
    // PBI283 anti-gridlock last resort: a hold that has kept one actor stationary for 45 s with no
    // leader is a real network stall, not a green light and not a fabricated gap. The actor is
    // released with an explicit counted recovery; the normal signal/STOP/yield holds stay intact.
    if (hold !== null && hold.kind !== 'SIGNAL' && view.speedMps <= 0.1) {
      if (!stallSince.has(view.vehicleId)) stallSince.set(view.vehicleId, tick);
      const stalledTicks = tick - (stallSince.get(view.vehicleId) ?? tick);
      if (stalledTicks >= 2700 && (view.leader === null || view.leader.gapM > 5)) {
        hold = null;
        reason = 'PROCEED';
        stallSince.delete(view.vehicleId);
        counters.stalledRecoveries += 1;
      }
    } else stallSince.delete(view.vehicleId);
    if (hold !== null && hold.kind !== 'BLOCKED') {
      blockedState.set(view.vehicleId, BLOCKED_RECOVERY_EMPTY_STATE);
      blockedActive.delete(view.vehicleId);
      stayBlockedActive.delete(view.vehicleId);
    }
    const result: DecidedCommand = Object.freeze({
      hold,
      laneChangeTargetLaneId,
      recovery,
      signalState,
      reason,
    });
    if (decisionDue) decisionCommand.set(view.vehicleId, result);
    return result;
  };
  const step = (value: {
    tick: number;
    actors: readonly LiveTrafficActorView[];
    externalVehicles?: readonly LiveTrafficExternalView[];
  }): LiveTrafficRulesFrame => {
    live();
    const started = nowMs(),
      tick = readTick(value.tick),
      actors = value.actors,
      externals = value.externalVehicles ?? Object.freeze([]);
    requireContract(
      lastTick === null || tick === lastTick + 1,
      'Live traffic rules ticks must be consecutive',
    );
    requireContract(
      actors.length <= LIVE_TRAFFIC_RULES_LIMITS.actors,
      'Live traffic actor capacity',
    );
    requireContract(
      externals.length <= LIVE_TRAFFIC_RULES_LIMITS.externalVehicles,
      'Live traffic external capacity',
    );
    const seen = new Set<string>();
    for (const view of actors) {
      requireContract(!seen.has(view.vehicleId), 'Duplicate live traffic actor');
      seen.add(view.vehicleId);
      requireContract(
        view.positionM !== undefined &&
          Number.isFinite(view.positionM.x) &&
          Number.isFinite(view.positionM.y) &&
          Number.isFinite(view.positionM.z) &&
          Number.isFinite(view.headingRad) &&
          Number.isFinite(view.speedMps) &&
          view.speedMps >= 0 &&
          view.speedMps <= 100,
        'Invalid live traffic observation',
      );
      if (!decisionPhase.has(view.vehicleId))
        decisionPhase.set(
          view.vehicleId,
          decisionPhase.size % LIVE_TRAFFIC_RULES_LIMITS.decisionPeriodTicks,
        );
    }
    const engine = controllerFor(tick),
      advanced = engine.step(tick);
    controllerPhaseChanges += advanced.eventIds.length;
    for (const publication of advanced.publications)
      requireContract(
        publication.failures.length === 0,
        'Live signal listener failed; explicit recovery is required',
      );
    currentSignals = signalsForTick();
    const routes = new Map<string, LiveTrafficRouteFacts>();
    for (const view of actors) {
      const approach = approachFor(view);
      if (approach === null) continue;
      const relations = conflicts.getIncompatible(
          approach.movement.intersectionId,
          approach.movement.movementId,
        ),
        distanceM = approach.distanceToEntryM;
      routes.set(
        view.vehicleId,
        Object.freeze({
          intersectionId: approach.movement.intersectionId,
          movementId: approach.movement.movementId,
          distanceM,
          clearanceM: approach.movement.clearanceM,
          relations: Object.freeze(
            relations.map((relation) =>
              Object.freeze({
                relationId: relation.id,
                distanceM,
                clearanceM: approach.movement.clearanceM,
              }),
            ),
          ),
        }),
      );
    }
    // 037 observes every live actor; only a MANUAL/LEARNING seat or an external player observation
    // can produce a violation. A traffic-imposed hold never becomes a STOP or red violation.
    for (const view of actors) {
      const front = frontPositionOf(view),
        manual = view.authority !== 'AUTO';
      observePlayerStop(
        view,
        view.access,
        view.laneId,
        front,
        view.headingRad,
        view.speedMps,
        tick,
        String(view.incarnation),
        manual,
      );
      if (manual)
        observePlayerSignal(
          view.vehicleId,
          view.headingRad,
          view.laneId,
          front,
          view.speedMps,
          tick,
        );
      updateStopQueue(view);
    }
    for (const external of externals) {
      const access: RoadAccess = external.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL',
        projection = graph.locateLane({
          positionM: external.positionM,
          access,
          headingRad: external.headingRad,
        }),
        front = Object.freeze({
          x:
            external.positionM.x +
            Math.cos(external.headingRad) * LIVE_TRAFFIC_RULES_LIMITS.frontDatumM,
          y: external.positionM.y,
          z:
            external.positionM.z +
            Math.sin(external.headingRad) * LIVE_TRAFFIC_RULES_LIMITS.frontDatumM,
        });
      observePlayerStop(
        external,
        access,
        projection?.lane.id ?? null,
        front,
        external.headingRad,
        external.speedMps,
        tick,
        '1',
        true,
      );
      observePlayerSignal(
        external.vehicleId,
        external.headingRad,
        projection?.lane.id ?? null,
        front,
        external.speedMps,
        tick,
      );
    }
    const commands = new Map<string, LiveTrafficCommand>();
    for (const view of actors) {
      const phase = decisionPhase.get(view.vehicleId) ?? 0,
        due = lastTick === null || tick % LIVE_TRAFFIC_RULES_LIMITS.decisionPeriodTicks === phase,
        decided = decide(view, tick, actors, externals, due),
        effective = due
          ? decided
          : Object.freeze({
              ...decided,
              laneChangeTargetLaneId: null,
              recovery: null,
            }),
        previousReason = lastReason.get(view.vehicleId);
      lastReason.set(view.vehicleId, decided.reason);
      if (decided.reason === 'RED_APPROACH' || decided.reason === 'RED_HOLD') {
        if (previousReason !== 'RED_APPROACH' && previousReason !== 'RED_HOLD')
          counters.redStops += 1;
      }
      commands.set(
        view.vehicleId,
        effective.hold === null
          ? Object.freeze({
              ...EMPTY_COMMAND(view.vehicleId),
              reason: effective.reason,
              signalState: effective.signalState,
              laneChangeTargetLaneId: effective.laneChangeTargetLaneId,
              recovery: effective.recovery,
            })
          : holdCommand(view.vehicleId, effective.hold, tick, view),
      );
    }
    lastTick = tick;
    lastActorCount = actors.length;
    const costMs = Math.max(0, nowMs() - started);
    if (costSamples.length >= 600) costSamples.shift();
    costSamples.push(costMs);
    const result = Object.freeze({
      version: LIVE_TRAFFIC_RULES_VERSION,
      tick,
      signals: currentSignals,
      routes,
      commands,
      violations: Object.freeze(violationsStore.events.filter((event) => event.tick === tick)),
    });
    lastFrame = result;
    return result;
  };
  return Object.freeze({
    version: LIVE_TRAFFIC_RULES_VERSION,
    mapId: map.mapId,
    step,
    violations(): readonly LiveTrafficViolationEvent[] {
      return Object.freeze([...violationsStore.events]);
    },
    frame(): LiveTrafficRulesFrame | null {
      return lastFrame;
    },
    opportunity(vehicleId: string) {
      return stopRules.getOpportunity(vehicleId);
    },
    yieldDecision(vehicleId: string): YieldPolicyDecision | null {
      return lastYieldDecision.get(vehicleId) ?? null;
    },
    stopQueues(): Readonly<Record<string, readonly string[]>> {
      const result: Record<string, readonly string[]> = {};
      for (const [junctionId, queue] of stopQueue)
        result[junctionId] = Object.freeze(
          [...queue.entries()]
            .sort(
              ([leftId, leftTick], [rightId, rightTick]) =>
                leftTick - rightTick || (leftId < rightId ? -1 : leftId > rightId ? 1 : 0),
            )
            .map(([vehicleId]) => vehicleId),
        );
      return Object.freeze(result);
    },
    noteLaneChange(vehicleId: string, applied: boolean): void {
      live();
      if (applied) counters.laneApplied += 1;
      else counters.laneOtherRefusals += 1;
      void vehicleId;
    },
    noteRecovery(vehicleId: string, applied: boolean): void {
      live();
      if (applied) counters.recoveriesApplied += 1;
      void vehicleId;
    },
    report(): LiveTrafficRulesReport {
      return Object.freeze({
        version: LIVE_TRAFFIC_RULES_VERSION,
        tick: lastTick ?? 0,
        mapId: map.mapId,
        actors: lastActorCount,
        signals: Object.freeze({
          programs: map.signals.length,
          movements: currentSignals.length,
          phaseChanges: controllerPhaseChanges,
          redHolds: counters.redHolds,
          redStops: counters.redStops,
          redProceedByProfile: counters.redProceedByProfile,
          greenStartDelays: counters.greenStartDelays,
        }),
        stop: Object.freeze({
          approaches: counters.stopApproaches,
          fullStops: counters.fullStops,
          rollingStops: counters.rollingStops,
          lineCrossings: counters.lineCrossings,
          trafficCausedStops: counters.trafficCausedStops,
          holds: counters.stopHolds,
        }),
        yield: Object.freeze({
          checks: counters.yieldChecks,
          holds: counters.yieldHolds,
          accepted: counters.yieldAccepted,
          unknown: counters.yieldUnknown,
          deadlockBreaks: counters.yieldDeadlockBreaks,
        }),
        laneChange: Object.freeze({
          attempts: counters.laneAttempts,
          validated: counters.laneValidated,
          applied: counters.laneApplied,
          refusedFrontGap: counters.laneRefusedFront,
          refusedBackGap: counters.laneRefusedBack,
          refusedAdvantage: counters.laneRefusedAdvantage,
          refusedCooldown: counters.laneRefusedCooldown,
          otherRefusals: counters.laneOtherRefusals,
        }),
        blocked: Object.freeze({
          episodes: counters.blockedEpisodes,
          rerouteRequests: counters.rerouteRequests,
          recoveryRequests: counters.recoveryRequests,
          stayBlocked: counters.stayBlocked,
          applied: counters.recoveriesApplied,
          stalledRecoveries: counters.stalledRecoveries,
        }),
        violations: Object.freeze({
          total: counters.redLightViolations + counters.stopLineViolations,
          redLight: counters.redLightViolations,
          stopLine: counters.stopLineViolations,
        }),
        cost: summarize(costSamples),
        retainedHistory: 0 as const,
        disposed,
      });
    },
    getStats() {
      return Object.freeze({
        controller: controller?.getStats() ?? {
          tick: lastTick ?? 0,
          signals: 0,
          phases: 0,
          stateEntries: 0,
          pendingEvents: 0,
          disposed: false,
        },
        stopVehicles: stopRules.getStats().vehicles,
        retainedActors: lastActorCount,
        retainedViolations: violationsStore.events.length,
        samples: costSamples.length,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      controller?.dispose();
      controller = null;
      stopRules.dispose();
      laneState.clear();
      blockedState.clear();
      decisionPhase.clear();
      lastReason.clear();
      lastStopEpisode.clear();
      lastSignalDistance.clear();
      lastFullStop.clear();
      releasedStop.clear();
      yieldSince.clear();
      lastYieldDecision.clear();
      stallSince.clear();
      decisionCommand.clear();
      violationsStore.events.length = 0;
      violationsStore.byId.clear();
      currentSignals = Object.freeze([]);
      lastFrame = null;
      if (ownsBus) bus.dispose();
    },
  });
}
