import { fields, record } from '../sessions';
import {
  createLaneGraph,
  createSpatialIndex,
  parseRoadMap,
  parseMapPriorityPolicy,
  createIntersectionConflicts,
  predictPriorityArrival,
} from '../world';
import type {
  RoadAccess,
  RoadMap,
  LaneProjection,
  SpatialEntity,
  SpatialIndex,
  MovementSignal,
  IntersectionConflicts,
  IntersectionConflictRelation,
  MapPriorityPolicy,
  PriorityArrival,
  SpatialKind,
} from '../world';
import type { Vector3 } from '../vehicles';

export interface RoadContextVehicle {
  readonly id: string;
  readonly incarnation: number;
  readonly positionM: Vector3;
  readonly headingRad: number;
  readonly access: RoadAccess;
  readonly speedMps: number;
  readonly radiusM: number;
  readonly route: Readonly<{ intersectionId: string; movementId: string }> | null;
  readonly distances: readonly Readonly<{
    relationId: string;
    distanceM: number;
    clearanceM: number;
  }>[];
}
export interface RoadContextCompleteness {
  readonly vehicles: boolean;
  readonly obstacles: boolean;
  readonly zones: boolean;
  readonly signals: boolean;
}
export interface RoadContextFrame {
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly tick: number;
  readonly vehicles: readonly RoadContextVehicle[];
  readonly obstacles: readonly SpatialEntity[];
  readonly zones: readonly SpatialEntity[];
  readonly signals: readonly MovementSignal[];
  readonly completeness: RoadContextCompleteness;
  readonly discontinuity?: boolean;
}
export interface RoadContextPriorityRelation {
  readonly relation: IntersectionConflictRelation;
  readonly policyKnown: boolean;
  readonly priorityMovementId: string | null;
  readonly subjectArrival: PriorityArrival | null;
  readonly localTraffic: readonly Readonly<{
    id: string;
    incarnation: number;
    arrival: PriorityArrival | null;
  }>[];
  /** Local index coverage never certifies a horizon-wide available gap. */
  readonly gap: 'UNKNOWN';
  readonly coverage: 'LOCAL_ONLY';
}
export interface RoadContext {
  /** Tick of the actual source frame. Cached contexts keep this original tick. */
  readonly tick: number;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly subject: Readonly<{ id: string; incarnation: number }>;
  readonly laneId: string | null;
  readonly lane: LaneProjection | null;
  readonly leader: Readonly<{
    id: string;
    incarnation: number;
    gapM: number;
    speedMps: number;
  }> | null;
  readonly signal: MovementSignal | null;
  readonly signalStatus: 'KNOWN' | 'UNKNOWN_ROUTE' | 'UNSIGNALED' | 'MISSING_OBSERVATION';
  readonly conflictRelationIds: readonly string[];
  readonly conflictVehicleIds: readonly string[];
  readonly priorityRelations: readonly RoadContextPriorityRelation[];
  readonly obstacleIds: readonly string[];
  readonly zoneIds: readonly string[];
  readonly obstacles: readonly SpatialEntity[];
  readonly nearbyVehicleIds: readonly string[];
  readonly completeness: RoadContextCompleteness;
  readonly discontinuity: boolean;
}
export const ROAD_CONTEXT_LIMITS = Object.freeze({
  vehicles: 110,
  obstacles: 96,
  zones: 512,
  verticesPerZone: 128,
  distancesPerVehicle: 128,
  distancesPerFrame: 4096,
  signals: 4096,
  fingerprintCodeUnits: 16 * 1024 * 1024,
  cacheEntries: 110,
  identitiesPerEpoch: 1024,
});
export interface RoadContextOptions {
  readonly priorityPolicy?: unknown;
  readonly decisionPeriodTicks?: number;
  readonly queryRadiusM?: number;
}
export interface RoadContextStats {
  readonly tick: number | null;
  readonly sessionId: string | null;
  readonly worldEpoch: number | null;
  readonly vehicles: number;
  readonly cachedContexts: number;
  readonly laneProjections: number;
  readonly invalidatedContexts: number;
  readonly identities: number;
  readonly retiredIdentities: number;
  readonly fingerprintCodeUnits: number;
  readonly disposed: boolean;
  readonly index: ReturnType<SpatialIndex['getStats']>;
}
export interface RoadContextEngine {
  updateFrame(frame: RoadContextFrame): void;
  getContext(vehicleId: string, options?: { readonly force?: boolean }): RoadContext | null;
  invalidate(vehicleId: string, incarnation: number): boolean;
  /** Explicit new owner scope, including session switches. Clears all dynamic ownership. */
  reset(sessionId: string, worldEpoch: number): void;
  dispose(): void;
  getStats(): Readonly<RoadContextStats>;
}
interface PreparedFrame {
  frame: RoadContextFrame;
  index: SpatialIndex;
  actors: ReadonlyMap<string, RoadContextVehicle>;
  fingerprint: string;
}
const scalar = (value: unknown, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error('Invalid road context number');
  return value;
};
function integer(value: unknown): number {
  const result = scalar(value, 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(result)) throw new Error('Invalid road context integer');
  return result;
}
function id(value: unknown, maximum = 128): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximum ||
    value.trim() !== value
  )
    throw new Error('Invalid road context identity');
  return value;
}
function array<T>(value: unknown, maximum: number): readonly T[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error('Road context array admission exceeded');
  if (Object.getPrototypeOf(value) !== Array.prototype)
    throw new Error('Invalid road context array prototype');
  // Bounded dense own data only; avoid evaluating array accessors during validation.
  if (Reflect.ownKeys(value).length !== value.length + 1)
    throw new Error('Invalid road context array');
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw new Error('Invalid road context array entry');
  }
  return value as readonly T[];
}
function point(value: unknown): Vector3 {
  const p = fields(value, ['x', 'y', 'z']);
  return Object.freeze({
    x: scalar(p.x, -1e6, 1e6),
    y: scalar(p.y, -1e6, 1e6),
    z: scalar(p.z, -1e6, 1e6),
  });
}
function prepare(
  input: RoadContextFrame,
  map: RoadMap,
  conflicts: IntersectionConflicts,
): PreparedFrame {
  const raw = record(input);
  const frameFields = [
    'sessionId',
    'worldEpoch',
    'tick',
    'vehicles',
    'obstacles',
    'zones',
    'signals',
    'completeness',
  ];
  const data = fields(
    raw,
    Object.hasOwn(raw, 'discontinuity') ? [...frameFields, 'discontinuity'] : frameFields,
  );
  const sessionId = id(data.sessionId, 256),
    worldEpoch = integer(data.worldEpoch),
    tick = integer(data.tick);
  const vehiclesInput = array<RoadContextVehicle>(data.vehicles, ROAD_CONTEXT_LIMITS.vehicles);
  const obstaclesInput = array<SpatialEntity>(data.obstacles, ROAD_CONTEXT_LIMITS.obstacles);
  const zonesInput = array<SpatialEntity>(data.zones, ROAD_CONTEXT_LIMITS.zones);
  const signalsInput = array<MovementSignal>(data.signals, ROAD_CONTEXT_LIMITS.signals);
  const completenessRecord = fields(data.completeness, [
    'vehicles',
    'obstacles',
    'zones',
    'signals',
  ]);
  for (const value of Object.values(completenessRecord))
    if (typeof value !== 'boolean') throw new Error('Invalid road context completeness');
  const completeness = Object.freeze({
    vehicles: completenessRecord.vehicles,
    obstacles: completenessRecord.obstacles,
    zones: completenessRecord.zones,
    signals: completenessRecord.signals,
  }) as RoadContextCompleteness;
  if (data.discontinuity !== undefined && typeof data.discontinuity !== 'boolean')
    throw new Error('Invalid road context discontinuity');
  const discontinuity = data.discontinuity === true;
  const identities = new Set<string>();
  let distances = 0,
    estimatedUnits = 4096;
  function claim(value: string) {
    if (identities.has(value)) throw new Error('Duplicate road context identity');
    identities.add(value);
  }
  const vehicles = vehiclesInput
    .map((value): RoadContextVehicle => {
      const v = fields(value, [
        'id',
        'incarnation',
        'positionM',
        'headingRad',
        'access',
        'speedMps',
        'radiusM',
        'route',
        'distances',
      ]);
      const vehicleId = id(v.id);
      claim(vehicleId);
      if (v.access !== 'TAXI' && v.access !== 'CIVIL')
        throw new Error('Invalid road context access');
      let route: RoadContextVehicle['route'] = null;
      if (v.route !== null) {
        const r = fields(v.route, ['intersectionId', 'movementId']);
        route = Object.freeze({
          intersectionId: id(r.intersectionId),
          movementId: id(r.movementId),
        });
        if (!conflicts.getMovement(route.intersectionId, route.movementId))
          throw new Error('Unknown road context movement');
      }
      const rawDistances = array<RoadContextVehicle['distances'][number]>(
        v.distances,
        ROAD_CONTEXT_LIMITS.distancesPerVehicle,
      );
      distances += rawDistances.length;
      if (distances > ROAD_CONTEXT_LIMITS.distancesPerFrame)
        throw new Error('Road context distance admission exceeded');
      const seen = new Set<string>();
      const copiedDistances = rawDistances
        .map((raw) => {
          const d = fields(raw, ['relationId', 'distanceM', 'clearanceM']),
            relationId = id(d.relationId, 1024);
          if (seen.has(relationId)) throw new Error('Duplicate road context distance');
          seen.add(relationId);
          if (
            route &&
            !conflicts
              .getIncompatible(route.intersectionId, route.movementId)
              .some((relation) => relation.id === relationId)
          )
            throw new Error('Road context distance belongs to a foreign route/relation');
          estimatedUnits += 6 * relationId.length + 256;
          return Object.freeze({
            relationId,
            distanceM: scalar(d.distanceM, -1e6, 1e6),
            clearanceM: scalar(d.clearanceM, 0.001, 100),
          });
        })
        .sort((a, b) => (a.relationId < b.relationId ? -1 : 1));
      estimatedUnits += 3072;
      return Object.freeze({
        id: vehicleId,
        incarnation: integer(v.incarnation),
        positionM: point(v.positionM),
        headingRad: scalar(v.headingRad, -Math.PI, Math.PI),
        access: v.access,
        speedMps: scalar(v.speedMps, 0, 100),
        radiusM: scalar(v.radiusM, 0, 100),
        route,
        distances: Object.freeze(copiedDistances),
      });
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  // Deep-read plain geometry before handing a safe owned copy to the index.
  function spatial(value: SpatialEntity, expectedKind: 'OBSTACLE' | 'ZONE'): SpatialEntity {
    const entity = fields(value, ['id', 'incarnation', 'kind', 'shape']),
      entityId = id(entity.id),
      incarnation = integer(entity.incarnation);
    claim(entityId);
    if (entity.kind !== expectedKind) throw new Error('Road context spatial kind mismatch');
    estimatedUnits += 2048;
    if (expectedKind === 'OBSTACLE') {
      const shape = fields(entity.shape, ['type', 'centerM', 'radiusM']);
      if (shape.type !== 'SPHERE') throw new Error('Road context obstacle shape mismatch');
      return Object.freeze({
        id: entityId,
        incarnation,
        kind: 'OBSTACLE',
        shape: Object.freeze({
          type: 'SPHERE',
          centerM: point(shape.centerM),
          radiusM: scalar(shape.radiusM, 0, 1e6),
        }),
      });
    }
    const shape = fields(entity.shape, ['type', 'verticesM', 'minHeightM', 'maxHeightM']);
    if (shape.type !== 'PRISM') throw new Error('Road context zone shape mismatch');
    const vertices = array(shape.verticesM, ROAD_CONTEXT_LIMITS.verticesPerZone);
    estimatedUnits += 128 * vertices.length;
    if (estimatedUnits > ROAD_CONTEXT_LIMITS.fingerprintCodeUnits)
      throw new Error('Road context fingerprint admission exceeded');
    return Object.freeze({
      id: entityId,
      incarnation,
      kind: 'ZONE',
      shape: Object.freeze({
        type: 'PRISM',
        verticesM: Object.freeze(vertices.map(point)),
        minHeightM: scalar(shape.minHeightM, -1e6, 1e6),
        maxHeightM: scalar(shape.maxHeightM, -1e6, 1e6),
      }),
    });
  }
  const obstacles = obstaclesInput.map((entity) => spatial(entity, 'OBSTACLE'));
  const zones = zonesInput.map((entity) => spatial(entity, 'ZONE'));
  const signalIdentities = new Set<string>(),
    phases = new Map<string, string>();
  const signals = signalsInput
    .map((raw): MovementSignal => {
      const s = fields(raw, [
        'tick',
        'signalId',
        'intersectionId',
        'phaseId',
        'movementId',
        'state',
      ]);
      if (integer(s.tick) !== tick) throw new Error('Stale road context signal tick');
      const signalId = id(s.signalId),
        intersectionId = id(s.intersectionId),
        phaseId = id(s.phaseId),
        movementId = id(s.movementId);
      const program = map.signals.find(
        (item) => item.id === signalId && item.intersectionId === intersectionId,
      );
      const phase = program?.phases.find((item) => item.id === phaseId);
      const authored = phase?.movementStates.find((item) => item.movementId === movementId);
      if (!phase || !authored || authored.state !== s.state)
        throw new Error('Unknown/contradictory road context signal');
      const key = JSON.stringify([intersectionId, movementId]);
      if (signalIdentities.has(key)) throw new Error('Duplicate road context signal');
      signalIdentities.add(key);
      if (phases.has(signalId) && phases.get(signalId) !== phaseId)
        throw new Error('Mixed road context signal phases');
      phases.set(signalId, phaseId);
      estimatedUnits += 4096;
      return Object.freeze({
        tick,
        signalId,
        intersectionId,
        phaseId,
        movementId,
        state: s.state as MovementSignal['state'],
      });
    })
    .sort((a, b) =>
      a.movementId < b.movementId
        ? -1
        : a.movementId > b.movementId
          ? 1
          : a.intersectionId < b.intersectionId
            ? -1
            : 1,
    );
  if (completeness.signals)
    for (const program of map.signals)
      for (const item of program.phases[0].movementStates)
        if (!signalIdentities.has(JSON.stringify([program.intersectionId, item.movementId])))
          throw new Error('Complete road context signals omit a movement');
  if (estimatedUnits > ROAD_CONTEXT_LIMITS.fingerprintCodeUnits)
    throw new Error('Road context fingerprint admission exceeded');
  const index = createSpatialIndex();
  try {
    for (const vehicle of vehicles)
      index.upsert({
        id: vehicle.id,
        incarnation: vehicle.incarnation,
        kind: 'VEHICLE',
        shape: { type: 'SPHERE', centerM: vehicle.positionM, radiusM: vehicle.radiusM },
      });
    for (const entity of obstacles) index.upsert(entity);
    for (const entity of zones) index.upsert(entity);
    const byId = (a: SpatialEntity, b: SpatialEntity) => (a.id < b.id ? -1 : 1);
    const frame = Object.freeze({
      sessionId,
      worldEpoch,
      tick,
      vehicles: Object.freeze(vehicles),
      obstacles: Object.freeze(obstacles.map((entity) => index.get(entity.id)!).sort(byId)),
      zones: Object.freeze(zones.map((entity) => index.get(entity.id)!).sort(byId)),
      signals: Object.freeze(signals),
      completeness,
      discontinuity,
    });
    const fingerprint = JSON.stringify(frame);
    if (fingerprint.length > ROAD_CONTEXT_LIMITS.fingerprintCodeUnits)
      throw new Error('Road context fingerprint bound violated');
    return {
      frame,
      index,
      actors: new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])),
      fingerprint,
    };
  } catch (error) {
    index.dispose();
    throw error;
  }
}
function insideIntersection(map: RoadMap, intersectionId: string, p: Vector3): boolean {
  const junction = map.intersections.find((item) => item.id === intersectionId);
  if (!junction) return false;
  const area = map.geometry.areas.find((item) => item.id === junction.geometryId)!;
  const vertices = area.vertexNodeIds.map(
    (nodeId) => map.geometry.nodes.find((node) => node.id === nodeId)!.positionM,
  );
  let inside = false,
    boundary = false,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
    const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    if (
      cross === 0 &&
      p.x >= Math.min(a.x, b.x) &&
      p.x <= Math.max(a.x, b.x) &&
      p.z >= Math.min(a.z, b.z) &&
      p.z <= Math.max(a.z, b.z)
    )
      boundary = true;
    else if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x)
      inside = !inside;
  }
  return (inside || boundary) && p.y >= minY - 1.5 && p.y <= maxY + 1.5;
}

/** Authoritative-frame consumer. AI cadence changes reuse only; it never advances simulation or telemetry. */
export function createRoadContext(
  input: unknown,
  options: RoadContextOptions = {},
): RoadContextEngine {
  const config = record(options);
  for (const key of Object.keys(config))
    if (!['priorityPolicy', 'decisionPeriodTicks', 'queryRadiusM'].includes(key))
      throw new Error('Unknown road context option');
  const map = parseRoadMap(input),
    graph = createLaneGraph(map);
  const parsed =
    config.priorityPolicy === undefined ? null : parseMapPriorityPolicy(config.priorityPolicy, map);
  const conflicts = parsed?.conflicts ?? createIntersectionConflicts(map),
    policy: MapPriorityPolicy | null = parsed?.policy ?? null;
  const period = scalar(config.decisionPeriodTicks ?? 6, 1, 60);
  if (!Number.isInteger(period)) throw new Error('Road context decision period must be integral');
  const radiusM = scalar(config.queryRadiusM ?? 60, 0, 1e6);
  const cache = new Map<string, RoadContext>(),
    dirty = new Set<string>();
  // Geometry is immutable within an accepted frame; reuse only that frame's projections.
  const projections = new Map<string, LaneProjection | null>();
  const incarnations = new Map<string, { incarnation: number; kind: SpatialKind }>(),
    retired = new Set<string>();
  let current: PreparedFrame | null = null,
    emptyIndex = createSpatialIndex(),
    disposed = false,
    busy = false;
  let owner: { sessionId: string; worldEpoch: number } | null = null;
  const alive = () => {
    if (disposed || busy) throw new Error('Road context disposed or reentrant');
  };
  const locate = (actor: RoadContextVehicle): LaneProjection | null => {
    if (projections.has(actor.id)) return projections.get(actor.id)!;
    const projection = graph.locateLane({
      positionM: actor.positionM,
      access: actor.access,
      headingRad: actor.headingRad,
    });
    projections.set(actor.id, projection);
    return projection;
  };
  function applicable(actor: RoadContextVehicle, lane: LaneProjection | null): boolean {
    if (!actor.route) return false;
    const movement = conflicts.getMovement(actor.route.intersectionId, actor.route.movementId);
    return (
      !!movement &&
      graph.canTraverse(movement.movement.fromLaneId, movement.movement.toLaneId, actor.access) &&
      (lane
        ? movement.movement.fromLaneId === lane.lane.id
        : insideIntersection(map, actor.route.intersectionId, actor.positionM))
    );
  }
  function derive(subject: RoadContextVehicle): RoadContext {
    const { frame, index, actors } = current!;
    const nearby = index.query({
      centerM: subject.positionM,
      radiusM,
      exclude: { id: subject.id, incarnation: subject.incarnation },
    });
    const lane = locate(subject),
      localActors: RoadContextVehicle[] = [],
      obstacles: SpatialEntity[] = [],
      zoneIds: string[] = [];
    for (const entity of nearby) {
      if (entity.kind === 'VEHICLE') localActors.push(actors.get(entity.id)!);
      else if (entity.kind === 'OBSTACLE') obstacles.push(entity);
      else zoneIds.push(entity.id);
    }
    const locations = new Map(localActors.map((actor) => [actor.id, locate(actor)]));
    let leader: RoadContext['leader'] = null,
      aheadM = Infinity;
    for (const actor of localActors) {
      const candidate = locations.get(actor.id);
      if (!lane || !candidate || lane.lane.id !== candidate.lane.id) continue;
      const ahead = candidate.longitudinalM - lane.longitudinalM;
      if (ahead <= 0 || ahead > aheadM || (ahead === aheadM && leader && actor.id >= leader.id))
        continue;
      aheadM = ahead;
      leader = Object.freeze({
        id: actor.id,
        incarnation: actor.incarnation,
        gapM: Math.max(0, ahead - subject.radiusM - actor.radiusM),
        speedMps: actor.speedMps,
      });
    }
    const route = applicable(subject, lane) ? subject.route : null;
    const relations = route
      ? conflicts.getIncompatible(route.intersectionId, route.movementId)
      : [];
    const localTraffic = localActors.filter(
      (actor) =>
        actor.route &&
        route &&
        actor.route.intersectionId === route.intersectionId &&
        actor.route.movementId !== route.movementId &&
        applicable(actor, locations.get(actor.id) ?? null) &&
        relations.some((relation) => relation.movementIds.includes(actor.route!.movementId)),
    );
    const signal = route
      ? (frame.signals.find(
          (item) =>
            item.intersectionId === route.intersectionId && item.movementId === route.movementId,
        ) ?? null)
      : null;
    const arrival = (actor: RoadContextVehicle, relationId: string): PriorityArrival | null => {
      if (frame.discontinuity) return null;
      const distance = actor.distances.find((item) => item.relationId === relationId);
      return distance
        ? predictPriorityArrival(distance.distanceM, distance.clearanceM, actor.speedMps)
        : null;
    };
    const priorityRelations = relations.map((relation): RoadContextPriorityRelation => {
      const rule = policy?.rules.find(
        (item) =>
          item.intersectionId === relation.intersectionId &&
          item.movementIds[0] === relation.movementIds[0] &&
          item.movementIds[1] === relation.movementIds[1],
      );
      return Object.freeze({
        relation,
        policyKnown: !!rule,
        priorityMovementId: rule?.priorityMovementId ?? null,
        subjectArrival: arrival(subject, relation.id),
        localTraffic: Object.freeze(
          localTraffic
            .filter((actor) => relation.movementIds.includes(actor.route!.movementId))
            .map((actor) =>
              Object.freeze({
                id: actor.id,
                incarnation: actor.incarnation,
                arrival: arrival(actor, relation.id),
              }),
            ),
        ),
        gap: 'UNKNOWN',
        coverage: 'LOCAL_ONLY',
      });
    });
    return Object.freeze({
      tick: frame.tick,
      sessionId: frame.sessionId,
      worldEpoch: frame.worldEpoch,
      subject: Object.freeze({ id: subject.id, incarnation: subject.incarnation }),
      laneId: lane?.lane.id ?? null,
      lane,
      leader,
      signal,
      signalStatus: signal
        ? 'KNOWN'
        : !route
          ? 'UNKNOWN_ROUTE'
          : map.signals.some((item) => item.intersectionId === route.intersectionId)
            ? 'MISSING_OBSERVATION'
            : 'UNSIGNALED',
      conflictRelationIds: Object.freeze(relations.map((relation) => relation.id).sort()),
      conflictVehicleIds: Object.freeze(localTraffic.map((actor) => actor.id).sort()),
      priorityRelations: Object.freeze(priorityRelations),
      obstacleIds: Object.freeze(obstacles.map((entity) => entity.id)),
      zoneIds: Object.freeze(zoneIds),
      obstacles: Object.freeze(obstacles),
      nearbyVehicleIds: Object.freeze(localActors.map((actor) => actor.id)),
      completeness: frame.completeness,
      discontinuity: frame.discontinuity === true,
    });
  }
  function clear() {
    current?.index.dispose();
    current = null;
    cache.clear();
    projections.clear();
    dirty.clear();
    incarnations.clear();
    retired.clear();
    emptyIndex.dispose();
    emptyIndex = createSpatialIndex();
  }
  return Object.freeze({
    updateFrame(inputFrame: RoadContextFrame) {
      alive();
      busy = true;
      try {
        const source = record(inputFrame),
          sourceSession = id(source.sessionId, 256),
          sourceEpoch = integer(source.worldEpoch),
          sourceTick = integer(source.tick);
        // Fence source scope/tick before preparing geometry; rejected callbacks cannot replace a new world.
        if (owner && (sourceSession !== owner.sessionId || sourceEpoch < owner.worldEpoch))
          throw new Error('Stale/foreign road context world');
        if (current && sourceEpoch === current.frame.worldEpoch && sourceTick < current.frame.tick)
          throw new Error('Stale road context tick');
        const next = prepare(inputFrame, map, conflicts);
        const liveIdentities = [
          ...next.frame.vehicles.map((actor) => ({
            id: actor.id,
            incarnation: actor.incarnation,
            kind: 'VEHICLE' as const,
          })),
          ...next.frame.obstacles,
          ...next.frame.zones,
        ];
        try {
          if (
            current &&
            next.frame.worldEpoch === current.frame.worldEpoch &&
            next.frame.tick === current.frame.tick
          ) {
            if (next.fingerprint !== current.fingerprint)
              throw new Error('Conflicting road context frame for the same tick');
            next.index.dispose();
            return;
          }
          if (owner && next.frame.worldEpoch === owner.worldEpoch) {
            let newIdentities = 0;
            for (const actor of liveIdentities) {
              const previous = incarnations.get(actor.id);
              if (previous && previous.kind !== actor.kind)
                throw new Error('Road context identity cannot change kind within an epoch');
              if (
                previous &&
                (actor.incarnation < previous.incarnation ||
                  (retired.has(actor.id) && actor.incarnation <= previous.incarnation))
              )
                throw new Error('Stale road context incarnation');
              if (previous === undefined) newIdentities++;
            }
            if (incarnations.size + newIdentities > ROAD_CONTEXT_LIMITS.identitiesPerEpoch)
              throw new Error('Road context identity admission exceeded');
          }
        } catch (error) {
          next.index.dispose();
          throw error;
        }
        const previous = current;
        if (!owner || next.frame.worldEpoch !== owner.worldEpoch) {
          cache.clear();
          dirty.clear();
          incarnations.clear();
          retired.clear();
        }
        if (next.frame.discontinuity) {
          cache.clear();
          dirty.clear();
        }
        owner = { sessionId: next.frame.sessionId, worldEpoch: next.frame.worldEpoch };
        current = next;
        projections.clear();
        for (const [key, value] of incarnations) {
          const complete =
            value.kind === 'VEHICLE'
              ? next.frame.completeness.vehicles
              : value.kind === 'OBSTACLE'
                ? next.frame.completeness.obstacles
                : next.frame.completeness.zones;
          if (complete && !next.index.get(key)) retired.add(key);
        }
        for (const actor of liveIdentities) {
          incarnations.set(actor.id, { incarnation: actor.incarnation, kind: actor.kind });
          retired.delete(actor.id);
        }
        for (const [key, value] of cache)
          if (next.actors.get(key)?.incarnation !== value.subject.incarnation) {
            cache.delete(key);
            dirty.delete(key);
          }
        // Drop removed IDs from dirty ownership even when no cached context was produced.
        for (const key of dirty) if (!next.actors.has(key)) dirty.delete(key);
        previous?.index.dispose();
      } finally {
        busy = false;
      }
    },
    getContext(vehicleId: string, queryOptions: { readonly force?: boolean } = {}) {
      alive();
      id(vehicleId);
      const query = record(queryOptions);
      for (const key of Object.keys(query))
        if (key !== 'force') throw new Error('Unknown road context query option');
      if (query.force !== undefined && typeof query.force !== 'boolean')
        throw new Error('Invalid road context force flag');
      const subject = current?.actors.get(vehicleId);
      if (!subject) return null;
      const cached = cache.get(vehicleId);
      if (
        !query.force &&
        !dirty.has(vehicleId) &&
        cached &&
        current!.frame.tick - cached.tick < period
      )
        return cached;
      const context = derive(subject);
      cache.set(vehicleId, context);
      dirty.delete(vehicleId);
      return context;
    },
    invalidate(vehicleId: string, incarnation: number) {
      alive();
      id(vehicleId);
      integer(incarnation);
      if (current?.actors.get(vehicleId)?.incarnation !== incarnation) return false;
      dirty.add(vehicleId);
      return true;
    },
    reset(sessionId: string, worldEpoch: number) {
      alive();
      id(sessionId, 256);
      integer(worldEpoch);
      if (owner?.sessionId === sessionId && worldEpoch <= owner.worldEpoch)
        throw new Error('Road context reset epoch must increase');
      clear();
      owner = { sessionId, worldEpoch };
    },
    dispose() {
      if (busy) throw new Error('Road context reentrant disposal');
      if (!disposed) {
        clear();
        emptyIndex.dispose();
        disposed = true;
        owner = null;
      }
    },
    getStats() {
      return Object.freeze({
        tick: current?.frame.tick ?? null,
        sessionId: owner?.sessionId ?? null,
        worldEpoch: owner?.worldEpoch ?? null,
        vehicles: current?.actors.size ?? 0,
        cachedContexts: cache.size,
        laneProjections: projections.size,
        invalidatedContexts: dirty.size,
        fingerprintCodeUnits: current?.fingerprint.length ?? 0,
        identities: incarnations.size,
        retiredIdentities: retired.size,
        disposed,
        index: (current?.index ?? emptyIndex).getStats(),
      });
    },
  });
}
