import type { Vector3 } from '../vehicles';

export type SpatialKind = 'VEHICLE' | 'OBSTACLE' | 'ZONE';
export interface SpatialIdentity {
  readonly id: string;
  readonly incarnation: number;
}
export interface SpatialSphere {
  readonly type: 'SPHERE';
  readonly centerM: Vector3;
  readonly radiusM: number;
}
export interface SpatialPrism {
  readonly type: 'PRISM';
  readonly verticesM: readonly Vector3[];
  readonly minHeightM: number;
  readonly maxHeightM: number;
}
export type SpatialEntity = SpatialIdentity &
  (
    | { readonly kind: 'VEHICLE' | 'OBSTACLE'; readonly shape: SpatialSphere }
    | { readonly kind: 'ZONE'; readonly shape: SpatialPrism }
  );
export interface SpatialQuery {
  readonly centerM: Vector3;
  readonly radiusM: number;
  readonly kinds?: readonly SpatialKind[];
  readonly exclude?: SpatialIdentity;
}
export interface SpatialIndexLimits {
  readonly cellSizeM: number;
  readonly maxVehicles: number;
  readonly maxObstacles: number;
  readonly maxZones: number;
  readonly maxVerticesPerZone: number;
  readonly maxCellsPerEntity: number;
  readonly maxSpatialReferences: number;
  readonly maxQueryCells: number;
}
export const SPATIAL_INDEX_LIMITS: Readonly<SpatialIndexLimits> = Object.freeze({
  cellSizeM: 16,
  maxVehicles: 110,
  maxObstacles: 96,
  maxZones: 512,
  maxVerticesPerZone: 128,
  maxCellsPerEntity: 256,
  maxSpatialReferences: 16384,
  maxQueryCells: 256,
});
export interface SpatialIndexStats {
  readonly entities: number;
  readonly vehicles: number;
  readonly obstacles: number;
  readonly zones: number;
  readonly zoneVertices: number;
  readonly cells: number;
  readonly spatialReferences: number;
  readonly fallbackEntities: number;
  readonly generation: number;
  readonly disposed: boolean;
  readonly lastQuery: Readonly<{
    cellsVisited: number;
    candidates: number;
    exactTests: number;
    matches: number;
    exhaustive: boolean;
  }>;
}
export interface SpatialIndex {
  /** Atomic validated replacement; old incarnations cannot overwrite newer live objects. */
  upsert(entity: SpatialEntity): void;
  /** Identity fence prevents late removal of a recreated entity. */
  remove(id: string, incarnation: number): boolean;
  get(id: string): SpatialEntity | null;
  query(query: SpatialQuery): readonly SpatialEntity[];
  reset(): void;
  dispose(): void;
  getStats(): Readonly<SpatialIndexStats>;
}
interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
interface Entry {
  entity: SpatialEntity;
  keys: readonly string[];
}
const emptyQuery = () =>
  Object.freeze({ cellsVisited: 0, candidates: 0, exactTests: 0, matches: 0, exhaustive: false });
function finite(value: number, min = -1e6, max = 1e6): number {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error('Invalid spatial numeric value');
  return value;
}
function identity(id: string, incarnation: number): void {
  if (typeof id !== 'string' || id.length === 0 || id.length > 128 || id.trim() !== id)
    throw new Error('Invalid spatial entity id');
  if (!Number.isSafeInteger(incarnation) || incarnation < 0)
    throw new Error('Invalid spatial incarnation');
}
function point(p: Vector3): Vector3 {
  if (!p) throw new Error('Missing spatial position');
  return Object.freeze({ x: finite(p.x), y: finite(p.y), z: finite(p.z) });
}
function kind(value: SpatialKind): SpatialKind {
  if (value !== 'VEHICLE' && value !== 'OBSTACLE' && value !== 'ZONE')
    throw new Error('Invalid spatial kind');
  return value;
}
function copyEntity(input: SpatialEntity, limits: SpatialIndexLimits): SpatialEntity {
  identity(input.id, input.incarnation);
  kind(input.kind);
  const shape = input.shape;
  if (input.kind !== 'ZONE' && shape.type === 'SPHERE') {
    return Object.freeze({
      id: input.id,
      incarnation: input.incarnation,
      kind: input.kind,
      shape: Object.freeze({
        type: 'SPHERE',
        centerM: point(shape.centerM),
        radiusM: finite(shape.radiusM, 0, 1e6),
      }),
    });
  }
  if (input.kind !== 'ZONE' || shape.type !== 'PRISM')
    throw new Error('Spatial kind/shape mismatch');
  if (
    !Array.isArray(shape.verticesM) ||
    shape.verticesM.length < 3 ||
    shape.verticesM.length > limits.maxVerticesPerZone
  )
    throw new Error('Spatial zone vertex admission exceeded');
  const minHeightM = finite(shape.minHeightM),
    maxHeightM = finite(shape.maxHeightM);
  if (minHeightM > maxHeightM) throw new Error('Invalid spatial zone heights');
  const verticesM = shape.verticesM.map(point);
  // Admit simple polygons only. Exact prism semantics include concavity and boundaries.
  let area = 0;
  const orientation = (a: Vector3, b: Vector3, c: Vector3) =>
    (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const between = (a: Vector3, b: Vector3, c: Vector3) =>
    c.x >= Math.min(a.x, b.x) &&
    c.x <= Math.max(a.x, b.x) &&
    c.z >= Math.min(a.z, b.z) &&
    c.z <= Math.max(a.z, b.z);
  for (let i = 0; i < verticesM.length; i++) {
    const a = verticesM[i],
      b = verticesM[(i + 1) % verticesM.length];
    if (a.x === b.x && a.z === b.z) throw new Error('Zero spatial polygon edge');
    const next = verticesM[(i + 2) % verticesM.length];
    if (
      orientation(a, b, next) === 0 &&
      (b.x - a.x) * (next.x - b.x) + (b.z - a.z) * (next.z - b.z) < 0
    )
      throw new Error('Overlapping adjacent spatial polygon edges');
    area += a.x * b.z - b.x * a.z;
    for (let j = i + 1; j < verticesM.length; j++) {
      if (j === i + 1 || (i === 0 && j === verticesM.length - 1)) continue;
      const c = verticesM[j],
        d = verticesM[(j + 1) % verticesM.length];
      const o1 = orientation(a, b, c),
        o2 = orientation(a, b, d),
        o3 = orientation(c, d, a),
        o4 = orientation(c, d, b);
      if (
        (o1 * o2 < 0 && o3 * o4 < 0) ||
        (o1 === 0 && between(a, b, c)) ||
        (o2 === 0 && between(a, b, d)) ||
        (o3 === 0 && between(c, d, a)) ||
        (o4 === 0 && between(c, d, b))
      )
        throw new Error('Spatial polygon must be simple');
    }
  }
  if (Math.abs(area) <= 1e-8) throw new Error('Spatial polygon has zero area');
  return Object.freeze({
    id: input.id,
    incarnation: input.incarnation,
    kind: 'ZONE',
    shape: Object.freeze({
      type: 'PRISM',
      verticesM: Object.freeze(verticesM),
      minHeightM,
      maxHeightM,
    }),
  });
}
function bounds(shape: SpatialSphere | SpatialPrism): Bounds {
  if (shape.type === 'SPHERE')
    return {
      minX: shape.centerM.x - shape.radiusM,
      maxX: shape.centerM.x + shape.radiusM,
      minZ: shape.centerM.z - shape.radiusM,
      maxZ: shape.centerM.z + shape.radiusM,
    };
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of shape.verticesM) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX, maxX, minZ, maxZ };
}
function cellBounds(b: Bounds, size: number): Bounds {
  return {
    minX: Math.floor(b.minX / size),
    maxX: Math.floor(b.maxX / size),
    minZ: Math.floor(b.minZ / size),
    maxZ: Math.floor(b.maxZ / size),
  };
}
function cellCount(b: Bounds): number {
  return (b.maxX - b.minX + 1) * (b.maxZ - b.minZ + 1);
}
function distanceToPrism(p: Vector3, shape: SpatialPrism): number {
  let inside = false,
    distanceSquared = Infinity;
  for (let i = 0; i < shape.verticesM.length; i++) {
    const a = shape.verticesM[i],
      b = shape.verticesM[(i + 1) % shape.verticesM.length];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x)
      inside = !inside;
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const fraction = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)),
    );
    const x = p.x - a.x - fraction * dx,
      z = p.z - a.z - fraction * dz;
    distanceSquared = Math.min(distanceSquared, x * x + z * z);
  }
  const height = Math.max(shape.minHeightM - p.y, p.y - shape.maxHeightM, 0);
  return Math.sqrt((inside ? 0 : distanceSquared) + height * height);
}
/** Pure local semantic index. Owners supply explicit observations; meshes do not define identities. */
export function createSpatialIndex(options: Partial<SpatialIndexLimits> = {}): SpatialIndex {
  for (const key of Object.keys(options))
    if (!Object.hasOwn(SPATIAL_INDEX_LIMITS, key)) throw new Error('Unknown spatial limit');
  const limits = Object.freeze({ ...SPATIAL_INDEX_LIMITS, ...options });
  for (const key of Object.keys(limits) as (keyof SpatialIndexLimits)[]) {
    const value = limits[key];
    if (key === 'cellSizeM') finite(value, 0.01, 1e6);
    else if (!Number.isSafeInteger(value) || value < 1 || value > SPATIAL_INDEX_LIMITS[key])
      throw new Error('Spatial admission limits may only be reduced');
  }
  const entries = new Map<string, Entry>(),
    cells = new Map<string, Set<string>>(),
    fallback = new Set<string>();
  const counts = { VEHICLE: 0, OBSTACLE: 0, ZONE: 0 };
  let references = 0,
    vertices = 0,
    generation = 0,
    disposed = false;
  let lastQuery: SpatialIndexStats['lastQuery'] = emptyQuery();
  const alive = () => {
    if (disposed) throw new Error('Spatial index disposed');
  };
  function detach(id: string, entry: Entry) {
    for (const key of entry.keys) {
      const cell = cells.get(key)!;
      cell.delete(id);
      if (cell.size === 0) cells.delete(key);
    }
    references -= entry.keys.length;
    fallback.delete(id);
    entries.delete(id);
    counts[entry.entity.kind]--;
    if (entry.entity.shape.type === 'PRISM') vertices -= entry.entity.shape.verticesM.length;
  }
  function clear() {
    entries.clear();
    cells.clear();
    fallback.clear();
    references = 0;
    vertices = 0;
    counts.VEHICLE = counts.OBSTACLE = counts.ZONE = 0;
    lastQuery = emptyQuery();
    generation++;
  }
  return Object.freeze({
    upsert(input: SpatialEntity) {
      alive();
      identity(input.id, input.incarnation);
      kind(input.kind);
      const previous = entries.get(input.id);
      if (previous && input.incarnation < previous.entity.incarnation)
        throw new Error('Stale spatial incarnation');
      const count = counts[input.kind] - (previous?.entity.kind === input.kind ? 1 : 0);
      const cap =
        input.kind === 'VEHICLE'
          ? limits.maxVehicles
          : input.kind === 'OBSTACLE'
            ? limits.maxObstacles
            : limits.maxZones;
      if (count >= cap) throw new Error('Spatial entity admission exceeded');
      const entity = copyEntity(input, limits),
        b = cellBounds(bounds(entity.shape), limits.cellSizeM);
      const n = cellCount(b),
        keys: string[] = [];
      if (
        n <= limits.maxCellsPerEntity &&
        references - (previous?.keys.length ?? 0) + n <= limits.maxSpatialReferences
      )
        for (let x = b.minX; x <= b.maxX; x++)
          for (let z = b.minZ; z <= b.maxZ; z++) keys.push(`${x}:${z}`);
      // Everything is validated/admitted before mutating any prior ownership.
      if (previous) detach(input.id, previous);
      entries.set(entity.id, { entity, keys });
      counts[entity.kind]++;
      if (entity.shape.type === 'PRISM') vertices += entity.shape.verticesM.length;
      if (keys.length === 0) fallback.add(entity.id);
      for (const key of keys) {
        let cell = cells.get(key);
        if (!cell) {
          cell = new Set();
          cells.set(key, cell);
        }
        cell.add(entity.id);
      }
      references += keys.length;
    },
    remove(id: string, incarnation: number) {
      alive();
      identity(id, incarnation);
      const previous = entries.get(id);
      if (!previous || previous.entity.incarnation !== incarnation) return false;
      detach(id, previous);
      return true;
    },
    get(id: string) {
      alive();
      return entries.get(id)?.entity ?? null;
    },
    query(input: SpatialQuery) {
      alive();
      const centerM = point(input.centerM),
        radiusM = finite(input.radiusM, 0, 1e6);
      if (input.exclude) identity(input.exclude.id, input.exclude.incarnation);
      if (input.kinds && (!Array.isArray(input.kinds) || input.kinds.length > 3))
        throw new Error('Invalid spatial query kinds');
      const kinds = input.kinds?.map(kind);
      const b = cellBounds(
        {
          minX: centerM.x - radiusM,
          maxX: centerM.x + radiusM,
          minZ: centerM.z - radiusM,
          maxZ: centerM.z + radiusM,
        },
        limits.cellSizeM,
      );
      const exhaustive = cellCount(b) > limits.maxQueryCells,
        candidates = new Set<string>();
      let cellsVisited = 0;
      if (exhaustive) for (const id of entries.keys()) candidates.add(id);
      else {
        for (let x = b.minX; x <= b.maxX; x++)
          for (let z = b.minZ; z <= b.maxZ; z++) {
            cellsVisited++;
            for (const id of cells.get(`${x}:${z}`) ?? []) candidates.add(id);
          }
        for (const id of fallback) candidates.add(id);
      }
      const found: SpatialEntity[] = [];
      let exactTests = 0;
      for (const id of candidates) {
        const entity = entries.get(id)!.entity;
        if (kinds && !kinds.includes(entity.kind)) continue;
        if (input.exclude?.id === id && input.exclude.incarnation === entity.incarnation) continue;
        exactTests++;
        const shape = entity.shape;
        const distance =
          shape.type === 'SPHERE'
            ? Math.max(
                0,
                Math.hypot(
                  centerM.x - shape.centerM.x,
                  centerM.y - shape.centerM.y,
                  centerM.z - shape.centerM.z,
                ) - shape.radiusM,
              )
            : distanceToPrism(centerM, shape);
        if (distance <= radiusM) found.push(entity);
      }
      found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.incarnation - b.incarnation));
      lastQuery = Object.freeze({
        cellsVisited,
        candidates: candidates.size,
        exactTests,
        matches: found.length,
        exhaustive,
      });
      return Object.freeze(found);
    },
    reset() {
      alive();
      clear();
    },
    dispose() {
      if (!disposed) {
        clear();
        disposed = true;
      }
    },
    getStats() {
      return Object.freeze({
        entities: entries.size,
        vehicles: counts.VEHICLE,
        obstacles: counts.OBSTACLE,
        zones: counts.ZONE,
        zoneVertices: vertices,
        cells: cells.size,
        spatialReferences: references,
        fallbackEntities: fallback.size,
        generation,
        disposed,
        lastQuery,
      });
    },
  });
}
