/**
 * PBI 192 — planar geometry for the walker's collision footprint.
 *
 * The character walks as a cylinder whose horizontal footprint is a circle. The world supplies
 * convex polygons in the X/Z plane: building footprints, obstacle boxes and vehicle rectangles.
 * Everything here is pure arithmetic on plain data — no Babylon, no clock, no allocation of a
 * scene object — so the walker stays deterministic and the penetration numbers are reproducible.
 */
import { CharacterContractError } from './errors';

export interface WalkPoint2 {
  readonly x: number;
  readonly z: number;
}

export interface WalkBounds2 {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface WalkPolygon {
  readonly id: string;
  /** Convex vertices in the X/Z plane, counter-clockwise, first vertex not repeated. */
  readonly vertices: readonly WalkPoint2[];
  readonly bounds: WalkBounds2;
}

export interface CirclePushOut {
  /** Displacement that puts the circle exactly on the surface of the polygon. */
  readonly offsetM: WalkPoint2;
  /** How deep the circle was inside the polygon before the push; zero when it only touched. */
  readonly depthM: number;
}

const point = (x: number, z: number): WalkPoint2 => Object.freeze({ x, z });

function finitePoint(candidate: WalkPoint2): boolean {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.z)
  );
}

function cross(ax: number, az: number, bx: number, bz: number): number {
  return ax * bz - az * bx;
}

export function walkPolygonAreaM2(polygon: WalkPolygon): number {
  let area = 0;
  for (let index = 0; index < polygon.vertices.length; index += 1) {
    const current = polygon.vertices[index]!;
    const next = polygon.vertices[(index + 1) % polygon.vertices.length]!;
    area += current.x * next.z - next.x * current.z;
  }
  return area / 2;
}

/** Fail-closed polygon admission: finite, convex and non-degenerate, re-oriented CCW. */
export function createWalkPolygon(id: string, vertices: readonly WalkPoint2[]): WalkPolygon {
  if (typeof id !== 'string' || !id.trim())
    throw new CharacterContractError('WALK_WORLD_POLYGON', 'polygon id must be a non-empty string');
  if (!Array.isArray(vertices) || vertices.length < 3)
    throw new CharacterContractError('WALK_WORLD_POLYGON', `polygon ${id} needs three vertices`);
  if (!vertices.every(finitePoint))
    throw new CharacterContractError('WALK_WORLD_POLYGON', `polygon ${id} has non-finite vertices`);
  const ordered = [...vertices];
  let signedArea = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index]!;
    const next = ordered[(index + 1) % ordered.length]!;
    signedArea += current.x * next.z - next.x * current.z;
  }
  if (Math.abs(signedArea) <= 1e-12)
    throw new CharacterContractError('WALK_WORLD_POLYGON', `polygon ${id} is degenerate`);
  if (signedArea < 0) ordered.reverse();
  for (let index = 0; index < ordered.length; index += 1) {
    const first = ordered[index]!;
    const second = ordered[(index + 1) % ordered.length]!;
    const third = ordered[(index + 2) % ordered.length]!;
    const turn = cross(
      second.x - first.x,
      second.z - first.z,
      third.x - second.x,
      third.z - second.z,
    );
    // A concave vertex on either side means the polygon is not usable as a solid.
    if (turn < -1e-12)
      throw new CharacterContractError('WALK_WORLD_POLYGON', `polygon ${id} is not convex`);
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const vertex of ordered) {
    minX = Math.min(minX, vertex.x);
    maxX = Math.max(maxX, vertex.x);
    minZ = Math.min(minZ, vertex.z);
    maxZ = Math.max(maxZ, vertex.z);
  }
  return Object.freeze({
    id,
    vertices: Object.freeze(ordered.map((vertex) => point(vertex.x, vertex.z))),
    bounds: Object.freeze({ minX, maxX, minZ, maxZ }),
  });
}

/** Axis-aligned rectangle helper; the city layout quads are all axis-aligned. */
export function createRectanglePolygon(
  id: string,
  centerM: WalkPoint2,
  halfSizeM: WalkPoint2,
): WalkPolygon {
  if (!finitePoint(centerM) || !finitePoint(halfSizeM))
    throw new CharacterContractError('WALK_WORLD_POLYGON', `rectangle ${id} needs finite metres`);
  if (halfSizeM.x <= 0 || halfSizeM.z <= 0)
    throw new CharacterContractError('WALK_WORLD_POLYGON', `rectangle ${id} has no area`);
  return createWalkPolygon(id, [
    point(centerM.x - halfSizeM.x, centerM.z - halfSizeM.z),
    point(centerM.x + halfSizeM.x, centerM.z - halfSizeM.z),
    point(centerM.x + halfSizeM.x, centerM.z + halfSizeM.z),
    point(centerM.x - halfSizeM.x, centerM.z + halfSizeM.z),
  ]);
}

/** Rotated rectangle: a vehicle box footprint with a real yaw, in the 023 chassis frame. */
export function createOrientedRectanglePolygon(
  id: string,
  centerM: WalkPoint2,
  halfSizeM: WalkPoint2,
  yawRad: number,
): WalkPolygon {
  if (!finitePoint(centerM) || !finitePoint(halfSizeM) || !Number.isFinite(yawRad))
    throw new CharacterContractError('WALK_WORLD_POLYGON', `rectangle ${id} needs finite values`);
  if (halfSizeM.x <= 0 || halfSizeM.z <= 0)
    throw new CharacterContractError('WALK_WORLD_POLYGON', `rectangle ${id} has no area`);
  const cos = Math.cos(yawRad);
  const sin = Math.sin(yawRad);
  // Same convention as the vehicle frame: +Z forward, +X right, yaw around +Y.
  const corner = (localX: number, localZ: number): WalkPoint2 =>
    point(centerM.x + localX * cos + localZ * sin, centerM.z - localX * sin + localZ * cos);
  return createWalkPolygon(id, [
    corner(-halfSizeM.x, -halfSizeM.z),
    corner(halfSizeM.x, -halfSizeM.z),
    corner(halfSizeM.x, halfSizeM.z),
    corner(-halfSizeM.x, halfSizeM.z),
  ]);
}

export function boundsOverlap(
  bounds: WalkBounds2,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): boolean {
  return bounds.maxX >= minX && bounds.minX <= maxX && bounds.maxZ >= minZ && bounds.minZ <= maxZ;
}

/** Closed containment test; a point exactly on the boundary counts as inside. */
export function walkPolygonContains(polygon: WalkPolygon, x: number, z: number): boolean {
  const { vertices } = polygon;
  for (let index = 0; index < vertices.length; index += 1) {
    const first = vertices[index]!;
    const second = vertices[(index + 1) % vertices.length]!;
    if (cross(second.x - first.x, second.z - first.z, x - first.x, z - first.z) < -1e-12)
      return false;
  }
  return true;
}

function closestPointOnSegment(
  first: WalkPoint2,
  second: WalkPoint2,
  x: number,
  z: number,
): WalkPoint2 {
  const dx = second.x - first.x;
  const dz = second.z - first.z;
  const lengthSquared = dx * dx + dz * dz;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((x - first.x) * dx + (z - first.z) * dz) / lengthSquared));
  return point(first.x + dx * t, first.z + dz * t);
}

/** Distance from a point to the polygon: zero inside, otherwise the distance to its boundary. */
export function walkPolygonDistanceM(polygon: WalkPolygon, x: number, z: number): number {
  if (walkPolygonContains(polygon, x, z)) return 0;
  const { vertices } = polygon;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < vertices.length; index += 1) {
    const closest = closestPointOnSegment(
      vertices[index]!,
      vertices[(index + 1) % vertices.length]!,
      x,
      z,
    );
    best = Math.min(best, Math.hypot(x - closest.x, z - closest.z));
  }
  return best;
}

/**
 * How deep a circle overlaps a solid polygon. Zero means "outside or touching only"; a positive
 * value is the distance the circle would have to move to clear the solid.
 */
export function circlePenetrationM(
  polygon: WalkPolygon,
  x: number,
  z: number,
  radiusM: number,
): number {
  if (!Number.isFinite(radiusM) || radiusM < 0)
    throw new CharacterContractError('INVALID_WALK_INPUT', 'radius must be a finite, non-negative');
  if (walkPolygonContains(polygon, x, z)) {
    // Inside the solid: the push-out through the nearest edge also has to clear the radius.
    return radiusM + nearestEdgeDepthM(polygon, x, z);
  }
  const distance = walkPolygonDistanceM(polygon, x, z);
  return Math.max(0, radiusM - distance);
}

/** Distance from an interior point to the nearest polygon edge line. */
function nearestEdgeDepthM(polygon: WalkPolygon, x: number, z: number): number {
  const { vertices } = polygon;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < vertices.length; index += 1) {
    const first = vertices[index]!;
    const second = vertices[(index + 1) % vertices.length]!;
    const length = Math.hypot(second.x - first.x, second.z - first.z);
    if (length === 0) continue;
    const depth = cross(second.x - first.x, second.z - first.z, x - first.x, z - first.z) / length;
    best = Math.min(best, Math.abs(depth));
  }
  return best;
}

/**
 * Deterministic circle-versus-convex-polygon resolution. Returns the smallest translation that
 * removes the overlap, or `null` when the circle is already clear.
 */
export function circlePushOut(
  polygon: WalkPolygon,
  x: number,
  z: number,
  radiusM: number,
): CirclePushOut | null {
  if (!Number.isFinite(radiusM) || radiusM < 0)
    throw new CharacterContractError('INVALID_WALK_INPUT', 'radius must be a finite, non-negative');
  if (walkPolygonContains(polygon, x, z)) {
    const { vertices } = polygon;
    let bestDepth = Number.POSITIVE_INFINITY;
    let offsetX = 0;
    let offsetZ = 0;
    for (let index = 0; index < vertices.length; index += 1) {
      const first = vertices[index]!;
      const second = vertices[(index + 1) % vertices.length]!;
      const dx = second.x - first.x;
      const dz = second.z - first.z;
      const length = Math.hypot(dx, dz);
      if (length === 0) continue;
      const depth = cross(dx, dz, x - first.x, z - first.z) / length;
      if (depth >= 0 && depth < bestDepth) {
        bestDepth = depth;
        // Interior of a CCW polygon is left of the edge, so the outward normal is (dz, -dx).
        offsetX = (dz / length) * (depth + radiusM);
        offsetZ = (-dx / length) * (depth + radiusM);
      }
    }
    if (!Number.isFinite(bestDepth)) return null;
    return Object.freeze({
      offsetM: point(offsetX, offsetZ),
      depthM: radiusM + bestDepth,
    });
  }
  const { vertices } = polygon;
  let closest = point(0, 0);
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < vertices.length; index += 1) {
    const candidate = closestPointOnSegment(
      vertices[index]!,
      vertices[(index + 1) % vertices.length]!,
      x,
      z,
    );
    const distance = Math.hypot(x - candidate.x, z - candidate.z);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = candidate;
    }
  }
  if (bestDistance >= radiusM) return null;
  const scale = bestDistance === 0 ? 0 : (radiusM - bestDistance) / bestDistance;
  const directionX = bestDistance === 0 ? 1 : x - closest.x;
  const directionZ = bestDistance === 0 ? 0 : z - closest.z;
  return Object.freeze({
    offsetM: point(directionX * scale, directionZ * scale),
    depthM: radiusM - bestDistance,
  });
}
