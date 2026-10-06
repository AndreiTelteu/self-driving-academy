import { boolean, choice, fields, list, number, requireContract, tick } from '../sessions';
import { createLaneGraph } from '../world';
import { parseRoadMap } from '../world';
import { vehicleClass } from '../vehicles';
import type { VehicleClassId } from '../vehicles';
import type { Vector3 } from '../vehicles';
import type { RoadAccess } from '../world';

export const LATERAL_LIMITS = Object.freeze({
  version: '049-lateral-v1' as const,
  trajectoryVersion: '049-directed-trajectory-v1' as const,
  actors: 110,
  verticesPerTrajectory: 256,
  retainedVertices: 28160,
  identitiesPerEpoch: 1024,
  idCodeUnits: 256,
  routeIdCodeUnits: 128,
  laneIdsPerTrajectory: 64,
  maximumObservationAgeTicks: 1,
  retainedHistory: 0,
  endpointToleranceM: 0.000001,
  // Candidate empirical envelope, not a tyre model or universal safety certification.
  maximumCornerAccelerationMps2: 3.5,
  maximumPolylineHeadingStepRad: Math.PI / 9,
  maximumGrade: 0.08,
  previewBaseM: 3,
  previewSeconds: 0.45,
});
export interface LateralWorld {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly mapId: string;
  readonly mapVersionId: string;
}
export interface LateralActor {
  readonly id: string;
  readonly incarnation: number;
}
export interface LateralRegisteredActor extends LateralActor {
  readonly classId: VehicleClassId;
}
export interface LateralRouteRequest extends LateralWorld {
  readonly version: '049-directed-trajectory-v1';
  readonly id: string;
  readonly access: RoadAccess;
  readonly laneIds: readonly string[];
  readonly loop: boolean;
}
/** Caller-owned immutable compiled token; serialized/fabricated copies are not admissible. */
export interface LateralTrajectory extends LateralWorld {
  readonly version: '049-directed-trajectory-v1';
  readonly id: string;
  readonly points: readonly Vector3[];
  readonly loop: boolean;
  readonly widthM: number;
  readonly speedLimitMps: number;
  readonly minimumRadiusM: number | null;
  readonly maximumHeadingStepRad: number;
  readonly maximumGrade: number;
  readonly authoredTurnCount: number;
}
export interface LateralObservation {
  readonly sourceTick: number;
  readonly positionM: Vector3;
  readonly rotationQuaternion: Readonly<{ x: number; y: number; z: number; w: number }>;
  readonly velocityMps: Vector3;
  readonly discontinuity: boolean;
}
export interface LateralInput extends LateralWorld {
  readonly version: '049-lateral-v1';
  readonly actor: LateralActor;
  readonly tick: number;
  readonly observation: LateralObservation | null;
  readonly requestedSpeedMps: number;
}
export type LateralReason =
  | 'TRACKING'
  | 'NO_TRAJECTORY'
  | 'MISSING_OBSERVATION'
  | 'STALE_OBSERVATION'
  | 'OBSERVATION_DISCONTINUITY'
  | 'CORRIDOR_EXIT'
  | 'UNSUPPORTED_GRADE'
  | 'SHARP_POLYLINE'
  | 'MECHANICALLY_INFEASIBLE'
  | 'REQUESTED_OVERSPEED'
  | 'ACTUAL_OVERSPEED'
  | 'REVERSE_MOTION'
  | 'ROUTE_END'
  | 'HEIGHT_MISMATCH'
  | 'HEADING_MISMATCH';
export interface LateralProjection extends LateralWorld {
  readonly version: '049-lateral-v1';
  readonly actor: LateralActor;
  readonly tick: number;
  readonly sourceTick: number | null;
  readonly trajectoryId: string | null;
  readonly steering: number;
  readonly feasible: boolean;
  readonly reason: LateralReason;
  readonly advisorySpeedLimitMps: number;
  readonly requestedSpeedMps: number;
  readonly actualSpeedMps: number | null;
  readonly crossTrackM: number | null;
  readonly targetM: Vector3 | null;
  readonly curvaturePerM: number | null;
}
export interface LateralController {
  setActors(actors: readonly LateralRegisteredActor[], world: LateralWorld): void;
  setAuthority(
    actor: LateralActor,
    mode: 'AUTO' | 'MANUAL' | 'LEARNING',
    world: LateralWorld,
  ): void;
  setTrajectory(
    actor: LateralActor,
    trajectory: LateralTrajectory | null,
    world: LateralWorld,
  ): void;
  step(input: LateralInput): LateralProjection;
  read(actor: LateralActor, world: LateralWorld): LateralProjection | null;
  reset(world: LateralWorld): void;
  dispose(): void;
  getStats(): Readonly<{
    actors: number;
    identities: number;
    trajectories: number;
    retainedVertices: number;
    projections: number;
    retiredIdentities: number;
    retainedHistory: 0;
    disposed: boolean;
  }>;
}
const provenance = new WeakSet<object>();
let compiling = false;
function id(value: unknown, maximum: number = LATERAL_LIMITS.idCodeUnits): string {
  requireContract(
    typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximum &&
      value.trim() === value,
    'Invalid lateral identity',
  );
  return value;
}
function worldData(value: unknown): LateralWorld {
  const data = fields(value, ['sessionId', 'worldEpoch', 'mapId', 'mapVersionId']);
  return Object.freeze({
    sessionId: id(data.sessionId),
    worldEpoch: tick(data.worldEpoch),
    mapId: id(data.mapId, LATERAL_LIMITS.routeIdCodeUnits),
    mapVersionId: id(data.mapVersionId, LATERAL_LIMITS.routeIdCodeUnits),
  });
}
function actorData(value: unknown): LateralActor {
  const data = fields(value, ['id', 'incarnation']),
    incarnation = tick(data.incarnation);
  requireContract(incarnation > 0, 'Lateral incarnation must be positive');
  return Object.freeze({ id: id(data.id), incarnation });
}
function sameWorld(a: LateralWorld, b: LateralWorld) {
  return (
    a.sessionId === b.sessionId &&
    a.worldEpoch === b.worldEpoch &&
    a.mapId === b.mapId &&
    a.mapVersionId === b.mapVersionId
  );
}
function vector(value: unknown): Vector3 {
  const data = fields(value, ['x', 'y', 'z']);
  return Object.freeze({
    x: number(data.x, -1000000, 1000000),
    y: number(data.y, -1000000, 1000000),
    z: number(data.z, -1000000, 1000000),
  });
}
const distance = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Setup only: full032/033 validation, actual authored TURN geometry and explicit route continuity. */
export function compileLateralTrajectory(
  input: unknown,
  request: LateralRouteRequest,
): LateralTrajectory {
  requireContract(!compiling, 'Lateral compilation is reentrant');
  compiling = true;
  try {
    const data = fields(request, [
      'version',
      'sessionId',
      'worldEpoch',
      'mapId',
      'mapVersionId',
      'id',
      'access',
      'laneIds',
      'loop',
    ]);
    requireContract(
      data.version === LATERAL_LIMITS.trajectoryVersion,
      'Unknown lateral trajectory version',
    );
    const world = worldData({
      sessionId: data.sessionId,
      worldEpoch: data.worldEpoch,
      mapId: data.mapId,
      mapVersionId: data.mapVersionId,
    });
    const routeId = id(data.id, LATERAL_LIMITS.routeIdCodeUnits),
      access = choice(data.access, ['TAXI', 'CIVIL']),
      loop = boolean(data.loop);
    requireContract(
      Array.isArray(data.laneIds) &&
        data.laneIds.length >= 1 &&
        data.laneIds.length <= LATERAL_LIMITS.laneIdsPerTrajectory,
      'Lateral lane capacity',
    );
    const laneIds = list(data.laneIds, (v) => id(v, LATERAL_LIMITS.routeIdCodeUnits));
    // Both temporaries obey existing032/033 caps. Neither full map/graph is retained in the token.
    const map = parseRoadMap(input),
      graph = createLaneGraph(map);
    requireContract(map.mapId === world.mapId, 'Lateral map identity mismatch');
    const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
    const paths = new Map(map.geometry.paths.map((path) => [path.id, path]));
    const points: Vector3[] = [];
    let widthM = Infinity,
      speedLimitMps = Infinity,
      authoredTurnCount = 0;
    function append(values: readonly Vector3[]) {
      let start = 0;
      if (points.length) {
        requireContract(
          distance(points[points.length - 1], values[0]) <= LATERAL_LIMITS.endpointToleranceM,
          'Discontinuous authored trajectory',
        );
        start = 1;
      }
      requireContract(
        points.length + values.length - start <= LATERAL_LIMITS.verticesPerTrajectory,
        'Lateral vertex capacity',
      );
      for (let i = start; i < values.length; i++) points.push(Object.freeze({ ...values[i] }));
    }
    for (let index = 0; index < laneIds.length; index++) {
      const lane = graph.getLane(laneIds[index], access),
        path = graph.getDirectedPath(laneIds[index]);
      requireContract(lane !== null && path !== null, 'Inaccessible lateral lane');
      if (index > 0) {
        const connection = graph
          .getConnections(laneIds[index - 1], access)
          .find((c) => c.toLaneId === lane.id);
        requireContract(connection !== undefined, 'Undeclared lateral route connection');
        if (connection.kind === 'TURN') {
          requireContract(connection.movement !== null, 'Missing authored movement');
          const authored = paths.get(connection.movement.geometryId);
          requireContract(authored !== undefined, 'Missing authored movement geometry');
          append(authored.nodeIds.map((node) => nodes.get(node)!));
          authoredTurnCount++;
        }
      }
      append(path.points);
      widthM = Math.min(widthM, lane.widthM);
      speedLimitMps = Math.min(speedLimitMps, lane.speedLimitMps);
    }
    requireContract(points.length >= 2, 'Empty lateral trajectory');
    if (loop)
      requireContract(
        distance(points[0], points[points.length - 1]) <= LATERAL_LIMITS.endpointToleranceM,
        'Open trajectory cannot loop',
      );
    let minimumRadiusM = Infinity,
      maximumHeadingStepRad = 0,
      maximumGrade = 0;
    const segments = points.length - 1;
    for (let i = 0; i < segments; i++) {
      const a = points[i],
        b = points[i + 1],
        length = Math.hypot(b.x - a.x, b.z - a.z);
      requireContract(length > 0.000001, 'Vertical or zero-length lateral segment');
      maximumGrade = Math.max(maximumGrade, Math.abs(b.y - a.y) / length);
    }
    const cornerCount = loop ? segments : segments - 1;
    for (let i = 0; i < cornerCount; i++) {
      const center = loop ? i : i + 1,
        a = points[loop ? (center - 1 + segments) % segments : center - 1],
        b = points[center],
        c = points[loop ? (center + 1) % segments : center + 1];
      const ab = Math.hypot(b.x - a.x, b.z - a.z),
        bc = Math.hypot(c.x - b.x, c.z - b.z),
        ac = Math.hypot(c.x - a.x, c.z - a.z);
      const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
      const dot = (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z);
      maximumHeadingStepRad = Math.max(maximumHeadingStepRad, Math.abs(Math.atan2(cross, dot)));
      if (Math.abs(cross) > 1e-12)
        minimumRadiusM = Math.min(minimumRadiusM, (ab * bc * ac) / (2 * Math.abs(cross)));
    }
    const token: LateralTrajectory = Object.freeze({
      ...world,
      version: LATERAL_LIMITS.trajectoryVersion,
      id: routeId,
      points: Object.freeze(points),
      loop,
      widthM,
      speedLimitMps,
      minimumRadiusM: Number.isFinite(minimumRadiusM) ? minimumRadiusM : null,
      maximumHeadingStepRad,
      maximumGrade,
      authoredTurnCount,
    });
    provenance.add(token);
    return token;
  } finally {
    compiling = false;
  }
}
interface Entry {
  actor: LateralRegisteredActor;
  mode: 'AUTO' | 'MANUAL' | 'LEARNING';
  trajectory: LateralTrajectory | null;
  current: LateralProjection | null;
  lastTick: number;
}
interface Identity {
  incarnation: number;
  classId: VehicleClassId;
  active: boolean;
}

/** Pure60Hz lateral owner. Caller owns all clocks, longitudinal policy and physical actuation. */
export function createLateralController(initialWorld: LateralWorld): LateralController {
  let world = worldData(initialWorld),
    entries = new Map<string, Entry>(),
    identities = new Map<string, Identity>();
  let busy = false,
    disposed = false;
  function mutate<T>(action: () => T): T {
    requireContract(!busy, 'Lateral mutation is reentrant');
    requireContract(!disposed, 'Lateral controller disposed');
    busy = true;
    try {
      return action();
    } finally {
      busy = false;
    }
  }
  function checkedWorld(value: LateralWorld) {
    requireContract(sameWorld(world, worldData(value)), 'Foreign lateral world');
  }
  function currentActor(value: LateralActor): Entry {
    const actor = actorData(value),
      entry = entries.get(actor.id);
    requireContract(
      entry !== undefined && entry.actor.incarnation === actor.incarnation,
      'Stale lateral actor',
    );
    return entry;
  }
  return {
    setActors(values, scope) {
      mutate(() => {
        checkedWorld(scope);
        requireContract(
          Array.isArray(values) && values.length <= LATERAL_LIMITS.actors,
          'Lateral actor capacity',
        );
        const actors = list(values, (value) => {
          const data = fields(value, ['id', 'incarnation', 'classId']);
          return Object.freeze({
            ...actorData({ id: data.id, incarnation: data.incarnation }),
            classId: choice(data.classId, ['sedan', 'compact']),
          });
        });
        const next = new Map<string, Entry>(),
          history = new Map(identities);
        for (const [key, value] of history) history.set(key, { ...value, active: false });
        for (const actor of actors) {
          requireContract(!next.has(actor.id), 'Duplicate lateral actor');
          const old = entries.get(actor.id),
            identity = identities.get(actor.id);
          if (identity) {
            requireContract(
              actor.incarnation >= identity.incarnation,
              'Retired lateral incarnation',
            );
            requireContract(
              actor.incarnation > identity.incarnation || identity.active,
              'Removed lateral actor needs newer incarnation',
            );
            if (actor.incarnation === identity.incarnation)
              requireContract(
                actor.classId === identity.classId,
                'Mechanical class changed without incarnation',
              );
          } else
            requireContract(
              history.size < LATERAL_LIMITS.identitiesPerEpoch,
              'Lateral identity capacity',
            );
          history.set(actor.id, {
            incarnation: actor.incarnation,
            classId: actor.classId,
            active: true,
          });
          next.set(
            actor.id,
            old?.actor.incarnation === actor.incarnation
              ? { ...old }
              : { actor, mode: 'AUTO', trajectory: null, current: null, lastTick: -1 },
          );
        }
        entries = next;
        identities = history;
      });
    },
    setAuthority(actor, mode, scope) {
      mutate(() => {
        checkedWorld(scope);
        const entry = currentActor(actor),
          next = choice(mode, ['AUTO', 'MANUAL', 'LEARNING']);
        if (next !== entry.mode) {
          entry.mode = next;
          entry.current = null;
          entry.trajectory = null;
        }
      });
    },
    setTrajectory(actor, trajectory, scope) {
      mutate(() => {
        checkedWorld(scope);
        const entry = currentActor(actor);
        if (trajectory !== null) {
          requireContract(provenance.has(trajectory), 'Trajectory lacks local032/033 provenance');
          requireContract(sameWorld(trajectory, world), 'Stale trajectory world/map version');
          const retained =
            [...entries.values()].reduce(
              (sum, e) => sum + (e === entry ? 0 : (e.trajectory?.points.length ?? 0)),
              0,
            ) + trajectory.points.length;
          requireContract(
            retained <= LATERAL_LIMITS.retainedVertices,
            'Lateral retained vertex capacity',
          );
        }
        entry.trajectory = trajectory;
        entry.current = null;
      });
    },
    step(input) {
      return mutate(() => {
        const data = fields(input, [
          'version',
          'sessionId',
          'worldEpoch',
          'mapId',
          'mapVersionId',
          'actor',
          'tick',
          'observation',
          'requestedSpeedMps',
        ]);
        requireContract(data.version === LATERAL_LIMITS.version, 'Unknown lateral input version');
        checkedWorld({
          sessionId: data.sessionId as string,
          worldEpoch: data.worldEpoch as number,
          mapId: data.mapId as string,
          mapVersionId: data.mapVersionId as string,
        });
        const entry = currentActor(data.actor as LateralActor),
          nextTick = tick(data.tick),
          requestedSpeedMps = number(data.requestedSpeedMps, 0, 100);
        requireContract(entry.mode === 'AUTO', 'No AUTO lateral authority');
        requireContract(nextTick > entry.lastTick, 'Lateral tick must advance');
        let observation: LateralObservation | null = null;
        if (data.observation !== null) {
          const value = fields(data.observation, [
              'sourceTick',
              'positionM',
              'rotationQuaternion',
              'velocityMps',
              'discontinuity',
            ]),
            q = fields(value.rotationQuaternion, ['x', 'y', 'z', 'w']);
          const rotationQuaternion = Object.freeze({
            x: number(q.x, -1, 1),
            y: number(q.y, -1, 1),
            z: number(q.z, -1, 1),
            w: number(q.w, -1, 1),
          });
          requireContract(
            Math.abs(
              Math.hypot(
                rotationQuaternion.x,
                rotationQuaternion.y,
                rotationQuaternion.z,
                rotationQuaternion.w,
              ) - 1,
            ) <= 0.000001,
            'Invalid lateral quaternion',
          );
          const velocityMps = vector(value.velocityMps);
          requireContract(
            Math.hypot(velocityMps.x, velocityMps.y, velocityMps.z) <= 100,
            'Lateral velocity capacity',
          );
          observation = {
            sourceTick: tick(value.sourceTick),
            positionM: vector(value.positionM),
            rotationQuaternion,
            velocityMps,
            discontinuity: boolean(value.discontinuity),
          };
        }
        const trajectory = entry.trajectory,
          config = vehicleClass(entry.actor.classId);
        let reason: LateralReason = 'TRACKING',
          steering = 0,
          advisorySpeedLimitMps = 0,
          crossTrackM: number | null = null,
          targetM: Vector3 | null = null,
          curvaturePerM: number | null = null,
          actualSpeedMps: number | null = null;
        if (!trajectory) reason = 'NO_TRAJECTORY';
        else if (!observation) reason = 'MISSING_OBSERVATION';
        else if (
          observation.sourceTick > nextTick ||
          nextTick - observation.sourceTick > LATERAL_LIMITS.maximumObservationAgeTicks
        )
          reason = 'STALE_OBSERVATION';
        else if (observation.discontinuity) reason = 'OBSERVATION_DISCONTINUITY';
        else {
          const p = observation.positionM,
            q = observation.rotationQuaternion,
            v = observation.velocityMps;
          const forward = { x: 2 * (q.x * q.z + q.w * q.y), z: 1 - 2 * (q.x * q.x + q.y * q.y) };
          actualSpeedMps = Math.hypot(v.x, v.z);
          // Posted road speed is metadata for the explicit style owner, never a hidden regulatory clamp.
          advisorySpeedLimitMps =
            trajectory.minimumRadiusM === null
              ? 100
              : Math.min(
                  100,
                  Math.sqrt(
                    LATERAL_LIMITS.maximumCornerAccelerationMps2 * trajectory.minimumRadiusM,
                  ),
                );
          let best = Infinity,
            segment = 0,
            fraction = 0;
          const points = trajectory.points;
          for (let i = 0; i < points.length - 1; i++) {
            const a = points[i],
              b = points[i + 1],
              dx = b.x - a.x,
              dz = b.z - a.z;
            const t = Math.max(
              0,
              Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)),
            );
            const d = (p.x - a.x - t * dx) ** 2 + (p.z - a.z - t * dz) ** 2;
            if (d < best) {
              best = d;
              segment = i;
              fraction = t;
            }
          }
          crossTrackM = Math.sqrt(best);
          const nearestHeightM =
            points[segment].y + fraction * (points[segment + 1].y - points[segment].y);
          let remaining =
            LATERAL_LIMITS.previewBaseM + actualSpeedMps * LATERAL_LIMITS.previewSeconds;
          let target = points[segment],
            atEnd = false;
          for (let scan = 0; scan < points.length; scan++) {
            const a = points[segment],
              b = points[segment + 1],
              length = Math.hypot(b.x - a.x, b.z - a.z),
              available = length * (1 - fraction);
            if (remaining <= available) {
              const t = fraction + remaining / length;
              target = {
                x: a.x + t * (b.x - a.x),
                y: a.y + t * (b.y - a.y),
                z: a.z + t * (b.z - a.z),
              };
              break;
            }
            remaining -= available;
            if (!trajectory.loop && segment === points.length - 2) {
              target = b;
              atEnd = distance(p, b) < 0.5;
              break;
            }
            segment = (segment + 1) % (points.length - 1);
            fraction = 0;
          }
          targetM = Object.freeze({ ...target });
          const dx = target.x - p.x,
            dz = target.z - p.z,
            squared = dx * dx + dz * dz;
          curvaturePerM = squared > 1e-12 ? (2 * (dx * forward.z - dz * forward.x)) / squared : 0;
          steering = Math.max(
            -1,
            Math.min(
              1,
              Math.atan(config.wheels.wheelbaseM * curvaturePerM) / config.steeringRadians,
            ),
          );
          if (trajectory.maximumGrade > LATERAL_LIMITS.maximumGrade) reason = 'UNSUPPORTED_GRADE';
          else if (trajectory.maximumHeadingStepRad > LATERAL_LIMITS.maximumPolylineHeadingStepRad)
            reason = 'SHARP_POLYLINE';
          else if (
            trajectory.minimumRadiusM !== null &&
            trajectory.minimumRadiusM < config.turningRadiusM
          )
            reason = 'MECHANICALLY_INFEASIBLE';
          else if (Math.abs(p.y - nearestHeightM) > 1.5) reason = 'HEIGHT_MISMATCH';
          else if (Math.hypot(forward.x, forward.z) < 0.9 || dx * forward.x + dz * forward.z < 0)
            reason = 'HEADING_MISMATCH';
          else if (
            crossTrackM > Math.max(0, trajectory.widthM / 2 - config.wheels.trackM / 2 - 0.2)
          )
            reason = 'CORRIDOR_EXIT';
          else if (v.x * forward.x + v.z * forward.z < -0.2) reason = 'REVERSE_MOTION';
          else if (requestedSpeedMps > advisorySpeedLimitMps) reason = 'REQUESTED_OVERSPEED';
          else if (actualSpeedMps > advisorySpeedLimitMps) reason = 'ACTUAL_OVERSPEED';
          else if (atEnd) reason = 'ROUTE_END';
          if (reason !== 'TRACKING') steering = 0;
        }
        const projection: LateralProjection = Object.freeze({
          ...world,
          version: LATERAL_LIMITS.version,
          actor: Object.freeze({ id: entry.actor.id, incarnation: entry.actor.incarnation }),
          tick: nextTick,
          sourceTick: observation?.sourceTick ?? null,
          trajectoryId: trajectory?.id ?? null,
          steering,
          feasible: reason === 'TRACKING',
          reason,
          advisorySpeedLimitMps,
          requestedSpeedMps,
          actualSpeedMps,
          crossTrackM,
          targetM,
          curvaturePerM,
        });
        entry.lastTick = nextTick;
        entry.current = projection;
        return projection;
      });
    },
    read(actor, scope) {
      return mutate(() => {
        checkedWorld(scope);
        return currentActor(actor).current;
      });
    },
    reset(scope) {
      mutate(() => {
        const next = worldData(scope);
        requireContract(
          next.sessionId !== world.sessionId || next.worldEpoch > world.worldEpoch,
          'Lateral reset requires a new world epoch',
        );
        world = next;
        entries = new Map();
        identities = new Map();
      });
    },
    dispose() {
      requireContract(!busy, 'Lateral disposal is reentrant');
      if (disposed) return;
      disposed = true;
      entries.clear();
      identities.clear();
    },
    getStats() {
      return Object.freeze({
        actors: entries.size,
        identities: identities.size,
        trajectories: [...entries.values()].filter((e) => e.trajectory !== null).length,
        retainedVertices: [...entries.values()].reduce(
          (sum, e) => sum + (e.trajectory?.points.length ?? 0),
          0,
        ),
        projections: [...entries.values()].filter((e) => e.current !== null).length,
        retiredIdentities: [...identities.values()].filter((i) => !i.active).length,
        retainedHistory: 0 as const,
        disposed,
      });
    },
  };
}
