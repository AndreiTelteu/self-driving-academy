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
import type { DirectedLanePath, LaneGraph, RoadMap, RoutePlan, RoutePlanner } from '../world';
import { FLEET_LIMITS } from './registry';
import type { ControlMode } from '../vehicles';
import type { FleetRegistry, FleetVehicle } from './registry';

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

export interface CivilRouteSnapshot {
  /** Routes are always produced by the real PBI041 planner, never by a local follower. */
  readonly source: '041-route-planner';
  readonly status: RoutePlan['status'];
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
  readonly driverKind: 'CIVILIAN';
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
  authority: ControlMode;
  /** Each actor owns its applied version; the bundle is immutable and sourced from the city. */
  style: StyleBundle;
  route: RouteState;
  distanceM: number;
  speedMps: number;
  pose: Pose;
  leader: CivilInteraction | null;
  replans: number;
  ticks: number;
  blocked: boolean;
}

const CONTROL_MODES: readonly ControlMode[] = ['AUTO', 'MANUAL', 'LEARNING'];

function boundedId(value: unknown, maximum = 256): string {
  const id = text(value);
  requireContract(id.length <= maximum && id.trim() === id, 'Invalid civil traffic identifier');
  return id;
}

function finiteNumber(value: unknown, minimum: number, maximum: number): number {
  return number(value, minimum, maximum);
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
  private readonly civilians: readonly FleetVehicle[];
  private readonly civilianIds: ReadonlySet<string>;
  private readonly actors: ActorState[];
  private readonly byId: Map<string, ActorState>;
  private readonly road: ReturnType<typeof createRoadContext>;
  private readonly longitudinal: ReturnType<typeof createLongitudinalController>;
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
    this.styleSource = options.styleSource;
    this.commonStyle = style;
    this.civilians = Object.freeze(
      this.registry.list().filter((vehicle) => vehicle.driverKind === 'CIVILIAN'),
    );
    requireContract(this.civilians.length <= CIVIL_TRAFFIC_LIMITS.actors, 'Civil population cap');
    this.civilianIds = new Set(this.civilians.map((vehicle) => vehicle.vehicleId));
    const identities = this.civilians.map((vehicle) => {
      const state = this.registry.state(vehicle.vehicleId);
      requireContract(state !== undefined, 'Missing civilian fleet state');
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
      states = this.civilians
        .slice()
        .sort((left, right) =>
          left.vehicleId < right.vehicleId ? -1 : left.vehicleId > right.vehicleId ? 1 : 0,
        )
        .map((vehicle) => {
          const actor = Object.freeze({ id: vehicle.vehicleId, incarnation: 1 });
          const route = this.spawnRoute(vehicle.vehicleId, 0, usedOrigins);
          const pose = routePose(route, 0);
          return {
            vehicle,
            actor,
            authority: this.registry.state(vehicle.vehicleId)!.controlMode,
            style,
            route,
            distanceM: 0,
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
  }

  private assertLive(): void {
    requireContract(!this.disposed, 'Civil traffic disposed');
  }

  private vehicleSeed(vehicleId: string): number {
    return deriveVehicleSeed(this.scenarioSeed, vehicleId);
  }

  private civilLaneIds(): readonly string[] {
    return this.map.lanes
      .filter((lane) => lane.access.includes('CIVIL'))
      .map((lane) => lane.id)
      .sort();
  }

  private buildRoute(origin: string, vehicleSeed: number, cycle: number): RouteState {
    const lanes = this.civilLaneIds();
    requireContract(lanes.length > 0, 'No CIVIL lane for civil traffic');
    const start = randomUint32(vehicleSeed, 'civil-destination', cycle) % lanes.length;
    for (let attempt = 0; attempt < CIVIL_TRAFFIC_LIMITS.routeAttempts; attempt += 1) {
      const destination = lanes[(start + attempt) % lanes.length]!;
      const plan = this.planner.findRoute({ origin, destination, access: 'CIVIL' });
      if (
        plan.status === 'READY' &&
        plan.path !== null &&
        plan.path.length > 0 &&
        plan.path.length <= CIVIL_TRAFFIC_LIMITS.routeLanes
      ) {
        const routeLanes: {
          laneId: string;
          path: DirectedLanePath;
          startM: number;
          endM: number;
        }[] = [];
        let cursor = 0;
        for (const laneId of plan.path) {
          const path = this.graph.getDirectedPath(laneId),
            lane = this.graph.getLane(laneId, 'CIVIL');
          requireContract(path !== null && lane !== null, 'Plan contains an inaccessible lane');
          routeLanes.push({ laneId, path, startM: cursor, endM: cursor + path.lengthM });
          cursor += path.lengthM;
        }
        return {
          plan,
          path: plan.path,
          lanes: Object.freeze(routeLanes),
          totalLengthM: cursor,
          costVersion: this.costVersion,
          graphVersion: this.graphVersion,
        };
      }
    }
    throw new RangeError('No route for civil vehicle');
  }

  private spawnRoute(vehicleId: string, cycle: number, usedOrigins?: Set<string>): RouteState {
    const vehicleSeed = this.vehicleSeed(vehicleId),
      lanes = this.civilLaneIds(),
      start = randomUint32(vehicleSeed, 'civil-origin', cycle) % lanes.length;
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
    return this.buildRoute(origin, vehicleSeed, cycle);
  }

  private successorRoute(actor: ActorState): boolean {
    const lastLane = actor.route.path[actor.route.path.length - 1]!;
    const successors = this.graph
      .getConnections(lastLane, 'CIVIL')
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
      actor.route = this.buildRoute(origin, seed, actor.replans + 1);
    } catch {
      actor.blocked = true;
      actor.speedMps = 0;
      return false;
    }
    actor.distanceM = 0;
    actor.pose = routePose(actor.route, 0);
    actor.replans += 1;
    actor.blocked = false;
    return true;
  }

  private routeSnapshot(actor: ActorState): CivilRouteSnapshot {
    return Object.freeze({
      source: '041-route-planner',
      status: actor.route.plan.status,
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
      driverKind: 'CIVILIAN',
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
      route: this.routeSnapshot(actor),
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
      value.length + this.civilians.length <= CIVIL_TRAFFIC_LIMITS.frameVehicles,
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
      requireContract(
        !this.civilianIds.has(vehicleId),
        'Civil traffic observation duplicates actor',
      );
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
          access: 'CIVIL' as const,
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
    const kinds = new Map<string, 'TAXI' | 'CIVILIAN'>(
      this.civilians.map((vehicle) => [vehicle.vehicleId, 'CIVILIAN' as const]),
    );
    for (const vehicle of vehicles) kinds.set(vehicle.vehicleId, vehicle.driverKind);
    const occupancy = new Map<string, Map<string, number>>();
    for (const actor of this.actors) {
      const lane = occupancy.get(actor.pose.laneId) ?? new Map<string, number>();
      lane.set(
        actor.vehicle.vehicleId,
        actor.distanceM - actor.route.lanes[actor.pose.laneIndex]!.startM,
      );
      occupancy.set(actor.pose.laneId, lane);
    }

    for (const actor of this.actors) {
      actor.ticks += 1;
      const context = this.road.getContext(actor.vehicle.vehicleId, { force: true }),
        projected = context === null ? null : projectBehaviorContext(context),
        lane = this.graph.getLane(actor.pose.laneId, 'CIVIL');
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
      actor.leader = frozenInteraction(leader, kinds);
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
          const targetLane = occupancy.get(nextPose.laneId),
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
        occupancy.get(actor.pose.laneId)?.delete(actor.vehicle.vehicleId);
        actor.distanceM = nextDistance;
        actor.pose = routePose(actor.route, actor.distanceM);
        const lane = occupancy.get(actor.pose.laneId) ?? new Map<string, number>();
        lane.set(
          actor.vehicle.vehicleId,
          actor.distanceM - actor.route.lanes[actor.pose.laneIndex]!.startM,
        );
        occupancy.set(actor.pose.laneId, lane);
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
