import type { Vector3 } from '../vehicles';
import { parseRoadMap } from './parser';
import type { Crosswalk, StopLine } from './schema';

export interface HazardObservation {
  readonly entityId: string;
  readonly kind: 'PEDESTRIAN' | 'OBSTACLE';
  readonly positionM: Vector3;
  readonly radiusM: number;
  readonly active: boolean;
  readonly observable: boolean;
}
export interface CrosswalkQuery {
  readonly fromM: Vector3;
  readonly toM: Vector3;
  readonly laneId?: string;
  /** Query vertical envelope; default 1m, independent of visual meshes. */
  readonly heightToleranceM?: number;
}
export interface CrosswalkZone {
  readonly crosswalk: Crosswalk;
  readonly polygon: readonly Vector3[];
  readonly stopLines: readonly {
    readonly line: StopLine;
    readonly points: readonly Vector3[];
  }[];
}
export interface CrosswalkExposure {
  readonly zoneId: string;
  readonly crossedStopLineIds: readonly string[];
  readonly observablePedestrianIds: readonly string[];
  readonly observableObstacleIds: readonly string[];
  /** Exposure is context only. It never asserts a yield, a violation or learning eligibility. */
  readonly hasPedestrianExposure: boolean;
}
const EPSILON = 1e-9;
export const MAX_HAZARD_OBSERVATIONS = 4096;
function validatePoint(point: Vector3): void {
  if (!point || [point.x, point.y, point.z].some((v) => !Number.isFinite(v) || Math.abs(v) > 1e6))
    throw new Error('Invalid hazard query position');
}
const cross = (x: number, z: number, u: number, v: number) => x * v - z * u;
function distanceToSegment(p: Vector3, a: Vector3, b: Vector3, planar = false): number {
  const dx = b.x - a.x,
    dy = planar ? 0 : b.y - a.y,
    dz = b.z - a.z;
  const length2 = dx * dx + dy * dy + dz * dz;
  const t =
    length2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * dx + (planar ? 0 : p.y - a.y) * dy + (p.z - a.z) * dz) / length2,
          ),
        );
  return Math.hypot(p.x - a.x - t * dx, planar ? 0 : p.y - a.y - t * dy, p.z - a.z - t * dz);
}
function inside(point: Vector3, polygon: readonly Vector3[]): boolean {
  let result = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i],
      b = polygon[(i + 1) % polygon.length];
    if (distanceToSegment(point, a, b, true) <= EPSILON) return true;
    if (
      a.z > point.z !== b.z > point.z &&
      point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x
    )
      result = !result;
  }
  return result;
}
/** Fractions on AB where projected segments intersect, including collinear overlap. */
function intersections(a: Vector3, b: Vector3, c: Vector3, d: Vector3): readonly number[] {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    ex = d.x - c.x,
    ez = d.z - c.z;
  const det = cross(dx, dz, ex, ez),
    cx = c.x - a.x,
    cz = c.z - a.z;
  if (Math.abs(det) > EPSILON) {
    const t = cross(cx, cz, ex, ez) / det,
      u = cross(cx, cz, dx, dz) / det;
    return t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON
      ? [Math.max(0, Math.min(1, t))]
      : [];
  }
  if (Math.abs(cross(cx, cz, dx, dz)) > EPSILON) return [];
  const length2 = dx * dx + dz * dz;
  if (length2 <= EPSILON * EPSILON)
    return distanceToSegment(a, c, d, true) <= EPSILON ? [0, 1] : [];
  const first = (cx * dx + cz * dz) / length2,
    last = ((d.x - a.x) * dx + (d.z - a.z) * dz) / length2;
  const lo = Math.max(0, Math.min(first, last)),
    hi = Math.min(1, Math.max(first, last));
  return lo <= hi + EPSILON ? [lo, hi] : [];
}
function pointAt(a: Vector3, b: Vector3, t: number): Vector3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}
function touchesPolygon(
  query: CrosswalkQuery,
  polygon: readonly Vector3[],
  tolerance: number,
): boolean {
  const fractions = [0, 1];
  let minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    minY = Math.min(minY, a.y);
    maxY = Math.max(maxY, a.y);
    fractions.push(...intersections(query.fromM, query.toM, a, polygon[(i + 1) % polygon.length]));
  }
  const dy = query.toM.y - query.fromM.y;
  if (dy !== 0)
    for (const y of [minY - tolerance, maxY + tolerance]) {
      const t = (y - query.fromM.y) / dy;
      if (t > 0 && t < 1) fractions.push(t);
    }
  fractions.sort((a, b) => a - b);
  const valid = (t: number) => {
    const p = pointAt(query.fromM, query.toM, t);
    return (
      p.y >= minY - tolerance - EPSILON && p.y <= maxY + tolerance + EPSILON && inside(p, polygon)
    );
  };
  return fractions.some((t, i) => valid(t) || (i > 0 && valid((t + fractions[i - 1]) / 2)));
}

/** Immutable semantic zones. Queries retain no history and create no driving/learning events. */
export function createCrosswalkZones(input: unknown) {
  const map = parseRoadMap(input);
  const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
  const areas = new Map(map.geometry.areas.map((area) => [area.id, area]));
  const paths = new Map(map.geometry.paths.map((path) => [path.id, path]));
  const lines = new Map(map.stopLines.map((line) => [line.id, line]));
  const polygonCache = new Map<string, readonly Vector3[]>();
  const lineCache = new Map<string, readonly Vector3[]>();
  const bounds = new WeakMap<CrosswalkZone, { min: Vector3; max: Vector3 }>();
  const zones = new Map<string, CrosswalkZone>();
  const byLane = new Map<string, CrosswalkZone[]>();
  for (const crosswalk of map.crosswalks) {
    let polygon = polygonCache.get(crosswalk.geometryId);
    if (!polygon) {
      polygon = Object.freeze(
        areas.get(crosswalk.geometryId)!.vertexNodeIds.map((id) => nodes.get(id)!),
      );
      polygonCache.set(crosswalk.geometryId, polygon);
    }
    const zone = Object.freeze({
      crosswalk,
      polygon,
      stopLines: Object.freeze(
        crosswalk.stopLineIds.map((id) => {
          const line = lines.get(id)!;
          let points = lineCache.get(line.geometryId);
          if (!points) {
            points = Object.freeze(
              paths.get(line.geometryId)!.nodeIds.map((node) => nodes.get(node)!),
            );
            lineCache.set(line.geometryId, points);
          }
          return Object.freeze({
            line,
            points,
          });
        }),
      ),
    });
    const min = { x: Infinity, y: Infinity, z: Infinity },
      max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const point of polygon)
      for (const axis of ['x', 'y', 'z'] as const) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    bounds.set(zone, { min, max });
    zones.set(crosswalk.id, zone);
    for (const laneId of crosswalk.laneIds) {
      const list = byLane.get(laneId) ?? [];
      list.push(zone);
      byLane.set(laneId, list);
    }
  }
  return Object.freeze({
    getZone: (id: string): CrosswalkZone | null => zones.get(id) ?? null,
    getStats: () =>
      Object.freeze({
        zones: zones.size,
        laneReferences: [...byLane.values()].reduce((sum, list) => sum + list.length, 0),
        retainedObservations: 0,
      }),
    query(
      query: CrosswalkQuery,
      observations: readonly HazardObservation[] = [],
    ): readonly CrosswalkExposure[] {
      validatePoint(query.fromM);
      validatePoint(query.toM);
      const tolerance = query.heightToleranceM ?? 1;
      if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 10)
        throw new Error('Invalid height tolerance');
      if (observations.length > MAX_HAZARD_OBSERVATIONS)
        throw new Error('Hazard observation capacity exceeded');
      const ids = new Set<string>();
      const relevant: HazardObservation[] = [];
      for (const observation of observations) {
        validatePoint(observation.positionM);
        if (
          typeof observation.entityId !== 'string' ||
          !observation.entityId.trim() ||
          observation.entityId !== observation.entityId.trim() ||
          observation.entityId.length > 128 ||
          ids.has(observation.entityId) ||
          !['PEDESTRIAN', 'OBSTACLE'].includes(observation.kind) ||
          typeof observation.active !== 'boolean' ||
          typeof observation.observable !== 'boolean' ||
          !Number.isFinite(observation.radiusM) ||
          observation.radiusM < 0 ||
          observation.radiusM > 100
        )
          throw new Error('Invalid or duplicate hazard observation');
        ids.add(observation.entityId);
        if (
          observation.active &&
          observation.observable &&
          distanceToSegment(observation.positionM, query.fromM, query.toM) <=
            observation.radiusM + EPSILON
        )
          relevant.push(observation);
      }
      const results: CrosswalkExposure[] = [];
      const candidates =
        query.laneId === undefined ? zones.values() : (byLane.get(query.laneId) ?? []);
      for (const zone of candidates) {
        const box = bounds.get(zone)!;
        if (
          ['x', 'y', 'z'].some((name) => {
            const axis = name as keyof Vector3,
              padding = axis === 'y' ? tolerance : 0;
            return (
              Math.max(query.fromM[axis], query.toM[axis]) < box.min[axis] - padding ||
              Math.min(query.fromM[axis], query.toM[axis]) > box.max[axis] + padding
            );
          })
        )
          continue;
        if (!touchesPolygon(query, zone.polygon, tolerance)) continue;
        const stopIds: string[] = [];
        for (const { line, points } of zone.stopLines) {
          if (query.laneId !== undefined && line.laneId !== query.laneId) continue;
          // A stopped point is not a line crossing.
          if (query.fromM.x === query.toM.x && query.fromM.z === query.toM.z) continue;
          if (
            points.some((point, i) => {
              if (i === 0) return false;
              const a = points[i - 1],
                dx = point.x - a.x,
                dz = point.z - a.z;
              const before = cross(dx, dz, query.fromM.x - a.x, query.fromM.z - a.z);
              const after = cross(dx, dz, query.toM.x - a.x, query.toM.z - a.z);
              if (Math.abs(before) <= EPSILON || before * after > 0) return false;
              return intersections(query.fromM, query.toM, a, point).some(
                (t) =>
                  distanceToSegment(pointAt(query.fromM, query.toM, t), a, point) <=
                  tolerance + EPSILON,
              );
            })
          )
            stopIds.push(line.id);
        }
        const pedestrians: string[] = [],
          obstacles: string[] = [];
        for (const hazard of relevant) {
          if (!inside(hazard.positionM, zone.polygon)) continue;
          if (
            hazard.positionM.y < box.min.y - tolerance ||
            hazard.positionM.y > box.max.y + tolerance
          )
            continue;
          (hazard.kind === 'PEDESTRIAN' ? pedestrians : obstacles).push(hazard.entityId);
        }
        results.push(
          Object.freeze({
            zoneId: zone.crosswalk.id,
            crossedStopLineIds: Object.freeze(stopIds),
            observablePedestrianIds: Object.freeze(pedestrians.sort()),
            observableObstacleIds: Object.freeze(obstacles.sort()),
            hasPedestrianExposure: pedestrians.length > 0,
          }),
        );
      }
      return Object.freeze(results);
    },
  });
}
