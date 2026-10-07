import type { Vector3 } from '../vehicles';
import { parseRoadMap } from './parser';
import type { Movement } from './schema';
import { intersectionEnvelopeContact } from './intersection-conflict-geometry';
import type { EnvelopeContact } from './intersection-conflict-geometry';
export type IntersectionConflictReason =
  'SHARED_ZONE' | 'SHARED_ENTRY' | 'SHARED_EXIT' | 'TRAJECTORY_ENVELOPES';
export interface IntersectionMovement {
  readonly intersectionId: string;
  readonly movement: Movement;
  readonly trajectoryM: readonly Vector3[];
  readonly corridorHalfWidthM: number;
}
export interface IntersectionConflictZone {
  readonly intersectionId: string;
  readonly id: string;
  readonly polygonM: readonly Vector3[];
  readonly declaredMovementIds: readonly string[];
}
export interface IntersectionConflictRelation {
  readonly id: string;
  readonly intersectionId: string;
  /** Sorted canonical pair, independent of input/query order. */
  readonly movementIds: readonly [string, string];
  readonly incompatible: boolean;
  readonly reasons: readonly IntersectionConflictReason[];
  readonly sharedZoneIds: readonly string[];
  readonly geometricContact: EnvelopeContact | null;
  /** Conflict is occupancy context, never a right-of-way decision. */
  readonly priority: null;
}
export interface IntersectionConflictStats {
  readonly movements: number;
  readonly zones: number;
  readonly pairRelations: number;
  readonly incompatiblePairs: number;
  readonly segmentComparisons: number;
  readonly uniqueTrajectoryGeometries: number;
  readonly uniqueZoneGeometries: number;
}
export interface IntersectionConflicts {
  readonly mapId: string;
  getMovement(intersectionId: string, movementId: string): IntersectionMovement | null;
  getZones(intersectionId: string): readonly IntersectionConflictZone[];
  getRelation(
    intersectionId: string,
    firstId: string,
    secondId: string,
  ): IntersectionConflictRelation | null;
  getIncompatible(
    intersectionId: string,
    movementId: string,
  ): readonly IntersectionConflictRelation[];
  getStats(): Readonly<IntersectionConflictStats>;
}
export const INTERSECTION_CONFLICT_LIMITS = Object.freeze({
  pairRelations: 65536,
  segmentComparisons: 2_000_000,
});
const EMPTY = Object.freeze([]);
const key = (intersectionId: string, movementId: string) =>
  JSON.stringify([intersectionId, movementId]);
const pairKey = (intersectionId: string, a: string, b: string) =>
  JSON.stringify([intersectionId, ...[a, b].sort()]);
/** Copies/validates once; bounded construction, constant lookup, no renderer or priority inference. */
export function createIntersectionConflicts(
  input: unknown,
  options: { readonly heightToleranceM?: number } = {},
): IntersectionConflicts {
  const tolerance = options.heightToleranceM ?? 1.5;
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 100)
    throw new Error('Invalid intersection height tolerance');
  const map = parseRoadMap(input);
  const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
  const paths = new Map(map.geometry.paths.map((path) => [path.id, path]));
  const areas = new Map(map.geometry.areas.map((area) => [area.id, area]));
  const lanes = new Map(map.lanes.map((lane) => [lane.id, lane]));
  const pathPoints = new Map<string, readonly Vector3[]>();
  const areaPoints = new Map<string, readonly Vector3[]>();
  const trajectory = (id: string) => {
    let points = pathPoints.get(id);
    if (!points) {
      points = Object.freeze(paths.get(id)!.nodeIds.map((nodeId) => nodes.get(nodeId)!));
      pathPoints.set(id, points);
    }
    return points;
  };
  const polygon = (id: string) => {
    let points = areaPoints.get(id);
    if (!points) {
      points = Object.freeze(areas.get(id)!.vertexNodeIds.map((nodeId) => nodes.get(nodeId)!));
      areaPoints.set(id, points);
    }
    return points;
  };
  const movements = new Map<string, IntersectionMovement>();
  const zones = new Map<string, readonly IntersectionConflictZone[]>();
  const relations = new Map<string, IntersectionConflictRelation>();
  const incompatible = new Map<string, IntersectionConflictRelation[]>();
  let zoneCount = 0,
    segmentComparisons = 0,
    incompatiblePairs = 0;
  // Reject excessive pair count before spending geometry work; no relevant pair is truncated.
  const pairCount = map.intersections.reduce(
    (sum, j) => sum + (j.movements.length * (j.movements.length - 1)) / 2,
    0,
  );
  if (pairCount > INTERSECTION_CONFLICT_LIMITS.pairRelations)
    throw new Error(
      `Intersection pair capacity ${INTERSECTION_CONFLICT_LIMITS.pairRelations} exceeded; split map data`,
    );
  const admit = () => {
    if (++segmentComparisons > INTERSECTION_CONFLICT_LIMITS.segmentComparisons)
      throw new Error(
        `Intersection geometry budget ${INTERSECTION_CONFLICT_LIMITS.segmentComparisons} exceeded; simplify authored movement paths`,
      );
  };
  for (const junction of map.intersections) {
    const ordered = [...junction.movements].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    zones.set(
      junction.id,
      Object.freeze(
        junction.conflictZones.map((zone) =>
          Object.freeze({
            intersectionId: junction.id,
            id: zone.id,
            polygonM: polygon(zone.geometryId),
            declaredMovementIds: Object.freeze(
              ordered.filter((m) => m.conflictZoneIds.includes(zone.id)).map((m) => m.id),
            ),
          }),
        ),
      ),
    );
    zoneCount += junction.conflictZones.length;
    for (const movement of ordered) {
      const record = Object.freeze({
        intersectionId: junction.id,
        movement,
        trajectoryM: trajectory(movement.geometryId),
        corridorHalfWidthM:
          Math.max(lanes.get(movement.fromLaneId)!.widthM, lanes.get(movement.toLaneId)!.widthM) /
          2,
      });
      movements.set(key(junction.id, movement.id), record);
      incompatible.set(key(junction.id, movement.id), []);
    }
    for (let i = 0; i < ordered.length; i++)
      for (let j = i + 1; j < ordered.length; j++) {
        const a = ordered[i],
          b = ordered[j],
          first = movements.get(key(junction.id, a.id))!,
          second = movements.get(key(junction.id, b.id))!;
        const sharedZoneIds = Object.freeze(
          a.conflictZoneIds.filter((id) => b.conflictZoneIds.includes(id)).sort(),
        );
        const contact = intersectionEnvelopeContact(
          first.trajectoryM,
          second.trajectoryM,
          first.corridorHalfWidthM + second.corridorHalfWidthM,
          tolerance,
          admit,
        );
        const reasons: IntersectionConflictReason[] = [];
        if (sharedZoneIds.length) reasons.push('SHARED_ZONE');
        if (a.fromLaneId === b.fromLaneId) reasons.push('SHARED_ENTRY');
        if (a.toLaneId === b.toLaneId) reasons.push('SHARED_EXIT');
        if (contact) reasons.push('TRAJECTORY_ENVELOPES');
        const relation: IntersectionConflictRelation = Object.freeze({
          id: `conflict:${pairKey(junction.id, a.id, b.id)}`,
          intersectionId: junction.id,
          movementIds: Object.freeze([a.id, b.id]) as readonly [string, string],
          incompatible: reasons.length > 0,
          reasons: Object.freeze(reasons),
          sharedZoneIds,
          geometricContact: contact,
          priority: null,
        });
        relations.set(pairKey(junction.id, a.id, b.id), relation);
        if (relation.incompatible) {
          incompatiblePairs++;
          incompatible.get(key(junction.id, a.id))!.push(relation);
          incompatible.get(key(junction.id, b.id))!.push(relation);
        }
      }
  }
  for (const list of incompatible.values()) Object.freeze(list);
  const stats = Object.freeze({
    movements: movements.size,
    zones: zoneCount,
    pairRelations: relations.size,
    incompatiblePairs,
    segmentComparisons,
    uniqueTrajectoryGeometries: pathPoints.size,
    uniqueZoneGeometries: areaPoints.size,
  });
  return Object.freeze({
    mapId: map.mapId,
    getMovement: (id: string, m: string) => movements.get(key(id, m)) ?? null,
    getZones: (id: string) => zones.get(id) ?? EMPTY,
    getRelation: (id: string, a: string, b: string) => relations.get(pairKey(id, a, b)) ?? null,
    getIncompatible: (id: string, m: string) => incompatible.get(key(id, m)) ?? EMPTY,
    getStats: () => stats,
  });
}
