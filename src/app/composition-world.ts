/**
 * PBI 236 — așezarea deterministă a scenariului de compunere în orașul real 042.
 *
 * Punctul de start este pe carosabil, la 0,60 m de bordura unui trotuar autorat, iar taxiul este
 * parcat paralel la 1,75 m de aceeași bordură. Distanța de la picioare la ușa celui mai apropiat
 * flanc este sub raza reală de 0,89 m a lui 195, iar corpul personajului rămâne în afara
 * colliderului de mașină (1,05 m față de linia mediană). Nu există numere inventate: bordura,
 * trotuarul și limita de viteză vin din layout, iar caroseria din geometria 145.
 */
import { createCityWalkWorld, type WalkWorld } from '../character';
import {
  CITY_LAYOUT_DEFAULTS,
  createCityLayout,
  createLaneGraph,
  createNeighbourhoodMap,
  type CityLayout,
  type LaneGraph,
  type RoadMap,
} from '../world';
import type { CompositionVehicleSeed } from './walking-composition';

export const V3_COMPOSITION_WORLD_VERSION = '236-composition-world-v1' as const;

/** Distanța de la bordură la centrul picioarelor, pe carosabil. */
export const COMPOSITION_SPAWN_CURB_OFFSET_M = 0.6;
/** Distanța de la bordură la centrul caroseriei taxiului parcat. */
export const COMPOSITION_TAXI_CURB_OFFSET_M = 1.75;

type Side = 'S' | 'N' | 'W' | 'E';

const OUTWARD_BY_SIDE: Readonly<Record<Side, Readonly<{ x: number; z: number }>>> = Object.freeze({
  S: Object.freeze({ x: 0, z: -1 }),
  N: Object.freeze({ x: 0, z: 1 }),
  W: Object.freeze({ x: -1, z: 0 }),
  E: Object.freeze({ x: 1, z: 0 }),
});

export interface CompositionWorld {
  readonly version: typeof V3_COMPOSITION_WORLD_VERSION;
  readonly mapId: string;
  readonly layout: CityLayout;
  /** Harta 032 din care sunt derivate layout-ul și graful; folosită de traficul AI 058. */
  readonly map: RoadMap;
  /** Graful 033 cu aceleași benzi ca layout-ul, pentru rutele AI. */
  readonly graph: LaneGraph;
  readonly walkWorld: WalkWorld;
  readonly spawn: Readonly<{ x: number; z: number; yawRad: number }>;
  readonly vehicles: readonly CompositionVehicleSeed[];
  readonly stripId: string;
  readonly side: Side;
  readonly speedLimitMps: number;
  readonly curbHeightM: number;
}

/** Limita de viteză cea mai restrictivă autorată în hartă; o folosim pentru mașina de probă. */
export function compositionSpeedLimitMps(layout: CityLayout): number {
  return Math.min(...layout.lanes.map((lane) => lane.speedLimitMps));
}

export function createCompositionWorld(): CompositionWorld {
  const map = createNeighbourhoodMap();
  const layout = createCityLayout(map);
  const graph = createLaneGraph(map);
  const walkWorld = createCityWalkWorld(layout);
  const speedLimitMps = compositionSpeedLimitMps(layout);
  for (const strip of layout.elements) {
    if (strip.kind !== 'SIDEWALK') continue;
    const side = strip.id.split(':').pop() as Side | undefined;
    if (side !== 'S' && side !== 'N' && side !== 'W' && side !== 'E') continue;
    const outward = OUTWARD_BY_SIDE[side];
    const xs = strip.footprintM.map((vertex) => vertex.x);
    const zs = strip.footprintM.map((vertex) => vertex.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const edge = {
      x: side === 'W' ? minX : side === 'E' ? maxX : (minX + maxX) / 2,
      z: side === 'S' ? minZ : side === 'N' ? maxZ : (minZ + maxZ) / 2,
    };
    const alongX = side === 'S' || side === 'N';
    const alongMin = alongX ? minX : minZ;
    const alongMax = alongX ? maxX : maxZ;
    const yawRad = alongX ? Math.PI / 2 : 0;
    for (let along = alongMin + 6; along <= alongMax - 6; along += 4) {
      const spawn = {
        x: alongX ? along : edge.x + outward.x * COMPOSITION_SPAWN_CURB_OFFSET_M,
        z: alongX ? edge.z + outward.z * COMPOSITION_SPAWN_CURB_OFFSET_M : along,
      };
      const bodyHeight = walkWorld.surfaceAt(spawn.x, spawn.z);
      if (Math.abs(bodyHeight) > 1e-9) continue;
      if (walkWorld.blockingAt(spawn.x, spawn.z).length > 0) continue;
      const taxi = {
        x: alongX ? along : edge.x + outward.x * COMPOSITION_TAXI_CURB_OFFSET_M,
        z: alongX ? edge.z + outward.z * COMPOSITION_TAXI_CURB_OFFSET_M : along,
      };
      // Ușa celui mai apropiat flanc: 0,85 m de la centrul caroseriei, spre personaj.
      const door = {
        x: taxi.x - outward.x * 0.85,
        z: taxi.z - outward.z * 0.85,
      };
      const doorDistance = Math.hypot(door.x - spawn.x, door.z - spawn.z);
      if (doorDistance > 0.89) continue;
      // A doua mașină stă la 30 m de-a lungul străzii, în afara razei de intrare și a ușii.
      const civilAlong =
        along + 30 <= alongMax - 6 ? along + 30 : Math.max(alongMin + 6, along - 30);
      const civil = {
        x: alongX ? civilAlong : edge.x + outward.x * COMPOSITION_TAXI_CURB_OFFSET_M,
        z: alongX ? edge.z + outward.z * COMPOSITION_TAXI_CURB_OFFSET_M : civilAlong,
      };
      return Object.freeze({
        version: V3_COMPOSITION_WORLD_VERSION,
        mapId: layout.mapId,
        layout,
        map,
        graph,
        walkWorld,
        spawn: Object.freeze({ x: spawn.x, z: spawn.z, yawRad }),
        vehicles: Object.freeze([
          Object.freeze({
            vehicleId: 'taxi-01',
            driverKind: 'TAXI' as const,
            classId: 'sedan' as const,
            positionM: Object.freeze({ x: taxi.x, z: taxi.z }),
            yawRad,
            speedLimitMps,
            controlMode: 'AUTO' as const,
          }),
          Object.freeze({
            vehicleId: 'civil-01',
            driverKind: 'CIVILIAN' as const,
            classId: 'compact' as const,
            positionM: Object.freeze({ x: civil.x, z: civil.z }),
            // A doua mașină stă la 30 m de-a lungul străzii; nu blochează ușa taxiului.
            yawRad,
            speedLimitMps,
            controlMode: 'AUTO' as const,
          }),
        ]),
        stripId: strip.id,
        side,
        speedLimitMps,
        curbHeightM: CITY_LAYOUT_DEFAULTS.sidewalkElevationM,
      });
    }
  }
  throw new Error('Nu există nicio bordură autorată cu un punct de start valid pentru compunere.');
}
