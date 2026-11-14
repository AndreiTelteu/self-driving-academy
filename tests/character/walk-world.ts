/**
 * PBI 192 — shared fixtures for the walker tests and the deterministic evidence report.
 *
 * Every number comes from a delivered contract: the city layout (PBI 042), the vehicle collider
 * (PBI 022/145) and the character asset (PBI 191). The synthetic step/obstacle fixtures exist only
 * to exercise a policy boundary that the authored city does not contain (a ledge above the curb).
 */
import type { CharacterPoint } from '../../src/character';
import { createCharacterAsset } from '../../src/character';
import type {
  Walker,
  WalkerEvent,
  WalkerInput,
  WalkerState,
  WalkerStats,
  WalkSurfaceKind,
  WalkWorld,
  WalkWorldInput,
} from '../../src/character';
import {
  createCityWalkWorld,
  createWalkWorld,
  createWalkPolygon,
  createOrientedRectanglePolygon,
  circlePenetrationM,
  walkPolygonDistanceM,
} from '../../src/character';
import {
  VEHICLE_COLLISION_HALF_EXTENTS_M,
  vehicleVisualClass,
  vehicleGeometrySpec,
} from '../../src/rendering';
import { CITY_LAYOUT_DEFAULTS, createCityLayout, createNeighbourhoodMap } from '../../src/world';

export const SIDEWALK_ELEVATION_M = CITY_LAYOUT_DEFAULTS.sidewalkElevationM;
/** Numerical residue the circle solver may leave; not a real overlap. */
export const WALK_PENETRATION_TOLERANCE_M = 1e-9;

export interface RealWalkWorld {
  readonly layout: ReturnType<typeof createCityLayout>;
  readonly world: WalkWorld;
  readonly mapId: string;
  readonly elementCount: number;
  readonly laneWidthM: number;
}

let cached: RealWalkWorld | null = null;

/** The real authored neighbourhood city, converted into the walker's plain-data walk world. */
export function realWalkWorld(): RealWalkWorld {
  if (cached) return cached;
  const layout = createCityLayout(createNeighbourhoodMap());
  const laneWidths = [...new Set(layout.lanes.map((lane) => lane.widthM))].sort();
  if (laneWidths.length !== 1)
    throw new Error(`Expected one authored lane width, found ${laneWidths.join(', ')}`);
  cached = Object.freeze({
    layout,
    world: createCityWalkWorld(layout),
    mapId: layout.mapId,
    elementCount: layout.elements.length,
    laneWidthM: laneWidths[0]!,
  });
  return cached;
}

/** Which way points away from the block for each authored sidewalk strip. */
const OUTWARD_BY_SIDE = Object.freeze({
  S: { x: 0, z: -1 },
  N: { x: 0, z: 1 },
  W: { x: -1, z: 0 },
  E: { x: 1, z: 0 },
});

export interface SidewalkSpot {
  readonly stripId: string;
  readonly side: 'S' | 'N' | 'W' | 'E';
  /** Point on the strip, at the sidewalk elevation. */
  readonly inside: CharacterPoint;
  /** Point 0.5 m outside the curb, on the street slab at elevation 0. */
  readonly outside: CharacterPoint;
  /** Facing that walks from `outside` into the strip. */
  readonly inwardYawRad: number;
  /** Facing that walks along the strip. */
  readonly alongYawRad: number;
  readonly curbRiseM: number;
}

/**
 * First authored sidewalk strip whose outer edge really is a 0.14 m curb over the street slab.
 * Deterministic: strips are visited in authored order and the first match wins.
 */
export function realCurbSpot(): SidewalkSpot {
  const { layout, world } = realWalkWorld();
  for (const strip of layout.elements) {
    if (strip.kind !== 'SIDEWALK') continue;
    const side = strip.id.split(':').pop();
    if (side !== 'S' && side !== 'N' && side !== 'W' && side !== 'E') continue;
    const xs = strip.footprintM.map((vertex) => vertex.x);
    const zs = strip.footprintM.map((vertex) => vertex.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const direction = OUTWARD_BY_SIDE[side];
    const edge = {
      x: side === 'W' ? minX : side === 'E' ? maxX : (minX + maxX) / 2,
      z: side === 'S' ? minZ : side === 'N' ? maxZ : (minZ + maxZ) / 2,
    };
    const inside = { x: edge.x - direction.x * 1.2, z: edge.z - direction.z * 1.2 };
    const outside = { x: edge.x + direction.x * 0.5, z: edge.z + direction.z * 0.5 };
    const outsideHeight = world.surfaceAt(outside.x, outside.z);
    const insideHeight = world.surfaceAt(inside.x, inside.z);
    if (Math.abs(outsideHeight) > 1e-12) continue;
    if (Math.abs(insideHeight - SIDEWALK_ELEVATION_M) > 1e-12) continue;
    if (world.blockingAt(outside.x, outside.z).length > 0) continue;
    if (world.blockingAt(inside.x, inside.z).length > 0) continue;
    const inwardYawRad = Math.atan2(-direction.x, -direction.z);
    return Object.freeze({
      stripId: strip.id,
      side,
      inside: Object.freeze({ x: inside.x, y: insideHeight, z: inside.z }),
      outside: Object.freeze({ x: outside.x, y: outsideHeight, z: outside.z }),
      inwardYawRad,
      alongYawRad: side === 'S' || side === 'N' ? Math.PI / 2 : 0,
      curbRiseM: insideHeight - outsideHeight,
    });
  }
  throw new Error('The authored city has no sidewalk strip with a real 0.14 m curb');
}

export interface BuildingSpot {
  readonly buildingId: string;
  /** Two metres in front of the south face, on the block slab. */
  readonly start: CharacterPoint;
  readonly faceZ: number;
  readonly faceX: number;
  readonly heightM: number;
}

/** The first authored building whose south face can be approached across the block slab. */
export function realBuildingSpot(): BuildingSpot {
  const { layout, world } = realWalkWorld();
  for (const element of layout.elements) {
    if (element.kind !== 'BUILDING') continue;
    const xs = element.footprintM.map((vertex) => vertex.x);
    const zs = element.footprintM.map((vertex) => vertex.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const centerX = (minX + maxX) / 2;
    const startZ = minZ - 2;
    const height = world.surfaceAt(centerX, startZ);
    if (Math.abs(height - SIDEWALK_ELEVATION_M) > 1e-12) continue;
    if (world.blockingAt(centerX, startZ).length > 0) continue;
    return Object.freeze({
      buildingId: element.id,
      start: Object.freeze({ x: centerX, y: height, z: startZ }),
      faceZ: minZ,
      faceX: centerX,
      heightM: element.baseYM + element.heightM,
    });
  }
  throw new Error('The authored city has no building with a reachable south face');
}

export interface SedanWalkFootprint {
  readonly classId: string;
  readonly halfExtentsM: Readonly<{ x: number; z: number }>;
  readonly bottomM: number;
  readonly topM: number;
  readonly colliderHalfExtentsM: Readonly<{ x: number; z: number }>;
}

/**
 * The real sedan collider of PBI 022/145, expressed in the walker's ground frame. The chassis
 * origin sits `-wheelBottomM` above the ground, so the collider box keeps its authored half sizes.
 */
export function sedanWalkFootprint(): SedanWalkFootprint {
  const visual = vehicleVisualClass('sedan');
  const spec = vehicleGeometrySpec('sedan');
  const originAboveGroundM = -visual.wheelBottomM;
  const half = VEHICLE_COLLISION_HALF_EXTENTS_M;
  const roofTopM = Math.max(...spec.parts.map((part) => part.center[1] + part.size[1] / 2));
  if (!Number.isFinite(originAboveGroundM) || !Number.isFinite(roofTopM))
    throw new Error('Sedan geometry has no finite vertical extent');
  return Object.freeze({
    classId: visual.classId,
    halfExtentsM: Object.freeze({ x: half.x, z: half.z }),
    bottomM: originAboveGroundM - half.y,
    topM: originAboveGroundM + half.y,
    colliderHalfExtentsM: Object.freeze({ x: half.x, z: half.z }),
  });
}

export interface WalkVehicle {
  readonly footprint: SedanWalkFootprint;
  readonly snapshot: Readonly<{
    vehicleId: string;
    positionM: CharacterPoint;
    yawRad: number;
    halfExtentsM: Readonly<{ x: number; z: number }>;
    bottomM: number;
    topM: number;
  }>;
}

/** A frozen vehicle snapshot: any write attempt by the walker throws in strict mode. */
export function walkVehicle(
  vehicleId: string,
  positionM: CharacterPoint,
  yawRad: number,
): WalkVehicle {
  const footprint = sedanWalkFootprint();
  return Object.freeze({
    footprint,
    snapshot: Object.freeze({
      vehicleId,
      positionM: Object.freeze({ x: positionM.x, y: positionM.y, z: positionM.z }),
      yawRad,
      halfExtentsM: footprint.halfExtentsM,
      bottomM: footprint.bottomM,
      topM: footprint.topM,
    }),
  });
}

function rectangle(id: string, minX: number, maxX: number, minZ: number, maxZ: number) {
  return createWalkPolygon(id, [
    { x: minX, z: minZ },
    { x: maxX, z: minZ },
    { x: maxX, z: maxZ },
    { x: minX, z: maxZ },
  ]).vertices;
}

function slab(
  id: string,
  kind: WalkSurfaceKind,
  topM: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): WalkWorldInput['surfaces'][number] {
  return { id, kind, topM, vertices: rectangle(id, minX, maxX, minZ, maxZ) };
}

/**
 * A single ledge of `stepM` metres. `stepM = 0.14` is climbable because it is the real curb;
 * anything above the confirmed ceiling has to behave like a wall.
 */
export function stepFixtureWorld(stepM: number): WalkWorld {
  return createWalkWorld({
    surfaces: [
      slab('fixture:street', 'STREET', 0, -20, 20, -20, 2),
      slab('fixture:platform', 'PLATFORM', stepM, -20, 20, 2, 20),
    ],
    blockers: [],
    defaultGroundM: 0,
  });
}

/** A downward ledge of `dropM` metres; the same ceiling applies in the other direction. */
export function dropFixtureWorld(dropM: number): WalkWorld {
  return createWalkWorld({
    surfaces: [
      slab('fixture:upper', 'PLATFORM', 0.14, -20, 20, -20, 2),
      slab('fixture:lower', 'STREET', 0.14 - dropM, -20, 20, 2, 20),
    ],
    blockers: [],
    defaultGroundM: 0.14 - dropM,
  });
}

/** A static obstacle box on a flat street, with the delivered obstacle clearance margin. */
export function obstacleFixtureWorld(): WalkWorld {
  return createWalkWorld({
    surfaces: [slab('fixture:street', 'STREET', 0, -20, 20, -20, 20)],
    blockers: [
      {
        id: 'fixture:obstacle',
        kind: 'OBSTACLE',
        bottomM: 0,
        topM: 0.9,
        marginM: 0.05,
        vertices: rectangle('fixture:obstacle', -0.4, 0.4, 2.6, 3.4),
      },
    ],
    defaultGroundM: 0,
  });
}

export interface TickSample {
  readonly tick: number;
  readonly positionM: CharacterPoint;
  readonly speedMps: number;
  readonly clipId: string;
  readonly maxPenetrationM: number;
  readonly minClearanceM: number;
  readonly insideSolid: boolean;
}

/**
 * Independent measurement of how far the character cylinder overlaps any solid at this moment.
 * It reads the walk world and the caller's vehicle snapshots, never the walker's own numbers.
 */
export function measurePenetration(
  world: WalkWorld,
  positionM: CharacterPoint,
  radiusM: number,
  heightM: number,
  vehicles: readonly {
    vehicleId: string;
    positionM: CharacterPoint;
    yawRad: number;
    halfExtentsM: Readonly<{ x: number; z: number }>;
    bottomM: number;
    topM: number;
  }[] = [],
): {
  readonly maxPenetrationM: number;
  readonly minClearanceM: number;
  readonly insideSolid: boolean;
} {
  let maxPenetrationM = 0;
  let minClearanceM = Number.POSITIVE_INFINITY;
  let insideSolid = false;
  const reach = (polygon: { bounds: { minX: number; maxX: number; minZ: number; maxZ: number } }) =>
    polygon.bounds.maxX >= positionM.x - radiusM * 4 &&
    polygon.bounds.minX <= positionM.x + radiusM * 4 &&
    polygon.bounds.maxZ >= positionM.z - radiusM * 4 &&
    polygon.bounds.minZ <= positionM.z + radiusM * 4;
  for (const blocker of world.blockers) {
    if (blocker.topM <= positionM.y || blocker.bottomM >= positionM.y + heightM) continue;
    if (!reach(blocker.polygon)) continue;
    maxPenetrationM = Math.max(
      maxPenetrationM,
      circlePenetrationM(blocker.polygon, positionM.x, positionM.z, radiusM),
    );
    minClearanceM = Math.min(
      minClearanceM,
      walkPolygonDistanceM(blocker.polygon, positionM.x, positionM.z) - radiusM,
    );
    insideSolid =
      insideSolid || walkPolygonDistanceM(blocker.polygon, positionM.x, positionM.z) === 0;
  }
  for (const vehicle of vehicles) {
    if (vehicle.topM <= positionM.y || vehicle.bottomM >= positionM.y + heightM) continue;
    const polygon = createOrientedRectanglePolygon(
      `probe:${vehicle.vehicleId}`,
      vehicle.positionM,
      vehicle.halfExtentsM,
      vehicle.yawRad,
    );
    maxPenetrationM = Math.max(
      maxPenetrationM,
      circlePenetrationM(polygon, positionM.x, positionM.z, radiusM),
    );
    minClearanceM = Math.min(
      minClearanceM,
      walkPolygonDistanceM(polygon, positionM.x, positionM.z) - radiusM,
    );
    insideSolid = insideSolid || walkPolygonDistanceM(polygon, positionM.x, positionM.z) === 0;
  }
  return Object.freeze({
    maxPenetrationM,
    minClearanceM: Number.isFinite(minClearanceM) ? minClearanceM : Number.POSITIVE_INFINITY,
    insideSolid,
  });
}

/** Character cylinder measured from the PBI 191 asset, exactly what the walker uses by default. */
export function characterCapsule(): { readonly radiusM: number; readonly heightM: number } {
  const measured = createCharacterAsset().measured;
  return Object.freeze({
    radiusM: Math.max(measured.footprintWidthM, measured.footprintDepthM) / 2,
    heightM: measured.heightM,
  });
}

export interface ScenarioRun {
  readonly samples: readonly TickSample[];
  readonly events: readonly WalkerEvent[];
  readonly finalState: WalkerState;
  readonly stats: WalkerStats;
}

/** Drives the walker through fixed ticks and measures every tick independently. */
export function runTicks(
  walker: Walker,
  ticks: number,
  input: WalkerInput,
  vehicles: readonly WalkVehicle['snapshot'][] = [],
): ScenarioRun {
  const capsule = walker.capsule;
  const samples: TickSample[] = [];
  const events: WalkerEvent[] = [];
  for (let index = 0; index < ticks; index += 1) {
    const result = walker.step({ tick: walker.state.tick + 1, input, vehicles });
    const measurement = measurePenetration(
      walker.world,
      result.state.positionM,
      capsule.radiusM,
      capsule.heightM,
      vehicles,
    );
    samples.push(
      Object.freeze({
        tick: result.state.tick,
        positionM: result.state.positionM,
        speedMps: result.state.speedMps,
        clipId: result.state.clipId,
        maxPenetrationM: measurement.maxPenetrationM,
        minClearanceM: measurement.minClearanceM,
        insideSolid: measurement.insideSolid,
      }),
    );
    events.push(...result.events);
  }
  return Object.freeze({
    samples: Object.freeze(samples),
    events: Object.freeze(events),
    finalState: walker.state,
    stats: walker.stats,
  });
}
