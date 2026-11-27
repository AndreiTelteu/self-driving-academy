import { createCityStyleProfile, createLiveLearningPipeline } from '../../src/app';
import type { LiveLearningPipeline, LiveLearningServices } from '../../src/app';
import { createCompositionWorld } from '../../src/app';
import { createLiveTelemetry } from '../../src/telemetry';
import type { LiveTelemetry, LiveTelemetrySegmentRead } from '../../src/telemetry';
import type { DrivingProfile } from '../../src/profiles';
import {
  PIPELINE_BASE_VERSION,
  PIPELINE_ENGINE,
  PIPELINE_PLAYER_ID,
  PIPELINE_PROFILE_ID,
  PIPELINE_SESSION_ID,
  PIPELINE_WORLD_EPOCH,
  createPipelineWorld,
  pipelineSegment,
} from './profile-pipeline-fixture';
import type { PipelineWorld } from './profile-pipeline-fixture';

/**
 * Deterministic live learning fixture: the real 272 telemetry writer, the real 103 queue harness,
 * the real 109 store and the real 110 activation over one map. The only injected pieces are the
 * fixed tick, the physical snapshot and the worker transport (the harness answers with the real 101
 * blend). It never reimplements an estimator or a profile store.
 */
export const LIVE_FIXTURE_CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: PIPELINE_SESSION_ID,
  worldEpoch: PIPELINE_WORLD_EPOCH,
});

export const LIVE_FIXTURE_LANE = 'lane:01E0';
export const LIVE_FIXTURE_LIMIT_MPS = 11.2;

export interface LiveLearningFixtureOptions {
  readonly learningEpoch?: number;
  readonly baseVersionId?: string;
  readonly withModePort?: boolean;
  /** Test-only projection of a real 272 window as ineligible; 085 itself still records LEARNING. */
  readonly ineligibleSegments?: readonly string[];
}

export interface LiveLearningFixture {
  readonly world: ReturnType<typeof createCompositionWorld>;
  readonly telemetry: LiveTelemetry;
  readonly pipelineWorld: PipelineWorld;
  readonly live: LiveLearningPipeline;
  readonly tick: { value: number };
  readonly style: { profile: DrivingProfile };
  readonly physical: { value: string };
  readonly applied: { versionId: string; tick: number }[];
  readonly generation: { baseVersionId: string; learningEpoch: number }[];
  drive(options: DriveOptions): LiveTelemetrySegmentRead;
  advance(times?: number): Promise<void>;
  settle(maxSteps?: number): Promise<void>;
  dispose(): void;
}

export interface DriveOptions {
  readonly segmentId: string;
  readonly mode?: 'MANUAL' | 'LEARNING' | 'AUTO';
  readonly eligible?: boolean;
  readonly learningEpoch?: number;
  readonly profileId?: string;
  readonly baseVersionId?: string;
  readonly ticks?: number;
  readonly startTick?: number;
  readonly startDistanceM?: number;
  readonly speed?: (tick: number, total: number, distanceM: number) => number;
  readonly camera?: boolean;
  readonly laneId?: string;
  readonly closeReason?: 'RETURN_TO_AUTO' | 'MODE_CHANGE' | 'SHUTDOWN';
}

function poseOnLane(
  world: ReturnType<typeof createCompositionWorld>,
  laneId: string,
  distanceM: number,
) {
  const path = world.graph.getDirectedPath(laneId);
  if (path === null) throw new Error(`Missing lane ${laneId}`);
  let remaining = Math.max(0, distanceM);
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const from = path.points[index]!;
    const to = path.points[index + 1]!;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length <= 1e-9) continue;
    if (remaining <= length || index === path.points.length - 2) {
      const fraction = Math.min(1, Math.max(0, remaining / length));
      const headingRad = Math.atan2(to.z - from.z, to.x - from.x);
      return {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
        z: from.z + (to.z - from.z) * fraction,
        yawRad: Math.PI / 2 - headingRad,
      };
    }
    remaining -= length;
  }
  const last = path.points.at(-1)!;
  return { x: last.x, y: last.y, z: last.z, yawRad: 0 };
}

function cameraAt(pose: { x: number; y: number; z: number; yawRad: number }) {
  return {
    positionM: { x: pose.x, y: 1.5, z: pose.z },
    lookAtM: {
      x: pose.x + Math.sin(pose.yawRad) * 10,
      y: 1.2,
      z: pose.z + Math.cos(pose.yawRad) * 10,
    },
    up: { x: 0, y: 1, z: 0 },
    fovRadians: 1.2,
  };
}

export function createLiveLearningFixture(
  options: LiveLearningFixtureOptions = {},
): LiveLearningFixture {
  const world = createCompositionWorld();
  const learningEpoch = options.learningEpoch ?? 1;
  const baseVersionId = options.baseVersionId ?? PIPELINE_BASE_VERSION;
  const style = createCityStyleProfile(PIPELINE_PROFILE_ID, baseVersionId);
  const pipelineWorld = createPipelineWorld({
    baseParameters: style.parameters,
    learningEpoch,
    baseVersionId,
  });
  const telemetry = createLiveTelemetry({
    context: LIVE_FIXTURE_CONTEXT,
    playerId: PIPELINE_PLAYER_ID,
    map: world.map,
    graph: world.graph,
    capacity: 8192,
  });
  const tick = pipelineWorld.tick;
  const ineligible = new Set(options.ineligibleSegments ?? []);
  const telemetryPort =
    ineligible.size === 0
      ? telemetry
      : {
          read() {
            const model = telemetry.read();
            return Object.freeze({
              ...model,
              closedSegments: Object.freeze(
                model.closedSegments.map((summary) =>
                  ineligible.has(summary.segmentId)
                    ? Object.freeze({ ...summary, learningEligible: false })
                    : summary,
                ),
              ),
            });
          },
          readClosedSegment: (segmentId: string) => telemetry.readClosedSegment(segmentId),
        };
  const physical = { value: 'physical-0' };
  const applied: { versionId: string; tick: number }[] = [];
  const generation: { baseVersionId: string; learningEpoch: number }[] = [];
  const styleState = { profile: style };
  const services: LiveLearningServices = {
    context: LIVE_FIXTURE_CONTEXT,
    playerId: PIPELINE_PLAYER_ID,
    profileId: PIPELINE_PROFILE_ID,
    engineVersion: PIPELINE_ENGINE,
    learningEpoch,
    baseVersionId,
    sessionId: PIPELINE_SESSION_ID,
    worldEpoch: PIPELINE_WORLD_EPOCH,
    queue: pipelineWorld.queue.queue,
    store: pipelineWorld.store,
    activation: pipelineWorld.activation,
    telemetry: telemetryPort,
    ...(options.withModePort === false
      ? {}
      : {
          modeSegments: {
            updateGeneration(input: { baseVersionId: string; learningEpoch: number }) {
              generation.push({ ...input });
            },
          },
        }),
    tick: () => tick.value,
    physicalState: () => physical.value,
    onActivated: ({ versionId, profile }) => {
      styleState.profile = profile;
      applied.push({ versionId, tick: tick.value });
    },
  };
  const live = createLiveLearningPipeline(services);
  let nextTick = 1;

  function drive(input: DriveOptions): LiveTelemetrySegmentRead {
    const ticks = input.ticks ?? 1080;
    const startTick = input.startTick ?? nextTick;
    const mode = input.mode ?? 'LEARNING';
    const eligible = input.eligible ?? mode === 'LEARNING';
    const laneId = input.laneId ?? LIVE_FIXTURE_LANE;
    let distance = input.startDistanceM ?? 130;
    const speedAt =
      input.speed ??
      ((_tick: number, total: number) =>
        total < 600 ? 9 : total < 780 ? Math.max(0, 9 - (total - 600) * 0.02) : 2.2);
    telemetry.openSegment({
      segmentId: input.segmentId,
      vehicleId: 'live-player',
      classId: 'sedan',
      controlMode: mode,
      profileId: input.profileId ?? PIPELINE_PROFILE_ID,
      baseVersionId: input.baseVersionId ?? baseVersionId,
      learningEpoch: input.learningEpoch ?? learningEpoch,
      learningEligible: eligible,
      inputType: 'KEYBOARD',
      startTick,
    });
    let speed = 0;
    for (let index = 0; index < ticks; index += 1) {
      const tickValue = startTick + index;
      speed = Math.max(0, speedAt(index, ticks, distance));
      distance += speed / 60;
      const pose = poseOnLane(world, laneId, distance);
      telemetry.step({
        tick: tickValue,
        vehicles: [
          {
            tick: tickValue,
            vehicleId: 'live-player',
            driverKind: 'TAXI',
            classId: 'sedan',
            controlMode: mode,
            positionM: { x: pose.x, y: pose.y, z: pose.z },
            yawRad: pose.yawRad,
            speedMps: speed,
            laneId,
            speedLimitMps: LIVE_FIXTURE_LIMIT_MPS,
            appliedProfileVersion: input.baseVersionId ?? baseVersionId,
            maneuverState: 'IDLE',
            raw: { throttle: 0.4, brake: 0, steering: 0, handbrake: false },
            command: {
              throttle: 0.4,
              brake: 0,
              steering: 0,
              handbrake: false,
              turnSignal: 'OFF',
              source: 'PLAYER',
            },
          },
        ],
        ...(input.camera === false ? {} : { camera: cameraAt(pose) }),
      });
    }
    telemetry.closeSegment(input.closeReason ?? 'MODE_CHANGE');
    nextTick = startTick + ticks + 1;
    return telemetry.readClosedSegment(input.segmentId)!;
  }

  async function advance(times = 1): Promise<void> {
    for (let index = 0; index < times; index += 1) {
      tick.value += 1;
      live.step(tick.value);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  async function settle(maxSteps = 20): Promise<void> {
    for (let step = 0; step < maxSteps; step += 1) {
      await advance(1);
      if (live.read().pendingSegment === null && live.read().pendingActivation === null) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (live.read().pendingSegment === null) return;
      }
    }
  }

  return {
    world,
    telemetry,
    pipelineWorld,
    live,
    tick,
    style: styleState,
    physical,
    applied,
    generation,
    drive,
    advance,
    settle,
    dispose(): void {
      live.dispose();
      telemetry.dispose();
      pipelineWorld.dispose();
    },
  };
}

/** A real 103-shaped job payload for the fixture identity (used by barrier/stale scenarios). */
export function liveFixtureJob(segmentId: string, order: number, learningEpoch = 1) {
  return pipelineSegment({ segmentId, order, learningEpoch });
}
