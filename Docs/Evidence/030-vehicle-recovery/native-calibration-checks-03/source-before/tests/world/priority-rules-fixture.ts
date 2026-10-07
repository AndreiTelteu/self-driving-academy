import { createIntersectionConflicts } from '../../src/world/intersection-conflicts';
import type { MapPriorityPolicy } from '../../src/world/priority-policy';
import type { PriorityObservation } from '../../src/world/priority-rules';
import { intersectionConflictFixture } from './intersection-conflicts-fixture';
import type { Mutable } from './negative-fixtures';
const standardConflicts = createIntersectionConflicts(intersectionConflictFixture());
const standardRelationId = standardConflicts.getRelation(
  'junction',
  'west-straight',
  'south-straight',
)!.id;
export function priorityFixture(kind: 'T' | 'CROSS' = 'CROSS') {
  const map = intersectionConflictFixture(kind),
    conflicts = createIntersectionConflicts(map),
    seen = new Set<string>();
  const rules: Mutable<MapPriorityPolicy>['rules'] = [];
  for (const movement of map.intersections[0].movements)
    for (const relation of conflicts.getIncompatible('junction', movement.id)) {
      if (seen.has(relation.id)) continue;
      seen.add(relation.id);
      rules.push({
        intersectionId: 'junction',
        movementIds: [...relation.movementIds],
        priorityMovementId: relation.movementIds[0],
      });
    }
  const policy: Mutable<MapPriorityPolicy> = {
    schemaVersion: 1,
    units: 'SI',
    mapId: map.mapId,
    versionId: 'priority-cross-v1',
    rules,
  };
  return { map, policy };
}
export function priorityObservation(
  tick: number,
  sessionId = 'priority-test',
): Mutable<PriorityObservation> {
  const relationId = standardRelationId;
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId,
    worldEpoch: 0,
    tick,
    trafficComplete: true,
    discontinuity: false,
    subject: {
      vehicleId: 'subject',
      incarnation: 'subject-1',
      intersectionId: 'junction',
      movementId: 'west-straight',
      speedMps: 0,
      active: true,
      observable: true,
      conflictDistances: [{ relationId, distanceM: 1, clearanceM: 4 }],
    },
    traffic: [
      {
        vehicleId: 'other',
        incarnation: 'other-1',
        intersectionId: 'junction',
        movementId: 'south-straight',
        speedMps: 5,
        active: true,
        observable: true,
        conflictDistances: [{ relationId, distanceM: 10, clearanceM: 4 }],
      },
    ],
  };
}
