/**
 * PBI 257 — driverul AUTO al mașinii jucătorului.
 *
 * Nu este un al doilea planner și nu este Rapier: primește rute READY de la planner-ul 041 peste
 * graful 033 și avansează poziția pe path-ul direcționat folosind mecanica 023 (masă, forță
 * tractivă, frână). Compunerea aplică apoi aceleași limite de coliziune ca pentru conducerea
 * manuală. Modulul este pur: fără DOM, Babylon, ceas sau `Math.random`.
 */
import { deriveVehicleSeed, randomUint32, requireContract, type RandomSeed } from '../sessions';
import { vehicleClass, type VehicleClassId } from '../vehicles';
import {
  parseRoadMap,
  type DirectedLanePath,
  type LaneGraph,
  type RoadMap,
  type RoutePlanner,
} from '../world';

export const VEHICLE_AUTO_DRIVE_VERSION = '257-vehicle-auto-drive-v1' as const;

export const VEHICLE_AUTO_DRIVE_POLICY = Object.freeze({
  contract: VEHICLE_AUTO_DRIVE_VERSION,
  /** Autopilotul țintește 80% din limita benzii, ca stilul implicit să fie prudent. */
  speedFactor: 0.8,
  /** Cea mai mică viteză de croazieră, ca o bandă cu limită foarte mică să nu blocheze. */
  minimumSpeedMps: 2,
  /** Accelerația de confort; frâna folosește mecanica clasei. */
  accelerationMps2: 1.5,
  brakeShare: 0.35,
  /** Distanța rămasă la care se caută următoarea bandă. */
  routeEndMarginM: 1,
  /** Încercări deterministe de destinație în planner. */
  routeAttempts: 64,
  /** Limita publică a planner-ului 041. */
  routeLanes: 256,
});

export interface AutoDriveStart {
  readonly x: number;
  readonly z: number;
  /** Yaw-ul compunerii: 0 = +Z, π/2 = +X. */
  readonly yawRad: number;
}

export interface AutoDrivePose {
  readonly positionM: Readonly<{ x: number; y: number; z: number }>;
  readonly yawRad: number;
  readonly speedMps: number;
  readonly laneId: string;
  readonly routeLaneIds: readonly string[];
  readonly distanceAlongRouteM: number;
  readonly remainingRouteM: number;
  readonly blocked: boolean;
}

export interface AutoDriveReport {
  readonly version: typeof VEHICLE_AUTO_DRIVE_VERSION;
  readonly vehicleId: string;
  readonly routeCount: number;
  readonly laneId: string;
  readonly speedMps: number;
  readonly distanceAlongRouteM: number;
  readonly remainingRouteM: number;
  readonly blocked: boolean;
  readonly disposed: boolean;
}

export interface VehicleAutoDrive {
  readonly version: typeof VEHICLE_AUTO_DRIVE_VERSION;
  readonly vehicleId: string;
  readonly pose: AutoDrivePose;
  /** Advances one fixed tick and returns the new pose. */
  step(dtSeconds: number, actualSpeedMps?: number): AutoDrivePose;
  /** Called by the composition when a static/dynamic body blocks the candidate pose. */
  stop(): void;
  report(): AutoDriveReport;
  dispose(): void;
}

export interface VehicleAutoDriveOptions {
  readonly graph: LaneGraph;
  readonly planner: RoutePlanner;
  readonly map: RoadMap;
  readonly vehicleId: string;
  readonly classId: VehicleClassId;
  readonly start: AutoDriveStart;
  /** PBI 271: AUTO resume starts from the exact physical speed left by the player. */
  readonly initialSpeedMps?: number;
  /** Seed for deterministic destination/route choices. */
  readonly seed?: RandomSeed;
}

interface RouteLane {
  readonly laneId: string;
  readonly path: DirectedLanePath;
  readonly startM: number;
  readonly endM: number;
  readonly speedLimitMps: number;
}

interface AutoRoute {
  readonly path: readonly string[];
  readonly lanes: readonly RouteLane[];
  readonly totalLengthM: number;
}

function compositionYawFromHeading(headingRad: number): number {
  const value = Math.PI / 2 - headingRad;
  return ((((value + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

function headingFromCompositionYaw(yawRad: number): number {
  const value = Math.PI / 2 - yawRad;
  return ((((value + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}

function samplePath(
  path: DirectedLanePath,
  distanceM: number,
): Readonly<{ x: number; y: number; z: number; headingRad: number }> {
  const points = path.points;
  if (points.length === 1) {
    const point = points[0]!;
    return Object.freeze({ x: point.x, y: point.y, z: point.z, headingRad: 0 });
  }
  let remaining = Math.min(Math.max(distanceM, 0), path.lengthM);
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!,
      to = points[index + 1]!;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length <= 1e-9) continue;
    if (remaining <= length || index === points.length - 2) {
      const fraction = Math.min(1, Math.max(0, remaining / length));
      return Object.freeze({
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
        z: from.z + (to.z - from.z) * fraction,
        headingRad: Math.atan2(to.z - from.z, to.x - from.x),
      });
    }
    remaining -= length;
  }
  const last = points[points.length - 1]!;
  return Object.freeze({ x: last.x, y: last.y, z: last.z, headingRad: 0 });
}

function routeLaneFor(
  graph: LaneGraph,
  laneId: string,
): Readonly<{ path: DirectedLanePath; speedLimitMps: number }> | null {
  const lane = graph.getLane(laneId, 'TAXI'),
    path = graph.getDirectedPath(laneId);
  return lane === null || path === null
    ? null
    : Object.freeze({ path, speedLimitMps: lane.speedLimitMps });
}

function routeFromPlan(graph: LaneGraph, path: readonly string[]): AutoRoute | null {
  const lanes: RouteLane[] = [];
  let cursor = 0;
  for (const laneId of path) {
    const lane = routeLaneFor(graph, laneId);
    if (lane === null) return null;
    lanes.push(
      Object.freeze({
        laneId,
        path: lane.path,
        startM: cursor,
        endM: cursor + lane.path.lengthM,
        speedLimitMps: lane.speedLimitMps,
      }),
    );
    cursor += lane.path.lengthM;
  }
  if (lanes.length === 0 || cursor <= 0) return null;
  return Object.freeze({
    path: Object.freeze([...path]),
    lanes: Object.freeze(lanes),
    totalLengthM: cursor,
  });
}

function laneAt(route: AutoRoute, distanceM: number): RouteLane {
  const clamped = Math.min(Math.max(distanceM, 0), route.totalLengthM);
  let index = route.lanes.length - 1;
  for (let candidate = 0; candidate < route.lanes.length; candidate += 1) {
    const lane = route.lanes[candidate]!;
    if (clamped < lane.endM || candidate === route.lanes.length - 1) {
      index = candidate;
      break;
    }
  }
  return route.lanes[index]!;
}

export function createVehicleAutoDrive(options: VehicleAutoDriveOptions): VehicleAutoDrive {
  requireContract(options !== null && typeof options === 'object', 'Auto-drive options required');
  requireContract(options.graph !== undefined, 'Auto-drive requires the lane graph');
  requireContract(options.planner !== undefined, 'Auto-drive requires the route planner');
  const map: RoadMap = parseRoadMap(options.map);
  const seed = deriveVehicleSeed(options.seed ?? 257, options.vehicleId);
  const mechanics = vehicleClass(options.classId);
  const lanes = map.lanes
    .filter((lane) => lane.access.includes('TAXI'))
    .map((lane) => lane.id)
    .sort();
  requireContract(lanes.length > 0, 'Auto-drive requires TAXI lanes');
  const startHeading = headingFromCompositionYaw(options.start.yawRad);
  let origin: string | null = null,
    originDistanceM = 0;
  let bestLateral = Infinity;
  for (const laneId of lanes) {
    const projection = options.graph.projectOnLane(laneId, {
      positionM: { x: options.start.x, y: 0, z: options.start.z },
      access: 'TAXI',
      headingRad: startHeading,
      maxHeadingErrorRad: Math.PI / 2,
    });
    if (projection === null || projection.distanceM >= bestLateral) continue;
    origin = laneId;
    originDistanceM = projection.longitudinalM;
    bestLateral = projection.distanceM;
  }
  if (origin === null) {
    // Parked across the lane or off the carriageway: retry without heading, still using a real lane.
    originDistanceM = 0;
    bestLateral = Infinity;
    for (const laneId of lanes) {
      const projection = options.graph.projectOnLane(laneId, {
        positionM: { x: options.start.x, y: 0, z: options.start.z },
        access: 'TAXI',
      });
      if (projection === null || projection.distanceM >= bestLateral) continue;
      origin = laneId;
      originDistanceM = projection.longitudinalM;
      bestLateral = projection.distanceM;
    }
  }
  requireContract(origin !== null, 'Auto-drive start is not on a TAXI lane');

  let route: AutoRoute | null = null,
    distanceM = 0,
    speedMps = Math.max(0, options.initialSpeedMps ?? 0),
    routeCount = 0,
    blocked = false,
    disposed = false;

  const destinationFor = (cycle: number): string => {
    const index = randomUint32(seed, 'auto-destination', cycle) % lanes.length;
    return lanes[index]!;
  };

  const buildRoute = (originLaneId: string, cycle: number): AutoRoute | null => {
    for (let attempt = 0; attempt < VEHICLE_AUTO_DRIVE_POLICY.routeAttempts; attempt += 1) {
      const destination = destinationFor(cycle * VEHICLE_AUTO_DRIVE_POLICY.routeAttempts + attempt);
      if (destination === originLaneId) continue;
      const plan = options.planner.findRoute({
        origin: originLaneId,
        destination,
        access: 'TAXI',
      });
      if (
        plan.status === 'READY' &&
        plan.path !== null &&
        plan.path.length > 0 &&
        plan.path.length <= VEHICLE_AUTO_DRIVE_POLICY.routeLanes
      )
        return routeFromPlan(options.graph, plan.path);
    }
    const own = routeLaneFor(options.graph, originLaneId);
    if (own === null) return null;
    return Object.freeze({
      path: Object.freeze([originLaneId]),
      lanes: Object.freeze([
        Object.freeze({
          laneId: originLaneId,
          path: own.path,
          startM: 0,
          endM: own.path.lengthM,
          speedLimitMps: own.speedLimitMps,
        }),
      ]),
      totalLengthM: own.path.lengthM,
    });
  };

  const initialRoute = buildRoute(origin, 0);
  requireContract(initialRoute !== null, 'Auto-drive could not build an initial route');
  route = initialRoute;
  distanceM = Math.min(originDistanceM, Math.max(0, initialRoute.totalLengthM - 1));
  routeCount = 1;

  const poseAt = (distance: number): AutoDrivePose => {
    const current = route!;
    const lane = laneAt(current, distance);
    const local = Math.min(Math.max(distance - lane.startM, 0), lane.path.lengthM);
    const sample = samplePath(lane.path, local);
    return Object.freeze({
      positionM: Object.freeze({ x: sample.x, y: sample.y, z: sample.z }),
      yawRad: compositionYawFromHeading(sample.headingRad),
      speedMps,
      laneId: lane.laneId,
      routeLaneIds: current.path,
      distanceAlongRouteM: distance,
      remainingRouteM: Math.max(0, current.totalLengthM - distance),
      blocked,
    });
  };

  const advanceRoute = (): boolean => {
    while (
      route !== null &&
      distanceM >= route.totalLengthM - VEHICLE_AUTO_DRIVE_POLICY.routeEndMarginM
    ) {
      const last = route.path[route.path.length - 1]!;
      const successors = options.graph
        .getConnections(last, 'TAXI')
        .map((connection) => connection.toLaneId)
        .sort();
      if (successors.length === 0) {
        blocked = true;
        speedMps = 0;
        return false;
      }
      const next =
        successors[randomUint32(seed, 'auto-successor', routeCount) % successors.length]!;
      const nextRoute = buildRoute(next, routeCount + 1);
      if (nextRoute === null) {
        blocked = true;
        speedMps = 0;
        return false;
      }
      route = nextRoute;
      distanceM = 0;
      routeCount += 1;
    }
    return true;
  };

  return Object.freeze({
    version: VEHICLE_AUTO_DRIVE_VERSION,
    vehicleId: options.vehicleId,
    get pose(): AutoDrivePose {
      return poseAt(distanceM);
    },
    step(dtSeconds: number, actualSpeedMps?: number): AutoDrivePose {
      requireContract(!disposed, 'Auto-drive disposed');
      requireContract(
        Number.isFinite(dtSeconds) && dtSeconds > 0 && dtSeconds <= 1 / 60 + 1e-12,
        'Auto-drive step exceeds one 60 Hz tick',
      );
      if (actualSpeedMps !== undefined)
        requireContract(
          Number.isFinite(actualSpeedMps) && actualSpeedMps >= 0,
          'Auto-drive actual speed must be finite and non-negative',
        );
      if (blocked || route === null) return poseAt(distanceM);
      if (!advanceRoute()) return poseAt(distanceM);
      const lane = laneAt(route, distanceM);
      const targetMps = Math.max(
        VEHICLE_AUTO_DRIVE_POLICY.minimumSpeedMps,
        lane.speedLimitMps * VEHICLE_AUTO_DRIVE_POLICY.speedFactor,
      );
      if (speedMps < targetMps) {
        speedMps = Math.min(
          targetMps,
          speedMps + VEHICLE_AUTO_DRIVE_POLICY.accelerationMps2 * dtSeconds,
        );
      } else {
        speedMps = Math.max(
          targetMps,
          speedMps - mechanics.brakeAcceleration * VEHICLE_AUTO_DRIVE_POLICY.brakeShare * dtSeconds,
        );
      }
      // PBI 282: a live Rapier car supplies its own measured speed, so the route cursor follows
      // the physical car instead of a second kinematic integration. The pure fixture keeps the
      // original internal distance advance.
      const advanceMps = actualSpeedMps ?? speedMps;
      distanceM = Math.min(route.totalLengthM, distanceM + advanceMps * dtSeconds);
      return poseAt(distanceM);
    },
    stop(): void {
      speedMps = 0;
      blocked = true;
    },
    report(): AutoDriveReport {
      const lane = route === null ? null : laneAt(route, distanceM);
      return Object.freeze({
        version: VEHICLE_AUTO_DRIVE_VERSION,
        vehicleId: options.vehicleId,
        routeCount,
        laneId: lane?.laneId ?? '',
        speedMps,
        distanceAlongRouteM: distanceM,
        remainingRouteM: route === null ? 0 : Math.max(0, route.totalLengthM - distanceM),
        blocked,
        disposed,
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      route = null;
      speedMps = 0;
    },
  });
}
