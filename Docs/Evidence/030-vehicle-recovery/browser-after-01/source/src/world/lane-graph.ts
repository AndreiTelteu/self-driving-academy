import type { Vector3 } from '../vehicles';
import { parseRoadMap } from './parser';
import type { Lane, Movement, RoadAccess } from './schema';

export interface DirectedLanePath {
  readonly laneId: string;
  readonly nodeIds: readonly string[];
  readonly points: readonly Vector3[];
  readonly lengthM: number;
}
export interface LaneConnection {
  readonly fromLaneId: string;
  readonly toLaneId: string;
  readonly kind: 'CONTINUATION' | 'TURN';
  readonly intersectionId: string | null;
  readonly movement: Movement | null;
}
export interface LaneNeighbors {
  readonly left: Lane | null;
  readonly right: Lane | null;
}
export interface LaneLocationQuery {
  readonly positionM: Vector3;
  readonly access: RoadAccess;
  /** Zero is +X, positive angles rotate toward +Z, as in the map schema. */
  readonly headingRad?: number;
  /** Defaults to pi/3. Opposite travel never matches when heading is supplied. */
  readonly maxHeadingErrorRad?: number;
  /** Height separates bridges/floors. Default 1.5m; callers calibrate vehicle datum. */
  readonly maxHeightDifferenceM?: number;
}
export interface LaneProjection {
  readonly lane: Lane;
  readonly positionM: Vector3;
  readonly segmentIndex: number;
  readonly segmentFraction: number;
  readonly longitudinalM: number;
  readonly distanceM: number;
  /** Positive offset is left of travel in the X/Z map plane; null on vertical edges. */
  readonly lateralOffsetM: number | null;
  readonly heightOffsetM: number;
  readonly headingRad: number | null;
  readonly headingErrorRad: number | null;
}
export interface LaneGraph {
  readonly mapId: string;
  getLane(id: string, access?: RoadAccess): Lane | null;
  getDirectedPath(id: string): DirectedLanePath | null;
  getNeighbors(id: string, access: RoadAccess): LaneNeighbors;
  getSuccessors(id: string, access: RoadAccess): readonly Lane[];
  getConnections(id: string, access: RoadAccess): readonly LaneConnection[];
  getTurnConnections(id: string, access: RoadAccess): readonly LaneConnection[];
  canTraverse(fromId: string, toId: string, access: RoadAccess): boolean;
  projectOnLane(id: string, query: LaneLocationQuery): LaneProjection | null;
  locateLane(query: LaneLocationQuery): LaneProjection | null;
  getStats(): Readonly<LaneGraphStats>;
}
export interface LaneGraphStats {
  readonly lanes: number;
  readonly segments: number;
  readonly connections: number;
  readonly spatialCells: number;
  readonly spatialReferences: number;
  readonly fallbackLanes: number;
  readonly geometryVariants: number;
  readonly uniqueSegments: number;
}
export const LANE_GRAPH_LIMITS = Object.freeze({
  cellSizeM: 32,
  maxCellsPerLane: 256,
  maxSpatialReferences: 32768,
});
interface Segment {
  readonly a: Vector3;
  readonly b: Vector3;
  readonly lengthM: number;
  readonly startM: number;
}
interface Geometry {
  readonly path: DirectedLanePath;
  readonly segments: readonly Segment[];
  readonly min: Vector3;
  readonly max: Vector3;
}
const EMPTY = Object.freeze([]);
const NO_NEIGHBORS: LaneNeighbors = Object.freeze({ left: null, right: null });
function readAccess(access: RoadAccess): RoadAccess {
  if (access !== 'TAXI' && access !== 'CIVIL') throw new Error('Unknown road access class');
  return access;
}
function finite(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new Error('Invalid lane query value');
  return value;
}
function readQuery(query: LaneLocationQuery) {
  readAccess(query.access);
  const position = query.positionM;
  for (const coordinate of [position.x, position.y, position.z])
    finite(coordinate, -1_000_000, 1_000_000);
  const heading = query.headingRad;
  if (heading !== undefined) finite(heading, -Math.PI, Math.PI);
  const maxHeading = finite(query.maxHeadingErrorRad ?? Math.PI / 3, 0, Math.PI / 2);
  const maxHeight = finite(query.maxHeightDifferenceM ?? 1.5, 0, 100);
  return { position, heading, maxHeading, maxHeight, access: query.access };
}
function better(candidate: LaneProjection, current: LaneProjection | null): boolean {
  if (!current) return true;
  if (candidate.distanceM !== current.distanceM) return candidate.distanceM < current.distanceM;
  const angle = candidate.headingErrorRad ?? 0,
    otherAngle = current.headingErrorRad ?? 0;
  if (angle !== otherAngle) return angle < otherAngle;
  if (candidate.lane.id !== current.lane.id) return candidate.lane.id < current.lane.id;
  return candidate.segmentIndex < current.segmentIndex;
}

/** Validates/copies once; topology, directed geometry and per-class edges remain private and bounded. */
export function createLaneGraph(input: unknown): LaneGraph {
  const map = parseRoadMap(input);
  const lanes = new Map(map.lanes.map((lane) => [lane.id, lane]));
  const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
  const paths = new Map(map.geometry.paths.map((path) => [path.id, path]));
  const geometry = new Map<string, Geometry>();
  const variants = new Map<string, Geometry>();
  let segmentCount = 0;
  for (const lane of map.lanes) {
    const variantKey = JSON.stringify([lane.geometryId, lane.direction]);
    const cached = variants.get(variantKey);
    if (cached) {
      geometry.set(lane.id, {
        ...cached,
        path: Object.freeze({ ...cached.path, laneId: lane.id }),
      });
      segmentCount += cached.segments.length;
      continue;
    }
    const ids = [...paths.get(lane.geometryId)!.nodeIds];
    if (lane.direction === 'REVERSE') ids.reverse();
    const points = ids.map((id) => nodes.get(id)!);
    let lengthM = 0;
    const segments: Segment[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      segments.push(Object.freeze({ a, b, lengthM: length, startM: lengthM }));
      lengthM += length;
    }
    segmentCount += segments.length;
    const min = { x: Infinity, y: Infinity, z: Infinity },
      max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const point of points)
      for (const axis of ['x', 'y', 'z'] as const) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    geometry.set(lane.id, {
      path: Object.freeze({
        laneId: lane.id,
        nodeIds: Object.freeze(ids),
        points: Object.freeze(points),
        lengthM,
      }),
      segments: Object.freeze(segments),
      min,
      max,
    });
    variants.set(variantKey, geometry.get(lane.id)!);
  }
  const turns = new Map<string, Map<string, { movement: Movement; intersectionId: string }>>();
  for (const junction of map.intersections)
    for (const movement of junction.movements) {
      let targets = turns.get(movement.fromLaneId);
      if (!targets) {
        targets = new Map();
        turns.set(movement.fromLaneId, targets);
      }
      targets.set(movement.toLaneId, { movement, intersectionId: junction.id });
    }
  const perClass = new Map<
    RoadAccess,
    Map<
      string,
      {
        neighbors: LaneNeighbors;
        successors: readonly Lane[];
        connections: readonly LaneConnection[];
        turns: readonly LaneConnection[];
        targets: ReadonlySet<string>;
      }
    >
  >();
  let connectionCount = 0;
  for (const access of ['TAXI', 'CIVIL'] as const) {
    const index: NonNullable<ReturnType<typeof perClass.get>> = new Map();
    for (const lane of map.lanes) {
      if (!lane.access.includes(access)) continue;
      const available = (id: string | null): Lane | null => {
        const value = id === null ? undefined : lanes.get(id);
        return value?.access.includes(access) ? value : null;
      };
      const successors = lane.successorIds
        .map(available)
        .filter((value): value is Lane => value !== null);
      const connections = successors.map((next): LaneConnection => {
        const turn = turns.get(lane.id)?.get(next.id);
        return Object.freeze({
          fromLaneId: lane.id,
          toLaneId: next.id,
          kind: turn ? 'TURN' : 'CONTINUATION',
          intersectionId: turn?.intersectionId ?? null,
          movement: turn?.movement ?? null,
        });
      });
      index.set(lane.id, {
        neighbors: Object.freeze({
          left: available(lane.neighbors.left),
          right: available(lane.neighbors.right),
        }),
        successors: Object.freeze(successors),
        connections: Object.freeze(connections),
        turns: Object.freeze(connections.filter((edge) => edge.kind === 'TURN')),
        targets: new Set(successors.map((next) => next.id)),
      });
    }
    perClass.set(access, index);
  }
  for (const lane of map.lanes) connectionCount += lane.successorIds.length;
  // Index only bounded boxes. Long curves and excess references remain in a complete fallback.
  const cells = new Map<string, Lane[]>();
  const fallback: Lane[] = [];
  let spatialReferences = 0;
  const cellKey = (x: number, z: number) => `${x},${z}`;
  for (const lane of lanes.values()) {
    const box = geometry.get(lane.id)!,
      halfWidth = lane.widthM / 2;
    const minX = Math.floor((box.min.x - halfWidth) / LANE_GRAPH_LIMITS.cellSizeM);
    const maxX = Math.floor((box.max.x + halfWidth) / LANE_GRAPH_LIMITS.cellSizeM);
    const minZ = Math.floor((box.min.z - halfWidth) / LANE_GRAPH_LIMITS.cellSizeM);
    const maxZ = Math.floor((box.max.z + halfWidth) / LANE_GRAPH_LIMITS.cellSizeM);
    const count = (maxX - minX + 1) * (maxZ - minZ + 1);
    if (
      count > LANE_GRAPH_LIMITS.maxCellsPerLane ||
      spatialReferences + count > LANE_GRAPH_LIMITS.maxSpatialReferences
    ) {
      fallback.push(lane);
      continue;
    }
    for (let x = minX; x <= maxX; x++)
      for (let z = minZ; z <= maxZ; z++) {
        const key = cellKey(x, z);
        const bucket = cells.get(key);
        if (bucket) bucket.push(lane);
        else cells.set(key, [lane]);
      }
    spatialReferences += count;
  }
  const indexed = (id: string, access: RoadAccess) => perClass.get(readAccess(access))!.get(id);
  const project = (lane: Lane, query: ReturnType<typeof readQuery>): LaneProjection | null => {
    if (!lane.access.includes(query.access)) return null;
    const data = geometry.get(lane.id)!;
    const p = query.position,
      halfWidth = lane.widthM / 2;
    if (
      p.x < data.min.x - halfWidth ||
      p.x > data.max.x + halfWidth ||
      p.z < data.min.z - halfWidth ||
      p.z > data.max.z + halfWidth ||
      p.y < data.min.y - query.maxHeight ||
      p.y > data.max.y + query.maxHeight
    )
      return null;
    let result: LaneProjection | null = null;
    for (const [index, segment] of data.segments.entries()) {
      const a = segment.a,
        b = segment.b,
        dx = b.x - a.x,
        dy = b.y - a.y,
        dz = b.z - a.z;
      const planarSquared = dx * dx + dz * dz;
      const fraction =
        planarSquared > 0
          ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / planarSquared
          : (p.y - a.y) / dy;
      // Finite strip caps: never invent a lane beyond a directed endpoint.
      if (fraction < 0 || fraction > 1) continue;
      const x = a.x + fraction * dx,
        y = a.y + fraction * dy,
        z = a.z + fraction * dz;
      const offsetX = p.x - x,
        offsetZ = p.z - z,
        height = p.y - y;
      if (Math.hypot(offsetX, offsetZ) > halfWidth || Math.abs(height) > query.maxHeight) continue;
      const heading = planarSquared > 0 ? Math.atan2(dz, dx) : null;
      const error =
        query.heading === undefined
          ? null
          : heading === null
            ? Infinity
            : Math.abs(
                Math.atan2(Math.sin(query.heading - heading), Math.cos(query.heading - heading)),
              );
      if (error !== null && error > query.maxHeading + 1e-12) continue;
      const candidate: LaneProjection = Object.freeze({
        lane,
        positionM: Object.freeze({ x, y, z }),
        segmentIndex: index,
        segmentFraction: fraction,
        longitudinalM: segment.startM + fraction * segment.lengthM,
        distanceM: Math.hypot(offsetX, offsetZ, height),
        lateralOffsetM:
          planarSquared > 0 ? (dx * offsetZ - dz * offsetX) / Math.sqrt(planarSquared) : null,
        heightOffsetM: height,
        headingRad: heading,
        headingErrorRad: error,
      });
      if (better(candidate, result)) result = candidate;
    }
    return result;
  };
  const stats = Object.freeze({
    lanes: lanes.size,
    segments: segmentCount,
    connections: connectionCount,
    spatialCells: cells.size,
    spatialReferences,
    fallbackLanes: fallback.length,
    geometryVariants: variants.size,
    uniqueSegments: [...variants.values()].reduce((sum, data) => sum + data.segments.length, 0),
  });
  return Object.freeze({
    mapId: map.mapId,
    getLane(id: string, access?: RoadAccess): Lane | null {
      if (access !== undefined) readAccess(access);
      const lane = lanes.get(id);
      return lane && (access === undefined || lane.access.includes(readAccess(access)))
        ? lane
        : null;
    },
    getDirectedPath: (id: string): DirectedLanePath | null => geometry.get(id)?.path ?? null,
    getNeighbors: (id: string, access: RoadAccess) =>
      indexed(id, access)?.neighbors ?? NO_NEIGHBORS,
    getSuccessors: (id: string, access: RoadAccess) => indexed(id, access)?.successors ?? EMPTY,
    getConnections: (id: string, access: RoadAccess) => indexed(id, access)?.connections ?? EMPTY,
    getTurnConnections: (id: string, access: RoadAccess) => indexed(id, access)?.turns ?? EMPTY,
    canTraverse: (from: string, to: string, access: RoadAccess) =>
      indexed(from, access)?.targets.has(to) ?? false,
    projectOnLane(id: string, query: LaneLocationQuery) {
      const checked = readQuery(query),
        lane = lanes.get(id);
      return lane ? project(lane, checked) : null;
    },
    locateLane(query: LaneLocationQuery) {
      const checked = readQuery(query);
      let result: LaneProjection | null = null;
      const key = cellKey(
        Math.floor(checked.position.x / LANE_GRAPH_LIMITS.cellSizeM),
        Math.floor(checked.position.z / LANE_GRAPH_LIMITS.cellSizeM),
      );
      for (const candidates of [cells.get(key) ?? EMPTY, fallback])
        for (const lane of candidates) {
          const candidate = project(lane, checked);
          if (candidate && better(candidate, result)) result = candidate;
        }
      return result;
    },
    getStats: () => stats,
  });
}
