import { readFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { join } from 'node:path';
import {
  AMBIENT_TRAFFIC_POLICY,
  AMBIENT_TRAFFIC_VERSION,
  createAmbientTraffic,
  createCityStyleProfile,
} from '../../src/app/ambient-traffic';
import { vehicleBodiesOverlap } from '../../src/app/vehicle-collision';
import {
  CIVIL_TRAFFIC_LIMITS,
  CIVIL_TRAFFIC_VERSION,
  FLEET_LIMITS,
  createCivilTraffic,
  createFleetRegistry,
} from '../../src/fleet';
import { VEHICLE_COLLISION_HALF_EXTENTS_M, createCityDecorPlan } from '../../src/rendering';
import { createCompositionWorld } from '../../src/app/composition-world';

export const LIVE_FLEET_REPORT_VERSION = '262-live-fleet-v1' as const;
export const LIVE_FLEET_COST_BUDGET_MS = 8;
const STEP = 1 / 60;

export interface LiveFleetCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LiveFleetCountReport {
  readonly taxis: number;
  readonly civilians: number;
  readonly actors: number;
  readonly uniqueIds: number;
  readonly classes: Readonly<Record<string, number>>;
  readonly readyRoutes: number;
  readonly routesFromPlanner: number;
  readonly routesByKind: Readonly<Record<'TAXI' | 'CIVILIAN', number>>;
  readonly accessMatches: number;
  readonly uniqueOriginLanes: number;
  readonly onLane: number;
}

export interface LiveFleetProfileReport {
  readonly profileId: string;
  readonly initialVersion: string;
  readonly activeVersion: string;
  readonly existingBeforeRefresh: number;
  readonly existingAfterRefresh: number;
  readonly uniqueVersionsAfterRefresh: number;
  readonly commonRegistryTick: number;
  readonly newTaxiVersion: string;
  readonly newCivilianVersion: string;
}

export interface LiveFleetSpawnReport {
  readonly clearanceToPlayerM: number;
  readonly clearanceToStaticVehiclesM: number;
  readonly minimumPairwiseCentreM: number;
  readonly overlappingPairs: number;
  readonly minimumDecorGapM: number;
  readonly uniqueOriginLanes: number;
  readonly deterministic: boolean;
}

export interface LiveFleetOffCameraReport {
  readonly windowM: number;
  readonly ticks: number;
  readonly actors: number;
  readonly outsideWindow: number;
  readonly outsideMoved: number;
  readonly minimumOutsideMoveM: number;
  readonly allMoved: number;
  readonly lastRegistryTick: number;
}

export interface LiveFleetCleanupReport {
  readonly disposed: boolean;
  readonly actors: number;
  readonly longitudinalActors: number;
  readonly roadContextVehicles: number;
  readonly registryVehicles: number;
  readonly reportVehicles: number;
  readonly stepRejected: boolean;
}

export interface LiveFleetReport {
  readonly version: typeof LIVE_FLEET_REPORT_VERSION;
  readonly generatedBy: 'npm run fleet:live';
  readonly contract: Readonly<{
    ambientVersion: typeof AMBIENT_TRAFFIC_VERSION;
    trafficVersion: typeof CIVIL_TRAFFIC_VERSION;
    normal: Readonly<{ taxis: number; civilians: number }>;
    limits: Readonly<{ taxis: [number, number]; civilians: [number, number]; vehicles: number }>;
    driverKinds: readonly ['TAXI', 'CIVILIAN'];
    frameVehicles: number;
    tickHz: number;
    presentationFields: readonly string[];
  }>;
  readonly fixtures: readonly LiveFleetCountReport[];
  readonly profile: LiveFleetProfileReport;
  readonly spawn: LiveFleetSpawnReport;
  readonly offCamera: LiveFleetOffCameraReport;
  readonly cleanup: LiveFleetCleanupReport;
  readonly checks: readonly LiveFleetCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

export interface LiveFleetCostReport {
  readonly version: typeof LIVE_FLEET_REPORT_VERSION;
  readonly generatedBy: 'npm run fleet:live -- --measure';
  readonly measuredAt: string;
  readonly protocol: Readonly<{
    warmupTicks: number;
    measuredTicks: number;
    repetitions: number;
    tickHz: number;
    budgetMs: number;
    budgetSource: 'Docs/25 laptop authoritative tick p95';
    subsystem: '058 traffic step on the real 032/033 neighbourhood map';
  }>;
  readonly environment: Readonly<{
    node: string;
    platform: string;
    arch: string;
    cpu: string | null;
    totalMemoryBytes: number;
    renderer: 'NONE_HEADLESS';
  }>;
  readonly baseline40Civilians: LiveFleetCostSample;
  readonly live70Vehicles: LiveFleetCostSample;
  readonly additionalCostMs: number;
  readonly pass: boolean;
  readonly limits: readonly string[];
}

export interface LiveFleetCostSample {
  readonly actors: number;
  readonly taxis: number;
  readonly civilians: number;
  readonly samples: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

function check(name: string, expected: unknown, actual: unknown, detail: string): LiveFleetCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function truthy(name: string, actual: boolean, detail: string): LiveFleetCheck {
  return check(name, true, actual, detail);
}

function registryConfiguration(
  sessionId: string,
  taxis: number,
  civilians: number,
  profile: ReturnType<typeof createCityStyleProfile>,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'SI',
    sessionId,
    worldEpoch: 1,
    scenarioId: 'v3-composition-city',
    seed: 262,
    namespace: 'v3:city:fleet',
    taxiCount: taxis,
    civilianCount: civilians,
    profile: { profileId: profile.profileId, versionId: profile.versionId },
  };
}

function compositionYaw(headingRad: number): number {
  const angle = Math.PI / 2 - headingRad;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function rectanglePointGap(
  actor: Readonly<{ positionM: Readonly<{ x: number; z: number }>; headingRad: number }>,
  point: Readonly<{ x: number; z: number }>,
): number {
  const yaw = compositionYaw(actor.headingRad),
    rightX = Math.cos(yaw),
    rightZ = -Math.sin(yaw),
    forwardX = Math.sin(yaw),
    forwardZ = Math.cos(yaw),
    dx = point.x - actor.positionM.x,
    dz = point.z - actor.positionM.z,
    localX = dx * rightX + dz * rightZ,
    localZ = dx * forwardX + dz * forwardZ,
    excessX = Math.max(0, Math.abs(localX) - VEHICLE_COLLISION_HALF_EXTENTS_M.x),
    excessZ = Math.max(0, Math.abs(localZ) - VEHICLE_COLLISION_HALF_EXTENTS_M.z);
  return Math.hypot(excessX, excessZ);
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index]!;
}

function countReport(
  traffic: ReturnType<typeof createCivilTraffic>,
  graph: ReturnType<typeof createCompositionWorld>['graph'],
): LiveFleetCountReport {
  const actors = traffic.list(),
    classes: Record<string, number> = {};
  let readyRoutes = 0,
    accessMatches = 0,
    onLane = 0;
  for (const actor of actors) {
    classes[actor.classId] = (classes[actor.classId] ?? 0) + 1;
    if (actor.route.status === 'READY' && actor.route.path.length > 0) readyRoutes += 1;
    if (actor.route.access === (actor.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL')) accessMatches += 1;
    const projection = graph.projectOnLane(actor.laneId, {
      positionM: actor.positionM,
      access: actor.route.access,
    });
    if (projection !== null && projection.distanceM < 0.001) onLane += 1;
  }
  const byKind = { TAXI: 0, CIVILIAN: 0 };
  for (const actor of actors) byKind[actor.driverKind] += 1;
  return Object.freeze({
    taxis: byKind.TAXI,
    civilians: byKind.CIVILIAN,
    actors: actors.length,
    uniqueIds: new Set(actors.map((actor) => actor.vehicleId)).size,
    classes: Object.freeze(classes),
    readyRoutes,
    routesFromPlanner: traffic.report().routesFromPlanner,
    routesByKind: Object.freeze(byKind),
    accessMatches,
    uniqueOriginLanes: new Set(actors.map((actor) => actor.laneId)).size,
    onLane,
  });
}

function fixtureProbe(
  world: ReturnType<typeof createCompositionWorld>,
  taxis: number,
  civilians: number,
): LiveFleetCountReport {
  const style = createCityStyleProfile(),
    registry = createFleetRegistry(
      registryConfiguration(`262-fixture-${taxis}-${civilians}`, taxis, civilians, style),
    ),
    traffic = createCivilTraffic({
      registry,
      map: world.map,
      graph: world.graph,
      style,
      seed: 262,
      driverKinds: ['TAXI', 'CIVILIAN'],
      contextRefresh: 'DECISION_PERIOD',
    });
  try {
    return countReport(traffic, world.graph);
  } finally {
    traffic.dispose();
    registry.dispose();
  }
}

function styleProbe(world: ReturnType<typeof createCompositionWorld>): LiveFleetProfileReport {
  let active = createCityStyleProfile('v3-city-style', 'v3-city-style-v1');
  const ambient = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: { schemaVersion: 1, units: 'SI', sessionId: '262-profile', worldEpoch: 1 },
    seed: 262,
    focus: { x: world.spawn.x, z: world.spawn.z },
    avoid: [
      { x: world.spawn.x, z: world.spawn.z },
      ...world.vehicles.map((vehicle) => ({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
      })),
    ],
    styleSource: { activeStyle: () => active },
  });
  try {
    ambient.traffic.step({ tick: 1, dtSeconds: STEP });
    active = createCityStyleProfile('v3-city-style', 'v3-city-style-v2');
    const existingBeforeRefresh = ambient
      .list()
      .filter((actor) => actor.styleVersionId === 'v3-city-style-v1').length;
    ambient.refreshStyle();
    const after = ambient.list(),
      versions = new Set(after.map((actor) => actor.styleVersionId));
    const newTaxi = ambient.registry.addVehicle('TAXI', undefined, { tick: 2 });
    const newCivilian = ambient.registry.addVehicle('CIVILIAN', undefined, { tick: 2 });
    const registryTicks = new Set(
      after.map((actor) => ambient.registry.state(actor.vehicleId)!.tick),
    );
    return Object.freeze({
      profileId: 'v3-city-style',
      initialVersion: 'v3-city-style-v1',
      activeVersion: 'v3-city-style-v2',
      existingBeforeRefresh,
      existingAfterRefresh:
        versions.size === 1 && versions.has('v3-city-style-v2') ? after.length : 0,
      uniqueVersionsAfterRefresh: versions.size,
      commonRegistryTick: registryTicks.size === 1 ? [...registryTicks][0]! : -1,
      newTaxiVersion: ambient.registry.state(newTaxi.vehicleId)!.appliedProfileVersion,
      newCivilianVersion: ambient.registry.state(newCivilian.vehicleId)!.appliedProfileVersion,
    });
  } finally {
    ambient.dispose();
  }
}

interface AmbientFixture {
  readonly ambient: ReturnType<typeof createAmbientTraffic>;
  readonly decor: ReturnType<typeof createCityDecorPlan>['items'];
  readonly world: ReturnType<typeof createCompositionWorld>;
}

function ambientFixture(
  world: ReturnType<typeof createCompositionWorld>,
  seed: number,
): AmbientFixture {
  const decor = createCityDecorPlan(world.layout).items,
    ambient = createAmbientTraffic({
      map: world.map,
      graph: world.graph,
      context: { schemaVersion: 1, units: 'SI', sessionId: '262-ambient', worldEpoch: 1 },
      seed,
      focus: { x: world.spawn.x, z: world.spawn.z },
      avoid: [
        { x: world.spawn.x, z: world.spawn.z },
        ...world.vehicles.map((vehicle) => ({
          x: vehicle.positionM.x,
          z: vehicle.positionM.z,
        })),
      ],
    });
  return { ambient, decor, world };
}

function spawnProbe(world: ReturnType<typeof createCompositionWorld>): LiveFleetSpawnReport {
  const left = ambientFixture(world, 262),
    right = ambientFixture(world, 262);
  try {
    const actors = left.ambient.list();
    let clearanceToPlayerM = Number.POSITIVE_INFINITY,
      clearanceToStaticVehiclesM = Number.POSITIVE_INFINITY,
      minimumPairwiseCentreM = Number.POSITIVE_INFINITY,
      overlappingPairs = 0,
      minimumDecorGapM = Number.POSITIVE_INFINITY;
    for (const actor of actors) {
      clearanceToPlayerM = Math.min(
        clearanceToPlayerM,
        Math.hypot(actor.positionM.x - world.spawn.x, actor.positionM.z - world.spawn.z),
      );
      for (const vehicle of world.vehicles)
        clearanceToStaticVehiclesM = Math.min(
          clearanceToStaticVehiclesM,
          Math.hypot(
            actor.positionM.x - vehicle.positionM.x,
            actor.positionM.z - vehicle.positionM.z,
          ),
        );
      for (const item of left.decor)
        minimumDecorGapM = Math.min(
          minimumDecorGapM,
          rectanglePointGap(actor, item) - item.radiusM,
        );
    }
    for (let i = 0; i < actors.length; i += 1)
      for (let j = i + 1; j < actors.length; j += 1) {
        const first = actors[i]!,
          second = actors[j]!;
        minimumPairwiseCentreM = Math.min(
          minimumPairwiseCentreM,
          Math.hypot(
            first.positionM.x - second.positionM.x,
            first.positionM.z - second.positionM.z,
          ),
        );
        if (
          vehicleBodiesOverlap(
            {
              x: first.positionM.x,
              z: first.positionM.z,
              yawRad: compositionYaw(first.headingRad),
            },
            {
              halfX: VEHICLE_COLLISION_HALF_EXTENTS_M.x,
              halfZ: VEHICLE_COLLISION_HALF_EXTENTS_M.z,
            },
            {
              x: second.positionM.x,
              z: second.positionM.z,
              yawRad: compositionYaw(second.headingRad),
            },
            {
              halfX: VEHICLE_COLLISION_HALF_EXTENTS_M.x,
              halfZ: VEHICLE_COLLISION_HALF_EXTENTS_M.z,
            },
          )
        )
          overlappingPairs += 1;
      }
    const repeated = right.ambient.list();
    const deterministic =
      JSON.stringify(
        actors.map((actor) => [
          actor.vehicleId,
          actor.laneId,
          actor.positionM.x,
          actor.positionM.z,
        ]),
      ) ===
      JSON.stringify(
        repeated.map((actor) => [
          actor.vehicleId,
          actor.laneId,
          actor.positionM.x,
          actor.positionM.z,
        ]),
      );
    return Object.freeze({
      clearanceToPlayerM: Number(clearanceToPlayerM.toFixed(3)),
      clearanceToStaticVehiclesM: Number(clearanceToStaticVehiclesM.toFixed(3)),
      minimumPairwiseCentreM: Number(minimumPairwiseCentreM.toFixed(3)),
      overlappingPairs,
      minimumDecorGapM: Number(minimumDecorGapM.toFixed(3)),
      uniqueOriginLanes: new Set(actors.map((actor) => actor.laneId)).size,
      deterministic,
    });
  } finally {
    left.ambient.dispose();
    right.ambient.dispose();
  }
}

function offCameraProbe(world: ReturnType<typeof createCompositionWorld>): {
  readonly report: LiveFleetOffCameraReport;
  readonly cleanup: LiveFleetCleanupReport;
} {
  const fixture = ambientFixture(world, 262),
    start = new Map(fixture.ambient.list().map((actor) => [actor.vehicleId, actor]));
  let moved = 0,
    outside = 0,
    outsideMoved = 0,
    minimumOutsideMoveM = Number.POSITIVE_INFINITY;
  for (let tick = 1; tick <= 600; tick += 1)
    fixture.ambient.traffic.step({ tick, dtSeconds: STEP });
  for (const [id, first] of start) {
    const last = fixture.ambient.get(id)!,
      moveM = Math.hypot(
        last.positionM.x - first.positionM.x,
        last.positionM.z - first.positionM.z,
      ),
      distanceM = Math.hypot(first.positionM.x - world.spawn.x, first.positionM.z - world.spawn.z);
    if (moveM > 1) moved += 1;
    if (distanceM > AMBIENT_TRAFFIC_POLICY.outsideWindowM) {
      outside += 1;
      if (moveM > 1) outsideMoved += 1;
      minimumOutsideMoveM = Math.min(minimumOutsideMoveM, moveM);
    }
  }
  const lastRegistryTick = Math.max(
    ...fixture.ambient.list().map((actor) => fixture.ambient.registry.state(actor.vehicleId)!.tick),
  );
  const report = Object.freeze({
    windowM: AMBIENT_TRAFFIC_POLICY.outsideWindowM,
    ticks: 600,
    actors: start.size,
    outsideWindow: outside,
    outsideMoved,
    minimumOutsideMoveM: Number(minimumOutsideMoveM.toFixed(3)),
    allMoved: moved,
    lastRegistryTick,
  });
  fixture.ambient.dispose();
  let stepRejected = false;
  try {
    fixture.ambient.traffic.step({ tick: 601, dtSeconds: STEP });
  } catch {
    stepRejected = true;
  }
  const stats = fixture.ambient.traffic.getStats();
  const cleanup = Object.freeze({
    disposed: stats.disposed,
    actors: stats.actors,
    longitudinalActors: stats.longitudinalActors,
    roadContextVehicles: stats.roadContextVehicles,
    registryVehicles: fixture.ambient.registry.counts().vehicles,
    reportVehicles: fixture.ambient.report().counts.vehicles,
    stepRejected,
  });
  return { report, cleanup };
}

export function runLiveFleetReport(): LiveFleetReport {
  const world = createCompositionWorld(),
    fixtures = [
      fixtureProbe(world, 20, 20),
      fixtureProbe(world, 24, 32),
      fixtureProbe(world, 30, 40),
    ],
    profile = styleProbe(world),
    spawn = spawnProbe(world),
    offCamera = offCameraProbe(world),
    checks: LiveFleetCheck[] = [
      check(
        'fixture-20-20',
        { taxis: 20, civilians: 20, actors: 40 },
        {
          taxis: fixtures[0]!.taxis,
          civilians: fixtures[0]!.civilians,
          actors: fixtures[0]!.actors,
        },
        'Fixture 057 minimum.',
      ),
      check(
        'fixture-24-32',
        { taxis: 24, civilians: 32, actors: 56 },
        {
          taxis: fixtures[1]!.taxis,
          civilians: fixtures[1]!.civilians,
          actors: fixtures[1]!.actors,
        },
        'Normal live fleet.',
      ),
      check(
        'fixture-30-40',
        { taxis: 30, civilians: 40, actors: 70 },
        {
          taxis: fixtures[2]!.taxis,
          civilians: fixtures[2]!.civilians,
          actors: fixtures[2]!.actors,
        },
        'V1 maximum workload.',
      ),
      truthy(
        'fixture-stable-ids',
        fixtures.every((fixture) => fixture.uniqueIds === fixture.actors),
        'Every actor keeps one stable 057 identity.',
      ),
      truthy(
        'fixture-ready-routes',
        fixtures.every(
          (fixture) =>
            fixture.readyRoutes === fixture.actors && fixture.routesFromPlanner === fixture.actors,
        ),
        'Every actor route is READY and returned by 041.',
      ),
      truthy(
        'fixture-kind-access',
        fixtures.every((fixture) => fixture.accessMatches === fixture.actors),
        'Taxis plan on TAXI access and civilians on CIVIL access.',
      ),
      truthy(
        'fixture-real-classes',
        fixtures.every((fixture) =>
          Object.keys(fixture.classes).every(
            (classId) => classId === 'sedan' || classId === 'compact',
          ),
        ),
        'Classes are the real 023 sedan/compact identities.',
      ),
      truthy(
        'fixture-unique-origins',
        fixtures.every((fixture) => fixture.uniqueOriginLanes === fixture.actors),
        'No two actors spawn on the same lane.',
      ),
      truthy(
        'fixture-on-lane',
        fixtures.every((fixture) => fixture.onLane === fixture.actors),
        'Every spawn pose projects onto its own route lane.',
      ),
      check(
        'profile-initial',
        56,
        profile.existingBeforeRefresh,
        'No hidden version change before refresh.',
      ),
      check(
        'profile-active',
        56,
        profile.existingAfterRefresh,
        'refreshStyle applies the active version.',
      ),
      check(
        'profile-one-version',
        1,
        profile.uniqueVersionsAfterRefresh,
        'One common version after refresh.',
      ),
      check(
        'profile-one-tick',
        1,
        profile.commonRegistryTick,
        'All actors update at the common tick.',
      ),
      check(
        'profile-new-taxi',
        'v3-city-style-v2',
        profile.newTaxiVersion,
        'New taxi reads active version.',
      ),
      check(
        'profile-new-civilian',
        'v3-city-style-v2',
        profile.newCivilianVersion,
        'New civilian reads active version.',
      ),
      truthy(
        'spawn-player-clearance',
        spawn.clearanceToPlayerM >= AMBIENT_TRAFFIC_POLICY.spawnClearanceM,
        `${spawn.clearanceToPlayerM} m to the player.`,
      ),
      truthy(
        'spawn-static-vehicle-clearance',
        spawn.clearanceToStaticVehiclesM >= AMBIENT_TRAFFIC_POLICY.spawnClearanceM,
        `${spawn.clearanceToStaticVehiclesM} m to a static vehicle.`,
      ),
      truthy('spawn-no-vehicle-overlap', spawn.overlappingPairs === 0, 'SAT pairs.'),
      truthy('spawn-decor-gap', spawn.minimumDecorGapM > 0, `${spawn.minimumDecorGapM} m gap.`),
      truthy('spawn-unique-origins', spawn.uniqueOriginLanes === 56, '56 unique origin lanes.'),
      truthy('spawn-deterministic', spawn.deterministic, 'Same seed gives the same spawn.'),
      truthy(
        'off-camera-simulation',
        offCamera.report.outsideWindow > 0 &&
          offCamera.report.outsideMoved === offCamera.report.outsideWindow &&
          offCamera.report.minimumOutsideMoveM > 1,
        `${offCamera.report.outsideMoved}/${offCamera.report.outsideWindow} off-camera actors moved; minimum ${offCamera.report.minimumOutsideMoveM} m.`,
      ),
      check('off-camera-all-moved', 56, offCamera.report.allMoved, 'All actors keep simulating.'),
      check(
        'off-camera-registry-tick',
        600,
        offCamera.report.lastRegistryTick,
        'Registry tick follows simulation.',
      ),
      truthy(
        'cleanup-zero',
        offCamera.cleanup.disposed &&
          offCamera.cleanup.actors === 0 &&
          offCamera.cleanup.longitudinalActors === 0 &&
          offCamera.cleanup.roadContextVehicles === 0 &&
          offCamera.cleanup.registryVehicles === 0 &&
          offCamera.cleanup.reportVehicles === 0 &&
          offCamera.cleanup.stepRejected,
        'Dispose releases actors, controls, context and registry.',
      ),
      truthy(
        'no-camera-presentation-fields',
        !/@babylonjs|document\.|window\.|renderer|camera/i.test(
          readFileSync(join(process.cwd(), 'src', 'fleet', 'civil-traffic.ts'), 'utf8') +
            readFileSync(join(process.cwd(), 'src', 'app', 'ambient-traffic.ts'), 'utf8'),
        ),
        'No renderer, camera or DOM token in the simulation path.',
      ),
    ];
  return Object.freeze({
    version: LIVE_FLEET_REPORT_VERSION,
    generatedBy: 'npm run fleet:live',
    contract: Object.freeze({
      ambientVersion: AMBIENT_TRAFFIC_VERSION,
      trafficVersion: CIVIL_TRAFFIC_VERSION,
      normal: Object.freeze({
        taxis: AMBIENT_TRAFFIC_POLICY.taxis,
        civilians: AMBIENT_TRAFFIC_POLICY.civilians,
      }),
      limits: Object.freeze({
        taxis: [FLEET_LIMITS.taxisMinimum, FLEET_LIMITS.taxisMaximum] as [number, number],
        civilians: [FLEET_LIMITS.civiliansMinimum, FLEET_LIMITS.civiliansMaximum] as [
          number,
          number,
        ],
        vehicles: FLEET_LIMITS.vehicles,
      }),
      driverKinds: Object.freeze(['TAXI', 'CIVILIAN'] as const),
      frameVehicles: CIVIL_TRAFFIC_LIMITS.frameVehicles,
      tickHz: CIVIL_TRAFFIC_LIMITS.tickHz,
      presentationFields: Object.freeze([]),
    }),
    fixtures: Object.freeze(fixtures),
    profile,
    spawn,
    offCamera: offCamera.report,
    cleanup: offCamera.cleanup,
    checks,
    summary: Object.freeze({
      checks: checks.length,
      passed: checks.filter((entry) => entry.pass).length,
      pass: checks.every((entry) => entry.pass),
    }),
  });
}

function costSample(
  actors: number,
  taxis: number,
  civilians: number,
  samples: readonly number[],
): LiveFleetCostSample {
  const sorted = [...samples].sort((left, right) => left - right);
  return Object.freeze({
    actors,
    taxis,
    civilians,
    samples: sorted.length,
    p50Ms: Number(percentile(sorted, 0.5).toFixed(4)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(4)),
    p99Ms: Number(percentile(sorted, 0.99).toFixed(4)),
    maxMs: Number(sorted[sorted.length - 1]!.toFixed(4)),
  });
}

function measure(
  world: ReturnType<typeof createCompositionWorld>,
  taxis: number,
  civilians: number,
  driverKinds: readonly ('TAXI' | 'CIVILIAN')[],
): readonly number[] {
  const style = createCityStyleProfile(),
    registry = createFleetRegistry(
      registryConfiguration(`262-cost-${taxis}-${civilians}`, taxis, civilians, style),
    ),
    traffic = createCivilTraffic({
      registry,
      map: world.map,
      graph: world.graph,
      style,
      seed: 262,
      driverKinds,
      contextRefresh: 'DECISION_PERIOD',
    });
  try {
    let tick = 0;
    for (let index = 0; index < 120; index += 1)
      traffic.step({ tick: (tick += 1), dtSeconds: STEP });
    const samples: number[] = [];
    for (let index = 0; index < 600; index += 1) {
      const started = performance.now();
      traffic.step({ tick: (tick += 1), dtSeconds: STEP });
      samples.push(performance.now() - started);
    }
    return Object.freeze(samples);
  } finally {
    traffic.dispose();
    registry.dispose();
  }
}

export function measureLiveFleetCost(): LiveFleetCostReport {
  const world = createCompositionWorld(),
    baselineSamples: number[] = [],
    liveSamples: number[] = [];
  // Three paired repetitions keep JIT/GC warmup from being attributed to only one population.
  for (let pair = 0; pair < 3; pair += 1) {
    baselineSamples.push(...measure(world, 20, 40, ['CIVILIAN']));
    liveSamples.push(...measure(world, 30, 40, ['TAXI', 'CIVILIAN']));
  }
  const baseline = costSample(40, 0, 40, baselineSamples),
    live = costSample(70, 30, 40, liveSamples);
  return Object.freeze({
    version: LIVE_FLEET_REPORT_VERSION,
    generatedBy: 'npm run fleet:live -- --measure',
    measuredAt: new Date().toISOString(),
    protocol: Object.freeze({
      warmupTicks: 120,
      measuredTicks: 600,
      repetitions: 3,
      tickHz: CIVIL_TRAFFIC_LIMITS.tickHz,
      budgetMs: LIVE_FLEET_COST_BUDGET_MS,
      budgetSource: 'Docs/25 laptop authoritative tick p95',
      subsystem: '058 traffic step on the real 032/033 neighbourhood map',
    }),
    environment: Object.freeze({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model ?? null,
      totalMemoryBytes: totalmem(),
      renderer: 'NONE_HEADLESS',
    }),
    baseline40Civilians: baseline,
    live70Vehicles: live,
    additionalCostMs: Number((live.p95Ms - baseline.p95Ms).toFixed(4)),
    pass: live.p95Ms <= LIVE_FLEET_COST_BUDGET_MS,
    limits: Object.freeze([
      'Headless Node measurement; it is not a browser frame, GPU or hardware certificate.',
      'Only the 058 traffic subsystem is measured, not the complete authoritative tick.',
      'The 8 ms budget is the laptop tick p95 from Docs/25; the full tick remains the release gate.',
      'The baseline registry keeps the required 20 taxis but simulates only its 40 civilians.',
    ]),
  });
}
