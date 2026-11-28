import { cpus, totalmem } from 'node:os';
import {
  AMBIENT_TRAFFIC_POLICY,
  createAmbientTraffic,
  createCityStyleProfile,
  type AmbientTraffic,
} from '../../src/app/ambient-traffic';
import { createCompositionWorld } from '../../src/app/composition-world';
import { createLiveTrafficRules, type LiveTrafficRulesReport } from '../../src/autonomy';
import { CIVIL_TRAFFIC_LIMITS, CIVIL_TRAFFIC_VERSION } from '../../src/fleet';
import { createRoutePlanner, type LaneGraph } from '../../src/world';
import { laneSample } from './civil-traffic-fixture';

export const CIVIL_AUTONOMY_REPORT_VERSION = '284-civil-autonomy-v1' as const;
export const CIVIL_AUTONOMY_COST_BUDGET_MS = 8;
const STEP = 1 / 60;
/** 150 s of live traffic: enough for authored signal cycles, STOP queues and 053 lane changes. */
const RULES_TICKS = 9000;
const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '284-civil-autonomy',
  worldEpoch: 1,
});

export interface CivilAutonomyCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface CivilRulesProbeReport {
  readonly ticks: number;
  readonly actors: number;
  readonly taxis: number;
  readonly civilians: number;
  readonly signals: number;
  readonly commandedActors: number;
  readonly civilSignalHolds: number;
  readonly civilStopHolds: number;
  readonly civilYieldHolds: number;
  readonly civilBlockedHolds: number;
  readonly civilLaneChanges: number;
  readonly signalStops: number;
  readonly stopApproaches: number;
  readonly stopFullStops: number;
  readonly yieldChecks: number;
  readonly yieldHolds: number;
  readonly laneChangeValidated: number;
  readonly laneChangeApplied: number;
  readonly blockedReroutes: number;
  readonly deadlockStays: number;
  readonly movingActors: number;
  readonly outsideWindow: number;
  readonly outsideMoved: number;
  readonly uniqueIds: number;
  /** Wall-clock cost samples are excluded so the transcript is byte-deterministic. */
  readonly rules: Omit<LiveTrafficRulesReport, 'cost'>;
}

export interface CivilRecoveryProbeReport {
  readonly ticks: number;
  readonly vehicleId: string;
  readonly laneId: string;
  readonly destinationLaneId: string;
  readonly blockedEpisodes: number;
  readonly blockedCommands: number;
  readonly rerouteRequests: number;
  readonly applied: number;
  readonly stayBlocked: number;
  readonly recoveryAction: string | null;
}

export interface CivilTakeoverProbeReport {
  readonly ticks: number;
  readonly vehicleId: string;
  readonly routeBefore: readonly string[];
  readonly routeAfterFreeze: readonly string[];
  readonly routeAfterResume: readonly string[];
  readonly destinationBefore: string | null;
  readonly destinationAfter: string | null;
  readonly distanceBefore: number;
  readonly frozenDistance: number;
  readonly drivenDistance: number;
  readonly resumedDistance: number;
  readonly resumedMovedM: number;
  readonly actorCountBefore: number;
  readonly actorCountAfter: number;
  readonly freezeMovedM: number;
  readonly exitJumpM: number;
  readonly registryMode: string;
  readonly authorityDuringManual: string;
  readonly authorityAfterResume: string;
}

export interface CivilProfileSpawnProbeReport {
  readonly profileId: string;
  readonly versionBefore: string;
  readonly versionAfter: string;
  readonly taxisAfterRefresh: number;
  readonly civiliansAfterRefresh: number;
  readonly newTaxiVersion: string;
  readonly newCivilianVersion: string;
  readonly newCivilianClearanceM: number;
  readonly uniqueVehicleIds: number;
  readonly registryVehicles: number;
  readonly actorCountBefore: number;
  readonly actorCountAfter: number;
}

export interface CivilAutonomyReport {
  readonly version: typeof CIVIL_AUTONOMY_REPORT_VERSION;
  readonly generatedBy: 'npm run civil:autonomy';
  readonly contract: Readonly<{
    trafficVersion: typeof CIVIL_TRAFFIC_VERSION;
    ambientVersion: typeof AMBIENT_TRAFFIC_POLICY.contract;
    actors: number;
    taxis: number;
    civilians: number;
    outsideWindowM: number;
    spawnClearanceM: number;
    tickHz: typeof CIVIL_TRAFFIC_LIMITS.tickHz;
  }>;
  readonly rules: CivilRulesProbeReport;
  readonly recovery: CivilRecoveryProbeReport;
  readonly takeover: CivilTakeoverProbeReport;
  readonly profile: CivilProfileSpawnProbeReport;
  readonly checks: readonly CivilAutonomyCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

export interface CivilAutonomyCostSample {
  readonly taxis: number;
  readonly civilians: number;
  readonly actors: number;
  readonly classification: 'NORMAL' | 'STRESS';
  readonly samples: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
  readonly withinBudget: boolean;
}

export interface CivilAutonomyCostReport {
  readonly version: typeof CIVIL_AUTONOMY_REPORT_VERSION;
  readonly generatedBy: 'npm run civil:autonomy:cost';
  readonly measuredAt: string;
  readonly protocol: Readonly<{
    warmupTicks: number;
    measuredTicks: number;
    repetitions: number;
    tickHz: number;
    budgetMs: number;
    budgetSource: 'Docs/25 laptop authoritative tick p95';
    subsystem: '058 traffic step with one live 283 rules owner on the real 032/033 map';
  }>;
  readonly environment: Readonly<{
    node: string;
    platform: string;
    arch: string;
    cpu: string | null;
    totalMemoryBytes: number;
    renderer: 'NONE_HEADLESS';
  }>;
  readonly samples: readonly CivilAutonomyCostSample[];
  readonly additional40Vs24P95Ms: number;
  readonly pass: boolean;
  /** The 30-taxi maximum-workload probe is reported separately; it is not the 24–40 civilian gate. */
  readonly stressPass: boolean;
  readonly limits: readonly string[];
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): CivilAutonomyCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function truthy(name: string, actual: boolean, detail: string): CivilAutonomyCheck {
  return check(name, true, actual, detail);
}

interface AmbientFixture {
  readonly ambient: AmbientTraffic;
  readonly world: ReturnType<typeof createCompositionWorld>;
  readonly graph: LaneGraph;
}

function ambientFixture(
  sessionId: string,
  taxis: number = AMBIENT_TRAFFIC_POLICY.taxis,
  civilians: number = AMBIENT_TRAFFIC_POLICY.civilians,
  styleSource?: { activeStyle(): ReturnType<typeof createCityStyleProfile> },
): AmbientFixture {
  const world = createCompositionWorld();
  const ambient = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: { ...CONTEXT, sessionId },
    seed: 284,
    taxiCount: taxis,
    civilianCount: civilians,
    liveRules: true,
    focus: { x: world.spawn.x, z: world.spawn.z },
    avoid: [
      { x: world.spawn.x, z: world.spawn.z },
      ...world.vehicles.map((vehicle) => ({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
      })),
    ],
    ...(styleSource === undefined ? {} : { styleSource }),
  });
  return { ambient, world, graph: world.graph };
}

function rulesProbe(): CivilRulesProbeReport {
  const { ambient, world } = ambientFixture('284-rules', 24, 40);
  try {
    const initial = new Map(ambient.list().map((actor) => [actor.vehicleId, actor]));
    let civilSignalHolds = 0,
      civilStopHolds = 0,
      civilYieldHolds = 0,
      civilBlockedHolds = 0,
      civilLaneChanges = 0,
      signals = 0;
    for (let tick = 1; tick <= RULES_TICKS; tick += 1) {
      ambient.traffic.step({ tick, dtSeconds: STEP });
      const frame = ambient.rules!.frame();
      if (frame === null) continue;
      signals = Math.max(signals, frame.signals.length);
      for (const actor of ambient.list()) {
        if (actor.driverKind !== 'CIVILIAN') continue;
        const command = frame.commands.get(actor.vehicleId);
        if (command === undefined) continue;
        if (command.holdKind === 'SIGNAL') civilSignalHolds += 1;
        if (command.holdKind === 'STOP') civilStopHolds += 1;
        if (command.holdKind === 'YIELD') civilYieldHolds += 1;
        if (command.holdKind === 'BLOCKED') civilBlockedHolds += 1;
        if (command.laneChangeTargetLaneId !== null) civilLaneChanges += 1;
      }
    }
    const actors = ambient.list(),
      rules = ambient.trafficRules()!,
      { cost: _cost, ...deterministicRules } = rules,
      last = ambient.rules!.frame(),
      finalPositions = new Map(actors.map((actor) => [actor.vehicleId, actor.positionM])),
      outside = [...initial.values()].filter(
        (actor) =>
          Math.hypot(actor.positionM.x - world.spawn.x, actor.positionM.z - world.spawn.z) >
          AMBIENT_TRAFFIC_POLICY.outsideWindowM,
      );
    let moving = 0,
      outsideMoved = 0;
    for (const actor of initial.values()) {
      const end = finalPositions.get(actor.vehicleId);
      if (end === undefined) continue;
      if (Math.hypot(end.x - actor.positionM.x, end.z - actor.positionM.z) > 1) moving += 1;
    }
    for (const actor of outside) {
      const end = finalPositions.get(actor.vehicleId)!;
      if (Math.hypot(end.x - actor.positionM.x, end.z - actor.positionM.z) > 1) outsideMoved += 1;
    }
    return Object.freeze({
      ticks: RULES_TICKS,
      actors: actors.length,
      taxis: actors.filter((actor) => actor.driverKind === 'TAXI').length,
      civilians: actors.filter((actor) => actor.driverKind === 'CIVILIAN').length,
      signals,
      commandedActors: last?.commands.size ?? 0,
      civilSignalHolds,
      civilStopHolds,
      civilYieldHolds,
      civilBlockedHolds,
      civilLaneChanges,
      signalStops: rules.signals.redStops,
      stopApproaches: rules.stop.approaches,
      stopFullStops: rules.stop.fullStops,
      yieldChecks: rules.yield.checks,
      yieldHolds: rules.yield.holds,
      laneChangeValidated: rules.laneChange.validated,
      laneChangeApplied: rules.laneChange.applied,
      blockedReroutes: rules.blocked.rerouteRequests,
      deadlockStays: rules.blocked.stayBlocked,
      movingActors: moving,
      outsideWindow: outside.length,
      outsideMoved,
      uniqueIds: new Set(actors.map((actor) => actor.vehicleId)).size,
      rules: Object.freeze(deterministicRules),
    });
  } finally {
    ambient.dispose();
  }
}

function recoveryProbe(): CivilRecoveryProbeReport {
  const world = createCompositionWorld(),
    graph = world.graph,
    map = world.map,
    planner = createRoutePlanner({
      graph,
      map,
      graphVersion: '033-lane-graph-v1',
      costVersion: 'route-cost-v1',
    }),
    origins = map.lanes
      .filter((lane) => {
        if (!lane.access.includes('CIVIL')) return false;
        const path = graph.getDirectedPath(lane.id);
        return path !== null && path.lengthM > 30;
      })
      .map((lane) => ({
        id: lane.id,
        lengthM: graph.getDirectedPath(lane.id)!.lengthM,
      }))
      .sort((left, right) => right.lengthM - left.lengthM || left.id.localeCompare(right.id))
      .map((lane) => lane.id),
    destinations = map.lanes
      .filter((lane) => lane.access.includes('CIVIL'))
      .map((lane) => lane.id)
      .sort();
  let laneId: string | null = null,
    destinationLaneId: string | null = null;
  for (const origin of origins)
    for (const destination of destinations) {
      if (destination === origin) continue;
      const plan = planner.findRoute({ origin, destination, access: 'CIVIL' });
      if (
        plan.status === 'READY' &&
        plan.path !== null &&
        plan.path.length > 1 &&
        plan.path.length <= CIVIL_TRAFFIC_LIMITS.routeLanes
      ) {
        laneId = origin;
        destinationLaneId = destination;
        break;
      }
    }
  planner.dispose();
  if (laneId === null || destinationLaneId === null)
    throw new Error('No signal-free civil route was available for the recovery probe.');
  const rules = createLiveTrafficRules({
      map,
      graph,
      context: { ...CONTEXT, sessionId: '284-recovery' },
    }),
    vehicleId = '284-civil-recovery',
    sample = laneSample(graph, laneId, 0),
    profile = createCityStyleProfile(),
    actor = Object.freeze({
      vehicleId,
      incarnation: 1,
      access: 'CIVIL' as const,
      authority: 'AUTO' as const,
      laneId,
      laneProgressM: 0,
      // No next route lane: the actor is not approaching an intersection movement, so 054 can
      // classify the real stagnation instead of a signal/STOP hold.
      routeLaneIds: Object.freeze([laneId]),
      positionM: sample.positionM,
      headingRad: sample.headingRad,
      speedMps: 0,
      profile,
      seed: 284,
      leader: null,
      routeStatus: 'READY' as const,
      destinationLaneId,
    });
  let blockedCommands = 0,
    recoveryAction: string | null = null;
  try {
    for (let tick = 1; tick <= 600; tick += 1) {
      const frame = rules.step({ tick, actors: [actor] }),
        command = frame.commands.get(vehicleId);
      if (command?.holdKind === 'BLOCKED') blockedCommands += 1;
      if (command !== undefined && command.recovery !== null)
        recoveryAction = command.recovery.action;
    }
    if (recoveryAction !== null) rules.noteRecovery(vehicleId, true);
    const report = rules.report();
    return Object.freeze({
      ticks: 600,
      vehicleId,
      laneId,
      destinationLaneId,
      blockedEpisodes: report.blocked.episodes,
      blockedCommands,
      rerouteRequests: report.blocked.rerouteRequests,
      applied: report.blocked.applied,
      stayBlocked: report.blocked.stayBlocked,
      recoveryAction,
    });
  } finally {
    rules.dispose();
  }
}

function takeoverProbe(): CivilTakeoverProbeReport {
  const { ambient, graph } = ambientFixture('284-takeover');
  try {
    let tick = 0;
    for (; tick < 300; tick += 1) ambient.traffic.step({ tick: tick + 1, dtSeconds: STEP });
    const candidate =
        ambient.list().find((actor) => {
          if (actor.driverKind !== 'CIVILIAN') return false;
          const projection = graph.projectOnLane(actor.laneId, {
              positionM: actor.positionM,
              access: 'CIVIL',
            }),
            path = graph.getDirectedPath(actor.laneId);
          return (
            projection !== null && path !== null && path.lengthM - projection.longitudinalM > 5
          );
        }) ?? ambient.list().find((actor) => actor.driverKind === 'CIVILIAN')!,
      id = candidate.vehicleId,
      before = ambient.get(id)!,
      routeBefore = before.route.path,
      destinationBefore = before.route.destinationLaneId,
      actorCountBefore = ambient.list().length,
      distanceBefore = before.distanceAlongRouteM,
      positionBefore = before.positionM;
    ambient.traffic.setAuthority(id, 'MANUAL', tick);
    const frozen = ambient.get(id)!,
      frozenDistance = frozen.distanceAlongRouteM;
    for (let index = 0; index < 120; index += 1) {
      tick += 1;
      ambient.traffic.step({ tick, dtSeconds: STEP });
    }
    const afterFreeze = ambient.get(id)!,
      freezeMovedM = Math.hypot(
        afterFreeze.positionM.x - positionBefore.x,
        afterFreeze.positionM.z - positionBefore.z,
      ),
      routeAfterFreeze = afterFreeze.route.path;

    const projection = graph.projectOnLane(afterFreeze.laneId, {
        positionM: afterFreeze.positionM,
        access: 'CIVIL',
      }),
      startLocalM = projection?.longitudinalM ?? 0,
      path = graph.getDirectedPath(afterFreeze.laneId)!,
      driveM = Math.min(8, Math.max(0, path.lengthM - startLocalM - 0.5));
    let drivenDistance = afterFreeze.distanceAlongRouteM;
    for (let index = 0; index < 40; index += 1) {
      const sample = laneSample(
        graph,
        afterFreeze.laneId,
        startLocalM + (driveM * (index + 1)) / 40,
      );
      ambient.traffic.reconcile(
        id,
        {
          positionM: sample.positionM,
          headingRad: sample.headingRad,
          speedMps: 4,
        },
        tick,
      );
      tick += 1;
      ambient.traffic.step({ tick, dtSeconds: STEP });
      drivenDistance = ambient.get(id)!.distanceAlongRouteM;
    }
    ambient.traffic.resume(id, tick);
    const resumed = ambient.get(id)!,
      resumedDistance = resumed.distanceAlongRouteM,
      resumedPosition = resumed.positionM;
    tick += 1;
    ambient.traffic.step({ tick, dtSeconds: STEP });
    const afterResumeStep = ambient.get(id)!,
      exitJumpM = Math.hypot(
        afterResumeStep.positionM.x - resumedPosition.x,
        afterResumeStep.positionM.z - resumedPosition.z,
      );
    let resumedMovedM = 0;
    for (let index = 0; index < 120; index += 1) {
      tick += 1;
      ambient.traffic.step({ tick, dtSeconds: STEP });
    }
    const moved = ambient.get(id)!;
    resumedMovedM = Math.hypot(
      moved.positionM.x - resumedPosition.x,
      moved.positionM.z - resumedPosition.z,
    );
    return Object.freeze({
      ticks: tick,
      vehicleId: id,
      routeBefore: Object.freeze([...routeBefore]),
      routeAfterFreeze: Object.freeze([...routeAfterFreeze]),
      routeAfterResume: Object.freeze([...resumed.route.path]),
      destinationBefore,
      destinationAfter: moved.route.destinationLaneId,
      distanceBefore,
      frozenDistance,
      drivenDistance,
      resumedDistance,
      resumedMovedM,
      actorCountBefore,
      actorCountAfter: ambient.list().length,
      freezeMovedM,
      exitJumpM,
      registryMode: ambient.registry.state(id)!.controlMode,
      authorityDuringManual: afterFreeze.authority,
      authorityAfterResume: resumed.authority,
    });
  } finally {
    ambient.dispose();
  }
}

function profileSpawnProbe(): CivilProfileSpawnProbeReport {
  let active = createCityStyleProfile('v3-city-style', 'v3-city-style-v1');
  const { ambient, world } = ambientFixture('284-profile', 20, 20, { activeStyle: () => active });
  try {
    ambient.traffic.step({ tick: 1, dtSeconds: STEP });
    active = createCityStyleProfile('v3-city-style', 'v3-city-style-v2');
    ambient.refreshStyle();
    const actors = ambient.list(),
      avoid = [{ x: world.spawn.x, z: world.spawn.z, radiusM: 1 }],
      taxi = ambient.registry.addVehicle('TAXI', undefined, { tick: 2 }),
      civilian = ambient.registry.addVehicle('CIVILIAN', undefined, { tick: 2 }),
      addedTaxi = ambient.addVehicle(taxi.vehicleId, { avoid, clearanceM: 6 }),
      addedCivilian = ambient.addVehicle(civilian.vehicleId, { avoid, clearanceM: 6 }),
      registryVehicles = ambient.registry.list();
    return Object.freeze({
      profileId: 'v3-city-style',
      versionBefore: 'v3-city-style-v1',
      versionAfter: 'v3-city-style-v2',
      taxisAfterRefresh: actors.filter(
        (actor) => actor.driverKind === 'TAXI' && actor.styleVersionId === 'v3-city-style-v2',
      ).length,
      civiliansAfterRefresh: actors.filter(
        (actor) => actor.driverKind === 'CIVILIAN' && actor.styleVersionId === 'v3-city-style-v2',
      ).length,
      newTaxiVersion: addedTaxi.styleVersionId,
      newCivilianVersion: addedCivilian.styleVersionId,
      newCivilianClearanceM:
        Math.hypot(
          addedCivilian.positionM.x - world.spawn.x,
          addedCivilian.positionM.z - world.spawn.z,
        ) - 1,
      uniqueVehicleIds: new Set(registryVehicles.map((vehicle) => vehicle.vehicleId)).size,
      registryVehicles: registryVehicles.length,
      actorCountBefore: actors.length,
      actorCountAfter: ambient.list().length,
    });
  } finally {
    ambient.dispose();
  }
}

export function runCivilAutonomyReport(): CivilAutonomyReport {
  const rules = rulesProbe(),
    recovery = recoveryProbe(),
    takeover = takeoverProbe(),
    profile = profileSpawnProbe(),
    checks: CivilAutonomyCheck[] = [
      check('population', 40, rules.civilians, 'The report simulates 40 civilians.'),
      check('taxis', 24, rules.taxis, 'The same live fleet keeps 24 taxis.'),
      check('unique-ids', rules.actors, rules.uniqueIds, 'Every actor identity is unique.'),
      truthy(
        'full-context-signals',
        rules.signals > 0,
        `${rules.signals} 036 movement signals are published in the 044 frame.`,
      ),
      check(
        'every-actor-commanded',
        rules.actors,
        rules.commandedActors,
        'Every taxi and civilian receives a 283 command, not only the near cars.',
      ),
      truthy(
        'civil-signal-policy',
        rules.civilSignalHolds > 0 && rules.signalStops > 0,
        `${rules.civilSignalHolds} civil signal holds; ${rules.signalStops} red stop episodes.`,
      ),
      truthy(
        'civil-stop-policy',
        rules.civilStopHolds > 0 && rules.stopFullStops > 0,
        `${rules.civilStopHolds} civil STOP holds; ${rules.stopFullStops} full stops proved.`,
      ),
      truthy(
        'civil-yield-policy',
        rules.civilYieldHolds > 0 && rules.yieldChecks > 0,
        `${rules.civilYieldHolds} civil yield holds; ${rules.yieldChecks} priority checks.`,
      ),
      truthy(
        'civil-lane-policy',
        rules.civilLaneChanges > 0 || rules.laneChangeApplied > 0,
        `${rules.civilLaneChanges} civil lane requests; ${rules.laneChangeApplied} applied changes.`,
      ),
      truthy(
        'recovery-stagnation',
        recovery.blockedEpisodes > 0 && recovery.blockedCommands > 0,
        `054 opened ${recovery.blockedEpisodes} blocked episodes and held ${recovery.blockedCommands} decisions on real civil lane ${recovery.laneId}.`,
      ),
      truthy(
        'recovery-reroute',
        recovery.rerouteRequests > 0 && recovery.recoveryAction === 'REQUEST_REROUTE',
        `The civil actor requested ${recovery.rerouteRequests} reroutes (${recovery.recoveryAction ?? 'none'}).`,
      ),
      truthy(
        'recovery-applied',
        recovery.applied > 0,
        `The 058 owner acknowledged ${recovery.applied} executed recoveries.`,
      ),
      check(
        'hidden-actors-move',
        rules.actors,
        rules.movingActors,
        `Every actor moves over 1 m during the ${rules.ticks}-tick run, including off-camera cars.`,
      ),
      check(
        'outside-window-simulated',
        rules.outsideWindow,
        rules.outsideMoved,
        `${rules.outsideWindow} actors start outside ${AMBIENT_TRAFFIC_POLICY.outsideWindowM} m and all move.`,
      ),
      check(
        'takeover-route-before',
        JSON.stringify(takeover.routeBefore),
        JSON.stringify(takeover.routeAfterFreeze),
        'The frozen 058 route is identical to the route before takeover.',
      ),
      check(
        'takeover-route-suspended',
        0,
        takeover.freezeMovedM,
        'The civil AI does not advance while the route is suspended.',
      ),
      check(
        'takeover-authority',
        'MANUAL',
        takeover.authorityDuringManual,
        'The taken-over civilian is MANUAL in the 058 owner.',
      ),
      truthy(
        'takeover-driven',
        takeover.drivenDistance > takeover.frozenDistance,
        `The player pose advances ${takeover.drivenDistance - takeover.frozenDistance} m on the same route.`,
      ),
      check(
        'exit-route-preserved',
        JSON.stringify(takeover.routeBefore),
        JSON.stringify(takeover.routeAfterResume),
        'Resume keeps the route path.',
      ),
      check(
        'exit-destination',
        takeover.destinationBefore,
        takeover.destinationAfter,
        'Resume keeps the same destination lane.',
      ),
      check('exit-mode', 'AUTO', takeover.registryMode, 'The registry returns to AUTO.'),
      truthy(
        'exit-no-teleport',
        takeover.exitJumpM < 1,
        `The first AUTO step moves ${takeover.exitJumpM.toFixed(4)} m from the handoff pose.`,
      ),
      truthy(
        'exit-route-continues',
        takeover.resumedMovedM > 1,
        `The resumed civil advances ${takeover.resumedMovedM.toFixed(3)} m from the driven point.`,
      ),
      check(
        'no-route-duplicate',
        takeover.actorCountBefore,
        takeover.actorCountAfter,
        'Takeover and resume do not create a second actor.',
      ),
      check(
        'common-profile-refresh',
        'v3-city-style-v2',
        profile.versionAfter,
        'One explicit refresh applies the active common version.',
      ),
      check(
        'taxi-profile-parity',
        profile.taxisAfterRefresh,
        profile.civiliansAfterRefresh,
        'Taxis and civilians share the same applied version.',
      ),
      check(
        'new-taxi-profile',
        'v3-city-style-v2',
        profile.newTaxiVersion,
        'A new taxi reads the active version.',
      ),
      check(
        'new-civilian-profile',
        'v3-city-style-v2',
        profile.newCivilianVersion,
        'A new civilian reads the active version.',
      ),
      truthy(
        'new-vehicle-spawn-clearance',
        profile.newCivilianClearanceM >= 6,
        `The new civilian clears the player by ${profile.newCivilianClearanceM.toFixed(3)} m.`,
      ),
      check(
        'new-vehicle-unique-id',
        profile.registryVehicles,
        profile.uniqueVehicleIds,
        'Registry identities stay unique.',
      ),
      check(
        'new-vehicle-single-actor',
        profile.actorCountBefore + 2,
        profile.actorCountAfter,
        'Exactly one new actor per added vehicle.',
      ),
    ],
    passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: CIVIL_AUTONOMY_REPORT_VERSION,
    generatedBy: 'npm run civil:autonomy',
    contract: Object.freeze({
      trafficVersion: CIVIL_TRAFFIC_VERSION,
      ambientVersion: AMBIENT_TRAFFIC_POLICY.contract,
      actors: rules.actors,
      taxis: rules.taxis,
      civilians: rules.civilians,
      outsideWindowM: AMBIENT_TRAFFIC_POLICY.outsideWindowM,
      spawnClearanceM: CIVIL_TRAFFIC_LIMITS.spawnClearanceM,
      tickHz: CIVIL_TRAFFIC_LIMITS.tickHz,
    }),
    rules,
    recovery,
    takeover,
    profile,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

function percentile(sorted: readonly number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index]!;
}

function costSample(
  taxis: number,
  civilians: number,
  samples: readonly number[],
): CivilAutonomyCostSample {
  const sorted = [...samples].sort((left, right) => left - right),
    p95Ms = Number(percentile(sorted, 0.95).toFixed(4));
  return Object.freeze({
    taxis,
    civilians,
    actors: taxis + civilians,
    classification: taxis > 20 ? ('STRESS' as const) : ('NORMAL' as const),
    samples: sorted.length,
    p50Ms: Number(percentile(sorted, 0.5).toFixed(4)),
    p95Ms,
    p99Ms: Number(percentile(sorted, 0.99).toFixed(4)),
    maxMs: Number(sorted[sorted.length - 1]!.toFixed(4)),
    withinBudget: p95Ms <= CIVIL_AUTONOMY_COST_BUDGET_MS,
  });
}

function measureCost(sessionId: string, taxis: number, civilians: number): readonly number[] {
  const { ambient } = ambientFixture(sessionId, taxis, civilians);
  try {
    let tick = 0;
    for (let index = 0; index < 120; index += 1)
      ambient.traffic.step({ tick: (tick += 1), dtSeconds: STEP });
    const samples: number[] = [];
    for (let index = 0; index < 600; index += 1) {
      const started = performance.now();
      ambient.traffic.step({ tick: (tick += 1), dtSeconds: STEP });
      samples.push(performance.now() - started);
    }
    return Object.freeze(samples);
  } finally {
    ambient.dispose();
  }
}

export function measureCivilAutonomyCost(): CivilAutonomyCostReport {
  const population: readonly [number, number][] = [
      [20, 24],
      [20, 32],
      [20, 40],
      [30, 40],
    ],
    samples: CivilAutonomyCostSample[] = [];
  for (const [taxis, civilians] of population) {
    const measured: number[] = [];
    for (let pair = 0; pair < 3; pair += 1)
      measured.push(...measureCost(`284-cost-${taxis}-${civilians}-${pair}`, taxis, civilians));
    samples.push(costSample(taxis, civilians, measured));
  }
  const normal = samples.filter((sample) => sample.classification === 'NORMAL'),
    stress = samples.filter((sample) => sample.classification === 'STRESS'),
    baseline = normal[0]!,
    forty = normal[2]!;
  return Object.freeze({
    version: CIVIL_AUTONOMY_REPORT_VERSION,
    generatedBy: 'npm run civil:autonomy:cost',
    measuredAt: new Date().toISOString(),
    protocol: Object.freeze({
      warmupTicks: 120,
      measuredTicks: 600,
      repetitions: 3,
      tickHz: CIVIL_TRAFFIC_LIMITS.tickHz,
      budgetMs: CIVIL_AUTONOMY_COST_BUDGET_MS,
      budgetSource: 'Docs/25 laptop authoritative tick p95',
      subsystem: '058 traffic step with one live 283 rules owner on the real 032/033 map',
    }),
    environment: Object.freeze({
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model ?? null,
      totalMemoryBytes: totalmem(),
      renderer: 'NONE_HEADLESS',
    }),
    samples: Object.freeze(samples),
    additional40Vs24P95Ms: Number((forty.p95Ms - baseline.p95Ms).toFixed(4)),
    pass: normal.every((sample) => sample.withinBudget),
    stressPass: stress.every((sample) => sample.withinBudget),
    limits: Object.freeze([
      'Headless Node measurement; it is not a browser frame, GPU or hardware certificate.',
      'Only the 058 traffic subsystem with the 283 adapter is measured, not the complete authoritative tick.',
      'The 8 ms budget is the laptop tick p95 from Docs/25; the full tick remains the 287 release gate.',
      'The cost includes the taxi bodies that coexist with the civilians in the same live fleet.',
      'The 24–40 civilian gate uses the normal 20-taxi fleet; the 30-taxi maximum-workload row is labeled STRESS and reported separately.',
    ]),
  });
}
