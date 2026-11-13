import type { BehaviorActor, BehaviorScope } from '../../src/autonomy/behavior-fsm';
import {
  ROUTE_POLICY_V2_LIMITS,
  compileRoutePolicyProfile,
  evaluateRoutePolicyV2,
} from '../../src/autonomy/route-policy-v2';
import type {
  RoutePolicyRoadClass,
  RoutePolicyV2Alternative,
  RoutePolicyV2Command,
  RoutePolicyV2Input,
  RoutePolicyV2Key,
  RoutePolicyV2MKey,
  RoutePolicyV2Observation,
  RoutePolicyV2Profile,
  RoutePolicyV2Recovery,
} from '../../src/autonomy/route-policy-v2';
import { createLaneGraph, createRoutePlanner } from '../../src/world';
import type { GeometryPath, Lane, LaneGraph, RoadMap, RoutePlanner } from '../../src/world';

/**
 * 181 fixture. The alternatives are not hand-written numbers: every route is planned by the
 * delivered 041 planner over the authored map below, so its length and free-flow time come from the
 * real directed geometry and the authored speed limits, and its congestion delay is the difference
 * between the same search with and without declared traffic weights.
 *
 * The map is a fan: `route-in` feeds every corridor and every corridor merges into `route-out`, so
 * two corridors are always comparable alternatives of the same origin and destination. A corridor
 * is isolated by blocking the lanes of the others, which keeps the planner — not the fixture —
 * responsible for the path.
 *
 * Perceived turns are derived from the geometry (a direction change above 45° between two lanes of
 * the corridor) and declared explicitly only where the scenario needs a junction count the abstract
 * geometry does not model; signals are a declared world fact (a SIGNAL stop line requires an
 * authored intersection with a signal program, which this fixture does not build).
 */
export interface CorridorSpec {
  readonly id: string;
  /** Node chain from the fan-out node to the fan-in node, both included. */
  readonly nodes: readonly string[];
  readonly limitMps: number;
  readonly roadClass: RoutePolicyRoadClass;
  readonly uTurn: boolean;
}
const NODES: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  'rp-in': [-100, 0],
  'rp-a': [0, 0],
  'rp-b': [0, 400],
  'rp-out': [100, 400],
  'short-1': [120, 200],
  'fast-1': [400, 200],
  'heavy-1': [0, 200],
  'light-1': [0, 200],
  'north-1': [57.7, 100],
  'south-1': [-57.7, 100],
  'slow-1': [100, 100],
  'slow-2': [0, 200],
  'slow-3': [100, 300],
  'direct-1': [100, 150],
  'direct-2': [100, 250],
  'uturn-1': [0, 190],
  'uturn-2': [6, 210],
  'zone-1': [-20, 380],
  'zone-2': [20, 380],
  'zone-3': [20, 420],
  'zone-4': [-20, 420],
});
/** Every comparable corridor of the fan. The order is the alternative order of a decision. */
export const CORRIDORS: readonly CorridorSpec[] = Object.freeze([
  {
    id: 'route-short',
    nodes: ['rp-a', 'short-1', 'rp-b'],
    limitMps: 5,
    roadClass: 'URBAN',
    uTurn: false,
  },
  {
    id: 'route-fast',
    nodes: ['rp-a', 'fast-1', 'rp-b'],
    limitMps: 22,
    roadClass: 'URBAN',
    uTurn: false,
  },
  {
    id: 'route-turn-heavy',
    nodes: ['rp-a', 'heavy-1', 'rp-b'],
    limitMps: 10,
    roadClass: 'URBAN',
    uTurn: false,
  },
  {
    id: 'route-turn-light',
    nodes: ['rp-a', 'light-1', 'rp-b'],
    limitMps: 10,
    roadClass: 'URBAN',
    uTurn: false,
  },
  {
    id: 'route-north',
    nodes: ['rp-a', 'north-1', 'rp-b'],
    limitMps: 10,
    roadClass: 'URBAN',
    uTurn: false,
  },
  {
    id: 'route-south',
    nodes: ['rp-a', 'south-1', 'rp-b'],
    limitMps: 10,
    roadClass: 'URBAN',
    uTurn: false,
  },
  {
    id: 'route-slow',
    nodes: ['rp-a', 'slow-1', 'slow-2', 'slow-3', 'rp-b'],
    limitMps: 5,
    roadClass: 'RESIDENTIAL',
    uTurn: false,
  },
  {
    id: 'route-direct',
    nodes: ['rp-a', 'direct-1', 'direct-2', 'rp-b'],
    limitMps: 10,
    roadClass: 'URBAN',
    uTurn: false,
  },
  {
    id: 'route-uturn',
    nodes: ['rp-a', 'uturn-1', 'uturn-2', 'rp-b'],
    limitMps: 20,
    roadClass: 'URBAN',
    uTurn: true,
  },
]);
/** Lane ids of one corridor, in travel order; `route-short-1` is the first lane after the fan-out. */
export function corridorLanes(corridor: CorridorSpec): readonly string[] {
  return corridor.nodes.slice(0, -1).map((node, index) => `${corridor.id}:${index}:${node}`);
}
export function corridorById(id: string): CorridorSpec {
  const corridor = CORRIDORS.find((entry) => entry.id === id);
  if (corridor === undefined) throw new Error(`Unknown corridor ${id}`);
  return corridor;
}
const SHARED = Object.freeze(['route-in', 'route-out']);
export function routePolicyMap(): RoadMap {
  const geometryNodes = Object.entries(NODES).map(([id, [x, z]]) => ({
      id,
      positionM: { x, y: 0, z },
    })),
    paths: GeometryPath[] = [
      { id: 'route-in-path', nodeIds: ['rp-in', 'rp-a'] },
      { id: 'route-out-path', nodeIds: ['rp-b', 'rp-out'] },
    ],
    lanes: Lane[] = [
      {
        id: 'route-in',
        geometryId: 'route-in-path',
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: 10,
        access: ['CIVIL'],
        neighbors: { left: null, right: null },
        successorIds: CORRIDORS.map((corridor) => corridorLanes(corridor)[0]),
        fromIntersectionId: null,
        toIntersectionId: null,
      },
      {
        id: 'route-out',
        geometryId: 'route-out-path',
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: 10,
        access: ['CIVIL'],
        neighbors: { left: null, right: null },
        successorIds: [],
        fromIntersectionId: null,
        toIntersectionId: null,
      },
    ];
  for (const corridor of CORRIDORS) {
    const laneIds = corridorLanes(corridor);
    for (const [index, laneId] of laneIds.entries()) {
      const geometryId = `${laneId}-path`;
      paths.push({ id: geometryId, nodeIds: [corridor.nodes[index], corridor.nodes[index + 1]] });
      lanes.push({
        id: laneId,
        geometryId,
        direction: 'FORWARD',
        widthM: 3.5,
        speedLimitMps: corridor.limitMps,
        access: ['CIVIL'],
        neighbors: { left: null, right: null },
        successorIds: [laneIds[index + 1] ?? 'route-out'],
        fromIntersectionId: null,
        toIntersectionId: null,
      });
    }
  }
  return {
    schemaVersion: 1,
    units: 'SI',
    mapId: '181-route-fan-v1',
    bounds: {
      minM: { x: -200, y: 0, z: -100 },
      maxM: { x: 500, y: 10, z: 500 },
    },
    geometry: {
      nodes: geometryNodes,
      paths,
      areas: [{ id: 'zone-area', vertexNodeIds: ['zone-1', 'zone-2', 'zone-3', 'zone-4'] }],
    },
    lanes,
    intersections: [],
    signals: [],
    stopLines: [],
    crosswalks: [],
    serviceZones: [
      {
        id: 'route-service',
        geometryId: 'zone-area',
        laneId: 'route-out',
        anchorNodeId: 'rp-b',
        access: ['CIVIL'],
        kind: 'BOTH',
      },
    ],
    recoveryPoints: [],
  };
}
export const SHARED_LANES = SHARED;
export function routePolicyFixture(): { map: RoadMap; graph: LaneGraph } {
  const map = routePolicyMap();
  return { map, graph: createLaneGraph(map) };
}
function plannerFor(corridorId: string, traffic?: ReadonlyMap<string, number>): RoutePlanner {
  const { map, graph } = routePolicyFixture(),
    blocked: string[] = [];
  for (const corridor of CORRIDORS)
    if (corridor.id !== corridorId) blocked.push(...corridorLanes(corridor));
  return createRoutePlanner({
    graph,
    map,
    graphVersion: '181-route-fan-v1',
    costVersion: '181-route-fan-cost-v1',
    blocked,
    ...(traffic === undefined ? {} : { trafficSeconds: traffic }),
  });
}
export interface RouteFacts {
  readonly id: string;
  readonly path: readonly string[];
  readonly lengthM: number;
  /** Free-flow time from the authored limits, the delivered 041 lane cost without penalties. */
  readonly travelTimeS: number;
  readonly freeFlowSpeedMps: number;
  /** Sharp direction changes between two lanes of the corridor, > 45°. */
  readonly derivedTurns: number;
  /** The delivered 041 search cost of this route, penalties included. */
  readonly costSeconds: number;
  /** Free-flow time of every lane after the origin: exactly what the 041 search accumulates. */
  readonly deliveredLaneSeconds: number;
  /** Free-flow time of the origin lane, which the 041 search starts from at zero cost. */
  readonly originLaneSeconds: number;
  /** The 041 continuation penalty total: `0.5 s` per non-TURN connection. */
  readonly continuationPenaltyS: number;
  /** `costSeconds − deliveredLaneSeconds`: exactly the 041 connection penalties of this path. */
  readonly penaltySeconds: number;
  readonly signals: number;
  /** Congestion delay declared for this route; zero unless traffic weights are supplied. */
  readonly congestionDelayS: number;
}
const facts = new Map<string, RouteFacts>();
function headingOf(graph: LaneGraph, laneId: string): { x: number; z: number } {
  const path = graph.getDirectedPath(laneId);
  if (path === null) throw new Error(`Missing directed path ${laneId}`);
  const first = path.points[0],
    last = path.points[path.points.length - 1],
    length = Math.hypot(last.x - first.x, last.z - first.z);
  return { x: (last.x - first.x) / length, z: (last.z - first.z) / length };
}
function sharpTurns(graph: LaneGraph, path: readonly string[]): number {
  const own = path.filter((lane) => !SHARED_LANES.includes(lane));
  let turns = 0;
  for (let index = 0; index + 1 < own.length; index++) {
    const from = headingOf(graph, own[index]),
      to = headingOf(graph, own[index + 1]),
      cosine = Math.min(1, Math.max(-1, from.x * to.x + from.z * to.z)),
      degrees = (Math.acos(cosine) * 180) / Math.PI;
    if (degrees > 45) turns += 1;
  }
  return turns;
}
function signalStopLines(map: RoadMap, path: readonly string[]): number {
  return map.stopLines.filter((line) => line.kind === 'SIGNAL' && path.includes(line.laneId))
    .length;
}
/** The delivered facts of one corridor, derived once from the real planner and the real graph. */
export function routeFacts(corridorId: string): RouteFacts {
  const known = facts.get(corridorId);
  if (known !== undefined) return known;
  const { map, graph } = routePolicyFixture(),
    planner = plannerFor(corridorId),
    plan = planner.findRoute({ origin: 'route-in', destination: 'route-out', access: 'CIVIL' });
  if (plan.status !== 'READY' || plan.path === null)
    throw new Error(`Fixture route ${corridorId} is not ready: ${plan.status}`);
  let lengthM = 0,
    travelTimeS = 0,
    deliveredLaneSeconds = 0,
    originLaneSeconds = 0;
  for (const [index, laneId] of plan.path.entries()) {
    const lane = map.lanes.find((entry) => entry.id === laneId),
      path = graph.getDirectedPath(laneId);
    if (lane === undefined || path === null) throw new Error(`Fixture lane ${laneId} is missing`);
    const seconds = path.lengthM / Math.max(lane.speedLimitMps, 1);
    lengthM += path.lengthM;
    travelTimeS += seconds;
    if (index === 0) originLaneSeconds = seconds;
    else deliveredLaneSeconds += seconds;
  }
  const continuationPenaltyS = 0.5 * (plan.path.length - 1),
    result: RouteFacts = Object.freeze({
      id: corridorId,
      path: plan.path,
      lengthM,
      travelTimeS,
      freeFlowSpeedMps: lengthM / travelTimeS,
      derivedTurns: sharpTurns(graph, plan.path),
      costSeconds: plan.costSeconds,
      deliveredLaneSeconds,
      originLaneSeconds,
      continuationPenaltyS,
      penaltySeconds: plan.costSeconds - deliveredLaneSeconds,
      signals: signalStopLines(map, plan.path),
      congestionDelayS: 0,
    });
  facts.set(corridorId, result);
  return result;
}
/**
 * The real congestion delay of one corridor: the difference between the same 041 search with and
 * without declared traffic seconds on every own lane. No rounding, no invented seconds.
 */
export function trafficDelay(corridorId: string, secondsPerLane: number): number {
  const corridor = corridorById(corridorId),
    traffic = new Map(corridorLanes(corridor).map((lane) => [lane, secondsPerLane] as const)),
    queries = { origin: 'route-in', destination: 'route-out', access: 'CIVIL' } as const,
    clean = plannerFor(corridorId).findRoute(queries),
    congested = plannerFor(corridorId, traffic).findRoute(queries);
  if (clean.status !== 'READY' || congested.status !== 'READY')
    throw new Error(`Fixture traffic query for ${corridorId} is not ready`);
  return congested.costSeconds - clean.costSeconds;
}
/** The most permissive admissible 181 configuration: no preference beyond the delivered facts. */
export const neutralRoutePolicyValues = Object.freeze({
  route_time_weight: 0,
  route_distance_weight: 0,
  route_turn_penalty: 0,
  route_signal_penalty: 0,
  route_congestion_penalty: 0,
  reroute_patience: 2,
  u_turn_willingness: 0,
  reverse_recovery_duration: 2,
}) satisfies Readonly<Record<RoutePolicyV2Key, number>>;
/** The catalog defaults, the baseline of every effect row. */
export const defaultRoutePolicyValues = Object.freeze({
  route_time_weight: 0.6,
  route_distance_weight: 0.3,
  route_turn_penalty: 2,
  route_signal_penalty: 5,
  route_congestion_penalty: 0.5,
  reroute_patience: 20,
  u_turn_willingness: 0,
  reverse_recovery_duration: 2,
}) satisfies Readonly<Record<RoutePolicyV2Key, number>>;
/** The two delivered 046 M speed deltas the layer reads. */
export const routePolicyMValues = Object.freeze({
  speed_delta_urban: 0,
  speed_delta_residential: 0,
}) satisfies Readonly<Record<RoutePolicyV2MKey, number>>;
export const scenario = Object.freeze({
  scope: { sessionId: '181-test', worldEpoch: 0 } as BehaviorScope,
  actor: { id: 'car', incarnation: 1 } as BehaviorActor,
  tick: 601,
  seed: 0x5eed_0181,
  opportunityKey: '181-route-opportunity',
  profileId: '181-fixture',
  versionId: '181-fixture-v1',
  engineVersion: '181-route-policy-v2',
});
const unitByKey: Readonly<Record<string, string>> = Object.freeze({
  speed_delta_urban: 'm/s',
  speed_delta_residential: 'm/s',
  route_time_weight: 'weight',
  route_distance_weight: 'weight',
  route_turn_penalty: 's',
  route_signal_penalty: 's',
  route_congestion_penalty: 'ratio',
  reroute_patience: 's',
  u_turn_willingness: 'probability',
  reverse_recovery_duration: 's',
});
export function routePolicyDocument(
  rValues: Partial<Record<RoutePolicyV2Key, number>> = {},
  mValues: Partial<Record<RoutePolicyV2MKey, number>> = {},
  versionId: string = scenario.versionId,
) {
  const parameters: Record<string, number> = {
    ...routePolicyMValues,
    ...mValues,
    ...defaultRoutePolicyValues,
    ...rValues,
  };
  const units = Object.fromEntries(
    Object.keys(parameters).map((key) => {
      const unit = unitByKey[key];
      if (unit === undefined) throw new Error(`Missing unit for ${key}`);
      return [key, unit];
    }),
  );
  return {
    schemaVersion: 1,
    units: 'SI',
    profileId: scenario.profileId,
    versionId,
    parentVersionId: null,
    engineVersion: scenario.engineVersion,
    parameters,
    unitsByParameter: units,
    provenanceByParameter: Object.fromEntries(Object.keys(parameters).map((key) => [key, 'BASE'])),
    evidenceByParameter: Object.fromEntries(Object.keys(parameters).map((key) => [key, null])),
    sourceSegmentIds: [],
    createdAt: '2026-11-13T00:00:00.000Z',
    checksum: `unverified:${versionId}`,
  };
}
export function routePolicyProfile(
  rValues: Partial<Record<RoutePolicyV2Key, number>> = {},
  mValues: Partial<Record<RoutePolicyV2MKey, number>> = {},
): RoutePolicyV2Profile {
  return compileRoutePolicyProfile(routePolicyDocument(rValues, mValues));
}
/** One alternative of a scenario: a real corridor plus the facts the world declares for it. */
export interface ScenarioRoute {
  readonly id: string;
  /** Declared signal count; defaults to the fixture map (no SIGNAL stop lines, so 0). */
  readonly signals?: number;
  /** Declared turn count; defaults to the geometry-derived count. */
  readonly turns?: number;
  /** Declared congestion delay; defaults to the delivered traffic difference. */
  readonly congestionDelayS?: number;
}
export function routeAlternative(spec: ScenarioRoute): RoutePolicyV2Alternative {
  const corridor = corridorById(spec.id),
    fact = routeFacts(spec.id);
  return Object.freeze({
    id: spec.id,
    lengthM: fact.lengthM,
    travelTimeS: fact.travelTimeS,
    freeFlowSpeedMps: fact.freeFlowSpeedMps,
    roadClass: corridor.roadClass,
    turns: spec.turns ?? fact.derivedTurns,
    signals: spec.signals ?? fact.signals,
    congestionDelayS: spec.congestionDelayS ?? fact.congestionDelayS,
    uTurn: corridor.uTurn,
  });
}
export interface RoutePolicyScene {
  readonly name: string;
  readonly description: string;
  readonly routes: readonly ScenarioRoute[];
  readonly currentRouteId?: string | null;
  readonly waitingSinceTick?: number | null;
  readonly uTurn?: 'PERMITTED' | 'FORBIDDEN' | 'UNKNOWN';
  readonly recovery?: RoutePolicyV2Recovery;
}
export function routePolicyObservation(
  scene: RoutePolicyScene,
  tick: number = scenario.tick,
): RoutePolicyV2Observation {
  return {
    version: ROUTE_POLICY_V2_LIMITS.observationVersion,
    units: 'SI',
    ...scenario.scope,
    actor: scenario.actor,
    tick,
    originId: 'route-in',
    destinationId: 'route-out',
    currentRouteId: scene.currentRouteId ?? null,
    waitingSinceTick: scene.waitingSinceTick ?? null,
    uTurn: scene.uTurn ?? 'FORBIDDEN',
    recovery: scene.recovery ?? { required: false, reverseClear: true },
  };
}
export interface RoutePolicyEvaluationOptions {
  readonly tick?: number;
  readonly rValues?: Partial<Record<RoutePolicyV2Key, number>>;
  readonly mValues?: Partial<Record<RoutePolicyV2MKey, number>>;
  readonly authority?: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly seed?: number;
  readonly opportunityKey?: string;
  readonly alternatives?: readonly RoutePolicyV2Alternative[];
  readonly observation?: RoutePolicyV2Observation;
  /** Overrides the compiled token, used to feed a missing, foreign or hand-built profile. */
  readonly profile?: RoutePolicyV2Profile | null;
}
export interface RoutePolicyEvaluation {
  readonly command: RoutePolicyV2Command;
  readonly profile: RoutePolicyV2Profile;
  readonly decisionTick: number;
  readonly input: RoutePolicyV2Input;
}
/** Runs the real planner facts through the 181 layer. */
export function evaluate(
  scene: RoutePolicyScene,
  options: RoutePolicyEvaluationOptions = {},
): RoutePolicyEvaluation {
  const profile = routePolicyProfile(options.rValues, options.mValues),
    decisionTick = options.tick ?? scenario.tick,
    input: RoutePolicyV2Input = {
      ...scenario.scope,
      actor: scenario.actor,
      decisionTick,
      authority: options.authority ?? 'AUTO',
      seed: options.seed ?? scenario.seed,
      opportunityKey: options.opportunityKey ?? scenario.opportunityKey,
      profile: options.profile === undefined ? profile : options.profile,
      observation: options.observation ?? routePolicyObservation(scene, decisionTick),
      alternatives: options.alternatives ?? scene.routes.map((route) => routeAlternative(route)),
    };
  return { command: evaluateRoutePolicyV2(input), profile, decisionTick, input };
}
export function chosenRoute(command: RoutePolicyV2Command) {
  const id = command.candidateRouteId;
  return command.routes.find((route) => route.id === id) ?? null;
}
/** The scenario table: one isolated scene per key. */
export interface RoutePolicyScenarioRow {
  readonly name: string;
  readonly scene: RoutePolicyScene;
  readonly key: RoutePolicyV2Key;
  readonly unit: string;
  readonly note: string;
  readonly measure: (command: RoutePolicyV2Command) => number;
}
const routeField = (
    command: RoutePolicyV2Command,
    field: 'travelTimeS' | 'lengthM' | 'turns' | 'signals' | 'congestionDelayS',
  ): number => chosenRoute(command)?.[field] ?? 0,
  /** The real congestion delay of the north corridor: 10 s of traffic on each of its two lanes. */
  northCongestionS = trafficDelay('route-north', 10);
export const scenarioRows: readonly RoutePolicyScenarioRow[] = Object.freeze([
  {
    name: 'ponderea timpului',
    scene: {
      name: 'timp',
      description:
        'două coridoare reale între aceeași origine și destinație: `route-short` (scurt, 5 m/s) ' +
        'și `route-fast` (lung, 22 m/s), ambele cu exact un viraj perceput',
      routes: [{ id: 'route-short' }, { id: 'route-fast' }],
    },
    key: 'route_time_weight',
    unit: 's',
    note:
      'cu ponderea timpului la 0 câștigă ruta scurtă (raport de distanță 1,64), la 1 câștigă ruta ' +
      'rapidă (raport de timp 1,87): preferința de timp bate preferința de distanță',
    measure: (command) => routeField(command, 'travelTimeS'),
  },
  {
    name: 'ponderea distanței',
    scene: {
      name: 'distanță',
      description: 'aceleași două coridoare, cu preferința de distanță testată la extrem',
      routes: [{ id: 'route-short' }, { id: 'route-fast' }],
    },
    key: 'route_distance_weight',
    unit: 'm',
    note:
      'la 0 rămâne preferința de timp implicită (ruta rapidă), la 1 ruta mai scurtă câștigă: ' +
      'termenul de distanță este o lungime normalizată, nu un timp',
    measure: (command) => routeField(command, 'lengthM'),
  },
  {
    name: 'penalizarea virajelor',
    scene: {
      name: 'viraje',
      description:
        'două coridoare cu geometrie identică și același timp liber, dar cu 4, respectiv 1 viraj ' +
        'declarat de proprietarul hărții',
      routes: [
        { id: 'route-turn-heavy', turns: 4 },
        { id: 'route-turn-light', turns: 1 },
      ],
    },
    key: 'route_turn_penalty',
    unit: 'viraje',
    note:
      'la 0 cele două alternative sunt egale și departajarea e după id (ruta cu 4 viraje), la 20 ' +
      'ruta cu un singur viraj câștigă',
    measure: (command) => routeField(command, 'turns'),
  },
  {
    name: 'penalizarea semafoarelor',
    scene: {
      name: 'semafoare',
      description:
        'aceleași două coridoare simetrice, cu 3, respectiv 0 semafoare declarate pe traseu',
      routes: [
        { id: 'route-north', signals: 3 },
        { id: 'route-south', signals: 0 },
      ],
    },
    key: 'route_signal_penalty',
    unit: 'semafoare',
    note:
      'la 0 cele două alternative sunt egale și departajarea e după id (ruta cu 3 semafoare), la ' +
      '60 ruta fără semafoare câștigă',
    measure: (command) => routeField(command, 'signals'),
  },
  {
    name: 'penalizarea congestiei',
    scene: {
      name: 'congestie',
      description:
        'aceleași două coridoare simetrice, cu întârzierea reală de congestie pe `route-north` ' +
        '(10 s de trafic declarat pe fiecare din cele două benzi) și 0 s pe `route-south`',
      routes: [{ id: 'route-north', congestionDelayS: northCongestionS }, { id: 'route-south' }],
    },
    key: 'route_congestion_penalty',
    unit: 's',
    note:
      `la 0 cele două alternative sunt egale și departajarea e după id (ruta congestionată), la 2 ` +
      `ruta fără cei ${northCongestionS.toFixed(0)} s de întârziere câștigă`,
    measure: (command) => routeField(command, 'congestionDelayS'),
  },
  {
    name: 'răbdarea la rerutare',
    scene: {
      name: 'rerutare',
      description:
        'ruta curentă `route-slow` este dominată în toate dimensiunile de `route-direct`, iar ' +
        'alternativa mai bună a fost văzută de 60 de tick-uri',
      routes: [{ id: 'route-slow' }, { id: 'route-direct' }],
      currentRouteId: 'route-slow',
      waitingSinceTick: scenario.tick - 60,
    },
    key: 'reroute_patience',
    unit: 'ticks',
    note:
      'așteptarea este `max(1, ceil(cheie · 60))` tick-uri; la 60 de tick-uri scurse, 2 s mai țin ' +
      '60 de tick-uri, 120 s mai țin 7140',
    measure: (command) => command.reroute.remainingTicks ?? 0,
  },
  {
    name: 'disponibilitatea întoarcerii în U',
    scene: {
      name: 'întoarcere',
      description:
        'ruta directă (`route-direct`, 10 m/s) față de o rută care cere o întoarcere în U către o ' +
        'arteră de 20 m/s, cu harta declarând întoarcerea permisă',
      routes: [{ id: 'route-direct' }, { id: 'route-uturn' }],
      uTurn: 'PERMITTED',
    },
    key: 'u_turn_willingness',
    unit: 's',
    note:
      'cu 0 ruta cu întoarcere nu este niciodată admisă, cu 1 este admisă și câștigă pe timp; ' +
      'eșantionul este unul singur per oportunitate',
    measure: (command) => routeField(command, 'travelTimeS'),
  },
  {
    name: 'durata recuperării prin marșarier',
    scene: {
      name: 'recuperare',
      description:
        'recuperare prin marșarier cerută de lume, cu spațiul din spate declarat liber: durata ' +
        'commitată a manevrei',
      routes: [{ id: 'route-direct' }],
      recovery: { required: true, reverseClear: true },
    },
    key: 'reverse_recovery_duration',
    unit: 's',
    note:
      'durata commitată este `max(cheie, 2,5 s)`: minimul de catalog de 0 s dă 2,5 s (150 de ' +
      'tick-uri, 3 m), 8 s dă 8 s (480 de tick-uri, 9,6 m)',
    measure: (command) => command.recovery.durationS ?? 0,
  },
]);
