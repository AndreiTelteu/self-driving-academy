import {
  createLaneGraph,
  createNeighbourhoodMap,
  createPedestrians,
  type LaneGraph,
  type PedestrianLink,
  type PedestrianOptions,
  type Pedestrians,
} from '../../src/world';

/** The authored neighbourhood is the fixture: 80 crosswalks, 96 directed lanes, 25 junctions. */
export function pedestrianMap() {
  return createNeighbourhoodMap();
}

export function pedestrianSession(epoch = 7) {
  return { sessionId: 'pedestrians-164-tests', worldEpoch: epoch } as const;
}

export function createPedestrianWorld(options: Partial<PedestrianOptions> = {}): Pedestrians {
  return createPedestrians(pedestrianMap(), pedestrianSession(), { seed: 4711, ...options });
}

export interface LanePose {
  readonly positionM: { readonly x: number; readonly y: number; readonly z: number };
  readonly headingRad: number;
  readonly laneLengthM: number;
}

/** Samples the directed lane path at a longitudinal distance; no invented geometry. */
export function lanePose(graph: LaneGraph, laneId: string, longitudinalM: number): LanePose {
  const path = graph.getDirectedPath(laneId);
  if (!path || path.points.length < 2) throw new Error(`Unknown lane path ${laneId}`);
  let remaining = Math.max(0, Math.min(path.lengthM, longitudinalM));
  for (let index = 1; index < path.points.length; index += 1) {
    const from = path.points[index - 1]!,
      to = path.points[index]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (remaining <= length || index === path.points.length - 1) {
      const fraction = length === 0 ? 0 : Math.min(1, remaining / length);
      return Object.freeze({
        positionM: Object.freeze({
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
          z: from.z + (to.z - from.z) * fraction,
        }),
        headingRad: Math.atan2(to.z - from.z, to.x - from.x),
        laneLengthM: path.lengthM,
      });
    }
    remaining -= length;
  }
  throw new Error('Unreachable lane sampling');
}

export interface PedestrianTarget {
  readonly crosswalkId: string;
  readonly laneId: string;
  readonly longitudinalM: number;
  readonly laneLengthM: number;
  readonly crossingLengthM: number;
  readonly headingRad: number;
  readonly graph: LaneGraph;
}

/**
 * Deterministic target: the first crosswalk whose arrival lane offers at least 100 m of run-up,
 * using the lane where the authored crossing line is furthest along the directed path.
 */
export function pedestrianTarget(links: readonly PedestrianLink[]): PedestrianTarget {
  const graph = createLaneGraph(pedestrianMap());
  for (const link of links) {
    const lane = link.laneLines.reduce((best, candidate) =>
      candidate.longitudinalM > best.longitudinalM ? candidate : best,
    );
    if (lane.longitudinalM < 100) continue;
    const path = graph.getDirectedPath(lane.laneId);
    if (!path) continue;
    return Object.freeze({
      crosswalkId: link.crosswalkId,
      laneId: lane.laneId,
      longitudinalM: lane.longitudinalM,
      laneLengthM: path.lengthM,
      crossingLengthM: link.crossingLengthM,
      headingRad: link.headingRad,
      graph,
    });
  }
  throw new Error('The fixture has no crosswalk with a long arrival lane');
}

/** Vehicle fact placed `distanceM` before the authored crossing line of the target lane. */
export function vehicleBefore(
  target: PedestrianTarget,
  distanceM: number,
  speedMps: number,
  identity = { vehicleId: 'vehicle-1', incarnation: 'inc-1' },
) {
  const pose = lanePose(target.graph, target.laneId, target.longitudinalM - distanceM);
  return Object.freeze({
    vehicleId: identity.vehicleId,
    incarnation: identity.incarnation,
    laneId: target.laneId,
    positionM: pose.positionM,
    speedMps,
    observable: true,
  });
}
