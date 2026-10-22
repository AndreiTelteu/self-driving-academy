import type { Vector3 } from '../vehicles';
import { parseRoadMap } from './parser';
import type { GeometryArea, Lane, RoadMap, StopLine } from './schema';

/**
 * Visual-semantic city layout derived from a validated PBI032 map.
 *
 * This module owns only plain data: no Babylon, DOM or GPU. Every element is traceable to the map
 * IDs it was derived from, and `verifyCityAlignment` re-derives the expected geometry from the map
 * (plus the PBI033 lane graph contract implemented independently in the tests) so a mismatch
 * between simulation data and presentation is reported instead of silently painted.
 */
export type CitySourceType =
  | 'LANE'
  | 'INTERSECTION'
  | 'SIGNAL'
  | 'STOP_LINE'
  | 'CROSSWALK'
  | 'SERVICE_ZONE'
  | 'MOVEMENT'
  | 'CONFLICT_ZONE'
  | 'RECOVERY_POINT'
  | 'BLOCK';

export type CityElementKind =
  | 'LANE_SURFACE'
  | 'LANE_MARKING'
  | 'INTERSECTION_SURFACE'
  | 'STOP_LINE'
  | 'CROSSWALK'
  | 'SIGNAL_HEAD'
  | 'SERVICE_ZONE'
  | 'GROUND'
  | 'SIDEWALK'
  | 'CURB'
  | 'BUILDING';

export type CityTopology = 'RIBBON' | 'FAN';
export type CityPaint = 'SOLID' | 'DASHED';
export type CityMarkingRole = 'EDGE_LINE' | 'LANE_DIVIDER' | 'CENTER_LINE';
export type SignalLampState = 'RED' | 'YELLOW' | 'GREEN';
export type CityRoadClass = 'ARTERIAL' | 'RESIDENTIAL';
export type CityIntersectionType = 'SIGNALIZED' | 'STOP_CONTROLLED' | 'UNCONTROLLED';

export interface CityLayoutOptions {
  /** Painted line width for lane markings. */
  readonly markingWidthM?: number;
  /** Edge line inset from the physical lane edge. */
  readonly markingInsetM?: number;
  /** Markings stop this far before a junction edge. */
  readonly markingTrimM?: number;
  readonly dashLengthM?: number;
  readonly dashGapM?: number;
  /** Footprint of a STOP/SIGNAL/CROSSWALK line. */
  readonly stopLineThicknessM?: number;
  readonly sidewalkWidthM?: number;
  readonly curbWidthM?: number;
  readonly buildingInsetM?: number;
  readonly minimumBuildingM?: number;
  readonly signalPostHeightM?: number;
  readonly signalHeadSetbackM?: number;
  readonly crosswalkStripePitchM?: number;
  /** Nominal surface heights; presentation only. */
  readonly markingElevationM?: number;
  readonly sidewalkElevationM?: number;
  readonly groundElevationM?: number;
  readonly crosswalkElevationM?: number;
}

export interface ResolvedCityLayoutOptions extends Required<CityLayoutOptions> {}

export const CITY_LAYOUT_DEFAULTS: Readonly<ResolvedCityLayoutOptions> = Object.freeze({
  markingWidthM: 0.12,
  markingInsetM: 0.2,
  markingTrimM: 1,
  dashLengthM: 2.4,
  dashGapM: 3.6,
  stopLineThicknessM: 0.4,
  sidewalkWidthM: 2.4,
  curbWidthM: 0.2,
  buildingInsetM: 0.8,
  minimumBuildingM: 5,
  signalPostHeightM: 3.6,
  signalHeadSetbackM: 0.8,
  crosswalkStripePitchM: 1,
  markingElevationM: 0.02,
  sidewalkElevationM: 0.14,
  groundElevationM: 0.06,
  crosswalkElevationM: 0.015,
});

interface CityElementBase {
  readonly id: string;
  readonly kind: CityElementKind;
  readonly sourceType: CitySourceType;
  readonly sourceIds: readonly string[];
  readonly baseYM: number;
}

/** Planar element: footprint is a closed X/Z polygon, first vertex not repeated. */
export interface CityPlanarElement extends CityElementBase {
  readonly kind: Exclude<CityElementKind, 'SIGNAL_HEAD'>;
  readonly footprintM: readonly Vector3[];
  readonly topology: CityTopology;
  readonly heightM: number;
  readonly laneId: string | null;
  readonly intersectionId: string | null;
  readonly stopLineId: string | null;
  /** Authored kind of a STOP_LINE element; null for every other kind. */
  readonly stopKind?: 'STOP' | 'SIGNAL' | 'CROSSWALK' | null;
  readonly crosswalkId: string | null;
  readonly serviceZoneId: string | null;
  readonly blockId: string | null;
  readonly paint: CityPaint | null;
  readonly markingRole: CityMarkingRole | null;
  readonly lateralOffsetM: number | null;
  readonly longitudinalM: number | null;
  /** Crosswalk zebra bars; zero for other kinds. */
  readonly stripeCount: number;
  readonly stripeAxis: 'X' | 'Z' | null;
}

export interface CitySignalHeadElement extends CityElementBase {
  readonly kind: 'SIGNAL_HEAD';
  readonly positionM: Vector3;
  /** Map heading the housing faces (the oncoming driver). */
  readonly facingRad: number;
  readonly laneId: string;
  readonly intersectionId: string;
  readonly signalId: string;
  readonly movementIds: readonly string[];
  readonly lampState: SignalLampState;
  readonly postHeightM: number;
  readonly housingWidthM: number;
  readonly housingHeightM: number;
  readonly housingDepthM: number;
}

export type CityElement = CityPlanarElement | CitySignalHeadElement;

export interface CityLaneInfo {
  readonly laneId: string;
  readonly roadClass: CityRoadClass;
  readonly widthM: number;
  readonly speedLimitMps: number;
  readonly headingRad: number;
  readonly lengthM: number;
  readonly surfaceElementId: string;
  readonly stopLineId: string | null;
  readonly signalHeadId: string | null;
  readonly crosswalkIds: readonly string[];
}

export interface CityIntersectionInfo {
  readonly intersectionId: string;
  readonly type: CityIntersectionType;
  readonly signalId: string | null;
  readonly surfaceElementId: string;
  readonly incomingLaneIds: readonly string[];
  readonly movementIds: readonly string[];
  readonly stopLineIds: readonly string[];
  readonly signalHeadIds: readonly string[];
}

export interface CityBlockInfo {
  readonly blockId: string;
  readonly intersectionIds: readonly string[];
  readonly buildingElementIds: readonly string[];
}

export interface CitySourceInventory {
  readonly lanes: readonly string[];
  readonly intersections: readonly string[];
  readonly signals: readonly string[];
  readonly stopLines: readonly string[];
  readonly crosswalks: readonly string[];
  readonly serviceZones: readonly string[];
  readonly movements: readonly string[];
  readonly conflictZones: readonly string[];
  readonly recoveryPoints: readonly string[];
  readonly blocks: readonly string[];
}

export interface CityLayoutStats {
  readonly elements: number;
  readonly elementsByKind: Readonly<Record<CityElementKind, number>>;
  readonly elementsBySourceType: Readonly<Record<CitySourceType, number>>;
  readonly blocks: number;
  readonly buildings: number;
  readonly signalHeads: number;
  readonly laneMarkings: number;
  readonly footprintVertices: number;
}

export interface CityLayout {
  readonly mapId: string;
  readonly boundsM: { readonly minM: Vector3; readonly maxM: Vector3 };
  readonly elements: readonly CityElement[];
  readonly lanes: readonly CityLaneInfo[];
  readonly intersections: readonly CityIntersectionInfo[];
  readonly blocks: readonly CityBlockInfo[];
  readonly inventory: CitySourceInventory;
  readonly options: ResolvedCityLayoutOptions;
  readonly stats: CityLayoutStats;
}

export type CityReportReason =
  'SEMANTIC_ONLY' | 'REPRESENTED_BY_SIGNAL_HEAD' | 'DERIVED_FROM_LANES';

export interface CityUnrenderedSource {
  readonly id: string;
  readonly sourceType: CitySourceType;
  readonly reason: CityReportReason;
}

export interface CityLayoutReport {
  readonly mapId: string;
  readonly elements: number;
  readonly elementsByKind: Readonly<Record<CityElementKind, number>>;
  readonly elementsBySourceType: Readonly<Record<CitySourceType, number>>;
  readonly sourceCounts: Readonly<Record<CitySourceType, number>>;
  readonly intersectionTypes: Readonly<Record<CityIntersectionType, number>>;
  readonly roadClasses: Readonly<Record<CityRoadClass, number>>;
  readonly unrendered: readonly CityUnrenderedSource[];
  /** Elements whose source IDs do not resolve to a map entity or derived block. */
  readonly phantomElementIds: readonly string[];
  /** Layout elements with no reported rendered mesh (only when `renderedElementIds` is given). */
  readonly missingRenderedElementIds: readonly string[];
  /** Rendered IDs that the layout never declared. */
  readonly unknownRenderedElementIds: readonly string[];
  readonly blocks: number;
  readonly buildings: number;
}

export interface CityAlignmentIssue {
  readonly code: string;
  readonly sourceId: string;
  readonly elementId: string | null;
  readonly detail: string;
}

const EMPTY_KIND_COUNTS: Readonly<Record<CityElementKind, number>> = Object.freeze({
  LANE_SURFACE: 0,
  LANE_MARKING: 0,
  INTERSECTION_SURFACE: 0,
  STOP_LINE: 0,
  CROSSWALK: 0,
  SIGNAL_HEAD: 0,
  SERVICE_ZONE: 0,
  GROUND: 0,
  SIDEWALK: 0,
  CURB: 0,
  BUILDING: 0,
});
const EMPTY_SOURCE_COUNTS: Readonly<Record<CitySourceType, number>> = Object.freeze({
  LANE: 0,
  INTERSECTION: 0,
  SIGNAL: 0,
  STOP_LINE: 0,
  CROSSWALK: 0,
  SERVICE_ZONE: 0,
  MOVEMENT: 0,
  CONFLICT_ZONE: 0,
  RECOVERY_POINT: 0,
  BLOCK: 0,
});

function point(x: number, z: number, y = 0): Vector3 {
  return Object.freeze({ x, y, z });
}
function readNumber(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < minimum || resolved > maximum)
    throw new Error(`Invalid city layout option ${name}`);
  return resolved;
}
function readOptions(options: CityLayoutOptions | undefined): ResolvedCityLayoutOptions {
  if (options === undefined) return CITY_LAYOUT_DEFAULTS;
  if (typeof options !== 'object' || options === null || Array.isArray(options))
    throw new Error('Invalid city layout options');
  const unknown = Object.keys(options).filter((key) => !(key in CITY_LAYOUT_DEFAULTS));
  if (unknown.length > 0) throw new Error(`Unknown city layout option ${unknown[0]}`);
  return Object.freeze({
    markingWidthM: readNumber(
      options.markingWidthM,
      CITY_LAYOUT_DEFAULTS.markingWidthM,
      0.02,
      1,
      'markingWidthM',
    ),
    markingInsetM: readNumber(
      options.markingInsetM,
      CITY_LAYOUT_DEFAULTS.markingInsetM,
      0,
      2,
      'markingInsetM',
    ),
    markingTrimM: readNumber(
      options.markingTrimM,
      CITY_LAYOUT_DEFAULTS.markingTrimM,
      0,
      20,
      'markingTrimM',
    ),
    dashLengthM: readNumber(
      options.dashLengthM,
      CITY_LAYOUT_DEFAULTS.dashLengthM,
      0.2,
      20,
      'dashLengthM',
    ),
    dashGapM: readNumber(options.dashGapM, CITY_LAYOUT_DEFAULTS.dashGapM, 0.2, 20, 'dashGapM'),
    stopLineThicknessM: readNumber(
      options.stopLineThicknessM,
      CITY_LAYOUT_DEFAULTS.stopLineThicknessM,
      0.1,
      2,
      'stopLineThicknessM',
    ),
    sidewalkWidthM: readNumber(
      options.sidewalkWidthM,
      CITY_LAYOUT_DEFAULTS.sidewalkWidthM,
      0.5,
      6,
      'sidewalkWidthM',
    ),
    curbWidthM: readNumber(
      options.curbWidthM,
      CITY_LAYOUT_DEFAULTS.curbWidthM,
      0.05,
      1,
      'curbWidthM',
    ),
    buildingInsetM: readNumber(
      options.buildingInsetM,
      CITY_LAYOUT_DEFAULTS.buildingInsetM,
      0,
      5,
      'buildingInsetM',
    ),
    minimumBuildingM: readNumber(
      options.minimumBuildingM,
      CITY_LAYOUT_DEFAULTS.minimumBuildingM,
      2,
      40,
      'minimumBuildingM',
    ),
    signalPostHeightM: readNumber(
      options.signalPostHeightM,
      CITY_LAYOUT_DEFAULTS.signalPostHeightM,
      1,
      12,
      'signalPostHeightM',
    ),
    signalHeadSetbackM: readNumber(
      options.signalHeadSetbackM,
      CITY_LAYOUT_DEFAULTS.signalHeadSetbackM,
      0,
      5,
      'signalHeadSetbackM',
    ),
    crosswalkStripePitchM: readNumber(
      options.crosswalkStripePitchM,
      CITY_LAYOUT_DEFAULTS.crosswalkStripePitchM,
      0.3,
      4,
      'crosswalkStripePitchM',
    ),
    markingElevationM: readNumber(
      options.markingElevationM,
      CITY_LAYOUT_DEFAULTS.markingElevationM,
      0,
      1,
      'markingElevationM',
    ),
    sidewalkElevationM: readNumber(
      options.sidewalkElevationM,
      CITY_LAYOUT_DEFAULTS.sidewalkElevationM,
      0,
      1,
      'sidewalkElevationM',
    ),
    groundElevationM: readNumber(
      options.groundElevationM,
      CITY_LAYOUT_DEFAULTS.groundElevationM,
      0,
      1,
      'groundElevationM',
    ),
    crosswalkElevationM: readNumber(
      options.crosswalkElevationM,
      CITY_LAYOUT_DEFAULTS.crosswalkElevationM,
      0,
      1,
      'crosswalkElevationM',
    ),
  });
}

function directedPoints(map: RoadMap, lane: Lane): Vector3[] {
  const path = map.geometry.paths.find((candidate) => candidate.id === lane.geometryId);
  if (!path) throw new Error(`Missing lane geometry ${lane.geometryId}`);
  const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
  const points = path.nodeIds.map((id) => {
    const position = nodes.get(id);
    if (!position) throw new Error(`Missing geometry node ${id}`);
    return position;
  });
  return lane.direction === 'FORWARD' ? points : points.reverse();
}
/** Left of travel is positive; zero heading is +X and positive angles rotate toward +Z. */
function offsetPoints(points: readonly Vector3[], lateralM: number): Vector3[] {
  return points.map((current, index) => {
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz);
    if (length === 0) return point(current.x, current.z);
    return point(current.x + (-dz / length) * lateralM, current.z + (dx / length) * lateralM);
  });
}
function ribbon(points: readonly Vector3[], widthM: number, lateralM = 0): Vector3[] {
  const center = lateralM === 0 ? [...points] : offsetPoints(points, lateralM);
  const left = offsetPoints(center, widthM / 2);
  const right = offsetPoints(center, -widthM / 2).reverse();
  return [...left, ...right];
}
function polylineLength(points: readonly Vector3[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}
function headingAt(points: readonly Vector3[], index = 0): number {
  const a = points[Math.max(0, index - 1)]!;
  const b = points[Math.min(points.length - 1, index)]!;
  return Math.atan2(b.z - a.z, b.x - a.x);
}
function slicePolyline(points: readonly Vector3[], startM: number, endM: number): Vector3[] {
  const total = polylineLength(points);
  const from = Math.max(0, Math.min(startM, total));
  const to = Math.max(from, Math.min(endM, total));
  const result: Vector3[] = [];
  let walked = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[Math.min(points.length - 1, index + 1)]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const start = walked;
    const end = walked + length;
    if (end >= from && start <= to && length > 0) {
      const localFrom = Math.max(from, start);
      const localTo = Math.min(to, end);
      const at = (distance: number): Vector3 =>
        point(
          a.x + ((distance - start) / length) * (b.x - a.x),
          a.z + ((distance - start) / length) * (b.z - a.z),
        );
      const first = at(localFrom);
      if (
        result.length === 0 ||
        Math.hypot(result[result.length - 1]!.x - first.x, result[result.length - 1]!.z - first.z) >
          1e-9
      )
        result.push(first);
      const last = at(localTo);
      if (
        Math.hypot(result[result.length - 1]!.x - last.x, result[result.length - 1]!.z - last.z) >
        1e-9
      )
        result.push(last);
    }
    walked = end;
  }
  return result.length >= 2 ? result : [...points];
}
function boundsOf(points: readonly Vector3[]) {
  const minX = Math.min(...points.map((vertex) => vertex.x));
  const maxX = Math.max(...points.map((vertex) => vertex.x));
  const minZ = Math.min(...points.map((vertex) => vertex.z));
  const maxZ = Math.max(...points.map((vertex) => vertex.z));
  return { minX, maxX, minZ, maxZ };
}
function centroid(points: readonly Vector3[]): Vector3 {
  return point(
    points.reduce((sum, vertex) => sum + vertex.x, 0) / points.length,
    points.reduce((sum, vertex) => sum + vertex.z, 0) / points.length,
  );
}
function quad(centerX: number, centerZ: number, halfX: number, halfZ: number): Vector3[] {
  return [
    point(centerX - halfX, centerZ - halfZ),
    point(centerX + halfX, centerZ - halfZ),
    point(centerX + halfX, centerZ + halfZ),
    point(centerX - halfX, centerZ + halfZ),
  ];
}
function hash32(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function unit(text: string, salt: number): number {
  return (hash32(`${text}|${salt}`) % 10_000) / 10_000;
}
/** Map heading of a lane, using the first directed segment. */
function laneHeading(points: readonly Vector3[]): number {
  return headingAt(points, 1);
}

interface BlockCell {
  readonly blockId: string;
  readonly intersectionIds: readonly string[];
  readonly interior: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
  /** Street edges of the surrounding corridors. */
  readonly street: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
}

/**
 * Derive the neighbourhood grid from the junction areas: the street centre lines are the clusters
 * of junction centres, and each column/row half-width is the largest junction box on that line.
 */
function deriveBlocks(map: RoadMap, options: ResolvedCityLayoutOptions): BlockCell[] {
  const areas = new Map(map.geometry.areas.map((area) => [area.id, area]));
  const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
  const boxes = map.intersections.flatMap((intersection) => {
    const area = areas.get(intersection.geometryId);
    if (!area) return [];
    const points = area.vertexNodeIds.map((id) => nodes.get(id)!);
    const box = boundsOf(points);
    return [
      {
        intersectionId: intersection.id,
        centerX: (box.minX + box.maxX) / 2,
        centerZ: (box.minZ + box.maxZ) / 2,
        halfX: (box.maxX - box.minX) / 2,
        halfZ: (box.maxZ - box.minZ) / 2,
      },
    ];
  });
  if (boxes.length < 4) return [];
  const cluster = (values: number[]): number[] => {
    const sorted = [...values].sort((a, b) => a - b);
    const centers: number[] = [];
    for (const value of sorted) {
      const last = centers[centers.length - 1];
      if (last === undefined || value - last > 1e-6) centers.push(value);
    }
    return centers;
  };
  const columns = cluster(boxes.map((box) => box.centerX));
  const rows = cluster(boxes.map((box) => box.centerZ));
  if (columns.length < 2 || rows.length < 2) return [];
  const columnIndex = new Map(columns.map((value, index) => [value, index]));
  const rowIndex = new Map(rows.map((value, index) => [value, index]));
  const grid = new Map<string, (typeof boxes)[number]>();
  for (const box of boxes) {
    const column = columnIndex.get(box.centerX);
    const row = rowIndex.get(box.centerZ);
    if (column === undefined || row === undefined) return [];
    grid.set(`${column}-${row}`, box);
  }
  if (grid.size !== columns.length * rows.length) return [];
  const halfX = columns.map((_, column) => {
    let value = 0;
    for (let row = 0; row < rows.length; row += 1)
      value = Math.max(value, grid.get(`${column}-${row}`)!.halfX);
    return value;
  });
  const halfZ = rows.map((_, row) => {
    let value = 0;
    for (let column = 0; column < columns.length; column += 1)
      value = Math.max(value, grid.get(`${column}-${row}`)!.halfZ);
    return value;
  });
  const blocks: BlockCell[] = [];
  for (let column = 0; column < columns.length - 1; column += 1)
    for (let row = 0; row < rows.length - 1; row += 1) {
      const streetMinX = columns[column]! + halfX[column]!;
      const streetMaxX = columns[column + 1]! - halfX[column + 1]!;
      const streetMinZ = rows[row]! + halfZ[row]!;
      const streetMaxZ = rows[row + 1]! - halfZ[row + 1]!;
      if (streetMaxX - streetMinX < options.sidewalkWidthM * 2 + 4) continue;
      if (streetMaxZ - streetMinZ < options.sidewalkWidthM * 2 + 4) continue;
      blocks.push({
        blockId: `blk:${column}-${row}`,
        intersectionIds: [
          grid.get(`${column}-${row}`)!.intersectionId,
          grid.get(`${column + 1}-${row}`)!.intersectionId,
          grid.get(`${column + 1}-${row + 1}`)!.intersectionId,
          grid.get(`${column}-${row + 1}`)!.intersectionId,
        ],
        street: { minX: streetMinX, maxX: streetMaxX, minZ: streetMinZ, maxZ: streetMaxZ },
        interior: {
          minX: streetMinX + options.sidewalkWidthM,
          maxX: streetMaxX - options.sidewalkWidthM,
          minZ: streetMinZ + options.sidewalkWidthM,
          maxZ: streetMaxZ - options.sidewalkWidthM,
        },
      });
    }
  return blocks;
}

/** Derived buildings: deterministic lot grid per block, inset from the drivable surface. */
function createBuildings(
  block: BlockCell,
  options: ResolvedCityLayoutOptions,
): CityPlanarElement[] {
  const width = block.interior.maxX - block.interior.minX;
  const depth = block.interior.maxZ - block.interior.minZ;
  if (width <= 0 || depth <= 0) return [];
  const columns = unit(block.blockId, 1) < 0.45 ? 2 : 3;
  const rows = 2;
  const lotWidth = width / columns;
  const lotDepth = depth / rows;
  if (lotWidth < options.minimumBuildingM + 2 || lotDepth < options.minimumBuildingM + 2) return [];
  const buildings: CityPlanarElement[] = [];
  for (let column = 0; column < columns; column += 1)
    for (let row = 0; row < rows; row += 1) {
      const key = `${block.blockId}:${column}-${row}`;
      const insetX = lotWidth * (0.1 + 0.14 * unit(key, 2)) + options.buildingInsetM;
      const insetZ = lotDepth * (0.1 + 0.14 * unit(key, 3)) + options.buildingInsetM;
      const footprintWidth = lotWidth - insetX * 2;
      const footprintDepth = lotDepth - insetZ * 2;
      if (footprintWidth < options.minimumBuildingM || footprintDepth < options.minimumBuildingM)
        continue;
      const centerX = block.interior.minX + lotWidth * (column + 0.5) + (unit(key, 4) - 0.5) * 1.2;
      const centerZ = block.interior.minZ + lotDepth * (row + 0.5) + (unit(key, 5) - 0.5) * 1.2;
      const floors = 1 + Math.floor(unit(key, 6) * 4);
      buildings.push({
        id: `bld:${block.blockId}:${column}-${row}`,
        kind: 'BUILDING',
        sourceType: 'BLOCK',
        sourceIds: Object.freeze([block.blockId]),
        baseYM: options.sidewalkElevationM,
        footprintM: Object.freeze(quad(centerX, centerZ, footprintWidth / 2, footprintDepth / 2)),
        topology: 'FAN',
        heightM: 3.2 * floors + 0.6,
        laneId: null,
        intersectionId: null,
        stopLineId: null,
        crosswalkId: null,
        serviceZoneId: null,
        blockId: block.blockId,
        paint: null,
        markingRole: null,
        lateralOffsetM: null,
        longitudinalM: null,
        stripeCount: 0,
        stripeAxis: null,
      });
    }
  return buildings;
}

function roadClassOf(lane: Lane): CityRoadClass {
  return lane.neighbors.left !== null || lane.neighbors.right !== null || lane.speedLimitMps >= 13.4
    ? 'ARTERIAL'
    : 'RESIDENTIAL';
}

/** Deterministic, disposable-free derivation of the whole rendered city layout. */
export function createCityLayout(input: unknown, options?: CityLayoutOptions): CityLayout {
  const map = parseRoadMap(input);
  const resolved = readOptions(options);
  const paths = new Map(map.geometry.paths.map((path) => [path.id, path]));
  const areas = new Map<string, GeometryArea>(map.geometry.areas.map((area) => [area.id, area]));
  const nodes = new Map<string, Vector3>(
    map.geometry.nodes.map((node) => [node.id, node.positionM]),
  );
  const areaPolygon = (id: string): Vector3[] => {
    const area = areas.get(id);
    if (!area) throw new Error(`Missing area ${id}`);
    return area.vertexNodeIds.map((nodeId) => nodes.get(nodeId)!);
  };
  const pathNodes = (id: string): Vector3[] => {
    const path = paths.get(id);
    if (!path) throw new Error(`Missing path ${id}`);
    return path.nodeIds.map((nodeId) => nodes.get(nodeId)!);
  };

  const elements: CityElement[] = [];
  const push = (element: CityElement): void => {
    elements.push(Object.freeze(element) as CityElement);
  };
  const planar = (
    element: Omit<CityPlanarElement, 'topology' | 'footprintM'> & {
      readonly footprintM: readonly Vector3[];
      readonly topology?: CityTopology;
    },
  ): void => {
    push({ topology: 'FAN', ...element } as CityPlanarElement);
  };

  const laneInfo: CityLaneInfo[] = [];
  const stopLinesByLane = new Map<string, StopLine[]>();
  for (const line of map.stopLines) {
    const list = stopLinesByLane.get(line.laneId) ?? [];
    list.push(line);
    stopLinesByLane.set(line.laneId, list);
  }
  const crosswalksByLane = new Map<string, string[]>();
  for (const crosswalk of map.crosswalks)
    for (const laneId of crosswalk.laneIds) {
      const list = crosswalksByLane.get(laneId) ?? [];
      list.push(crosswalk.id);
      crosswalksByLane.set(laneId, list);
    }
  const headByLane = new Map<string, string>();

  // Lane surfaces and markings.
  for (const lane of map.lanes) {
    const points = directedPoints(map, lane);
    const surfaceId = `surface:${lane.id}`;
    planar({
      id: surfaceId,
      kind: 'LANE_SURFACE',
      sourceType: 'LANE',
      sourceIds: Object.freeze([lane.id]),
      baseYM: 0,
      footprintM: Object.freeze(ribbon(points, lane.widthM)),
      topology: 'RIBBON',
      heightM: 0,
      laneId: lane.id,
      intersectionId: null,
      stopLineId: null,
      crosswalkId: null,
      serviceZoneId: null,
      blockId: null,
      paint: null,
      markingRole: null,
      lateralOffsetM: 0,
      longitudinalM: null,
      stripeCount: 0,
      stripeAxis: null,
    });
    const length = polylineLength(points);
    const trim = resolved.markingTrimM;
    const usable = length - trim * 2 > 1 ? slicePolyline(points, trim, length - trim) : [...points];
    for (const side of ['left', 'right'] as const) {
      const neighbor = lane.neighbors[side];
      const lateral = (side === 'left' ? 1 : -1) * (lane.widthM / 2 - resolved.markingInsetM);
      if (neighbor === null) {
        planar({
          id: `marking:${lane.id}:${side}`,
          kind: 'LANE_MARKING',
          sourceType: 'LANE',
          sourceIds: Object.freeze([lane.id]),
          baseYM: resolved.markingElevationM,
          footprintM: Object.freeze(ribbon(usable, resolved.markingWidthM, lateral)),
          topology: 'RIBBON',
          heightM: 0,
          laneId: lane.id,
          intersectionId: null,
          stopLineId: null,
          crosswalkId: null,
          serviceZoneId: null,
          blockId: null,
          paint: 'SOLID',
          markingRole: 'EDGE_LINE',
          lateralOffsetM: lateral,
          longitudinalM: polylineLength(usable) / 2,
          stripeCount: 0,
          stripeAxis: null,
        });
        continue;
      }
      // One divider per declared neighbour pair, owned by the lexicographically smaller lane.
      if (lane.id > neighbor) continue;
      const shared = (side === 'left' ? 1 : -1) * (lane.widthM / 2);
      planar({
        id: `marking:${lane.id}:${side}`,
        kind: 'LANE_MARKING',
        sourceType: 'LANE',
        sourceIds: Object.freeze([lane.id, neighbor]),
        baseYM: resolved.markingElevationM,
        footprintM: Object.freeze(ribbon(usable, resolved.markingWidthM, shared)),
        topology: 'RIBBON',
        heightM: 0,
        laneId: lane.id,
        intersectionId: null,
        stopLineId: null,
        crosswalkId: null,
        serviceZoneId: null,
        blockId: null,
        paint: 'DASHED',
        markingRole: 'LANE_DIVIDER',
        lateralOffsetM: shared,
        longitudinalM: polylineLength(usable) / 2,
        stripeCount: 0,
        stripeAxis: null,
      });
    }

    // Opposite-direction centre line between the closest pair of a street segment.
    const heading = laneHeading(points);
    const info: CityLaneInfo = {
      laneId: lane.id,
      roadClass: roadClassOf(lane),
      widthM: lane.widthM,
      speedLimitMps: lane.speedLimitMps,
      headingRad: heading,
      lengthM: length,
      surfaceElementId: surfaceId,
      stopLineId: null,
      signalHeadId: null,
      crosswalkIds: Object.freeze([...(crosswalksByLane.get(lane.id) ?? [])]),
    };
    laneInfo.push(info);
  }

  // Centre lines: one per street segment, owned by the pair of opposing lanes nearest the middle.
  const lanesByPair = new Map<string, Lane[]>();
  for (const lane of map.lanes) {
    const pairKey = [lane.fromIntersectionId ?? '', lane.toIntersectionId ?? ''].sort().join('|');
    const list = lanesByPair.get(pairKey) ?? [];
    list.push(lane);
    lanesByPair.set(pairKey, list);
  }
  for (const [pairKey, lanes] of lanesByPair) {
    if (lanes.length < 2) continue;
    const points = lanes.map((lane) => directedPoints(map, lane));
    const axis: 'X' | 'Z' =
      Math.abs(headingAt(points[0]!, 1) - Math.PI / 2) < Math.PI / 4 ? 'Z' : 'X';
    const cross = points.map((list) => (axis === 'X' ? list[0]!.z : list[0]!.x));
    const middle = (Math.min(...cross) + Math.max(...cross)) / 2;
    const above = lanes
      .map((lane, index) => ({ lane, value: cross[index]! - middle }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => a.value - b.value)[0];
    const below = lanes
      .map((lane, index) => ({ lane, value: middle - cross[index]! }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => a.value - b.value)[0];
    if (!above || !below) continue;
    const owner = above.lane.id < below.lane.id ? above.lane : below.lane;
    const ownerPoints = directedPoints(map, owner);
    const ownerHeading = laneHeading(ownerPoints);
    // Positive lateral offset is left of travel; the axis sign of the owner flips that normal.
    // Left normal is +Z for +X travel and -X for +Z travel, so the sign flips on the Z axis.
    const leftSign = axis === 'X' ? Math.cos(ownerHeading) : -Math.sin(ownerHeading);
    const lateral =
      (middle - (axis === 'X' ? ownerPoints[0]!.z : ownerPoints[0]!.x)) * (leftSign >= 0 ? 1 : -1);
    const length = polylineLength(ownerPoints);
    const trim = resolved.markingTrimM;
    const usable =
      length - trim * 2 > 1 ? slicePolyline(ownerPoints, trim, length - trim) : [...ownerPoints];
    planar({
      id: `marking:center:${pairKey}`,
      kind: 'LANE_MARKING',
      sourceType: 'LANE',
      sourceIds: Object.freeze([above.lane.id, below.lane.id]),
      baseYM: resolved.markingElevationM,
      footprintM: Object.freeze(ribbon(usable, resolved.markingWidthM, lateral)),
      topology: 'RIBBON',
      heightM: 0,
      laneId: owner.id,
      intersectionId: null,
      stopLineId: null,
      crosswalkId: null,
      serviceZoneId: null,
      blockId: null,
      paint: 'DASHED',
      markingRole: 'CENTER_LINE',
      lateralOffsetM: lateral,
      longitudinalM: polylineLength(usable) / 2,
      stripeCount: 0,
      stripeAxis: null,
    });
  }

  // Intersection surfaces.
  const intersectionInfo: CityIntersectionInfo[] = [];
  for (const intersection of map.intersections) {
    const surfaceId = `surface:${intersection.id}`;
    planar({
      id: surfaceId,
      kind: 'INTERSECTION_SURFACE',
      sourceType: 'INTERSECTION',
      sourceIds: Object.freeze([intersection.id]),
      baseYM: 0,
      footprintM: Object.freeze(areaPolygon(intersection.geometryId)),
      heightM: 0,
      laneId: null,
      intersectionId: intersection.id,
      stopLineId: null,
      crosswalkId: null,
      serviceZoneId: null,
      blockId: null,
      paint: null,
      markingRole: null,
      lateralOffsetM: null,
      longitudinalM: null,
      stripeCount: 0,
      stripeAxis: null,
    });
    const signal = map.signals.find((candidate) => candidate.intersectionId === intersection.id);
    const stopLineIds = map.stopLines
      .filter((line) => line.intersectionId === intersection.id)
      .map((line) => line.id);
    const type: CityIntersectionType = signal
      ? 'SIGNALIZED'
      : stopLineIds.length > 0
        ? 'STOP_CONTROLLED'
        : 'UNCONTROLLED';
    intersectionInfo.push({
      intersectionId: intersection.id,
      type,
      signalId: signal?.id ?? null,
      surfaceElementId: surfaceId,
      incomingLaneIds: Object.freeze([...intersection.incomingLaneIds]),
      movementIds: Object.freeze(intersection.movements.map((movement) => movement.id)),
      stopLineIds: Object.freeze(stopLineIds),
      signalHeadIds: Object.freeze([]),
    });
  }

  // STOP/SIGNAL/CROSSWALK lines.

  for (const line of map.stopLines) {
    const endpoints = pathNodes(line.geometryId);
    if (endpoints.length !== 2) continue;
    const a = endpoints[0]!;
    const b = endpoints[1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const nx = length === 0 ? 0 : (-dz / length) * (resolved.stopLineThicknessM / 2);
    const nz = length === 0 ? 0 : (dx / length) * (resolved.stopLineThicknessM / 2);
    const id = `line:${line.id}`;
    planar({
      id,
      kind: 'STOP_LINE',
      sourceType: 'STOP_LINE',
      sourceIds: Object.freeze([line.id]),
      baseYM: line.kind === 'CROSSWALK' ? resolved.crosswalkElevationM : resolved.markingElevationM,
      footprintM: Object.freeze([
        point(a.x - nx, a.z - nz),
        point(b.x - nx, b.z - nz),
        point(b.x + nx, b.z + nz),
        point(a.x + nx, a.z + nz),
      ]),
      heightM: 0,
      laneId: line.laneId,
      intersectionId: line.intersectionId,
      stopLineId: line.id,
      stopKind: line.kind,
      crosswalkId: null,
      serviceZoneId: null,
      blockId: null,
      paint: 'SOLID',
      markingRole: null,
      lateralOffsetM: null,
      longitudinalM: null,
      stripeCount: 0,
      stripeAxis: null,
    });
    const info = laneInfo.find((candidate) => candidate.laneId === line.laneId);
    if (info && line.kind !== 'CROSSWALK')
      laneInfo[laneInfo.indexOf(info)] = Object.freeze({ ...info, stopLineId: line.id });
  }

  // Crosswalk bands with a derived zebra count.
  for (const crosswalk of map.crosswalks) {
    const polygon = areaPolygon(crosswalk.geometryId);
    const box = boundsOf(polygon);
    const spanX = box.maxX - box.minX;
    const spanZ = box.maxZ - box.minZ;
    const stripeAxis: 'X' | 'Z' = spanX >= spanZ ? 'X' : 'Z';
    const span = Math.max(spanX, spanZ);
    planar({
      id: `crosswalk:${crosswalk.id}`,
      kind: 'CROSSWALK',
      sourceType: 'CROSSWALK',
      sourceIds: Object.freeze([crosswalk.id]),
      baseYM: resolved.crosswalkElevationM,
      footprintM: Object.freeze(polygon),
      heightM: 0,
      laneId: null,
      intersectionId: null,
      stopLineId: null,
      crosswalkId: crosswalk.id,
      serviceZoneId: null,
      blockId: null,
      paint: 'SOLID',
      markingRole: null,
      lateralOffsetM: null,
      longitudinalM: null,
      stripeCount: Math.max(2, Math.floor(span / resolved.crosswalkStripePitchM)),
      stripeAxis,
    });
  }

  // Service zones.
  for (const zone of map.serviceZones) {
    planar({
      id: `zone:${zone.id}`,
      kind: 'SERVICE_ZONE',
      sourceType: 'SERVICE_ZONE',
      sourceIds: Object.freeze([zone.id]),
      baseYM: resolved.crosswalkElevationM,
      footprintM: Object.freeze(areaPolygon(zone.geometryId)),
      heightM: 0,
      laneId: zone.laneId,
      intersectionId: null,
      stopLineId: null,
      crosswalkId: null,
      serviceZoneId: zone.id,
      blockId: null,
      paint: 'SOLID',
      markingRole: null,
      lateralOffsetM: null,
      longitudinalM: null,
      stripeCount: 0,
      stripeAxis: null,
    });
  }

  // Signal heads: one per incoming lane of every signalized junction.
  const headIdsByIntersection = new Map<string, string[]>();
  for (const signal of map.signals) {
    const intersection = map.intersections.find(
      (candidate) => candidate.id === signal.intersectionId,
    );
    if (!intersection) continue;
    const phase = signal.phases[0];
    for (const laneId of intersection.incomingLaneIds) {
      const lane = map.lanes.find((candidate) => candidate.id === laneId);
      if (!lane) continue;
      const points = directedPoints(map, lane);
      const heading = laneHeading(points);
      const line = (stopLinesByLane.get(laneId) ?? []).find(
        (candidate) => candidate.kind !== 'CROSSWALK',
      );
      const anchor = line ? nodes.get(line.anchorNodeId)! : points[points.length - 1]!;
      const right = { x: Math.sin(heading + Math.PI / 2), z: Math.cos(heading + Math.PI / 2) };
      const setback = lane.widthM / 2 + resolved.signalHeadSetbackM;
      const movementIds = intersection.movements
        .filter((movement) => movement.fromLaneId === laneId)
        .map((movement) => movement.id);

      const stateMovement = movementIds
        .map((id) => phase?.movementStates.find((entry) => entry.movementId === id))
        .find((entry) => entry !== undefined);
      const headId = `head:${signal.id}:${laneId}`;
      headByLane.set(laneId, headId);
      const ids = headIdsByIntersection.get(intersection.id) ?? [];
      ids.push(headId);
      headIdsByIntersection.set(intersection.id, ids);
      push({
        id: headId,
        kind: 'SIGNAL_HEAD',
        sourceType: 'SIGNAL',
        sourceIds: Object.freeze([signal.id, line?.id ?? intersection.id]),
        baseYM: 0,
        positionM: point(anchor.x + right.x * setback, anchor.z + right.z * setback),
        facingRad: normalizeAngle(heading + Math.PI),
        laneId,
        intersectionId: intersection.id,
        signalId: signal.id,
        movementIds: Object.freeze(movementIds),
        lampState: stateMovement?.state ?? 'RED',
        postHeightM: resolved.signalPostHeightM,
        housingWidthM: 0.52,
        housingHeightM: 1.32,
        housingDepthM: 0.42,
      });
    }
  }
  for (const info of intersectionInfo) {
    const heads = headIdsByIntersection.get(info.intersectionId) ?? [];
    intersectionInfo[intersectionInfo.indexOf(info)] = Object.freeze({
      ...info,
      signalHeadIds: Object.freeze(heads),
    });
  }

  // Sidewalks, curbs and buildings derived from the junction grid.
  const blocks = deriveBlocks(map, resolved);
  const blockInfo: CityBlockInfo[] = [];
  for (const block of blocks) {
    const { street, interior } = block;
    planar({
      id: `ground:${block.blockId}`,
      kind: 'GROUND',
      sourceType: 'BLOCK',
      sourceIds: Object.freeze([block.blockId]),
      baseYM: resolved.groundElevationM,
      footprintM: Object.freeze(
        quad(
          (street.minX + street.maxX) / 2,
          (street.minZ + street.maxZ) / 2,
          (street.maxX - street.minX) / 2,
          (street.maxZ - street.minZ) / 2,
        ),
      ),
      heightM: 0,
      laneId: null,
      intersectionId: null,
      stopLineId: null,
      crosswalkId: null,
      serviceZoneId: null,
      blockId: block.blockId,
      paint: null,
      markingRole: null,
      lateralOffsetM: null,
      longitudinalM: null,
      stripeCount: 0,
      stripeAxis: null,
    });
    const strips: { readonly side: 'N' | 'S' | 'E' | 'W'; readonly footprint: Vector3[] }[] = [
      {
        side: 'S',
        footprint: quad(
          (street.minX + street.maxX) / 2,
          (street.minZ + interior.minZ) / 2,
          (street.maxX - street.minX) / 2,
          (interior.minZ - street.minZ) / 2,
        ),
      },
      {
        side: 'N',
        footprint: quad(
          (street.minX + street.maxX) / 2,
          (interior.maxZ + street.maxZ) / 2,
          (street.maxX - street.minX) / 2,
          (street.maxZ - interior.maxZ) / 2,
        ),
      },
      {
        side: 'W',
        footprint: quad(
          (street.minX + interior.minX) / 2,
          (interior.minZ + interior.maxZ) / 2,
          (interior.minX - street.minX) / 2,
          (interior.maxZ - interior.minZ) / 2,
        ),
      },
      {
        side: 'E',
        footprint: quad(
          (interior.maxX + street.maxX) / 2,
          (interior.minZ + interior.maxZ) / 2,
          (street.maxX - interior.maxX) / 2,
          (interior.maxZ - interior.minZ) / 2,
        ),
      },
    ];
    for (const strip of strips) {
      if (strip.footprint.some((vertex) => !Number.isFinite(vertex.x))) continue;
      const walkId = `walk:${block.blockId}:${strip.side}`;
      planar({
        id: walkId,
        kind: 'SIDEWALK',
        sourceType: 'BLOCK',
        sourceIds: Object.freeze([block.blockId]),
        baseYM: resolved.sidewalkElevationM,
        footprintM: Object.freeze(strip.footprint),
        heightM: 0,
        laneId: null,
        intersectionId: null,
        stopLineId: null,
        crosswalkId: null,
        serviceZoneId: null,
        blockId: block.blockId,
        paint: null,
        markingRole: null,
        lateralOffsetM: null,
        longitudinalM: null,
        stripeCount: 0,
        stripeAxis: null,
      });
      const box = boundsOf(strip.footprint);
      const alongX = strip.side === 'N' || strip.side === 'S';
      const curbHalfX = alongX ? (box.maxX - box.minX) / 2 : resolved.curbWidthM / 2;
      const curbHalfZ = alongX ? resolved.curbWidthM / 2 : (box.maxZ - box.minZ) / 2;
      const centerZ =
        strip.side === 'S'
          ? box.minZ + resolved.curbWidthM / 2
          : strip.side === 'N'
            ? box.maxZ - resolved.curbWidthM / 2
            : (box.minZ + box.maxZ) / 2;
      const centerX =
        strip.side === 'W'
          ? box.minX + resolved.curbWidthM / 2
          : strip.side === 'E'
            ? box.maxX - resolved.curbWidthM / 2
            : (box.minX + box.maxX) / 2;
      planar({
        id: `curb:${block.blockId}:${strip.side}`,
        kind: 'CURB',
        sourceType: 'BLOCK',
        sourceIds: Object.freeze([block.blockId]),
        baseYM: resolved.sidewalkElevationM + 0.02,
        footprintM: Object.freeze(quad(centerX, centerZ, curbHalfX, curbHalfZ)),
        heightM: 0.02,
        laneId: null,
        intersectionId: null,
        stopLineId: null,
        crosswalkId: null,
        serviceZoneId: null,
        blockId: block.blockId,
        paint: null,
        markingRole: null,
        lateralOffsetM: null,
        longitudinalM: null,
        stripeCount: 0,
        stripeAxis: null,
      });
    }
    const buildings = createBuildings(block, resolved);
    for (const building of buildings) push(building);
    blockInfo.push({
      blockId: block.blockId,
      intersectionIds: Object.freeze([...block.intersectionIds]),
      buildingElementIds: Object.freeze(buildings.map((building) => building.id)),
    });
  }

  const elementsByKind: Record<CityElementKind, number> = { ...EMPTY_KIND_COUNTS };
  const elementsBySourceType: Record<CitySourceType, number> = { ...EMPTY_SOURCE_COUNTS };
  let footprintVertices = 0;
  for (const element of elements) {
    elementsByKind[element.kind] += 1;
    elementsBySourceType[element.sourceType] += 1;
    if (element.kind !== 'SIGNAL_HEAD') footprintVertices += element.footprintM.length;
  }
  const inventory: CitySourceInventory = Object.freeze({
    lanes: Object.freeze(map.lanes.map((lane) => lane.id)),
    intersections: Object.freeze(map.intersections.map((intersection) => intersection.id)),
    signals: Object.freeze(map.signals.map((signal) => signal.id)),
    stopLines: Object.freeze(map.stopLines.map((line) => line.id)),
    crosswalks: Object.freeze(map.crosswalks.map((crosswalk) => crosswalk.id)),
    serviceZones: Object.freeze(map.serviceZones.map((zone) => zone.id)),
    movements: Object.freeze(
      map.intersections.flatMap((intersection) =>
        intersection.movements.map((movement) => movement.id),
      ),
    ),
    conflictZones: Object.freeze(
      map.intersections.flatMap((intersection) =>
        intersection.conflictZones.map((zone) => zone.id),
      ),
    ),
    recoveryPoints: Object.freeze(map.recoveryPoints.map((recovery) => recovery.id)),
    blocks: Object.freeze(blockInfo.map((block) => block.blockId)),
  });
  const stats: CityLayoutStats = Object.freeze({
    elements: elements.length,
    elementsByKind: Object.freeze(elementsByKind),
    elementsBySourceType: Object.freeze(elementsBySourceType),
    blocks: blockInfo.length,
    buildings: elementsByKind.BUILDING,
    signalHeads: elementsByKind.SIGNAL_HEAD,
    laneMarkings: elementsByKind.LANE_MARKING,
    footprintVertices,
  });

  return Object.freeze({
    mapId: map.mapId,
    boundsM: Object.freeze({ minM: map.bounds.minM, maxM: map.bounds.maxM }),
    elements: Object.freeze(elements),
    lanes: Object.freeze(laneInfo),
    intersections: Object.freeze(intersectionInfo),
    blocks: Object.freeze(blockInfo),
    inventory,
    options: resolved,
    stats,
  });
}

function normalizeAngle(angle: number): number {
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/** Coverage/consistency report: counts by source type plus explicit omissions and phantoms. */
export function createCityLayoutReport(
  layout: CityLayout,
  renderedElementIds?: readonly string[],
): CityLayoutReport {
  const rendered = renderedElementIds ? new Set(renderedElementIds) : null;
  const coveredByType = new Map<CitySourceType, Set<string>>();
  for (const element of layout.elements) {
    const set = coveredByType.get(element.sourceType) ?? new Set<string>();
    for (const id of element.sourceIds) set.add(id);
    coveredByType.set(element.sourceType, set);
  }
  const signalCoveredMovements = new Set<string>();
  for (const element of layout.elements)
    if (element.kind === 'SIGNAL_HEAD')
      for (const id of element.movementIds) signalCoveredMovements.add(id);

  const unrendered: CityUnrenderedSource[] = [];
  const missing = (ids: readonly string[], sourceType: CitySourceType): void => {
    const set = coveredByType.get(sourceType) ?? new Set<string>();
    for (const id of ids)
      if (!set.has(id)) unrendered.push({ id, sourceType, reason: 'SEMANTIC_ONLY' });
  };
  missing(layout.inventory.lanes, 'LANE');
  missing(layout.inventory.intersections, 'INTERSECTION');
  missing(layout.inventory.signals, 'SIGNAL');
  missing(layout.inventory.stopLines, 'STOP_LINE');
  missing(layout.inventory.crosswalks, 'CROSSWALK');
  missing(layout.inventory.serviceZones, 'SERVICE_ZONE');
  for (const id of layout.inventory.movements)
    if (!signalCoveredMovements.has(id))
      unrendered.push({ id, sourceType: 'MOVEMENT', reason: 'SEMANTIC_ONLY' });
  for (const id of layout.inventory.conflictZones)
    unrendered.push({ id, sourceType: 'CONFLICT_ZONE', reason: 'SEMANTIC_ONLY' });
  for (const id of layout.inventory.recoveryPoints)
    unrendered.push({ id, sourceType: 'RECOVERY_POINT', reason: 'SEMANTIC_ONLY' });

  const known = new Set<string>([
    ...layout.inventory.lanes,
    ...layout.inventory.intersections,
    ...layout.inventory.signals,
    ...layout.inventory.stopLines,
    ...layout.inventory.crosswalks,
    ...layout.inventory.serviceZones,
    ...layout.inventory.movements,
    ...layout.inventory.conflictZones,
    ...layout.inventory.recoveryPoints,
    ...layout.inventory.blocks,
  ]);
  const phantomElementIds = layout.elements
    .filter((element) => element.sourceIds.some((id) => !known.has(id)))
    .map((element) => element.id);
  const declared = new Set(layout.elements.map((element) => element.id));
  const missingRenderedElementIds = rendered
    ? layout.elements.filter((element) => !rendered.has(element.id)).map((element) => element.id)
    : [];
  const unknownRenderedElementIds = rendered
    ? [...rendered].filter((id) => !declared.has(id)).sort()
    : [];
  const sourceCounts: Record<CitySourceType, number> = {
    LANE: layout.inventory.lanes.length,
    INTERSECTION: layout.inventory.intersections.length,
    SIGNAL: layout.inventory.signals.length,
    STOP_LINE: layout.inventory.stopLines.length,
    CROSSWALK: layout.inventory.crosswalks.length,
    SERVICE_ZONE: layout.inventory.serviceZones.length,
    MOVEMENT: layout.inventory.movements.length,
    CONFLICT_ZONE: layout.inventory.conflictZones.length,
    RECOVERY_POINT: layout.inventory.recoveryPoints.length,
    BLOCK: layout.inventory.blocks.length,
  };
  const intersectionTypes: Record<CityIntersectionType, number> = {
    SIGNALIZED: 0,
    STOP_CONTROLLED: 0,
    UNCONTROLLED: 0,
  };
  for (const intersection of layout.intersections) intersectionTypes[intersection.type] += 1;
  const roadClasses: Record<CityRoadClass, number> = { ARTERIAL: 0, RESIDENTIAL: 0 };
  for (const lane of layout.lanes) roadClasses[lane.roadClass] += 1;
  return Object.freeze({
    mapId: layout.mapId,
    elements: layout.stats.elements,
    elementsByKind: layout.stats.elementsByKind,
    elementsBySourceType: layout.stats.elementsBySourceType,
    sourceCounts: Object.freeze(sourceCounts),
    intersectionTypes: Object.freeze(intersectionTypes),
    roadClasses: Object.freeze(roadClasses),
    unrendered: Object.freeze(unrendered),
    phantomElementIds: Object.freeze(phantomElementIds),
    missingRenderedElementIds: Object.freeze(missingRenderedElementIds),
    unknownRenderedElementIds: Object.freeze(unknownRenderedElementIds),
    blocks: layout.stats.blocks,
    buildings: layout.stats.buildings,
  });
}

/** Independent recomputation of the expected geometry; returns every detectable mismatch. */
export function verifyCityAlignment(
  input: unknown,
  layout: CityLayout,
): readonly CityAlignmentIssue[] {
  const map = parseRoadMap(input);
  const issues: CityAlignmentIssue[] = [];
  const tolerance = 1e-6;
  const byLane = new Map<string, CityPlanarElement>();
  for (const element of layout.elements)
    if (element.kind === 'LANE_SURFACE' && element.laneId) byLane.set(element.laneId, element);
  if (layout.mapId !== map.mapId)
    issues.push({
      code: 'MAP_ID_MISMATCH',
      sourceId: map.mapId,
      elementId: null,
      detail: `layout ${layout.mapId} derives from another map`,
    });
  const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
  const paths = new Map(map.geometry.paths.map((path) => [path.id, path]));
  for (const lane of map.lanes) {
    const surface = byLane.get(lane.id);
    if (!surface) {
      issues.push({
        code: 'MISSING_LANE_SURFACE',
        sourceId: lane.id,
        elementId: null,
        detail: 'lane has no rendered surface',
      });
      continue;
    }
    const path = paths.get(lane.geometryId)!;
    const ids = lane.direction === 'FORWARD' ? [...path.nodeIds] : [...path.nodeIds].reverse();
    const expected = ids.map((id) => nodes.get(id)!);
    for (const [index, anchor] of expected.entries()) {
      const half = lane.widthM / 2;
      const matches = surface.footprintM.filter(
        (vertex) =>
          Math.abs(Math.hypot(vertex.x - anchor.x, vertex.z - anchor.z) - half) <= tolerance,
      );
      if (matches.length !== 2)
        issues.push({
          code: 'LANE_SURFACE_OFFSET',
          sourceId: lane.id,
          elementId: surface.id,
          detail: `path node ${index} has ${matches.length} edge vertices at ${half} m`,
        });
    }
    if (surface.footprintM.length !== expected.length * 2)
      issues.push({
        code: 'LANE_SURFACE_TOPOLOGY',
        sourceId: lane.id,
        elementId: surface.id,
        detail: `${surface.footprintM.length} vertices for ${expected.length} path nodes`,
      });
  }

  const laneById = new Map(map.lanes.map((lane) => [lane.id, lane]));
  for (const element of layout.elements) {
    if (element.kind !== 'LANE_MARKING') continue;
    const lane = element.laneId ? laneById.get(element.laneId) : undefined;
    if (!lane) {
      issues.push({
        code: 'MARKING_WITHOUT_LANE',
        sourceId: element.sourceIds[0] ?? '',
        elementId: element.id,
        detail: 'marking references an unknown lane',
      });
      continue;
    }
    const lateral = element.lateralOffsetM ?? 0;
    if (element.markingRole === 'CENTER_LINE') {
      // A centre line belongs to the opposing pair and sits in the painted buffer between them.
      if (element.sourceIds.length !== 2) {
        issues.push({
          code: 'CENTER_LINE_SOURCES',
          sourceId: lane.id,
          elementId: element.id,
          detail: 'centre line must reference both opposing lanes',
        });
        continue;
      }
      const partnerId =
        element.sourceIds[0] === lane.id ? element.sourceIds[1] : element.sourceIds[0];
      const partner = partnerId ? laneById.get(partnerId) : undefined;
      if (!partner) {
        issues.push({
          code: 'CENTER_LINE_PARTNER',
          sourceId: partnerId ?? '',
          elementId: element.id,
          detail: 'centre line partner is not a lane',
        });
        continue;
      }
      const start = (id: string): Vector3 => {
        const candidate = laneById.get(id)!;
        const path = paths.get(candidate.geometryId)!;
        const ids = candidate.direction === 'FORWARD' ? path.nodeIds : [...path.nodeIds].reverse();
        return nodes.get(ids[0]!)!;
      };
      const a = start(lane.id);
      const b = start(partner.id);
      const laneHeadingRad = ((): number => {
        const candidate = laneById.get(lane.id)!;
        const path = paths.get(candidate.geometryId)!;
        const ids = candidate.direction === 'FORWARD' ? path.nodeIds : [...path.nodeIds].reverse();
        const first = nodes.get(ids[0]!)!;
        const last = nodes.get(ids[ids.length - 1]!)!;
        return Math.atan2(last.z - first.z, last.x - first.x);
      })();
      const axis: 'X' | 'Z' =
        Math.abs(Math.cos(laneHeadingRad)) >= Math.abs(Math.sin(laneHeadingRad)) ? 'X' : 'Z';
      const crossA = axis === 'X' ? a.z : a.x;
      const crossB = axis === 'X' ? b.z : b.x;
      const middle = (crossA + crossB) / 2;
      const leftSign = axis === 'X' ? Math.cos(laneHeadingRad) : -Math.sin(laneHeadingRad);
      const expected = (middle - crossA) * (leftSign >= 0 ? 1 : -1);
      if (Math.abs(expected - lateral) > tolerance)
        issues.push({
          code: 'CENTER_LINE_MISPLACED',
          sourceId: lane.id,
          elementId: element.id,
          detail: `centre line lateral ${lateral} expected ${expected}`,
        });
      const partnerSurface = byLane.get(partner.id);
      if (!partnerSurface || !byLane.get(lane.id)) continue;
      const pairBox = boundsOf([...byLane.get(lane.id)!.footprintM, ...partnerSurface.footprintM]);
      const center = centroid(element.footprintM);
      if (
        center.x < pairBox.minX - tolerance ||
        center.x > pairBox.maxX + tolerance ||
        center.z < pairBox.minZ - tolerance ||
        center.z > pairBox.maxZ + tolerance
      )
        issues.push({
          code: 'CENTER_LINE_OUTSIDE_PAIR',
          sourceId: lane.id,
          elementId: element.id,
          detail: 'centre line lies outside the opposing lane pair',
        });
      continue;
    }
    if (Math.abs(lateral) > lane.widthM / 2 + tolerance)
      issues.push({
        code: 'MARKING_OUTSIDE_LANE',
        sourceId: lane.id,
        elementId: element.id,
        detail: `lateral ${lateral} exceeds half width ${lane.widthM / 2}`,
      });
    const center = centroid(element.footprintM);
    const surface = byLane.get(lane.id);
    if (!surface) continue;
    const box = boundsOf(surface.footprintM);
    if (
      center.x < box.minX - tolerance ||
      center.x > box.maxX + tolerance ||
      center.z < box.minZ - tolerance ||
      center.z > box.maxZ + tolerance
    )
      issues.push({
        code: 'MARKING_WRONG_LANE',
        sourceId: lane.id,
        elementId: element.id,
        detail: 'marking centre lies outside its lane surface bounds',
      });
    for (const id of element.sourceIds) {
      if (element.sourceType === 'LANE' && !laneById.has(id))
        issues.push({
          code: 'MARKING_PHANTOM_LANE',
          sourceId: id,
          elementId: element.id,
          detail: 'marking source is not a lane',
        });
    }
  }

  // Signal heads: exactly one per incoming lane of a signalized junction, on the stop line.
  for (const signal of map.signals) {
    const intersection = map.intersections.find(
      (candidate) => candidate.id === signal.intersectionId,
    )!;
    for (const laneId of intersection.incomingLaneIds) {
      const heads = layout.elements.filter(
        (element) => element.kind === 'SIGNAL_HEAD' && element.laneId === laneId,
      );
      if (heads.length !== 1) {
        issues.push({
          code: 'SIGNAL_HEAD_COUNT',
          sourceId: laneId,
          elementId: heads[0]?.id ?? null,
          detail: `${heads.length} heads for incoming lane`,
        });
        continue;
      }
      const head = heads[0] as CitySignalHeadElement;
      const line = map.stopLines.find(
        (candidate) => candidate.laneId === laneId && candidate.kind !== 'CROSSWALK',
      );
      if (!line) {
        issues.push({
          code: 'SIGNAL_HEAD_WITHOUT_STOP_LINE',
          sourceId: laneId,
          elementId: head.id,
          detail: 'signalized incoming lane has no SIGNAL stop line',
        });
        continue;
      }
      const anchor = nodes.get(line.anchorNodeId)!;
      const lane = laneById.get(laneId)!;
      const path = paths.get(lane.geometryId)!;
      const ordered = lane.direction === 'FORWARD' ? path.nodeIds : [...path.nodeIds].reverse();
      const from = nodes.get(ordered[0]!)!;
      const to = nodes.get(ordered[ordered.length - 1]!)!;
      const heading = Math.atan2(to.z - from.z, to.x - from.x);
      const setback = lane.widthM / 2 + layout.options.signalHeadSetbackM;
      const expected = {
        x: anchor.x + Math.sin(heading + Math.PI / 2) * setback,
        z: anchor.z + Math.cos(heading + Math.PI / 2) * setback,
      };
      if (Math.hypot(head.positionM.x - expected.x, head.positionM.z - expected.z) > tolerance)
        issues.push({
          code: 'SIGNAL_HEAD_OFFSET',
          sourceId: laneId,
          elementId: head.id,
          detail: `head at ${head.positionM.x},${head.positionM.z} expected ${expected.x},${expected.z}`,
        });
      const expectedFacing = Math.atan2(Math.sin(heading + Math.PI), Math.cos(heading + Math.PI));
      if (
        Math.abs(
          Math.atan2(
            Math.sin(head.facingRad - expectedFacing),
            Math.cos(head.facingRad - expectedFacing),
          ),
        ) > 1e-6
      )
        issues.push({
          code: 'SIGNAL_HEAD_FACING',
          sourceId: laneId,
          elementId: head.id,
          detail: 'head does not face the incoming lane',
        });
      const movements = intersection.movements
        .filter((movement) => movement.fromLaneId === laneId)
        .map((movement) => movement.id);
      if (
        movements.length !== head.movementIds.length ||
        movements.some((id) => !head.movementIds.includes(id))
      )
        issues.push({
          code: 'SIGNAL_HEAD_MOVEMENTS',
          sourceId: laneId,
          elementId: head.id,
          detail: 'head does not cover every movement of its lane',
        });
      if (head.signalId !== signal.id || head.intersectionId !== intersection.id)
        issues.push({
          code: 'SIGNAL_HEAD_IDENTITY',
          sourceId: laneId,
          elementId: head.id,
          detail: 'head signal/intersection identity mismatch',
        });
    }
  }
  const signalized = new Set(map.signals.map((signal) => signal.intersectionId));
  for (const head of layout.elements)
    if (head.kind === 'SIGNAL_HEAD' && !signalized.has(head.intersectionId))
      issues.push({
        code: 'SIGNAL_HEAD_PHANTOM',
        sourceId: head.intersectionId,
        elementId: head.id,
        detail: 'head on an unsignalized junction',
      });

  // Stop lines, crosswalks, service zones and intersections must each have one element.
  const byStopLine = new Map<string, CityPlanarElement>();
  const byCrosswalk = new Map<string, CityPlanarElement>();
  const byZone = new Map<string, CityPlanarElement>();
  const byIntersection = new Map<string, CityPlanarElement>();
  for (const element of layout.elements) {
    if (element.kind === 'STOP_LINE' && element.stopLineId)
      byStopLine.set(element.stopLineId, element);
    if (element.kind === 'CROSSWALK' && element.crosswalkId)
      byCrosswalk.set(element.crosswalkId, element);
    if (element.kind === 'SERVICE_ZONE' && element.serviceZoneId)
      byZone.set(element.serviceZoneId, element);
    if (element.kind === 'INTERSECTION_SURFACE' && element.intersectionId)
      byIntersection.set(element.intersectionId, element);
  }
  for (const line of map.stopLines) {
    const element = byStopLine.get(line.id);
    if (!element) {
      issues.push({
        code: 'MISSING_STOP_LINE',
        sourceId: line.id,
        elementId: null,
        detail: 'stop line has no rendered element',
      });
      continue;
    }
    const path = paths.get(line.geometryId)!;
    const a = nodes.get(path.nodeIds[0]!)!;
    const b = nodes.get(path.nodeIds[1]!)!;
    const center = centroid(element.footprintM);
    if (Math.hypot(center.x - (a.x + b.x) / 2, center.z - (a.z + b.z) / 2) > tolerance)
      issues.push({
        code: 'STOP_LINE_MISPLACED',
        sourceId: line.id,
        elementId: element.id,
        detail: 'line footprint centre is not the authored line midpoint',
      });
  }
  for (const crosswalk of map.crosswalks) {
    const element = byCrosswalk.get(crosswalk.id);
    if (!element) {
      issues.push({
        code: 'MISSING_CROSSWALK',
        sourceId: crosswalk.id,
        elementId: null,
        detail: 'crosswalk has no rendered band',
      });
      continue;
    }
    const polygon = areasPolygon(map, crosswalk.geometryId);
    const expected = boundsOf(polygon);
    const actual = boundsOf(element.footprintM);
    if (
      Math.abs(expected.minX - actual.minX) > tolerance ||
      Math.abs(expected.maxX - actual.maxX) > tolerance ||
      Math.abs(expected.minZ - actual.minZ) > tolerance ||
      Math.abs(expected.maxZ - actual.maxZ) > tolerance
    )
      issues.push({
        code: 'CROSSWALK_MISPLACED',
        sourceId: crosswalk.id,
        elementId: element.id,
        detail: 'crosswalk band does not match the authored area',
      });
  }
  for (const zone of map.serviceZones) {
    const element = byZone.get(zone.id);
    if (!element) {
      issues.push({
        code: 'MISSING_SERVICE_ZONE',
        sourceId: zone.id,
        elementId: null,
        detail: 'service zone has no rendered footprint',
      });
      continue;
    }
    const anchor = nodes.get(zone.anchorNodeId)!;
    const box = boundsOf(element.footprintM);
    if (
      anchor.x < box.minX - tolerance ||
      anchor.x > box.maxX + tolerance ||
      anchor.z < box.minZ - tolerance ||
      anchor.z > box.maxZ + tolerance
    )
      issues.push({
        code: 'SERVICE_ZONE_ANCHOR_OUTSIDE',
        sourceId: zone.id,
        elementId: element.id,
        detail: 'service anchor is outside the rendered footprint',
      });
  }
  for (const intersection of map.intersections) {
    if (!byIntersection.has(intersection.id))
      issues.push({
        code: 'MISSING_INTERSECTION_SURFACE',
        sourceId: intersection.id,
        elementId: null,
        detail: 'junction has no rendered surface',
      });
  }

  // Buildings must stay clear of the drivable surface and of each other.
  const drivable: { readonly id: string; readonly box: ReturnType<typeof boundsOf> }[] = [];
  for (const lane of map.lanes) {
    const surface = byLane.get(lane.id);
    if (surface) drivable.push({ id: lane.id, box: boundsOf(surface.footprintM) });
  }
  for (const element of layout.elements)
    if (element.kind === 'INTERSECTION_SURFACE')
      drivable.push({
        id: element.intersectionId ?? element.id,
        box: boundsOf(element.footprintM),
      });
  const buildings = layout.elements.filter((element) => element.kind === 'BUILDING');
  for (const building of buildings) {
    if (building.kind !== 'BUILDING') continue;
    const box = boundsOf(building.footprintM);
    for (const surface of drivable)
      if (
        box.minX < surface.box.maxX - tolerance &&
        box.maxX > surface.box.minX + tolerance &&
        box.minZ < surface.box.maxZ - tolerance &&
        box.maxZ > surface.box.minZ + tolerance
      )
        issues.push({
          code: 'BUILDING_OVERLAPS_DRIVABLE',
          sourceId: surface.id,
          elementId: building.id,
          detail: 'building footprint intersects the drivable surface',
        });
    for (const other of buildings) {
      if (other.id <= building.id || other.kind !== 'BUILDING') continue;
      const otherBox = boundsOf(other.footprintM);
      if (
        box.minX < otherBox.maxX - tolerance &&
        box.maxX > otherBox.minX + tolerance &&
        box.minZ < otherBox.maxZ - tolerance &&
        box.maxZ > otherBox.minZ + tolerance
      )
        issues.push({
          code: 'BUILDING_OVERLAP',
          sourceId: other.id,
          elementId: building.id,
          detail: 'two buildings overlap',
        });
    }
  }
  return Object.freeze(issues.slice());
}

function areasPolygon(map: RoadMap, id: string): Vector3[] {
  const area = map.geometry.areas.find((candidate) => candidate.id === id);
  if (!area) throw new Error(`Missing area ${id}`);
  const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
  return area.vertexNodeIds.map((nodeId) => nodes.get(nodeId)!);
}
