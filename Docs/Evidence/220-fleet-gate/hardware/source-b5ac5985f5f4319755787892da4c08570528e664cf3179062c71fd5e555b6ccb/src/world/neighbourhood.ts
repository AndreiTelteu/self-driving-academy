import { parseRoadMap } from './parser';
import { createIntersectionConflicts } from './intersection-conflicts';
import type {
  Crosswalk,
  GeometryArea,
  GeometryNode,
  GeometryPath,
  Intersection,
  Lane,
  Movement,
  RecoveryPoint,
  RoadMap,
  RoadSignal,
  ServiceZone,
  SignalPhase,
  StopLine,
} from './schema';
import type { Vector3 } from '../vehicles';

/**
 * Authored compact American neighbourhood used by the V1 city presentation.
 *
 * This document is game content: it is the authoritative PBI032 map. It is generated from an
 * explicit street grid so that every node/path/area ID is reproducible, but no rendering code
 * reads this generator. Presentation derives exclusively from the returned `RoadMap` through
 * `createCityLayout`, so the visual layout cannot drift from the simulation data.
 *
 * Road context comes from the map itself: speed limits identify arterial (30 mph) and residential
 * (25 mph) streets, junction records plus STOP/SIGNAL lines classify every intersection, and the
 * service zones, stop lines and crosswalks are ordinary schema entities.
 */
export const NEIGHBOURHOOD_MAP_ID = 'neighbourhood-compact-v1';

/** Street centre lines in metres (X for columns, Z for rows): 16 blocks inside 720 m. */
const COLUMNS_M = [0, 180, 360, 540, 720] as const;
const ROWS_M = [0, 180, 360, 540, 720] as const;
const ARTERIAL_COLUMNS = [2] as const;
const ARTERIAL_ROWS = [2] as const;
/** Junction grid positions that carry a signal program / STOP signs. */
const SIGNALIZED_JUNCTIONS = [
  [2, 2],
  [2, 1],
  [2, 3],
  [1, 2],
] as const;
const STOP_CONTROLLED_JUNCTIONS = [
  [1, 1],
  [3, 1],
  [1, 3],
  [3, 3],
] as const;

const LANE_WIDTH_M = 3.4;
const LANE_GAP_M = 0.3;
const CENTER_BUFFER_M = 0.4;
const ARTERIAL_LANES_PER_DIRECTION = 2;
const LOCAL_LANES_PER_DIRECTION = 1;
const ARTERIAL_SPEED_LIMIT_MPS = 13.4;
const LOCAL_SPEED_LIMIT_MPS = 11.2;
/** Distance from the junction edge to the crosswalk paint/lines. */
const CROSSWALK_OFFSET_M = 3.6;
/** Distance from the junction edge to the STOP/SIGNAL line. */
const STOP_LINE_OFFSET_M = 8.5;
const SERVICE_ZONE_HALF_LENGTH_M = 2.75;
const SERVICE_ZONE_DEPTH_M = 2.8;
const BOUNDS_MARGIN_M = 40;

type Direction = 'EAST' | 'WEST' | 'NORTH' | 'SOUTH';
const DIRECTIONS: readonly Direction[] = ['EAST', 'WEST', 'NORTH', 'SOUTH'];
const OPPOSITE: Readonly<Record<Direction, Direction>> = Object.freeze({
  EAST: 'WEST',
  WEST: 'EAST',
  NORTH: 'SOUTH',
  SOUTH: 'NORTH',
});
const VECTOR: Readonly<Record<Direction, { readonly x: number; readonly z: number }>> =
  Object.freeze({
    EAST: { x: 1, z: 0 },
    WEST: { x: -1, z: 0 },
    NORTH: { x: 0, z: 1 },
    SOUTH: { x: 0, z: -1 },
  });
const AXIS: Readonly<Record<Direction, 'X' | 'Z'>> = Object.freeze({
  EAST: 'X',
  WEST: 'X',
  NORTH: 'Z',
  SOUTH: 'Z',
});
const DIRECTION_CODE: Readonly<Record<Direction, string>> = Object.freeze({
  EAST: 'E',
  WEST: 'W',
  NORTH: 'N',
  SOUTH: 'S',
});
/** Map-plane heading of travel: zero is +X, positive angles rotate toward +Z. */
const HEADING: Readonly<Record<Direction, number>> = Object.freeze({
  EAST: 0,
  WEST: Math.PI,
  NORTH: Math.PI / 2,
  SOUTH: -Math.PI / 2,
});
/** Right of travel in a Y-up scene: right = up x forward. */
const RIGHT: Readonly<Record<Direction, { readonly x: number; readonly z: number }>> =
  Object.freeze({
    EAST: { x: 0, z: -1 },
    WEST: { x: 0, z: 1 },
    NORTH: { x: 1, z: 0 },
    SOUTH: { x: -1, z: 0 },
  });

const LAST_COLUMN = COLUMNS_M.length - 1;
const LAST_ROW = ROWS_M.length - 1;

function arterialColumn(column: number): boolean {
  return (ARTERIAL_COLUMNS as readonly number[]).includes(column);
}
function arterialRow(row: number): boolean {
  return (ARTERIAL_ROWS as readonly number[]).includes(row);
}
function lanesPerDirection(arterial: boolean): number {
  return arterial ? ARTERIAL_LANES_PER_DIRECTION : LOCAL_LANES_PER_DIRECTION;
}
/** Lateral offsets of lane centres from the street centre line, inner lane first. */
function laneOffsets(arterial: boolean): number[] {
  const offsets: number[] = [];
  for (let index = 0; index < lanesPerDirection(arterial); index += 1)
    offsets.push(CENTER_BUFFER_M + LANE_WIDTH_M / 2 + index * (LANE_WIDTH_M + LANE_GAP_M));
  return offsets;
}
function streetHalfWidth(arterial: boolean): number {
  const offsets = laneOffsets(arterial);
  return offsets[offsets.length - 1]! + LANE_WIDTH_M / 2;
}
function halfWidthX(column: number): number {
  return streetHalfWidth(arterialColumn(column));
}
function halfWidthZ(row: number): number {
  return streetHalfWidth(arterialRow(row));
}
function junctionId(column: number, row: number): string {
  return `ix:${column}-${row}`;
}
function isSignalized(column: number, row: number): boolean {
  return SIGNALIZED_JUNCTIONS.some(([c, r]) => c === column && r === row);
}
function isStopControlled(column: number, row: number): boolean {
  return STOP_CONTROLLED_JUNCTIONS.some(([c, r]) => c === column && r === row);
}
function point(x: number, z: number): Vector3 {
  return Object.freeze({ x, y: 0, z });
}

interface LaneRecord {
  readonly lane: Lane;
  readonly direction: Direction;
  readonly token: string;
  /** Directed path points in travel order. */
  readonly points: readonly Vector3[];
  /** Directed path node IDs in travel order (same length as `points`). */
  readonly nodeIds: readonly string[];
}

/** Deterministic authored neighbourhood: 25 junctions, 96 directed lanes, 64 crosswalks. */
export function createNeighbourhoodMap(): RoadMap {
  const nodes: GeometryNode[] = [];
  const paths: GeometryPath[] = [];
  const areas: GeometryArea[] = [];
  const lanes: Lane[] = [];
  const successors = new Map<string, string[]>();
  const movementsByJunction = new Map<string, Movement[]>();
  const stopLines: StopLine[] = [];
  const crosswalks: Crosswalk[] = [];
  const serviceZones: ServiceZone[] = [];
  const recoveryPoints: RecoveryPoint[] = [];
  const records: LaneRecord[] = [];
  const directions = new Map<string, Direction>();

  const addNode = (id: string, x: number, z: number): string => {
    nodes.push(Object.freeze({ id, positionM: point(x, z) }));
    return id;
  };
  const addPath = (id: string, nodeIds: readonly string[]): string => {
    paths.push(Object.freeze({ id, nodeIds: Object.freeze([...nodeIds]) }));
    return id;
  };
  const addArea = (id: string, vertexNodeIds: readonly string[]): string => {
    areas.push(Object.freeze({ id, vertexNodeIds: Object.freeze([...vertexNodeIds]) }));
    return id;
  };

  /** Straight directed lane between two junctions on one street. */
  const addStraightLane = (args: {
    readonly column: number;
    readonly row: number;
    readonly direction: Direction;
    readonly index: number;
    readonly arterial: boolean;
    readonly crossCenter: number;
    readonly startEdge: number;
    readonly endEdge: number;
    readonly from: readonly [number, number];
    readonly to: readonly [number, number];
  }): LaneRecord => {
    const axis = AXIS[args.direction];
    const sign = VECTOR[args.direction][axis === 'X' ? 'x' : 'z'];
    const token = `${args.column}${args.row}${DIRECTION_CODE[args.direction]}${args.index}`;
    const laneId = `lane:${token}`;
    const start = args.startEdge;
    const end = args.endEdge;
    const cross = args.crossCenter;
    const along = [
      start,
      start + sign * CROSSWALK_OFFSET_M,
      (start + end) / 2,
      end - sign * STOP_LINE_OFFSET_M,
      end - sign * CROSSWALK_OFFSET_M,
      end,
    ];
    const nodeIds = along.map((position, order) => {
      const id = `n:${laneId}:${order}`;
      return axis === 'X' ? addNode(id, position, cross) : addNode(id, cross, position);
    });
    const points = along.map((position) =>
      axis === 'X' ? point(position, cross) : point(cross, position),
    );
    const geometryId = addPath(`g:${laneId}`, nodeIds);
    const lane: Lane = Object.freeze({
      id: laneId,
      geometryId,
      direction: 'FORWARD',
      widthM: LANE_WIDTH_M,
      speedLimitMps: args.arterial ? ARTERIAL_SPEED_LIMIT_MPS : LOCAL_SPEED_LIMIT_MPS,
      access: Object.freeze(['TAXI', 'CIVIL'] as const),
      neighbors: Object.freeze({ left: null, right: null }),
      successorIds: Object.freeze([]),
      fromIntersectionId: junctionId(args.from[0], args.from[1]),
      toIntersectionId: junctionId(args.to[0], args.to[1]),
    });
    const record: LaneRecord = {
      lane,
      direction: args.direction,
      token,
      points,
      nodeIds,
    };
    records.push(record);
    lanes.push(lane);
    successors.set(laneId, []);
    directions.set(laneId, args.direction);
    return record;
  };

  // Horizontal streets: one lane set per segment on every row.
  for (let row = 0; row <= LAST_ROW; row += 1) {
    const arterial = arterialRow(row);
    const offsets = laneOffsets(arterial);
    for (let column = 0; column < LAST_COLUMN; column += 1)
      for (const direction of ['EAST', 'WEST'] as const) {
        const east = direction === 'EAST';
        const startEdge = east
          ? COLUMNS_M[column] + halfWidthX(column)
          : COLUMNS_M[column + 1] - halfWidthX(column + 1);
        const endEdge = east
          ? COLUMNS_M[column + 1] - halfWidthX(column + 1)
          : COLUMNS_M[column] + halfWidthX(column);
        offsets.forEach((offset, index) => {
          addStraightLane({
            column,
            row,
            direction,
            index,
            arterial,
            crossCenter: ROWS_M[row] + (east ? -1 : 1) * offset,
            startEdge,
            endEdge,
            from: east ? [column, row] : [column + 1, row],
            to: east ? [column + 1, row] : [column, row],
          });
        });
      }
  }
  // Vertical streets: one lane set per segment on every column.
  for (let column = 0; column <= LAST_COLUMN; column += 1) {
    const arterial = arterialColumn(column);
    const offsets = laneOffsets(arterial);
    for (let row = 0; row < LAST_ROW; row += 1)
      for (const direction of ['NORTH', 'SOUTH'] as const) {
        const north = direction === 'NORTH';
        const startEdge = north
          ? ROWS_M[row] + halfWidthZ(row)
          : ROWS_M[row + 1] - halfWidthZ(row + 1);
        const endEdge = north
          ? ROWS_M[row + 1] - halfWidthZ(row + 1)
          : ROWS_M[row] + halfWidthZ(row);
        offsets.forEach((offset, index) => {
          addStraightLane({
            column,
            row,
            direction,
            index,
            arterial,
            crossCenter: COLUMNS_M[column] + (north ? 1 : -1) * offset,
            startEdge,
            endEdge,
            from: north ? [column, row] : [column, row + 1],
            to: north ? [column, row + 1] : [column, row],
          });
        });
      }
  }

  // Neighbours: on the arterial the outer lane sits on the right of the inner lane.
  const recordByToken = new Map(records.map((record) => [record.token, record]));
  for (let column = 0; column <= LAST_COLUMN; column += 1)
    for (let row = 0; row <= LAST_ROW; row += 1)
      for (const direction of DIRECTIONS) {
        if (AXIS[direction] === 'X' && !arterialRow(row)) continue;
        if (AXIS[direction] === 'Z' && !arterialColumn(column)) continue;
        const inner = recordByToken.get(`${column}${row}${DIRECTION_CODE[direction]}0`);
        const outer = recordByToken.get(`${column}${row}${DIRECTION_CODE[direction]}1`);
        if (!inner || !outer) continue;
        lanes[lanes.indexOf(inner.lane)] = Object.freeze({
          ...inner.lane,
          neighbors: Object.freeze({ left: null, right: outer.lane.id }),
        });
        lanes[lanes.indexOf(outer.lane)] = Object.freeze({
          ...outer.lane,
          neighbors: Object.freeze({ left: inner.lane.id, right: null }),
        });
      }

  /** Quadrant conflict zones touched by a movement polyline (declared conflict context). */
  const segmentHitsBox = (
    a: Vector3,
    b: Vector3,
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
  ): boolean => {
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const clip = (p: number, q: number): boolean => {
      if (p === 0) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    };
    if (!clip(-dx, a.x - minX)) return false;
    if (!clip(dx, maxX - a.x)) return false;
    if (!clip(-dz, a.z - minZ)) return false;
    if (!clip(dz, maxZ - a.z)) return false;
    return t0 <= t1 + 1e-12;
  };

  const recordById = (id: string): LaneRecord => {
    const record = records.find((candidate) => candidate.lane.id === id);
    if (!record) throw new Error(`Unknown authored lane ${id}`);
    return record;
  };

  // Junction records: area, four conflict quadrants and movement geometry.
  const intersections: Intersection[] = [];
  for (let column = 0; column <= LAST_COLUMN; column += 1)
    for (let row = 0; row <= LAST_ROW; row += 1) {
      const x = COLUMNS_M[column];
      const z = ROWS_M[row];
      const hx = halfWidthX(column);
      const hz = halfWidthZ(row);
      const id = junctionId(column, row);
      const geometryId = addArea(`a:${id}`, [
        addNode(`n:${id}:0`, x - hx, z - hz),
        addNode(`n:${id}:1`, x + hx, z - hz),
        addNode(`n:${id}:2`, x + hx, z + hz),
        addNode(`n:${id}:3`, x - hx, z + hz),
      ]);
      const quadrants = [
        { key: 'NE', minX: x, maxX: x + hx, minZ: z, maxZ: z + hz },
        { key: 'NW', minX: x - hx, maxX: x, minZ: z, maxZ: z + hz },
        { key: 'SW', minX: x - hx, maxX: x, minZ: z - hz, maxZ: z },
        { key: 'SE', minX: x, maxX: x + hx, minZ: z - hz, maxZ: z },
      ];
      const conflictZones = quadrants.map((quadrant) => {
        const zoneId = `cz:${column}-${row}:${quadrant.key}`;
        addArea(`a:${zoneId}`, [
          addNode(`n:${zoneId}:0`, quadrant.minX, quadrant.minZ),
          addNode(`n:${zoneId}:1`, quadrant.maxX, quadrant.minZ),
          addNode(`n:${zoneId}:2`, quadrant.maxX, quadrant.maxZ),
          addNode(`n:${zoneId}:3`, quadrant.minX, quadrant.maxZ),
        ]);
        return Object.freeze({ id: zoneId, geometryId: `a:${zoneId}` });
      });
      const incomingLaneIds = records
        .filter((record) => record.lane.toIntersectionId === id)
        .map((record) => record.lane.id);
      const outgoingLaneIds = records
        .filter((record) => record.lane.fromIntersectionId === id)
        .map((record) => record.lane.id);
      const movements: Movement[] = [];
      movementsByJunction.set(id, movements);
      for (const fromId of incomingLaneIds) {
        const from = recordById(fromId);
        for (const toId of outgoingLaneIds) {
          const to = recordById(toId);
          if (to.direction === OPPOSITE[from.direction]) continue;
          const fromEnd = from.points[from.points.length - 1]!;
          const toStart = to.points[0]!;
          const startNodeId = from.nodeIds[from.nodeIds.length - 1]!;
          const endNodeId = to.nodeIds[0]!;
          const movementId = `mv:${column}-${row}:${from.token}>${to.token}`;
          const movementPoints: Vector3[] = [fromEnd];
          const nodeIds: string[] = [startNodeId];
          if (from.direction === to.direction) {
            movementPoints.push(toStart);
            nodeIds.push(endNodeId);
          } else {
            const control =
              AXIS[from.direction] === 'X'
                ? point(toStart.x, fromEnd.z)
                : point(fromEnd.x, toStart.z);
            for (const t of [0.25, 0.5, 0.75]) {
              const inverse = 1 - t;
              const sample = point(
                inverse * inverse * fromEnd.x + 2 * inverse * t * control.x + t * t * toStart.x,
                inverse * inverse * fromEnd.z + 2 * inverse * t * control.z + t * t * toStart.z,
              );
              const nodeId = `n:mv:${column}-${row}:${from.token}>${to.token}:${t}`;
              addNode(nodeId, sample.x, sample.z);
              movementPoints.push(sample);
              nodeIds.push(nodeId);
            }
            movementPoints.push(toStart);
            nodeIds.push(endNodeId);
          }
          const geometryId = addPath(`g:${movementId}`, nodeIds);
          const conflictZoneIds = quadrants
            .filter((quadrant) =>
              movementPoints.some((sample, index) =>
                index === 0
                  ? false
                  : segmentHitsBox(
                      movementPoints[index - 1]!,
                      sample,
                      quadrant.minX,
                      quadrant.maxX,
                      quadrant.minZ,
                      quadrant.maxZ,
                    ),
              ),
            )
            .map((quadrant) => `cz:${column}-${row}:${quadrant.key}`);
          movements.push(
            Object.freeze({
              id: movementId,
              geometryId,
              fromLaneId: fromId,
              toLaneId: toId,
              conflictZoneIds: Object.freeze(conflictZoneIds),
            }),
          );
          successors.get(fromId)!.push(toId);
        }
      }
      intersections.push(
        Object.freeze({
          id,
          geometryId,
          incomingLaneIds: Object.freeze(incomingLaneIds),
          outgoingLaneIds: Object.freeze(outgoingLaneIds),
          conflictZones: Object.freeze(conflictZones),
          movements: Object.freeze(movements),
        }),
      );
    }

  // STOP/SIGNAL lines for every incoming lane of a controlled junction.
  for (const junction of intersections) {
    const [column, row] = junction.id.slice(3).split('-').map(Number) as [number, number];
    const signalized = isSignalized(column, row);
    if (!signalized && !isStopControlled(column, row)) continue;
    for (const laneId of junction.incomingLaneIds) {
      const record = recordById(laneId);
      const anchorIndex = 3;
      const anchor = record.points[anchorIndex]!;
      const lineId = `sl:${column}-${row}:${record.token}`;
      const transverse = AXIS[record.direction] === 'X' ? 'Z' : 'X';
      const half = record.lane.widthM / 2;
      const lineNodeIds =
        transverse === 'Z'
          ? [
              addNode(`n:${lineId}:0`, anchor.x, anchor.z - half),
              addNode(`n:${lineId}:1`, anchor.x, anchor.z + half),
            ]
          : [
              addNode(`n:${lineId}:0`, anchor.x - half, anchor.z),
              addNode(`n:${lineId}:1`, anchor.x + half, anchor.z),
            ];
      stopLines.push(
        Object.freeze({
          id: lineId,
          geometryId: addPath(`g:${lineId}`, lineNodeIds),
          laneId,
          anchorNodeId: record.nodeIds[anchorIndex]!,
          kind: signalized ? 'SIGNAL' : 'STOP',
          intersectionId: junction.id,
          signalId: signalized ? `sig:${column}-${row}` : null,
        }),
      );
    }
  }

  // Crosswalks on every existing leg, one CROSSWALK line per crossed lane.
  for (let column = 0; column <= LAST_COLUMN; column += 1)
    for (let row = 0; row <= LAST_ROW; row += 1) {
      const x = COLUMNS_M[column];
      const z = ROWS_M[row];
      const hx = halfWidthX(column);
      const hz = halfWidthZ(row);
      const legs: {
        readonly side: 'E' | 'W' | 'N' | 'S';
        readonly away: Direction;
        readonly lanes: LaneRecord[];
        readonly centerX: number;
        readonly centerZ: number;
        readonly spanX: number;
        readonly spanZ: number;
      }[] = [];
      const segmentLanes = (
        axis: 'X' | 'Z',
        from: readonly [number, number],
        to: readonly [number, number],
      ): LaneRecord[] =>
        records.filter(
          (record) =>
            AXIS[record.direction] === axis &&
            ((record.lane.fromIntersectionId === junctionId(from[0], from[1]) &&
              record.lane.toIntersectionId === junctionId(to[0], to[1])) ||
              (record.lane.fromIntersectionId === junctionId(to[0], to[1]) &&
                record.lane.toIntersectionId === junctionId(from[0], from[1]))),
        );
      if (column < LAST_COLUMN)
        legs.push({
          side: 'E',
          away: 'EAST',
          lanes: segmentLanes('X', [column, row], [column + 1, row]),
          centerX: x + hx + CROSSWALK_OFFSET_M,
          centerZ: z,
          spanX: 3,
          spanZ: 2 * hz + 2.4,
        });
      if (column > 0)
        legs.push({
          side: 'W',
          away: 'WEST',
          lanes: segmentLanes('X', [column - 1, row], [column, row]),
          centerX: x - hx - CROSSWALK_OFFSET_M,
          centerZ: z,
          spanX: 3,
          spanZ: 2 * hz + 2.4,
        });
      if (row < LAST_ROW)
        legs.push({
          side: 'N',
          away: 'NORTH',
          lanes: segmentLanes('Z', [column, row], [column, row + 1]),
          centerX: x,
          centerZ: z + hz + CROSSWALK_OFFSET_M,
          spanX: 2 * hx + 2.4,
          spanZ: 3,
        });
      if (row > 0)
        legs.push({
          side: 'S',
          away: 'SOUTH',
          lanes: segmentLanes('Z', [column, row - 1], [column, row]),
          centerX: x,
          centerZ: z - hz - CROSSWALK_OFFSET_M,
          spanX: 2 * hx + 2.4,
          spanZ: 3,
        });
      for (const leg of legs) {
        if (leg.lanes.length === 0) continue;
        const crosswalkId = `cw:${column}-${row}:${leg.side}`;
        const minX = leg.centerX - leg.spanX / 2;
        const maxX = leg.centerX + leg.spanX / 2;
        const minZ = leg.centerZ - leg.spanZ / 2;
        const maxZ = leg.centerZ + leg.spanZ / 2;
        const areaId = `a:${crosswalkId}`;
        addArea(areaId, [
          addNode(`n:${crosswalkId}:0`, minX, minZ),
          addNode(`n:${crosswalkId}:1`, maxX, minZ),
          addNode(`n:${crosswalkId}:2`, maxX, maxZ),
          addNode(`n:${crosswalkId}:3`, minX, maxZ),
        ]);
        const lineIds: string[] = [];
        for (const record of leg.lanes) {
          // A lane leaving the junction enters the crossing at its start node; a lane arriving
          // at the junction reaches it at the last node before the line.
          const anchorIndex = record.direction === leg.away ? 1 : 4;
          const anchor = record.points[anchorIndex]!;
          const lineId = `sl:${crosswalkId}:${record.token}`;
          const transverse = AXIS[record.direction] === 'X' ? 'Z' : 'X';
          const half = record.lane.widthM / 2;
          const lineNodeIds =
            transverse === 'Z'
              ? [
                  addNode(`n:${lineId}:0`, anchor.x, anchor.z - half),
                  addNode(`n:${lineId}:1`, anchor.x, anchor.z + half),
                ]
              : [
                  addNode(`n:${lineId}:0`, anchor.x - half, anchor.z),
                  addNode(`n:${lineId}:1`, anchor.x + half, anchor.z),
                ];
          lineIds.push(lineId);
          stopLines.push(
            Object.freeze({
              id: lineId,
              geometryId: addPath(`g:${lineId}`, lineNodeIds),
              laneId: record.lane.id,
              anchorNodeId: record.nodeIds[anchorIndex]!,
              kind: 'CROSSWALK',
              intersectionId: null,
              signalId: null,
            }),
          );
        }
        crosswalks.push(
          Object.freeze({
            id: crosswalkId,
            geometryId: areaId,
            laneIds: Object.freeze(leg.lanes.map((record) => record.lane.id)),
            stopLineIds: Object.freeze(lineIds),
          }),
        );
      }
    }

  // Service zones on the curb side of one lane per block.
  for (let column = 0; column < LAST_COLUMN; column += 1)
    for (let row = 0; row < LAST_ROW; row += 1) {
      const record = recordByToken.get(`${column}${row}W0`);
      if (!record) continue;
      const anchorIndex = 2;
      const anchor = record.points[anchorIndex]!;
      const right = RIGHT[record.direction];
      // The 032 anchor is the lane centre node, so the bay starts just inside the lane edge and
      // extends outward; the bbox therefore contains the anchor node.
      const halfDepth = (SERVICE_ZONE_DEPTH_M + 0.2) / 2;
      const depthOffset = halfDepth - 0.2;
      const centerX = anchor.x + right.x * depthOffset;
      const centerZ = anchor.z + right.z * depthOffset;
      const zoneId = `sz:${column}-${row}`;
      const alongX = AXIS[record.direction] === 'X';
      const halfX = alongX ? SERVICE_ZONE_HALF_LENGTH_M : halfDepth;
      const halfZ = alongX ? halfDepth : SERVICE_ZONE_HALF_LENGTH_M;
      addArea(`a:${zoneId}`, [
        addNode(`n:${zoneId}:0`, centerX - halfX, centerZ - halfZ),
        addNode(`n:${zoneId}:1`, centerX + halfX, centerZ - halfZ),
        addNode(`n:${zoneId}:2`, centerX + halfX, centerZ + halfZ),
        addNode(`n:${zoneId}:3`, centerX - halfX, centerZ + halfZ),
      ]);
      const kind = (['PICKUP', 'DROPOFF', 'BOTH'] as const)[(column + row) % 3]!;
      serviceZones.push(
        Object.freeze({
          id: zoneId,
          geometryId: `a:${zoneId}`,
          laneId: record.lane.id,
          anchorNodeId: record.nodeIds[anchorIndex]!,
          access: Object.freeze(
            column === 0 && row === 0
              ? (['TAXI'] as const)
              : column === 2 && row === 2
                ? (['CIVIL'] as const)
                : (['TAXI', 'CIVIL'] as const),
          ),
          kind,
        }),
      );
    }

  // Recovery points on authored through lanes.
  const recoverySpecs: readonly (readonly [number, number, Direction])[] = [
    [0, 0, 'NORTH'],
    [1, 1, 'NORTH'],
    [2, 2, 'NORTH'],
    [3, 3, 'NORTH'],
    [0, 3, 'SOUTH'],
    [3, 0, 'SOUTH'],
  ];
  recoverySpecs.forEach(([column, row, direction], order) => {
    const record = recordByToken.get(`${column}${row}${DIRECTION_CODE[direction]}0`);
    if (!record) return;
    recoveryPoints.push(
      Object.freeze({
        id: `rp:${order}`,
        nodeId: record.nodeIds[2]!,
        laneId: record.lane.id,
        headingRad: HEADING[direction],
      }),
    );
  });

  const base: RoadMap = {
    schemaVersion: 1,
    units: 'SI',
    mapId: NEIGHBOURHOOD_MAP_ID,
    bounds: {
      minM: point(-BOUNDS_MARGIN_M, -BOUNDS_MARGIN_M),
      maxM: point(COLUMNS_M[LAST_COLUMN] + BOUNDS_MARGIN_M, ROWS_M[LAST_ROW] + BOUNDS_MARGIN_M),
    },
    geometry: { nodes, paths, areas },
    lanes: lanes.map((lane) =>
      Object.freeze({
        ...lane,
        successorIds: Object.freeze([...successors.get(lane.id)!]),
      }),
    ),
    intersections,
    signals: [],
    stopLines,
    crosswalks,
    serviceZones,
    recoveryPoints,
  };
  const validated = parseRoadMap({
    ...base,
    signals: buildSignalPrograms(base, directions, false),
  });
  return parseRoadMap({ ...base, signals: buildSignalPrograms(validated, directions, true) });
}

/**
 * Deterministic phases: through movements are packed into as few GREEN phases as the declared
 * quadrants and the PBI035 relation allow, every turning movement gets one single-movement GREEN
 * phase, each GREEN phase is followed by its YELLOW clearance phase, and the program ends with an
 * all-red phase. Live cycling remains PBI036's contract.
 */
function buildSignalPrograms(
  map: RoadMap,
  directions: ReadonlyMap<string, Direction>,
  packThrough: boolean,
): RoadSignal[] {
  const conflicts = packThrough ? createIntersectionConflicts(map) : null;
  const lanes = new Map(map.lanes.map((lane) => [lane.id, lane]));
  const signals: RoadSignal[] = [];
  for (const junction of map.intersections) {
    const [column, row] = junction.id.slice(3).split('-').map(Number) as [number, number];
    if (!isSignalized(column, row)) continue;
    const ordered = [...junction.movements].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    const through = ordered.filter(
      (movement) => directions.get(movement.fromLaneId) === directions.get(movement.toLaneId),
    );
    const turning = ordered.filter((movement) => !through.includes(movement));
    const compatible = (first: Movement, second: Movement): boolean => {
      if (first.toLaneId === second.toLaneId) return false;
      if (first.conflictZoneIds.some((zone) => second.conflictZoneIds.includes(zone))) return false;
      return !(conflicts?.getRelation(junction.id, first.id, second.id)?.incompatible ?? false);
    };
    const packs: Movement[][] = [];
    for (const movement of through) {
      const target = packThrough
        ? packs.find((pack) => pack.every((member) => compatible(movement, member)))
        : undefined;
      if (target) target.push(movement);
      else packs.push([movement]);
    }
    const greens: Movement[][] = [...packs, ...turning.map((movement) => [movement])];
    const phases: SignalPhase[] = [];
    let order = 0;
    const states = (green: readonly Movement[], state: 'GREEN' | 'YELLOW'): SignalPhase =>
      Object.freeze({
        id: `ph:${column}-${row}:${order}`,
        durationS: state === 'GREEN' ? (green.length > 1 ? 14 : 8) : 3,
        movementStates: Object.freeze(
          ordered.map((movement) =>
            Object.freeze({
              movementId: movement.id,
              state: green.includes(movement) ? state : ('RED' as const),
            }),
          ),
        ),
      });
    for (const green of greens) {
      phases.push(states(green, 'GREEN'));
      order += 1;
      phases.push(states(green, 'YELLOW'));
      order += 1;
    }
    phases.push(
      Object.freeze({
        id: `ph:${column}-${row}:${order}`,
        durationS: 2,
        movementStates: Object.freeze(
          ordered.map((movement) =>
            Object.freeze({ movementId: movement.id, state: 'RED' as const }),
          ),
        ),
      }),
    );
    for (const movement of ordered)
      if (!lanes.has(movement.fromLaneId)) throw new Error('Movement lane mismatch');
    signals.push(
      Object.freeze({
        id: `sig:${column}-${row}`,
        intersectionId: junction.id,
        phases: Object.freeze(phases),
      }),
    );
  }
  return signals;
}
