import { fields, list, nullable, requireContract, text } from '../sessions';
import { parseRoadMap } from './parser';
import {
  createIntersectionConflicts,
  INTERSECTION_CONFLICT_LIMITS,
} from './intersection-conflicts';
import type { IntersectionConflicts } from './intersection-conflicts';
export interface MapPriorityRule {
  readonly intersectionId: string;
  readonly movementIds: readonly [string, string];
  /** null explicitly means equal/unresolved priority, not either movement winning. */
  readonly priorityMovementId: string | null;
}
export interface MapPriorityPolicy {
  readonly schemaVersion: 1;
  readonly units: 'SI';
  readonly mapId: string;
  readonly versionId: string;
  readonly rules: readonly MapPriorityRule[];
}
function id(value: unknown): string {
  const result = text(value);
  requireContract(
    result.length <= 128 && result === result.trim(),
    'Priority ID must be trimmed and at most128characters',
  );
  return result;
}
const key = (intersection: string, a: string, b: string) =>
  JSON.stringify([intersection, ...[a, b].sort()]);
/** Strict exhaustive sidecar: schema032 intentionally has no priority field. */
export function parseMapPriorityPolicy(
  input: unknown,
  mapInput: unknown,
): { readonly policy: MapPriorityPolicy; readonly conflicts: IntersectionConflicts } {
  const map = parseRoadMap(mapInput),
    conflicts = createIntersectionConflicts(map);
  const data = fields(input, ['schemaVersion', 'units', 'mapId', 'versionId', 'rules']);
  requireContract(
    data.schemaVersion === 1 && data.units === 'SI',
    'Unsupported priority policy version/units',
  );
  const mapId = id(data.mapId);
  requireContract(mapId === map.mapId, 'Priority policy mapId mismatch');
  const expected = new Set<string>();
  for (const junction of map.intersections)
    for (const movement of junction.movements)
      for (const relation of conflicts.getIncompatible(junction.id, movement.id))
        expected.add(relation.id);
  requireContract(
    Array.isArray(data.rules) && data.rules.length <= INTERSECTION_CONFLICT_LIMITS.pairRelations,
    'Priority policy rule capacity exceeded',
  );
  const seen = new Set<string>();
  const rules = list(data.rules, (value) => {
    const record = fields(value, ['intersectionId', 'movementIds', 'priorityMovementId']);
    const intersectionId = id(record.intersectionId);
    requireContract(
      Array.isArray(record.movementIds) && record.movementIds.length === 2,
      'Priority rule requires two movement IDs',
    );
    const ids = list(record.movementIds, id);
    requireContract(ids[0] !== ids[1], 'Priority pair must be distinct');
    const movementIds = Object.freeze([...ids].sort()) as readonly [string, string];
    const relation = conflicts.getRelation(intersectionId, movementIds[0], movementIds[1]);
    requireContract(
      relation !== null && relation.incompatible,
      'Priority rule requires known incompatible movements',
    );
    const identity = key(intersectionId, movementIds[0], movementIds[1]);
    requireContract(!seen.has(identity), 'Duplicate/contradictory priority pair');
    seen.add(identity);
    expected.delete(relation.id);
    const priorityMovementId = nullable(record.priorityMovementId, id);
    requireContract(
      priorityMovementId === null || movementIds.includes(priorityMovementId),
      'Priority winner must belong to pair',
    );
    return Object.freeze({
      intersectionId,
      movementIds,
      priorityMovementId,
    });
  });
  requireContract(
    expected.size === 0,
    `Priority policy incomplete: ${expected.size} conflict pairs omitted`,
  );
  const policy: MapPriorityPolicy = Object.freeze({
    schemaVersion: 1,
    units: 'SI',
    mapId,
    versionId: id(data.versionId),
    rules: Object.freeze(
      [...rules].sort((a, b) =>
        key(a.intersectionId, ...a.movementIds) < key(b.intersectionId, ...b.movementIds) ? -1 : 1,
      ),
    ),
  });
  return Object.freeze({ policy, conflicts });
}
