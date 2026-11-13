import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import { ROUTE_POLICY_V2_LIMITS, evaluateRoutePolicyV2 } from '../../src/autonomy/route-policy-v2';
import type {
  RoutePolicyV2Alternative,
  RoutePolicyV2Command,
  RoutePolicyV2Key,
  RoutePolicyV2Observation,
  RoutePolicyV2Recovery,
} from '../../src/autonomy/route-policy-v2';
import type {
  RouteV2EvidenceEpisode,
  RouteV2EvidenceRoute,
  RouteV2EvidenceSample,
} from '../../src/learning/route-v2-estimator';
import { routeV2PolicyActive } from '../../src/learning/route-v2-estimator';
import type { EligibilityWindowRecord, FilteredWindowRecord } from '../../src/telemetry';
import { createLaneGraph, createRoutePlanner } from '../../src/world';
import type { GeometryPath, Lane, LaneGraph, RoadMap, RoutePlanner } from '../../src/world';
import { routePolicyProfile } from '../autonomy/route-policy-v2-reference';

/**
 * Deterministic 182 fixtures. Every alternative is produced by the delivered `041` planner over the
 * authored map below, so its length, free-flow time and free-flow speed are real directed geometry
 * facts and the 3.6 km detours are real authored corridors, never hand-written numbers. Every
 * decision is then produced by the delivered `181-route-policy-v2` layer with a known key set, and
 * the resulting command facts become the evidence samples. The estimator therefore measures exactly
 * the behaviour the policy emitted, never the profile: a scene that never reaches a key's own branch
 * can only leave that key `UNOBSERVED`.
 *
 * The values are plausible demonstrations, not measured data: they prove the context, uncertainty,
 * split and refusal contract of the learning layer, not the final calibration.
 */
export const routeEvidenceScene = Object.freeze({
  sessionId: '182-test',
  worldEpoch: 0,
  actor: { id: 'car', incarnation: 1 } as BehaviorActor,
  scope: { sessionId: '182-test', worldEpoch: 0 } as BehaviorScope,
  seed: 0x5eed_0182,
});
export const TRUE_ROUTE_PROFILE: Readonly<Record<RoutePolicyV2Key, number>> = Object.freeze({
  route_time_weight: 0.6,
  route_distance_weight: 0.3,
  route_turn_penalty: 2,
  route_signal_penalty: 5,
  route_congestion_penalty: 0.5,
  reroute_patience: 20,
  u_turn_willingness: 0.12,
  reverse_recovery_duration: 4,
});

export interface LearnerCorridor {
  readonly id: string;
  /** Authored length of the corridor lane, m: the planner measures exactly this. */
  readonly lengthM: number;
  readonly limitMps: number;
  readonly roadClass: 'URBAN' | 'RESIDENTIAL';
  readonly uTurn: boolean;
}
/**
 * The fan: one shared entry lane, one corridor lane per alternative and one shared exit lane. Two
 * corridors are always comparable alternatives of the same origin and destination, and a corridor is
 * isolated by blocking the lanes of the others, so the planner — not the fixture — owns the path.
 *
 * The corridors are chosen so every perceived cost can be traded against a length: the penalty pairs
 * share a speed limit, so their time and distance terms are collinear, and the time/distance pairs
 * oppose a short slow street to a long fast one on both sides of the authored preference.
 */
export const LEARNER_CORRIDORS: readonly LearnerCorridor[] = Object.freeze([
  { id: 'td-short', lengthM: 300, limitMps: 5, roadClass: 'URBAN', uTurn: false },
  { id: 'td-mid-a', lengthM: 600, limitMps: 15.263, roadClass: 'URBAN', uTurn: false },
  { id: 'td-mid-b', lengthM: 600, limitMps: 14.545, roadClass: 'URBAN', uTurn: false },
  { id: 'td-long-a', lengthM: 570, limitMps: 15, roadClass: 'URBAN', uTurn: false },
  { id: 'td-long-b', lengthM: 630, limitMps: 15, roadClass: 'URBAN', uTurn: false },
  { id: 'turn-short', lengthM: 300, limitMps: 10, roadClass: 'URBAN', uTurn: false },
  { id: 'turn-long-a', lengthM: 2100, limitMps: 10, roadClass: 'URBAN', uTurn: false },
  { id: 'turn-long-b', lengthM: 2460, limitMps: 10, roadClass: 'RESIDENTIAL', uTurn: false },
  { id: 'signal-short', lengthM: 300, limitMps: 10, roadClass: 'URBAN', uTurn: false },
  { id: 'signal-long-a', lengthM: 1800, limitMps: 10, roadClass: 'URBAN', uTurn: false },
  { id: 'signal-long-b', lengthM: 2100, limitMps: 10, roadClass: 'RESIDENTIAL', uTurn: false },
  { id: 'congestion-short', lengthM: 300, limitMps: 10, roadClass: 'URBAN', uTurn: false },
  { id: 'congestion-long-a', lengthM: 360, limitMps: 10, roadClass: 'URBAN', uTurn: false },
  { id: 'congestion-long-b', lengthM: 390, limitMps: 10, roadClass: 'URBAN', uTurn: false },
  { id: 'u-direct', lengthM: 300, limitMps: 10, roadClass: 'URBAN', uTurn: false },
  { id: 'u-turn', lengthM: 300, limitMps: 12, roadClass: 'URBAN', uTurn: true },
]);
function corridorById(id: string): LearnerCorridor {
  const corridor = LEARNER_CORRIDORS.find((entry) => entry.id === id);
  if (corridor === undefined) throw new Error(`Unknown learner corridor ${id}`);
  return corridor;
}
/** The shared entry and exit lanes use one limit, so their cost is a constant of every pair. */
const SHARED_LIMIT_MPS = 10;
/**
 * The V-shaped corridor: every corridor starts at the fan node and merges at the shared node, so the
 * continuation endpoint matches while the polyline length is exactly the authored length. The bend is
 * solved from `sqrt(d² + 10²) + d = L`, so the planner measures `L` and not an approximation.
 */
function bendOffset(lengthM: number): number {
  return (lengthM * lengthM - 100) / (2 * lengthM);
}
export function learnerMap(): RoadMap {
  const nodes = [
      { id: 'origin', positionM: { x: -1, y: 0, z: 0 } },
      { id: 'fan', positionM: { x: 0, y: 0, z: 0 } },
      { id: 'merge', positionM: { x: 0, y: 0, z: 10 } },
      { id: 'destination', positionM: { x: 1, y: 0, z: 10 } },
      { id: 'service-a', positionM: { x: 0, y: 0, z: 9 } },
      { id: 'service-b', positionM: { x: 2, y: 0, z: 9 } },
      { id: 'service-c', positionM: { x: 2, y: 0, z: 11 } },
      ...LEARNER_CORRIDORS.map((corridor) => ({
        id: `${corridor.id}-bend`,
        positionM: { x: -bendOffset(corridor.lengthM), y: 0, z: 10 },
      })),
    ],
    paths: GeometryPath[] = [
      { id: 'origin-path', nodeIds: ['origin', 'fan'] },
      { id: 'destination-path', nodeIds: ['merge', 'destination'] },
      ...LEARNER_CORRIDORS.map((corridor) => ({
        id: `${corridor.id}-path`,
        nodeIds: ['fan', `${corridor.id}-bend`, 'merge'],
      })),
    ],
    lanes: Lane[] = [
      {
        id: 'origin-lane',
        geometryId: 'origin-path',
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: SHARED_LIMIT_MPS,
        access: ['CIVIL'],
        neighbors: { left: null, right: null },
        successorIds: LEARNER_CORRIDORS.map((corridor) => corridor.id),
        fromIntersectionId: null,
        toIntersectionId: null,
      },
      ...LEARNER_CORRIDORS.map((corridor) => ({
        id: corridor.id,
        geometryId: `${corridor.id}-path`,
        direction: 'FORWARD' as const,
        widthM: 3.5,
        speedLimitMps: corridor.limitMps,
        access: ['CIVIL' as const],
        neighbors: { left: null, right: null },
        successorIds: ['destination-lane'],
        fromIntersectionId: null,
        toIntersectionId: null,
      })),
      {
        id: 'destination-lane',
        geometryId: 'destination-path',
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: SHARED_LIMIT_MPS,
        access: ['CIVIL'],
        neighbors: { left: null, right: null },
        successorIds: [],
        fromIntersectionId: null,
        toIntersectionId: null,
      },
    ];
  return {
    schemaVersion: 1,
    units: 'SI',
    mapId: '182-route-fan-v1',
    bounds: {
      minM: { x: -1400, y: -10, z: -100 },
      maxM: { x: 100, y: 10, z: 100 },
    },
    geometry: {
      nodes,
      paths,
      areas: [{ id: 'service-area', vertexNodeIds: ['service-a', 'service-b', 'service-c'] }],
    },
    lanes,
    intersections: [],
    signals: [],
    stopLines: [],
    crosswalks: [],
    serviceZones: [
      {
        id: 'service-zone',
        geometryId: 'service-area',
        laneId: 'destination-lane',
        anchorNodeId: 'destination',
        access: ['CIVIL'],
        kind: 'BOTH',
      },
    ],
    recoveryPoints: [],
  };
}
export function learnerFixture(): { map: RoadMap; graph: LaneGraph } {
  const map = learnerMap();
  return { map, graph: createLaneGraph(map) };
}
function plannerFor(corridorId: string): RoutePlanner {
  const { map, graph } = learnerFixture();
  return createRoutePlanner({
    graph,
    map,
    graphVersion: '182-route-fan-v1',
    costVersion: '182-route-fan-cost-v1',
    blocked: LEARNER_CORRIDORS.filter((corridor) => corridor.id !== corridorId).map(
      (corridor) => corridor.id,
    ),
  });
}
export interface LearnerRouteFacts {
  readonly id: string;
  readonly path: readonly string[];
  readonly lengthM: number;
  readonly travelTimeS: number;
  readonly freeFlowSpeedMps: number;
}
const facts = new Map<string, LearnerRouteFacts>();
/** The delivered facts of one corridor: planned by 041 over the authored geometry, never asserted. */
export function corridorFacts(corridorId: string): LearnerRouteFacts {
  const known = facts.get(corridorId);
  if (known !== undefined) return known;
  const { map, graph } = learnerFixture(),
    plan = plannerFor(corridorId).findRoute({
      origin: 'origin-lane',
      destination: 'destination-lane',
      access: 'CIVIL',
    });
  if (plan.status !== 'READY' || plan.path === null)
    throw new Error(`Fixture corridor ${corridorId} is not ready: ${plan.status}`);
  let lengthM = 0,
    travelTimeS = 0;
  for (const laneId of plan.path) {
    const lane = map.lanes.find((entry) => entry.id === laneId),
      path = graph.getDirectedPath(laneId);
    if (lane === undefined || path === null) throw new Error(`Fixture lane ${laneId} is missing`);
    lengthM += path.lengthM;
    travelTimeS += path.lengthM / Math.max(lane.speedLimitMps, 1);
  }
  const result: LearnerRouteFacts = Object.freeze({
    id: corridorId,
    path: plan.path,
    lengthM,
    travelTimeS,
    freeFlowSpeedMps: lengthM / travelTimeS,
  });
  facts.set(corridorId, result);
  return result;
}
/** One alternative of a scene: a real corridor plus the facts the world declares for it. */
export interface LearnerRoute {
  readonly id: string;
  readonly turns?: number;
  readonly signals?: number;
  readonly congestionDelayS?: number;
}
export function alternativeOf(route: LearnerRoute): RoutePolicyV2Alternative {
  const corridor = corridorById(route.id),
    fact = corridorFacts(route.id);
  return Object.freeze({
    id: route.id,
    lengthM: fact.lengthM,
    travelTimeS: fact.travelTimeS,
    freeFlowSpeedMps: fact.freeFlowSpeedMps,
    roadClass: corridor.roadClass,
    turns: route.turns ?? 0,
    signals: route.signals ?? 0,
    congestionDelayS: route.congestionDelayS ?? 0,
    uTurn: corridor.uTurn,
  });
}
export interface LearnerDecision {
  readonly routes: readonly LearnerRoute[];
  readonly tick: number;
  readonly opportunityKey: string;
  readonly currentRouteId?: string | null;
  readonly waitingSinceTick?: number | null;
  readonly uTurn?: 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN';
  readonly recovery?: RoutePolicyV2Recovery;
}
/** Runs the real planner facts through the real 181 layer with the requested profile. */
export function decide(
  decision: LearnerDecision,
  rValues: Partial<Record<RoutePolicyV2Key, number>> = TRUE_ROUTE_PROFILE,
): RoutePolicyV2Command {
  const observation: RoutePolicyV2Observation = {
    version: ROUTE_POLICY_V2_LIMITS.observationVersion,
    units: 'SI',
    ...routeEvidenceScene.scope,
    actor: routeEvidenceScene.actor,
    tick: decision.tick,
    originId: 'origin',
    destinationId: 'destination',
    currentRouteId: decision.currentRouteId ?? null,
    waitingSinceTick: decision.waitingSinceTick ?? null,
    uTurn: decision.uTurn ?? 'FORBIDDEN',
    recovery: decision.recovery ?? { required: false, reverseClear: true },
  };
  return evaluateRoutePolicyV2({
    ...routeEvidenceScene.scope,
    actor: routeEvidenceScene.actor,
    decisionTick: decision.tick,
    authority: 'AUTO',
    seed: routeEvidenceScene.seed,
    opportunityKey: decision.opportunityKey,
    profile: routePolicyProfile({ ...rValues }),
    observation,
    alternatives: decision.routes.map(alternativeOf),
  });
}
/** The delivered command, projected onto the evidence sample: no score and no profile weight. */
export function sampleOf(command: RoutePolicyV2Command): RouteV2EvidenceSample {
  const routes: RouteV2EvidenceRoute[] = command.routes.map((route) => ({
    id: route.id,
    lengthM: route.lengthM,
    travelTimeS: route.travelTimeS,
    styleTimeS: route.styleTimeS,
    turns: route.turns,
    signals: route.signals,
    congestionDelayS: route.congestionDelayS,
    uTurn: route.uTurn,
    admitted: route.admitted,
  }));
  return {
    tick: command.decisionTick,
    policyActive: routeV2PolicyActive(command.reason),
    reason: command.reason,
    action: command.action,
    referenceSeconds: command.referenceSeconds ?? 0,
    referenceMetres: command.referenceMetres ?? 0,
    currentRouteId: command.currentRouteId,
    candidateRouteId: command.candidateRouteId,
    selectedRouteId: command.selectedRouteId,
    reroute: {
      decision: command.reroute.decision,
      elapsedTicks: command.reroute.elapsedTicks,
      patienceTicks: command.reroute.patienceTicks,
      remainingTicks: command.reroute.remainingTicks,
    },
    uTurn: {
      permission: command.uTurn.permission,
      sample: command.uTurn.sample,
      admitted: command.uTurn.admitted,
    },
    recovery: {
      required: command.recovery.required,
      reverseClear: command.recovery.reverseClear,
      committed: command.recovery.committed,
      durationS: command.recovery.durationS,
      floored: command.recovery.floored,
    },
    routes,
  };
}
export function routeEligibility(
  opportunityId: string,
  overrides: Partial<EligibilityWindowRecord> = {},
): EligibilityWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    opportunityId,
    kind: 'LANE_CHANGE',
    reason: 'NO_CONSTRAINT',
    source: 'NONE',
    observable: true,
    vehicleId: 'car',
    incarnation: '1',
    segmentId: 'segment-182',
    controlMode: 'LEARNING',
    learningEligible: true,
    openedTick: 0,
    lastTick: 100_000,
    observationCount: 100_000,
    reaction: { open: false, reason: 'SEGMENT_EXCLUDED' },
    windowClass: 'ELIGIBLE',
    label: 'FREE_TRAFFIC',
    ...overrides,
  } as EligibilityWindowRecord;
}
export function routeArtifacts(
  opportunityId: string,
  fromTick: number,
  toTick: number,
): FilteredWindowRecord {
  return {
    windowId: `window-${opportunityId}`,
    sessionId: routeEvidenceScene.sessionId,
    worldEpoch: routeEvidenceScene.worldEpoch,
    segmentId: 'segment-182',
    vehicleId: 'car',
    incarnation: '1',
    controlMode: 'LEARNING',
    learningEligible: true,
    startTick: fromTick,
    endTick: toTick,
    completeness: 'COMPLETE',
    completenessReason: 'SEGMENT_CLOSED',
    artifacts: [],
    artifactCount: 0,
    boundaryTick: null,
    boundaryCause: null,
    suppressed: null,
    openedTick: fromTick,
    lastTick: toTick,
    observationCount: toTick - fromTick + 1,
    windowClass: 'PREFIX_ELIGIBLE',
    prefix: { fromTick, toTick, ticks: toTick - fromTick + 1 },
  } as FilteredWindowRecord;
}
export function evidenceEpisode(
  id: string,
  commands: readonly RoutePolicyV2Command[],
  occurrence = 0,
): RouteV2EvidenceEpisode {
  if (commands.length === 0) throw new Error(`Episode ${id} has no command`);
  const samples = commands.map(sampleOf),
    first = samples[0]!.tick,
    last = samples[samples.length - 1]!.tick;
  return {
    episodeId: id,
    occurrence,
    eligibility: routeEligibility(id),
    artifacts: routeArtifacts(id, first, last),
    samples,
  };
}
export type WeightGroup = 'rho' | 'turn' | 'signal' | 'congestion';
export type WeightPair = readonly [LearnerRoute, LearnerRoute];
/**
 * The four demonstrated trade-offs. Each pair is a real corridor pair of the fan; the penalty pairs
 * share a speed limit, so only the declared count and the length can trade against each other.
 */
export const weightPairs: Readonly<Record<WeightGroup, readonly WeightPair[]>> = Object.freeze({
  rho: Object.freeze([
    [{ id: 'td-short' }, { id: 'td-mid-a' }] as WeightPair,
    [{ id: 'td-short' }, { id: 'td-mid-b' }] as WeightPair,
  ]),
  turn: Object.freeze([
    [
      { id: 'turn-short', turns: 3 },
      { id: 'turn-long-a', turns: 0 },
    ] as WeightPair,
    [
      { id: 'turn-short', turns: 3 },
      { id: 'turn-long-b', turns: 0 },
    ] as WeightPair,
  ]),
  signal: Object.freeze([
    [
      { id: 'signal-short', signals: 1 },
      { id: 'signal-long-a', signals: 0 },
    ] as WeightPair,
    [
      { id: 'signal-short', signals: 1 },
      { id: 'signal-long-b', signals: 0 },
    ] as WeightPair,
  ]),
  congestion: Object.freeze([
    [{ id: 'congestion-short', congestionDelayS: 12 }, { id: 'congestion-long-a' }] as WeightPair,
    [{ id: 'congestion-short', congestionDelayS: 12 }, { id: 'congestion-long-b' }] as WeightPair,
  ]),
});
/** One weight episode: both opposing decisions of a group, at two consecutive ticks. */
export function weightEpisode(
  id: string,
  group: WeightGroup,
  tick: number,
  rValues: Partial<Record<RoutePolicyV2Key, number>> = TRUE_ROUTE_PROFILE,
  pairs: readonly WeightPair[] = weightPairs[group],
): RouteV2EvidenceEpisode {
  const commands = pairs.map((routes, index) =>
    decide({ routes, tick: tick + index, opportunityKey: `opportunity-${id}-${index}` }, rValues),
  );
  return evidenceEpisode(id, commands);
}
/** The reroute arc: the current short route is admissible, the better one waits for patience. */
export function patienceCommands(
  id: string,
  elapsed: readonly number[],
  rValues: Partial<Record<RoutePolicyV2Key, number>> = TRUE_ROUTE_PROFILE,
  tick = 20_000,
): RoutePolicyV2Command[] {
  return elapsed.map((ticks, index) =>
    decide(
      {
        routes: [{ id: 'td-short' }, { id: 'td-long-a' }],
        tick: tick + index,
        currentRouteId: 'td-short',
        waitingSinceTick: tick + index - ticks,
        opportunityKey: `opportunity-${id}-${index}`,
      },
      rValues,
    ),
  );
}
/** Scans real opportunities and returns the first whose deterministic U-turn sample is in range. */
export function uTurnOpportunities(count: number, minimum: number, maximum: number): string[] {
  const selected: string[] = [];
  for (let index = 0; index < 400 && selected.length < count; index++) {
    const opportunityKey = `u-opportunity-${index}`,
      command = decide({
        routes: [{ id: 'u-direct' }, { id: 'u-turn' }],
        tick: 40_000 + index,
        opportunityKey,
        uTurn: 'PERMITTED',
      }),
      sample = command.uTurn.sample;
    if (sample !== null && sample >= minimum && sample <= maximum) selected.push(opportunityKey);
  }
  if (selected.length < count)
    throw new Error(`Only ${selected.length} U-turn opportunities in [${minimum}, ${maximum}]`);
  return selected;
}
/** One U-turn episode per selected opportunity, at the authored willingness. */
export function uTurnEpisodes(
  prefix: string,
  opportunities: readonly string[],
  rValues: Partial<Record<RoutePolicyV2Key, number>> = TRUE_ROUTE_PROFILE,
  permission: 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN' = 'PERMITTED',
  tick = 50_000,
): RouteV2EvidenceEpisode[] {
  return opportunities.map((opportunityKey, index) =>
    evidenceEpisode(
      `${prefix}-${index}`,
      [
        decide(
          {
            routes: [{ id: 'u-direct' }, { id: 'u-turn' }],
            tick: tick + index,
            opportunityKey,
            uTurn: permission,
          },
          rValues,
        ),
      ],
      index,
    ),
  );
}
/** One recovery episode: the world asks for a reverse recovery and declares the space clear. */
export function recoveryEpisodes(
  prefix: string,
  count: number,
  rValues: Partial<Record<RoutePolicyV2Key, number>> = TRUE_ROUTE_PROFILE,
  reverseClear = true,
): RouteV2EvidenceEpisode[] {
  return Array.from({ length: count }, (_, index) =>
    evidenceEpisode(
      `${prefix}-${index}`,
      [
        decide(
          {
            routes: [{ id: 'u-direct' }],
            tick: 60_000 + index,
            opportunityKey: `opportunity-${prefix}-${index}`,
            recovery: { required: true, reverseClear },
          },
          rValues,
        ),
      ],
      index,
    ),
  );
}
const WEIGHT_EPISODES_PER_GROUP = 4,
  RATIO_EPISODE_TICKS = 1_000,
  PATIENCE_EPISODES = 4,
  PATIENCE_TICK = 20_000,
  RECOVERY_EPISODES = 4;
/** The positive set: every key reaches its own branch with the authored profile. */
export function positiveEpisodes(): RouteV2EvidenceEpisode[] {
  const episodes: RouteV2EvidenceEpisode[] = [],
    groups: readonly WeightGroup[] = Object.freeze(['rho', 'turn', 'signal', 'congestion']);
  for (let index = 0; index < WEIGHT_EPISODES_PER_GROUP; index++)
    for (const [groupIndex, group] of groups.entries())
      episodes.push(
        weightEpisode(
          `${group}-episode-${index}`,
          group,
          RATIO_EPISODE_TICKS * (groupIndex + 1) + index * 10,
        ),
      );
  for (let index = 0; index < PATIENCE_EPISODES; index++)
    episodes.push(
      evidenceEpisode(
        `patience-episode-${index}`,
        patienceCommands(
          `patience-${index}`,
          Array.from({ length: 7 }, (_, offset) => 1_197 + offset),
          TRUE_ROUTE_PROFILE,
          PATIENCE_TICK + index * 20,
        ),
        index,
      ),
    );
  episodes.push(
    ...uTurnEpisodes(
      'u-turn',
      [...uTurnOpportunities(2, 0.06, 0.115), ...uTurnOpportunities(2, 0.125, 0.2)],
      TRUE_ROUTE_PROFILE,
      'PERMITTED',
      50_000,
    ),
  );
  episodes.push(...recoveryEpisodes('recovery', RECOVERY_EPISODES));
  return episodes;
}
/** The same decisions authored at a fraction of the weights: 181 emits byte identical commands. */
export function scaledEpisodes(factor = 10): RouteV2EvidenceEpisode[] {
  const scaled: Partial<Record<RoutePolicyV2Key, number>> = {
    ...TRUE_ROUTE_PROFILE,
    route_time_weight: (TRUE_ROUTE_PROFILE.route_time_weight * factor) / 10,
    route_distance_weight: (TRUE_ROUTE_PROFILE.route_distance_weight * factor) / 10,
    route_turn_penalty: (TRUE_ROUTE_PROFILE.route_turn_penalty * factor) / 10,
    route_signal_penalty: (TRUE_ROUTE_PROFILE.route_signal_penalty * factor) / 10,
    route_congestion_penalty: (TRUE_ROUTE_PROFILE.route_congestion_penalty * factor) / 10,
  };
  const episodes: RouteV2EvidenceEpisode[] = [];
  for (const group of ['rho', 'turn', 'signal', 'congestion'] as const)
    for (let index = 0; index < WEIGHT_EPISODES_PER_GROUP; index++)
      episodes.push(weightEpisode(`${group}-scaled-${index}`, group, 70_000 + index * 10, scaled));
  return episodes;
}
/** Only the lower side of the time/distance ratio: the ratio is a bound, not a value. */
export function oneSidedRhoEpisodes(): RouteV2EvidenceEpisode[] {
  const episodes: RouteV2EvidenceEpisode[] = [];
  for (let index = 0; index < WEIGHT_EPISODES_PER_GROUP; index++) {
    episodes.push(
      weightEpisode(`rho-lower-${index}`, 'rho', 1_000 + index * 10, TRUE_ROUTE_PROFILE, [
        [{ id: 'td-short' }, { id: 'td-mid-a' }],
      ]),
    );
    for (const group of ['turn', 'signal', 'congestion'] as const)
      episodes.push(weightEpisode(`${group}-only-${index}`, group, 2_000 + index * 10));
  }
  return episodes;
}
/** A one-sided turn trade-off: the shared budget cannot be formed, so no share is identified. */
export function oneSidedTurnEpisodes(): RouteV2EvidenceEpisode[] {
  const episodes: RouteV2EvidenceEpisode[] = [];
  for (let index = 0; index < WEIGHT_EPISODES_PER_GROUP; index++) {
    episodes.push(
      weightEpisode(`turn-lower-${index}`, 'turn', 3_000 + index * 10, TRUE_ROUTE_PROFILE, [
        [
          { id: 'turn-short', turns: 3 },
          { id: 'turn-long-a', turns: 0 },
        ],
      ]),
    );
    for (const group of ['rho', 'signal', 'congestion'] as const)
      episodes.push(weightEpisode(`${group}-with-turn-${index}`, group, 3_500 + index * 10));
  }
  return episodes;
}
/** Two different drivers: the lower bound of one contradicts the upper bound of the other. */
export function contradictoryRhoEpisodes(): RouteV2EvidenceEpisode[] {
  const high: Partial<Record<RoutePolicyV2Key, number>> = {
      ...TRUE_ROUTE_PROFILE,
      route_time_weight: 0.9,
      route_distance_weight: 0.3,
    },
    low: Partial<Record<RoutePolicyV2Key, number>> = {
      ...TRUE_ROUTE_PROFILE,
      route_time_weight: 0.3,
      route_distance_weight: 0.3,
    },
    episodes: RouteV2EvidenceEpisode[] = [];
  for (let index = 0; index < WEIGHT_EPISODES_PER_GROUP; index++) {
    episodes.push(
      weightEpisode(`rho-high-${index}`, 'rho', 4_000 + index * 10, high, [
        [{ id: 'td-short' }, { id: 'td-mid-b' }],
      ]),
      weightEpisode(`rho-low-${index}`, 'rho', 5_000 + index * 10, low, [
        [{ id: 'td-short' }, { id: 'td-mid-a' }],
      ]),
    );
    for (const group of ['turn', 'signal', 'congestion'] as const)
      episodes.push(weightEpisode(`${group}-consistent-${index}`, group, 5_500 + index * 10));
  }
  return episodes;
}
/** The window ends while the reroute still waits: the patience is censored, not zero. */
export function censoredPatienceEpisodes(): RouteV2EvidenceEpisode[] {
  const patience: Partial<Record<RoutePolicyV2Key, number>> = {
    ...TRUE_ROUTE_PROFILE,
    reroute_patience: 120,
  };
  return Array.from({ length: PATIENCE_EPISODES }, (_, index) =>
    evidenceEpisode(
      `patience-censored-${index}`,
      patienceCommands(`patience-censored-${index}`, [100, 200, 300], patience),
      index,
    ),
  );
}
/** The shortest patience the catalog can express: the switch commits on tick 120. */
export function floorPatienceEpisodes(): RouteV2EvidenceEpisode[] {
  const patience: Partial<Record<RoutePolicyV2Key, number>> = {
    ...TRUE_ROUTE_PROFILE,
    reroute_patience: 2,
  };
  return Array.from({ length: PATIENCE_EPISODES }, (_, index) =>
    evidenceEpisode(
      `patience-floor-${index}`,
      patienceCommands(
        `patience-floor-${index}`,
        Array.from({ length: 5 }, (_, offset) => 118 + offset),
        patience,
      ),
      index,
    ),
  );
}
/** The recovery is committed on the 2.5 s floor: the whole 0–2.5 s band is hidden. */
export function floorRecoveryEpisodes(): RouteV2EvidenceEpisode[] {
  const recovery: Partial<Record<RoutePolicyV2Key, number>> = {
    ...TRUE_ROUTE_PROFILE,
    reverse_recovery_duration: 2,
  };
  return recoveryEpisodes('recovery-floor', RECOVERY_EPISODES, recovery);
}
/** No declared clearance behind: the world commands nothing, so nothing is measured. */
export function blockedRecoveryEpisodes(): RouteV2EvidenceEpisode[] {
  return recoveryEpisodes('recovery-blocked', RECOVERY_EPISODES, TRUE_ROUTE_PROFILE, false);
}
/** A constant refusal at opportunities sampled below the uncertainty threshold: zero demonstrated. */
export function refusedUTurnEpisodes(): RouteV2EvidenceEpisode[] {
  const unwilling: Partial<Record<RoutePolicyV2Key, number>> = {
    ...TRUE_ROUTE_PROFILE,
    u_turn_willingness: 0,
  };
  return uTurnEpisodes(
    'u-turn-refused',
    uTurnOpportunities(4, 0.01, 0.24),
    unwilling,
    'PERMITTED',
    80_000,
  );
}
/** Permission forbidden: 181 draws no sample at all. */
export function forbiddenUTurnEpisodes(): RouteV2EvidenceEpisode[] {
  return uTurnEpisodes(
    'u-turn-forbidden',
    ['forbidden-1', 'forbidden-2', 'forbidden-3', 'forbidden-4'],
    TRUE_ROUTE_PROFILE,
    'FORBIDDEN',
    82_000,
  );
}
/** MANUAL episodes never learn, whatever they demonstrate. */
export function manualEpisodes(): RouteV2EvidenceEpisode[] {
  return positiveEpisodes().map((episode) => ({
    ...episode,
    eligibility: {
      ...episode.eligibility,
      controlMode: 'MANUAL',
      learningEligible: false,
    } as EligibilityWindowRecord,
  }));
}
/** A window whose first artifact sits at its first tick has no usable prefix. */
export function suppressedEpisodes(): RouteV2EvidenceEpisode[] {
  return positiveEpisodes().map((episode) => ({
    ...episode,
    artifacts: {
      ...episode.artifacts,
      windowClass: 'FULLY_SUPPRESSED',
      prefix: null,
    } as FilteredWindowRecord,
  }));
}
