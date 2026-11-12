import {
  createStableId,
  fields,
  list,
  number,
  randomUnit,
  record,
  requireContract,
  text,
  tick as readTick,
} from '../sessions';
import { FIXED_TICK_HZ } from '../simulation';
import type { Vector3 } from '../vehicles';
import { createCityLayout } from './city-layout';
import type { CityPlanarElement } from './city-layout';
import { createCrosswalkZones } from './crosswalk-zones';
import { createLaneGraph } from './lane-graph';
import type { LaneGraph } from './lane-graph';
import { parseRoadMap } from './parser';
import type { Lane } from './schema';

/** Explicit, closed state vocabulary. A pedestrian is never removed without a recorded state. */
export const PEDESTRIAN_STATES = Object.freeze([
  'ON_SIDEWALK',
  'WAITING',
  'CROSSING',
  'CROSSED',
  'WITHDRAWN',
] as const);
export type PedestrianState = (typeof PEDESTRIAN_STATES)[number];

/** The only legal transitions. Anything else is refused, never repaired. */
export const PEDESTRIAN_STATE_TRANSITIONS: Readonly<
  Record<PedestrianState, readonly PedestrianState[]>
> = Object.freeze({
  ON_SIDEWALK: Object.freeze(['WAITING', 'WITHDRAWN'] as const),
  WAITING: Object.freeze(['CROSSING', 'WITHDRAWN'] as const),
  CROSSING: Object.freeze(['CROSSED', 'WITHDRAWN'] as const),
  CROSSED: Object.freeze(['WITHDRAWN'] as const),
  WITHDRAWN: Object.freeze([] as const),
});

export type PedestrianTransitionReason =
  'ARRIVED_AT_CURB' | 'CROSSING_STARTED' | 'CROSSING_COMPLETED' | 'ROUTE_COMPLETE' | 'IMPACT';
export type PedestrianWithdrawalReason = 'ROUTE_COMPLETE' | 'IMPACT';
export type PedestrianDirection = 'A_TO_B' | 'B_TO_A';
export type PedestrianDecision = 'GAP_ACCEPTED' | 'ASSERTED';
export type PedestrianLinkRejection = 'NO_LANE_PROJECTION' | 'NO_SIDEWALK' | 'DEGENERATE_GEOMETRY';
export type PedestrianGapId =
  | 'NO_CROSSWALK'
  | 'REFUSED_CROSSWALK_LINK'
  | 'MISSING_CROSSING_LINE'
  | 'PEDESTRIAN_CAPACITY_TRUNCATED'
  | 'INCOMPLETE_VEHICLE_COVERAGE'
  | 'NO_COMPLETE_CONFLICT_EPISODE';

export const PEDESTRIAN_LIMITS = Object.freeze({
  maxPedestrians: 256,
  pedestriansPerCrosswalk: 2,
  minWalkSpeedMps: 1.1,
  maxWalkSpeedMps: 1.6,
  minPatienceS: 0.5,
  maxPatienceS: 4,
  minSafetyMarginS: 0.5,
  maxSafetyMarginS: 2,
  approachLengthM: 4,
  maxSidewalkGapM: 2,
  conflictHorizonM: 40,
  stopApproachM: 25,
  stopStandstillMps: 0.2,
  heightToleranceM: 1.5,
  maxVehiclesPerStep: 512,
  maxConflicts: 4096,
  maxStops: 2048,
  maxCollisions: 1024,
});

export interface PedestrianOptions {
  /** Deterministic decision seed. Required: no implicit clock and no hidden entropy. */
  readonly seed: number;
  readonly maxPedestrians?: number;
  readonly pedestriansPerCrosswalk?: number;
  readonly minWalkSpeedMps?: number;
  readonly maxWalkSpeedMps?: number;
  readonly minPatienceS?: number;
  readonly maxPatienceS?: number;
  readonly minSafetyMarginS?: number;
  readonly maxSafetyMarginS?: number;
  /** Distance the pedestrian walks on the derived sidewalk before reaching the curb. */
  readonly approachLengthM?: number;
  /** Vehicles beyond this signed distance to the crossing centre are not observed as conflicts. */
  readonly conflictHorizonM?: number;
  /** Maximum planar gap between a crossing end and its derived sidewalk strip (curb tolerance). */
  readonly maxSidewalkGapM?: number;
  /** Vehicles beyond this signed distance are not observed as crossing stops. */
  readonly stopApproachM?: number;
  readonly stopStandstillMps?: number;
  readonly heightToleranceM?: number;
  readonly maxVehiclesPerStep?: number;
  readonly maxConflicts?: number;
  readonly maxStops?: number;
  readonly maxCollisions?: number;
}

/** Derived walking route: a sidewalk approach on each side plus the painted crossing between them. */
export interface PedestrianLink {
  readonly crosswalkId: string;
  readonly laneIds: readonly string[];
  readonly referenceLaneId: string;
  /** Authored crosswalk line of every linked lane: the real yield point used for conflicts. */
  readonly laneLines: readonly Readonly<{ laneId: string; longitudinalM: number }>[];
  readonly headingRad: number;
  readonly crossingAxis: Readonly<{ x: number; z: number }>;
  readonly entryAM: Vector3;
  readonly entryBM: Vector3;
  readonly startAM: Vector3;
  readonly startBM: Vector3;
  readonly sidewalkIdA: string | null;
  readonly sidewalkIdB: string | null;
  readonly approachLengthAM: number;
  readonly approachLengthBM: number;
  readonly crossingLengthM: number;
}

export interface PedestrianRefusedLink {
  readonly crosswalkId: string;
  readonly reason: PedestrianLinkRejection;
}

export interface PedestrianVehicleFact {
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly laneId: string;
  readonly positionM: Vector3;
  readonly speedMps: number;
  readonly observable: boolean;
}

/** Authoritative contact reported by the collision owner; this module never invents impacts. */
export interface PedestrianContactFact {
  readonly vehicleId: string;
  readonly pedestrianId: string;
  readonly tick: number;
  readonly positionM: Vector3;
  readonly speedMps: number;
}

export interface PedestrianStepInput {
  readonly tick: number;
  readonly vehicles: readonly PedestrianVehicleFact[];
  /** True only when the caller enumerated every vehicle in the pedestrian network. */
  readonly vehiclesComplete: boolean;
  readonly contacts?: readonly PedestrianContactFact[];
}

export interface PedestrianSnapshot {
  readonly pedestrianId: string;
  readonly crosswalkId: string;
  readonly laneIds: readonly string[];
  readonly direction: PedestrianDirection;
  readonly state: PedestrianState;
  readonly stateSinceTick: number;
  readonly positionM: Vector3;
  readonly walkSpeedMps: number;
  readonly patienceTicks: number;
  readonly safetyMarginS: number;
  readonly approachLengthM: number;
  readonly crossingLengthM: number;
  readonly crossingProgress: number;
  readonly crossingRemainingM: number;
  readonly distanceWalkedM: number;
  readonly waitedTicks: number;
  readonly withdrawalReason: PedestrianWithdrawalReason | null;
  /** Physical facts only; never automatic learning eligibility. */
  readonly learningEligible: null;
}

export interface PedestrianConflict {
  readonly id: string;
  readonly pedestrianId: string;
  readonly crosswalkId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  /** First tick at which this vehicle was observable while the pedestrian was crossing. */
  readonly tick: number;
  /** Signed remaining distance from the vehicle to the crossing centre, in metres. */
  readonly distanceM: number;
  readonly speedMps: number;
  /** distanceM / speedMps; null when the vehicle is already at standstill. */
  readonly timeToConflictS: number | null;
  readonly crossingRemainingM: number;
  readonly crossingRemainingS: number;
  readonly outcome: 'PENDING' | 'YIELDED' | 'CROSSED_WITHOUT_YIELD';
  readonly stopTick: number | null;
  readonly stopDistanceM: number | null;
  readonly minimumDistanceM: number;
  readonly maximumSpeedMps: number;
  readonly learningEligible: null;
}

export interface PedestrianStop {
  readonly id: string;
  readonly crosswalkId: string;
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly tick: number;
  readonly distanceM: number;
  readonly speedMps: number;
  /** True only when a pedestrian of this crosswalk was crossing on that tick. */
  readonly duringCrossing: boolean;
  readonly pedestrianId: string | null;
  readonly learningEligible: null;
}

export interface PedestrianCollision {
  readonly id: string;
  readonly pedestrianId: string;
  readonly crosswalkId: string;
  readonly vehicleId: string;
  readonly tick: number;
  readonly state: PedestrianState;
  readonly positionM: Vector3;
  readonly speedMps: number;
  readonly learningEligible: null;
}

export type PedestrianEvent =
  | {
      readonly kind: 'STATE_CHANGED';
      readonly id: string;
      readonly tick: number;
      readonly pedestrianId: string;
      readonly from: PedestrianState;
      readonly to: PedestrianState;
      readonly reason: PedestrianTransitionReason;
    }
  | {
      readonly kind: 'CROSSING_DECIDED';
      readonly id: string;
      readonly tick: number;
      readonly pedestrianId: string;
      readonly decision: PedestrianDecision;
      readonly waitedTicks: number;
      readonly crossingRemainingS: number;
      readonly nearestTimeToConflictS: number | null;
    }
  | {
      readonly kind: 'CONFLICT_OBSERVED';
      readonly id: string;
      readonly tick: number;
      readonly pedestrianId: string;
      readonly conflictId: string;
      readonly vehicleId: string;
      readonly distanceM: number;
      readonly speedMps: number;
      readonly timeToConflictS: number | null;
    }
  | {
      readonly kind: 'COLLISION_OBSERVED';
      readonly id: string;
      readonly tick: number;
      readonly pedestrianId: string;
      readonly collisionId: string;
      readonly vehicleId: string;
    };

export interface PedestrianStep {
  readonly tick: number;
  /** Only the events of this tick; call getPedestrians() when positions are actually needed. */
  readonly events: readonly PedestrianEvent[];
}

export interface PedestrianRate {
  readonly id: 'YIELD_RATE' | 'CROSSING_COMPLETION_RATE';
  readonly numerator: number;
  readonly denominator: number;
  readonly value: number | null;
  readonly status: 'OBSERVED' | 'MISSING';
  readonly reason: 'NO_COMPLETE_CONFLICT_EPISODE' | 'NO_CROSSING' | null;
}

export interface PedestrianInspection {
  readonly counts: Readonly<{
    created: number;
    withdrawn: number;
    live: number;
    crossingsStarted: number;
    crossingsCompleted: number;
    crossingsInterrupted: number;
    gapCrossings: number;
    assertedCrossings: number;
    freeCrossings: number;
    yieldedCrossings: number;
    crossingsWithoutYield: number;
    unobservedCrossings: number;
    conflictRecords: number;
    stopEvents: number;
    yieldStopEvents: number;
    collisions: number;
  }>;
  readonly coverage: Readonly<{
    steps: number;
    completeSteps: number;
    incompleteSteps: number;
  }>;
  readonly denominators: Readonly<Record<'yieldRate' | 'crossingCompletionRate', PedestrianRate>>;
  readonly gaps: readonly Readonly<{ id: PedestrianGapId; detail: string }>[];
}

export interface PedestrianNetwork {
  readonly mapId: string;
  readonly crosswalks: number;
  readonly links: number;
  readonly refusedLinks: readonly PedestrianRefusedLink[];
  readonly pedestriansRequested: number;
  readonly pedestriansCreated: number;
  readonly capacityTruncated: number;
  readonly linkedLanes: number;
  readonly lanesWithoutLine: number;
  readonly crossingLengthM: Readonly<{ min: number; max: number; mean: number }> | null;
}

export interface PedestrianStats {
  readonly mapId: string;
  readonly worldEpoch: number;
  readonly pedestrians: number;
  readonly live: number;
  readonly crossingLinks: number;
  readonly refusedLinks: number;
  readonly conflicts: number;
  readonly stops: number;
  readonly collisions: number;
  readonly steps: number;
  readonly evaluationCost: Readonly<{
    pedestrianEvaluations: number;
    vehicleEvaluations: number;
    peakPedestriansPerStep: number;
    peakVehiclesPerStep: number;
  }>;
  readonly watermark: number;
  readonly disposed: boolean;
}

export interface Pedestrians {
  readonly version: string;
  readonly mapId: string;
  readonly seed: number;
  getLinks(): readonly PedestrianLink[];
  getNetwork(): PedestrianNetwork;
  getPedestrian(pedestrianId: string): PedestrianSnapshot | null;
  getPedestrians(): readonly PedestrianSnapshot[];
  getConflicts(): readonly PedestrianConflict[];
  getStops(): readonly PedestrianStop[];
  getCollisions(): readonly PedestrianCollision[];
  getInspection(): PedestrianInspection;
  getStats(): PedestrianStats;
  step(value: unknown): PedestrianStep;
  dispose(): void;
}

const EPSILON = 1e-9;
const TICK_S = 1 / FIXED_TICK_HZ;
const VERSION = '164-pedestrians-v1';
const MAX_IDENTITY_LENGTH = 256;

interface Route {
  readonly startM: Vector3;
  readonly entryM: Vector3;
  readonly exitM: Vector3;
  readonly endM: Vector3;
  readonly approachLengthM: number;
  readonly crossingLengthM: number;
  readonly exitLengthM: number;
}

interface MutableConflict {
  readonly record: Omit<
    PedestrianConflict,
    'outcome' | 'stopTick' | 'stopDistanceM' | 'minimumDistanceM' | 'maximumSpeedMps'
  >;
  outcome: PedestrianConflict['outcome'];
  stopTick: number | null;
  stopDistanceM: number | null;
  minimumDistanceM: number;
  maximumSpeedMps: number;
  /** True only when an observation during the crossing found the vehicle at standstill. */
  observedStandstill: boolean;
}

interface PedestrianRecord {
  readonly pedestrianId: string;
  readonly crosswalkId: string;
  readonly laneIds: readonly string[];
  readonly direction: PedestrianDirection;
  readonly route: Route;
  readonly walkSpeedMps: number;
  readonly patienceTicks: number;
  readonly safetyMarginS: number;
  state: PedestrianState;
  stateSinceTick: number;
  waitedTicks: number;
  distanceWalkedM: number;
  episodeStartedTick: number | null;
  episodeDecision: PedestrianDecision | null;
  episodeCoverageComplete: boolean;
  conflicts: Map<string, MutableConflict>;
  withdrawalReason: PedestrianWithdrawalReason | null;
}

interface CrossingReference {
  readonly crosswalkId: string;
  readonly longitudinalM: number;
}

interface VehicleFact {
  readonly vehicleId: string;
  readonly incarnation: string;
  readonly distanceM: number;
  readonly speedMps: number;
}

function identityPart(value: unknown): string {
  const id = text(value);
  requireContract(id.length <= MAX_IDENTITY_LENGTH, 'Pedestrian identity exceeds capacity');
  return id;
}

function readBoolean(value: unknown, message: string): boolean {
  requireContract(typeof value === 'boolean', message);
  return value;
}

function readPoint(value: unknown): Vector3 {
  const data = fields(value, ['x', 'y', 'z']);
  return Object.freeze({
    x: number(data.x, -1e6, 1e6),
    y: number(data.y, -1e6, 1e6),
    z: number(data.z, -1e6, 1e6),
  });
}

function lerp(a: Vector3, b: Vector3, fraction: number): Vector3 {
  return Object.freeze({
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction,
    z: a.z + (b.z - a.z) * fraction,
  });
}

function pointAt(a: Vector3, axis: Readonly<{ x: number; z: number }>, distance: number): Vector3 {
  return Object.freeze({ x: a.x + axis.x * distance, y: a.y, z: a.z + axis.z * distance });
}

function planarDistance(a: Vector3, b: Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

function boxOf(footprint: readonly Vector3[]): Box {
  const min = { x: Infinity, z: Infinity },
    max = { x: -Infinity, z: -Infinity };
  for (const point of footprint) {
    min.x = Math.min(min.x, point.x);
    min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x);
    max.z = Math.max(max.z, point.z);
  }
  return Object.freeze({ minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z });
}

function distanceToBox(point: Vector3, box: Box): number {
  const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
  const dz = Math.max(box.minZ - point.z, 0, point.z - box.maxZ);
  return Math.hypot(dx, dz);
}

function clampToBox(point: Vector3, box: Box): Vector3 {
  return Object.freeze({
    x: Math.min(box.maxX, Math.max(box.minX, point.x)),
    y: point.y,
    z: Math.min(box.maxZ, Math.max(box.minZ, point.z)),
  });
}

function positionOf(pedestrian: PedestrianRecord): Vector3 {
  const route = pedestrian.route;
  const walked = Math.max(
    0,
    Math.min(
      route.approachLengthM + route.crossingLengthM + route.exitLengthM,
      pedestrian.distanceWalkedM,
    ),
  );
  if (walked <= route.approachLengthM)
    return lerp(
      route.startM,
      route.entryM,
      route.approachLengthM > EPSILON ? walked / route.approachLengthM : 1,
    );
  const crossingEnd = route.approachLengthM + route.crossingLengthM;
  if (walked <= crossingEnd)
    return lerp(
      route.entryM,
      route.exitM,
      route.crossingLengthM > EPSILON
        ? (walked - route.approachLengthM) / route.crossingLengthM
        : 1,
    );
  return lerp(
    route.exitM,
    route.endM,
    route.exitLengthM > EPSILON ? (walked - crossingEnd) / route.exitLengthM : 1,
  );
}

function snapshotOf(pedestrian: PedestrianRecord): PedestrianSnapshot {
  const route = pedestrian.route;
  const walked = Math.max(
    0,
    Math.min(route.approachLengthM + route.crossingLengthM, pedestrian.distanceWalkedM),
  );
  const crossed = Math.max(0, walked - route.approachLengthM);
  return Object.freeze({
    pedestrianId: pedestrian.pedestrianId,
    crosswalkId: pedestrian.crosswalkId,
    laneIds: pedestrian.laneIds,
    direction: pedestrian.direction,
    state: pedestrian.state,
    stateSinceTick: pedestrian.stateSinceTick,
    positionM: positionOf(pedestrian),
    walkSpeedMps: pedestrian.walkSpeedMps,
    patienceTicks: pedestrian.patienceTicks,
    safetyMarginS: pedestrian.safetyMarginS,
    approachLengthM: route.approachLengthM,
    crossingLengthM: route.crossingLengthM,
    crossingProgress:
      route.crossingLengthM > EPSILON ? Math.min(1, crossed / route.crossingLengthM) : 1,
    crossingRemainingM: Math.max(0, route.crossingLengthM - crossed),
    distanceWalkedM: pedestrian.distanceWalkedM,
    waitedTicks: pedestrian.waitedTicks,
    withdrawalReason: pedestrian.withdrawalReason,
    learningEligible: null,
  });
}

function conflictOf(conflict: MutableConflict): PedestrianConflict {
  return Object.freeze({
    ...conflict.record,
    outcome: conflict.outcome,
    stopTick: conflict.stopTick,
    stopDistanceM: conflict.stopDistanceM,
    minimumDistanceM: conflict.minimumDistanceM,
    maximumSpeedMps: conflict.maximumSpeedMps,
  });
}

/**
 * Pedestrians as world entities: a derived sidewalk approach, a real crossing link and a closed
 * state machine. Vehicle facts and contacts are owned by their producers; this module validates,
 * observes and counts them and never invents a yield, a stop, an impact or a denominator.
 */
export function createPedestrians(
  input: unknown,
  context: { readonly sessionId: string; readonly worldEpoch: number },
  options: PedestrianOptions,
): Pedestrians {
  const settings = record(options);
  requireContract(
    Object.keys(settings).every((key) =>
      [
        'seed',
        'maxPedestrians',
        'pedestriansPerCrosswalk',
        'minWalkSpeedMps',
        'maxWalkSpeedMps',
        'minPatienceS',
        'maxPatienceS',
        'minSafetyMarginS',
        'maxSafetyMarginS',
        'approachLengthM',
        'maxSidewalkGapM',
        'conflictHorizonM',
        'stopApproachM',
        'stopStandstillMps',
        'heightToleranceM',
        'maxVehiclesPerStep',
        'maxConflicts',
        'maxStops',
        'maxCollisions',
      ].includes(key),
    ),
    'Unknown pedestrian option',
  );
  const seed = number(settings.seed, 0, 0xffff_ffff);
  requireContract(Number.isInteger(seed), 'Expected uint32 pedestrian seed');
  const world = fields(context, ['sessionId', 'worldEpoch']);
  const sessionId = identityPart(world.sessionId),
    worldEpoch = readTick(world.worldEpoch);
  const maxPedestrians = number(
    settings.maxPedestrians ?? PEDESTRIAN_LIMITS.maxPedestrians,
    1,
    4096,
  );
  const perCrosswalk = number(
    settings.pedestriansPerCrosswalk ?? PEDESTRIAN_LIMITS.pedestriansPerCrosswalk,
    0,
    16,
  );
  const minWalkSpeed = number(
    settings.minWalkSpeedMps ?? PEDESTRIAN_LIMITS.minWalkSpeedMps,
    0.2,
    4,
  );
  const maxWalkSpeed = number(
    settings.maxWalkSpeedMps ?? PEDESTRIAN_LIMITS.maxWalkSpeedMps,
    minWalkSpeed,
    4,
  );
  const minPatienceS = number(settings.minPatienceS ?? PEDESTRIAN_LIMITS.minPatienceS, 0, 30);
  const maxPatienceS = number(
    settings.maxPatienceS ?? PEDESTRIAN_LIMITS.maxPatienceS,
    minPatienceS,
    60,
  );
  const minMarginS = number(settings.minSafetyMarginS ?? PEDESTRIAN_LIMITS.minSafetyMarginS, 0, 10);
  const maxMarginS = number(
    settings.maxSafetyMarginS ?? PEDESTRIAN_LIMITS.maxSafetyMarginS,
    minMarginS,
    10,
  );
  const approachLengthM = number(
    settings.approachLengthM ?? PEDESTRIAN_LIMITS.approachLengthM,
    0,
    30,
  );
  const maxSidewalkGapM = number(
    settings.maxSidewalkGapM ?? PEDESTRIAN_LIMITS.maxSidewalkGapM,
    0,
    200,
  );
  const conflictHorizonM = number(
    settings.conflictHorizonM ?? PEDESTRIAN_LIMITS.conflictHorizonM,
    0.5,
    200,
  );
  const stopApproachM = number(settings.stopApproachM ?? PEDESTRIAN_LIMITS.stopApproachM, 0.5, 200);
  const standstillMps = number(
    settings.stopStandstillMps ?? PEDESTRIAN_LIMITS.stopStandstillMps,
    0,
    1,
  );
  const heightToleranceM = number(
    settings.heightToleranceM ?? PEDESTRIAN_LIMITS.heightToleranceM,
    0,
    10,
  );
  const maxVehiclesPerStep = number(
    settings.maxVehiclesPerStep ?? PEDESTRIAN_LIMITS.maxVehiclesPerStep,
    0,
    4096,
  );
  const maxConflicts = number(settings.maxConflicts ?? PEDESTRIAN_LIMITS.maxConflicts, 0, 65536);
  const maxStops = number(settings.maxStops ?? PEDESTRIAN_LIMITS.maxStops, 0, 65536);
  const maxCollisions = number(settings.maxCollisions ?? PEDESTRIAN_LIMITS.maxCollisions, 0, 65536);
  for (const capacity of [
    maxPedestrians,
    perCrosswalk,
    maxVehiclesPerStep,
    maxConflicts,
    maxStops,
    maxCollisions,
  ])
    requireContract(Number.isSafeInteger(capacity), 'Pedestrian capacities must be integers');

  const map = parseRoadMap(input);
  const graph: LaneGraph = createLaneGraph(map);
  const zones = createCrosswalkZones(map);
  const layout = createCityLayout(map);
  const lanes = new Map<string, Lane>(map.lanes.map((lane) => [lane.id, lane]));
  const stopLines = new Map(map.stopLines.map((line) => [line.id, line]));
  const paths = new Map(map.geometry.paths.map((path) => [path.id, path]));
  const nodes = new Map(map.geometry.nodes.map((node) => [node.id, node.positionM]));
  const sidewalkBoxes = layout.elements
    .filter((element): element is CityPlanarElement => element.kind === 'SIDEWALK')
    .map((element) => Object.freeze({ id: element.id, box: boxOf(element.footprintM) }));

  const refusedLinks: PedestrianRefusedLink[] = [];
  const links: PedestrianLink[] = [];
  const crossingsByLane = new Map<string, CrossingReference[]>();
  const orderedCrosswalks = [...map.crosswalks].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  let lanesWithoutLine = 0;

  const nearestSidewalk = (point: Vector3) => {
    let best: { id: string; box: Box; distance: number } | null = null;
    for (const candidate of sidewalkBoxes) {
      const distance = distanceToBox(point, candidate.box);
      if (
        !best ||
        distance < best.distance - EPSILON ||
        (Math.abs(distance - best.distance) <= EPSILON && candidate.id < best.id)
      )
        best = { id: candidate.id, box: candidate.box, distance };
    }
    return best;
  };

  for (const crosswalk of orderedCrosswalks) {
    const polygon = zones.getZone(crosswalk.id)?.polygon ?? [];
    if (polygon.length < 3) {
      refusedLinks.push(
        Object.freeze({ crosswalkId: crosswalk.id, reason: 'DEGENERATE_GEOMETRY' }),
      );
      continue;
    }
    const center = { x: 0, y: 0, z: 0 };
    for (const vertex of polygon) {
      center.x += vertex.x / polygon.length;
      center.y += vertex.y / polygon.length;
      center.z += vertex.z / polygon.length;
    }
    const centerPoint: Vector3 = Object.freeze({ x: center.x, y: center.y, z: center.z });
    const laneIds = [...crosswalk.laneIds].sort();
    // The authored crosswalk line of each lane is the real yield point; projecting its midpoint
    // onto the lane gives both the longitudinal position and the lane heading.
    const laneReferences: { laneId: string; longitudinalM: number; headingRad: number }[] = [];
    for (const laneId of laneIds) {
      const lane = lanes.get(laneId);
      if (!lane) continue;
      const line = crosswalk.stopLineIds
        .map((id) => stopLines.get(id))
        .find((candidate) => candidate?.laneId === laneId);
      if (!line) continue;
      const path = paths.get(line.geometryId);
      if (!path || path.nodeIds.length < 2) continue;
      const first = nodes.get(path.nodeIds[0]!),
        last = nodes.get(path.nodeIds[path.nodeIds.length - 1]!);
      if (!first || !last) continue;
      const midpoint: Vector3 = Object.freeze({
        x: (first.x + last.x) / 2,
        y: (first.y + last.y) / 2,
        z: (first.z + last.z) / 2,
      });
      for (const access of lane.access) {
        const projection = graph.projectOnLane(laneId, {
          positionM: midpoint,
          access,
          maxHeightDifferenceM: heightToleranceM,
        });
        if (projection && projection.headingRad !== null) {
          laneReferences.push({
            laneId,
            longitudinalM: projection.longitudinalM,
            headingRad: projection.headingRad,
          });
          break;
        }
      }
    }
    if (laneReferences.length === 0) {
      refusedLinks.push(Object.freeze({ crosswalkId: crosswalk.id, reason: 'NO_LANE_PROJECTION' }));
      continue;
    }
    lanesWithoutLine += laneIds.length - laneReferences.length;
    const headingRad = laneReferences[0]!.headingRad;
    const axis = Object.freeze({
      x: Math.cos(headingRad + Math.PI / 2),
      z: Math.sin(headingRad + Math.PI / 2),
    });
    let minimum = Infinity,
      maximum = -Infinity;
    for (const vertex of polygon) {
      const projection = (vertex.x - centerPoint.x) * axis.x + (vertex.z - centerPoint.z) * axis.z;
      minimum = Math.min(minimum, projection);
      maximum = Math.max(maximum, projection);
    }
    const crossingLengthM = maximum - minimum;
    if (!(crossingLengthM > 0.5)) {
      refusedLinks.push(
        Object.freeze({ crosswalkId: crosswalk.id, reason: 'DEGENERATE_GEOMETRY' }),
      );
      continue;
    }
    const entryA = pointAt(centerPoint, axis, minimum),
      entryB = pointAt(centerPoint, axis, maximum);
    const sidewalkA = nearestSidewalk(entryA),
      sidewalkB = nearestSidewalk(entryB);
    if (
      !sidewalkA ||
      !sidewalkB ||
      sidewalkA.distance > maxSidewalkGapM + EPSILON ||
      sidewalkB.distance > maxSidewalkGapM + EPSILON
    ) {
      refusedLinks.push(Object.freeze({ crosswalkId: crosswalk.id, reason: 'NO_SIDEWALK' }));
      continue;
    }
    const startA = clampToBox(
      pointAt(entryA, { x: -axis.x, z: -axis.z }, approachLengthM),
      sidewalkA.box,
    );
    const startB = clampToBox(pointAt(entryB, axis, approachLengthM), sidewalkB.box);
    const link: PedestrianLink = Object.freeze({
      crosswalkId: crosswalk.id,
      laneIds: Object.freeze(laneIds),
      referenceLaneId: laneReferences[0]!.laneId,
      laneLines: Object.freeze(
        laneReferences.map((reference) =>
          Object.freeze({ laneId: reference.laneId, longitudinalM: reference.longitudinalM }),
        ),
      ),
      headingRad,
      crossingAxis: axis,
      entryAM: entryA,
      entryBM: entryB,
      startAM: startA,
      startBM: startB,
      sidewalkIdA: sidewalkA.id,
      sidewalkIdB: sidewalkB.id,
      approachLengthAM: planarDistance(startA, entryA),
      approachLengthBM: planarDistance(startB, entryB),
      crossingLengthM,
    });
    links.push(link);
    for (const laneReference of laneReferences) {
      const list = crossingsByLane.get(laneReference.laneId) ?? [];
      list.push(
        Object.freeze({
          crosswalkId: crosswalk.id,
          longitudinalM: laneReference.longitudinalM,
        }),
      );
      crossingsByLane.set(laneReference.laneId, list);
    }
  }

  const pedestrians = new Map<string, PedestrianRecord>();
  const conflicts: MutableConflict[] = [];
  const stops: PedestrianStop[] = [];
  const collisions: PedestrianCollision[] = [];
  const stopTracking = new Map<string, { stopped: boolean }>();
  const counts = {
    created: 0,
    withdrawn: 0,
    crossingsStarted: 0,
    crossingsCompleted: 0,
    crossingsInterrupted: 0,
    gapCrossings: 0,
    assertedCrossings: 0,
    freeCrossings: 0,
    yieldedCrossings: 0,
    crossingsWithoutYield: 0,
    unobservedCrossings: 0,
    conflictRecords: 0,
    stopEvents: 0,
    yieldStopEvents: 0,
    collisions: 0,
    completeSteps: 0,
    incompleteSteps: 0,
    steps: 0,
    pedestrianEvaluations: 0,
    vehicleEvaluations: 0,
    peakPedestriansPerStep: 0,
    peakVehiclesPerStep: 0,
  };
  const pedestriansRequested = links.length * perCrosswalk;
  let watermark = -1;
  let disposed = false;

  for (const link of links) {
    for (let index = 0; index < perCrosswalk; index += 1) {
      if (pedestrians.size >= maxPedestrians) break;
      const pedestrianId = createStableId('pedestrian', sessionId, [
        String(worldEpoch),
        map.mapId,
        link.crosswalkId,
        String(index),
      ]);
      const direction: PedestrianDirection = index % 2 === 0 ? 'A_TO_B' : 'B_TO_A';
      const walkSample = randomUnit(seed, `walk-speed\u0000${pedestrianId}`);
      const patienceSample = randomUnit(seed, `patience\u0000${pedestrianId}`);
      const marginSample = randomUnit(seed, `safety-margin\u0000${pedestrianId}`);
      const walkSpeedMps = minWalkSpeed + walkSample * (maxWalkSpeed - minWalkSpeed);
      const patienceTicks = Math.max(
        1,
        Math.round((minPatienceS + patienceSample * (maxPatienceS - minPatienceS)) * FIXED_TICK_HZ),
      );
      const safetyMarginS = minMarginS + marginSample * (maxMarginS - minMarginS);
      const route: Route =
        direction === 'A_TO_B'
          ? {
              startM: link.startAM,
              entryM: link.entryAM,
              exitM: link.entryBM,
              endM: link.startBM,
              approachLengthM: link.approachLengthAM,
              crossingLengthM: link.crossingLengthM,
              exitLengthM: link.approachLengthBM,
            }
          : {
              startM: link.startBM,
              entryM: link.entryBM,
              exitM: link.entryAM,
              endM: link.startAM,
              approachLengthM: link.approachLengthBM,
              crossingLengthM: link.crossingLengthM,
              exitLengthM: link.approachLengthAM,
            };
      pedestrians.set(pedestrianId, {
        pedestrianId,
        crosswalkId: link.crosswalkId,
        laneIds: link.laneIds,
        direction,
        route,
        walkSpeedMps,
        patienceTicks,
        safetyMarginS,
        state: 'ON_SIDEWALK',
        stateSinceTick: 0,
        waitedTicks: 0,
        distanceWalkedM: 0,
        episodeStartedTick: null,
        episodeDecision: null,
        episodeCoverageComplete: false,
        conflicts: new Map(),
        withdrawalReason: null,
      });
      counts.created += 1;
    }
  }
  const capacityTruncated = pedestriansRequested - pedestrians.size;

  /** Creation order is deterministic: links are sorted and slots are enumerated per crosswalk. */
  const records = () => [...pedestrians.values()];

  const gapList = (): readonly Readonly<{ id: PedestrianGapId; detail: string }>[] => {
    const gaps: { id: PedestrianGapId; detail: string }[] = [];
    if (map.crosswalks.length === 0)
      gaps.push({
        id: 'NO_CROSSWALK',
        detail: 'The map declares no crosswalk, so no pedestrian exists',
      });
    if (refusedLinks.length > 0)
      gaps.push({
        id: 'REFUSED_CROSSWALK_LINK',
        detail: `${refusedLinks.length} crosswalks have no derived pedestrian link`,
      });
    if (lanesWithoutLine > 0)
      gaps.push({
        id: 'MISSING_CROSSING_LINE',
        detail: `${lanesWithoutLine} crosswalk lanes have no authored line, so they never observe a conflict`,
      });
    if (capacityTruncated > 0)
      gaps.push({
        id: 'PEDESTRIAN_CAPACITY_TRUNCATED',
        detail: `${capacityTruncated} requested pedestrians were not created at maxPedestrians=${maxPedestrians}`,
      });
    if (counts.incompleteSteps > 0)
      gaps.push({
        id: 'INCOMPLETE_VEHICLE_COVERAGE',
        detail: `${counts.incompleteSteps} of ${counts.steps} steps lacked complete vehicle enumeration`,
      });
    if (counts.yieldedCrossings + counts.crossingsWithoutYield === 0)
      gaps.push({
        id: 'NO_COMPLETE_CONFLICT_EPISODE',
        detail: 'No completed crossing had both complete coverage and an observed conflict',
      });
    return Object.freeze(gaps.map((gap) => Object.freeze(gap)));
  };

  const rate = (
    id: PedestrianRate['id'],
    numerator: number,
    denominator: number,
    reason: PedestrianRate['reason'],
  ): PedestrianRate =>
    Object.freeze({
      id,
      numerator,
      denominator,
      value: denominator === 0 ? null : numerator / denominator,
      status: denominator === 0 ? 'MISSING' : 'OBSERVED',
      reason: denominator === 0 ? reason : null,
    });

  const inspection = (): PedestrianInspection => {
    let live = 0;
    for (const pedestrian of pedestrians.values()) if (pedestrian.state !== 'WITHDRAWN') live += 1;
    return Object.freeze({
      counts: Object.freeze({
        created: counts.created,
        withdrawn: counts.withdrawn,
        live,
        crossingsStarted: counts.crossingsStarted,
        crossingsCompleted: counts.crossingsCompleted,
        crossingsInterrupted: counts.crossingsInterrupted,
        gapCrossings: counts.gapCrossings,
        assertedCrossings: counts.assertedCrossings,
        freeCrossings: counts.freeCrossings,
        yieldedCrossings: counts.yieldedCrossings,
        crossingsWithoutYield: counts.crossingsWithoutYield,
        unobservedCrossings: counts.unobservedCrossings,
        conflictRecords: counts.conflictRecords,
        stopEvents: counts.stopEvents,
        yieldStopEvents: counts.yieldStopEvents,
        collisions: counts.collisions,
      }),
      coverage: Object.freeze({
        steps: counts.steps,
        completeSteps: counts.completeSteps,
        incompleteSteps: counts.incompleteSteps,
      }),
      denominators: Object.freeze({
        yieldRate: rate(
          'YIELD_RATE',
          counts.yieldedCrossings,
          counts.yieldedCrossings + counts.crossingsWithoutYield,
          'NO_COMPLETE_CONFLICT_EPISODE',
        ),
        crossingCompletionRate: rate(
          'CROSSING_COMPLETION_RATE',
          counts.crossingsCompleted,
          counts.crossingsStarted,
          'NO_CROSSING',
        ),
      }),
      gaps: gapList(),
    });
  };

  const network = (): PedestrianNetwork => {
    const lengths = links.map((link) => link.crossingLengthM);
    return Object.freeze({
      mapId: map.mapId,
      crosswalks: map.crosswalks.length,
      links: links.length,
      refusedLinks: Object.freeze([...refusedLinks]),
      pedestriansRequested,
      pedestriansCreated: pedestrians.size,
      capacityTruncated,
      linkedLanes: crossingsByLane.size,
      lanesWithoutLine,
      crossingLengthM:
        lengths.length === 0
          ? null
          : Object.freeze({
              min: Math.min(...lengths),
              max: Math.max(...lengths),
              mean: lengths.reduce((sum, value) => sum + value, 0) / lengths.length,
            }),
    });
  };
  const step = (value: unknown): PedestrianStep => {
    requireContract(!disposed, 'Pedestrians disposed');
    const data = record(value);
    requireContract(
      Object.keys(data).every((key) =>
        ['tick', 'vehicles', 'vehiclesComplete', 'contacts'].includes(key),
      ),
      'Unknown pedestrian step field',
    );
    requireContract(
      ['tick', 'vehicles', 'vehiclesComplete'].every((key) => Object.hasOwn(data, key)),
      'Missing pedestrian step field',
    );
    const tick = readTick(data.tick);
    requireContract(tick > watermark, 'Stale pedestrian step tick');
    requireContract(
      Array.isArray(data.vehicles) && data.vehicles.length <= maxVehiclesPerStep,
      'Pedestrian vehicle capacity exceeded',
    );
    const vehicleKeys = new Set<string>();
    const vehicles = list(data.vehicles, (entry): PedestrianVehicleFact => {
      const raw = fields(entry, [
        'vehicleId',
        'incarnation',
        'laneId',
        'positionM',
        'speedMps',
        'observable',
      ]);
      const vehicleId = identityPart(raw.vehicleId),
        incarnation = identityPart(raw.incarnation),
        laneId = identityPart(raw.laneId);
      requireContract(lanes.has(laneId), 'Vehicle lane is not part of the pedestrian map');
      const key = `${vehicleId}\u0000${incarnation}`;
      requireContract(!vehicleKeys.has(key), 'Duplicate pedestrian vehicle observation');
      vehicleKeys.add(key);
      return Object.freeze({
        vehicleId,
        incarnation,
        laneId,
        positionM: readPoint(raw.positionM),
        speedMps: number(raw.speedMps, 0, 200),
        observable: readBoolean(raw.observable, 'Expected boolean'),
      });
    });
    const vehiclesComplete = readBoolean(data.vehiclesComplete, 'Expected boolean');
    const contacts = list(data.contacts === undefined ? [] : data.contacts, (entry) => {
      const raw = fields(entry, ['vehicleId', 'pedestrianId', 'tick', 'positionM', 'speedMps']);
      const contactTick = readTick(raw.tick);
      requireContract(contactTick === tick, 'Pedestrian contact does not belong to this step');
      return Object.freeze({
        vehicleId: identityPart(raw.vehicleId),
        pedestrianId: identityPart(raw.pedestrianId),
        tick: contactTick,
        positionM: readPoint(raw.positionM),
        speedMps: number(raw.speedMps, 0, 200),
      });
    });
    const complete = vehiclesComplete && vehicles.every((vehicle) => vehicle.observable);
    const events: PedestrianEvent[] = [];
    counts.steps += 1;
    if (complete) counts.completeSteps += 1;
    else counts.incompleteSteps += 1;
    counts.vehicleEvaluations += vehicles.length;
    counts.peakVehiclesPerStep = Math.max(counts.peakVehiclesPerStep, vehicles.length);
    const liveCount = records().reduce(
      (total, pedestrian) => total + (pedestrian.state === 'WITHDRAWN' ? 0 : 1),
      0,
    );
    counts.peakPedestriansPerStep = Math.max(counts.peakPedestriansPerStep, liveCount);

    const vehicleFacts = new Map<string, VehicleFact[]>();
    for (const vehicle of vehicles) {
      if (!vehicle.observable) continue;
      const lane = lanes.get(vehicle.laneId)!;
      let projection: ReturnType<LaneGraph['projectOnLane']> = null;
      for (const access of lane.access) {
        projection = graph.projectOnLane(vehicle.laneId, {
          positionM: vehicle.positionM,
          access,
          maxHeightDifferenceM: heightToleranceM,
        });
        if (projection) break;
      }
      requireContract(projection !== null, 'Vehicle position is not on its declared lane');
      const longitudinalM = projection!.longitudinalM;
      for (const reference of crossingsByLane.get(vehicle.laneId) ?? []) {
        const facts = vehicleFacts.get(reference.crosswalkId) ?? [];
        facts.push(
          Object.freeze({
            vehicleId: vehicle.vehicleId,
            incarnation: vehicle.incarnation,
            distanceM: reference.longitudinalM - longitudinalM,
            speedMps: vehicle.speedMps,
          }),
        );
        vehicleFacts.set(reference.crosswalkId, facts);
      }
    }

    const transition = (
      pedestrian: PedestrianRecord,
      to: PedestrianState,
      reason: PedestrianTransitionReason,
    ) => {
      const from = pedestrian.state;
      requireContract(
        PEDESTRIAN_STATE_TRANSITIONS[from].includes(to),
        `Illegal pedestrian transition ${from} -> ${to}`,
      );
      pedestrian.state = to;
      pedestrian.stateSinceTick = tick;
      if (to === 'WITHDRAWN') {
        pedestrian.withdrawalReason =
          reason === 'IMPACT' ? 'IMPACT' : reason === 'ROUTE_COMPLETE' ? 'ROUTE_COMPLETE' : null;
        requireContract(
          pedestrian.withdrawalReason !== null,
          'Withdrawal requires a closed reason',
        );
        counts.withdrawn += 1;
      }
      events.push(
        Object.freeze({
          kind: 'STATE_CHANGED',
          id: createStableId('pedestrian-state', sessionId, [
            String(worldEpoch),
            pedestrian.pedestrianId,
            String(tick),
            from,
            to,
          ]),
          tick,
          pedestrianId: pedestrian.pedestrianId,
          from,
          to,
          reason,
        }),
      );
    };

    const finishEpisode = (pedestrian: PedestrianRecord, completed: boolean) => {
      if (completed) counts.crossingsCompleted += 1;
      else counts.crossingsInterrupted += 1;
      let yielded = false;
      for (const conflict of pedestrian.conflicts.values()) {
        if (conflict.outcome === 'PENDING')
          conflict.outcome =
            conflict.stopTick !== null || conflict.observedStandstill
              ? 'YIELDED'
              : 'CROSSED_WITHOUT_YIELD';
        if (conflict.outcome === 'YIELDED') yielded = true;
      }
      if (!completed) return;
      if (!pedestrian.episodeCoverageComplete) {
        counts.unobservedCrossings += 1;
        return;
      }
      if (pedestrian.conflicts.size === 0) counts.freeCrossings += 1;
      else if (yielded) counts.yieldedCrossings += 1;
      else counts.crossingsWithoutYield += 1;
    };

    const observeConflict = (pedestrian: PedestrianRecord, fact: VehicleFact) => {
      const key = `${fact.vehicleId}\u0000${fact.incarnation}`;
      const existing = pedestrian.conflicts.get(key);
      if (existing) {
        existing.minimumDistanceM = Math.min(existing.minimumDistanceM, fact.distanceM);
        existing.maximumSpeedMps = Math.max(existing.maximumSpeedMps, fact.speedMps);
        if (fact.speedMps <= standstillMps) existing.observedStandstill = true;
        return;
      }
      requireContract(conflicts.length < maxConflicts, 'Pedestrian conflict capacity exceeded');
      const crossingRemainingM = pedestrian.route.crossingLengthM;
      const crossingRemainingS = crossingRemainingM / pedestrian.walkSpeedMps;
      const timeToConflictS = fact.speedMps > 0 ? fact.distanceM / fact.speedMps : null;
      const mutable: MutableConflict = {
        record: Object.freeze({
          id: createStableId('pedestrian-conflict', sessionId, [
            String(worldEpoch),
            pedestrian.pedestrianId,
            fact.vehicleId,
            fact.incarnation,
            String(tick),
          ]),
          pedestrianId: pedestrian.pedestrianId,
          crosswalkId: pedestrian.crosswalkId,
          vehicleId: fact.vehicleId,
          incarnation: fact.incarnation,
          tick,
          distanceM: fact.distanceM,
          speedMps: fact.speedMps,
          timeToConflictS,
          crossingRemainingM,
          crossingRemainingS,
          learningEligible: null,
        }),
        outcome: 'PENDING',
        stopTick: null,
        stopDistanceM: null,
        minimumDistanceM: fact.distanceM,
        maximumSpeedMps: fact.speedMps,
        observedStandstill: fact.speedMps <= standstillMps,
      };
      pedestrian.conflicts.set(key, mutable);
      conflicts.push(mutable);
      counts.conflictRecords += 1;
      events.push(
        Object.freeze({
          kind: 'CONFLICT_OBSERVED',
          id: createStableId('pedestrian-conflict-event', sessionId, [
            String(worldEpoch),
            pedestrian.pedestrianId,
            fact.vehicleId,
            fact.incarnation,
            String(tick),
          ]),
          tick,
          pedestrianId: pedestrian.pedestrianId,
          conflictId: mutable.record.id,
          vehicleId: fact.vehicleId,
          distanceM: fact.distanceM,
          speedMps: fact.speedMps,
          timeToConflictS,
        }),
      );
    };

    const crossingPedestrians = new Map<string, PedestrianRecord[]>();

    for (const pedestrian of records()) {
      if (pedestrian.state === 'WITHDRAWN') continue;
      const references = vehicleFacts.get(pedestrian.crosswalkId) ?? [];
      const approaching = references.filter(
        (fact) =>
          fact.distanceM > -pedestrian.route.crossingLengthM / 2 &&
          fact.distanceM <= conflictHorizonM,
      );
      counts.pedestrianEvaluations += 1;
      if (pedestrian.state === 'CROSSING') {
        const crossing = crossingPedestrians.get(pedestrian.crosswalkId) ?? [];
        crossing.push(pedestrian);
        crossingPedestrians.set(pedestrian.crosswalkId, crossing);
      }
      switch (pedestrian.state) {
        case 'ON_SIDEWALK': {
          pedestrian.distanceWalkedM = Math.min(
            pedestrian.route.approachLengthM,
            pedestrian.distanceWalkedM + pedestrian.walkSpeedMps * TICK_S,
          );
          if (pedestrian.distanceWalkedM >= pedestrian.route.approachLengthM - EPSILON) {
            pedestrian.distanceWalkedM = pedestrian.route.approachLengthM;
            transition(pedestrian, 'WAITING', 'ARRIVED_AT_CURB');
          }
          break;
        }
        case 'WAITING': {
          pedestrian.waitedTicks += 1;
          const crossingRemainingS = pedestrian.route.crossingLengthM / pedestrian.walkSpeedMps;
          let nearest = Infinity;
          for (const fact of approaching) {
            if (fact.speedMps <= standstillMps) continue;
            const timeToConflictS = fact.distanceM <= 0 ? 0 : fact.distanceM / fact.speedMps;
            nearest = Math.min(nearest, timeToConflictS);
          }
          const blocked = nearest <= crossingRemainingS + pedestrian.safetyMarginS;
          if (!blocked || pedestrian.waitedTicks >= pedestrian.patienceTicks) {
            const decision: PedestrianDecision = blocked ? 'ASSERTED' : 'GAP_ACCEPTED';
            pedestrian.episodeStartedTick = tick;
            pedestrian.episodeDecision = decision;
            pedestrian.episodeCoverageComplete = complete;
            pedestrian.conflicts.clear();
            counts.crossingsStarted += 1;
            if (decision === 'ASSERTED') counts.assertedCrossings += 1;
            else counts.gapCrossings += 1;
            events.push(
              Object.freeze({
                kind: 'CROSSING_DECIDED',
                id: createStableId('pedestrian-decision', sessionId, [
                  String(worldEpoch),
                  pedestrian.pedestrianId,
                  String(tick),
                ]),
                tick,
                pedestrianId: pedestrian.pedestrianId,
                decision,
                waitedTicks: pedestrian.waitedTicks,
                crossingRemainingS,
                nearestTimeToConflictS: Number.isFinite(nearest) ? nearest : null,
              }),
            );
            transition(pedestrian, 'CROSSING', 'CROSSING_STARTED');
            const crossing = crossingPedestrians.get(pedestrian.crosswalkId) ?? [];
            if (!crossing.includes(pedestrian)) crossing.push(pedestrian);
            crossingPedestrians.set(pedestrian.crosswalkId, crossing);
            for (const fact of approaching)
              if (fact.distanceM > 0) observeConflict(pedestrian, fact);
          }
          break;
        }
        case 'CROSSING': {
          if (!complete) pedestrian.episodeCoverageComplete = false;
          pedestrian.distanceWalkedM = Math.min(
            pedestrian.route.approachLengthM + pedestrian.route.crossingLengthM,
            pedestrian.distanceWalkedM + pedestrian.walkSpeedMps * TICK_S,
          );
          for (const fact of approaching) if (fact.distanceM > 0) observeConflict(pedestrian, fact);
          if (
            pedestrian.distanceWalkedM >=
            pedestrian.route.approachLengthM + pedestrian.route.crossingLengthM - EPSILON
          ) {
            pedestrian.distanceWalkedM =
              pedestrian.route.approachLengthM + pedestrian.route.crossingLengthM;
            finishEpisode(pedestrian, true);
            transition(pedestrian, 'CROSSED', 'CROSSING_COMPLETED');
          }
          break;
        }
        case 'CROSSED': {
          const total =
            pedestrian.route.approachLengthM +
            pedestrian.route.crossingLengthM +
            pedestrian.route.exitLengthM;
          pedestrian.distanceWalkedM = Math.min(
            total,
            pedestrian.distanceWalkedM + pedestrian.walkSpeedMps * TICK_S,
          );
          if (pedestrian.distanceWalkedM >= total - EPSILON) {
            pedestrian.distanceWalkedM = total;
            transition(pedestrian, 'WITHDRAWN', 'ROUTE_COMPLETE');
          }
          break;
        }
      }
    }

    for (const contact of contacts) {
      const pedestrian = pedestrians.get(contact.pedestrianId);
      requireContract(pedestrian !== undefined, 'Contact references an unknown pedestrian');
      requireContract(
        pedestrian.state !== 'WITHDRAWN',
        'Contact references an already withdrawn pedestrian',
      );
      requireContract(collisions.length < maxCollisions, 'Pedestrian collision capacity exceeded');
      const position = positionOf(pedestrian);
      const collision: PedestrianCollision = Object.freeze({
        id: createStableId('pedestrian-collision', sessionId, [
          String(worldEpoch),
          pedestrian.pedestrianId,
          contact.vehicleId,
          String(tick),
        ]),
        pedestrianId: pedestrian.pedestrianId,
        crosswalkId: pedestrian.crosswalkId,
        vehicleId: contact.vehicleId,
        tick,
        state: pedestrian.state,
        positionM: position,
        speedMps: contact.speedMps,
        learningEligible: null,
      });
      collisions.push(collision);
      counts.collisions += 1;
      if (pedestrian.state === 'CROSSING') finishEpisode(pedestrian, false);
      transition(pedestrian, 'WITHDRAWN', 'IMPACT');
      events.push(
        Object.freeze({
          kind: 'COLLISION_OBSERVED',
          id: createStableId('pedestrian-collision-event', sessionId, [
            String(worldEpoch),
            pedestrian.pedestrianId,
            contact.vehicleId,
            String(tick),
          ]),
          tick,
          pedestrianId: pedestrian.pedestrianId,
          collisionId: collision.id,
          vehicleId: contact.vehicleId,
        }),
      );
    }

    for (const [crosswalkId, facts] of vehicleFacts) {
      const crossing = crossingPedestrians.get(crosswalkId) ?? [];
      for (const fact of facts) {
        const key = `${crosswalkId}\u0000${fact.vehicleId}\u0000${fact.incarnation}`;
        if (fact.distanceM <= EPSILON || fact.distanceM > stopApproachM) {
          stopTracking.delete(key);
          continue;
        }
        const stoppedNow = fact.speedMps <= standstillMps;
        const previous = stopTracking.get(key);
        if (previous !== undefined && !previous.stopped && stoppedNow) {
          requireContract(stops.length < maxStops, 'Pedestrian stop capacity exceeded');
          let attributed: string | null = null;
          for (const pedestrian of crossing) {
            const conflict = pedestrian.conflicts.get(`${fact.vehicleId}\u0000${fact.incarnation}`);
            if (conflict && conflict.outcome === 'PENDING') {
              conflict.outcome = 'YIELDED';
              conflict.stopTick = tick;
              conflict.stopDistanceM = fact.distanceM;
              attributed ??= pedestrian.pedestrianId;
            }
          }
          const stop: PedestrianStop = Object.freeze({
            id: createStableId('pedestrian-stop', sessionId, [
              String(worldEpoch),
              crosswalkId,
              fact.vehicleId,
              fact.incarnation,
              String(tick),
            ]),
            crosswalkId,
            vehicleId: fact.vehicleId,
            incarnation: fact.incarnation,
            tick,
            distanceM: fact.distanceM,
            speedMps: fact.speedMps,
            duringCrossing: crossing.length > 0,
            pedestrianId: attributed ?? crossing[0]?.pedestrianId ?? null,
            learningEligible: null,
          });
          stops.push(stop);
          counts.stopEvents += 1;
          if (crossing.length > 0) counts.yieldStopEvents += 1;
        }
        stopTracking.set(key, { stopped: stoppedNow });
      }
    }
    for (const key of [...stopTracking.keys()]) {
      const [crosswalkId = '', vehicleId = '', incarnation = ''] = key.split('\u0000');
      const present = (vehicleFacts.get(crosswalkId) ?? []).some(
        (fact) => fact.vehicleId === vehicleId && fact.incarnation === incarnation,
      );
      if (!present) stopTracking.delete(key);
    }

    watermark = tick;
    return Object.freeze({ tick, events: Object.freeze(events) });
  };

  return Object.freeze({
    version: VERSION,
    mapId: map.mapId,
    seed,
    getLinks: () => Object.freeze([...links]),
    getNetwork: network,
    getPedestrian: (pedestrianId: string) => {
      const pedestrian = pedestrians.get(identityPart(pedestrianId));
      return pedestrian ? snapshotOf(pedestrian) : null;
    },
    getPedestrians: () => Object.freeze(records().map(snapshotOf)),
    getConflicts: () => Object.freeze(conflicts.map(conflictOf)),
    getStops: () => Object.freeze([...stops]),
    getCollisions: () => Object.freeze([...collisions]),
    getInspection: inspection,
    getStats: () =>
      Object.freeze({
        mapId: map.mapId,
        worldEpoch,
        pedestrians: pedestrians.size,
        live: inspection().counts.live,
        crossingLinks: links.length,
        refusedLinks: refusedLinks.length,
        conflicts: conflicts.length,
        stops: stops.length,
        collisions: collisions.length,
        steps: counts.steps,
        evaluationCost: Object.freeze({
          pedestrianEvaluations: counts.pedestrianEvaluations,
          vehicleEvaluations: counts.vehicleEvaluations,
          peakPedestriansPerStep: counts.peakPedestriansPerStep,
          peakVehiclesPerStep: counts.peakVehiclesPerStep,
        }),
        watermark,
        disposed,
      }),
    step,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      pedestrians.clear();
      conflicts.length = 0;
      stops.length = 0;
      collisions.length = 0;
      stopTracking.clear();
    },
  });
}
