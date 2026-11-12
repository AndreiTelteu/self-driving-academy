/**
 * PBI 227 — destructible street decor and the drift/ramp/demolition playgrounds.
 *
 * The module owns plain deterministic data and one state machine; it never touches Babylon, the
 * renderer, the physics world or the camera. Consequences follow from that boundary:
 *
 * - one `applyImpact` path receives the physical contact and resolves it identically for MANUAL,
 *   LEARNING and AUTO. The control source is recorded for evidence and is never read to decide an
 *   outcome, so no control source can get a private response.
 * - objects yield through closed `INTACT → MOVED → BROKEN` transitions driven by accumulated impulse
 *   against calibrated thresholds. `BROKEN` is terminal inside a generation; only `reset`/`restore`
 *   reopen it, exactly like a checkpoint reload or a fresh city.
 * - light archetypes release the vehicle with the object's own momentum only, so they cannot act as
 *   invisible walls; large archetypes stay physical obstacles after being displaced and are reported
 *   to the autonomy context through `queryObstacles`, which has no camera input at all.
 * - playground zones (drift pad, ramp, demolition alley) are authored as validated data derived from
 *   the real PBI 042 layout, with explicit entries, routes, edge policies and landmarks.
 */
import {
  choice,
  createStableId,
  fields,
  nullable,
  number,
  readContext,
  record,
  requireContract,
  text,
  tick as readTick,
} from '../sessions';
import type { ContractContext } from '../sessions';
import { parseSimulationEvent } from '../simulation';
import type { EventBus, PublishResult, SimulationEvent } from '../simulation';
import type { Vector3 } from '../vehicles';
import { createSpatialIndex } from './spatial-index';
import type { SpatialIndex } from './spatial-index';
import type { CityLayout, CityPlanarElement } from './city-layout';

export const DESTRUCTIBLE_DECOR_VERSION = '227-destructible-decor-v1';
export const DESTRUCTIBLE_PLAYGROUND_VERSION = '227-playground-v1';
export const DESTRUCTIBLE_BROKEN_EVENT = 'DESTRUCTIBLE_BROKEN';

/** Reference mass used to express a reaction impulse as a vehicle speed loss. Reporting only. */
export const REFERENCE_VEHICLE_MASS_KG = 1400;

export const DESTRUCTIBLE_LIMITS = Object.freeze({
  /** Bounded admission, aligned with the 034 obstacle capacity and the 021 physics admission. */
  maxObjects: 96,
  maxZones: 8,
  maxCollidersPerObject: 1,
  maxBodies: 96,
  maxActiveFragments: 192,
  maxChainDepth: 3,
  maxChainNeighbors: 8,
  chainRadiusM: 2.6,
  /** Momentum absorbed by one light object cannot exceed `massKg * this`. */
  maxReleaseSpeedMps: 12,
  maxDisplacementM: 12,
  maxSnapshotCodeUnits: 65536,
});

export type DestructibleArchetype =
  'FENCE_LIGHT' | 'CONE' | 'CRATE' | 'BIN' | 'DECOR_SIGN' | 'STREET_FURNITURE';
export const destructibleArchetypes: readonly DestructibleArchetype[] = Object.freeze([
  'FENCE_LIGHT',
  'CONE',
  'CRATE',
  'BIN',
  'DECOR_SIGN',
  'STREET_FURNITURE',
]);

export type DestructibleState = 'INTACT' | 'MOVED' | 'BROKEN';
export type ObstacleClass = 'LIGHT' | 'LARGE';
export type FragmentPreset = 'NONE' | 'PLANKS' | 'DISCS' | 'CUBES' | 'SHARDS';
export type PresentationPreset = 'LOW' | 'MEDIUM' | 'HIGH';
export type ResetPolicy = 'RESET_TO_INITIAL' | 'KEEP_STATE';
export type ImpactControlSource = 'MANUAL' | 'LEARNING' | 'AUTO';

export interface DestructibleArchetypeSpec {
  readonly archetype: DestructibleArchetype;
  readonly massKg: number;
  readonly obstacleClass: ObstacleClass;
  /** Object speed at which the object starts to slide: `moveImpulseNs = massKg * moveSpeedMps`. */
  readonly moveSpeedMps: number;
  /** Object speed at which the object breaks: `breakImpulseNs = massKg * breakSpeedMps`. */
  readonly breakSpeedMps: number;
  readonly colliderRadiusM: number;
  readonly colliderHeightM: number;
  readonly fragmentPreset: FragmentPreset;
  readonly fragmentCount: number;
}

/**
 * Provisional calibration table. A contact impulse of `m · Δv` is the momentum the object itself
 * receives, so the thresholds are the object speeds at which it is pushed and destroyed. The numbers
 * are playtest proposals (module 26), not a hardware measurement, and the report labels them
 * `PROVISIONAL_UNCALIBRATED` until the 224 workload validates them.
 */
export const DESTRUCTIBLE_ARCHETYPES: Readonly<
  Record<DestructibleArchetype, DestructibleArchetypeSpec>
> = Object.freeze({
  FENCE_LIGHT: Object.freeze({
    archetype: 'FENCE_LIGHT',
    massKg: 26,
    obstacleClass: 'LARGE',
    moveSpeedMps: 0.6,
    breakSpeedMps: 4.5,
    colliderRadiusM: 0.9,
    colliderHeightM: 1.1,
    fragmentPreset: 'PLANKS',
    fragmentCount: 4,
  }),
  CONE: Object.freeze({
    archetype: 'CONE',
    massKg: 5,
    obstacleClass: 'LIGHT',
    moveSpeedMps: 0.25,
    breakSpeedMps: 7.5,
    colliderRadiusM: 0.35,
    colliderHeightM: 0.7,
    fragmentPreset: 'DISCS',
    fragmentCount: 3,
  }),
  CRATE: Object.freeze({
    archetype: 'CRATE',
    massKg: 18,
    obstacleClass: 'LIGHT',
    moveSpeedMps: 0.4,
    breakSpeedMps: 5.5,
    colliderRadiusM: 0.5,
    colliderHeightM: 0.8,
    fragmentPreset: 'CUBES',
    fragmentCount: 4,
  }),
  BIN: Object.freeze({
    archetype: 'BIN',
    massKg: 22,
    obstacleClass: 'LIGHT',
    moveSpeedMps: 0.35,
    breakSpeedMps: 5,
    colliderRadiusM: 0.4,
    colliderHeightM: 1,
    fragmentPreset: 'SHARDS',
    fragmentCount: 3,
  }),
  DECOR_SIGN: Object.freeze({
    archetype: 'DECOR_SIGN',
    massKg: 12,
    obstacleClass: 'LIGHT',
    moveSpeedMps: 0.3,
    breakSpeedMps: 6,
    colliderRadiusM: 0.35,
    colliderHeightM: 2.4,
    fragmentPreset: 'SHARDS',
    fragmentCount: 2,
  }),
  STREET_FURNITURE: Object.freeze({
    archetype: 'STREET_FURNITURE',
    massKg: 45,
    obstacleClass: 'LARGE',
    moveSpeedMps: 0.5,
    breakSpeedMps: 4,
    colliderRadiusM: 0.7,
    colliderHeightM: 0.9,
    fragmentPreset: 'PLANKS',
    fragmentCount: 4,
  }),
});

/** Presentation budgets only; they never change states, events, damage or obstacle reports. */
export const PRESENTATION_FRAGMENT_BUDGET: Readonly<Record<PresentationPreset, number>> =
  Object.freeze({ LOW: 1, MEDIUM: 2, HIGH: 4 });

export const FRAGMENT_LIFETIME_TICKS = 120;
const CHAIN_TRANSFER_RATIO = 0.35;
const SLIDING_FRICTION = 0.6;
const GRAVITY_MPS2 = 9.81;
const ALLEY_SPACING_M = 6;
const ALLEY_END_MARGIN_M = 3;

export interface DestructibleTransform {
  readonly positionM: Vector3;
  readonly headingRad: number;
}
export interface DestructibleCollider {
  readonly shape: 'CYLINDER' | 'BOX';
  readonly radiusM: number;
  readonly heightM: number;
}
export interface DestructibleImpactThreshold {
  readonly moveImpulseNs: number;
  readonly breakImpulseNs: number;
}
export interface DestructibleDefinition {
  readonly objectId: string;
  readonly archetype: DestructibleArchetype;
  readonly zoneId: string | null;
  readonly initialTransform: DestructibleTransform;
  readonly collider: DestructibleCollider;
  readonly massKg: number;
  readonly impactThreshold: DestructibleImpactThreshold;
  readonly responseKind: 'DISPLACE_THEN_BREAK';
  readonly fragmentPreset: FragmentPreset;
  readonly resetPolicy: ResetPolicy;
}

export type PlayZoneKind = 'DRIFT_PAD' | 'RAMP' | 'DEMOLITION_ALLEY';
export type PlayZoneEdgePolicy = 'REDIRECT_TO_ENTRY' | 'CONTINUE_IN_LANE' | 'STOP_AT_EDGE';
export interface PlayZoneEntry {
  readonly entryId: string;
  readonly laneId: string | null;
  readonly positionM: Vector3;
  readonly headingRad: number;
}
export interface PlayZoneRoute {
  readonly routeId: string;
  readonly waypointsM: readonly Vector3[];
  readonly loop: boolean;
}
export interface RampProfile {
  readonly lengthM: number;
  readonly widthM: number;
  readonly riseM: number;
  readonly approachHeadingRad: number;
}
export interface DriftProfile {
  readonly radiusM: number;
}
export interface DestructiblePlayZone {
  readonly zoneId: string;
  readonly kind: PlayZoneKind;
  readonly label: string;
  readonly polygonM: readonly Vector3[];
  readonly centerM: Vector3;
  readonly headingRad: number;
  readonly entries: readonly PlayZoneEntry[];
  readonly routes: readonly PlayZoneRoute[];
  readonly edgePolicy: PlayZoneEdgePolicy;
  /** Stable ids of real layout entities that act as visual landmarks. */
  readonly landmarks: readonly string[];
  readonly ramp: RampProfile | null;
  readonly drift: DriftProfile | null;
  readonly destructibleIds: readonly string[];
}

export interface PlaygroundStats {
  readonly zones: number;
  readonly zonesByKind: Readonly<Record<PlayZoneKind, number>>;
  readonly entries: number;
  readonly routes: number;
  readonly drivableEntries: number;
  readonly destructibles: number;
  readonly landmarks: number;
}
export interface DestructiblePlayground {
  readonly version: typeof DESTRUCTIBLE_PLAYGROUND_VERSION;
  readonly mapId: string;
  readonly zones: readonly DestructiblePlayZone[];
  readonly definitions: readonly DestructibleDefinition[];
  readonly stats: PlaygroundStats;
}

export interface DestructibleObjectState {
  readonly objectId: string;
  readonly archetype: DestructibleArchetype;
  readonly state: DestructibleState;
  readonly damageNs: number;
  readonly positionM: Vector3;
  readonly headingRad: number;
  readonly bodyAdmitted: boolean;
  readonly obstacleClass: ObstacleClass;
  readonly displacementM: number;
}

export interface DestructibleSnapshotObject {
  readonly objectId: string;
  readonly state: DestructibleState;
  readonly damageNs: number;
  readonly positionM: Vector3;
  readonly headingRad: number;
}
export interface DestructibleSnapshot {
  readonly version: typeof DESTRUCTIBLE_DECOR_VERSION;
  readonly mapId: string;
  readonly sessionId: string;
  readonly worldEpoch: number;
  readonly generation: number;
  readonly objects: readonly DestructibleSnapshotObject[];
  readonly checksum: string;
}

export interface DestructibleContact {
  readonly tick: number;
  readonly objectId: string;
  readonly impulseNs: number;
  /** Physical contact point; it defines the push direction, never a control source. */
  readonly pointM: Vector3;
  readonly instigatorId: string | null;
  readonly controlSource: ImpactControlSource;
}
export interface DestructibleReaction {
  readonly impulseNs: number;
  /** True when the object stays a physical obstacle after this contact. */
  readonly blocking: boolean;
  /** Reaction impulse expressed on the reference vehicle mass, for the "not a wall" evidence. */
  readonly vehicleDeltaVMps: number;
}
export interface DestructibleImpactResult {
  readonly tick: number;
  readonly objectId: string;
  readonly archetype: DestructibleArchetype;
  readonly previousState: DestructibleState;
  readonly state: DestructibleState;
  readonly changedState: boolean;
  readonly damageNs: number;
  readonly impactThreshold: DestructibleImpactThreshold;
  readonly reaction: DestructibleReaction;
  readonly eventId: string | null;
  readonly event: SimulationEvent | null;
  readonly publication: PublishResult | null;
  readonly chain: readonly DestructibleImpactResult[];
}

export interface ObstacleReport {
  readonly objectId: string;
  readonly archetype: DestructibleArchetype;
  readonly state: DestructibleState;
  readonly positionM: Vector3;
  readonly radiusM: number;
  readonly displaced: boolean;
  readonly displacementM: number;
}
export interface ObstacleQuery {
  readonly centerM: Vector3;
  readonly radiusM: number;
}

export interface PlayZoneEdgeResult {
  readonly zoneId: string;
  readonly kind: PlayZoneKind;
  readonly inside: boolean;
  readonly distanceToEdgeM: number;
  readonly action: 'NONE' | PlayZoneEdgePolicy;
  readonly redirectEntryId: string | null;
}

export interface DestructibleDecorStats {
  readonly tick: number;
  readonly generation: number;
  readonly objects: number;
  readonly states: Readonly<Record<DestructibleState, number>>;
  readonly bodies: number;
  readonly colliders: number;
  readonly fragments: number;
  readonly indexEntries: number;
  readonly indexCells: number;
  readonly evaluatedObjects: number;
  readonly impacts: number;
  readonly impactsBySource: Readonly<Record<ImpactControlSource, number>>;
  readonly brokenEvents: number;
  readonly duplicateBreaks: number;
  readonly chainBreaks: number;
  readonly resets: number;
  readonly preset: PresentationPreset;
  readonly disposed: boolean;
}
export interface DestructibleResetReport {
  readonly generation: number;
  readonly restored: number;
  readonly kept: number;
  readonly bodies: number;
  readonly colliders: number;
  readonly fragments: number;
}

export interface DestructibleDecor {
  getDefinitions(): readonly DestructibleDefinition[];
  getZones(): readonly DestructiblePlayZone[];
  getState(objectId: string): DestructibleObjectState;
  applyImpact(contact: DestructibleContact): DestructibleImpactResult;
  queryObstacles(query: ObstacleQuery): readonly ObstacleReport[];
  evaluateZoneEdge(zoneId: string, positionM: Vector3): PlayZoneEdgeResult;
  capture(): DestructibleSnapshot;
  restore(snapshot: unknown): readonly DestructibleObjectState[];
  reset(): DestructibleResetReport;
  advance(tick: number): number;
  setPresentationPreset(preset: PresentationPreset): void;
  getStats(): DestructibleDecorStats;
  dispose(): void;
}

/* -------------------------------------------------------------------------------------------------
 * Small deterministic geometry helpers (2D; y is carried only for elevation).
 * ---------------------------------------------------------------------------------------------- */

function point(x: number, z: number, y = 0): Vector3 {
  return Object.freeze({ x, y, z });
}
function readPoint(value: unknown, minimum = -1e6, maximum = 1e6): Vector3 {
  const data = fields(value, ['x', 'y', 'z']);
  return point(
    number(data.x, minimum, maximum),
    number(data.z, minimum, maximum),
    number(data.y, minimum, maximum),
  );
}
function distance2D(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
function midpoint(a: Vector3, b: Vector3): Vector3 {
  return point((a.x + b.x) / 2, (a.z + b.z) / 2, (a.y + b.y) / 2);
}
function headingOf(a: Vector3, b: Vector3): number {
  return Math.atan2(b.z - a.z, b.x - a.x);
}
function centroidOf(points: readonly Vector3[]): Vector3 {
  let x = 0;
  let z = 0;
  let y = 0;
  for (const vertex of points) {
    x += vertex.x;
    z += vertex.z;
    y += vertex.y;
  }
  return point(x / points.length, z / points.length, y / points.length);
}
function boundsOf(points: readonly Vector3[]) {
  return {
    minX: Math.min(...points.map((vertex) => vertex.x)),
    maxX: Math.max(...points.map((vertex) => vertex.x)),
    minZ: Math.min(...points.map((vertex) => vertex.z)),
    maxZ: Math.max(...points.map((vertex) => vertex.z)),
  };
}
function polygonArea(points: readonly Vector3[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    area += a.x * b.z - b.x * a.z;
  }
  return Math.abs(area) / 2;
}
function insidePolygon(p: Vector3, polygon: readonly Vector3[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x)
      inside = !inside;
  }
  return inside;
}
function distanceToSegment(p: Vector3, a: Vector3, b: Vector3): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = dx * dx + dz * dz;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}
function distanceToPolygonEdge(p: Vector3, polygon: readonly Vector3[]): number {
  let best = Infinity;
  for (let index = 0; index < polygon.length; index += 1)
    best = Math.min(
      best,
      distanceToSegment(p, polygon[index]!, polygon[(index + 1) % polygon.length]!),
    );
  return best;
}
function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  const rounded = Math.round(value * scale) / scale;
  return Object.is(rounded, -0) ? 0 : rounded;
}
function sortedIds<T extends { readonly objectId: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => (left.objectId < right.objectId ? -1 : 1));
}
function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/* -------------------------------------------------------------------------------------------------
 * Layout derivation: drivable surfaces, ribbons, sidewalks and the three playground zones.
 * ---------------------------------------------------------------------------------------------- */

type Planar = CityPlanarElement;
const DRIVABLE_KINDS: readonly Planar['kind'][] = Object.freeze([
  'LANE_SURFACE',
  'INTERSECTION_SURFACE',
]);
const SIDEWALK_KINDS: readonly Planar['kind'][] = Object.freeze(['SIDEWALK']);

function planarElements(layout: CityLayout, kinds: readonly Planar['kind'][]): Planar[] {
  return layout.elements.filter(
    (element): element is Planar => element.kind !== 'SIGNAL_HEAD' && kinds.includes(element.kind),
  );
}
/** Centreline of a ribbon element: pair each left vertex with its opposite right vertex. */
export function ribbonCenterline(element: Planar): readonly Vector3[] {
  const n = element.footprintM.length;
  if (n < 4 || n % 2 !== 0) return Object.freeze([centroidOf(element.footprintM)]);
  const half = n / 2;
  const points: Vector3[] = [];
  for (let index = 0; index < half; index += 1)
    points.push(midpoint(element.footprintM[index]!, element.footprintM[n - 1 - index]!));
  return Object.freeze(points);
}
function polylineLength(points: readonly Vector3[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1)
    total += distance2D(points[index - 1]!, points[index]!);
  return total;
}
function samplePolyline(
  points: readonly Vector3[],
  fraction: number,
): { positionM: Vector3; headingRad: number } {
  const total = polylineLength(points);
  const target = Math.max(0, Math.min(1, fraction)) * total;
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const length = distance2D(a, b);
    if (length === 0) continue;
    if (walked + length >= target || index === points.length - 1) {
      const t = Math.max(0, Math.min(1, (target - walked) / length));
      return {
        positionM: point(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, a.y + (b.y - a.y) * t),
        headingRad: headingOf(a, b),
      };
    }
    walked += length;
  }
  const only = points[0] ?? point(0, 0);
  return { positionM: only, headingRad: 0 };
}
/** Long axis of a closed quad; the two shortest opposite edges are its ends. */
function quadAxis(element: Planar): { start: Vector3; end: Vector3; headingRad: number } {
  const points = element.footprintM;
  if (points.length !== 4) {
    const box = boundsOf(points);
    const start = point(box.minX, box.minZ);
    const end = point(box.maxX, box.maxZ);
    return { start, end, headingRad: headingOf(start, end) };
  }
  const edges = points.map((vertex, index) => {
    const next = points[(index + 1) % points.length]!;
    return { a: vertex, b: next, length: distance2D(vertex, next) };
  });
  const shortest = [...edges].sort((left, right) => left.length - right.length).slice(0, 2);
  const [first, second] = shortest;
  const start = midpoint(first!.a, first!.b);
  const end = midpoint(second!.a, second!.b);
  return { start, end, headingRad: headingOf(start, end) };
}
function insetQuad(points: readonly Vector3[], insetM: number): Vector3[] {
  const center = centroidOf(points);
  return points.map((vertex) => {
    const dx = center.x - vertex.x;
    const dz = center.z - vertex.z;
    const length = Math.hypot(dx, dz);
    if (length === 0) return point(vertex.x, vertex.z, vertex.y);
    const factor = Math.max(0, length - insetM) / length;
    return point(center.x - dx * factor, center.z - dz * factor, vertex.y);
  });
}
function rectangleAround(start: Vector3, end: Vector3, widthM: number): Vector3[] {
  const heading = headingOf(start, end);
  const nx = -Math.sin(heading) * (widthM / 2);
  const nz = Math.cos(heading) * (widthM / 2);
  return [
    point(start.x + nx, start.z + nz),
    point(end.x + nx, end.z + nz),
    point(end.x - nx, end.z - nz),
    point(start.x - nx, start.z - nz),
  ];
}
function nearestLanePoint(
  layout: CityLayout,
  target: Vector3,
): { laneId: string; positionM: Vector3; headingRad: number; distanceM: number } | null {
  let best: { laneId: string; positionM: Vector3; headingRad: number; distanceM: number } | null =
    null;
  for (const element of planarElements(layout, ['LANE_SURFACE'])) {
    const ribbon = ribbonCenterline(element);
    for (let index = 1; index < ribbon.length; index += 1) {
      const a = ribbon[index - 1]!;
      const b = ribbon[index]!;
      const length = distance2D(a, b);
      if (length === 0) continue;
      const steps = Math.max(1, Math.ceil(length / 2));
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const positionM = point(
          a.x + (b.x - a.x) * t,
          a.z + (b.z - a.z) * t,
          a.y + (b.y - a.y) * t,
        );
        const distanceM = distance2D(positionM, target);
        if (best === null || distanceM < best.distanceM)
          best = {
            laneId: element.laneId ?? element.id,
            positionM,
            headingRad: headingOf(a, b),
            distanceM,
          };
      }
    }
  }
  return best;
}
function onDrivableSurface(layout: CityLayout, positionM: Vector3): boolean {
  for (const element of planarElements(layout, DRIVABLE_KINDS))
    if (insidePolygon(positionM, element.footprintM)) return true;
  return false;
}

function edgePolicyFor(kind: PlayZoneKind): PlayZoneEdgePolicy {
  if (kind === 'DRIFT_PAD') return 'REDIRECT_TO_ENTRY';
  if (kind === 'RAMP') return 'CONTINUE_IN_LANE';
  return 'STOP_AT_EDGE';
}

function driftZone(layout: CityLayout): DestructiblePlayZone {
  const pads = planarElements(layout, ['INTERSECTION_SURFACE']);
  requireContract(pads.length > 0, 'The layout has no junction surface for the drift pad');
  const pad = [...pads].sort((left, right) => {
    const boxLeft = boundsOf(left.footprintM);
    const boxRight = boundsOf(right.footprintM);
    const areaLeft = (boxLeft.maxX - boxLeft.minX) * (boxLeft.maxZ - boxLeft.minZ);
    const areaRight = (boxRight.maxX - boxRight.minX) * (boxRight.maxZ - boxRight.minZ);
    return areaRight - areaLeft || stableCompare(left.id, right.id);
  })[0]!;
  const zoom = 1.4;
  const polygon = insetQuad(pad.footprintM, zoom);
  const centerM = centroidOf(polygon);
  const box = boundsOf(polygon);
  const lane = nearestLanePoint(layout, centerM);
  const headingRad = lane?.headingRad ?? 0;
  const quarterX = (box.maxX - box.minX) / 4;
  const quarterZ = (box.maxZ - box.minZ) / 4;
  const entries = Object.freeze([
    Object.freeze({
      entryId: `entry:${pad.id}:west`,
      laneId: lane?.laneId ?? null,
      positionM: point(box.minX + quarterX, centerM.z),
      headingRad,
    }),
    Object.freeze({
      entryId: `entry:${pad.id}:east`,
      laneId: lane?.laneId ?? null,
      positionM: point(box.maxX - quarterX, centerM.z),
      headingRad: headingRad + Math.PI,
    }),
  ]);
  const routes = Object.freeze([
    Object.freeze({
      routeId: `route:${pad.id}:loop`,
      waypointsM: Object.freeze([
        point(centerM.x - quarterX, centerM.z - quarterZ),
        point(centerM.x + quarterX, centerM.z - quarterZ),
        point(centerM.x + quarterX, centerM.z + quarterZ),
        point(centerM.x - quarterX, centerM.z + quarterZ),
      ]),
      loop: true,
    }),
    Object.freeze({
      routeId: `route:${pad.id}:figure-eight`,
      waypointsM: Object.freeze([
        point(centerM.x - quarterX, centerM.z),
        point(centerM.x, centerM.z + quarterZ),
        point(centerM.x + quarterX, centerM.z),
        point(centerM.x, centerM.z - quarterZ),
      ]),
      loop: true,
    }),
  ]);
  return Object.freeze({
    zoneId: `zone:drift:${pad.id}`,
    kind: 'DRIFT_PAD' as const,
    label: 'Parcare pentru derapaje',
    polygonM: Object.freeze(polygon),
    centerM,
    headingRad,
    entries,
    routes,
    edgePolicy: edgePolicyFor('DRIFT_PAD'),
    landmarks: Object.freeze([pad.id]),
    ramp: null,
    drift: Object.freeze({ radiusM: Math.min(quarterX, quarterZ) }),
    destructibleIds: Object.freeze([]),
  });
}

function rampZone(layout: CityLayout): DestructiblePlayZone {
  const lanes = planarElements(layout, ['LANE_SURFACE'])
    .map((element) => ({ element, lengthM: polylineLength(ribbonCenterline(element)) }))
    .filter((entry) => entry.lengthM >= 60)
    .sort(
      (left, right) =>
        right.lengthM - left.lengthM || stableCompare(left.element.id, right.element.id),
    );
  requireContract(lanes.length > 0, 'The layout has no lane long enough for the ramp');
  const lane = lanes[0]!;
  const ribbon = ribbonCenterline(lane.element);
  const approach = samplePolyline(ribbon, 0.55);
  const landing = samplePolyline(ribbon, 1);
  /** Narrower than a full lane so a bypass stays possible; the value lives in the zone data. */
  const widthM = 3.2;
  const polygon = rectangleAround(approach.positionM, landing.positionM, widthM);
  const centerM = centroidOf(polygon);
  const headingRad = headingOf(approach.positionM, landing.positionM);
  const lengthM = Math.min(12, Math.max(6, distance2D(approach.positionM, landing.positionM) / 2));
  const entries = Object.freeze([
    Object.freeze({
      entryId: `entry:${lane.element.id}:approach`,
      laneId: lane.element.laneId,
      positionM: approach.positionM,
      headingRad,
    }),
    Object.freeze({
      entryId: `entry:${lane.element.id}:run-in`,
      laneId: lane.element.laneId,
      positionM: samplePolyline(ribbon, 0.4).positionM,
      headingRad,
    }),
  ]);
  const routes = Object.freeze([
    Object.freeze({
      routeId: `route:${lane.element.id}:jump`,
      waypointsM: Object.freeze([
        samplePolyline(ribbon, 0.4).positionM,
        approach.positionM,
        landing.positionM,
      ]),
      loop: false,
    }),
    Object.freeze({
      routeId: `route:${lane.element.id}:retry`,
      waypointsM: Object.freeze([landing.positionM, samplePolyline(ribbon, 0.3).positionM]),
      loop: false,
    }),
  ]);
  return Object.freeze({
    zoneId: `zone:ramp:${lane.element.id}`,
    kind: 'RAMP' as const,
    label: 'Rampă de lansare',
    polygonM: Object.freeze(polygon),
    centerM,
    headingRad,
    entries,
    routes,
    edgePolicy: edgePolicyFor('RAMP'),
    landmarks: Object.freeze([lane.element.id]),
    ramp: Object.freeze({ lengthM, widthM, riseM: 0.6, approachHeadingRad: headingRad }),
    drift: null,
    destructibleIds: Object.freeze([]),
  });
}

function alleyZone(layout: CityLayout): { zone: DestructiblePlayZone; element: Planar } {
  const sidewalks = planarElements(layout, SIDEWALK_KINDS)
    .map((element) => {
      const axis = quadAxis(element);
      return { element, axis, lengthM: distance2D(axis.start, axis.end) };
    })
    .filter((entry) => entry.lengthM >= 24)
    .sort(
      (left, right) =>
        right.lengthM - left.lengthM || stableCompare(left.element.id, right.element.id),
    );
  requireContract(sidewalks.length > 0, 'The layout has no sidewalk long enough for the alley');
  const alley = sidewalks[0]!;
  const polygon = insetQuad(alley.element.footprintM, 0.25);
  const centerM = centroidOf(polygon);
  const { headingRad } = alley.axis;
  const startLane = nearestLanePoint(layout, alley.axis.start);
  const endLane = nearestLanePoint(layout, alley.axis.end);
  requireContract(
    startLane !== null && endLane !== null,
    'The alley has no adjacent drivable lane',
  );
  const entries = Object.freeze([
    Object.freeze({
      entryId: `entry:${alley.element.id}:start`,
      laneId: startLane!.laneId,
      positionM: startLane!.positionM,
      headingRad: startLane!.headingRad,
    }),
    Object.freeze({
      entryId: `entry:${alley.element.id}:end`,
      laneId: endLane!.laneId,
      positionM: endLane!.positionM,
      headingRad: endLane!.headingRad,
    }),
  ]);
  const routes = Object.freeze([
    Object.freeze({
      routeId: `route:${alley.element.id}:run`,
      waypointsM: Object.freeze([alley.axis.start, centerM, alley.axis.end]),
      loop: false,
    }),
    Object.freeze({
      routeId: `route:${alley.element.id}:retry`,
      waypointsM: Object.freeze([alley.axis.end, alley.axis.start]),
      loop: false,
    }),
  ]);
  return {
    element: alley.element,
    zone: Object.freeze({
      zoneId: `zone:alley:${alley.element.id}`,
      kind: 'DEMOLITION_ALLEY' as const,
      label: 'Aleea demolării',
      polygonM: Object.freeze(polygon),
      centerM,
      headingRad,
      entries,
      routes,
      edgePolicy: edgePolicyFor('DEMOLITION_ALLEY'),
      landmarks: Object.freeze([alley.element.id]),
      ramp: null,
      drift: null,
      destructibleIds: Object.freeze([]),
    }),
  };
}

function alleyDefinitions(zone: DestructiblePlayZone, element: Planar): DestructibleDefinition[] {
  const axis = quadAxis(element);
  const length = distance2D(axis.start, axis.end);
  const heading = axis.headingRad;
  const forward = {
    x: Math.cos(heading),
    z: Math.sin(heading),
  };
  const left = { x: -Math.sin(heading), z: Math.cos(heading) };
  const offsets = [-0.55, 0, 0.55];
  const placements: { distanceM: number; lateralM: number; archetype: DestructibleArchetype }[] =
    [];
  const count = Math.max(6, Math.floor((length - ALLEY_END_MARGIN_M * 2) / ALLEY_SPACING_M) + 1);
  for (let index = 0; index < count; index += 1) {
    const distanceM = Math.min(
      length - ALLEY_END_MARGIN_M,
      ALLEY_END_MARGIN_M + index * ALLEY_SPACING_M,
    );
    placements.push({
      distanceM,
      lateralM: offsets[index % offsets.length]!,
      archetype: destructibleArchetypes[index % destructibleArchetypes.length]!,
    });
    // Every fourth position also carries a tight bundle, so a genuine chain contact exists while
    // the rest of the alley keeps a normal spacing. Bundles stay inside the same zone polygon.
    if (index % 4 === 1)
      placements.push({
        distanceM: Math.min(length - ALLEY_END_MARGIN_M, distanceM + 1.2),
        lateralM: -offsets[(index + 1) % offsets.length]!,
        archetype: destructibleArchetypes[(index + 1) % destructibleArchetypes.length]!,
      });
  }
  const definitions: DestructibleDefinition[] = [];
  for (const [index, placement] of placements.entries()) {
    const archetype = placement.archetype;
    const spec = DESTRUCTIBLE_ARCHETYPES[archetype];
    const positionM = point(
      axis.start.x + forward.x * placement.distanceM + left.x * placement.lateralM,
      axis.start.z + forward.z * placement.distanceM + left.z * placement.lateralM,
    );
    definitions.push(
      Object.freeze({
        objectId: `destructible:${zone.zoneId}:${archetype.toLowerCase()}:${index}`,
        archetype,
        zoneId: zone.zoneId,
        initialTransform: Object.freeze({ positionM, headingRad: heading }),
        collider: Object.freeze({
          shape: 'BOX' as const,
          radiusM: spec.colliderRadiusM,
          heightM: spec.colliderHeightM,
        }),
        massKg: spec.massKg,
        impactThreshold: Object.freeze({
          moveImpulseNs: round(spec.massKg * spec.moveSpeedMps, 3),
          breakImpulseNs: round(spec.massKg * spec.breakSpeedMps, 3),
        }),
        responseKind: 'DISPLACE_THEN_BREAK' as const,
        fragmentPreset: spec.fragmentPreset,
        resetPolicy: 'RESET_TO_INITIAL' as const,
      }),
    );
  }
  return definitions;
}

/**
 * Derive the three playground zones and the alley destructibles from the real layout. Nothing is
 * hardcoded in a scene: entries, routes, edge policies, ramp profile and landmark ids are data that
 * a renderer or an autonomy context can consume without re-deriving them.
 */
export function createDestructiblePlayground(layout: CityLayout): DestructiblePlayground {
  requireContract(
    typeof layout === 'object' && layout !== null && Array.isArray(layout.elements),
    'The playground needs a city layout',
  );
  const drift = driftZone(layout);
  const ramp = rampZone(layout);
  const alley = alleyZone(layout);
  const definitions = alleyDefinitions(alley.zone, alley.element);
  const zone: DestructiblePlayZone = Object.freeze({
    ...alley.zone,
    destructibleIds: Object.freeze(definitions.map((definition) => definition.objectId)),
  });
  const zones = Object.freeze([drift, ramp, zone]);
  const zonesByKind: Record<PlayZoneKind, number> = { DRIFT_PAD: 0, RAMP: 0, DEMOLITION_ALLEY: 0 };
  let entries = 0;
  let routes = 0;
  let drivableEntries = 0;
  let landmarks = 0;
  for (const entry of zones) {
    zonesByKind[entry.kind] += 1;
    entries += entry.entries.length;
    routes += entry.routes.length;
    landmarks += entry.landmarks.length;
    for (const zoneEntry of entry.entries)
      if (onDrivableSurface(layout, zoneEntry.positionM)) drivableEntries += 1;
  }
  return Object.freeze({
    version: DESTRUCTIBLE_PLAYGROUND_VERSION,
    mapId: layout.mapId,
    zones,
    definitions: Object.freeze(definitions),
    stats: Object.freeze({
      zones: zones.length,
      zonesByKind: Object.freeze(zonesByKind),
      entries,
      routes,
      drivableEntries,
      destructibles: definitions.length,
      landmarks,
    }),
  });
}

export interface PlaygroundReport {
  readonly issues: readonly string[];
  readonly zones: number;
  readonly drivableEntries: number;
  readonly routes: number;
  readonly destructibles: number;
}
/** Independent consistency check of a playground plan, used by tests and by the report. */
export function verifyDestructiblePlayground(
  plan: DestructiblePlayground,
  layout: CityLayout,
): PlaygroundReport {
  const issues: string[] = [];
  if (plan.mapId !== layout.mapId) issues.push(`playground map ${plan.mapId} is foreign`);
  if (plan.zones.length !== 3) issues.push(`expected three zones, found ${plan.zones.length}`);
  const kinds = new Set(plan.zones.map((zone) => zone.kind));
  for (const kind of ['DRIFT_PAD', 'RAMP', 'DEMOLITION_ALLEY'] as const)
    if (!kinds.has(kind)) issues.push(`missing zone kind ${kind}`);
  let drivableEntries = 0;
  let routes = 0;
  for (const zone of plan.zones) {
    if (polygonArea(zone.polygonM) <= 0) issues.push(`${zone.zoneId}: zero polygon area`);
    if (zone.entries.length < 2) issues.push(`${zone.zoneId}: needs at least two entries`);
    if (zone.routes.length < 2) issues.push(`${zone.zoneId}: needs at least two routes`);
    if (zone.landmarks.length === 0) issues.push(`${zone.zoneId}: needs a landmark`);
    if (zone.edgePolicy !== edgePolicyFor(zone.kind))
      issues.push(`${zone.zoneId}: unexpected edge policy ${zone.edgePolicy}`);
    if (zone.kind === 'RAMP' && zone.ramp === null)
      issues.push(`${zone.zoneId}: missing ramp data`);
    if (zone.kind === 'DRIFT_PAD' && zone.drift === null)
      issues.push(`${zone.zoneId}: missing drift data`);
    if (zone.kind === 'DEMOLITION_ALLEY' && zone.destructibleIds.length < 6)
      issues.push(`${zone.zoneId}: fewer than six destructibles`);
    for (const entry of zone.entries) {
      if (!onDrivableSurface(layout, entry.positionM))
        issues.push(`${zone.zoneId}/${entry.entryId}: entry is not on a drivable surface`);
      else drivableEntries += 1;
    }
    for (const route of zone.routes) {
      routes += 1;
      if (route.waypointsM.length < 2) issues.push(`${zone.zoneId}/${route.routeId}: short route`);
    }
  }
  for (const definition of plan.definitions) {
    const zone = plan.zones.find((candidate) => candidate.zoneId === definition.zoneId);
    if (!zone) {
      issues.push(`${definition.objectId}: unknown zone ${String(definition.zoneId)}`);
      continue;
    }
    if (!insidePolygon(definition.initialTransform.positionM, zone.polygonM))
      issues.push(`${definition.objectId}: outside its zone`);
    const spec = DESTRUCTIBLE_ARCHETYPES[definition.archetype];
    if (!spec) issues.push(`${definition.objectId}: unknown archetype`);
    if (
      definition.impactThreshold.moveImpulseNs <= 0 ||
      definition.impactThreshold.breakImpulseNs <= definition.impactThreshold.moveImpulseNs
    )
      issues.push(`${definition.objectId}: invalid thresholds`);
  }
  return Object.freeze({
    issues: Object.freeze(issues),
    zones: plan.zones.length,
    drivableEntries,
    routes,
    destructibles: plan.definitions.length,
  });
}

/* -------------------------------------------------------------------------------------------------
 * Impact resolution (the single physics response shared by MANUAL, LEARNING and AUTO).
 * ---------------------------------------------------------------------------------------------- */

function fragmentCount(spec: DestructibleArchetypeSpec, preset: PresentationPreset): number {
  return Math.min(spec.fragmentCount, PRESENTATION_FRAGMENT_BUDGET[preset]);
}
function displacementFor(spec: DestructibleArchetypeSpec, impulseNs: number): number {
  const releaseSpeed = Math.min(impulseNs / spec.massKg, DESTRUCTIBLE_LIMITS.maxReleaseSpeedMps);
  const sliding = (releaseSpeed * releaseSpeed) / (2 * SLIDING_FRICTION * GRAVITY_MPS2);
  return round(Math.min(DESTRUCTIBLE_LIMITS.maxDisplacementM, sliding), 4);
}
function displacementDirection(target: Vector3, contact: Vector3): { x: number; z: number } {
  const dx = target.x - contact.x;
  const dz = target.z - contact.z;
  const length = Math.hypot(dx, dz);
  if (length <= 1e-9) return { x: 1, z: 0 };
  return { x: dx / length, z: dz / length };
}
function fingerprint(objects: readonly DestructibleSnapshotObject[]): string {
  const canonical = sortedIds(objects)
    .map((entry) =>
      [
        entry.objectId,
        entry.state,
        entry.damageNs.toFixed(3),
        entry.positionM.x.toFixed(4),
        entry.positionM.z.toFixed(4),
        entry.headingRad.toFixed(4),
      ].join('|'),
    )
    .join(';');
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

interface RuntimeObject {
  readonly definition: DestructibleDefinition;
  readonly spec: DestructibleArchetypeSpec;
  state: DestructibleState;
  damageNs: number;
  positionM: Vector3;
  headingRad: number;
  bodyAdmitted: boolean;
  fragments: number;
  fragmentExpiryTick: number;
  incarnation: number;
  lastImpactTick: number;
}

export interface DestructibleDecorOptions {
  readonly context: ContractContext;
  readonly eventBus: EventBus;
  readonly layout: CityLayout;
  readonly plan: DestructiblePlayground;
  readonly presentationPreset?: PresentationPreset;
}

/** Validated definition reader; unknown fields and inconsistent thresholds are refused. */
function readDefinition(value: unknown): DestructibleDefinition {
  const data = record(value);
  const allowed = [
    'objectId',
    'archetype',
    'zoneId',
    'initialTransform',
    'collider',
    'massKg',
    'impactThreshold',
    'responseKind',
    'fragmentPreset',
    'resetPolicy',
  ];
  const unknown = Object.keys(data).filter((key) => !allowed.includes(key));
  requireContract(unknown.length === 0, `Unknown destructible field ${unknown[0]}`);
  requireContract(
    allowed.every((key) => Object.hasOwn(data, key)),
    'Incomplete definition',
  );
  const objectId = text(data.objectId);
  requireContract(objectId.length <= 128, 'Destructible object id exceeds capacity');
  const archetype = choice(data.archetype, destructibleArchetypes);
  const zoneId = nullable(data.zoneId, text);
  const transform = fields(data.initialTransform, ['positionM', 'headingRad']);
  const collider = fields(data.collider, ['shape', 'radiusM', 'heightM']);
  const impactThreshold = fields(data.impactThreshold, ['moveImpulseNs', 'breakImpulseNs']);
  const moveImpulseNs = number(impactThreshold.moveImpulseNs, 0.001, 1e6);
  const breakImpulseNs = number(impactThreshold.breakImpulseNs, 0.001, 1e6);
  requireContract(breakImpulseNs > moveImpulseNs, 'Break threshold must exceed the move threshold');
  const spec = DESTRUCTIBLE_ARCHETYPES[archetype];
  const massKg = number(data.massKg, 0.1, 5000);
  requireContract(Math.abs(massKg - spec.massKg) <= 1e-6, 'Archetype mass mismatch');
  return Object.freeze({
    objectId,
    archetype,
    zoneId,
    initialTransform: Object.freeze({
      positionM: readPoint(transform.positionM),
      headingRad: number(transform.headingRad, -1e6, 1e6),
    }),
    collider: Object.freeze({
      shape: choice(collider.shape, ['CYLINDER', 'BOX']),
      radiusM: number(collider.radiusM, 0.05, 5),
      heightM: number(collider.heightM, 0.05, 12),
    }),
    massKg,
    impactThreshold: Object.freeze({ moveImpulseNs, breakImpulseNs }),
    responseKind: choice(data.responseKind, ['DISPLACE_THEN_BREAK']),
    fragmentPreset: choice(data.fragmentPreset, ['NONE', 'PLANKS', 'DISCS', 'CUBES', 'SHARDS']),
    resetPolicy: choice(data.resetPolicy, ['RESET_TO_INITIAL', 'KEEP_STATE']),
  });
}

/**
 * One destructible decor state machine. Every consequence is derived from physical contact data and
 * the definition; the control source is only counted, so MANUAL, LEARNING and AUTO cannot diverge.
 */
export function createDestructibleDecor(options: DestructibleDecorOptions): DestructibleDecor {
  const data = record(options);
  const allowed = ['context', 'eventBus', 'layout', 'plan', 'presentationPreset'];
  const unknown = Object.keys(data).filter((key) => !allowed.includes(key));
  requireContract(unknown.length === 0, `Unknown destructible option ${unknown[0]}`);
  const context = Object.freeze(
    readContext(fields(options.context, ['schemaVersion', 'units', 'sessionId', 'worldEpoch'])),
  );
  const bus = options.eventBus;
  requireContract(
    typeof bus === 'object' && bus !== null && typeof bus.publish === 'function',
    'The destructible decor needs an event bus',
  );
  const layout = options.layout;
  requireContract(
    typeof layout === 'object' && layout !== null && Array.isArray(layout.elements),
    'The destructible decor needs a city layout',
  );
  const plan = options.plan;
  requireContract(
    typeof plan === 'object' &&
      plan !== null &&
      plan.version === DESTRUCTIBLE_PLAYGROUND_VERSION &&
      Array.isArray(plan.zones) &&
      Array.isArray(plan.definitions),
    'The destructible decor needs a 227 playground plan',
  );
  requireContract(plan.mapId === layout.mapId, 'Playground plan belongs to another map');
  requireContract(plan.zones.length <= DESTRUCTIBLE_LIMITS.maxZones, 'Too many playground zones');

  const zoneIds = new Set<string>();
  for (const zone of plan.zones) {
    requireContract(zoneIds.size < DESTRUCTIBLE_LIMITS.maxZones, 'Zone capacity exceeded');
    requireContract(!zoneIds.has(zone.zoneId), 'Duplicate playground zone');
    zoneIds.add(zone.zoneId);
    requireContract(
      zone.polygonM.length >= 3 && polygonArea(zone.polygonM) > 0,
      'Invalid zone polygon',
    );
    requireContract(zone.entries.length >= 1, `${zone.zoneId} has no entry`);
    requireContract(zone.routes.length >= 2, `${zone.zoneId} needs two routes`);
    requireContract(zone.landmarks.length >= 1, `${zone.zoneId} has no landmark`);
    for (const entry of zone.entries)
      requireContract(
        onDrivableSurface(layout, entry.positionM),
        `${zone.zoneId}/${entry.entryId} is not reachable by car`,
      );
  }

  // Buildings, lane geometry and STOP/SIGNAL rules stay structural: registering one is refused
  // instead of silently turning a rule into decorative debris.
  const structuralIds = new Set<string>();
  for (const element of layout.elements) {
    if (
      element.kind === 'BUILDING' ||
      element.kind === 'STOP_LINE' ||
      element.kind === 'SIGNAL_HEAD' ||
      element.kind === 'LANE_SURFACE' ||
      element.kind === 'INTERSECTION_SURFACE'
    )
      structuralIds.add(element.id);
  }
  const sidewalkSurfaces = planarElements(layout, SIDEWALK_KINDS);

  const definitions: DestructibleDefinition[] = [];
  const objects = new Map<string, RuntimeObject>();
  const zones = plan.zones;
  const initialTick = 0;
  let currentTick = initialTick;
  let generation = 0;
  let preset: PresentationPreset = choice(options.presentationPreset ?? 'MEDIUM', [
    'LOW',
    'MEDIUM',
    'HIGH',
  ]);
  const counts = { INTACT: 0, MOVED: 0, BROKEN: 0 };
  const bySource: Record<ImpactControlSource, number> = { MANUAL: 0, LEARNING: 0, AUTO: 0 };
  let impacts = 0;
  let evaluatedObjects = 0;
  let brokenEvents = 0;
  let duplicateBreaks = 0;
  let chainBreaks = 0;
  let resets = 0;
  let fragments = 0;
  let disposed = false;
  let busy = false;

  for (const input of plan.definitions) {
    requireContract(
      definitions.length < DESTRUCTIBLE_LIMITS.maxObjects,
      'Destructible object capacity exceeded',
    );
    const definition = readDefinition(input);
    requireContract(
      !structuralIds.has(definition.objectId),
      'Structural objects are not destructible',
    );
    requireContract(!objects.has(definition.objectId), 'Duplicate destructible object id');
    if (definition.zoneId !== null)
      requireContract(
        zoneIds.has(definition.zoneId),
        `Unknown playground zone ${definition.zoneId}`,
      );
    const placed =
      (definition.zoneId !== null &&
        insidePolygon(
          definition.initialTransform.positionM,
          zones.find((zone) => zone.zoneId === definition.zoneId)!.polygonM,
        )) ||
      sidewalkSurfaces.some((surface) =>
        insidePolygon(definition.initialTransform.positionM, surface.footprintM),
      );
    requireContract(placed, `${definition.objectId} is not on a sidewalk or playground surface`);
    const spec = DESTRUCTIBLE_ARCHETYPES[definition.archetype];
    requireContract(
      definition.fragmentPreset === spec.fragmentPreset,
      'Fragment preset must match the archetype',
    );
    definitions.push(definition);
    objects.set(definition.objectId, {
      definition,
      spec,
      state: 'INTACT',
      damageNs: 0,
      positionM: definition.initialTransform.positionM,
      headingRad: definition.initialTransform.headingRad,
      bodyAdmitted: true,
      fragments: 0,
      fragmentExpiryTick: 0,
      incarnation: 0,
      lastImpactTick: -1,
    });
    counts.INTACT += 1;
  }
  requireContract(definitions.length > 0, 'The destructible decor needs at least one object');

  const index: SpatialIndex = createSpatialIndex({
    maxObstacles: DESTRUCTIBLE_LIMITS.maxObjects,
  });
  const frozenDefinitions = Object.freeze(
    [...definitions].sort((left, right) => stableCompare(left.objectId, right.objectId)),
  );
  const frozenZones = Object.freeze([...zones]);

  const assertBus = () => {
    const stats = bus.getStats();
    requireContract(
      !stats.disposed &&
        stats.sessionId === context.sessionId &&
        stats.worldEpoch === context.worldEpoch,
      'Destructible event bus belongs to a stale or foreign world',
    );
    requireContract(stats.watermarkTick <= currentTick, 'Impact tick precedes the event watermark');
    return stats;
  };
  assertBus();
  const live = () => {
    requireContract(!disposed, 'Destructible decor is disposed');
    requireContract(!busy, 'Destructible decor is reentrant');
  };
  const obstacleEntity = (entry: RuntimeObject) =>
    Object.freeze({
      id: entry.definition.objectId,
      incarnation: entry.incarnation,
      kind: 'OBSTACLE' as const,
      shape: Object.freeze({
        type: 'SPHERE' as const,
        centerM: point(entry.positionM.x, entry.positionM.z, entry.spec.colliderHeightM / 2),
        radiusM: entry.definition.collider.radiusM,
      }),
    });
  const syncBody = (entry: RuntimeObject): void => {
    if (entry.bodyAdmitted) index.upsert(obstacleEntity(entry));
    else index.remove(entry.definition.objectId, entry.incarnation);
  };
  for (const entry of objects.values()) syncBody(entry);

  const objectState = (entry: RuntimeObject): DestructibleObjectState =>
    Object.freeze({
      objectId: entry.definition.objectId,
      archetype: entry.definition.archetype,
      state: entry.state,
      damageNs: entry.damageNs,
      positionM: entry.positionM,
      headingRad: entry.headingRad,
      bodyAdmitted: entry.bodyAdmitted,
      obstacleClass: entry.spec.obstacleClass,
      displacementM: round(
        distance2D(entry.positionM, entry.definition.initialTransform.positionM),
        4,
      ),
    });
  const requireObject = (objectId: string): RuntimeObject => {
    const entry = objects.get(objectId);
    requireContract(entry !== undefined, `Unknown destructible object ${objectId}`);
    return entry;
  };

  const spawnFragments = (entry: RuntimeObject): void => {
    const spawned = fragmentCount(entry.spec, preset);
    entry.fragments = spawned;
    entry.fragmentExpiryTick = readTick(currentTick + FRAGMENT_LIFETIME_TICKS);
    fragments += spawned;
    const excess = fragments - DESTRUCTIBLE_LIMITS.maxActiveFragments;
    if (excess > 0) {
      fragments -= excess;
      entry.fragments = Math.max(0, spawned - excess);
    }
  };

  const strike = (
    entry: RuntimeObject,
    impulseNs: number,
    instigatorId: string | null,
    controlSource: ImpactControlSource,
    contactPointM: Vector3,
    depth: number,
    visited: Set<string>,
  ): DestructibleImpactResult => {
    requireContract(
      impulseNs >= 0 && Number.isFinite(impulseNs),
      'Impact impulse must be a finite non-negative number',
    );
    const previousState = entry.state;
    entry.lastImpactTick = currentTick;
    if (previousState === 'BROKEN') {
      duplicateBreaks += 1;
      return Object.freeze({
        tick: currentTick,
        objectId: entry.definition.objectId,
        archetype: entry.definition.archetype,
        previousState,
        state: entry.state,
        changedState: false,
        damageNs: entry.damageNs,
        impactThreshold: entry.definition.impactThreshold,
        reaction: Object.freeze({
          impulseNs: 0,
          blocking: false,
          vehicleDeltaVMps: 0,
        }),
        eventId: null,
        event: null,
        publication: null,
        chain: Object.freeze([]),
      });
    }
    entry.damageNs = round(entry.damageNs + impulseNs, 3);
    let state: DestructibleState = previousState;
    if (entry.damageNs >= entry.definition.impactThreshold.breakImpulseNs) state = 'BROKEN';
    else if (entry.damageNs >= entry.definition.impactThreshold.moveImpulseNs) state = 'MOVED';
    const changedState = state !== previousState;
    let eventId: string | null = null;
    let event: SimulationEvent | null = null;
    let publication: PublishResult | null = null;
    if (changedState) {
      counts[previousState] -= 1;
      counts[state] += 1;
      entry.state = state;
      if (state === 'MOVED') {
        const displacementM = displacementFor(entry.spec, impulseNs);
        const direction = displacementDirection(entry.positionM, contactPointM);
        entry.positionM = point(
          round(entry.positionM.x + direction.x * displacementM, 4),
          round(entry.positionM.z + direction.z * displacementM, 4),
        );
        entry.bodyAdmitted = entry.spec.obstacleClass === 'LARGE';
      } else {
        entry.bodyAdmitted = false;
        spawnFragments(entry);
        eventId = createStableId('destructible-broken', context.sessionId, [
          String(context.worldEpoch),
          String(generation),
          entry.definition.objectId,
        ]);
        const entityIds =
          instigatorId === null
            ? Object.freeze([entry.definition.objectId])
            : Object.freeze([entry.definition.objectId, instigatorId]);
        event = parseSimulationEvent({
          schemaVersion: 1,
          units: 'SI',
          sessionId: context.sessionId,
          worldEpoch: context.worldEpoch,
          tick: currentTick,
          eventId,
          entityIds,
          type: DESTRUCTIBLE_BROKEN_EVENT,
          payload: { objectId: entry.definition.objectId, instigatorId, impulseNs },
        });
        publication = bus.publish(event);
        brokenEvents += 1;
      }
      syncBody(entry);
    }
    const reactionImpulseNs = Math.min(
      impulseNs,
      entry.spec.massKg * DESTRUCTIBLE_LIMITS.maxReleaseSpeedMps,
    );
    const result: DestructibleImpactResult = {
      tick: currentTick,
      objectId: entry.definition.objectId,
      archetype: entry.definition.archetype,
      previousState,
      state: entry.state,
      changedState,
      damageNs: entry.damageNs,
      impactThreshold: entry.definition.impactThreshold,
      reaction: Object.freeze({
        impulseNs: round(reactionImpulseNs, 3),
        blocking: entry.state !== 'BROKEN' && entry.spec.obstacleClass === 'LARGE',
        vehicleDeltaVMps: round(reactionImpulseNs / REFERENCE_VEHICLE_MASS_KG, 6),
      }),
      eventId,
      event,
      publication,
      chain: Object.freeze([]),
    };
    if (!changedState || depth >= DESTRUCTIBLE_LIMITS.maxChainDepth) return Object.freeze(result);
    const neighbours = index
      .query({
        centerM: entry.positionM,
        radiusM: DESTRUCTIBLE_LIMITS.chainRadiusM,
        kinds: ['OBSTACLE'],
        exclude: { id: entry.definition.objectId, incarnation: entry.incarnation },
      })
      .filter((entity) => !visited.has(entity.id))
      .slice(0, DESTRUCTIBLE_LIMITS.maxChainNeighbors)
      .sort((left, right) => stableCompare(left.id, right.id));
    evaluatedObjects += neighbours.length;
    const chain: DestructibleImpactResult[] = [];
    for (const neighbour of neighbours) {
      visited.add(neighbour.id);
      const child = objects.get(neighbour.id);
      if (!child || child.state === 'BROKEN') continue;
      const childImpulse = round(impulseNs * CHAIN_TRANSFER_RATIO, 3);
      if (childImpulse <= 0) continue;
      const childResult = strike(
        child,
        childImpulse,
        entry.definition.objectId,
        controlSource,
        entry.positionM,
        depth + 1,
        visited,
      );
      if (childResult.changedState && childResult.state === 'BROKEN') chainBreaks += 1;
      chain.push(childResult);
    }
    return Object.freeze({ ...result, chain: Object.freeze(chain) });
  };

  return Object.freeze({
    getDefinitions: () => frozenDefinitions,
    getZones: () => frozenZones,
    getState(objectId: string) {
      live();
      return objectState(requireObject(text(objectId)));
    },
    applyImpact(contact: DestructibleContact): DestructibleImpactResult {
      live();
      const data = fields(contact, [
        'tick',
        'objectId',
        'impulseNs',
        'pointM',
        'instigatorId',
        'controlSource',
      ]);
      const at = readTick(data.tick);
      requireContract(at >= currentTick, 'Impact tick must not move backwards');
      const objectId = text(data.objectId);
      const impulseNs = number(data.impulseNs, 0, 1e9);
      const pointM = readPoint(data.pointM);
      const instigatorId = nullable(data.instigatorId, text);
      if (instigatorId !== null)
        requireContract(instigatorId !== objectId, 'An object cannot instigate itself');
      const controlSource = choice(data.controlSource, ['MANUAL', 'LEARNING', 'AUTO']);
      assertBus();
      const target = requireObject(objectId);
      currentTick = at;
      impacts += 1;
      bySource[controlSource] += 1;
      busy = true;
      try {
        return strike(
          target,
          impulseNs,
          instigatorId,
          controlSource,
          pointM,
          0,
          new Set([objectId]),
        );
      } finally {
        busy = false;
      }
    },
    queryObstacles(query: ObstacleQuery): readonly ObstacleReport[] {
      live();
      // Strict fields: a camera, a viewport or a player position cannot be passed in. Visibility in
      // this contract is never a prerequisite for reporting a large displaced obstacle.
      const data = fields(query, ['centerM', 'radiusM']);
      const centerM = readPoint(data.centerM);
      const radiusM = number(data.radiusM, 0, 1e6);
      const found = index.query({ centerM, radiusM, kinds: ['OBSTACLE'] });
      const reports: ObstacleReport[] = [];
      for (const entity of found) {
        const entry = objects.get(entity.id);
        if (!entry || entry.state === 'BROKEN') continue;
        if (entry.spec.obstacleClass !== 'LARGE') continue;
        reports.push(
          Object.freeze({
            objectId: entry.definition.objectId,
            archetype: entry.definition.archetype,
            state: entry.state,
            positionM: entry.positionM,
            radiusM: entry.definition.collider.radiusM,
            displaced: entry.state === 'MOVED',
            displacementM: round(
              distance2D(entry.positionM, entry.definition.initialTransform.positionM),
              4,
            ),
          }),
        );
      }
      return Object.freeze(
        reports.sort((left, right) => stableCompare(left.objectId, right.objectId)),
      );
    },
    evaluateZoneEdge(zoneId: string, positionM: Vector3): PlayZoneEdgeResult {
      live();
      const zone = zones.find((candidate) => candidate.zoneId === text(zoneId));
      requireContract(zone !== undefined, `Unknown playground zone ${zoneId}`);
      const at = readPoint(positionM);
      const inside = insidePolygon(at, zone.polygonM);
      const distanceToEdgeM = round(distanceToPolygonEdge(at, zone.polygonM), 4);
      return Object.freeze({
        zoneId: zone.zoneId,
        kind: zone.kind,
        inside,
        distanceToEdgeM,
        action: inside ? 'NONE' : zone.edgePolicy,
        redirectEntryId:
          inside || zone.edgePolicy !== 'REDIRECT_TO_ENTRY' ? null : zone.entries[0]!.entryId,
      });
    },
    capture(): DestructibleSnapshot {
      live();
      const snapshotObjects = sortedIds(
        [...objects.values()].map((entry) => ({
          objectId: entry.definition.objectId,
          state: entry.state,
          damageNs: entry.damageNs,
          positionM: entry.positionM,
          headingRad: entry.headingRad,
        })),
      ).map((entry) => Object.freeze(entry));
      const snapshot: DestructibleSnapshot = Object.freeze({
        version: DESTRUCTIBLE_DECOR_VERSION,
        mapId: layout.mapId,
        sessionId: context.sessionId,
        worldEpoch: context.worldEpoch,
        generation,
        objects: Object.freeze(snapshotObjects),
        checksum: fingerprint(snapshotObjects),
      });
      requireContract(
        JSON.stringify(snapshot).length <= DESTRUCTIBLE_LIMITS.maxSnapshotCodeUnits,
        'Destructible snapshot exceeds capacity',
      );
      return snapshot;
    },
    restore(snapshot: unknown): readonly DestructibleObjectState[] {
      live();
      const data = fields(snapshot, [
        'version',
        'mapId',
        'sessionId',
        'worldEpoch',
        'generation',
        'objects',
        'checksum',
      ]);
      requireContract(
        data.version === DESTRUCTIBLE_DECOR_VERSION &&
          data.mapId === layout.mapId &&
          data.sessionId === context.sessionId &&
          readTick(data.worldEpoch) === context.worldEpoch,
        'Foreign destructible snapshot',
      );
      const snapshotGeneration = readTick(data.generation);
      const entries = new Map<string, DestructibleSnapshotObject>();
      requireContract(Array.isArray(data.objects), 'Snapshot objects must be an array');
      for (const raw of data.objects) {
        const objectData = fields(raw, [
          'objectId',
          'state',
          'damageNs',
          'positionM',
          'headingRad',
        ]);
        const objectId = text(objectData.objectId);
        requireContract(!entries.has(objectId), 'Duplicate snapshot object');
        const entry = requireObject(objectId);
        const state = choice(objectData.state, ['INTACT', 'MOVED', 'BROKEN']);
        const damageNs = number(objectData.damageNs, 0, 1e9);
        if (state === 'INTACT')
          requireContract(
            damageNs < entry.definition.impactThreshold.moveImpulseNs,
            'Inconsistent INTACT damage',
          );
        if (state === 'MOVED')
          requireContract(
            damageNs >= entry.definition.impactThreshold.moveImpulseNs &&
              damageNs < entry.definition.impactThreshold.breakImpulseNs,
            'Inconsistent MOVED damage',
          );
        if (state === 'BROKEN')
          requireContract(
            damageNs >= entry.definition.impactThreshold.breakImpulseNs,
            'Inconsistent BROKEN damage',
          );
        entries.set(
          objectId,
          Object.freeze({
            objectId,
            state,
            damageNs,
            positionM: readPoint(objectData.positionM),
            headingRad: number(objectData.headingRad, -1e6, 1e6),
          }),
        );
      }
      requireContract(
        entries.size === objects.size,
        'Snapshot must cover every destructible object',
      );
      requireContract(
        fingerprint([...entries.values()]) === data.checksum,
        'Destructible snapshot checksum mismatch',
      );
      generation = snapshotGeneration + 1;
      counts.INTACT = 0;
      counts.MOVED = 0;
      counts.BROKEN = 0;
      fragments = 0;
      for (const entry of objects.values()) {
        const restored = entries.get(entry.definition.objectId)!;
        entry.state = restored.state;
        entry.damageNs = restored.damageNs;
        entry.positionM = restored.positionM;
        entry.headingRad = restored.headingRad;
        entry.fragments = 0;
        entry.fragmentExpiryTick = 0;
        entry.incarnation += 1;
        entry.bodyAdmitted =
          entry.state === 'INTACT' ||
          (entry.state === 'MOVED' && entry.spec.obstacleClass === 'LARGE');
        counts[entry.state] += 1;
        syncBody(entry);
      }
      return Object.freeze(sortedIds([...objects.values()].map((entry) => objectState(entry))));
    },
    reset(): DestructibleResetReport {
      live();
      generation += 1;
      resets += 1;
      let restoredCount = 0;
      let kept = 0;
      fragments = 0;
      counts.INTACT = 0;
      counts.MOVED = 0;
      counts.BROKEN = 0;
      for (const entry of objects.values()) {
        entry.fragments = 0;
        entry.fragmentExpiryTick = 0;
        entry.incarnation += 1;
        if (entry.definition.resetPolicy === 'RESET_TO_INITIAL') {
          entry.state = 'INTACT';
          entry.damageNs = 0;
          entry.positionM = entry.definition.initialTransform.positionM;
          entry.headingRad = entry.definition.initialTransform.headingRad;
          entry.bodyAdmitted = true;
          restoredCount += 1;
        } else kept += 1;
        counts[entry.state] += 1;
        syncBody(entry);
      }
      const stats = index.getStats();
      return Object.freeze({
        generation,
        restored: restoredCount,
        kept,
        bodies: stats.obstacles,
        colliders: stats.obstacles,
        fragments,
      });
    },
    advance(tick: number): number {
      live();
      const next = readTick(tick);
      requireContract(next >= currentTick, 'Destructible tick must not move backwards');
      currentTick = next;
      let expired = 0;
      for (const entry of objects.values()) {
        if (entry.fragments > 0 && entry.fragmentExpiryTick <= next) {
          expired += entry.fragments;
          fragments -= entry.fragments;
          entry.fragments = 0;
          entry.fragmentExpiryTick = 0;
        }
      }
      return expired;
    },
    setPresentationPreset(value: PresentationPreset): void {
      live();
      preset = choice(value, ['LOW', 'MEDIUM', 'HIGH']);
    },
    getStats(): DestructibleDecorStats {
      const indexStats = index.getStats();
      return Object.freeze({
        tick: currentTick,
        generation,
        objects: objects.size,
        states: Object.freeze({ ...counts }),
        bodies: indexStats.obstacles,
        colliders: indexStats.obstacles * DESTRUCTIBLE_LIMITS.maxCollidersPerObject,
        fragments,
        indexEntries: indexStats.spatialReferences,
        indexCells: indexStats.cells,
        evaluatedObjects,
        impacts,
        impactsBySource: Object.freeze({ ...bySource }),
        brokenEvents,
        duplicateBreaks,
        chainBreaks,
        resets,
        preset,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      objects.clear();
      index.dispose();
      fragments = 0;
    },
  });
}

export interface StructuralCheck {
  readonly structuralIds: number;
  readonly destructibleIds: number;
  readonly overlaps: readonly string[];
  readonly untouched: boolean;
}
/**
 * Proves the structural boundary: no destructible id may name a building, a lane, a junction, a STOP
 * line or a signal head, and the layout entities referenced by those rules remain unchanged.
 */
export function verifyStructuralBoundary(
  layout: CityLayout,
  decor: DestructibleDecor,
  before: string,
): StructuralCheck {
  const structuralIds = new Set<string>();
  for (const element of layout.elements) {
    if (
      element.kind === 'BUILDING' ||
      element.kind === 'STOP_LINE' ||
      element.kind === 'SIGNAL_HEAD' ||
      element.kind === 'LANE_SURFACE' ||
      element.kind === 'INTERSECTION_SURFACE'
    )
      structuralIds.add(element.id);
  }
  const destructibleIds = decor.getDefinitions().map((definition) => definition.objectId);
  const overlaps = destructibleIds.filter((id) => structuralIds.has(id));
  return Object.freeze({
    structuralIds: structuralIds.size,
    destructibleIds: destructibleIds.length,
    overlaps: Object.freeze(overlaps),
    untouched: overlaps.length === 0 && JSON.stringify(layout) === before,
  });
}
