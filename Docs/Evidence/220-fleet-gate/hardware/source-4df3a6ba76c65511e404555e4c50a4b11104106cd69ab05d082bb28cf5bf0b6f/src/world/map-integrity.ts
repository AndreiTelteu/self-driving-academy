import { MapValidationError } from './errors';
import { createLaneGraph } from './lane-graph';
import { parseRoadMap } from './parser';
import { createRoutePlanner } from './route-planner';
import type { RoadAccess, RoadMap } from './schema';
import type { Vector3 } from '../vehicles';

/**
 * Deterministic, load-time integrity audit for the authored road map.
 *
 * The validator never mutates its input, never throws for map content and never relies on hidden
 * state. It complements `parseRoadMap` instead of duplicating it: the parser owns the schema
 * contract and the first rejection, while this module reports the complete authored-data audit with
 * a closed reason vocabulary, stable field paths, entity IDs and positions, including faults the
 * schema permits structurally but the V1 neighbourhood does not allow (lane corridor overlap,
 * disconnected components, unroutable service zones).
 */
export const MAP_INTEGRITY_VERSION = 'map-integrity-v1';

export const MAP_INTEGRITY_LIMITS = Object.freeze({
  /** Deterministic cap on reported details; `issueCount` still counts every fault. */
  maxIssues: 512,
  /** Largest authored lane pair set examined for corridor overlap. */
  maxLanePairs: 200_000,
  /** Largest service-zone pair set examined for footprint overlap. */
  maxZonePairs: 65_536,
  /** A* expansion ceiling per route probe, identical to the route planner document. */
  maxRouteExpansions: 16_384,
});

/** Closed reason vocabulary. Every issue uses exactly one of these values. */
export const MAP_INTEGRITY_REASONS = [
  'SCHEMA_INVALID',
  'DUPLICATE_ID',
  'MISSING_REFERENCE',
  'LANE_GEOMETRY_INVALID',
  'LANE_WIDTH_INVALID',
  'LANE_CORRIDOR_OVERLAP',
  'LANE_ENDPOINT_MISMATCH',
  'ONE_WAY_INCONSISTENT',
  'DANGLING_LANE',
  'ORPHAN_LANE',
  'INTERSECTION_INVALID',
  'MOVEMENT_INVALID',
  'SIGNAL_INVALID',
  'STOP_LINE_INVALID',
  'CROSSWALK_INVALID',
  'SERVICE_ZONE_INVALID',
  'SERVICE_ZONE_OVERLAP',
  'RECOVERY_POINT_INVALID',
  'CONNECTIVITY_DISCONNECTED',
  'ROUTE_UNREACHABLE',
] as const;
export type MapIntegrityReason = (typeof MAP_INTEGRITY_REASONS)[number];

/** Closed check vocabulary used by the machine-readable coverage report. */
export const MAP_INTEGRITY_CHECKS = [
  'SCHEMA',
  'DUPLICATE_IDS',
  'GEOMETRY_REFERENCES',
  'LANE_REFERENCES',
  'LANE_GEOMETRY',
  'INTERSECTIONS',
  'SIGNALS',
  'STOP_LINES',
  'CROSSWALKS',
  'SERVICE_ZONES',
  'RECOVERY_POINTS',
  'CONNECTIVITY',
  'ROUTING',
] as const;
export type MapIntegrityCheckId = (typeof MAP_INTEGRITY_CHECKS)[number];

export type MapIntegrityCheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';

export interface MapIntegrityCheckCoverage {
  readonly id: MapIntegrityCheckId;
  readonly status: MapIntegrityCheckStatus;
  readonly examined: number;
  readonly issues: number;
  readonly note: string | null;
}

export interface MapIntegrityIssue {
  readonly reason: MapIntegrityReason;
  readonly check: MapIntegrityCheckId;
  readonly path: string;
  readonly message: string;
  readonly entityId: string | null;
  readonly relatedId: string | null;
  readonly positionM: Vector3 | null;
}

export type MapIntegrityEntityKind =
  | 'nodes'
  | 'paths'
  | 'areas'
  | 'lanes'
  | 'intersections'
  | 'movements'
  | 'conflictZones'
  | 'signals'
  | 'phases'
  | 'movementStates'
  | 'stopLines'
  | 'crosswalks'
  | 'serviceZones'
  | 'recoveryPoints';

export type MapIntegrityReferenceKind =
  | 'NODE'
  | 'PATH'
  | 'AREA'
  | 'LANE'
  | 'INTERSECTION'
  | 'SIGNAL'
  | 'STOP_LINE'
  | 'CONFLICT_ZONE'
  | 'MOVEMENT';

export interface MapIntegrityReferenceCoverage {
  readonly checked: number;
  readonly missing: number;
  readonly byKind: Readonly<Record<MapIntegrityReferenceKind, number>>;
}

export interface MapIntegrityAccessCoverage {
  readonly lanes: number;
  readonly zones: number;
  readonly reachableLaneZonePairs: number;
  readonly unreachableLaneZonePairs: number;
  readonly unreachableLaneIds: readonly string[];
}

export interface MapIntegrityRoutingCoverage {
  readonly requested: number;
  readonly ready: number;
  readonly failed: number;
  readonly byAccess: Readonly<
    Record<RoadAccess, { requested: number; ready: number; failed: number }>
  >;
  readonly routablePickupDropoffZones: readonly string[];
  readonly unroutablePickupDropoffZones: readonly string[];
}

export interface MapIntegrityScenarioCoverage {
  readonly laneDirections: Readonly<Record<'FORWARD' | 'REVERSE', number>>;
  readonly laneAccess: Readonly<Record<RoadAccess, number>>;
  readonly roadClasses: Readonly<Record<'ARTERIAL' | 'RESIDENTIAL', number>>;
  readonly intersectionTypes: Readonly<
    Record<'SIGNALIZED' | 'STOP_CONTROLLED' | 'UNCONTROLLED', number>
  >;
  readonly stopLineKinds: Readonly<Record<'STOP' | 'SIGNAL' | 'CROSSWALK', number>>;
  readonly serviceZoneKinds: Readonly<Record<'PICKUP' | 'DROPOFF' | 'BOTH', number>>;
  readonly serviceZoneAccess: Readonly<Record<'TAXI' | 'CIVIL' | 'TAXI+CIVIL', number>>;
  readonly pickupDropoffZones: number;
  readonly routablePickupDropoffZones: number;
  readonly recoveryPoints: number;
}

export interface MapIntegrityCoverage {
  readonly entityCounts: Readonly<Record<MapIntegrityEntityKind, number>>;
  readonly references: MapIntegrityReferenceCoverage;
  readonly connectivity: {
    readonly stronglyConnectedComponents: number;
    readonly weaklyConnectedComponents: number;
    readonly largestComponentLanes: number;
    readonly disconnectedLaneIds: readonly string[];
    readonly byAccess: Readonly<Record<RoadAccess, MapIntegrityAccessCoverage>>;
  };
  readonly routing: MapIntegrityRoutingCoverage;
  readonly scenarios: MapIntegrityScenarioCoverage;
  readonly checks: readonly MapIntegrityCheckCoverage[];
}

export interface MapIntegrityReport {
  readonly version: string;
  readonly mapId: string | null;
  readonly schemaVersion: number | null;
  readonly ok: boolean;
  readonly issueCount: number;
  readonly truncated: boolean;
  readonly errorsByReason: Readonly<Partial<Record<MapIntegrityReason, number>>>;
  readonly issues: readonly MapIntegrityIssue[];
  readonly coverage: MapIntegrityCoverage;
  /** Parser rejection message when the document cannot be validated by PBI032. */
  readonly schemaError: string | null;
}

export interface MapIntegrityOptions {
  readonly expectedSchemaVersion?: number;
  readonly expectedUnits?: string;
  readonly expectedMapId?: string;
  readonly maxIssues?: number;
}

type RawObject = Readonly<Record<string, unknown>>;

interface RawEntry {
  readonly index: number;
  readonly path: string;
  readonly value: RawObject;
  readonly id: string | null;
}

interface RawWorld {
  readonly mapId: string | null;
  readonly schemaVersion: number | null;
  readonly units: string | null;
  readonly bounds: { readonly min: Vector3; readonly max: Vector3 } | null;
  readonly nodes: readonly RawEntry[];
  readonly paths: readonly RawEntry[];
  readonly areas: readonly RawEntry[];
  readonly lanes: readonly RawEntry[];
  readonly intersections: readonly RawEntry[];
  readonly signals: readonly RawEntry[];
  readonly stopLines: readonly RawEntry[];
  readonly crosswalks: readonly RawEntry[];
  readonly serviceZones: readonly RawEntry[];
  readonly recoveryPoints: readonly RawEntry[];
  readonly nodeById: ReadonlyMap<string, RawEntry>;
  readonly pathById: ReadonlyMap<string, RawEntry>;
  readonly areaById: ReadonlyMap<string, RawEntry>;
  readonly laneById: ReadonlyMap<string, RawEntry>;
  readonly intersectionById: ReadonlyMap<string, RawEntry>;
  readonly signalById: ReadonlyMap<string, RawEntry>;
  readonly stopLineById: ReadonlyMap<string, RawEntry>;
  readonly crosswalkById: ReadonlyMap<string, RawEntry>;
  readonly serviceZoneById: ReadonlyMap<string, RawEntry>;
  readonly conflictZonesByIntersection: ReadonlyMap<string, ReadonlyMap<string, RawEntry>>;
  readonly movementsByIntersection: ReadonlyMap<string, ReadonlyMap<string, RawEntry>>;
  readonly movementOwners: ReadonlyMap<string, string>;
  readonly entityCounts: Readonly<Record<MapIntegrityEntityKind, number>>;
}

interface CheckTracker {
  readonly states: Map<
    MapIntegrityCheckId,
    { examined: number; issues: number; skipped: boolean; note: string | null }
  >;
}

interface ReferenceStats {
  checked: number;
  missing: number;
  byKind: Record<MapIntegrityReferenceKind, number>;
}

interface Segment2 {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly dx: number;
  readonly dz: number;
  readonly length: number;
}

const EPSILON = 1e-6;

function asObject(value: unknown): RawObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RawObject)
    : null;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readVector(value: unknown): Vector3 | null {
  const object = asObject(value);
  if (!object) return null;
  const x = asNumber(object.x);
  const y = asNumber(object.y);
  const z = asNumber(object.z);
  return x === null || y === null || z === null ? null : { x, y, z };
}

function readEntries(value: unknown, basePath: string): RawEntry[] {
  return asArray(value).map((entry, index) => {
    const object = asObject(entry) ?? {};
    return Object.freeze({
      index,
      path: `${basePath}[${index}]`,
      value: object,
      id: asString(object.id),
    });
  });
}

function indexEntries(entries: readonly RawEntry[]): Map<string, RawEntry> {
  const result = new Map<string, RawEntry>();
  for (const entry of entries)
    if (entry.id !== null && !result.has(entry.id)) result.set(entry.id, entry);
  return result;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function freezePosition(position: Vector3 | null): Vector3 | null {
  return position ? Object.freeze({ x: position.x, y: position.y, z: position.z }) : null;
}

function createRawWorld(raw: RawObject): RawWorld {
  const geometry = asObject(raw.geometry);
  const nodes = readEntries(geometry?.nodes, 'map.geometry.nodes');
  const paths = readEntries(geometry?.paths, 'map.geometry.paths');
  const areas = readEntries(geometry?.areas, 'map.geometry.areas');
  const lanes = readEntries(raw.lanes, 'map.lanes');
  const intersections = readEntries(raw.intersections, 'map.intersections');
  const signals = readEntries(raw.signals, 'map.signals');
  const stopLines = readEntries(raw.stopLines, 'map.stopLines');
  const crosswalks = readEntries(raw.crosswalks, 'map.crosswalks');
  const serviceZones = readEntries(raw.serviceZones, 'map.serviceZones');
  const recoveryPoints = readEntries(raw.recoveryPoints, 'map.recoveryPoints');

  const conflictZonesByIntersection = new Map<string, Map<string, RawEntry>>();
  const movementsByIntersection = new Map<string, Map<string, RawEntry>>();
  const movementOwners = new Map<string, string>();
  let movementCount = 0;
  let conflictZoneCount = 0;
  let phaseCount = 0;
  let movementStateCount = 0;
  for (const junction of intersections) {
    if (junction.id === null) continue;
    const zones = readEntries(junction.value.conflictZones, `${junction.path}.conflictZones`);
    const movements = readEntries(junction.value.movements, `${junction.path}.movements`);
    conflictZoneCount += zones.length;
    movementCount += movements.length;
    conflictZonesByIntersection.set(junction.id, indexEntries(zones));
    movementsByIntersection.set(junction.id, indexEntries(movements));
    for (const movement of movements)
      if (movement.id !== null && !movementOwners.has(movement.id))
        movementOwners.set(movement.id, junction.id);
  }
  for (const signal of signals) {
    const phases = readEntries(signal.value.phases, `${signal.path}.phases`);
    phaseCount += phases.length;
    for (const phase of phases) movementStateCount += asArray(phase.value.movementStates).length;
  }

  const boundsObject = asObject(raw.bounds);
  const boundsMin = readVector(boundsObject?.minM);
  const boundsMax = readVector(boundsObject?.maxM);

  return {
    mapId: asString(raw.mapId),
    schemaVersion: asNumber(raw.schemaVersion),
    units: asString(raw.units),
    bounds: boundsMin && boundsMax ? { min: boundsMin, max: boundsMax } : null,
    nodes,
    paths,
    areas,
    lanes,
    intersections,
    signals,
    stopLines,
    crosswalks,
    serviceZones,
    recoveryPoints,
    nodeById: indexEntries(nodes),
    pathById: indexEntries(paths),
    areaById: indexEntries(areas),
    laneById: indexEntries(lanes),
    intersectionById: indexEntries(intersections),
    signalById: indexEntries(signals),
    stopLineById: indexEntries(stopLines),
    crosswalkById: indexEntries(crosswalks),
    serviceZoneById: indexEntries(serviceZones),
    conflictZonesByIntersection,
    movementsByIntersection,
    movementOwners,
    entityCounts: Object.freeze({
      nodes: nodes.length,
      paths: paths.length,
      areas: areas.length,
      lanes: lanes.length,
      intersections: intersections.length,
      movements: movementCount,
      conflictZones: conflictZoneCount,
      signals: signals.length,
      phases: phaseCount,
      movementStates: movementStateCount,
      stopLines: stopLines.length,
      crosswalks: crosswalks.length,
      serviceZones: serviceZones.length,
      recoveryPoints: recoveryPoints.length,
    }),
  };
}

function nodePosition(world: RawWorld, nodeId: string | null): Vector3 | null {
  if (nodeId === null) return null;
  return readVector(world.nodeById.get(nodeId)?.value.positionM);
}

function pathNodeIds(world: RawWorld, pathId: string | null): readonly string[] {
  if (pathId === null) return [];
  return asArray(world.pathById.get(pathId)?.value.nodeIds).filter(
    (value): value is string => typeof value === 'string',
  );
}

function pathPoints(world: RawWorld, pathId: string | null): readonly Vector3[] {
  return pathNodeIds(world, pathId)
    .map((nodeId) => nodePosition(world, nodeId))
    .filter((position): position is Vector3 => position !== null);
}

function lanePoints(world: RawWorld, lane: RawEntry): readonly Vector3[] {
  const direction = asString(lane.value.direction);
  const points = pathPoints(world, asString(lane.value.geometryId));
  return direction === 'REVERSE' ? [...points].reverse() : points;
}

function midpoint(points: readonly Vector3[]): Vector3 | null {
  if (points.length === 0) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2, z: (first.z + last.z) / 2 };
}

function lanePosition(world: RawWorld, lane: RawEntry | undefined): Vector3 | null {
  if (!lane) return null;
  return midpoint(lanePoints(world, lane));
}

function areaBox(points: readonly Vector3[]): { min: Vector3; max: Vector3 } | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const zs = points.map((point) => point.z);
  return {
    min: { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) },
    max: { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) },
  };
}

function areaPoints(world: RawWorld, areaId: string | null): readonly Vector3[] {
  if (areaId === null) return [];
  return pathPointsFromNodeIds(world, asArray(world.areaById.get(areaId)?.value.vertexNodeIds));
}

function pathPointsFromNodeIds(world: RawWorld, nodeIds: readonly unknown[]): readonly Vector3[] {
  return nodeIds
    .map((nodeId) => nodePosition(world, typeof nodeId === 'string' ? nodeId : null))
    .filter((position): position is Vector3 => position !== null);
}

function inBox(point: Vector3, box: { min: Vector3; max: Vector3 }): boolean {
  return (
    point.x >= box.min.x &&
    point.x <= box.max.x &&
    point.y >= box.min.y &&
    point.y <= box.max.y &&
    point.z >= box.min.z &&
    point.z <= box.max.z
  );
}

function pointInAreaXZ(point: Vector3, vertices: readonly Vector3[]): boolean {
  if (vertices.length < 3) return false;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const a = vertices[i]!;
    const b = vertices[j]!;
    if (a.z > point.z !== b.z > point.z) {
      const x = ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
      if (point.x < x) inside = !inside;
    }
  }
  return inside;
}

function orientation(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
): number {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
}

function segmentsProperlyCross(a: Segment2, b: Segment2): boolean {
  const o1 = orientation(a.ax, a.az, a.bx, a.bz, b.ax, b.az);
  const o2 = orientation(a.ax, a.az, a.bx, a.bz, b.bx, b.bz);
  const o3 = orientation(b.ax, b.az, b.bx, b.bz, a.ax, a.az);
  const o4 = orientation(b.ax, b.az, b.bx, b.bz, a.bx, a.bz);
  return o1 * o2 < -EPSILON && o3 * o4 < -EPSILON;
}

function polygonOverlapXZ(first: readonly Vector3[], second: readonly Vector3[]): boolean {
  if (first.length < 3 || second.length < 3) return false;
  const a = areaBox(first);
  const b = areaBox(second);
  if (!a || !b) return false;
  const overlapX = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const overlapZ = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  if (overlapX <= EPSILON || overlapZ <= EPSILON) return false;
  const aSegments = polygonSegments(first);
  const bSegments = polygonSegments(second);
  for (const segmentA of aSegments)
    for (const segmentB of bSegments) if (segmentsProperlyCross(segmentA, segmentB)) return true;
  if (first.some((point) => pointInAreaXZ(point, second))) return true;
  if (second.some((point) => pointInAreaXZ(point, first))) return true;
  // Conservative bbox fallback for convex authored footprints whose boundaries overlap without a
  // proper crossing (e.g. identical rectangles with collinear edges).
  return overlapX * overlapZ > EPSILON;
}

function polygonSegments(vertices: readonly Vector3[]): Segment2[] {
  const segments: Segment2[] = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index]!;
    const b = vertices[(index + 1) % vertices.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    segments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, dx, dz, length: Math.hypot(dx, dz) });
  }
  return segments;
}

function laneSegments(points: readonly Vector3[]): Segment2[] {
  const segments: Segment2[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length > EPSILON) segments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, dx, dz, length });
  }
  return segments;
}

/**
 * Perpendicular distance between two parallel centreline segments whose longitudinal projections
 * overlap, or null when they are not parallel / do not overlap. This is the lane-corridor overlap
 * witness: it uses authored centre lines and declared widths, not a physical collision shape.
 */
function parallelSegmentDistance(a: Segment2, b: Segment2): number | null {
  if (a.length <= EPSILON || b.length <= EPSILON) return null;
  const cross = (a.dx * b.dz - a.dz * b.dx) / (a.length * b.length);
  if (Math.abs(cross) > 0.02) return null;
  const ux = a.dx / a.length;
  const uz = a.dz / a.length;
  const t1 = (b.ax - a.ax) * ux + (b.az - a.az) * uz;
  const t2 = (b.bx - a.ax) * ux + (b.bz - a.az) * uz;
  const low = Math.min(t1, t2);
  const high = Math.max(t1, t2);
  if (high <= 0.01 || low >= a.length - 0.01) return null;
  return Math.abs((b.ax - a.ax) * a.dz - (b.az - a.az) * a.dx) / a.length;
}

function laneBox(points: readonly Vector3[]): { min: Vector3; max: Vector3 } | null {
  return areaBox(points);
}

function boxesOverlapY(
  first: { min: Vector3; max: Vector3 },
  second: { min: Vector3; max: Vector3 },
): boolean {
  return Math.min(first.max.y, second.max.y) - Math.max(first.min.y, second.min.y) > -0.5;
}

/** Iterative Kosaraju; no recursion on authored-size graphs. */
function stronglyConnectedComponents(
  ids: readonly string[],
  adjacency: ReadonlyMap<string, readonly string[]>,
): string[][] {
  const order: string[] = [];
  const visited = new Set<string>();
  for (const start of ids) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack: { id: string; index: number }[] = [{ id: start, index: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const successors = adjacency.get(frame.id) ?? [];
      if (frame.index >= successors.length) {
        order.push(frame.id);
        stack.pop();
        continue;
      }
      const next = successors[frame.index]!;
      frame.index += 1;
      if (visited.has(next)) continue;
      visited.add(next);
      stack.push({ id: next, index: 0 });
    }
  }
  const reverse = new Map<string, string[]>();
  for (const id of ids) reverse.set(id, []);
  for (const [from, successors] of adjacency)
    for (const to of successors) reverse.get(to)?.push(from);
  const assigned = new Set<string>();
  const components: string[][] = [];
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const start = order[index]!;
    if (assigned.has(start)) continue;
    const component: string[] = [];
    const stack = [start];
    assigned.add(start);
    while (stack.length > 0) {
      const id = stack.pop()!;
      component.push(id);
      for (const previous of reverse.get(id) ?? [])
        if (!assigned.has(previous)) {
          assigned.add(previous);
          stack.push(previous);
        }
    }
    components.push(component);
  }
  return components;
}

function weaklyConnectedComponents(
  ids: readonly string[],
  adjacency: ReadonlyMap<string, readonly string[]>,
): number {
  const parent = new Map<string, string>(ids.map((id) => [id, id]));
  const find = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current)!;
    let node = id;
    while (parent.get(node) !== node) {
      const next = parent.get(node)!;
      parent.set(node, current);
      node = next;
    }
    return current;
  };
  const union = (a: string, b: string): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA < rootB ? rootB : rootA, rootA < rootB ? rootA : rootB);
  };
  for (const [from, successors] of adjacency)
    for (const to of successors) if (parent.has(to) && parent.has(from)) union(from, to);
  return new Set(ids.map((id) => find(id))).size;
}

export function checkMapIntegrity(
  input: unknown,
  options: MapIntegrityOptions = {},
): MapIntegrityReport {
  if (!asObject(input)) {
    const issues = [
      Object.freeze({
        reason: 'SCHEMA_INVALID' as const,
        check: 'SCHEMA' as const,
        path: 'map',
        message: 'Map document must be a plain object',
        entityId: null,
        relatedId: null,
        positionM: null,
      }),
    ];
    return Object.freeze({
      version: MAP_INTEGRITY_VERSION,
      mapId: null,
      schemaVersion: null,
      ok: false,
      issueCount: 1,
      truncated: false,
      errorsByReason: Object.freeze({ SCHEMA_INVALID: 1 }),
      issues: Object.freeze(issues),
      coverage: emptyCoverage(),
      schemaError: 'Map document must be a plain object',
    });
  }
  const raw = input as RawObject;
  const world = createRawWorld(raw);
  const tracker = createTracker();
  const issues: MapIntegrityIssue[] = [];
  const errorsByReason = new Map<MapIntegrityReason, number>();
  const references: ReferenceStats = {
    checked: 0,
    missing: 0,
    byKind: {
      NODE: 0,
      PATH: 0,
      AREA: 0,
      LANE: 0,
      INTERSECTION: 0,
      SIGNAL: 0,
      STOP_LINE: 0,
      CONFLICT_ZONE: 0,
      MOVEMENT: 0,
    },
  };
  const maxIssues = Math.max(
    1,
    Math.min(options.maxIssues ?? MAP_INTEGRITY_LIMITS.maxIssues, 4096),
  );
  let issueCount = 0;
  let suppressed = false;

  const fail = (
    reason: MapIntegrityReason,
    check: MapIntegrityCheckId,
    path: string,
    message: string,
    entityId: string | null = null,
    relatedId: string | null = null,
    positionM: Vector3 | null = null,
  ): void => {
    issueCount += 1;
    errorsByReason.set(reason, (errorsByReason.get(reason) ?? 0) + 1);
    const state = tracker.states.get(check)!;
    state.issues += 1;
    if (issues.length >= maxIssues) {
      suppressed = true;
      return;
    }
    issues.push(
      Object.freeze({
        reason,
        check,
        path,
        message,
        entityId,
        relatedId,
        positionM: freezePosition(positionM),
      }),
    );
  };

  const examine = (check: MapIntegrityCheckId, count = 1): void => {
    tracker.states.get(check)!.examined += count;
  };

  const reference = (
    kind: MapIntegrityReferenceKind,
    table: ReadonlyMap<string, RawEntry>,
    id: string | null,
    path: string,
    ownerId: string | null,
    check: MapIntegrityCheckId,
    positionM: Vector3 | null = null,
  ): RawEntry | null => {
    references.checked += 1;
    references.byKind[kind] += 1;
    if (id === null) {
      references.missing += 1;
      fail('MISSING_REFERENCE', check, path, `Missing ${kind} reference`, ownerId, null, positionM);
      return null;
    }
    const entry = table.get(id);
    if (!entry) {
      references.missing += 1;
      fail(
        'MISSING_REFERENCE',
        check,
        path,
        `${kind} reference ${id} does not resolve`,
        ownerId,
        id,
        positionM,
      );
      return null;
    }
    return entry;
  };

  // ----- SCHEMA -------------------------------------------------------------------------------
  examine('SCHEMA');
  const expectedSchema = options.expectedSchemaVersion ?? 1;
  if (world.schemaVersion !== expectedSchema)
    fail(
      'SCHEMA_INVALID',
      'SCHEMA',
      'map.schemaVersion',
      `Expected schemaVersion ${expectedSchema}, received ${String(raw.schemaVersion)}`,
      world.mapId,
    );
  const expectedUnits = options.expectedUnits ?? 'SI';
  if (world.units !== expectedUnits)
    fail(
      'SCHEMA_INVALID',
      'SCHEMA',
      'map.units',
      `Expected units ${expectedUnits}, received ${String(raw.units)}`,
      world.mapId,
    );
  if (world.mapId === null || world.mapId.length === 0 || world.mapId.trim() !== world.mapId)
    fail('SCHEMA_INVALID', 'SCHEMA', 'map.mapId', 'Map ID must be a non-empty trimmed string');
  if (options.expectedMapId !== undefined && world.mapId !== options.expectedMapId)
    fail(
      'SCHEMA_INVALID',
      'SCHEMA',
      'map.mapId',
      `Expected mapId ${options.expectedMapId}, received ${String(world.mapId)}`,
      world.mapId,
    );
  if (!world.bounds)
    fail('SCHEMA_INVALID', 'SCHEMA', 'map.bounds', 'Bounds must contain finite minM/maxM');
  else if (
    !(world.bounds.min.x < world.bounds.max.x) ||
    !(world.bounds.min.z < world.bounds.max.z) ||
    !(world.bounds.min.y <= world.bounds.max.y)
  )
    fail(
      'SCHEMA_INVALID',
      'SCHEMA',
      'map.bounds',
      'Bounds require positive X/Z extent and nonnegative Y extent',
      world.mapId,
    );
  const bounds = world.bounds;
  const boundsValid =
    bounds !== null &&
    bounds.min.x < bounds.max.x &&
    bounds.min.z < bounds.max.z &&
    bounds.min.y <= bounds.max.y;
  for (const node of world.nodes) {
    examine('SCHEMA');
    const position = readVector(node.value.positionM);
    if (!position) {
      fail(
        'SCHEMA_INVALID',
        'SCHEMA',
        `${node.path}.positionM`,
        'Node position must be finite X/Y/Z metres',
        node.id,
      );
      continue;
    }
    if (!bounds || !boundsValid) continue;
    if (
      position.x < bounds.min.x ||
      position.x > bounds.max.x ||
      position.z < bounds.min.z ||
      position.z > bounds.max.z ||
      position.y < bounds.min.y ||
      position.y > bounds.max.y
    )
      fail(
        'SCHEMA_INVALID',
        'SCHEMA',
        `${node.path}.positionM`,
        'Node position outside map bounds',
        node.id,
        null,
        position,
      );
  }

  // ----- DUPLICATE IDS ------------------------------------------------------------------------
  const globalIds = new Map<string, string>();
  const indexList = (entries: readonly RawEntry[], check: MapIntegrityCheckId): void => {
    for (const entry of entries) {
      examine(check);
      if (entry.id === null) {
        fail('SCHEMA_INVALID', check, `${entry.path}.id`, 'Entity ID must be a string', null);
        continue;
      }
      const previous = globalIds.get(entry.id);
      if (previous !== undefined)
        fail(
          'DUPLICATE_ID',
          check,
          `${entry.path}.id`,
          `Duplicate ID; first declared at ${previous}`,
          entry.id,
          previous,
          positionForEntry(world, entry),
        );
      else globalIds.set(entry.id, `${entry.path}.id`);
    }
  };
  indexList(world.nodes, 'DUPLICATE_IDS');
  indexList(world.paths, 'DUPLICATE_IDS');
  indexList(world.areas, 'DUPLICATE_IDS');
  indexList(world.lanes, 'DUPLICATE_IDS');
  indexList(world.intersections, 'DUPLICATE_IDS');
  indexList(world.signals, 'DUPLICATE_IDS');
  indexList(world.stopLines, 'DUPLICATE_IDS');
  indexList(world.crosswalks, 'DUPLICATE_IDS');
  indexList(world.serviceZones, 'DUPLICATE_IDS');
  indexList(world.recoveryPoints, 'DUPLICATE_IDS');
  for (const junction of world.intersections) {
    indexList(
      readEntries(junction.value.conflictZones, `${junction.path}.conflictZones`),
      'DUPLICATE_IDS',
    );
    indexList(readEntries(junction.value.movements, `${junction.path}.movements`), 'DUPLICATE_IDS');
  }
  for (const signal of world.signals)
    indexList(readEntries(signal.value.phases, `${signal.path}.phases`), 'DUPLICATE_IDS');

  // ----- GEOMETRY REFERENCES ------------------------------------------------------------------
  for (const path of world.paths) {
    examine('GEOMETRY_REFERENCES');
    const nodeIds = asArray(path.value.nodeIds);
    if (nodeIds.length < 2)
      fail(
        'LANE_GEOMETRY_INVALID',
        'GEOMETRY_REFERENCES',
        `${path.path}.nodeIds`,
        'Path requires at least two nodes',
        path.id,
      );
    const seen = new Set<string>();
    let previous: Vector3 | null = null;
    for (const [index, nodeIdValue] of nodeIds.entries()) {
      const nodeId = asString(nodeIdValue);
      const node = reference(
        'NODE',
        world.nodeById,
        nodeId,
        `${path.path}.nodeIds[${index}]`,
        path.id,
        'GEOMETRY_REFERENCES',
      );
      if (nodeId !== null) {
        if (seen.has(nodeId))
          fail(
            'LANE_GEOMETRY_INVALID',
            'GEOMETRY_REFERENCES',
            `${path.path}.nodeIds[${index}]`,
            `Duplicate node ${nodeId} in path`,
            path.id,
            nodeId,
          );
        seen.add(nodeId);
      }
      const position = node ? readVector(node.value.positionM) : null;
      if (
        position &&
        previous &&
        Math.hypot(position.x - previous.x, position.y - previous.y, position.z - previous.z) <=
          EPSILON
      )
        fail(
          'LANE_GEOMETRY_INVALID',
          'GEOMETRY_REFERENCES',
          `${path.path}.nodeIds[${index}]`,
          'Zero-length path edge',
          path.id,
          null,
          position,
        );
      if (position) previous = position;
    }
  }
  for (const area of world.areas) {
    examine('GEOMETRY_REFERENCES');
    const nodeIds = asArray(area.value.vertexNodeIds);
    if (nodeIds.length < 3)
      fail(
        'LANE_GEOMETRY_INVALID',
        'GEOMETRY_REFERENCES',
        `${area.path}.vertexNodeIds`,
        'Area requires at least three vertices',
        area.id,
      );
    const seen = new Set<string>();
    const points: Vector3[] = [];
    for (const [index, nodeIdValue] of nodeIds.entries()) {
      const nodeId = asString(nodeIdValue);
      const node = reference(
        'NODE',
        world.nodeById,
        nodeId,
        `${area.path}.vertexNodeIds[${index}]`,
        area.id,
        'GEOMETRY_REFERENCES',
      );
      if (nodeId !== null) {
        if (seen.has(nodeId))
          fail(
            'LANE_GEOMETRY_INVALID',
            'GEOMETRY_REFERENCES',
            `${area.path}.vertexNodeIds[${index}]`,
            `Duplicate node ${nodeId} in area`,
            area.id,
            nodeId,
          );
        seen.add(nodeId);
      }
      const position = node ? readVector(node.value.positionM) : null;
      if (position) points.push(position);
    }
    if (points.length === nodeIds.length && points.length >= 3) {
      let signedArea = 0;
      for (let index = 0; index < points.length; index += 1) {
        const a = points[index]!;
        const b = points[(index + 1) % points.length]!;
        if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= EPSILON)
          fail(
            'LANE_GEOMETRY_INVALID',
            'GEOMETRY_REFERENCES',
            `${area.path}.vertexNodeIds`,
            'Zero-length area edge',
            area.id,
            null,
            a,
          );
        signedArea += a.x * b.z - b.x * a.z;
      }
      if (Math.abs(signedArea) <= 1e-8)
        fail(
          'LANE_GEOMETRY_INVALID',
          'GEOMETRY_REFERENCES',
          `${area.path}.vertexNodeIds`,
          'Degenerate X/Z polygon footprint',
          area.id,
          null,
          points[0] ?? null,
        );
    }
  }

  // ----- LANES --------------------------------------------------------------------------------
  const laneIncoming = new Map<string, string[]>();
  for (const lane of world.lanes) laneIncoming.set(lane.id ?? '', []);
  for (const lane of world.lanes) {
    examine('LANE_REFERENCES');
    examine('LANE_GEOMETRY');
    const id = lane.id;
    const geometry = reference(
      'PATH',
      world.pathById,
      asString(lane.value.geometryId),
      `${lane.path}.geometryId`,
      id,
      'LANE_REFERENCES',
      lanePosition(world, lane),
    );
    const direction = asString(lane.value.direction);
    if (direction !== 'FORWARD' && direction !== 'REVERSE')
      fail(
        'LANE_GEOMETRY_INVALID',
        'LANE_GEOMETRY',
        `${lane.path}.direction`,
        'Lane direction must be FORWARD or REVERSE',
        id,
        null,
        lanePosition(world, lane),
      );
    const width = asNumber(lane.value.widthM);
    if (width === null || width <= 0 || width > 100)
      fail(
        'LANE_WIDTH_INVALID',
        'LANE_GEOMETRY',
        `${lane.path}.widthM`,
        'Lane width must be in (0, 100] metres',
        id,
        null,
        lanePosition(world, lane),
      );
    const speed = asNumber(lane.value.speedLimitMps);
    if (speed === null || speed <= 0 || speed > 200)
      fail(
        'LANE_GEOMETRY_INVALID',
        'LANE_GEOMETRY',
        `${lane.path}.speedLimitMps`,
        'Speed limit must be in (0, 200] m/s',
        id,
        null,
        lanePosition(world, lane),
      );
    const access = asArray(lane.value.access).filter(
      (value): value is RoadAccess => value === 'TAXI' || value === 'CIVIL',
    );
    if (access.length === 0)
      fail(
        'LANE_GEOMETRY_INVALID',
        'LANE_GEOMETRY',
        `${lane.path}.access`,
        'Lane requires at least one access class',
        id,
        null,
        lanePosition(world, lane),
      );

    const points = lanePoints(world, lane);
    if (geometry && points.length < 2)
      fail(
        'LANE_GEOMETRY_INVALID',
        'LANE_GEOMETRY',
        `${lane.path}.geometryId`,
        'Lane geometry resolves to fewer than two positions',
        id,
        null,
        lanePosition(world, lane),
      );

    // Directed direction must follow from -> to intersection centres.
    const fromJunction = world.intersectionById.get(asString(lane.value.fromIntersectionId) ?? '');
    const toJunction = world.intersectionById.get(asString(lane.value.toIntersectionId) ?? '');
    if (fromJunction?.id && toJunction?.id && points.length >= 2) {
      const fromArea = areaBox(areaPoints(world, asString(fromJunction.value.geometryId)));
      const toArea = areaBox(areaPoints(world, asString(toJunction.value.geometryId)));
      if (fromArea && toArea) {
        const fromCenter = midpoint([fromArea.min, fromArea.max])!;
        const toCenter = midpoint([toArea.min, toArea.max])!;
        const first = points[0]!;
        const last = points[points.length - 1]!;
        const travelX = last.x - first.x;
        const travelZ = last.z - first.z;
        const spanX = toCenter.x - fromCenter.x;
        const spanZ = toCenter.z - fromCenter.z;
        if (travelX * spanX + travelZ * spanZ <= 0)
          fail(
            'ONE_WAY_INCONSISTENT',
            'LANE_GEOMETRY',
            `${lane.path}.direction`,
            `Direction ${String(direction)} opposes the from -> to junction vector`,
            id,
            null,
            first,
          );
      }
    }
    if (fromJunction) {
      const box = areaBox(areaPoints(world, asString(fromJunction.value.geometryId)));
      const endpoint = points[0];
      if (box && endpoint && !inBox(endpoint, box))
        fail(
          'LANE_ENDPOINT_MISMATCH',
          'LANE_GEOMETRY',
          `${lane.path}.fromIntersectionId`,
          'From endpoint outside intersection bounding box',
          id,
          fromJunction.id,
          endpoint,
        );
    }
    if (toJunction) {
      const box = areaBox(areaPoints(world, asString(toJunction.value.geometryId)));
      const endpoint = points[points.length - 1];
      if (box && endpoint && !inBox(endpoint, box))
        fail(
          'LANE_ENDPOINT_MISMATCH',
          'LANE_GEOMETRY',
          `${lane.path}.toIntersectionId`,
          'To endpoint outside intersection bounding box',
          id,
          toJunction.id,
          endpoint,
        );
    }

    const successorIds = asArray(lane.value.successorIds);
    const seenSuccessors = new Set<string>();
    for (const [index, successorValue] of successorIds.entries()) {
      examine('LANE_REFERENCES');
      const successorId = asString(successorValue);
      if (successorId !== null) {
        if (seenSuccessors.has(successorId))
          fail(
            'LANE_GEOMETRY_INVALID',
            'LANE_REFERENCES',
            `${lane.path}.successorIds[${index}]`,
            `Duplicate successor ${successorId}`,
            id,
            successorId,
          );
        seenSuccessors.add(successorId);
      }
      const successor = reference(
        'LANE',
        world.laneById,
        successorId,
        `${lane.path}.successorIds[${index}]`,
        id,
        'LANE_REFERENCES',
        lanePosition(world, lane),
      );
      if (!successor) continue;
      if (successorId === id)
        fail(
          'LANE_GEOMETRY_INVALID',
          'LANE_REFERENCES',
          `${lane.path}.successorIds[${index}]`,
          'Self successor forbidden',
          id,
          id,
        );
      const successorAccess = asArray(successor.value.access).filter(
        (value): value is RoadAccess => value === 'TAXI' || value === 'CIVIL',
      );
      if (!access.some((value) => successorAccess.includes(value)))
        fail(
          'LANE_GEOMETRY_INVALID',
          'LANE_REFERENCES',
          `${lane.path}.successorIds[${index}]`,
          'Successor has no common access class',
          id,
          successorId,
        );
      laneIncoming.get(successorId ?? '')?.push(id ?? '');
      if (toJunction?.id) {
        const movements = world.movementsByIntersection.get(toJunction.id);
        const linked = movements
          ? [...movements.values()].some(
              (movement) =>
                asString(movement.value.fromLaneId) === id &&
                asString(movement.value.toLaneId) === successorId,
            )
          : false;
        if (!linked)
          fail(
            'MOVEMENT_INVALID',
            'LANE_REFERENCES',
            `${lane.path}.successorIds[${index}]`,
            'Intersection successor has no declared movement',
            id,
            successorId,
            lanePosition(world, successor),
          );
      } else {
        const expectedStart = points[points.length - 1];
        const nextStart = lanePoints(world, successor)[0];
        if (
          expectedStart &&
          nextStart &&
          Math.hypot(expectedStart.x - nextStart.x, expectedStart.z - nextStart.z) > EPSILON
        )
          fail(
            'LANE_GEOMETRY_INVALID',
            'LANE_REFERENCES',
            `${lane.path}.successorIds[${index}]`,
            'Continuation endpoint mismatch',
            id,
            successorId,
            expectedStart,
          );
      }
    }

    const neighbors = asObject(lane.value.neighbors);
    for (const side of ['left', 'right'] as const) {
      examine('LANE_REFERENCES');
      const neighborId = asString(neighbors?.[side]);
      if (neighborId === null) continue;
      const neighbor = reference(
        'LANE',
        world.laneById,
        neighborId,
        `${lane.path}.neighbors.${side}`,
        id,
        'LANE_REFERENCES',
        lanePosition(world, lane),
      );
      if (!neighbor) continue;
      const opposite = side === 'left' ? 'right' : 'left';
      const reciprocal = asString(asObject(neighbor.value.neighbors)?.[opposite]);
      if (neighborId === id || reciprocal !== id)
        fail(
          'LANE_GEOMETRY_INVALID',
          'LANE_REFERENCES',
          `${lane.path}.neighbors.${side}`,
          'Neighbor must be distinct and reciprocal',
          id,
          neighborId,
        );
      if (
        asString(neighbor.value.fromIntersectionId) !== asString(lane.value.fromIntersectionId) ||
        asString(neighbor.value.toIntersectionId) !== asString(lane.value.toIntersectionId)
      )
        fail(
          'LANE_GEOMETRY_INVALID',
          'LANE_REFERENCES',
          `${lane.path}.neighbors.${side}`,
          'Neighbor corridor membership mismatch',
          id,
          neighborId,
        );
      const neighborPoints = lanePoints(world, neighbor);
      const a = points[0];
      const b = points[points.length - 1];
      const c = neighborPoints[0];
      const d = neighborPoints[neighborPoints.length - 1];
      if (a && b && c && d && (b.x - a.x) * (d.x - c.x) + (b.z - a.z) * (d.z - c.z) <= 0)
        fail(
          'ONE_WAY_INCONSISTENT',
          'LANE_REFERENCES',
          `${lane.path}.neighbors.${side}`,
          'Neighbor travel directions oppose or are perpendicular',
          id,
          neighborId,
          a,
        );
    }
  }

  // Lane corridor overlap: authored centre lines + declared widths.
  examine('LANE_GEOMETRY', world.lanes.length);
  const laneGeometries = world.lanes.map((lane) => ({
    lane,
    points: lanePoints(world, lane),
    width: asNumber(lane.value.widthM),
  }));
  let lanePairs = 0;
  for (let i = 0; i < laneGeometries.length; i += 1) {
    const first = laneGeometries[i]!;
    if (first.points.length < 2 || first.width === null) continue;
    const firstBox = laneBox(first.points);
    if (!firstBox) continue;
    const firstSegments = laneSegments(first.points);
    for (let j = i + 1; j < laneGeometries.length; j += 1) {
      if (lanePairs >= MAP_INTEGRITY_LIMITS.maxLanePairs) {
        tracker.states.get('LANE_GEOMETRY')!.note = 'lane-pair budget reached';
        break;
      }
      lanePairs += 1;
      const second = laneGeometries[j]!;
      if (second.points.length < 2 || second.width === null) continue;
      const secondBox = laneBox(second.points);
      if (!secondBox || !boxesOverlapY(firstBox, secondBox)) continue;
      const threshold = (first.width + second.width) / 2 - EPSILON;
      let closest: number | null = null;
      for (const segmentA of firstSegments)
        for (const segmentB of laneSegments(second.points)) {
          const distance = parallelSegmentDistance(segmentA, segmentB);
          if (distance !== null && distance < threshold && (closest === null || distance < closest))
            closest = distance;
        }
      if (closest !== null) {
        const offender = first.width > second.width ? first : second;
        const other = offender === first ? second : first;
        fail(
          'LANE_CORRIDOR_OVERLAP',
          'LANE_GEOMETRY',
          `${offender.lane.path}.widthM`,
          `Lane corridor overlaps ${String(other.lane.id)} at ${closest.toFixed(3)} m (threshold ${threshold.toFixed(3)} m)`,
          offender.lane.id,
          other.lane.id,
          midpoint(offender.points),
        );
      }
    }
  }

  // Dangling / orphan lanes after successor and zone knowledge is available.
  const zoneLaneIds = new Set(
    world.serviceZones
      .map((zone) => asString(zone.value.laneId))
      .filter((id): id is string => id !== null),
  );
  const recoveryLaneIds = new Set(
    world.recoveryPoints
      .map((point) => asString(point.value.laneId))
      .filter((id): id is string => id !== null),
  );
  for (const lane of world.lanes) {
    examine('LANE_REFERENCES');
    const id = lane.id;
    if (id === null) continue;
    const validSuccessors = asArray(lane.value.successorIds).filter(
      (value) => typeof value === 'string' && world.laneById.has(value),
    );
    const hasIncoming = (laneIncoming.get(id) ?? []).length > 0;
    const fromIntersection = asString(lane.value.fromIntersectionId);
    const toIntersection = asString(lane.value.toIntersectionId);
    if (
      validSuccessors.length === 0 &&
      fromIntersection === null &&
      toIntersection === null &&
      !zoneLaneIds.has(id) &&
      !recoveryLaneIds.has(id)
    )
      fail(
        'ORPHAN_LANE',
        'LANE_REFERENCES',
        lane.path,
        'Lane is isolated: no successor, no intersection and no service/recovery',
        id,
        null,
        lanePosition(world, lane),
      );
    else if (
      validSuccessors.length === 0 &&
      toIntersection === null &&
      !zoneLaneIds.has(id) &&
      !recoveryLaneIds.has(id)
    )
      fail(
        'DANGLING_LANE',
        'LANE_REFERENCES',
        lane.path,
        'Lane ends without a successor, service zone or recovery point',
        id,
        null,
        lanePosition(world, lane),
      );
    if (
      !hasIncoming &&
      validSuccessors.length === 0 &&
      !zoneLaneIds.has(id) &&
      !recoveryLaneIds.has(id)
    )
      fail(
        'ORPHAN_LANE',
        'LANE_REFERENCES',
        lane.path,
        'Lane has no incoming or outgoing directed connection',
        id,
        null,
        lanePosition(world, lane),
      );
  }

  // ----- INTERSECTIONS ------------------------------------------------------------------------
  for (const junction of world.intersections) {
    examine('INTERSECTIONS');
    const id = junction.id;
    reference(
      'AREA',
      world.areaById,
      asString(junction.value.geometryId),
      `${junction.path}.geometryId`,
      id,
      'INTERSECTIONS',
      null,
    );
    const junctionBox = areaBox(areaPoints(world, asString(junction.value.geometryId)));
    const incoming = asArray(junction.value.incomingLaneIds);
    const outgoing = asArray(junction.value.outgoingLaneIds);
    const incomingSet = new Set<string>();
    const outgoingSet = new Set<string>();
    for (const [index, laneIdValue] of incoming.entries()) {
      examine('INTERSECTIONS');
      const laneId = asString(laneIdValue);
      if (laneId !== null) {
        if (incomingSet.has(laneId))
          fail(
            'INTERSECTION_INVALID',
            'INTERSECTIONS',
            `${junction.path}.incomingLaneIds[${index}]`,
            `Duplicate incoming lane ${laneId}`,
            id,
            laneId,
          );
        incomingSet.add(laneId);
      }
      const lane = reference(
        'LANE',
        world.laneById,
        laneId,
        `${junction.path}.incomingLaneIds[${index}]`,
        id,
        'INTERSECTIONS',
      );
      if (lane && asString(lane.value.toIntersectionId) !== id)
        fail(
          'INTERSECTION_INVALID',
          'INTERSECTIONS',
          `${junction.path}.incomingLaneIds[${index}]`,
          'Incoming lane does not declare this junction as toIntersectionId',
          id,
          laneId,
          lanePosition(world, lane),
        );
      if (lane) {
        const endpoint = lanePoints(world, lane).at(-1);
        if (junctionBox && endpoint && !inBox(endpoint, junctionBox))
          fail(
            'LANE_ENDPOINT_MISMATCH',
            'INTERSECTIONS',
            `${junction.path}.incomingLaneIds[${index}]`,
            'Incoming directed endpoint outside junction box',
            id,
            laneId,
            endpoint,
          );
      }
    }
    for (const [index, laneIdValue] of outgoing.entries()) {
      examine('INTERSECTIONS');
      const laneId = asString(laneIdValue);
      if (laneId !== null) {
        if (outgoingSet.has(laneId))
          fail(
            'INTERSECTION_INVALID',
            'INTERSECTIONS',
            `${junction.path}.outgoingLaneIds[${index}]`,
            `Duplicate outgoing lane ${laneId}`,
            id,
            laneId,
          );
        outgoingSet.add(laneId);
      }
      const lane = reference(
        'LANE',
        world.laneById,
        laneId,
        `${junction.path}.outgoingLaneIds[${index}]`,
        id,
        'INTERSECTIONS',
      );
      if (lane && asString(lane.value.fromIntersectionId) !== id)
        fail(
          'INTERSECTION_INVALID',
          'INTERSECTIONS',
          `${junction.path}.outgoingLaneIds[${index}]`,
          'Outgoing lane does not declare this junction as fromIntersectionId',
          id,
          laneId,
          lanePosition(world, lane),
        );
      if (lane) {
        const endpoint = lanePoints(world, lane)[0];
        if (junctionBox && endpoint && !inBox(endpoint, junctionBox))
          fail(
            'LANE_ENDPOINT_MISMATCH',
            'INTERSECTIONS',
            `${junction.path}.outgoingLaneIds[${index}]`,
            'Outgoing directed endpoint outside junction box',
            id,
            laneId,
            endpoint,
          );
      }
    }
    for (const lane of world.lanes) {
      const laneId = lane.id;
      if (laneId === null) continue;
      if (asString(lane.value.toIntersectionId) === id && !incomingSet.has(laneId))
        fail(
          'INTERSECTION_INVALID',
          'INTERSECTIONS',
          `${junction.path}.incomingLaneIds`,
          `Incoming lane ${laneId} omitted`,
          id,
          laneId,
          lanePosition(world, lane),
        );
      if (asString(lane.value.fromIntersectionId) === id && !outgoingSet.has(laneId))
        fail(
          'INTERSECTION_INVALID',
          'INTERSECTIONS',
          `${junction.path}.outgoingLaneIds`,
          `Outgoing lane ${laneId} omitted`,
          id,
          laneId,
          lanePosition(world, lane),
        );
    }

    const zones = readEntries(junction.value.conflictZones, `${junction.path}.conflictZones`);
    for (const zone of zones) {
      examine('INTERSECTIONS');
      reference(
        'AREA',
        world.areaById,
        asString(zone.value.geometryId),
        `${zone.path}.geometryId`,
        zone.id ?? id,
        'INTERSECTIONS',
        null,
      );
      if (junctionBox) {
        for (const vertex of areaPoints(world, asString(zone.value.geometryId)))
          if (!inBox(vertex, junctionBox))
            fail(
              'INTERSECTION_INVALID',
              'INTERSECTIONS',
              `${zone.path}.geometryId`,
              'Conflict footprint outside junction bounding box',
              zone.id ?? id,
              id,
              vertex,
            );
      }
    }

    const movements = readEntries(junction.value.movements, `${junction.path}.movements`);
    const movementPairs = new Set<string>();
    for (const movement of movements) {
      examine('INTERSECTIONS');
      const movementId = movement.id;
      reference(
        'PATH',
        world.pathById,
        asString(movement.value.geometryId),
        `${movement.path}.geometryId`,
        movementId,
        'INTERSECTIONS',
        null,
      );
      const fromId = asString(movement.value.fromLaneId);
      const toId = asString(movement.value.toLaneId);
      const from = reference(
        'LANE',
        world.laneById,
        fromId,
        `${movement.path}.fromLaneId`,
        movementId,
        'INTERSECTIONS',
      );
      const to = reference(
        'LANE',
        world.laneById,
        toId,
        `${movement.path}.toLaneId`,
        movementId,
        'INTERSECTIONS',
      );
      if (fromId !== null && from && !incomingSet.has(fromId))
        fail(
          'MOVEMENT_INVALID',
          'INTERSECTIONS',
          `${movement.path}.fromLaneId`,
          'Movement from-lane is not incoming for this junction',
          movementId,
          fromId,
          lanePosition(world, from),
        );
      if (toId !== null && to && !outgoingSet.has(toId))
        fail(
          'MOVEMENT_INVALID',
          'INTERSECTIONS',
          `${movement.path}.toLaneId`,
          'Movement to-lane is not outgoing for this junction',
          movementId,
          toId,
          lanePosition(world, to),
        );
      if (fromId !== null && fromId === toId)
        fail(
          'MOVEMENT_INVALID',
          'INTERSECTIONS',
          movement.path,
          'Movement must connect distinct lanes',
          movementId,
          fromId,
          lanePosition(world, from ?? undefined),
        );
      const pair = JSON.stringify([fromId, toId]);
      if (movementPairs.has(pair))
        fail(
          'MOVEMENT_INVALID',
          'INTERSECTIONS',
          movement.path,
          'Duplicate movement for lane pair',
          movementId,
          fromId,
        );
      movementPairs.add(pair);
      const curveIds = pathNodeIds(world, asString(movement.value.geometryId));
      if (from && curveIds.length > 0) {
        const expected = lanePoints(world, from).at(-1);
        const actual = nodePosition(world, curveIds[0]!);
        if (
          expected &&
          actual &&
          Math.hypot(expected.x - actual.x, expected.z - actual.z) > EPSILON
        )
          fail(
            'MOVEMENT_INVALID',
            'INTERSECTIONS',
            `${movement.path}.geometryId`,
            'Movement path does not start at from-lane endpoint',
            movementId,
            fromId,
            actual,
          );
      }
      if (to && curveIds.length > 0) {
        const expected = lanePoints(world, to)[0];
        const actual = nodePosition(world, curveIds[curveIds.length - 1]!);
        if (
          expected &&
          actual &&
          Math.hypot(expected.x - actual.x, expected.z - actual.z) > EPSILON
        )
          fail(
            'MOVEMENT_INVALID',
            'INTERSECTIONS',
            `${movement.path}.geometryId`,
            'Movement path does not end at to-lane start',
            movementId,
            toId,
            actual,
          );
      }
      if (junctionBox)
        for (const nodeId of curveIds) {
          const position = nodePosition(world, nodeId);
          if (position && !inBox(position, junctionBox))
            fail(
              'MOVEMENT_INVALID',
              'INTERSECTIONS',
              `${movement.path}.geometryId`,
              'Movement path leaves junction bounding box',
              movementId,
              null,
              position,
            );
        }
      if (from && toId !== null) {
        const successorIds = asArray(from.value.successorIds);
        if (!successorIds.includes(toId))
          fail(
            'MOVEMENT_INVALID',
            'INTERSECTIONS',
            movement.path,
            'Movement has no corresponding successor link',
            movementId,
            toId,
            lanePosition(world, from),
          );
        const fromAccess = asArray(from.value.access);
        const toAccess = asArray(to?.value.access);
        if (!fromAccess.some((value) => toAccess.includes(value)))
          fail(
            'MOVEMENT_INVALID',
            'INTERSECTIONS',
            movement.path,
            'Movement has no common access class',
            movementId,
            toId,
          );
      }
      const zoneIds = asArray(movement.value.conflictZoneIds);
      const knownZones = world.conflictZonesByIntersection.get(id ?? '');
      for (const [index, zoneIdValue] of zoneIds.entries()) {
        const zoneId = asString(zoneIdValue);
        if (!knownZones || zoneId === null || !knownZones.has(zoneId))
          fail(
            'MOVEMENT_INVALID',
            'INTERSECTIONS',
            `${movement.path}.conflictZoneIds[${index}]`,
            `Conflict zone ${String(zoneId)} does not belong to this junction`,
            movementId,
            zoneId,
          );
      }
    }
  }

  // ----- SIGNALS ------------------------------------------------------------------------------
  const signaledIntersections = new Set<string>();
  const movementByOwner = new Map<string, RawEntry>();
  for (const [junctionId, movements] of world.movementsByIntersection)
    for (const [movementId, movement] of movements)
      movementByOwner.set(`${junctionId}|${movementId}`, movement);
  for (const signal of world.signals) {
    examine('SIGNALS');
    const signalId = signal.id;
    const junctionEntry = reference(
      'INTERSECTION',
      world.intersectionById,
      asString(signal.value.intersectionId),
      `${signal.path}.intersectionId`,
      signalId,
      'SIGNALS',
      null,
    );
    const junctionId = junctionEntry?.id ?? null;
    if (junctionId !== null) {
      if (signaledIntersections.has(junctionId))
        fail(
          'SIGNAL_INVALID',
          'SIGNALS',
          signal.path,
          `Intersection ${junctionId} has more than one signal program`,
          signalId,
          junctionId,
        );
      signaledIntersections.add(junctionId);
    }
    const phases = readEntries(signal.value.phases, `${signal.path}.phases`);
    if (phases.length === 0)
      fail(
        'SIGNAL_INVALID',
        'SIGNALS',
        `${signal.path}.phases`,
        'Signal requires at least one phase',
        signalId,
        junctionId,
      );
    const expectedMovements =
      junctionId !== null
        ? [...(world.movementsByIntersection.get(junctionId)?.keys() ?? [])].sort(compareText)
        : [];
    for (const phase of phases) {
      examine('SIGNALS');
      const duration = asNumber(phase.value.durationS);
      if (duration === null || duration <= 0)
        fail(
          'SIGNAL_INVALID',
          'SIGNALS',
          `${phase.path}.durationS`,
          'Phase duration must be positive seconds',
          phase.id,
          signalId,
        );
      const states = readEntries(phase.value.movementStates, `${phase.path}.movementStates`);
      const seen = new Set<string>();
      const destinations = new Set<string>();
      const zones = new Set<string>();
      for (const state of states) {
        examine('SIGNALS');
        const movementId = asString(state.value.movementId);
        const stateValue = asString(state.value.state);
        if (movementId !== null) {
          if (seen.has(movementId))
            fail(
              'SIGNAL_INVALID',
              'SIGNALS',
              `${state.path}.movementId`,
              `Duplicate movement ${movementId} in phase`,
              phase.id,
              movementId,
            );
          seen.add(movementId);
        }
        if (stateValue !== 'RED' && stateValue !== 'YELLOW' && stateValue !== 'GREEN')
          fail(
            'SIGNAL_INVALID',
            'SIGNALS',
            `${state.path}.state`,
            'Signal state must be RED, YELLOW or GREEN',
            phase.id,
            movementId,
          );
        if (
          junctionId !== null &&
          movementId !== null &&
          !world.movementsByIntersection.get(junctionId)?.has(movementId)
        )
          fail(
            'SIGNAL_INVALID',
            'SIGNALS',
            `${state.path}.movementId`,
            `Movement ${movementId} does not belong to this junction`,
            phase.id,
            movementId,
          );
        if (stateValue !== 'GREEN' || movementId === null) continue;
        const movement = movementByOwner.get(`${junctionId ?? ''}|${movementId}`);
        const toLaneId = asString(movement?.value.toLaneId) ?? movementId;
        if (destinations.has(toLaneId))
          fail(
            'SIGNAL_INVALID',
            'SIGNALS',
            state.path,
            `Simultaneous GREEN merges into ${toLaneId}`,
            phase.id,
            movementId,
          );
        destinations.add(toLaneId);
        for (const zoneIdValue of asArray(movement?.value.conflictZoneIds)) {
          const zoneId = asString(zoneIdValue);
          if (zoneId === null) continue;
          if (zones.has(zoneId))
            fail(
              'SIGNAL_INVALID',
              'SIGNALS',
              state.path,
              `Simultaneous GREEN shares conflict zone ${zoneId}`,
              phase.id,
              movementId,
            );
          zones.add(zoneId);
        }
      }
      const sortedSeen = [...seen].sort(compareText);
      if (junctionId !== null && sortedSeen.join('\u0000') !== expectedMovements.join('\u0000'))
        fail(
          'SIGNAL_INVALID',
          'SIGNALS',
          `${phase.path}.movementStates`,
          'Phase must assign every junction movement exactly once',
          phase.id,
          signalId,
        );
    }
  }

  // ----- STOP LINES ---------------------------------------------------------------------------
  const linkedCrosswalkLines = new Set<string>();
  for (const crosswalk of world.crosswalks)
    for (const stopLineId of asArray(crosswalk.value.stopLineIds))
      if (typeof stopLineId === 'string') linkedCrosswalkLines.add(stopLineId);
  for (const line of world.stopLines) {
    examine('STOP_LINES');
    const lineId = line.id;
    reference(
      'PATH',
      world.pathById,
      asString(line.value.geometryId),
      `${line.path}.geometryId`,
      lineId,
      'STOP_LINES',
      null,
    );
    const curve = pathNodeIds(world, asString(line.value.geometryId));
    if (curve.length !== 2)
      fail(
        'STOP_LINE_INVALID',
        'STOP_LINES',
        `${line.path}.geometryId`,
        'Stop line requires exactly two nodes',
        lineId,
      );
    const lane = reference(
      'LANE',
      world.laneById,
      asString(line.value.laneId),
      `${line.path}.laneId`,
      lineId,
      'STOP_LINES',
      null,
    );
    const anchorId = asString(line.value.anchorNodeId);
    const anchorNode = reference(
      'NODE',
      world.nodeById,
      anchorId,
      `${line.path}.anchorNodeId`,
      lineId,
      'STOP_LINES',
      nodePosition(world, anchorId),
    );
    if (
      lane &&
      anchorId !== null &&
      !pathNodeIds(world, asString(lane.value.geometryId)).includes(anchorId)
    )
      fail(
        'STOP_LINE_INVALID',
        'STOP_LINES',
        `${line.path}.anchorNodeId`,
        'Stop-line anchor is not a node on the lane path',
        lineId,
        anchorId,
        anchorNode ? readVector(anchorNode.value.positionM) : null,
      );
    const intersectionId = asString(line.value.intersectionId);
    if (intersectionId !== null) {
      reference(
        'INTERSECTION',
        world.intersectionById,
        intersectionId,
        `${line.path}.intersectionId`,
        lineId,
        'STOP_LINES',
        nodePosition(world, anchorId),
      );
      if (lane && asString(lane.value.toIntersectionId) !== intersectionId)
        fail(
          'STOP_LINE_INVALID',
          'STOP_LINES',
          `${line.path}.intersectionId`,
          'Stop line must belong to the approaching lane junction',
          lineId,
          intersectionId,
          nodePosition(world, anchorId),
        );
    }
    const kind = asString(line.value.kind);
    const signalId = asString(line.value.signalId);
    if (kind === 'SIGNAL') {
      if (signalId === null || intersectionId === null)
        fail(
          'STOP_LINE_INVALID',
          'STOP_LINES',
          line.path,
          'SIGNAL line requires signal and intersection IDs',
          lineId,
          null,
          nodePosition(world, anchorId),
        );
      else {
        const signal = reference(
          'SIGNAL',
          world.signalById,
          signalId,
          `${line.path}.signalId`,
          lineId,
          'STOP_LINES',
          nodePosition(world, anchorId),
        );
        if (signal && asString(signal.value.intersectionId) !== intersectionId)
          fail(
            'STOP_LINE_INVALID',
            'STOP_LINES',
            `${line.path}.signalId`,
            'Stop line signal/intersection mismatch',
            lineId,
            signalId,
            nodePosition(world, anchorId),
          );
      }
    } else if (kind === 'STOP') {
      if (intersectionId === null)
        fail(
          'STOP_LINE_INVALID',
          'STOP_LINES',
          `${line.path}.intersectionId`,
          'STOP line requires an intersection',
          lineId,
          null,
          nodePosition(world, anchorId),
        );
      if (signalId !== null)
        fail(
          'STOP_LINE_INVALID',
          'STOP_LINES',
          `${line.path}.signalId`,
          'Only a SIGNAL line may reference a signal',
          lineId,
          signalId,
        );
    } else if (kind === 'CROSSWALK') {
      if (signalId !== null)
        fail(
          'STOP_LINE_INVALID',
          'STOP_LINES',
          `${line.path}.signalId`,
          'CROSSWALK line cannot reference a signal',
          lineId,
          signalId,
        );
      if (!linkedCrosswalkLines.has(lineId ?? ''))
        fail(
          'STOP_LINE_INVALID',
          'STOP_LINES',
          line.path,
          'Orphan CROSSWALK stop line',
          lineId,
          null,
          nodePosition(world, anchorId),
        );
    } else
      fail(
        'STOP_LINE_INVALID',
        'STOP_LINES',
        `${line.path}.kind`,
        'Stop-line kind must be STOP, SIGNAL or CROSSWALK',
        lineId,
      );
  }

  // ----- CROSSWALKS ---------------------------------------------------------------------------
  const crosswalkOwner = new Map<string, string>();
  for (const walk of world.crosswalks) {
    examine('CROSSWALKS');
    const walkId = walk.id;
    reference(
      'AREA',
      world.areaById,
      asString(walk.value.geometryId),
      `${walk.path}.geometryId`,
      walkId,
      'CROSSWALKS',
      null,
    );
    const laneIds = asArray(walk.value.laneIds);
    const declaredLanes = new Set<string>();
    for (const [index, laneIdValue] of laneIds.entries()) {
      const laneId = asString(laneIdValue);
      if (laneId !== null) declaredLanes.add(laneId);
      reference(
        'LANE',
        world.laneById,
        laneId,
        `${walk.path}.laneIds[${index}]`,
        walkId,
        'CROSSWALKS',
      );
    }
    const covered = new Set<string>();
    const stopLineIds = asArray(walk.value.stopLineIds);
    for (const [index, stopLineIdValue] of stopLineIds.entries()) {
      examine('CROSSWALKS');
      const stopLineId = asString(stopLineIdValue);
      const line = reference(
        'STOP_LINE',
        world.stopLineById,
        stopLineId,
        `${walk.path}.stopLineIds[${index}]`,
        walkId,
        'CROSSWALKS',
      );
      if (!line) continue;
      if (asString(line.value.kind) !== 'CROSSWALK')
        fail(
          'CROSSWALK_INVALID',
          'CROSSWALKS',
          `${walk.path}.stopLineIds[${index}]`,
          'Crosswalk must reference a CROSSWALK stop line',
          walkId,
          stopLineId,
        );
      const lineLaneId = asString(line.value.laneId);
      if (lineLaneId !== null && !declaredLanes.has(lineLaneId))
        fail(
          'CROSSWALK_INVALID',
          'CROSSWALKS',
          `${walk.path}.stopLineIds[${index}]`,
          'Stop line lane is not declared by this crosswalk',
          walkId,
          lineLaneId,
        );
      if (lineLaneId !== null) covered.add(lineLaneId);
      if (stopLineId !== null) {
        const owner = crosswalkOwner.get(stopLineId);
        if (owner !== undefined && owner !== walkId)
          fail(
            'CROSSWALK_INVALID',
            'CROSSWALKS',
            `${walk.path}.stopLineIds[${index}]`,
            `Stop line also referenced by ${owner}`,
            walkId,
            stopLineId,
          );
        else crosswalkOwner.set(stopLineId, walkId ?? '');
      }
    }
    for (const laneId of declaredLanes)
      if (!covered.has(laneId))
        fail(
          'CROSSWALK_INVALID',
          'CROSSWALKS',
          `${walk.path}.stopLineIds`,
          `Crossed lane ${laneId} has no CROSSWALK stop line`,
          walkId,
          laneId,
        );
  }

  // ----- SERVICE ZONES ------------------------------------------------------------------------
  const zoneGeometry = new Map<string, readonly Vector3[]>();
  for (const zone of world.serviceZones) {
    examine('SERVICE_ZONES');
    const zoneId = zone.id;
    const geometryId = asString(zone.value.geometryId);
    reference(
      'AREA',
      world.areaById,
      geometryId,
      `${zone.path}.geometryId`,
      zoneId,
      'SERVICE_ZONES',
      null,
    );
    const vertices = areaPoints(world, geometryId);
    if (zoneId !== null) zoneGeometry.set(zoneId, vertices);
    const lane = reference(
      'LANE',
      world.laneById,
      asString(zone.value.laneId),
      `${zone.path}.laneId`,
      zoneId,
      'SERVICE_ZONES',
      midpoint(vertices),
    );
    const anchorId = asString(zone.value.anchorNodeId);
    const anchor = reference(
      'NODE',
      world.nodeById,
      anchorId,
      `${zone.path}.anchorNodeId`,
      zoneId,
      'SERVICE_ZONES',
      nodePosition(world, anchorId),
    );
    const anchorPosition = anchor ? readVector(anchor.value.positionM) : null;
    if (
      lane &&
      anchorId !== null &&
      !pathNodeIds(world, asString(lane.value.geometryId)).includes(anchorId)
    )
      fail(
        'SERVICE_ZONE_INVALID',
        'SERVICE_ZONES',
        `${zone.path}.anchorNodeId`,
        'Service anchor is not a node on the lane path',
        zoneId,
        anchorId,
        anchorPosition,
      );
    if (anchorPosition && vertices.length >= 3 && !pointInAreaXZ(anchorPosition, vertices))
      fail(
        'SERVICE_ZONE_INVALID',
        'SERVICE_ZONES',
        `${zone.path}.anchorNodeId`,
        'Service anchor is not inside the zone footprint',
        zoneId,
        asString(zone.value.geometryId),
        anchorPosition,
      );
    const access = asArray(zone.value.access).filter(
      (value): value is RoadAccess => value === 'TAXI' || value === 'CIVIL',
    );
    if (access.length === 0)
      fail(
        'SERVICE_ZONE_INVALID',
        'SERVICE_ZONES',
        `${zone.path}.access`,
        'Service zone requires at least one access class',
        zoneId,
        null,
        anchorPosition,
      );
    if (lane) {
      const laneAccess = asArray(lane.value.access);
      if (!access.every((value) => laneAccess.includes(value)))
        fail(
          'SERVICE_ZONE_INVALID',
          'SERVICE_ZONES',
          `${zone.path}.access`,
          'Service access must be allowed on the serving lane',
          zoneId,
          asString(lane.value.id),
          anchorPosition,
        );
    }
    const kind = asString(zone.value.kind);
    if (kind !== 'PICKUP' && kind !== 'DROPOFF' && kind !== 'BOTH')
      fail(
        'SERVICE_ZONE_INVALID',
        'SERVICE_ZONES',
        `${zone.path}.kind`,
        'Service kind must be PICKUP, DROPOFF or BOTH',
        zoneId,
        null,
        anchorPosition,
      );
  }
  const zoneEntries = world.serviceZones.filter(
    (zone) => zone.id !== null && (zoneGeometry.get(zone.id)?.length ?? 0) >= 3,
  );
  let zonePairs = 0;
  for (let i = 0; i < zoneEntries.length; i += 1) {
    const first = zoneEntries[i]!;
    const firstPoints = zoneGeometry.get(first.id!)!;
    for (let j = i + 1; j < zoneEntries.length; j += 1) {
      if (zonePairs >= MAP_INTEGRITY_LIMITS.maxZonePairs) break;
      zonePairs += 1;
      const second = zoneEntries[j]!;
      const secondPoints = zoneGeometry.get(second.id!)!;
      if (polygonOverlapXZ(firstPoints, secondPoints))
        fail(
          'SERVICE_ZONE_OVERLAP',
          'SERVICE_ZONES',
          second.path,
          `Service footprint overlaps ${String(first.id)}`,
          second.id,
          first.id,
          midpoint(secondPoints),
        );
    }
  }

  // ----- RECOVERY POINTS ----------------------------------------------------------------------
  for (const point of world.recoveryPoints) {
    examine('RECOVERY_POINTS');
    const pointId = point.id;
    const lane = reference(
      'LANE',
      world.laneById,
      asString(point.value.laneId),
      `${point.path}.laneId`,
      pointId,
      'RECOVERY_POINTS',
      null,
    );
    const nodeId = asString(point.value.nodeId);
    const node = reference(
      'NODE',
      world.nodeById,
      nodeId,
      `${point.path}.nodeId`,
      pointId,
      'RECOVERY_POINTS',
      nodePosition(world, nodeId),
    );
    if (
      lane &&
      nodeId !== null &&
      !pathNodeIds(world, asString(lane.value.geometryId)).includes(nodeId)
    )
      fail(
        'RECOVERY_POINT_INVALID',
        'RECOVERY_POINTS',
        `${point.path}.nodeId`,
        'Recovery node is not on the lane path',
        pointId,
        nodeId,
        node ? readVector(node.value.positionM) : null,
      );
    const heading = asNumber(point.value.headingRad);
    if (heading === null || heading < -Math.PI || heading > Math.PI)
      fail(
        'RECOVERY_POINT_INVALID',
        'RECOVERY_POINTS',
        `${point.path}.headingRad`,
        'Recovery heading must be in [-pi, pi]',
        pointId,
        null,
        node ? readVector(node.value.positionM) : null,
      );
  }

  // ----- CONNECTIVITY -------------------------------------------------------------------------
  const laneIds = world.lanes.map((lane) => lane.id).filter((id): id is string => id !== null);
  const adjacency = new Map<string, string[]>();
  for (const laneId of laneIds) adjacency.set(laneId, []);
  for (const lane of world.lanes) {
    if (lane.id === null) continue;
    const successors = adjacency.get(lane.id)!;
    for (const successorValue of asArray(lane.value.successorIds)) {
      const successorId = asString(successorValue);
      if (successorId !== null && adjacency.has(successorId) && !successors.includes(successorId))
        successors.push(successorId);
    }
  }
  examine('CONNECTIVITY', laneIds.length);
  const components = stronglyConnectedComponents(laneIds, adjacency);
  const weakComponents = weaklyConnectedComponents(laneIds, adjacency);
  const largest = components.reduce(
    (best, current) => (current.length > best.length ? current : best),
    [] as string[],
  );
  const disconnectedLaneIds = laneIds.filter((id) => !largest.includes(id)).sort(compareText);
  if (components.length > 1)
    fail(
      'CONNECTIVITY_DISCONNECTED',
      'CONNECTIVITY',
      'map.lanes',
      `Directed lane graph has ${components.length} strongly connected components; largest ${largest.length}/${laneIds.length} lanes`,
      null,
      null,
      lanePosition(world, world.laneById.get(disconnectedLaneIds[0] ?? '')),
    );

  const accessCoverage = (access: RoadAccess): MapIntegrityAccessCoverage => {
    examine('CONNECTIVITY');
    const allowed = new Set(
      world.lanes
        .filter((lane) => asArray(lane.value.access).includes(access))
        .map((lane) => lane.id)
        .filter((id): id is string => id !== null),
    );
    const reverse = new Map<string, string[]>();
    for (const laneId of allowed) reverse.set(laneId, []);
    for (const [from, successors] of adjacency)
      if (allowed.has(from))
        for (const successor of successors)
          if (allowed.has(successor)) reverse.get(successor)?.push(from);
    let reachablePairs = 0;
    let unreachablePairs = 0;
    const unreachableLaneIds = new Set<string>();
    const zones = world.serviceZones.filter((zone) => asArray(zone.value.access).includes(access));
    for (const zone of zones) {
      const laneId = asString(zone.value.laneId);
      if (laneId === null || !allowed.has(laneId)) continue;
      const seen = new Set([laneId]);
      const queue = [laneId];
      for (let head = 0; head < queue.length; head += 1)
        for (const previous of reverse.get(queue[head]!) ?? [])
          if (!seen.has(previous)) {
            seen.add(previous);
            queue.push(previous);
          }
      const missed = [...allowed].filter((laneIdValue) => !seen.has(laneIdValue)).sort(compareText);
      reachablePairs += seen.size;
      unreachablePairs += missed.length;
      for (const missedId of missed) unreachableLaneIds.add(missedId);
      if (missed.length > 0)
        fail(
          'ROUTE_UNREACHABLE',
          'CONNECTIVITY',
          `${zone.path}.laneId`,
          `${access} service ${String(zone.id)} is unreachable from ${missed.length} permitted lane(s): ${missed.slice(0, 3).join(', ')}`,
          zone.id,
          missed[0] ?? null,
          nodePosition(world, asString(zone.value.anchorNodeId)),
        );
    }
    return Object.freeze({
      lanes: allowed.size,
      zones: zones.length,
      reachableLaneZonePairs: reachablePairs,
      unreachableLaneZonePairs: unreachablePairs,
      unreachableLaneIds: Object.freeze([...unreachableLaneIds].sort(compareText).slice(0, 16)),
    });
  };
  const connectivityByAccess = {
    TAXI: accessCoverage('TAXI'),
    CIVIL: accessCoverage('CIVIL'),
  };

  // ----- PBI032 PARSER + ROUTE MATRIX ---------------------------------------------------------
  let validated: RoadMap | null = null;
  let schemaError: string | null = null;
  try {
    validated = parseRoadMap(raw);
  } catch (error) {
    schemaError = error instanceof Error ? error.message : String(error);
    if (error instanceof MapValidationError)
      fail('SCHEMA_INVALID', 'SCHEMA', error.path, error.message, error.id, null, error.positionM);
    else fail('SCHEMA_INVALID', 'SCHEMA', 'map', schemaError);
  }

  const routingByAccess = {
    TAXI: { requested: 0, ready: 0, failed: 0 },
    CIVIL: { requested: 0, ready: 0, failed: 0 },
  };
  const routableZones = new Set<string>();
  const unroutableZones = new Set<string>();
  if (validated) {
    examine('ROUTING');
    const graph = createLaneGraph(validated);
    const planner = createRoutePlanner({
      graph,
      map: validated,
      graphVersion: `${MAP_INTEGRITY_VERSION}:${validated.mapId}`,
      costVersion: MAP_INTEGRITY_VERSION,
      maxExpansions: MAP_INTEGRITY_LIMITS.maxRouteExpansions,
    });
    for (const access of ['TAXI', 'CIVIL'] as const) {
      const origins = validated.lanes
        .filter((lane) => lane.access.includes(access))
        .map((lane) => lane.id)
        .sort(compareText);
      for (const zone of validated.serviceZones) {
        if (!zone.access.includes(access)) continue;
        const pickupDropoff =
          zone.kind === 'PICKUP' || zone.kind === 'DROPOFF' || zone.kind === 'BOTH';
        for (const origin of origins) {
          routingByAccess[access].requested += 1;
          const plan = planner.findRoute({ origin, destination: zone.id, access });
          if (plan.status === 'READY') {
            routingByAccess[access].ready += 1;
            if (pickupDropoff) routableZones.add(`${access}|${zone.id}`);
          } else {
            routingByAccess[access].failed += 1;
            if (pickupDropoff) unroutableZones.add(`${access}|${zone.id}`);
            fail(
              'ROUTE_UNREACHABLE',
              'ROUTING',
              `${world.serviceZoneById.get(zone.id)?.path ?? 'map.serviceZones'}.laneId`,
              `${access} pickup/dropoff ${zone.id} is not routable from ${origin}: ${plan.status}`,
              zone.id,
              origin,
              nodePosition(world, zone.anchorNodeId),
            );
          }
        }
      }
    }
    planner.dispose();
  } else {
    tracker.states.get('ROUTING')!.skipped = true;
    tracker.states.get('ROUTING')!.note = 'PBI032 parser rejected the document';
  }

  // ----- REPORT -------------------------------------------------------------------------------
  const sortedIssues = issues.sort(
    (a, b) =>
      compareText(a.path, b.path) ||
      compareText(a.reason, b.reason) ||
      compareText(a.entityId ?? '', b.entityId ?? '') ||
      compareText(a.relatedId ?? '', b.relatedId ?? ''),
  );
  const sortedReasons: Partial<Record<MapIntegrityReason, number>> = {};
  for (const reason of MAP_INTEGRITY_REASONS) {
    const count = errorsByReason.get(reason);
    if (count !== undefined) sortedReasons[reason] = count;
  }
  const scenarioCoverage = buildScenarioCoverage(world);
  const routableZoneIds = new Set([...routableZones].map((value) => value.split('|')[1] ?? ''));
  const unroutableZoneIds = new Set([...unroutableZones].map((value) => value.split('|')[1] ?? ''));
  const pickupDropoffZones = world.serviceZones.filter((zone) => {
    const kind = asString(zone.value.kind);
    return kind === 'PICKUP' || kind === 'DROPOFF' || kind === 'BOTH';
  });
  const routablePickupDropoff = pickupDropoffZones
    .filter(
      (zone) => zone.id !== null && routableZoneIds.has(zone.id) && !unroutableZoneIds.has(zone.id),
    )
    .map((zone) => zone.id!)
    .sort(compareText);
  const unroutablePickupDropoff = pickupDropoffZones
    .filter((zone) => zone.id !== null && unroutableZoneIds.has(zone.id))
    .map((zone) => zone.id!)
    .sort(compareText);
  const routingRequested = routingByAccess.TAXI.requested + routingByAccess.CIVIL.requested;
  const routingReady = routingByAccess.TAXI.ready + routingByAccess.CIVIL.ready;
  const routingFailed = routingByAccess.TAXI.failed + routingByAccess.CIVIL.failed;

  const coverage: MapIntegrityCoverage = Object.freeze({
    entityCounts: world.entityCounts,
    references: Object.freeze({
      checked: references.checked,
      missing: references.missing,
      byKind: Object.freeze({ ...references.byKind }),
    }),
    connectivity: Object.freeze({
      stronglyConnectedComponents: components.length,
      weaklyConnectedComponents: weakComponents,
      largestComponentLanes: largest.length,
      disconnectedLaneIds: Object.freeze(disconnectedLaneIds.slice(0, 16)),
      byAccess: Object.freeze(connectivityByAccess),
    }),
    routing: Object.freeze({
      requested: routingRequested,
      ready: routingReady,
      failed: routingFailed,
      byAccess: Object.freeze({
        TAXI: Object.freeze({ ...routingByAccess.TAXI }),
        CIVIL: Object.freeze({ ...routingByAccess.CIVIL }),
      }),
      routablePickupDropoffZones: Object.freeze(routablePickupDropoff),
      unroutablePickupDropoffZones: Object.freeze(unroutablePickupDropoff),
    }),
    scenarios: Object.freeze({
      ...scenarioCoverage,
      pickupDropoffZones: pickupDropoffZones.length,
      routablePickupDropoffZones: routablePickupDropoff.length,
      recoveryPoints: world.recoveryPoints.length,
    }),
    checks: Object.freeze(
      MAP_INTEGRITY_CHECKS.map((id) => {
        const state = tracker.states.get(id)!;
        return Object.freeze({
          id,
          status: state.skipped
            ? ('SKIPPED' as const)
            : state.issues > 0
              ? ('FAIL' as const)
              : ('PASS' as const),
          examined: state.examined,
          issues: state.issues,
          note: state.note,
        });
      }),
    ),
  });

  return Object.freeze({
    version: MAP_INTEGRITY_VERSION,
    mapId: world.mapId,
    schemaVersion: world.schemaVersion,
    ok: issueCount === 0,
    issueCount,
    truncated: suppressed,
    errorsByReason: Object.freeze(sortedReasons),
    issues: Object.freeze(sortedIssues),
    coverage,
    schemaError,
  });
}

function positionForEntry(world: RawWorld, entry: RawEntry): Vector3 | null {
  if (entry.id !== null) {
    if (world.laneById.get(entry.id) === entry) return lanePosition(world, entry);
    const node = world.nodeById.get(entry.id);
    if (node) return readVector(node.value.positionM);
    const area = world.areaById.get(entry.id);
    if (area) {
      const box = areaBox(areaPoints(world, entry.id));
      if (box) return midpoint([box.min, box.max]);
    }
  }
  return null;
}

function buildScenarioCoverage(
  world: RawWorld,
): Omit<
  MapIntegrityScenarioCoverage,
  'pickupDropoffZones' | 'routablePickupDropoffZones' | 'recoveryPoints'
> {
  const laneDirections = { FORWARD: 0, REVERSE: 0 };
  const laneAccess = { TAXI: 0, CIVIL: 0 };
  const roadClasses = { ARTERIAL: 0, RESIDENTIAL: 0 };
  for (const lane of world.lanes) {
    const direction = asString(lane.value.direction);
    if (direction === 'FORWARD' || direction === 'REVERSE') laneDirections[direction] += 1;
    const access = asArray(lane.value.access);
    if (access.includes('TAXI')) laneAccess.TAXI += 1;
    if (access.includes('CIVIL')) laneAccess.CIVIL += 1;
    const neighbors = asObject(lane.value.neighbors);
    if (asString(neighbors?.left) !== null || asString(neighbors?.right) !== null)
      roadClasses.ARTERIAL += 1;
    else roadClasses.RESIDENTIAL += 1;
  }
  const intersectionTypes = { SIGNALIZED: 0, STOP_CONTROLLED: 0, UNCONTROLLED: 0 };
  const signaled = new Set(world.signals.map((signal) => asString(signal.value.intersectionId)));
  const stopped = new Set(
    world.stopLines
      .filter((line) => {
        const kind = asString(line.value.kind);
        return kind === 'STOP' || kind === 'SIGNAL';
      })
      .map((line) => asString(line.value.intersectionId)),
  );
  for (const junction of world.intersections) {
    if (junction.id === null) continue;
    if (signaled.has(junction.id)) intersectionTypes.SIGNALIZED += 1;
    else if (stopped.has(junction.id)) intersectionTypes.STOP_CONTROLLED += 1;
    else intersectionTypes.UNCONTROLLED += 1;
  }
  const stopLineKinds = { STOP: 0, SIGNAL: 0, CROSSWALK: 0 };
  for (const line of world.stopLines) {
    const kind = asString(line.value.kind);
    if (kind === 'STOP' || kind === 'SIGNAL' || kind === 'CROSSWALK') stopLineKinds[kind] += 1;
  }
  const serviceZoneKinds = { PICKUP: 0, DROPOFF: 0, BOTH: 0 };
  const serviceZoneAccess = { TAXI: 0, CIVIL: 0, 'TAXI+CIVIL': 0 };
  for (const zone of world.serviceZones) {
    const kind = asString(zone.value.kind);
    if (kind === 'PICKUP' || kind === 'DROPOFF' || kind === 'BOTH') serviceZoneKinds[kind] += 1;
    const access = asArray(zone.value.access);
    const taxi = access.includes('TAXI');
    const civil = access.includes('CIVIL');
    if (taxi && civil) serviceZoneAccess['TAXI+CIVIL'] += 1;
    else if (taxi) serviceZoneAccess.TAXI += 1;
    else if (civil) serviceZoneAccess.CIVIL += 1;
  }
  return {
    laneDirections,
    laneAccess,
    roadClasses,
    intersectionTypes,
    stopLineKinds,
    serviceZoneKinds,
    serviceZoneAccess,
  };
}

function createTracker(): CheckTracker {
  const states = new Map<
    MapIntegrityCheckId,
    { examined: number; issues: number; skipped: boolean; note: string | null }
  >();
  for (const id of MAP_INTEGRITY_CHECKS)
    states.set(id, { examined: 0, issues: 0, skipped: false, note: null });
  return { states };
}

function emptyCoverage(): MapIntegrityCoverage {
  const zeroEntityCounts: Record<MapIntegrityEntityKind, number> = {
    nodes: 0,
    paths: 0,
    areas: 0,
    lanes: 0,
    intersections: 0,
    movements: 0,
    conflictZones: 0,
    signals: 0,
    phases: 0,
    movementStates: 0,
    stopLines: 0,
    crosswalks: 0,
    serviceZones: 0,
    recoveryPoints: 0,
  };
  const zeroAccess: MapIntegrityAccessCoverage = {
    lanes: 0,
    zones: 0,
    reachableLaneZonePairs: 0,
    unreachableLaneZonePairs: 0,
    unreachableLaneIds: [],
  };
  return Object.freeze({
    entityCounts: Object.freeze(zeroEntityCounts),
    references: Object.freeze({
      checked: 0,
      missing: 0,
      byKind: Object.freeze({
        NODE: 0,
        PATH: 0,
        AREA: 0,
        LANE: 0,
        INTERSECTION: 0,
        SIGNAL: 0,
        STOP_LINE: 0,
        CONFLICT_ZONE: 0,
        MOVEMENT: 0,
      }),
    }),
    connectivity: Object.freeze({
      stronglyConnectedComponents: 0,
      weaklyConnectedComponents: 0,
      largestComponentLanes: 0,
      disconnectedLaneIds: [],
      byAccess: Object.freeze({ TAXI: zeroAccess, CIVIL: zeroAccess }),
    }),
    routing: Object.freeze({
      requested: 0,
      ready: 0,
      failed: 0,
      byAccess: Object.freeze({
        TAXI: Object.freeze({ requested: 0, ready: 0, failed: 0 }),
        CIVIL: Object.freeze({ requested: 0, ready: 0, failed: 0 }),
      }),
      routablePickupDropoffZones: [],
      unroutablePickupDropoffZones: [],
    }),
    scenarios: Object.freeze({
      laneDirections: Object.freeze({ FORWARD: 0, REVERSE: 0 }),
      laneAccess: Object.freeze({ TAXI: 0, CIVIL: 0 }),
      roadClasses: Object.freeze({ ARTERIAL: 0, RESIDENTIAL: 0 }),
      intersectionTypes: Object.freeze({ SIGNALIZED: 0, STOP_CONTROLLED: 0, UNCONTROLLED: 0 }),
      stopLineKinds: Object.freeze({ STOP: 0, SIGNAL: 0, CROSSWALK: 0 }),
      serviceZoneKinds: Object.freeze({ PICKUP: 0, DROPOFF: 0, BOTH: 0 }),
      serviceZoneAccess: Object.freeze({ TAXI: 0, CIVIL: 0, 'TAXI+CIVIL': 0 }),
      pickupDropoffZones: 0,
      routablePickupDropoffZones: 0,
      recoveryPoints: 0,
    }),
    checks: Object.freeze(
      MAP_INTEGRITY_CHECKS.map((id) =>
        Object.freeze({ id, status: 'SKIPPED' as const, examined: 0, issues: 0, note: null }),
      ),
    ),
  });
}
