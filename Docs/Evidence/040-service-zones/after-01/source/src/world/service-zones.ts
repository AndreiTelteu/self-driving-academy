import { parseRoadMap } from './parser';
import type { RoadAccess, RoadMap, Lane } from './schema';
import type { LaneGraph, DirectedLanePath } from './lane-graph';
import { fields, number, text, requireContract } from '../sessions';

export const SERVICE_ZONE_LIMITS = Object.freeze({
  services: 256,
  recoveryPoints: 256,
  polygonVertices: 256,
  routeLanes: 2048,
  routeEdges: 65536,
  queriesInFlight: 1,
});
export interface ServicePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface ServiceSiteQuery {
  readonly category: 'SERVICE' | 'RECOVERY';
  readonly id: string;
  readonly fromLaneId: string;
  readonly access: RoadAccess;
  readonly purpose: 'PICKUP' | 'DROPOFF';
}
export interface ServiceFootprint {
  readonly halfWidthM: number;
  readonly halfLengthM: number;
}
export interface ServiceCorridor {
  readonly mapId: string;
  readonly laneId: string;
  readonly access: RoadAccess;
  readonly start: ServicePoint;
  readonly end: ServicePoint;
  readonly widthM: number;
}
export interface ServiceSite {
  readonly category: 'SERVICE' | 'RECOVERY';
  readonly id: string;
  readonly laneId: string;
  readonly anchorNodeId: string;
  readonly positionM: ServicePoint;
  readonly headingRad: number;
  readonly access: readonly RoadAccess[];
  readonly kind: 'PICKUP' | 'DROPOFF' | 'BOTH';
  readonly polygon: readonly ServicePoint[] | null;
}
export type ServiceDenial =
  | 'UNKNOWN_ID'
  | 'ACCESS_DENIED'
  | 'KIND_DENIED'
  | 'UNREACHABLE'
  | 'UNSUPPORTED_CORRIDOR'
  | 'INSUFFICIENT_SPACE';
export type ServiceSiteDecision =
  | Readonly<{ status: 'DENIED'; reason: ServiceDenial }>
  | Readonly<{ status: 'READY'; site: ServiceSite; corridor: ServiceCorridor }>;
const point = (p: ServicePoint): ServicePoint => Object.freeze({ x: p.x, y: p.y, z: p.z });
const samePoint = (a: ServicePoint, b: ServicePoint) => a.x === b.x && a.y === b.y && a.z === b.z;
const cross = (a: ServicePoint, b: ServicePoint, c: ServicePoint) =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const onSegment = (a: ServicePoint, b: ServicePoint, p: ServicePoint) =>
  cross(a, b, p) === 0 &&
  p.x >= Math.min(a.x, b.x) &&
  p.x <= Math.max(a.x, b.x) &&
  p.z >= Math.min(a.z, b.z) &&
  p.z <= Math.max(a.z, b.z);
function inside(poly: readonly ServicePoint[], p: ServicePoint) {
  let result = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    if (onSegment(a, b, p)) return true;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x)
      result = !result;
  }
  return result;
}
function intersectionParameter(
  a: ServicePoint,
  b: ServicePoint,
  c: ServicePoint,
  d: ServicePoint,
): number[] {
  const rx = b.x - a.x,
    rz = b.z - a.z,
    sx = d.x - c.x,
    sz = d.z - c.z,
    den = rx * sz - rz * sx;
  if (den !== 0) {
    const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den,
      u = ((c.x - a.x) * rz - (c.z - a.z) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t] : [];
  }
  if (cross(a, b, c) !== 0) return [];
  const length2 = rx * rx + rz * rz;
  return [c, d]
    .map((p) => ((p.x - a.x) * rx + (p.z - a.z) * rz) / length2)
    .filter((t) => t >= 0 && t <= 1);
}
/** Whole rectangle edges, not just corners. Subinterval midpoints detect concave notches. */
export function serviceFootprintInside(
  polygon: readonly ServicePoint[],
  corners: readonly ServicePoint[],
) {
  requireContract(
    polygon.length >= 3 &&
      polygon.length <= SERVICE_ZONE_LIMITS.polygonVertices &&
      corners.length === 4,
    'Service polygon capacity',
  );
  if (!corners.every((p) => inside(polygon, p))) return false;
  for (let i = 0; i < 4; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 4],
      breaks = [0, 1];
    for (let j = 0; j < polygon.length; j++)
      breaks.push(...intersectionParameter(a, b, polygon[j], polygon[(j + 1) % polygon.length]));
    breaks.sort((x, y) => x - y);
    for (let k = 1; k < breaks.length; k++) {
      const t = (breaks[k - 1] + breaks[k]) / 2;
      if (!inside(polygon, { x: a.x + (b.x - a.x) * t, y: 0, z: a.z + (b.z - a.z) * t }))
        return false;
    }
  }
  // A concave boundary wholly inside the rectangle can exclude interior area even
  // when every footprint edge stays on/inside the zone. Test every inward cell around
  // polygon vertices by exact polygon-edge/rectangle-edge subdivision above, and deny
  // any polygon vertex strictly inside the rectangle that creates a reentrant boundary.
  for (let i = 0; i < polygon.length; i++) {
    const v = polygon[i];
    if (!inside(corners, v)) continue;
    if (corners.some((a, j) => onSegment(a, corners[(j + 1) % 4], v))) continue;
    return false;
  }
  return true;
}
function footprint(site: ServiceSite, size: ServiceFootprint): readonly ServicePoint[] {
  const fx = Math.cos(site.headingRad),
    fz = Math.sin(site.headingRad);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, z]) =>
    point({
      x: site.positionM.x + fz * x * size.halfWidthM + fx * z * size.halfLengthM,
      y: 0,
      z: site.positionM.z - fx * x * size.halfWidthM + fz * z * size.halfLengthM,
    }),
  );
}
function supportedPolygon(poly: readonly ServicePoint[]) {
  if (
    poly.some((p) => p.y !== 0) ||
    poly.length < 3 ||
    poly.length > SERVICE_ZONE_LIMITS.polygonVertices
  )
    return false;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    if (samePoint(a, b)) return false;
    area += a.x * b.z - b.x * a.z;
    for (let j = i + 1; j < poly.length; j++) {
      if (j === i + 1 || (i === 0 && j === poly.length - 1)) continue;
      if (intersectionParameter(a, b, poly[j], poly[(j + 1) % poly.length]).length) return false;
    }
  }
  return area !== 0;
}
/** Bound validated032 metadata to actual033 geometry. Occupancy is deliberately separate. */
export function createServiceZoneCatalog(input: unknown, graph: LaneGraph) {
  const map: RoadMap = parseRoadMap(input);
  const mapId = map.mapId;
  requireContract(
    map.serviceZones.length <= SERVICE_ZONE_LIMITS.services &&
      map.recoveryPoints.length <= SERVICE_ZONE_LIMITS.recoveryPoints,
    'Service catalog capacity',
  );
  const nodes = new Map(map.geometry.nodes.map((n) => [n.id, n.positionM]));
  const paths = new Map(map.geometry.paths.map((p) => [p.id, p]));
  const lanes = new Map(map.lanes.map((l) => [l.id, l]));
  const areas = new Map(map.geometry.areas.map((a) => [a.id, a]));
  const sites = new Map<string, ServiceSite>();
  let disposed = false,
    inFlight = false;
  function laneBinding(
    id: string,
    access: RoadAccess,
  ): { lane: Lane; path: DirectedLanePath } | null {
    requireContract(graph.mapId === mapId, 'Service graph map mismatch');
    const authored = lanes.get(id);
    if (!authored || !authored.access.includes(access)) return null;
    const lane = graph.getLane(id, access),
      path = graph.getDirectedPath(id);
    requireContract(graph.mapId === mapId, 'Service graph changed during query');
    if (!lane || !path) return null;
    const ids = [...paths.get(authored.geometryId)!.nodeIds];
    if (authored.direction === 'REVERSE') ids.reverse();
    requireContract(
      lane.id === authored.id &&
        lane.geometryId === authored.geometryId &&
        lane.direction === authored.direction &&
        lane.widthM === authored.widthM &&
        lane.access.length === authored.access.length &&
        lane.access.every((v, i) => v === authored.access[i]) &&
        lane.successorIds.length === authored.successorIds.length &&
        lane.successorIds.every((v, i) => v === authored.successorIds[i]),
      'Service lane binding',
    );
    requireContract(
      path.laneId === id &&
        path.nodeIds.length === ids.length &&
        path.points.length === ids.length &&
        ids.every((v, i) => v === path.nodeIds[i] && samePoint(nodes.get(v)!, path.points[i])),
      'Service directed geometry binding',
    );
    return { lane, path };
  }
  function corridor(site: ServiceSite, access: RoadAccess): ServiceCorridor | null {
    const bound = laneBinding(site.laneId, access);
    if (!bound) return null;
    const pts = bound.path.points,
      index = bound.path.nodeIds.indexOf(site.anchorNodeId);
    if (index < 0) return null;
    let left = index > 0 ? index - 1 : index,
      right = index < pts.length - 1 ? index + 1 : index;
    if (left === right) return null;
    const a = pts[left],
      b = pts[right],
      dx = b.x - a.x,
      dz = b.z - a.z,
      length = Math.hypot(dx, dz);
    if (!length || a.y !== 0 || b.y !== 0 || pts[index].y !== 0) return null;
    const aligned = (u: ServicePoint, v: ServicePoint) =>
      u.y === 0 &&
      v.y === 0 &&
      (v.x - u.x) * dz - (v.z - u.z) * dx === 0 &&
      (v.x - u.x) * dx + (v.z - u.z) * dz > 0;
    if (!aligned(pts[left], pts[left + 1]) || !aligned(pts[right - 1], pts[right])) return null;
    while (left > 0 && aligned(pts[left - 1], pts[left])) left--;
    while (right < pts.length - 1 && aligned(pts[right], pts[right + 1])) right++;
    //040 supports exactly aligned authored recovery headings, not merely a positive
    //forward dot product. +pi/-pi are the same declared lane direction; no epsilon
    //admits near-perpendicular or subtly slanted candidates. Service heading is derived
    //from these actual directed adjacent points at construction.
    const supportedHeading = Math.atan2(dz, dx);
    const canonical = (heading: number) => (heading === Math.PI ? -Math.PI : heading);
    if (canonical(site.headingRad) !== canonical(supportedHeading)) return null;
    return Object.freeze({
      mapId,
      laneId: site.laneId,
      access,
      start: point(pts[left]),
      end: point(pts[right]),
      widthM: bound.lane.widthM,
    });
  }
  for (const zone of map.serviceZones) {
    const lane = lanes.get(zone.laneId)!,
      ids = [...paths.get(lane.geometryId)!.nodeIds];
    if (lane.direction === 'REVERSE') ids.reverse();
    const index = ids.indexOf(zone.anchorNodeId),
      a = nodes.get(ids[Math.max(0, index - 1)])!,
      b = nodes.get(ids[Math.min(ids.length - 1, index + 1)])!;
    const polygon = Object.freeze(
      areas.get(zone.geometryId)!.vertexNodeIds.map((id) => point(nodes.get(id)!)),
    );
    sites.set(
      'SERVICE/' + zone.id,
      Object.freeze({
        category: 'SERVICE',
        id: zone.id,
        laneId: zone.laneId,
        anchorNodeId: zone.anchorNodeId,
        positionM: point(nodes.get(zone.anchorNodeId)!),
        headingRad: Math.atan2(b.z - a.z, b.x - a.x),
        access: Object.freeze([...zone.access]),
        kind: zone.kind,
        polygon,
      }),
    );
  }
  for (const anchor of map.recoveryPoints)
    sites.set(
      'RECOVERY/' + anchor.id,
      Object.freeze({
        category: 'RECOVERY',
        id: anchor.id,
        laneId: anchor.laneId,
        anchorNodeId: anchor.nodeId,
        positionM: point(nodes.get(anchor.nodeId)!),
        headingRad: anchor.headingRad,
        access: Object.freeze([...lanes.get(anchor.laneId)!.access]),
        kind: 'BOTH',
        polygon: null,
      }),
    );
  for (const lane of map.lanes)
    for (const access of lane.access)
      requireContract(laneBinding(lane.id, access) !== null, 'Incomplete service graph');
  function reachable(from: string, to: string, access: RoadAccess) {
    if (!laneBinding(from, access)) return false;
    const visited = new Set([from]),
      queue = [from];
    let edges = 0;
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (id === to) return true;
      const lane = laneBinding(id, access)!;
      const successors = graph.getSuccessors(id, access);
      requireContract(graph.mapId === mapId, 'Service graph changed during reachability');
      const eligible = lane.lane.successorIds.filter((n) => lanes.get(n)?.access.includes(access));
      requireContract(
        successors.length === eligible.length &&
          new Set(successors.map((s) => s.id)).size === eligible.length &&
          eligible.every((id) => successors.some((s) => s.id === id)),
        'Service graph successor binding',
      );
      for (const next of successors) {
        requireContract(++edges <= SERVICE_ZONE_LIMITS.routeEdges, 'Service edge capacity');
        if (!visited.has(next.id)) {
          requireContract(visited.size < SERVICE_ZONE_LIMITS.routeLanes, 'Service route capacity');
          visited.add(next.id);
          queue.push(next.id);
        }
      }
    }
    return false;
  }
  const deny = (reason: ServiceDenial): ServiceSiteDecision =>
    Object.freeze({ status: 'DENIED', reason });
  return Object.freeze({
    mapId,
    list() {
      requireContract(!disposed, 'Service catalog disposed');
      return Object.freeze([...sites.values()]);
    },
    resolve(query: ServiceSiteQuery, size: ServiceFootprint): ServiceSiteDecision {
      requireContract(!disposed && !inFlight, 'Service catalog disposed/reentrant');
      inFlight = true;
      try {
        const q = fields(query, ['category', 'id', 'fromLaneId', 'access', 'purpose']),
          f = fields(size, ['halfWidthM', 'halfLengthM']);
        requireContract(q.category === 'SERVICE' || q.category === 'RECOVERY', 'Service category');
        const id = text(q.id),
          from = text(q.fromLaneId);
        requireContract(id.length <= 128 && from.length <= 128, 'Service query IDs');
        requireContract(q.access === 'TAXI' || q.access === 'CIVIL', 'Service access');
        requireContract(q.purpose === 'PICKUP' || q.purpose === 'DROPOFF', 'Service purpose');
        const dimensions = {
          halfWidthM: number(f.halfWidthM, Number.MIN_VALUE, 100),
          halfLengthM: number(f.halfLengthM, Number.MIN_VALUE, 100),
        };
        const site = sites.get(q.category + '/' + id);
        if (!site) return deny('UNKNOWN_ID');
        if (!site.access.includes(q.access)) return deny('ACCESS_DENIED');
        if (site.kind !== 'BOTH' && site.kind !== q.purpose) return deny('KIND_DENIED');
        if (!reachable(from, site.laneId, q.access)) return deny('UNREACHABLE');
        const region = corridor(site, q.access);
        if (!region) return deny('UNSUPPORTED_CORRIDOR');
        const corners = footprint(site, dimensions),
          dx = region.end.x - region.start.x,
          dz = region.end.z - region.start.z,
          length = Math.hypot(dx, dz);
        if (
          corners.some((p) => {
            const rx = p.x - region.start.x,
              rz = p.z - region.start.z,
              along = (rx * dx + rz * dz) / length,
              lateral = (-rx * dz + rz * dx) / length;
            return along < 0 || along > length || Math.abs(lateral) > region.widthM / 2;
          })
        )
          return deny('INSUFFICIENT_SPACE');
        if (
          site.polygon &&
          (!supportedPolygon(site.polygon) || !serviceFootprintInside(site.polygon, corners))
        )
          return deny('INSUFFICIENT_SPACE');
        return Object.freeze({ status: 'READY', site, corridor: region });
      } finally {
        inFlight = false;
      }
    },
    getStats() {
      return Object.freeze({
        disposed,
        sites: sites.size,
        queriesInFlight: inFlight ? 1 : 0,
        limits: SERVICE_ZONE_LIMITS,
      });
    },
    dispose() {
      if (disposed) return;
      requireContract(!inFlight, 'Service query active');
      disposed = true;
      sites.clear();
      nodes.clear();
      paths.clear();
      lanes.clear();
      areas.clear();
    },
  });
}
export type ServiceZoneCatalog = ReturnType<typeof createServiceZoneCatalog>;
