import {
  createHazards,
  createLaneGraph,
  createNeighbourhoodMap,
  type HazardObstacleInput,
  type HazardVehicleFact,
  type Hazards,
} from '../../src/world';
import { lanePose } from './pedestrians-fixture';

export { lanePose } from './pedestrians-fixture';

let cachedMap: ReturnType<typeof createNeighbourhoodMap> | null = null;

/** The authored neighbourhood is the fixture; the lane below is real, straight and 172.4 m long. */
export function hazardMap() {
  return (cachedMap ??= createNeighbourhoodMap());
}

export function hazardSession(epoch = 11) {
  return { sessionId: 'hazards-165-tests', worldEpoch: epoch } as const;
}

export const HAZARD_LANE_ID = 'lane:00E0';
export const HAZARD_OBSTACLE_M = 100;

let cachedLane: {
  readonly graph: ReturnType<typeof createLaneGraph>;
  readonly laneId: string;
  readonly lengthM: number;
  readonly headingRad: number;
  readonly obstaclePositionM: { readonly x: number; readonly y: number; readonly z: number };
} | null = null;

export function hazardLane() {
  if (cachedLane) return cachedLane;
  const graph = createLaneGraph(hazardMap()),
    path = graph.getDirectedPath(HAZARD_LANE_ID);
  if (!path) throw new Error('The fixture lane is missing');
  const pose = lanePose(graph, HAZARD_LANE_ID, HAZARD_OBSTACLE_M);
  cachedLane = Object.freeze({
    graph,
    laneId: HAZARD_LANE_ID,
    lengthM: path.lengthM,
    headingRad: pose.headingRad,
    obstaclePositionM: pose.positionM,
  });
  return cachedLane;
}

/** Obstacle data derived from a real lane pose: no position is hardcoded in the scene. */
export function hazardObstacle(
  options: Partial<HazardObstacleInput> & {
    readonly id?: string;
    readonly distanceM?: number;
    readonly lateralM?: number;
  } = {},
): HazardObstacleInput {
  const lane = hazardLane(),
    distanceM = options.distanceM ?? HAZARD_OBSTACLE_M,
    lateralM = options.lateralM ?? 0,
    pose = lanePose(lane.graph, lane.laneId, distanceM),
    halfSizeM = options.halfSizeM ?? Object.freeze({ x: 2, y: 0.6, z: 0.5 });
  return Object.freeze({
    id: options.id ?? 'obstacle-1',
    type: options.type ?? 'BARRIER',
    positionM: Object.freeze({
      x: pose.positionM.x + Math.sin(pose.headingRad) * lateralM,
      y: halfSizeM.y,
      z: pose.positionM.z - Math.cos(pose.headingRad) * lateralM,
    }),
    halfSizeM,
    ...(options.edgePolicy === undefined ? {} : { edgePolicy: options.edgePolicy }),
    ...(options.activeFromTick === undefined ? {} : { activeFromTick: options.activeFromTick }),
    ...(options.activeJitterTicks === undefined
      ? {}
      : { activeJitterTicks: options.activeJitterTicks }),
  });
}

export function createHazardWorld(
  obstacles: readonly unknown[] = [hazardObstacle()],
  options: { readonly seed?: number } = {},
): Hazards {
  return createHazards(hazardMap(), hazardSession(), {
    seed: options.seed ?? 165,
    obstacles,
  });
}

/** Vehicle fact placed `distanceM` before the obstacle line, facing along the lane. */
export function vehicleBeforeObstacle(
  distanceM: number,
  speedMps: number,
  overrides: Partial<HazardVehicleFact> = {},
): HazardVehicleFact {
  const lane = hazardLane(),
    pose = lanePose(lane.graph, lane.laneId, HAZARD_OBSTACLE_M - distanceM);
  return Object.freeze({
    vehicleId: 'vehicle-1',
    incarnation: 'inc-1',
    controlMode: 'AUTO',
    positionM: Object.freeze({ x: pose.positionM.x, y: 0.8, z: pose.positionM.z }),
    headingRad: pose.headingRad,
    speedMps,
    brake: 0,
    steering: 0,
    ...overrides,
  });
}

/** A real pedestrian fact at the curb in front of the vehicle; 164 owns the population. */
export function pedestrianInPath(distanceM: number, state: 'WAITING' | 'CROSSING' = 'CROSSING') {
  const lane = hazardLane(),
    pose = lanePose(lane.graph, lane.laneId, HAZARD_OBSTACLE_M - distanceM);
  return Object.freeze({
    pedestrianId: 'pedestrian-fixture-1',
    state,
    positionM: Object.freeze({ x: pose.positionM.x, y: 0, z: pose.positionM.z }),
  });
}
