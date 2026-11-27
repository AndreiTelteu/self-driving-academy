import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompositionWorld } from '../../src/app';
import {
  createLiveTelemetry,
  LIVE_TELEMETRY_RAM_BUDGET_BYTES,
  type LiveTelemetry,
  type LiveTelemetryRawInput,
} from '../../src/telemetry';

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '272-live-telemetry',
  worldEpoch: 7,
});

const world = createCompositionWorld();

interface Pose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yawRad: number;
}

function poseOnLane(laneId: string, distanceM: number): Pose {
  const path = world.graph.getDirectedPath(laneId);
  assert.ok(path !== null, `lane ${laneId} has a directed path`);
  let remaining = Math.min(Math.max(distanceM, 0), path.lengthM);
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

function cameraAt(pose: Pose) {
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

interface VehicleOptions {
  readonly laneId: string | null;
  readonly vehicleId?: string;
  readonly driverKind?: 'TAXI' | 'CIVILIAN';
  readonly classId?: 'sedan' | 'compact';
  readonly mode?: 'AUTO' | 'MANUAL' | 'LEARNING';
  readonly position: Pose;
  readonly speedMps: number;
  readonly raw?: LiveTelemetryRawInput;
}

function vehicleTick(tick: number, options: VehicleOptions) {
  const command =
    options.raw === undefined
      ? undefined
      : {
          ...options.raw,
          turnSignal: 'OFF' as const,
          source: 'PLAYER' as const,
        };
  return {
    tick,
    vehicleId: options.vehicleId ?? 'player-272',
    driverKind: options.driverKind ?? 'TAXI',
    classId: options.classId ?? 'sedan',
    controlMode: options.mode ?? 'LEARNING',
    positionM: { x: options.position.x, y: options.position.y, z: options.position.z },
    yawRad: options.position.yawRad,
    speedMps: options.speedMps,
    laneId: options.laneId,
    speedLimitMps: 11.2,
    appliedProfileVersion: 'profile-272@1',
    maneuverState: 'IDLE' as const,
    ...(options.raw === undefined ? {} : { raw: options.raw, command }),
  };
}

function openLearning(live: LiveTelemetry, mode: 'MANUAL' | 'LEARNING' = 'LEARNING'): void {
  live.openSegment({
    segmentId: `segment-${mode.toLowerCase()}`,
    vehicleId: 'player-272',
    classId: 'sedan',
    controlMode: mode,
    profileId: 'profile-272',
    baseVersionId: 'profile-272@1',
    learningEpoch: 3,
    learningEligible: mode === 'LEARNING',
    inputType: 'KEYBOARD',
    startTick: 1,
  });
}

function dispose(live: LiveTelemetry): void {
  try {
    live.dispose();
  } catch {
    // A refused close after a deliberate SHUTDOWN is still a released store.
  }
}

test('272 records 60 Hz player samples and every fleet vehicle with raw/command/speed/lane/class', () => {
  const live = createLiveTelemetry({
    context: CONTEXT,
    playerId: 'player-272',
    map: world.map,
    graph: world.graph,
    capacity: 512,
    worldCapacity: 4096,
  });
  try {
    openLearning(live, 'MANUAL');
    const laneId = 'lane:01E0';
    let distanceM = 30;
    let speedMps = 0;
    for (let tick = 1; tick <= 120; tick += 1) {
      speedMps = Math.min(4, speedMps + 0.02);
      distanceM += speedMps / 60;
      const pose = poseOnLane(laneId, distanceM);
      const raw = {
        throttle: 0.4,
        brake: 0,
        steering: 0.05,
        handbrake: false,
      };
      const other = poseOnLane('lane:02E0', distanceM + 20);
      live.step({
        tick,
        vehicles: [
          vehicleTick(tick, { laneId, position: pose, speedMps, raw, mode: 'MANUAL' }),
          vehicleTick(tick, {
            laneId: 'lane:02E0',
            vehicleId: 'fleet-272',
            driverKind: 'CIVILIAN',
            classId: 'compact',
            mode: 'AUTO',
            position: other,
            speedMps: 3,
          }),
        ],
        camera: cameraAt(pose),
      });
    }
    const stats = live.getStats();
    assert.equal(stats.samplesRecorded, 120);
    assert.equal(stats.samplesRejected, 0);
    assert.equal(stats.worldSamplesRetained, 240);
    assert.equal(stats.worldSamplesWritten, 240);
    const closed = live.readClosedSegment('segment-manual');
    assert.equal(closed, null, 'the segment is still open');
    const read = live.read();
    assert.equal(read.activeSegment?.samples, 120);
    assert.equal(read.activeSegment?.controlMode, 'MANUAL');
    assert.equal(read.evidence.manual.samples, 120);
    assert.equal(read.evidence.manual.learningEligible, false);
    assert.equal(read.evidence.manual.demonstrations, 0);

    const worldSamples = live.readWorldSamples({ limit: 4096 });
    assert.equal(worldSamples.length, 240);
    assert.equal(new Set(worldSamples.map((sample) => sample.vehicleId)).size, 2);
    const player = worldSamples.find((sample) => sample.vehicleId === 'player-272')!;
    assert.equal(player.laneId, laneId);
    assert.equal(player.classId, 'sedan');
    assert.ok(Math.abs(player.rawInput.throttle - 0.4) < 1e-6);
    assert.equal(player.command.source, 'PLAYER');
    assert.ok(player.speedMps > 0);
    const civilian = worldSamples.find((sample) => sample.vehicleId === 'fleet-272')!;
    assert.equal(civilian.classId, 'compact');
    assert.equal(civilian.driverKind, 'CIVILIAN');
    assert.equal(civilian.command.source, 'AUTONOMY');
    assert.equal(civilian.laneId, 'lane:02E0');
  } finally {
    dispose(live);
  }
});

test('272 builds a real STOP opportunity, dedupes id+occurrence and keeps a usable eligible window', () => {
  const live = createLiveTelemetry({
    context: CONTEXT,
    playerId: 'player-272',
    map: world.map,
    graph: world.graph,
    capacity: 512,
  });
  try {
    openLearning(live);
    const laneId = 'lane:01E0';
    let distanceM = 158;
    let speedMps = 2;
    for (let tick = 1; tick <= 300; tick += 1) {
      if (distanceM < 162) {
        speedMps = Math.min(2, speedMps + 0.02);
        distanceM += speedMps / 60;
      } else if (tick <= 180) {
        speedMps = Math.max(0, speedMps - 0.05);
      } else {
        speedMps = Math.min(2, speedMps + 0.02);
        distanceM += speedMps / 60;
      }
      const pose = poseOnLane(laneId, distanceM);
      live.step({
        tick,
        vehicles: [
          vehicleTick(tick, {
            laneId,
            position: pose,
            speedMps,
            raw: { throttle: speedMps > 0 ? 0.2 : 0, brake: 0, steering: 0, handbrake: false },
          }),
        ],
        camera: cameraAt(pose),
      });
    }
    live.closeSegment('RETURN_TO_AUTO');
    const stats = live.getStats();
    const read = live.read();
    const closed = live.readClosedSegment('segment-learning')!;
    assert.equal(stats.samplesRecorded, 300);
    assert.equal(stats.samplesRejected, 0);
    assert.equal(stats.uniqueOccurrences, 1);
    assert.ok(stats.duplicateObservations > 0, 'later frames of the same occurrence are deduped');
    assert.equal(read.opportunities.length, 1);
    assert.equal(read.opportunities[0]!.kind, 'STOP');
    assert.equal(read.opportunities[0]!.state, 'RESOLVED');
    assert.equal(read.opportunities[0]!.outcome, 'STOPPED');
    assert.equal(read.opportunities[0]!.occurrence, 0);
    assert.deepEqual(read.opportunities[0]!.segmentIds, ['segment-learning']);
    assert.equal(closed.summary.samples, 300);
    assert.equal(closed.samples.length, 300);
    assert.equal(closed.eligibleOccurrences, 1);
    assert.equal(closed.demonstrations, 0);
    const window = read.windows[0]!;
    assert.equal(window.kind, 'STOP');
    assert.equal(window.windowClass, 'ELIGIBLE');
    assert.ok(window.observationCount > 1);
    assert.equal(closed.artifactWindow?.artifacts.length ?? 0, 0);
    assert.equal(closed.artifactWindow?.completeness, 'COMPLETE');
  } finally {
    dispose(live);
  }
});

test('272 uses the real signal movement for RED/GREEN opportunities and an observable camera window', () => {
  const live = createLiveTelemetry({
    context: CONTEXT,
    playerId: 'player-272',
    map: world.map,
    graph: world.graph,
    capacity: 512,
  });
  try {
    openLearning(live);
    const laneId = 'lane:02E0';
    let distanceM = 130;
    let speedMps = 0;
    for (let tick = 1; tick <= 300; tick += 1) {
      speedMps = Math.min(3, speedMps + 0.02);
      distanceM += speedMps / 60;
      const pose = poseOnLane(laneId, distanceM);
      live.step({
        tick,
        vehicles: [vehicleTick(tick, { laneId, position: pose, speedMps })],
        camera: cameraAt(pose),
      });
    }
    const read = live.read();
    assert.ok(read.opportunities.length >= 1);
    assert.ok(
      read.opportunities.every((record) => record.kind === 'RED' || record.kind === 'GREEN'),
    );
    assert.ok(read.opportunities.some((record) => record.stimulus.signalId?.startsWith('sig:')));
    const windows = read.windows.filter((window) => window.segmentId === 'segment-learning');
    assert.ok(windows.length >= 1);
    assert.ok(windows.every((window) => window.controlMode === 'LEARNING'));
    assert.ok(windows.every((window) => window.label !== 'AUTO_SEGMENT'));
  } finally {
    dispose(live);
  }
});

test('272 MANUAL stays in metrics but never becomes an eligible demonstration', () => {
  const live = createLiveTelemetry({
    context: CONTEXT,
    playerId: 'player-272',
    map: world.map,
    graph: world.graph,
    capacity: 256,
  });
  try {
    openLearning(live, 'MANUAL');
    const laneId = 'lane:01E0';
    let distanceM = 150;
    let speedMps = 0;
    for (let tick = 1; tick <= 240; tick += 1) {
      if (distanceM < 162) {
        speedMps = Math.min(2, speedMps + 0.02);
        distanceM += speedMps / 60;
      } else {
        speedMps = Math.max(0, speedMps - 0.03);
      }
      const pose = poseOnLane(laneId, distanceM);
      live.step({
        tick,
        vehicles: [vehicleTick(tick, { laneId, position: pose, speedMps, mode: 'MANUAL' })],
        camera: cameraAt(pose),
      });
    }
    live.closeSegment('MODE_CHANGE');
    const read = live.read();
    const closed = live.readClosedSegment('segment-manual')!;
    assert.ok(closed.summary.samples > 0);
    assert.equal(closed.summary.learningEligible, false);
    assert.equal(closed.eligibleOccurrences, 0);
    assert.equal(closed.demonstrations, 0);
    assert.equal(read.evidence.manual.samples, closed.summary.samples);
    assert.equal(read.evidence.manual.demonstrations, 0);
    assert.equal(read.learning.profilePublications, 0);
    assert.equal(read.learning.jobs, 0);
    assert.ok(read.windows.length >= 1);
    assert.ok(read.windows.every((window) => window.label === 'MANUAL_SEGMENT'));
    assert.ok(read.windows.every((window) => window.windowClass === 'EXCLUDED'));
  } finally {
    dispose(live);
  }
});

test('272 pause, focus loss and teleport produce 088 artifacts and exclude ongoing evidence', () => {
  const live = createLiveTelemetry({
    context: CONTEXT,
    playerId: 'player-272',
    map: world.map,
    graph: world.graph,
    capacity: 256,
  });
  try {
    openLearning(live);
    const laneId = 'lane:01E0';
    for (let tick = 1; tick <= 40; tick += 1) {
      const pose = poseOnLane(laneId, 150 + tick * 0.02);
      live.step({
        tick,
        vehicles: [vehicleTick(tick, { laneId, position: pose, speedMps: 1 })],
        camera: cameraAt(pose),
      });
    }
    live.noteSuspension({ tick: 40, cause: 'FOCUS_LOST' });
    live.noteResume(46);
    for (let tick = 46; tick <= 60; tick += 1) {
      const pose = poseOnLane(laneId, 151 + tick * 0.02);
      live.step({
        tick,
        vehicles: [vehicleTick(tick, { laneId, position: pose, speedMps: 1 })],
        camera: cameraAt(pose),
      });
    }
    live.noteRecovery({
      tick: 61,
      vehicleId: 'player-272',
      operationId: 'recovery-272-1',
      status: 'ADMITTED',
      pointId: 'point-272',
      mapId: world.mapId,
      laneId,
      mode: 'LEARNING',
      validatedTick: 61,
    });
    live.closeSegment('SHUTDOWN');
    const read = live.read();
    const closed = live.readClosedSegment('segment-learning')!;
    const artifactWindow = closed.artifactWindow!;
    assert.ok(artifactWindow !== null);
    assert.equal(artifactWindow.windowClass, 'PREFIX_ELIGIBLE');
    assert.equal(artifactWindow.prefix?.fromTick, 1);
    assert.ok((artifactWindow.prefix?.ticks ?? 0) > 0);
    assert.equal(artifactWindow.completeness, 'PARTIAL');
    assert.ok(
      artifactWindow.artifacts.some(
        (artifact) => artifact.kind === 'PAUSE' && artifact.cause === 'SUSPENSION_FOCUS_LOST',
      ),
    );
    assert.ok(
      artifactWindow.artifacts.some(
        (artifact) =>
          artifact.kind === 'TELEPORT' &&
          artifact.cause === 'RECOVERY_TELEPORT' &&
          artifact.operationId === 'recovery-272-1',
      ),
    );
    assert.ok(artifactWindow.artifacts.some((artifact) => artifact.kind === 'INCOMPLETE_SAMPLE'));
    assert.equal(live.getStats().suspensions, 1);
    assert.equal(live.getStats().recoveries, 1);
    assert.equal(read.evidence.profilePublications, 0);
    assert.ok(
      read.windows
        .filter((window) => window.segmentId === 'segment-learning')
        .every((window) => window.windowClass === 'EXCLUDED'),
    );
  } finally {
    dispose(live);
  }
});

test('272 world buffer is bounded, memory is reported and the sample hot path does no JSON', () => {
  const live = createLiveTelemetry({
    context: CONTEXT,
    playerId: 'player-272',
    map: world.map,
    graph: world.graph,
    capacity: 64,
    worldCapacity: 1024,
    dedupeEntries: 64,
  });
  try {
    openLearning(live);
    const offMap = (tick: number) => [
      {
        tick,
        vehicleId: 'off-map-a',
        driverKind: 'TAXI' as const,
        classId: 'sedan' as const,
        controlMode: 'LEARNING' as const,
        positionM: { x: 500000, y: 0, z: 500000 },
        yawRad: 0,
        speedMps: 1,
        laneId: null,
        speedLimitMps: 10,
        appliedProfileVersion: 'profile-272@1',
        maneuverState: 'IDLE' as const,
      },
      {
        tick,
        vehicleId: 'off-map-b',
        driverKind: 'CIVILIAN' as const,
        classId: 'compact' as const,
        controlMode: 'AUTO' as const,
        positionM: { x: 500010, y: 0, z: 500000 },
        yawRad: 0,
        speedMps: 1,
        laneId: null,
        speedLimitMps: 10,
        appliedProfileVersion: 'style-272@1',
        maneuverState: 'IDLE' as const,
      },
    ];
    live.step({ tick: 1, vehicles: offMap(1) });
    const original = JSON.stringify;
    JSON.stringify = () => {
      throw new Error('JSON serialization on the telemetry hot path');
    };
    try {
      for (let tick = 2; tick <= 600; tick += 1) {
        live.step({
          tick,
          vehicles: offMap(tick),
        });
      }
    } finally {
      JSON.stringify = original;
    }
    const stats = live.getStats();
    assert.equal(stats.worldCapacity, 1024);
    assert.equal(stats.worldSamplesRetained, 1024);
    assert.ok(stats.worldSamplesDropped >= 176);
    assert.equal(live.readWorldSamples({ limit: 2048 }).length, 1024);
    assert.equal(stats.memory.budgetBytes, LIVE_TELEMETRY_RAM_BUDGET_BYTES);
    assert.ok(stats.memory.totalBytes > 0);
    assert.ok(stats.memory.totalBytes <= stats.memory.budgetBytes);
    assert.equal(stats.memory.withinBudget, true);
  } finally {
    dispose(live);
  }
});
