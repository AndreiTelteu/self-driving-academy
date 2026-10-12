import { choice, fields, list, nullable, number, requireContract, text } from '../sessions';
import { at, ensure, MapValidationError } from './errors';
import { validateSemantics } from './semantics';
import type { Vector3 } from '../vehicles';
import type { RoadMap } from './schema';
export const mapSchemaLimits = Object.freeze({
  arrayEntries: 8192,
  totalArrayEntries: 65536,
  idLength: 128,
  lanes: 2048,
  intersections: 256,
  signals: 256,
  serviceZones: 256,
  movementsPerIntersection: 128,
  conflictsPerIntersection: 128,
  phasesPerSignal: 128,
  coordinateM: 1_000_000,
});
type Reader<T> = (value: unknown, path: string) => T;
function id(value: unknown): string {
  const result = text(value);
  requireContract(
    result.length <= mapSchemaLimits.idLength && result === result.trim(),
    'Expected trimmed ID of at most 128 characters',
  );
  return result;
}
const identifier: Reader<string> = (value) => id(value);
function positive(max: number): Reader<number> {
  return (value) => {
    const result = number(value, 0, max);
    requireContract(result > 0, 'Expected positive quantity');
    return result;
  };
}
const access: Reader<'TAXI' | 'CIVIL'> = (value) => choice(value, ['TAXI', 'CIVIL']);
function object<T>(
  value: unknown,
  path: string,
  keys: readonly string[],
  build: (field: <U>(key: string, reader: Reader<U>) => U) => T,
): T {
  return at(path, () => {
    const data = fields(value, keys);
    try {
      return Object.freeze(
        build((key, reader) => at(`${path}.${key}`, () => reader(data[key], `${path}.${key}`))),
      );
    } catch (error) {
      if (
        error instanceof MapValidationError &&
        error.id === null &&
        typeof data.id === 'string' &&
        data.id.length > 0 &&
        data.id.length <= mapSchemaLimits.idLength &&
        data.id === data.id.trim()
      )
        throw new MapValidationError(error.path, error.reason, data.id, error.positionM);
      throw error;
    }
  });
}
function vector(value: unknown, path: string): Vector3 {
  const coordinate: Reader<number> = (entry) =>
    number(entry, -mapSchemaLimits.coordinateM, mapSchemaLimits.coordinateM);
  return object(value, path, ['x', 'y', 'z'], (f) => ({
    x: f('x', coordinate),
    y: f('y', coordinate),
    z: f('z', coordinate),
  }));
}
export function parseRoadMap(value: unknown): RoadMap {
  let entries = 0;
  function array<T>(reader: Reader<T>, minimum = 0): Reader<readonly T[]> {
    return (input, path) =>
      at(path, () => {
        requireContract(Array.isArray(input), 'Expected array');
        requireContract(
          input.length >= minimum && input.length <= mapSchemaLimits.arrayEntries,
          'Array capacity or minimum length violated',
        );
        entries += input.length;
        requireContract(
          entries <= mapSchemaLimits.totalArrayEntries,
          'Map array entry capacity exceeded',
        );
        let index = 0;
        return list(input, (entry) => {
          const current = index++;
          return at(`${path}[${current}]`, () => reader(entry, `${path}[${current}]`));
        });
      });
  }
  const ids = array(identifier);
  const optionalId: Reader<string | null> = (input) => nullable(input, id);
  const accesses = array(access, 1);
  const node: Reader<RoadMap['geometry']['nodes'][number]> = (input, path) =>
    object(input, path, ['id', 'positionM'], (f) => ({
      id: f('id', identifier),
      positionM: f('positionM', vector),
    }));
  const pathGeometry: Reader<RoadMap['geometry']['paths'][number]> = (input, path) =>
    object(input, path, ['id', 'nodeIds'], (f) => ({
      id: f('id', identifier),
      nodeIds: f('nodeIds', array(identifier, 2)),
    }));
  const area: Reader<RoadMap['geometry']['areas'][number]> = (input, path) =>
    object(input, path, ['id', 'vertexNodeIds'], (f) => ({
      id: f('id', identifier),
      vertexNodeIds: f('vertexNodeIds', array(identifier, 3)),
    }));
  const lane: Reader<RoadMap['lanes'][number]> = (input, path) =>
    object(
      input,
      path,
      [
        'id',
        'geometryId',
        'direction',
        'widthM',
        'speedLimitMps',
        'access',
        'neighbors',
        'successorIds',
        'fromIntersectionId',
        'toIntersectionId',
      ],
      (f) => ({
        id: f('id', identifier),
        geometryId: f('geometryId', identifier),
        direction: f('direction', (v) => choice(v, ['FORWARD', 'REVERSE'])),
        widthM: f('widthM', positive(100)),
        speedLimitMps: f('speedLimitMps', positive(200)),
        access: f('access', accesses),
        neighbors: f('neighbors', (v, p) =>
          object(v, p, ['left', 'right'], (g) => ({
            left: g('left', optionalId),
            right: g('right', optionalId),
          })),
        ),
        successorIds: f('successorIds', ids),
        fromIntersectionId: f('fromIntersectionId', optionalId),
        toIntersectionId: f('toIntersectionId', optionalId),
      }),
    );
  const movement: Reader<RoadMap['intersections'][number]['movements'][number]> = (input, path) =>
    object(input, path, ['id', 'geometryId', 'fromLaneId', 'toLaneId', 'conflictZoneIds'], (f) => ({
      id: f('id', identifier),
      geometryId: f('geometryId', identifier),
      fromLaneId: f('fromLaneId', identifier),
      toLaneId: f('toLaneId', identifier),
      conflictZoneIds: f('conflictZoneIds', ids),
    }));
  const intersection: Reader<RoadMap['intersections'][number]> = (input, path) =>
    object(
      input,
      path,
      ['id', 'geometryId', 'incomingLaneIds', 'outgoingLaneIds', 'conflictZones', 'movements'],
      (f) => ({
        id: f('id', identifier),
        geometryId: f('geometryId', identifier),
        incomingLaneIds: f('incomingLaneIds', array(identifier, 1)),
        outgoingLaneIds: f('outgoingLaneIds', array(identifier, 1)),
        conflictZones: f(
          'conflictZones',
          array((v, p) =>
            object(v, p, ['id', 'geometryId'], (g) => ({
              id: g('id', identifier),
              geometryId: g('geometryId', identifier),
            })),
          ),
        ),
        movements: f('movements', array(movement, 1)),
      }),
    );
  const signal: Reader<RoadMap['signals'][number]> = (input, path) =>
    object(input, path, ['id', 'intersectionId', 'phases'], (f) => ({
      id: f('id', identifier),
      intersectionId: f('intersectionId', identifier),
      phases: f(
        'phases',
        array(
          (v, p) =>
            object(v, p, ['id', 'durationS', 'movementStates'], (g) => ({
              id: g('id', identifier),
              durationS: g('durationS', positive(86400)),
              movementStates: g(
                'movementStates',
                array(
                  (w, q) =>
                    object(w, q, ['movementId', 'state'], (h) => ({
                      movementId: h('movementId', identifier),
                      state: h('state', (s) => choice(s, ['RED', 'YELLOW', 'GREEN'])),
                    })),
                  1,
                ),
              ),
            })),
          1,
        ),
      ),
    }));
  const stop: Reader<RoadMap['stopLines'][number]> = (input, path) =>
    object(
      input,
      path,
      ['id', 'geometryId', 'laneId', 'anchorNodeId', 'kind', 'intersectionId', 'signalId'],
      (f) => ({
        id: f('id', identifier),
        geometryId: f('geometryId', identifier),
        laneId: f('laneId', identifier),
        anchorNodeId: f('anchorNodeId', identifier),
        kind: f('kind', (v) => choice(v, ['STOP', 'SIGNAL', 'CROSSWALK'])),
        intersectionId: f('intersectionId', optionalId),
        signalId: f('signalId', optionalId),
      }),
    );
  const crosswalk: Reader<RoadMap['crosswalks'][number]> = (input, path) =>
    object(input, path, ['id', 'geometryId', 'laneIds', 'stopLineIds'], (f) => ({
      id: f('id', identifier),
      geometryId: f('geometryId', identifier),
      laneIds: f('laneIds', array(identifier, 1)),
      stopLineIds: f('stopLineIds', array(identifier, 1)),
    }));
  const service: Reader<RoadMap['serviceZones'][number]> = (input, path) =>
    object(input, path, ['id', 'geometryId', 'laneId', 'anchorNodeId', 'access', 'kind'], (f) => ({
      id: f('id', identifier),
      geometryId: f('geometryId', identifier),
      laneId: f('laneId', identifier),
      anchorNodeId: f('anchorNodeId', identifier),
      access: f('access', accesses),
      kind: f('kind', (v) => choice(v, ['PICKUP', 'DROPOFF', 'BOTH'])),
    }));
  const recovery: Reader<RoadMap['recoveryPoints'][number]> = (input, path) =>
    object(input, path, ['id', 'nodeId', 'laneId', 'headingRad'], (f) => ({
      id: f('id', identifier),
      nodeId: f('nodeId', identifier),
      laneId: f('laneId', identifier),
      headingRad: f('headingRad', (v) => number(v, -Math.PI, Math.PI)),
    }));
  const result = object<RoadMap>(
    value,
    'map',
    [
      'schemaVersion',
      'units',
      'mapId',
      'bounds',
      'geometry',
      'lanes',
      'intersections',
      'signals',
      'stopLines',
      'crosswalks',
      'serviceZones',
      'recoveryPoints',
    ],
    (f) => ({
      schemaVersion: f('schemaVersion', (v) => {
        ensure(v === 1, 'map.schemaVersion', 'Unsupported schema version');
        return 1;
      }),
      units: f('units', (v) => {
        ensure(v === 'SI', 'map.units', 'Unsupported units');
        return 'SI';
      }),
      mapId: f('mapId', identifier),
      bounds: f('bounds', (v, p) =>
        object(v, p, ['minM', 'maxM'], (g) => ({
          minM: g('minM', vector),
          maxM: g('maxM', vector),
        })),
      ),
      geometry: f('geometry', (v, p) =>
        object(v, p, ['nodes', 'paths', 'areas'], (g) => ({
          nodes: g('nodes', array(node, 2)),
          paths: g('paths', array(pathGeometry, 1)),
          areas: g('areas', array(area)),
        })),
      ),
      lanes: f('lanes', array(lane, 1)),
      intersections: f('intersections', array(intersection)),
      signals: f('signals', array(signal)),
      stopLines: f('stopLines', array(stop)),
      crosswalks: f('crosswalks', array(crosswalk)),
      serviceZones: f('serviceZones', array(service, 1)),
      recoveryPoints: f('recoveryPoints', array(recovery)),
    }),
  );
  ensure(result.lanes.length <= mapSchemaLimits.lanes, 'map.lanes', 'Lane capacity 2048 exceeded');
  ensure(
    result.intersections.length <= mapSchemaLimits.intersections,
    'map.intersections',
    'Intersection capacity 256 exceeded',
  );
  ensure(
    result.signals.length <= mapSchemaLimits.signals,
    'map.signals',
    'Signal capacity 256 exceeded',
  );
  ensure(
    result.serviceZones.length <= mapSchemaLimits.serviceZones,
    'map.serviceZones',
    'Service capacity 256 exceeded',
  );
  for (const [i, junction] of result.intersections.entries())
    ensure(
      junction.movements.length <= mapSchemaLimits.movementsPerIntersection &&
        junction.conflictZones.length <= mapSchemaLimits.conflictsPerIntersection,
      `map.intersections[${i}]`,
      'Movement/conflict capacity 128 exceeded',
      junction.id,
    );
  for (const [i, signal] of result.signals.entries())
    ensure(
      signal.phases.length <= mapSchemaLimits.phasesPerSignal,
      `map.signals[${i}].phases`,
      'Phase capacity 128 exceeded',
      signal.id,
    );
  validateSemantics(result);
  return result;
}
