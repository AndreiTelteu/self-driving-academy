import { createCompositionWorld } from '../../src/app/composition-world';
import {
  createLivePedestrianHazards,
  planLiveHazardObstacles,
  LIVE_PEDESTRIAN_HAZARDS_VERSION,
} from '../../src/app/live-pedestrian-hazards';
import { lanePose } from '../world/pedestrians-fixture';

/**
 * PBI 286 cost probe: the real 164 population (96 pedestrians) and the real 165 hazard set
 * (96 data obstacles) over one scripted vehicle. It reports the software step cost only; FPS, GPU
 * time and the native Rapier cost stay with their own owners.
 */
export const LIVE_PEDESTRIANS_COST_VERSION = '286-live-pedestrians-cost-v1' as const;
const GENERATED_AT = '2026-11-28T00:00:00.000Z';
const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '286-live-pedestrians-cost',
  worldEpoch: 1,
});

export function runLivePedestriansCost(steps = 1200) {
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
    const pose = lanePose(world.graph, lane.id, Math.min(20, (path?.lengthM ?? 20) / 2));
    const before = process.memoryUsage().heapUsed;
    const started = performance.now();
    for (let tick = 1; tick <= steps; tick += 1) {
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
    const elapsedMs = performance.now() - started;
    if (typeof globalThis.gc === 'function') globalThis.gc();
    const after = process.memoryUsage().heapUsed;
    const stats = live.getStats();
    const samples = stats.stepCost;
    return Object.freeze({
      version: LIVE_PEDESTRIANS_COST_VERSION,
      generatedAt: GENERATED_AT,
      contract: LIVE_PEDESTRIAN_HAZARDS_VERSION,
      pedestrians: stats.pedestrians.pedestrians,
      hazards: stats.hazards.obstacles,
      steps: samples.samples,
      wallMs: elapsedMs,
      perStepMs: Object.freeze({
        mean: samples.meanMs,
        p50: samples.p50Ms,
        p95: samples.p95Ms,
        max: samples.maxMs,
      }),
      evaluationCost: Object.freeze({
        pedestrianEvaluations: stats.evaluationCost.pedestrianEvaluations,
        hazardEvaluations: stats.evaluationCost.hazardEvaluations,
        peakPedestriansPerStep: stats.pedestrians.evaluationCost.peakPedestriansPerStep,
        peakHazardsPerStep: stats.evaluationCost.peakHazardsPerStep,
      }),
      heap: Object.freeze({
        beforeBytes: before,
        usedBytes: after,
        gc: typeof globalThis.gc === 'function',
      }),
    });
  } finally {
    live.dispose();
  }
}
