import {
  compileCruiseProfile,
  compileFollowingProfile,
  compileLongitudinalProfile,
  createLongitudinalController,
  createRoadContext,
  evaluateCruiseTarget,
  evaluateFollowingTarget,
  projectBehaviorContext,
} from '../autonomy';
import type {
  BehaviorActor,
  BehaviorContext,
  BehaviorDecision,
  CruiseInput,
  CruiseProfile,
  CruiseRoadFacts,
  FollowingProfile,
  FollowingTarget,
  LongitudinalProfile,
  RoadContext,
} from '../autonomy';
import { parseDrivingProfile } from '../profiles';
import type { DrivingProfile } from '../profiles';
import {
  choice,
  deriveScenarioSeed,
  deriveVehicleSeed,
  number,
  randomUint32,
  record,
  requireContract,
  text,
  tick,
} from '../sessions';
import type { Vector3, VehicleClassId } from '../vehicles';
import {
  ROUTE_COST_MODEL,
  ROUTE_PLANNER_LIMITS,
  createLaneGraph,
  createRoutePlanner,
  parseRoadMap,
} from '../world';
import type {
  DirectedLanePath,
  LaneGraph,
  RoadAccess,
  RoadMap,
  RoutePlan,
  RoutePlanner,
} from '../world';
import { FLEET_LIMITS, fleetDriverKinds } from './registry';
import type { ControlMode } from '../vehicles';
import type { FleetDriverKind, FleetRegistry, FleetVehicle } from './registry';

export const CIVIL_TRAFFIC_VERSION = '058-civil-traffic-v1' as const;

/** Fixed budgets; no tick or actor may grow the owned state beyond these values. */
export const CIVIL_TRAFFIC_LIMITS = Object.freeze({
  version: CIVIL_TRAFFIC_VERSION,
  /** PBI057 caps the civil population at 40, so no other actor limit is invented. */
  actors: FLEET_LIMITS.civiliansMaximum,
  /** 044 frame ceiling; the V1 composition uses 40 civilians plus at most 30 taxis. */
  frameVehicles: 110,
  /** A single call is exactly one 60 Hz simulation tick; larger steps are rejected. */
  maximumStepSeconds: 1 / 60,
  /** 041 policy: a civil route cannot be stored beyond the public planner path cap. */
  routeLanes: ROUTE_PLANNER_LIMITS.pathLanes,
  /** Bounded deterministic attempts to find a seeded origin/destination pair. */
  routeAttempts: 64,
  /** Bounded lane replans while a single actor is updated. */
  replansPerTick: 1,
  /** The authoritative simulation rate used by 024/047. */
  tickHz: 60,
  /** Vehicular packaging used for the hard, non-overlap gap; not part of the style profile. */
  vehicleRadiusM: 2.5,
  /** Conservative surface clearance kept even when the common style is aggressive. */
  minimumGapM: 0.25,
  /** A merging actor holds at the lane boundary while another actor is this close to its start. */
  entryClearanceM: 6,
  retainedHistory: 0,
});

export interface CityStyleSource {
  /** The active common city profile. A per-player profile is not an admissible source. */
  activeStyle(): DrivingProfile;
}

export interface CivilTrafficOptions {
  readonly registry: FleetRegistry;
  readonly map: unknown;
  /** Optional 033 graph; must belong to the same map. */
  readonly graph?: LaneGraph;
  /** Optional 041 planner; caller-owned when supplied. */
  readonly planner?: RoutePlanner;
  /** Common city style, or a source read once at creation and again on explicit resume. */
  readonly style?: DrivingProfile;
  readonly styleSource?: CityStyleSource;
  readonly seed?: number;
  readonly graphVersion?: string;
  readonly costVersion?: string;
  /**
   * Fleet kinds simulated by this module. The 058 default is civilians only; PBI 262 passes both
   * so taxis become real 041/044/047/048 actors instead of registry-only data.
   */
  readonly driverKinds?: readonly FleetDriverKind[];
  /**
   * How often the 044 road context is refreshed for each actor. `EVERY_TICK` preserves the 058
   * default; `DECISION_PERIOD` uses the real 10 Hz phased decision cadence from Docs/25 and is the
   * live-fleet setting that keeps 70 actors inside the tick budget. The controller still runs at
   * 60 Hz in both modes.
   */
  readonly contextRefresh?: 'EVERY_TICK' | 'DECISION_PERIOD';
  /**
   * Optional deterministic spawn lanes for the first actors (in stable vehicle-ID order). They must
   * be accessible to the simulated kind; duplicates or unknown lanes are rejected. If a preferred
   * origin has no route, that actor falls back to the seeded origin search. This lets the composition
   * root place visible traffic near the player without inventing a second router.
   */
  readonly spawnLanes?: readonly string[];
  /**
   * Optional initial distance along each preferred route, aligned with `spawnLanes`. Missing
   * entries start at 0. Values are clamped to the route length; this only offsets the deterministic
   * planner route, it never creates a route or a pose outside it.
   */
  readonly spawnOffsetsM?: readonly number[];
  /**
   * Per-kind spawn hints, aligned with the stable vehicle-ID order inside each kind. Every lane must
   * be accessible to that kind and no lane may repeat across the whole population. This is the
   * composition-root form used by the live fleet: taxis and civilians both get visible origins.
   */
  readonly spawnLanesByKind?: Partial<Record<FleetDriverKind, readonly string[]>>;
  readonly spawnOffsetsMByKind?: Partial<Record<FleetDriverKind, readonly number[]>>;
}

export interface CivilTrafficVehicleObservation {
  readonly vehicleId: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly positionM: Vector3;
  readonly headingRad: number;
  readonly speedMps: number;
  /** Optional physical half-length packaging; defaults to CIVIL_TRAFFIC_LIMITS.vehicleRadiusM. */
  readonly radiusM?: number;
}

/** PBI 263: the authoritative pose a player-driven fleet car must hand back before AUTO resumes. */
export interface CivilPoseReconciliation {
  readonly positionM: Vector3;
  /** Map-plane heading in radians: zero +X, positive toward +Z. */
  readonly headingRad: number;
}

export interface CivilRouteSnapshot {
  /** Routes are always produced by the real PBI041 planner, never by a local follower. */
  readonly source: '041-route-planner';
  readonly status: RoutePlan['status'];
  readonly access: RoadAccess;
  readonly path: readonly string[];
  readonly costSeconds: number;
  readonly costVersion: string;
  readonly graphVersion: string;
  readonly originLaneId: string | null;
  readonly destinationLaneId: string | null;
  readonly destinationKind: RoutePlan['destinationKind'];
  readonly replans: number;
}

export interface CivilInteraction {
  readonly leaderId: string;
  readonly leaderKind: 'TAXI' | 'CIVILIAN';
  readonly gapM: number;
  readonly speedMps: number;
}

export interface CivilActorSnapshot {
  readonly vehicleId: string;
  readonly driverKind: FleetDriverKind;
  readonly slot: number;
  readonly classId: VehicleClassId;
  readonly authority: ControlMode;
  readonly laneId: string;
  readonly routeLaneIndex: number;
  readonly routeLaneCount: number;
  readonly distanceAlongRouteM: number;
  readonly remainingRouteM: number;
  readonly speedMps: number;
  readonly positionM: Vector3;
  readonly headingRad: number;
  readonly styleProfileId: string;
  readonly styleVersionId: string;
  readonly leader: CivilInteraction | null;
  readonly route: CivilRouteSnapshot;
  readonly blocked: boolean;
}

export interface CivilTrafficFrame {
  readonly version: typeof CIVIL_TRAFFIC_VERSION;
  readonly tick: number;
  readonly actors: readonly CivilActorSnapshot[];
}

export interface CivilTrafficStep {
  readonly tick: number;
  readonly dtSeconds: number;
  /** External taxi/civil positions for 044 leader and physical-gap interaction. */
  readonly vehicles?: readonly CivilTrafficVehicleObservation[];
}

export interface CivilTrafficReport {
  readonly version: typeof CIVIL_TRAFFIC_VERSION;
  readonly vehicles: number;
  readonly routes: number;
  readonly routesFromPlanner: number;
  readonly replans: number;
  readonly interactions: number;
  readonly styleProfileId: string;
  readonly styleVersionId: string;
  readonly ticks: number;
  readonly disposed: boolean;
}

export interface CivilTrafficStats {
  readonly actors: number;
  readonly routeSearches: number;
  readonly interactions: number;
  readonly ticks: number;
  readonly styleVersionId: string;
  readonly roadContextVehicles: number;
  readonly longitudinalActors: number;
  readonly retainedHistory: 0;
  readonly disposed: boolean;
}

export interface CivilTraffic {
  readonly version: typeof CIVIL_TRAFFIC_VERSION;
  readonly style: Readonly<{ profileId: string; versionId: string }>;
  list(): readonly CivilActorSnapshot[];
  get(vehicleId: string): CivilActorSnapshot | undefined;
  step(input: CivilTrafficStep): CivilTrafficFrame;
  setAuthority(vehicleId: string, mode: ControlMode, atTick?: number): CivilActorSnapshot;
  /**
   * PBI 263: reconcile a pose driven by the player with the real route before an authority change.
   * The car is projected onto the lane it actually occupies; when that lane is still on its route the
   * route is preserved, otherwise a real 041 plan continues to the same destination. The pose itself
   * is never teleported: the projection must be on the lane graph or the call is refused.
   */
  reconcile(vehicleId: string, pose: CivilPoseReconciliation, atTick?: number): CivilActorSnapshot;
  /** Explicit release back to AUTO: route is kept, the active common style is re-read. */
  resume(vehicleId: string, atTick?: number): CivilActorSnapshot;
  refreshStyle(): Readonly<{ profileId: string; versionId: string }>;
  report(): CivilTrafficReport;
  getStats(): CivilTrafficStats;
  dispose(): void;
}

interface RouteState {
  readonly plan: RoutePlan;
  readonly path: readonly string[];
  readonly lanes: readonly {
    readonly laneId: string;
    readonly path: DirectedLanePath;
    readonly startM: number;
    readonly endM: number;
  }[];
  readonly totalLengthM: number;
  readonly costVersion: string;
  readonly graphVersion: string;
}

interface StyleBundle {
  readonly profile: DrivingProfile;
  readonly cruise: CruiseProfile;
  readonly longitudinal: LongitudinalProfile;
  readonly following: FollowingProfile;
}

interface Pose {
  readonly laneId: string;
  readonly laneIndex: number;
  readonly positionM: Vector3;
  readonly headingRad: number;
  readonly distanceM: number;
}

interface ActorState {
  readonly vehicle: FleetVehicle;
  readonly actor: BehaviorActor;
  /** Road access class of the planner route and lane projections; TAXI for taxis. */
  readonly access: RoadAccess;
  authority: ControlMode;
  /** Each actor owns its applied version; the bundle is immutable and sourced from the city. */
  style: StyleBundle;
  route: RouteState;
  routeView: CivilRouteSnapshot | null;
  distanceM: number;
  speedMps: number;
  pose: Pose;
  leader: CivilInteraction | null;
  replans: number;
  ticks: number;
  blocked: boolean;
}

const CONTROL_MODES: readonly ControlMode[] = ['AUTO', 'MANUAL', 'LEARNING'];

/** 60 Hz controller with 10 Hz decisions: six phases, one decision tick per actor. */
const DECISION_PERIOD_TICKS = 6;

function accessFor(driverKind: FleetDriverKind): RoadAccess {
  return driverKind === 'TAXI' ? 'TAXI' : 'CIVIL';
}

function boundedId(value: unknown, maximum = 256): string {
  const id = text(value);
  requireContract(id.length <= maximum && id.trim() === id, 'Invalid civil traffic identifier');
  return id;
}

function finiteNumber(value: unknown, minimum: number, maximum: number): number {
  return number(value, minimum, maximum);
}

function readLaneIds(value: unknown, label: string, maximum: number): readonly string[] {
  requireContract(Array.isArray(value), `${label} must be an array`);
  requireContract(value.length <= maximum, `${label} capacity`);
  const lanes: string[] = [];
  for (const raw of value) {
    const laneId = boundedId(raw);
    requireContract(!lanes.includes(laneId), `Duplicate ${label.toLowerCase()}`);
    lanes.push(laneId);
  }
  return Object.freeze(lanes);
}

function readOffsets(value: unknown, laneCount: number, label: string): readonly number[] {
  requireContract(Array.isArray(value), `${label} must be an array`);
  requireContract(value.length <= laneCount, `${label} requires a matching spawn lane`);
  return Object.freeze(value.map((raw) => finiteNumber(raw, 0, 1_000_000)));
}

interface KindSpawnHints {
  readonly lanes: readonly string[];
  readonly offsetsM: readonly number[];
}

function readOptions(value: unknown): {
  registry: FleetRegistry;
  map: unknown;
  graph: LaneGraph | null;
  planner: RoutePlanner | null;
  style: DrivingProfile | null;
  styleSource: CityStyleSource | null;
  seed: number | null;
  graphVersion: string;
  costVersion: string;
  driverKinds: readonly FleetDriverKind[];
  contextRefresh: 'EVERY_TICK' | 'DECISION_PERIOD';
  spawnLanes: readonly string[];
  spawnOffsetsM: readonly number[];
  spawnLanesByKind: Readonly<Partial<Record<FleetDriverKind, KindSpawnHints>>> | null;
} {
  const data = record(value);
  for (const key of Object.keys(data))
    requireContract(
      [
        'registry',
        'map',
        'graph',
        'planner',
        'style',
        'styleSource',
        'seed',
        'graphVersion',
        'costVersion',
        'driverKinds',
        'contextRefresh',
        'spawnLanes',
        'spawnOffsetsM',
        'spawnLanesByKind',
        'spawnOffsetsMByKind',
      ].includes(key),
      'Unknown civil traffic option',
    );
  const registry = data.registry as FleetRegistry;
  requireContract(
    typeof registry === 'object' &&
      registry !== null &&
      typeof registry.list === 'function' &&
      typeof registry.state === 'function' &&
      typeof registry.updateState === 'function' &&
      typeof registry.configuration === 'object',
    'Invalid fleet registry',
  );
  requireContract(data.map !== undefined, 'Civil traffic requires a road map');
  const graph = data.graph === undefined ? null : (data.graph as LaneGraph);
  if (graph !== null)
    requireContract(
      typeof graph.getLane === 'function' && typeof graph.getDirectedPath === 'function',
      'Invalid civil traffic lane graph',
    );
  const planner = data.planner === undefined ? null : (data.planner as RoutePlanner);
  if (planner !== null)
    requireContract(
      typeof planner.findRoute === 'function' && typeof planner.getStats === 'function',
      'Invalid civil traffic route planner',
    );
  const style = data.style === undefined ? null : parseDrivingProfile(data.style);
  const styleSource = data.styleSource === undefined ? null : record(data.styleSource);
  requireContract(
    (style === null) !== (styleSource === null),
    'Civil traffic needs exactly one common city style or style source',
  );
  if (styleSource !== null) {
    requireContract(
      typeof styleSource.activeStyle === 'function',
      'Invalid common city style source',
    );
    const receiver = data.styleSource;
    if (receiver === null || typeof receiver !== 'object') throw new Error('Invalid style source');
  }
  const seed = data.seed === undefined ? null : finiteNumber(data.seed, 0, 0xffff_ffff);
  if (seed !== null)
    requireContract(Number.isSafeInteger(seed), 'Civil traffic seed must be integer');
  const graphVersion =
    data.graphVersion === undefined ? '033-lane-graph-v1' : boundedId(data.graphVersion, 128);
  const costVersion =
    data.costVersion === undefined ? ROUTE_COST_MODEL.version : boundedId(data.costVersion, 128);
  const driverKinds: FleetDriverKind[] = [];
  if (data.driverKinds !== undefined) {
    requireContract(Array.isArray(data.driverKinds), 'Civil traffic driver kinds must be an array');
    requireContract(data.driverKinds.length > 0, 'Civil traffic needs at least one driver kind');
    for (const raw of data.driverKinds) {
      const kind = choice(raw, fleetDriverKinds);
      requireContract(!driverKinds.includes(kind), 'Duplicate civil traffic driver kind');
      driverKinds.push(kind);
    }
  } else driverKinds.push('CIVILIAN');
  const contextRefresh =
    data.contextRefresh === undefined
      ? 'EVERY_TICK'
      : choice(data.contextRefresh, ['EVERY_TICK', 'DECISION_PERIOD']);
  const spawnLanes =
    data.spawnLanes === undefined
      ? []
      : readLaneIds(data.spawnLanes, 'Civil traffic spawn lanes', FLEET_LIMITS.vehicles);
  const spawnOffsetsM =
    data.spawnOffsetsM === undefined
      ? []
      : readOffsets(data.spawnOffsetsM, spawnLanes.length, 'Civil traffic spawn offsets');
  if (data.spawnLanesByKind !== undefined) {
    requireContract(
      data.spawnLanes === undefined,
      'Civil traffic spawn lanes cannot mix global and per-kind hints',
    );
    requireContract(
      data.spawnOffsetsM === undefined,
      'Civil traffic spawn offsets cannot mix global and per-kind hints',
    );
  }
  const perKind: Partial<Record<FleetDriverKind, KindSpawnHints>> = {};
  const everyLane = new Set<string>();
  const laneHints = data.spawnLanesByKind === undefined ? null : record(data.spawnLanesByKind);
  const offsetHints =
    data.spawnOffsetsMByKind === undefined ? null : record(data.spawnOffsetsMByKind);
  if (laneHints !== null)
    for (const key of Object.keys(laneHints))
      requireContract(
        (fleetDriverKinds as readonly string[]).includes(key),
        'Unknown civil traffic spawn kind',
      );
  if (offsetHints !== null)
    for (const key of Object.keys(offsetHints))
      requireContract(
        (fleetDriverKinds as readonly string[]).includes(key),
        'Unknown civil traffic spawn offset kind',
      );
  for (const kind of driverKinds) {
    const rawLanes = laneHints === null ? undefined : laneHints[kind];
    const rawOffsets = offsetHints === null ? undefined : offsetHints[kind];
    if (rawLanes === undefined) {
      requireContract(
        rawOffsets === undefined,
        'Civil traffic per-kind offsets require spawn lanes',
      );
      continue;
    }
    const lanes = readLaneIds(rawLanes, `Civil traffic ${kind} spawn lanes`, FLEET_LIMITS.vehicles);
    for (const laneId of lanes) {
      requireContract(!everyLane.has(laneId), 'Duplicate civil traffic spawn lane across kinds');
      everyLane.add(laneId);
    }
    const offsets =
      rawOffsets === undefined
        ? []
        : readOffsets(rawOffsets, lanes.length, `Civil traffic ${kind} spawn offsets`);
    perKind[kind] = Object.freeze({ lanes, offsetsM: offsets });
  }
  return {
    registry,
    map: data.map,
    graph,
    planner,
    style,
    styleSource:
      styleSource === null
        ? null
        : {
            activeStyle: () =>
              (styleSource.activeStyle as () => unknown).call(data.styleSource) as DrivingProfile,
          },
    seed,
    graphVersion,
    costVersion,
    driverKinds: Object.freeze(driverKinds),
    contextRefresh,
    spawnLanes,
    spawnOffsetsM,
    spawnLanesByKind:
      data.spawnLanesByKind === undefined && data.spawnOffsetsMByKind === undefined
        ? null
        : Object.freeze(perKind),
  };
}

function compileStyle(profile: DrivingProfile): StyleBundle {
  return Object.freeze({
    profile,
    cruise: compileCruiseProfile(profile),
    longitudinal: compileLongitudinalProfile(profile),
    following: compileFollowingProfile(profile),
  });
}

function lanePathPoint(
  path: DirectedLanePath,
  distanceM: number,
): { point: Vector3; headingRad: number } {
  const points = path.points;
  if (points.length === 1) {
    const point = points[0]!;
    return { point, headingRad: 0 };
  }
  let remaining = Math.min(Math.max(distanceM, 0), path.lengthM);
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!,
      to = points[index + 1]!;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length <= 0.000001) continue;
    if (remaining <= length || index === points.length - 2) {
      const fraction = Math.min(1, Math.max(0, remaining / length));
      return {
        point: Object.freeze({
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
          z: from.z + (to.z - from.z) * fraction,
        }),
        headingRad: Math.atan2(to.z - from.z, to.x - from.x),
      };
    }
    remaining -= length;
  }
  const last = points[points.length - 1]!;
  return { point: last, headingRad: 0 };
}

function routePose(route: RouteState, distanceM: number): Pose {
  const clamped = Math.min(Math.max(distanceM, 0), route.totalLengthM);
  let index = route.lanes.length - 1;
  for (let candidate = 0; candidate < route.lanes.length; candidate += 1) {
    const lane = route.lanes[candidate]!;
    if (clamped < lane.endM || candidate === route.lanes.length - 1) {
      index = candidate;
      break;
    }
  }
  const lane = route.lanes[index]!,
    local = Math.min(Math.max(clamped - lane.startM, 0), lane.path.lengthM),
    sampled = lanePathPoint(lane.path, local);
  return Object.freeze({
    laneId: lane.laneId,
    laneIndex: index,
    positionM: sampled.point,
    headingRad: sampled.headingRad,
    distanceM: clamped,
  });
}

function roadKind(postedLimitMps: number): CruiseRoadFacts['roadKind'] {
  return postedLimitMps >= 12 ? 'URBAN' : 'RESIDENTIAL';
}

interface PhysicalLaneOccupation {
  readonly id: string;
  readonly longitudinalM: number;
  readonly speedMps: number;
  readonly radiusM: number;
}

function frozenInteraction(
  leader: RoadContext['leader'],
  kinds: ReadonlyMap<string, 'TAXI' | 'CIVILIAN'>,
): CivilInteraction | null {
  if (leader === null) return null;
  return Object.freeze({
    leaderId: leader.id,
    leaderKind: kinds.get(leader.id) ?? 'CIVILIAN',
    gapM: leader.gapM,
    speedMps: leader.speedMps,
  });
}

class CivilTrafficImpl implements CivilTraffic {
  readonly version = CIVIL_TRAFFIC_VERSION;
  private readonly registry: FleetRegistry;
  private readonly map: RoadMap;
  private readonly graph: LaneGraph;
  private readonly planner: RoutePlanner;
  private readonly ownedPlanner: boolean;
  private readonly graphVersion: string;
  private readonly costVersion: string;
  private readonly seed: number;
  private readonly scenarioSeed: number;
  private readonly spawnLanes: readonly string[];
  private readonly spawnOffsetsM: readonly number[];
  private readonly spawnLanesByKind: Readonly<
    Partial<Record<FleetDriverKind, KindSpawnHints>>
  > | null;
  /** Registry vehicles selected by `driverKinds`, in stable vehicle-ID order. */
  private readonly fleetVehicles: readonly FleetVehicle[];
  private readonly actorIds: ReadonlySet<string>;
  private readonly actors: ActorState[];
  private readonly byId: Map<string, ActorState>;
  private readonly road: ReturnType<typeof createRoadContext>;
  private readonly longitudinal: ReturnType<typeof createLongitudinalController>;
  private readonly laneIdsByAccess = new Map<RoadAccess, readonly string[]>();
  private readonly contextRefresh: 'EVERY_TICK' | 'DECISION_PERIOD';
  private readonly contextPhase: ReadonlyMap<string, number>;
  private readonly occupancy = new Map<string, Map<string, number>>();
  private readonly physical = new Map<string, PhysicalLaneOccupation[]>();
  private readonly kinds = new Map<string, FleetDriverKind>();
  private readonly styleSource: CityStyleSource | null;
  private commonStyle: StyleBundle;
  private lastTick: number | null = null;
  private ticks = 0;
  private interactions = 0;
  private disposed = false;

  constructor(
    options: ReturnType<typeof readOptions>,
    map: RoadMap,
    graph: LaneGraph,
    planner: RoutePlanner,
    ownedPlanner: boolean,
    style: StyleBundle,
  ) {
    this.registry = options.registry;
    this.map = map;
    this.graph = graph;
    this.planner = planner;
    this.ownedPlanner = ownedPlanner;
    this.graphVersion = planner.graphVersion ?? options.graphVersion;
    this.costVersion = planner.costVersion ?? options.costVersion;
    this.seed = options.seed ?? this.registry.configuration.seed;
    this.scenarioSeed = deriveScenarioSeed(this.seed, this.registry.configuration.scenarioId);
    this.spawnLanes = options.spawnLanes;
    this.spawnOffsetsM = options.spawnOffsetsM;
    this.spawnLanesByKind = options.spawnLanesByKind;
    this.contextRefresh = options.contextRefresh;
    this.styleSource = options.styleSource;
    this.commonStyle = style;
    const kinds = new Set(options.driverKinds);
    this.fleetVehicles = Object.freeze(
      this.registry
        .list()
        .filter((vehicle) => kinds.has(vehicle.driverKind))
        .sort((left, right) =>
          left.vehicleId < right.vehicleId ? -1 : left.vehicleId > right.vehicleId ? 1 : 0,
        ),
    );
    requireContract(
      this.fleetVehicles.length <= FLEET_LIMITS.vehicles,
      'Fleet traffic population cap',
    );
    this.actorIds = new Set(this.fleetVehicles.map((vehicle) => vehicle.vehicleId));
    const identities = this.fleetVehicles.map((vehicle) => {
      const state = this.registry.state(vehicle.vehicleId);
      requireContract(state !== undefined, 'Missing fleet state');
      return Object.freeze({ id: vehicle.vehicleId, incarnation: 1 });
    });
    this.longitudinal = createLongitudinalController({
      sessionId: this.registry.configuration.sessionId,
      worldEpoch: this.registry.configuration.worldEpoch,
    });
    this.longitudinal.setActors(identities, {
      sessionId: this.registry.configuration.sessionId,
      worldEpoch: this.registry.configuration.worldEpoch,
    });
    this.road = createRoadContext(map);
    const usedOrigins = new Set<string>(),
      kindCursor: Record<FleetDriverKind, number> = { TAXI: 0, CIVILIAN: 0 },
      states = this.fleetVehicles.map((vehicle, index) => {
        const access = accessFor(vehicle.driverKind);
        const actor = Object.freeze({ id: vehicle.vehicleId, incarnation: 1 });
        const hintLanes = this.spawnLanesByKind?.[vehicle.driverKind]?.lanes ?? null;
        const hintOffsets = this.spawnLanesByKind?.[vehicle.driverKind]?.offsetsM ?? null;
        const cursor = kindCursor[vehicle.driverKind];
        const requestedLane = hintLanes === null ? this.spawnLanes[index] : hintLanes[cursor];
        const requestedOffset =
          hintOffsets === null ? (this.spawnOffsetsM[index] ?? 0) : (hintOffsets[cursor] ?? 0);
        kindCursor[vehicle.driverKind] = cursor + 1;
        const route = this.spawnRoute(vehicle.vehicleId, 0, access, usedOrigins, requestedLane);
        const distanceM = Math.min(requestedOffset, Math.max(0, route.totalLengthM - 1));
        const pose = routePose(route, distanceM);
        return {
          vehicle,
          actor,
          access,
          authority: this.registry.state(vehicle.vehicleId)!.controlMode,
          style,
          route,
          routeView: null,
          distanceM,
          speedMps: 0,
          pose,
          leader: null,
          replans: 0,
          ticks: 0,
          blocked: false,
        } satisfies ActorState;
      });
    this.actors = states;
    this.byId = new Map(states.map((state) => [state.vehicle.vehicleId, state]));
    this.contextPhase = new Map(
      states.map((state, index) => [state.vehicle.vehicleId, index % DECISION_PERIOD_TICKS]),
    );
  }

  private assertLive(): void {
    requireContract(!this.disposed, 'Civil traffic disposed');
  }

  private vehicleSeed(vehicleId: string): number {
    return deriveVehicleSeed(this.scenarioSeed, vehicleId);
  }

  private laneIds(access: RoadAccess): readonly string[] {
    const cached = this.laneIdsByAccess.get(access);
    if (cached !== undefined) return cached;
    const lanes = Object.freeze(
      this.map.lanes
        .filter((lane) => lane.access.includes(access))
        .map((lane) => lane.id)
        .sort(),
    );
    this.laneIdsByAccess.set(access, lanes);
    return lanes;
  }

  private routeFromPlan(plan: RoutePlan, access: RoadAccess): RouteState {
    const routeLanes: {
      laneId: string;
      path: DirectedLanePath;
      startM: number;
      endM: number;
    }[] = [];
    let cursor = 0;
    for (const laneId of plan.path ?? []) {
      const path = this.graph.getDirectedPath(laneId),
        lane = this.graph.getLane(laneId, access);
      requireContract(path !== null && lane !== null, 'Plan contains an inaccessible lane');
      routeLanes.push({ laneId, path, startM: cursor, endM: cursor + path.lengthM });
      cursor += path.lengthM;
    }
    requireContract(routeLanes.length > 0, 'Plan contains no lane');
    return {
      plan,
      path: plan.path ?? Object.freeze([]),
      lanes: Object.freeze(routeLanes),
      totalLengthM: cursor,
      costVersion: this.costVersion,
      graphVersion: this.graphVersion,
    };
  }

  private buildRoute(
    origin: string,
    vehicleSeed: number,
    cycle: number,
    access: RoadAccess,
  ): RouteState {
    const lanes = this.laneIds(access);
    requireContract(lanes.length > 0, 'No lane for fleet traffic access');
    const start = randomUint32(vehicleSeed, 'civil-destination', cycle) % lanes.length;
    for (let attempt = 0; attempt < CIVIL_TRAFFIC_LIMITS.routeAttempts; attempt += 1) {
      const destination = lanes[(start + attempt) % lanes.length]!;
      const plan = this.planner.findRoute({ origin, destination, access });
      if (
        plan.status === 'READY' &&
        plan.path !== null &&
        plan.path.length > 0 &&
        plan.path.length <= CIVIL_TRAFFIC_LIMITS.routeLanes
      ) {
        return this.routeFromPlan(plan, access);
      }
    }
    throw new RangeError('No route for civil vehicle');
  }

  private spawnRoute(
    vehicleId: string,
    cycle: number,
    access: RoadAccess,
    usedOrigins?: Set<string>,
    preferredOrigin?: string,
  ): RouteState {
    const vehicleSeed = this.vehicleSeed(vehicleId),
      lanes = this.laneIds(access);
    if (preferredOrigin !== undefined) {
      requireContract(lanes.includes(preferredOrigin), 'Unknown fleet traffic spawn lane');
      if (!usedOrigins?.has(preferredOrigin)) {
        try {
          const route = this.buildRoute(preferredOrigin, vehicleSeed, cycle, access);
          usedOrigins?.add(preferredOrigin);
          return route;
        } catch {
          // No route from the preferred origin: the seeded search below remains authoritative.
        }
      }
    }
    const start = randomUint32(vehicleSeed, 'civil-origin', cycle) % lanes.length;
    let origin = lanes[start]!;
    if (usedOrigins !== undefined) {
      for (let attempt = 0; attempt < lanes.length; attempt += 1) {
        const candidate = lanes[(start + attempt) % lanes.length]!;
        if (!usedOrigins.has(candidate)) {
          origin = candidate;
          break;
        }
      }
      usedOrigins.add(origin);
    }
    return this.buildRoute(origin, vehicleSeed, cycle, access);
  }

  private successorRoute(actor: ActorState): boolean {
    const lastLane = actor.route.path[actor.route.path.length - 1]!;
    const successors = this.graph
      .getConnections(lastLane, actor.access)
      .map((connection) => connection.toLaneId)
      .sort();
    if (successors.length === 0) {
      actor.blocked = true;
      actor.speedMps = 0;
      return false;
    }
    const seed = this.vehicleSeed(actor.vehicle.vehicleId);
    const origin =
      successors[randomUint32(seed, 'civil-successor', actor.replans) % successors.length]!;
    try {
      actor.route = this.buildRoute(origin, seed, actor.replans + 1, actor.access);
    } catch {
      actor.blocked = true;
      actor.speedMps = 0;
      return false;
    }
    actor.distanceM = 0;
    actor.pose = routePose(actor.route, 0);
    actor.routeView = null;
    actor.replans += 1;
    actor.blocked = false;
    return true;
  }

  private routeSnapshot(actor: ActorState): CivilRouteSnapshot {
    return Object.freeze({
      source: '041-route-planner',
      status: actor.route.plan.status,
      access: actor.access,
      path: actor.route.path,
      costSeconds: actor.route.plan.costSeconds,
      costVersion: actor.route.costVersion,
      graphVersion: actor.route.graphVersion,
      originLaneId: actor.route.plan.originLaneId,
      destinationLaneId: actor.route.plan.destinationLaneId,
      destinationKind: actor.route.plan.destinationKind,
      replans: actor.replans,
    });
  }

  private snapshot(actor: ActorState): CivilActorSnapshot {
    return Object.freeze({
      vehicleId: actor.vehicle.vehicleId,
      driverKind: actor.vehicle.driverKind,
      slot: actor.vehicle.slot,
      classId: actor.vehicle.classId,
      authority: actor.authority,
      laneId: actor.pose.laneId,
      routeLaneIndex: actor.pose.laneIndex,
      routeLaneCount: actor.route.path.length,
      distanceAlongRouteM: actor.distanceM,
      remainingRouteM: Math.max(0, actor.route.totalLengthM - actor.distanceM),
      speedMps: actor.speedMps,
      positionM: actor.pose.positionM,
      headingRad: actor.pose.headingRad,
      styleProfileId: actor.style.profile.profileId,
      styleVersionId: actor.style.profile.versionId,
      leader: actor.leader,
      route: actor.routeView ?? (actor.routeView = this.routeSnapshot(actor)),
      blocked: actor.blocked,
    });
  }

  list(): readonly CivilActorSnapshot[] {
    return Object.freeze(
      this.actors
        .slice()
        .sort((left, right) =>
          left.vehicle.vehicleId < right.vehicle.vehicleId
            ? -1
            : left.vehicle.vehicleId > right.vehicle.vehicleId
              ? 1
              : 0,
        )
        .map((actor) => this.snapshot(actor)),
    );
  }

  get(vehicleId: string): CivilActorSnapshot | undefined {
    const actor = this.byId.get(vehicleId);
    return actor === undefined ? undefined : this.snapshot(actor);
  }

  private readObservations(value: unknown): readonly CivilTrafficVehicleObservation[] {
    if (value === undefined) return Object.freeze([]);
    requireContract(Array.isArray(value), 'Civil traffic vehicles must be an array');
    requireContract(
      value.length + this.actors.length <= CIVIL_TRAFFIC_LIMITS.frameVehicles,
      'Civil traffic frame capacity',
    );
    const result: CivilTrafficVehicleObservation[] = [],
      seen = new Set<string>();
    for (const raw of value) {
      const item = record(raw);
      for (const key of Object.keys(item))
        requireContract(
          ['vehicleId', 'driverKind', 'positionM', 'headingRad', 'speedMps', 'radiusM'].includes(
            key,
          ),
          'Unknown civil traffic vehicle field',
        );
      const vehicleId = boundedId(item.vehicleId);
      requireContract(!seen.has(vehicleId), 'Duplicate civil traffic vehicle');
      requireContract(!this.actorIds.has(vehicleId), 'Civil traffic observation duplicates actor');
      seen.add(vehicleId);
      const position = record(item.positionM);
      for (const key of Object.keys(position))
        requireContract(['x', 'y', 'z'].includes(key), 'Unknown civil traffic position field');
      result.push(
        Object.freeze({
          vehicleId,
          driverKind: choice(item.driverKind, ['TAXI', 'CIVILIAN']),
          positionM: Object.freeze({
            x: finiteNumber(position.x, -1_000_000, 1_000_000),
            y: finiteNumber(position.y, -1_000_000, 1_000_000),
            z: finiteNumber(position.z, -1_000_000, 1_000_000),
          }),
          headingRad: finiteNumber(item.headingRad, -Math.PI, Math.PI),
          speedMps: finiteNumber(item.speedMps, 0, 100),
          radiusM:
            item.radiusM === undefined
              ? CIVIL_TRAFFIC_LIMITS.vehicleRadiusM
              : finiteNumber(item.radiusM, 0.1, 20),
        }),
      );
    }
    return Object.freeze(result);
  }

  private readStep(value: unknown): {
    tick: number;
    dtSeconds: number;
    vehicles: readonly CivilTrafficVehicleObservation[];
  } {
    const data = record(value);
    for (const key of Object.keys(data))
      requireContract(
        ['tick', 'dtSeconds', 'vehicles'].includes(key),
        'Unknown civil traffic step field',
      );
    const atTick = tick(data.tick);
    requireContract(
      this.lastTick === null || atTick === this.lastTick + 1,
      'Civil traffic ticks must be consecutive',
    );
    const dtSeconds = finiteNumber(
      data.dtSeconds,
      0.000001,
      CIVIL_TRAFFIC_LIMITS.maximumStepSeconds,
    );
    requireContract(
      atTick >= 0 && Number.isSafeInteger(atTick),
      'Civil traffic step exceeds one 60 Hz tick',
    );
    return { tick: atTick, dtSeconds, vehicles: this.readObservations(data.vehicles) };
  }

  private currentRoadContext(
    actor: ActorState,
    physical: ReadonlyMap<string, readonly PhysicalLaneOccupation[]>,
    atTick: number,
  ): RoadContext | null {
    const phase = this.contextPhase.get(actor.vehicle.vehicleId) ?? 0,
      refresh =
        this.contextRefresh === 'EVERY_TICK' ||
        atTick === 1 ||
        (atTick + phase) % DECISION_PERIOD_TICKS === 0,
      context = refresh
        ? this.road.getContext(actor.vehicle.vehicleId, { force: true })
        : this.road.getContext(actor.vehicle.vehicleId);
    if (context === null || this.contextRefresh === 'EVERY_TICK') return context;
    // The 044 decision context is cached at the documented 10 Hz cadence. The physical leader is
    // still read from this tick's positions (actors and external vehicles), so 047/048 see a
    // current gap even between decisions.
    const subjectM = actor.distanceM - actor.route.lanes[actor.pose.laneIndex]!.startM;
    let leader: RoadContext['leader'] = null,
      leaderM = Number.POSITIVE_INFINITY;
    for (const candidate of physical.get(actor.pose.laneId) ?? [])
      if (
        candidate.id !== actor.vehicle.vehicleId &&
        candidate.longitudinalM > subjectM &&
        candidate.longitudinalM < leaderM
      ) {
        leaderM = candidate.longitudinalM;
        leader = Object.freeze({
          id: candidate.id,
          incarnation: this.byId.get(candidate.id)?.actor.incarnation ?? 1,
          gapM: Math.max(
            0,
            candidate.longitudinalM -
              subjectM -
              CIVIL_TRAFFIC_LIMITS.vehicleRadiusM -
              candidate.radiusM,
          ),
          speedMps: candidate.speedMps,
        });
      }
    return Object.freeze({ ...context, tick: atTick, leader });
  }

  step(input: CivilTrafficStep): CivilTrafficFrame {
    this.assertLive();
    const { tick: atTick, dtSeconds, vehicles } = this.readStep(input);
    // Finish the route after the previous tick, before this tick's frame is built.
    for (const actor of this.actors)
      if (actor.distanceM >= actor.route.totalLengthM - 1e-6) this.successorRoute(actor);

    const frame = {
      sessionId: this.registry.configuration.sessionId,
      worldEpoch: this.registry.configuration.worldEpoch,
      tick: atTick,
      vehicles: [
        ...this.actors.map((actor) => ({
          id: actor.vehicle.vehicleId,
          incarnation: actor.actor.incarnation,
          positionM: actor.pose.positionM,
          headingRad: actor.pose.headingRad,
          access: actor.access,
          speedMps: actor.speedMps,
          radiusM: CIVIL_TRAFFIC_LIMITS.vehicleRadiusM,
          route: null,
          distances: [] as const,
        })),
        ...vehicles.map((vehicle) => ({
          id: vehicle.vehicleId,
          incarnation: 1,
          positionM: vehicle.positionM,
          headingRad: vehicle.headingRad,
          access: vehicle.driverKind === 'TAXI' ? ('TAXI' as const) : ('CIVIL' as const),
          speedMps: vehicle.speedMps,
          radiusM: vehicle.radiusM ?? CIVIL_TRAFFIC_LIMITS.vehicleRadiusM,
          route: null,
          distances: [] as const,
        })),
      ].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
      obstacles: [],
      zones: [],
      signals: [],
      completeness: { vehicles: true, obstacles: true, zones: true, signals: false },
      discontinuity: false,
    };
    this.road.updateFrame(frame);
    this.kinds.clear();
    for (const actor of this.actors)
      this.kinds.set(actor.vehicle.vehicleId, actor.vehicle.driverKind);
    for (const vehicle of vehicles) this.kinds.set(vehicle.vehicleId, vehicle.driverKind);
    for (const lane of this.occupancy.values()) lane.clear();
    for (const actor of this.actors) {
      const lane = this.occupancy.get(actor.pose.laneId) ?? new Map<string, number>();
      lane.set(
        actor.vehicle.vehicleId,
        actor.distanceM - actor.route.lanes[actor.pose.laneIndex]!.startM,
      );
      this.occupancy.set(actor.pose.laneId, lane);
    }
    // Current physical leader facts. Actors contribute their authoritative route progress; external
    // observations (player taxi, static civil) are projected once onto the real lane graph.
    for (const lane of this.physical.values()) lane.length = 0;
    const addPhysical = (candidate: PhysicalLaneOccupation, laneId: string): void => {
      const lane = this.physical.get(laneId) ?? [];
      lane.push(candidate);
      this.physical.set(laneId, lane);
    };
    for (const actor of this.actors)
      addPhysical(
        {
          id: actor.vehicle.vehicleId,
          longitudinalM: actor.distanceM - actor.route.lanes[actor.pose.laneIndex]!.startM,
          speedMps: actor.speedMps,
          radiusM: CIVIL_TRAFFIC_LIMITS.vehicleRadiusM,
        },
        actor.pose.laneId,
      );
    for (const vehicle of vehicles) {
      const projection = this.graph.locateLane({
        positionM: vehicle.positionM,
        access: vehicle.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL',
        headingRad: vehicle.headingRad,
      });
      if (projection === null) continue;
      addPhysical(
        {
          id: vehicle.vehicleId,
          longitudinalM: projection.longitudinalM,
          speedMps: vehicle.speedMps,
          radiusM: vehicle.radiusM ?? CIVIL_TRAFFIC_LIMITS.vehicleRadiusM,
        },
        projection.lane.id,
      );
    }

    for (const actor of this.actors) {
      actor.ticks += 1;
      const context = this.currentRoadContext(actor, this.physical, atTick),
        projected = context === null ? null : projectBehaviorContext(context),
        lane = this.graph.getLane(actor.pose.laneId, actor.access);
      requireContract(lane !== null, 'Civil actor lost its lane');
      const behaviorContext: BehaviorContext = projected ?? {
        sessionId: this.registry.configuration.sessionId,
        worldEpoch: this.registry.configuration.worldEpoch,
        sourceTick: atTick,
        subject: actor.actor,
        laneId: actor.pose.laneId,
        leaderId: null,
        vehiclesComplete: true,
        discontinuity: false,
      };
      const leader = context?.leader ?? null;
      actor.leader = frozenInteraction(leader, this.kinds);
      if (actor.leader !== null) this.interactions += 1;
      const remainingOnLaneM = Math.max(
        0,
        actor.route.lanes[actor.pose.laneIndex]!.path.lengthM -
          (actor.distanceM - actor.route.lanes[actor.pose.laneIndex]!.startM),
      );
      const facts: CruiseRoadFacts = Object.freeze({
        version: '046-road-facts-v1',
        sessionId: this.registry.configuration.sessionId,
        worldEpoch: this.registry.configuration.worldEpoch,
        subject: actor.actor,
        sourceTick: atTick,
        laneId: actor.pose.laneId,
        roadKind: roadKind(lane.speedLimitMps),
        postedLimitMps: lane.speedLimitMps,
        curveRadiusM: null,
        intersectionApproach:
          actor.pose.laneIndex < actor.route.lanes.length - 1 && remainingOnLaneM <= 25,
      });
      const decision: BehaviorDecision = Object.freeze({
        version: '045-decision-facts-v1',
        sessionId: this.registry.configuration.sessionId,
        worldEpoch: this.registry.configuration.worldEpoch,
        actor: actor.actor,
        state: 'FOLLOW',
        reason: leader === null ? 'FOLLOW_LANE' : 'FOLLOW_LEADER',
        decisionTick: atTick,
        sourceTick: atTick,
        profileVersionId: actor.style.profile.versionId,
        previousState: null,
        transitioned: false,
      });
      const cruiseInput: CruiseInput = {
        sessionId: this.registry.configuration.sessionId,
        worldEpoch: this.registry.configuration.worldEpoch,
        actor: actor.actor,
        decisionTick: atTick,
        authority: actor.authority,
        profile: actor.style.cruise,
        context: behaviorContext,
        behavior: decision,
        facts,
        mechanics: {
          version: '031-coverage-046-v1',
          classId: actor.vehicle.classId,
          classVersion: '023-mechanics-v1',
          surface: 'dry-asphalt',
          surfaceVersion: '026-flat-surfaces-v1',
        },
      };
      let following: FollowingTarget;
      try {
        following = evaluateFollowingTarget(
          Object.freeze({
            cruiseInput,
            roadContext: context,
            observation: {
              version: '048-observation-v1' as const,
              units: 'SI' as const,
              sessionId: this.registry.configuration.sessionId,
              worldEpoch: this.registry.configuration.worldEpoch,
              actor: actor.actor,
              tick: atTick,
              longitudinalSpeedMps: actor.speedMps,
            },
            profile: actor.style.following,
          }),
        );
      } catch {
        const cruise = evaluateCruiseTarget(cruiseInput);
        following = Object.freeze({
          version: '048-following-v1',
          target: cruise,
          reason: cruise.reason,
          leader: null,
          gapM: null,
          desiredGapM: null,
          preferredFollowingMps: null,
        });
      }
      const result = this.longitudinal.step(
        Object.freeze({
          sessionId: this.registry.configuration.sessionId,
          worldEpoch: this.registry.configuration.worldEpoch,
          actor: actor.actor,
          tick: atTick,
          authority: actor.authority,
          profile: actor.style.longitudinal,
          target: following.target,
          observation: {
            version: '047-observation-v1' as const,
            units: 'SI' as const,
            sessionId: this.registry.configuration.sessionId,
            worldEpoch: this.registry.configuration.worldEpoch,
            actor: actor.actor,
            tick: atTick,
            longitudinalSpeedMps: actor.speedMps,
            classId: actor.vehicle.classId,
            classVersion: '023-mechanics-v1' as const,
          },
        }),
        0,
        'OFF',
      );
      let nextSpeed =
        actor.authority === 'AUTO'
          ? Math.max(0, Math.min(30, actor.speedMps + result.accelerationMps2 * dtSeconds))
          : 0;
      if (leader !== null) {
        const availableGapM = leader.gapM - CIVIL_TRAFFIC_LIMITS.minimumGapM;
        if (availableGapM <= 0) nextSpeed = 0;
        else nextSpeed = Math.min(nextSpeed, Math.max(0, availableGapM / dtSeconds));
      }
      if (actor.authority === 'AUTO') {
        actor.speedMps = nextSpeed;
        let nextDistance = Math.min(
          actor.route.totalLengthM,
          actor.distanceM + actor.speedMps * dtSeconds,
        );
        const nextPose = routePose(actor.route, nextDistance);
        if (nextPose.laneIndex > actor.pose.laneIndex) {
          const targetLane = this.occupancy.get(nextPose.laneId),
            occupiedAtEntry =
              targetLane !== undefined &&
              [...targetLane].some(
                ([id, longitudinalM]) =>
                  id !== actor.vehicle.vehicleId &&
                  longitudinalM < CIVIL_TRAFFIC_LIMITS.entryClearanceM,
              );
          if (occupiedAtEntry) {
            nextDistance = Math.max(0, actor.route.lanes[actor.pose.laneIndex]!.endM - 1e-3);
            actor.speedMps = 0;
          }
        }
        this.occupancy.get(actor.pose.laneId)?.delete(actor.vehicle.vehicleId);
        actor.distanceM = nextDistance;
        actor.pose = routePose(actor.route, actor.distanceM);
        const lane = this.occupancy.get(actor.pose.laneId) ?? new Map<string, number>();
        lane.set(
          actor.vehicle.vehicleId,
          actor.distanceM - actor.route.lanes[actor.pose.laneIndex]!.startM,
        );
        this.occupancy.set(actor.pose.laneId, lane);
      } else {
        actor.speedMps = 0;
      }
      this.registry.updateState(actor.vehicle.vehicleId, {
        tick: atTick,
        controlMode: actor.authority,
        appliedProfileVersion: actor.style.profile.versionId,
      });
    }
    this.lastTick = atTick;
    this.ticks += 1;
    return Object.freeze({ version: CIVIL_TRAFFIC_VERSION, tick: atTick, actors: this.list() });
  }

  private assertMode(mode: unknown): ControlMode {
    return choice(mode, CONTROL_MODES);
  }

  private readAuthorityTick(atTick: unknown): number {
    const expected = this.lastTick === null ? 0 : this.lastTick;
    if (atTick === undefined) return expected;
    const value = tick(atTick);
    requireContract(value === expected, 'Authority tick must equal the last simulated tick');
    return value;
  }

  private activeCommonStyle(): StyleBundle {
    if (this.styleSource === null) return this.commonStyle;
    const active = parseDrivingProfile(this.styleSource.activeStyle());
    requireContract(
      active.profileId === this.registry.configuration.profile.profileId,
      'City style source identity mismatch',
    );
    if (active.versionId !== this.commonStyle.profile.versionId)
      this.commonStyle = compileStyle(active);
    return this.commonStyle;
  }

  reconcile(vehicleId: string, pose: CivilPoseReconciliation, atTick?: number): CivilActorSnapshot {
    this.assertLive();
    const actor = this.byId.get(boundedId(vehicleId));
    requireContract(actor !== undefined, 'Unknown civil vehicle');
    const at = this.readAuthorityTick(atTick),
      positionM = pose?.positionM,
      headingRad = pose?.headingRad;
    requireContract(
      positionM !== null &&
        typeof positionM === 'object' &&
        [positionM.x, positionM.y, positionM.z].every(
          (value) => typeof value === 'number' && Number.isFinite(value),
        ),
      'Civil vehicle pose position must be finite',
    );
    requireContract(
      typeof headingRad === 'number' && Number.isFinite(headingRad),
      'Civil vehicle pose heading must be finite',
    );
    const projection =
      this.graph.locateLane({
        positionM,
        access: actor.access,
        headingRad,
      }) ?? this.graph.locateLane({ positionM, access: actor.access });
    requireContract(projection !== null, 'Civil vehicle pose is not on a lane of its access class');
    const routeIndex = actor.route.path.indexOf(projection.lane.id);
    if (routeIndex >= 0) {
      const lane = actor.route.lanes[routeIndex]!,
        distanceM = Math.min(
          lane.endM,
          Math.max(lane.startM, lane.startM + projection.longitudinalM),
        );
      actor.distanceM = distanceM;
      actor.pose = routePose(actor.route, distanceM);
    } else {
      // The car left the planned path: keep the same destination and ask the real 041 planner for a
      // continuation from the lane the player actually occupies. This is reconciliation, not a
      // teleport; the returned pose is on the new path's first lane at the measured progress.
      const destinationLaneId = actor.route.plan.destinationLaneId;
      requireContract(destinationLaneId !== null, 'Civil vehicle route has no destination');
      const plan = this.planner.findRoute({
        origin: projection.lane.id,
        destination: destinationLaneId,
        access: actor.access,
      });
      requireContract(
        plan.status === 'READY' &&
          plan.path !== null &&
          plan.path.length > 0 &&
          plan.path.length <= CIVIL_TRAFFIC_LIMITS.routeLanes,
        'Civil vehicle route cannot be reconciled to its destination',
      );
      actor.route = this.routeFromPlan(plan, actor.access);
      actor.distanceM = Math.min(projection.longitudinalM, actor.route.totalLengthM);
      actor.pose = routePose(actor.route, actor.distanceM);
      actor.routeView = null;
      actor.replans += 1;
    }
    actor.speedMps = 0;
    actor.blocked = false;
    this.registry.updateState(actor.vehicle.vehicleId, {
      tick: at,
      controlMode: actor.authority,
      appliedProfileVersion: actor.style.profile.versionId,
    });
    return this.snapshot(actor);
  }

  setAuthority(vehicleId: string, mode: ControlMode, atTick?: number): CivilActorSnapshot {
    this.assertLive();
    const actor = this.byId.get(boundedId(vehicleId));
    requireContract(actor !== undefined, 'Unknown civil vehicle');
    const nextMode = this.assertMode(mode),
      at = this.readAuthorityTick(atTick);
    if (nextMode === 'AUTO') actor.style = this.activeCommonStyle();
    actor.authority = nextMode;
    if (nextMode !== 'AUTO') actor.speedMps = 0;
    this.registry.updateState(actor.vehicle.vehicleId, {
      tick: at,
      controlMode: nextMode,
      appliedProfileVersion: actor.style.profile.versionId,
    });
    return this.snapshot(actor);
  }

  resume(vehicleId: string, atTick?: number): CivilActorSnapshot {
    return this.setAuthority(vehicleId, 'AUTO', atTick);
  }

  refreshStyle(): Readonly<{ profileId: string; versionId: string }> {
    this.assertLive();
    const style = this.activeCommonStyle();
    for (const actor of this.actors) {
      actor.style = style;
      this.registry.updateState(actor.vehicle.vehicleId, {
        tick: this.lastTick ?? 0,
        controlMode: actor.authority,
        appliedProfileVersion: style.profile.versionId,
      });
    }
    return this.styleReference();
  }

  private styleReference(): Readonly<{ profileId: string; versionId: string }> {
    return Object.freeze({
      profileId: this.commonStyle.profile.profileId,
      versionId: this.commonStyle.profile.versionId,
    });
  }

  get style(): Readonly<{ profileId: string; versionId: string }> {
    return this.styleReference();
  }

  report(): CivilTrafficReport {
    const fromPlanner = this.actors.filter(
      (actor) => actor.route.plan.status === 'READY' && actor.route.path.length > 0,
    ).length;
    return Object.freeze({
      version: CIVIL_TRAFFIC_VERSION,
      vehicles: this.actors.length,
      routes: this.actors.length,
      routesFromPlanner: fromPlanner,
      replans: this.actors.reduce((sum, actor) => sum + actor.replans, 0),
      interactions: this.interactions,
      styleProfileId: this.commonStyle.profile.profileId,
      styleVersionId: this.commonStyle.profile.versionId,
      ticks: this.ticks,
      disposed: this.disposed,
    });
  }

  getStats(): CivilTrafficStats {
    return Object.freeze({
      actors: this.disposed ? 0 : this.actors.length,
      routeSearches: this.disposed ? 0 : this.planner.getStats().searches,
      interactions: this.disposed ? 0 : this.interactions,
      ticks: this.disposed ? 0 : this.ticks,
      styleVersionId: this.disposed ? '' : this.commonStyle.profile.versionId,
      roadContextVehicles: this.disposed ? 0 : this.road.getStats().vehicles,
      longitudinalActors: this.disposed ? 0 : this.longitudinal.getStats().actors,
      retainedHistory: 0,
      disposed: this.disposed,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.byId.clear();
    this.actors.length = 0;
    this.longitudinal.dispose();
    this.road.dispose();
    if (this.ownedPlanner) this.planner.dispose();
  }
}

export function createCivilTraffic(options: unknown): CivilTraffic {
  const read = readOptions(options),
    map = parseRoadMap(read.map),
    graph = read.graph ?? createLaneGraph(map),
    planner =
      read.planner ??
      createRoutePlanner({
        graph,
        map,
        graphVersion: read.graphVersion,
        costVersion: read.costVersion,
      }),
    profile = read.style ?? read.styleSource!.activeStyle();
  requireContract(graph.mapId === map.mapId, 'Civil traffic graph/map mismatch');
  requireContract(
    profile.profileId === read.registry.configuration.profile.profileId,
    'City style profile identity mismatch',
  );
  if (read.seed !== null)
    requireContract(Number.isInteger(read.seed), 'Invalid civil traffic seed');
  return new CivilTrafficImpl(
    read,
    map,
    graph,
    planner,
    read.planner === null,
    compileStyle(profile),
  );
}
