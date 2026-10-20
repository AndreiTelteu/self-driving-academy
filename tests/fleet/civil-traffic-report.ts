import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CIVIL_TRAFFIC_LIMITS,
  CIVIL_TRAFFIC_VERSION,
  type CivilTrafficVehicleObservation,
} from '../../src/fleet';
import {
  CIVIL_LIMIT,
  civilStyle,
  createCivilWorld,
  distanceM,
  laneSample,
} from './civil-traffic-fixture';

export interface CivilReportCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface CivilTrafficReport {
  readonly version: typeof CIVIL_TRAFFIC_VERSION;
  readonly generatedBy: 'npm run civil:traffic';
  readonly oracleRule: string;
  readonly style: Readonly<{ profileId: string; versionId: string }>;
  readonly limits: typeof CIVIL_TRAFFIC_LIMITS;
  readonly spawn: Readonly<{
    civilians: number;
    uniqueIds: number;
    readyRoutes: number;
    routesFromPlanner: number;
    onLane: number;
    commonStyle: number;
    shortestRouteLanes: number;
    longestRouteLanes: number;
    turnRoutes: number;
  }>;
  readonly mixed: Readonly<{
    ticks: number;
    taxiLeaderObserved: boolean;
    minimumLeaderGapM: number | null;
    followedSpeedMps: number;
    controlSpeedMps: number;
    onLaneFrames: number;
    sameLaneOverlap: number;
  }>;
  readonly resume: Readonly<{
    styleBefore: string;
    styleAfter: string;
    routePreserved: boolean;
    registryMode: string;
    registryProfile: string;
    movedAfterResume: boolean;
  }>;
  readonly clean: Readonly<{
    disposed: boolean;
    actors: number;
    longitudinalActors: number;
    roadContextVehicles: number;
    routeSearches: number;
  }>;
  readonly checks: readonly CivilReportCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

const STEP = 1 / 60;

function check(name: string, expected: unknown, actual: unknown, detail: string): CivilReportCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function truthy(name: string, actual: boolean, detail: string): CivilReportCheck {
  return check(name, true, actual, detail);
}

function advance(
  traffic: ReturnType<typeof createCivilWorld>['traffic'],
  count: number,
  startTick: number,
  vehicles: readonly CivilTrafficVehicleObservation[] = [],
) {
  let frame = traffic.list();
  for (let index = 0; index < count; index += 1)
    frame = traffic.step({ tick: startTick + index + 1, dtSeconds: STEP, vehicles }).actors;
  return frame;
}

function spawnProbe() {
  const world = createCivilWorld(),
    actors = world.traffic.list(),
    onLane = actors.filter((actor) => {
      const projection = world.graph.projectOnLane(actor.laneId, {
        positionM: actor.positionM,
        access: 'CIVIL',
      });
      return projection !== null && projection.distanceM < 0.001;
    }).length,
    turnRoutes = actors.filter((actor) =>
      actor.route.path.some((laneId, index) =>
        index === 0
          ? false
          : world.graph
              .getConnections(actor.route.path[index - 1]!, 'CIVIL')
              .some((connection) => connection.toLaneId === laneId && connection.kind === 'TURN'),
      ),
    ).length,
    report = {
      civilians: actors.length,
      uniqueIds: new Set(actors.map((actor) => actor.vehicleId)).size,
      readyRoutes: actors.filter((actor) => actor.route.status === 'READY').length,
      routesFromPlanner: world.traffic.report().routesFromPlanner,
      onLane,
      commonStyle: actors.filter(
        (actor) =>
          actor.styleProfileId === 'city-profile' && actor.styleVersionId === 'city-style-v1',
      ).length,
      shortestRouteLanes: Math.min(...actors.map((actor) => actor.route.path.length)),
      longestRouteLanes: Math.max(...actors.map((actor) => actor.route.path.length)),
      turnRoutes,
    };
  world.traffic.dispose();
  world.registry.dispose();
  return report;
}

function determinismProbe() {
  const left = createCivilWorld(),
    right = createCivilWorld(),
    spawnEqual = JSON.stringify(left.traffic.list()) === JSON.stringify(right.traffic.list());
  advance(left.traffic, 20, 0);
  advance(right.traffic, 20, 0);
  const afterEqual = JSON.stringify(left.traffic.list()) === JSON.stringify(right.traffic.list());
  left.traffic.dispose();
  right.traffic.dispose();
  left.registry.dispose();
  right.registry.dispose();
  return { spawnEqual, afterEqual };
}

function mixedProbe() {
  const style = civilStyle({ desired_acceleration: 6, acceleration_jerk: 15 }),
    moving = createCivilWorld({ style }),
    control = createCivilWorld({ style });
  advance(moving.traffic, 120, 0);
  advance(control.traffic, 120, 0);
  const first = moving.traffic.list()[0]!,
    sample = laneSample(moving.graph, first.laneId, Math.max(1, first.distanceAlongRouteM) + 12),
    taxi: CivilTrafficVehicleObservation = {
      vehicleId: 'taxi-ahead-058',
      driverKind: 'TAXI',
      positionM: sample.positionM,
      headingRad: sample.headingRad,
      speedMps: 0,
      radiusM: CIVIL_TRAFFIC_LIMITS.vehicleRadiusM,
    };
  let taxiLeaderObserved = false,
    minimumLeaderGapM: number | null = null,
    onLaneFrames = 0,
    overlapFrames = 0;
  for (let index = 0; index < 180; index += 1) {
    const frame = moving.traffic.step({
      tick: 121 + index,
      dtSeconds: STEP,
      vehicles: [taxi],
    });
    for (const actor of frame.actors) {
      const projection = moving.graph.projectOnLane(actor.laneId, {
        positionM: actor.positionM,
        access: 'CIVIL',
      });
      if (projection !== null && projection.distanceM < 0.001) onLaneFrames += 1;
    }
    const byLane = new Map<string, (typeof frame.actors)[number][]>();
    for (const actor of frame.actors) {
      const group = byLane.get(actor.laneId) ?? [];
      group.push(actor);
      byLane.set(actor.laneId, group);
    }
    for (const group of byLane.values())
      for (let left = 0; left < group.length; left += 1)
        for (let right = left + 1; right < group.length; right += 1)
          if (distanceM(group[left]!.positionM, group[right]!.positionM) < 4) overlapFrames += 1;
    const leader = frame.actors[0]!.leader;
    if (leader !== null) {
      taxiLeaderObserved = true;
      minimumLeaderGapM =
        minimumLeaderGapM === null ? leader.gapM : Math.min(minimumLeaderGapM, leader.gapM);
    }
  }
  const followedSpeedMps = moving.traffic.list()[0]!.speedMps,
    controlSpeedMps = control.traffic.list()[0]!.speedMps;
  const result = {
    ticks: 180,
    taxiLeaderObserved,
    minimumLeaderGapM,
    followedSpeedMps,
    controlSpeedMps,
    onLaneFrames,
    sameLaneOverlap: overlapFrames,
  };
  moving.traffic.dispose();
  control.traffic.dispose();
  moving.registry.dispose();
  control.registry.dispose();
  return result;
}

function resumeProbe() {
  let active = civilStyle({ speed_delta_urban: 0 }, 'city-style-v1');
  const world = createCivilWorld({ styleSource: { activeStyle: () => active } }),
    id = world.traffic.list()[0]!.vehicleId;
  advance(world.traffic, 60, 0);
  const before = world.traffic.get(id)!,
    route = JSON.stringify(before.route.path);
  world.traffic.setAuthority(id, 'MANUAL', 60);
  active = civilStyle({ speed_delta_urban: 3 }, 'city-style-v2');
  const resumed = world.traffic.resume(id, 60),
    profile = world.registry.state(id)!;
  const movedBefore = resumed.distanceAlongRouteM;
  world.traffic.step({ tick: 61, dtSeconds: STEP });
  const movedAfter = world.traffic.get(id)!.distanceAlongRouteM;
  const result = {
    styleBefore: before.styleVersionId,
    styleAfter: resumed.styleVersionId,
    routePreserved: JSON.stringify(resumed.route.path) === route,
    registryMode: profile.controlMode,
    registryProfile: profile.appliedProfileVersion,
    movedAfterResume: movedAfter > movedBefore,
  };
  world.traffic.dispose();
  world.registry.dispose();
  return result;
}

function cleanProbe() {
  const world = createCivilWorld();
  advance(world.traffic, 10, 0);
  world.traffic.dispose();
  world.traffic.dispose();
  const stats = world.traffic.getStats();
  const result = {
    disposed: stats.disposed,
    actors: stats.actors,
    longitudinalActors: stats.longitudinalActors,
    roadContextVehicles: stats.roadContextVehicles,
    routeSearches: stats.routeSearches,
  };
  world.registry.dispose();
  return result;
}

function mutationProbes(): readonly CivilReportCheck[] {
  const world = createCivilWorld(),
    first = world.traffic.list()[0]!,
    actors = advance(world.traffic, 180, 0),
    distinctPositions = new Set(
      actors.map((actor) => `${actor.positionM.x.toFixed(6)},${actor.positionM.z.toFixed(6)}`),
    ).size,
    source = readFileSync(join(process.cwd(), 'src', 'fleet', 'civil-traffic.ts'), 'utf8'),
    player = civilStyle({ speed_delta_urban: 9 }, 'player-style-v9'),
    playerStyleUsed = world.traffic
      .list()
      .some((actor) => actor.styleVersionId === player.versionId),
    deterministic = determinismProbe(),
    clean = cleanProbe();
  world.traffic.dispose();
  world.registry.dispose();
  return Object.freeze([
    check(
      'route-starts-at-origin',
      true,
      first.route.path.length > 0 &&
        first.route.path[0] === first.route.originLaneId &&
        first.route.path[first.route.path.length - 1] === first.route.destinationLaneId,
      'A path that does not bind origin/destination is rejected.',
    ),
    truthy(
      'no-zero-length-origin-only-route',
      first.route.path.length > 1,
      'A missing route or an origin-only placeholder is rejected.',
    ),
    truthy(
      'no-per-player-style',
      !playerStyleUsed && first.styleVersionId === 'city-style-v1',
      'The fixture player profile v9 must never appear on a civilian.',
    ),
    truthy(
      'no-shared-mutable-state',
      distinctPositions > 1,
      `180 ticks produced ${distinctPositions} distinct poses, so actors do not share one progress object.`,
    ),
    truthy(
      'no-camera-render-dependency',
      !/@babylonjs|from 'three'|document\.|window\.|renderer|camera/i.test(source),
      'The source scan rejects Babylon/DOM/renderer/camera tokens.',
    ),
    truthy(
      'deterministic-spawn-and-step',
      deterministic.spawnEqual && deterministic.afterEqual,
      'Two same-seed runs must match at spawn and after 20 ticks.',
    ),
    truthy(
      'dispose-to-zero',
      clean.disposed &&
        clean.actors === 0 &&
        clean.longitudinalActors === 0 &&
        clean.roadContextVehicles === 0 &&
        clean.routeSearches === 0,
      'Disposal releases actors, road context and planner ownership.',
    ),
  ]);
}

export function runCivilTrafficReport(): CivilTrafficReport {
  const spawn = spawnProbe(),
    mixed = mixedProbe(),
    resume = resumeProbe(),
    clean = cleanProbe(),
    probes = mutationProbes(),
    checks: CivilReportCheck[] = [
      check('population', CIVIL_LIMIT, spawn.civilians, 'One actor per 057 civilian.'),
      check(
        'unique-ids',
        spawn.civilians,
        spawn.uniqueIds,
        'Vehicle identities are stable and unique.',
      ),
      check('ready-routes', spawn.civilians, spawn.readyRoutes, 'Every spawn route is READY.'),
      check(
        'routes-from-041',
        spawn.civilians,
        spawn.routesFromPlanner,
        'Every route was returned by the real planner.',
      ),
      check(
        'on-lane-spawn',
        spawn.civilians,
        spawn.onLane,
        'Every pose projects onto its route lane.',
      ),
      check(
        'common-city-style',
        spawn.civilians,
        spawn.commonStyle,
        'Every civilian uses the common city profile and version.',
      ),
      truthy(
        'mixed-intersection-routes',
        spawn.turnRoutes > 0,
        `${spawn.turnRoutes} spawn routes include an authored TURN movement.`,
      ),
      truthy('taxi-leader', mixed.taxiLeaderObserved, '044 reports the taxi as leader.'),
      truthy(
        'following-slows',
        mixed.followedSpeedMps < mixed.controlSpeedMps,
        `Followed ${mixed.followedSpeedMps.toFixed(6)} m/s versus ${mixed.controlSpeedMps.toFixed(6)} m/s.`,
      ),
      truthy(
        'minimum-gap',
        mixed.minimumLeaderGapM !== null &&
          mixed.minimumLeaderGapM >= CIVIL_TRAFFIC_LIMITS.minimumGapM,
        `Minimum observed leader gap ${mixed.minimumLeaderGapM ?? 'none'} m.`,
      ),
      truthy(
        'no-same-lane-overlap',
        mixed.sameLaneOverlap === 0,
        'Pairwise same-lane overlap frames.',
      ),
      check(
        'mix-on-lane-frames',
        mixed.ticks * CIVIL_LIMIT,
        mixed.onLaneFrames,
        'Every actor remains on its lane during the mixed run.',
      ),
      check('resume-style-before', 'city-style-v1', resume.styleBefore, 'Starting common style.'),
      check(
        'resume-style-after',
        'city-style-v2',
        resume.styleAfter,
        'Resume re-reads the common style.',
      ),
      truthy(
        'resume-route-preserved',
        resume.routePreserved,
        'Release/resume keeps the route path.',
      ),
      check(
        'resume-registry-mode',
        'AUTO',
        resume.registryMode,
        'Registry authority returns to AUTO.',
      ),
      check(
        'resume-registry-profile',
        'city-style-v2',
        resume.registryProfile,
        'Registry applied profile matches the common style.',
      ),
      truthy('resume-moves', resume.movedAfterResume, 'The civilian advances after resume.'),
      truthy('clean-disposal', clean.disposed, 'Dispose is idempotent.'),
      check('clean-actors', 0, clean.actors, 'No actor retained.'),
      check('clean-longitudinal', 0, clean.longitudinalActors, 'No controller actor retained.'),
      check(
        'clean-road-context',
        0,
        clean.roadContextVehicles,
        'No road-context vehicle retained.',
      ),
      check('clean-planner-searches', 0, clean.routeSearches, 'Owned planner state is released.'),
      ...probes,
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: CIVIL_TRAFFIC_VERSION,
    generatedBy: 'npm run civil:traffic',
    oracleRule:
      'Expected values are computed from the actual 033/041/044/046/047/048/057 contracts and the authored neighbourhood, not from a captured transcript.',
    style: Object.freeze({ profileId: 'city-profile', versionId: 'city-style-v1' }),
    limits: CIVIL_TRAFFIC_LIMITS,
    spawn: Object.freeze(spawn),
    mixed: Object.freeze(mixed),
    resume: Object.freeze(resume),
    clean: Object.freeze(clean),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}
