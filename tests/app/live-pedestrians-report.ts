import { createCompositionWorld } from '../../src/app/composition-world';
import {
  createLivePedestrianHazards,
  planLiveHazardObstacles,
  LIVE_PEDESTRIAN_HAZARDS_VERSION,
} from '../../src/app/live-pedestrian-hazards';
import { evaluateV2ContextScenario, readV2FrameFacets } from '../../src/telemetry';
import {
  createLiveVehiclePhysics,
  type LiveVehicleCommand,
  type LiveVehiclePhysics,
} from '../../src/vehicles';
import { HAZARD_LANE_ID, hazardLane, hazardObstacle, lanePose } from '../world/hazards-fixture';
import { lanePose as pedestrianLanePose, pedestrianTarget } from '../world/pedestrians-fixture';

export const LIVE_PEDESTRIANS_REPORT_VERSION = '286-live-pedestrians-report-v1' as const;
const GENERATED_AT = '2026-11-28T00:00:00.000Z';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '286-live-pedestrians-report',
  worldEpoch: 1,
});

interface Check {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

interface YieldRun {
  readonly network: Readonly<{
    mapId: string;
    crosswalks: number;
    links: number;
    refusedLinks: number;
    pedestriansRequested: number;
    pedestriansCreated: number;
    crossingLengthM: Readonly<{ min: number; max: number; mean: number }> | null;
  }>;
  readonly phase: Readonly<{
    crossingsStarted: number;
    crossingsCompleted: number;
    gapCrossings: number;
    assertedCrossings: number;
    yieldedCrossings: number;
    unobservedCrossings: number;
    freeCrossings: number;
  }>;
  readonly conflictTick: number | null;
  readonly stopTick: number | null;
  readonly stopDistanceM: number | null;
  readonly minDistanceM: number | null;
  readonly stopSpeedMps: number | null;
  readonly outcome: string | null;
  readonly stopsDuringCrossing: number;
  readonly conflictCount: number;
  readonly stopCount: number;
  readonly stopEvents: number;
  readonly yieldStopEvents: number;
  readonly yieldRateStatus: string;
  readonly yieldRateValue: number | null;
  readonly coverageCompleteSteps: number;
  readonly coverageIncompleteSteps: number;
  readonly v2Frames: number;
  readonly v2Keys: readonly string[];
  readonly v2Facets: readonly string[];
  readonly gaps: readonly string[];
}

async function runYield(observable: boolean): Promise<YieldRun> {
  const world = createCompositionWorld();
  const physics = await createLiveVehiclePhysics({ context: CONTEXT, initialTick: 0 });
  const live = createLivePedestrianHazards({
    context: CONTEXT,
    map: world.map,
    graph: world.graph,
    seed: 286,
    physics,
    maxPedestrians: 96,
    observableVehicle: () => observable,
  });
  const target = pedestrianTarget(live.getLinks());
  const pose = pedestrianLanePose(target.graph, target.laneId, target.longitudinalM - 35);
  physics.registerVehicle({
    vehicleId: 'yield-car',
    classId: 'sedan',
    positionM: pose.positionM,
    yawRad: Math.PI / 2 - pose.headingRad,
    speedMps: 5,
    access: 'CIVIL',
    isTraffic: false,
  });
  let last = physics.readVehicle('yield-car');
  let speed = 5;
  try {
    for (let tick = 1; tick <= 900; tick += 1) {
      const base: LiveVehicleCommand = {
        vehicleId: 'yield-car',
        source: 'AUTONOMY',
        throttle: speed > 6.5 ? 0 : 0.35,
        brake: 0,
        steering: 0,
        handbrake: false,
        turnSignal: 'OFF',
      };
      const command =
        last === null
          ? base
          : live.adjustCommand('yield-car', base, {
              tick,
              speedMps: Math.abs(last.speedMps),
              positionM: last.positionM,
              yawRad: last.yawRad,
            });
      const frame = physics.step({ tick, commands: [command], traffic: [], measure: true });
      last = physics.readVehicle('yield-car');
      if (last === null) throw new Error('Yield car vanished');
      speed = Math.abs(last.speedMps);
      live.observe({
        tick,
        vehicles: [
          {
            vehicleId: 'yield-car',
            driverKind: 'CIVILIAN',
            classId: 'sedan',
            controlMode: 'AUTO',
            positionM: last.positionM,
            yawRad: last.yawRad,
            speedMps: speed,
            speedLimitMps: 8,
            laneId: target.laneId,
            blocked: false,
            maneuverState: 'IDLE',
          },
        ],
        commands: [command],
        incidents: frame.collisions.incidents > 0 ? physics.readIncidents() : [],
        vehiclesComplete: true,
      });
    }
    const stops = live.getStops();
    const crossingStop = stops.find((entry) => entry.duringCrossing) ?? null;
    const conflicts = live.getConflicts();
    const conflict =
      crossingStop === null
        ? (conflicts.find((entry) => entry.outcome === 'YIELDED') ?? null)
        : (conflicts.find((entry) => entry.stopTick === crossingStop.tick) ?? null);
    const network = live.getNetwork();
    const inspection = live.getPedestrianInspection();
    const scenario = live.getV2Scenario();
    const evaluation = scenario === null ? null : evaluateV2ContextScenario(scenario);
    return {
      network: Object.freeze({
        mapId: network.mapId,
        crosswalks: network.crosswalks,
        links: network.links,
        refusedLinks: network.refusedLinks.length,
        pedestriansRequested: network.pedestriansRequested,
        pedestriansCreated: network.pedestriansCreated,
        crossingLengthM: network.crossingLengthM,
      }),
      phase: Object.freeze({
        crossingsStarted: inspection.counts.crossingsStarted,
        crossingsCompleted: inspection.counts.crossingsCompleted,
        gapCrossings: inspection.counts.gapCrossings,
        assertedCrossings: inspection.counts.assertedCrossings,
        yieldedCrossings: inspection.counts.yieldedCrossings,
        unobservedCrossings: inspection.counts.unobservedCrossings,
        freeCrossings: inspection.counts.freeCrossings,
      }),
      conflictTick: conflict?.tick ?? null,
      stopTick: crossingStop?.tick ?? null,
      stopDistanceM: conflict?.stopDistanceM ?? null,
      minDistanceM: conflict?.minimumDistanceM ?? null,
      stopSpeedMps: crossingStop?.speedMps ?? null,
      outcome: conflict?.outcome ?? null,
      stopsDuringCrossing: stops.filter((entry) => entry.duringCrossing).length,
      conflictCount: conflicts.length,
      stopCount: stops.length,
      stopEvents: inspection.counts.stopEvents,
      yieldStopEvents: inspection.counts.yieldStopEvents,
      yieldRateStatus: inspection.denominators.yieldRate.status,
      yieldRateValue: inspection.denominators.yieldRate.value,
      coverageCompleteSteps: inspection.coverage.completeSteps,
      coverageIncompleteSteps: inspection.coverage.incompleteSteps,
      v2Frames: scenario?.frames.length ?? 0,
      v2Keys: evaluation?.keys.filter((key) => key.observable).map((key) => key.key) ?? [],
      v2Facets: Object.freeze([
        ...new Set(scenario?.frames.flatMap((frame) => [...readV2FrameFacets(frame)]) ?? []),
      ]),
      gaps: Object.freeze(inspection.gaps.map((gap) => gap.id)),
    };
  } finally {
    live.dispose();
    physics.dispose();
  }
}

interface ObstacleRun {
  readonly physicalAdded: number;
  readonly physicalActive: number;
  readonly outcome: string;
  readonly contactTick: number | null;
  readonly minimumDistanceM: number;
  readonly reactionTick: number | null;
  readonly latencyTicks: number | null;
  readonly reactionHook: string | null;
  readonly incidents: number;
}

async function runObstacle(): Promise<ObstacleRun> {
  const world = createCompositionWorld();
  const lane = hazardLane();
  const pose = lanePose(lane.graph, HAZARD_LANE_ID, 60);
  const physics: LiveVehiclePhysics = await createLiveVehiclePhysics({
    context: CONTEXT,
    initialTick: 0,
  });
  const live = createLivePedestrianHazards({
    context: CONTEXT,
    map: world.map,
    graph: world.graph,
    seed: 286,
    physics,
    maxPedestrians: 4,
    obstacles: [hazardObstacle({ distanceM: 100, type: 'BARRIER' })],
  });
  physics.registerVehicle({
    vehicleId: 'obstacle-car',
    classId: 'sedan',
    positionM: pose.positionM,
    yawRad: Math.PI / 2 - pose.headingRad,
    speedMps: 6,
    access: 'CIVIL',
    isTraffic: false,
  });
  let last = physics.readVehicle('obstacle-car');
  let minimumDistance = Infinity;
  try {
    for (let tick = 1; tick <= 400; tick += 1) {
      if (last === null) throw new Error('Obstacle car vanished');
      const base: LiveVehicleCommand = {
        vehicleId: 'obstacle-car',
        source: 'AUTONOMY',
        throttle: Math.abs(last.speedMps) > 5.5 ? 0 : 0.3,
        brake: 0,
        steering: 0,
        handbrake: false,
        turnSignal: 'OFF',
      };
      const command = live.adjustCommand('obstacle-car', base, {
        tick,
        speedMps: Math.abs(last.speedMps),
        positionM: last.positionM,
        yawRad: last.yawRad,
      });
      const frame = physics.step({ tick, commands: [command], traffic: [], measure: true });
      last = physics.readVehicle('obstacle-car');
      if (last === null) throw new Error('Obstacle car vanished');
      const obstacle = live.getHazardObstacles()[0]!;
      minimumDistance = Math.min(
        minimumDistance,
        Math.hypot(
          last.positionM.x - obstacle.positionM.x,
          last.positionM.z - obstacle.positionM.z,
        ),
      );
      live.observe({
        tick,
        vehicles: [
          {
            vehicleId: 'obstacle-car',
            driverKind: 'CIVILIAN',
            classId: 'sedan',
            controlMode: 'AUTO',
            positionM: last.positionM,
            yawRad: last.yawRad,
            speedMps: Math.abs(last.speedMps),
            speedLimitMps: 8,
            laneId: HAZARD_LANE_ID,
            blocked: false,
            maneuverState: 'IDLE',
          },
        ],
        commands: [command],
        incidents: frame.collisions.incidents > 0 ? physics.readIncidents() : [],
        vehiclesComplete: true,
      });
      const encounter = live.getHazardEncounters()[0];
      if (encounter !== undefined && encounter.outcome !== 'PENDING') break;
    }
    const stats = physics.getStats().obstacles;
    const encounter = live.getHazardEncounters()[0]!;
    const reaction = live.getHazardReactions()[0] ?? null;
    return {
      physicalAdded: stats.added,
      physicalActive: stats.active,
      outcome: encounter.outcome,
      contactTick: encounter.contactTick,
      minimumDistanceM: minimumDistance,
      reactionTick: reaction?.tick ?? null,
      latencyTicks: reaction?.latencyTicks ?? null,
      reactionHook: reaction?.hook ?? null,
      incidents: physics.readIncidents().length,
    };
  } finally {
    live.dispose();
    physics.dispose();
  }
}

interface CostRun {
  readonly pedestrians: number;
  readonly hazards: number;
  readonly steps: number;
  readonly pedestrianEvaluations: number;
  readonly hazardEvaluations: number;
  readonly peakPedestriansPerStep: number;
  readonly peakHazardsPerStep: number;
}

function runCost(): CostRun {
  const world = createCompositionWorld();
  const obstacles = planLiveHazardObstacles(world.graph, {
    laneIds: world.map.lanes.map((lane) => lane.id),
    count: 96,
    distanceM: 45,
  });
  const live = createLivePedestrianHazards({
    context: CONTEXT,
    map: world.map,
    graph: world.graph,
    seed: 286,
    maxPedestrians: 96,
    obstacles,
  });
  try {
    const lane = world.map.lanes[0]!;
    const path = world.graph.getDirectedPath(lane.id);
    const pose = pedestrianLanePose(world.graph, lane.id, Math.min(20, (path?.lengthM ?? 20) / 2));
    for (let tick = 1; tick <= 600; tick += 1) {
      live.observe({
        tick,
        vehicles: [
          {
            vehicleId: 'cost-car',
            driverKind: 'CIVILIAN',
            classId: 'sedan',
            controlMode: 'AUTO',
            positionM: pose.positionM,
            yawRad: Math.PI / 2 - pose.headingRad,
            speedMps: 5,
            speedLimitMps: 8,
            laneId: lane.id,
            blocked: false,
            maneuverState: 'IDLE',
          },
        ],
        commands: [],
        incidents: [],
        vehiclesComplete: true,
      });
    }
    const stats = live.getStats();
    return {
      pedestrians: stats.pedestrians.pedestrians,
      hazards: stats.hazards.obstacles,
      steps: stats.stepCost.samples,
      pedestrianEvaluations: stats.evaluationCost.pedestrianEvaluations,
      hazardEvaluations: stats.evaluationCost.hazardEvaluations,
      peakPedestriansPerStep: stats.pedestrians.evaluationCost.peakPedestriansPerStep,
      peakHazardsPerStep: stats.evaluationCost.peakHazardsPerStep,
    };
  } finally {
    live.dispose();
  }
}

export async function runLivePedestriansReport() {
  const checks: Check[] = [];
  const check = (id: string, pass: boolean, detail: string) => {
    checks.push(Object.freeze({ id, pass, detail }));
  };
  const cost = runCost();
  // One Rapier world at a time: each deterministic scenario is fully disposed before the next.
  const yielded = await runYield(true);
  const unobserved = await runYield(false);
  const obstacle = await runObstacle();

  check(
    'network-real-crosswalks',
    yielded.network.crosswalks === 80 &&
      yielded.network.links > 0 &&
      yielded.network.pedestriansCreated === 96,
    `${yielded.network.links} links on ${yielded.network.crosswalks} crosswalks, ${yielded.network.pedestriansCreated} pedestrians`,
  );
  check(
    'crossing-phase',
    yielded.phase.crossingsStarted > 0 && yielded.phase.crossingsCompleted > 0,
    `${yielded.phase.crossingsStarted} started, ${yielded.phase.crossingsCompleted} completed`,
  );
  check(
    'yield-real-tick-order',
    yielded.conflictTick !== null &&
      yielded.stopTick !== null &&
      yielded.stopTick > yielded.conflictTick &&
      yielded.stopsDuringCrossing > 0 &&
      yielded.outcome === 'YIELDED',
    `conflict tick ${yielded.conflictTick}, stop tick ${yielded.stopTick}, outcome ${yielded.outcome}`,
  );
  check(
    'yield-real-physics-distance',
    yielded.stopDistanceM !== null &&
      yielded.minDistanceM !== null &&
      yielded.stopDistanceM > 0 &&
      yielded.minDistanceM <= yielded.stopDistanceM + 1e-6,
    `stop ${yielded.stopDistanceM?.toFixed(2)} m, minimum ${yielded.minDistanceM?.toFixed(2)} m`,
  );
  check(
    'unobserved-no-yield',
    unobserved.stopEvents === 0 &&
      unobserved.phase.yieldedCrossings === 0 &&
      unobserved.phase.unobservedCrossings > 0 &&
      unobserved.yieldRateStatus === 'MISSING',
    `${unobserved.phase.unobservedCrossings} unobserved crossings, stop events ${unobserved.stopEvents}`,
  );
  check(
    'obstacle-same-physics',
    obstacle.physicalAdded === 1 &&
      obstacle.physicalActive === 1 &&
      obstacle.incidents === 0 &&
      (obstacle.outcome === 'PASSED_CLEAR' || obstacle.outcome === 'STOPPED'),
    `box added ${obstacle.physicalAdded}, outcome ${obstacle.outcome}, incidents ${obstacle.incidents}`,
  );
  check(
    'obstacle-reaction-and-avoidance',
    obstacle.reactionTick !== null &&
      obstacle.latencyTicks !== null &&
      obstacle.latencyTicks >= 1 &&
      obstacle.minimumDistanceM > 1.5 &&
      obstacle.contactTick === null,
    `reaction ${obstacle.reactionHook} +${obstacle.latencyTicks} ticks, clearance ${obstacle.minimumDistanceM.toFixed(2)} m, contact ${obstacle.contactTick ?? 'none'}`,
  );
  check(
    'v2-context-live',
    yielded.v2Keys.includes('pedestrian_yield_probability') &&
      yielded.v2Keys.includes('hazard_reaction_delay') &&
      yielded.v2Facets.includes('PEDESTRIAN') &&
      yielded.v2Facets.includes('BRAKE_INPUT'),
    `${yielded.v2Keys.length} observable keys, pedestrian ${yielded.v2Facets.includes('PEDESTRIAN')}, brake ${yielded.v2Facets.includes('BRAKE_INPUT')}`,
  );
  check(
    'cost-96-pedestrians-96-hazards',
    cost.pedestrians === 96 &&
      cost.hazards === 96 &&
      cost.steps > 0 &&
      cost.pedestrianEvaluations > 0 &&
      cost.hazardEvaluations > 0 &&
      cost.peakPedestriansPerStep >= 96 &&
      cost.peakHazardsPerStep >= 96,
    `${cost.pedestrians} pedestrians, ${cost.hazards} hazards, ${cost.pedestrianEvaluations} pedestrian / ${cost.hazardEvaluations} hazard evaluations`,
  );

  const failures = checks.filter((entry) => !entry.pass);
  return Object.freeze({
    version: LIVE_PEDESTRIANS_REPORT_VERSION,
    generatedAt: GENERATED_AT,
    contract: LIVE_PEDESTRIAN_HAZARDS_VERSION,
    level: 'V2',
    summary: Object.freeze({
      total: checks.length,
      pass: checks.length - failures.length,
      fail: failures.length,
    }),
    network: yielded.network,
    phase: yielded.phase,
    yield: Object.freeze({
      conflictTick: yielded.conflictTick,
      stopTick: yielded.stopTick,
      stopDistanceM: yielded.stopDistanceM,
      minimumDistanceM: yielded.minDistanceM,
      stopSpeedMps: yielded.stopSpeedMps,
      outcome: yielded.outcome,
      stopsDuringCrossing: yielded.stopsDuringCrossing,
      conflictCount: yielded.conflictCount,
      stopCount: yielded.stopCount,
      stopEvents: yielded.stopEvents,
      yieldStopEvents: yielded.yieldStopEvents,
      yieldRate: Object.freeze({
        status: yielded.yieldRateStatus,
        value: yielded.yieldRateValue,
      }),
      coverage: Object.freeze({
        complete: yielded.coverageCompleteSteps,
        incomplete: yielded.coverageIncompleteSteps,
      }),
    }),
    unobserved: Object.freeze({
      stopEvents: unobserved.stopEvents,
      yieldedCrossings: unobserved.phase.yieldedCrossings,
      unobservedCrossings: unobserved.phase.unobservedCrossings,
      yieldRate: unobserved.yieldRateStatus,
      coverageIncomplete: unobserved.coverageIncompleteSteps,
      gaps: unobserved.gaps,
    }),
    obstacle,
    v2: Object.freeze({
      frames: yielded.v2Frames,
      observableKeys: yielded.v2Keys,
      facets: yielded.v2Facets,
    }),
    cost: Object.freeze(cost),
    checks: Object.freeze(checks),
    limitations: Object.freeze([
      '32 of the 80 authored crosswalks have no derived sidewalk at both ends; the 164 contract refuses them and the report keeps that gap instead of approximating a link.',
      'A pedestrian has no native Rapier collider in 282, so a vehicle-pedestrian impact is not invented in this report; the 164 contact channel remains available to the collision owner when it exists.',
      'The physical hazard window is bounded by the 028 registry: only free named-box slots are added; the cost probe uses the 96 data obstacles without creating 96 native boxes.',
      'The browser probe renders the real composition and the real Rapier world without claiming FPS, GPU cost or heap; those remain outside this report.',
    ]),
  });
}
