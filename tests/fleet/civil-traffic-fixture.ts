import {
  DEFAULT_FLEET_COUNTS,
  FLEET_LIMITS,
  createCivilTraffic,
  createFleetRegistry,
} from '../../src/fleet';
import type { CivilTraffic, CivilTrafficOptions } from '../../src/fleet';
import { getParameterDefinition, parsePublishableDrivingProfile } from '../../src/profiles';
import type { DrivingProfile } from '../../src/profiles';
import { createLaneGraph, createNeighbourhoodMap, createRoutePlanner } from '../../src/world';
import type { LaneGraph, RoadMap } from '../../src/world';

/** All style keys consumed by 044–055 and 058, filled from the real 092 registry defaults. */
export const CIVIL_STYLE_KEYS = Object.freeze([
  'speed_delta_urban',
  'speed_delta_residential',
  'curve_lateral_accel',
  'intersection_approach_speed',
  'desired_acceleration',
  'comfort_deceleration',
  'acceleration_jerk',
  'brake_reaction_delay',
  'following_time_headway',
  'following_min_gap',
  'queue_standstill_gap',
  'following_speed_gain',
  'red_stop_probability',
  'green_start_delay',
  'red_stop_line_offset',
  'late_red_brake_threshold',
  'stop_full_probability',
  'stop_dwell_time',
  'stop_line_offset',
  'lane_change_front_gap',
  'lane_change_back_gap',
  'lane_change_speed_gain',
  'lane_change_cooldown',
  'yield_time_gap',
] as const);
export type CivilStyleKey = (typeof CIVIL_STYLE_KEYS)[number];

export function civilStyle(
  overrides: Readonly<Partial<Record<CivilStyleKey, number>>> = {},
  versionId = 'city-style-v1',
  profileId = 'city-profile',
): DrivingProfile {
  const parameters: Record<string, number> = {},
    unitsByParameter: Record<string, string> = {},
    provenanceByParameter: Record<string, string> = {},
    evidenceByParameter: Record<string, null> = {};
  for (const key of CIVIL_STYLE_KEYS) {
    parameters[key] = overrides[key] ?? getParameterDefinition(key).default;
    unitsByParameter[key] = getParameterDefinition(key).unit;
    provenanceByParameter[key] = 'BASE';
    evidenceByParameter[key] = null;
  }
  return parsePublishableDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId,
    versionId,
    parentVersionId: null,
    engineVersion: '058-civil-traffic-fixture-v1',
    parameters,
    unitsByParameter,
    provenanceByParameter,
    evidenceByParameter,
    sourceSegmentIds: [],
    createdAt: '2026-10-20T00:00:00.000Z',
    checksum: 'fixture',
  });
}

export function civilRegistryConfiguration(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId: 'session-058',
    worldEpoch: 0,
    scenarioId: 'city-fixture',
    seed: 58058,
    namespace: 'city:fixture:fleet',
    taxiCount: DEFAULT_FLEET_COUNTS.taxis,
    civilianCount: DEFAULT_FLEET_COUNTS.civilians,
    profile: { profileId: 'city-profile', versionId: 'city-style-v1' },
    ...overrides,
  };
}

export function civilRegistry(overrides: Record<string, unknown> = {}) {
  return createFleetRegistry(civilRegistryConfiguration(overrides));
}

export interface CivilWorld {
  readonly registry: ReturnType<typeof createFleetRegistry>;
  readonly map: RoadMap;
  readonly graph: LaneGraph;
  readonly planner: ReturnType<typeof createRoutePlanner>;
  readonly traffic: CivilTraffic;
}

export function createCivilWorld(
  options: {
    readonly registry?: ReturnType<typeof createFleetRegistry>;
    readonly style?: DrivingProfile;
    readonly styleSource?: { activeStyle(): DrivingProfile };
    readonly traffic?: Partial<CivilTrafficOptions>;
    readonly createTraffic?: boolean;
  } = {},
): CivilWorld {
  const registry = options.registry ?? civilRegistry(),
    map = createNeighbourhoodMap(),
    graph = createLaneGraph(map),
    planner = createRoutePlanner({
      graph,
      map,
      graphVersion: '033-lane-graph-v1',
      costVersion: 'route-cost-v1',
    }),
    traffic =
      options.createTraffic === false
        ? (null as unknown as CivilTraffic)
        : createCivilTraffic({
            registry,
            map,
            graph,
            planner,
            ...(options.styleSource === undefined
              ? { style: options.style ?? civilStyle() }
              : { styleSource: options.styleSource }),
            ...options.traffic,
          });
  return { registry, map, graph, planner, traffic };
}

/** Exact lane-centre sample used by probes for external taxi observations. */
export function laneSample(
  graph: LaneGraph,
  laneId: string,
  longitudinalM: number,
): { positionM: { x: number; y: number; z: number }; headingRad: number } {
  const path = graph.getDirectedPath(laneId);
  if (path === null) throw new Error(`Unknown lane ${laneId}`);
  let remaining = Math.min(Math.max(longitudinalM, 0), path.lengthM);
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const from = path.points[index]!,
      to = path.points[index + 1]!,
      length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length <= 0) continue;
    if (remaining <= length || index === path.points.length - 2) {
      const fraction = Math.min(1, Math.max(0, remaining / length));
      return {
        positionM: {
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
          z: from.z + (to.z - from.z) * fraction,
        },
        headingRad: Math.atan2(to.z - from.z, to.x - from.x),
      };
    }
    remaining -= length;
  }
  const point = path.points[path.points.length - 1]!;
  return { positionM: point, headingRad: 0 };
}

export function distanceM(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export const CIVIL_LIMIT = FLEET_LIMITS.civiliansMaximum;
