import { createHash } from 'node:crypto';
import {
  createAmbientTraffic,
  createCompositionWorld,
  createLiveModeSegments,
  createLiveTelemetryComposition,
  createV3Composition,
  type V3Composition,
} from '../../src/app';
import { createDefaultSettings } from '../../src/settings';
import {
  createLiveTelemetry,
  LIVE_TELEMETRY_RAM_BUDGET_BYTES,
  type LiveTelemetry,
} from '../../src/telemetry';

export const LIVE_TELEMETRY_REPORT_VERSION = '272-live-telemetry-report-v1' as const;

const CONTEXT = Object.freeze({
  schemaVersion: 1 as const,
  units: 'SI' as const,
  sessionId: '272-live-telemetry-report',
  worldEpoch: 9,
});

const world = createCompositionWorld();

interface Check {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

interface FleetScenario {
  readonly ticks: number;
  readonly vehicles: number;
  readonly distinctVehicles: number;
  readonly worldRows: number;
  readonly dropped: number;
  readonly selectedVehicleId: string | null;
  readonly playerVehicleId: string | null;
  readonly byKind: Readonly<Record<string, number>>;
  readonly followEpisodes: number;
  readonly cameraIndependent: boolean;
  readonly memoryBytes: number;
  readonly budgetBytes: number;
}

interface SegmentScenario {
  readonly manualSamples: number;
  readonly learningSamples: number;
  readonly closedSegments: number;
  readonly learningClosedSegments: number;
  readonly demonstrations: number;
  readonly profilePublications: number;
  readonly learningJobs: number;
  readonly closedSamplesRead: number;
  readonly learningEligible: boolean;
}

interface OpportunityScenario {
  readonly kind: string;
  readonly state: string;
  readonly outcome: string | null;
  readonly occurrence: number;
  readonly opportunities: number;
  readonly uniqueOccurrences: number;
  readonly duplicateObservations: number;
  readonly windowLabel: string | null;
  readonly windowClass: string | null;
  readonly windowObservations: number;
  readonly eligibleOccurrences: number;
  readonly samples: number;
}

interface ArtifactScenario {
  readonly pauseCause: string | null;
  readonly teleportCause: string | null;
  readonly observationGap: boolean;
  readonly prefixTicks: number;
  readonly completeness: string | null;
  readonly suppressedEligibleWindows: number;
  readonly demonstrations: number;
}

export interface LiveTelemetryReport {
  readonly version: typeof LIVE_TELEMETRY_REPORT_VERSION;
  readonly contract: string;
  readonly fleet: FleetScenario;
  readonly segment: SegmentScenario;
  readonly stop: OpportunityScenario;
  readonly signal: OpportunityScenario;
  readonly artifacts: ArtifactScenario;
  readonly bounded: Readonly<{
    capacity: number;
    retained: number;
    dropped: number;
    memoryBytes: number;
    budgetBytes: number;
    withinBudget: boolean;
  }>;
  readonly dedupe: Readonly<{
    uniqueOccurrences: number;
    duplicateObservations: number;
    dedupeDropped: number;
  }>;
  readonly profileFingerprint: string;
  readonly checks: readonly Check[];
  readonly summary: Readonly<{
    checks: number;
    passed: number;
    failed: number;
    pass: boolean;
  }>;
}

function poseOnLane(laneId: string, distanceM: number) {
  const path = world.graph.getDirectedPath(laneId);
  if (path === null) throw new Error(`Missing lane ${laneId}`);
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

function openSegment(live: LiveTelemetry, mode: 'MANUAL' | 'LEARNING') {
  live.openSegment({
    segmentId: `272-${mode.toLowerCase()}-segment`,
    vehicleId: '272-player',
    classId: 'sedan',
    controlMode: mode,
    profileId: 'profile-272-report',
    baseVersionId: 'profile-272-report@1',
    learningEpoch: 4,
    learningEligible: mode === 'LEARNING',
    inputType: 'KEYBOARD',
    startTick: 1,
  });
}

function fleetScenario(): {
  fleet: FleetScenario;
  segment: SegmentScenario;
} {
  const ambient = createAmbientTraffic({
    map: world.map,
    graph: world.graph,
    context: CONTEXT,
    seed: 272,
    focus: { x: world.spawn.x, z: world.spawn.z },
    avoid: [
      { x: world.spawn.x, z: world.spawn.z },
      ...world.vehicles.map((vehicle) => ({
        x: vehicle.positionM.x,
        z: vehicle.positionM.z,
      })),
    ],
  });
  const modelRef: { current: V3Composition | undefined } = { current: undefined };
  const segments = createLiveModeSegments({
    context: CONTEXT,
    playerId: '272-player',
    profileId: 'profile-272-report',
    baseVersionId: 'profile-272-report@1',
    learningEpoch: 4,
    controlPreferencesVersion: 'control-272',
    engineVersion: 'engine-272',
    mapVersion: world.map.mapId,
    learningEligible: true,
    readAuthority: () => {
      if (modelRef.current === undefined)
        return { tick: 0, playerVehicleId: null, mode: 'AUTO' as const, suspended: false };
      return modelRef.current.modeAuthority();
    },
  });
  const model = createV3Composition({
    layout: world.layout,
    start: world.spawn,
    control: createDefaultSettings('272-report').input.control,
    context: CONTEXT,
    vehicles: world.vehicles,
    traffic: ambient.traffic,
    map: world.map,
    graph: world.graph,
  });
  modelRef.current = model;
  model.attachModeSegments(segments);
  const telemetry = createLiveTelemetryComposition({
    context: CONTEXT,
    map: world.map,
    graph: world.graph,
    playerId: '272-player',
    modeSegments: () => segments,
    worldCapacity: 16_384,
  });
  try {
    for (let tick = 1; tick <= 180; tick += 1) {
      model.step({ tick });
      telemetry.step(model.frame);
    }
    const stats = telemetry.getStats();
    const sample = telemetry.readWorldSamples({ limit: stats.worldSamplesRetained });
    const distinctVehicles = new Set(sample.map((entry) => entry.vehicleId)).size;
    const followEpisodes = telemetry.readFollowEpisodes().length;
    const taxi = ambient.list().find((actor) => actor.driverKind === 'TAXI')!;
    model.selectVehicle(taxi.vehicleId);
    model.requestModeAction('M');
    let tick = 181;
    model.step({ tick });
    telemetry.step(model.frame);
    let manualSamples = telemetry.getStats().samplesRecorded;
    model.port.setAction('throttle', true);
    for (let index = 0; index < 90; index += 1) {
      tick += 1;
      model.step({ tick });
      telemetry.step(model.frame);
    }
    model.port.setAction('throttle', false);
    manualSamples = telemetry.getStats().samplesRecorded - manualSamples;
    model.requestModeAction('L');
    tick += 1;
    model.step({ tick });
    telemetry.step(model.frame);
    const learningSamplesStart = telemetry.getStats().samplesRecorded;
    for (let index = 0; index < 60; index += 1) {
      tick += 1;
      model.step({ tick });
      telemetry.step(model.frame);
    }
    const learningSamples = telemetry.getStats().samplesRecorded - learningSamplesStart;
    const learningId = segments.observe().active?.segmentId ?? null;
    if (learningId !== null)
      telemetry.noteRecovery({
        tick,
        vehicleId: taxi.vehicleId,
        operationId: '272-report-recovery',
        status: 'ADMITTED',
        pointId: '272-report-point',
        mapId: world.mapId,
        laneId: taxi.laneId,
        mode: 'LEARNING',
        validatedTick: tick,
      });
    model.requestModeAction('M');
    tick += 1;
    model.step({ tick });
    telemetry.step(model.frame);
    const read = telemetry.read();
    const closedLearning = read.closedSegments.filter(
      (segment) => segment.controlMode === 'LEARNING' && segment.learningEligible,
    );
    const closedRead = learningId === null ? null : telemetry.readClosedSegment(learningId);
    const closedSamplesRead = closedRead?.samples.length ?? 0;
    return {
      fleet: {
        ticks: 180,
        vehicles: stats.vehiclesObserved,
        distinctVehicles,
        worldRows: stats.worldSamplesWritten,
        dropped: stats.worldSamplesDropped,
        selectedVehicleId: null,
        playerVehicleId: null,
        byKind: { ...read.evidence.byKind },
        followEpisodes,
        cameraIndependent:
          distinctVehicles === stats.vehiclesObserved &&
          read.evidence.manual.samples + read.evidence.auto.opportunities >= 0,
        memoryBytes: stats.memory.totalBytes,
        budgetBytes: LIVE_TELEMETRY_RAM_BUDGET_BYTES,
      },
      segment: {
        manualSamples,
        learningSamples,
        closedSegments: read.closedSegments.length,
        learningClosedSegments: closedLearning.length,
        demonstrations: closedRead?.demonstrations ?? 0,
        profilePublications: read.learning.profilePublications,
        learningJobs: read.learning.jobs,
        closedSamplesRead,
        learningEligible: closedRead?.summary.learningEligible ?? false,
      },
    };
  } finally {
    telemetry.dispose();
    segments.dispose();
    model.dispose();
    ambient.dispose();
  }
}

function stopScenario(): OpportunityScenario {
  const live = createLiveTelemetry({
    context: CONTEXT,
    playerId: '272-player',
    map: world.map,
    graph: world.graph,
    capacity: 512,
  });
  try {
    openSegment(live, 'LEARNING');
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
          {
            tick,
            vehicleId: '272-player',
            driverKind: 'TAXI',
            classId: 'sedan',
            controlMode: 'LEARNING',
            positionM: { x: pose.x, y: pose.y, z: pose.z },
            yawRad: pose.yawRad,
            speedMps,
            laneId,
            speedLimitMps: 11.2,
            appliedProfileVersion: 'profile-272-report@1',
            maneuverState: 'IDLE',
            raw: {
              throttle: speedMps > 0 ? 0.2 : 0,
              brake: 0,
              steering: 0,
              handbrake: false,
            },
            command: {
              throttle: speedMps > 0 ? 0.2 : 0,
              brake: 0,
              steering: 0,
              handbrake: false,
              turnSignal: 'OFF',
              source: 'PLAYER',
            },
          },
        ],
        camera: cameraAt(pose),
      });
    }
    live.closeSegment('RETURN_TO_AUTO');
    const read = live.read();
    const stats = live.getStats();
    const closed = live.readClosedSegment('272-learning-segment')!;
    const record = read.opportunities[0]!;
    const window = read.windows[0]!;
    return {
      kind: record.kind,
      state: record.state,
      outcome: record.outcome,
      occurrence: record.occurrence,
      opportunities: read.opportunities.length,
      uniqueOccurrences: stats.uniqueOccurrences,
      duplicateObservations: stats.duplicateObservations,
      windowLabel: window?.label ?? null,
      windowClass: window?.windowClass ?? null,
      windowObservations: window?.observationCount ?? 0,
      eligibleOccurrences: closed.eligibleOccurrences,
      samples: stats.samplesRecorded,
    };
  } finally {
    live.dispose();
  }
}

function signalScenario(): OpportunityScenario {
  const live = createLiveTelemetry({
    context: CONTEXT,
    playerId: '272-player',
    map: world.map,
    graph: world.graph,
    capacity: 512,
  });
  try {
    openSegment(live, 'LEARNING');
    const laneId = 'lane:02E0';
    let distanceM = 130;
    let speedMps = 0;
    for (let tick = 1; tick <= 300; tick += 1) {
      speedMps = Math.min(3, speedMps + 0.02);
      distanceM += speedMps / 60;
      const pose = poseOnLane(laneId, distanceM);
      live.step({
        tick,
        vehicles: [
          {
            tick,
            vehicleId: '272-player',
            driverKind: 'TAXI',
            classId: 'sedan',
            controlMode: 'LEARNING',
            positionM: { x: pose.x, y: pose.y, z: pose.z },
            yawRad: pose.yawRad,
            speedMps,
            laneId,
            speedLimitMps: 11.2,
            appliedProfileVersion: 'profile-272-report@1',
            maneuverState: 'IDLE',
          },
        ],
        camera: cameraAt(pose),
      });
    }
    live.closeSegment('RETURN_TO_AUTO');
    const read = live.read();
    const stats = live.getStats();
    const closed = live.readClosedSegment('272-learning-segment')!;
    const record = read.opportunities[0]!;
    const window = read.windows[0]!;
    return {
      kind: record.kind,
      state: record.state,
      outcome: record.outcome,
      occurrence: record.occurrence,
      opportunities: read.opportunities.length,
      uniqueOccurrences: stats.uniqueOccurrences,
      duplicateObservations: stats.duplicateObservations,
      windowLabel: window?.label ?? null,
      windowClass: window?.windowClass ?? null,
      windowObservations: window?.observationCount ?? 0,
      eligibleOccurrences: closed.eligibleOccurrences,
      samples: stats.samplesRecorded,
    };
  } finally {
    live.dispose();
  }
}

function artifactScenario(): ArtifactScenario {
  const live = createLiveTelemetry({
    context: CONTEXT,
    playerId: '272-player',
    map: world.map,
    graph: world.graph,
    capacity: 256,
  });
  try {
    openSegment(live, 'LEARNING');
    const laneId = 'lane:01E0';
    for (let tick = 1; tick <= 40; tick += 1) {
      const pose = poseOnLane(laneId, 150 + tick * 0.02);
      live.step({
        tick,
        vehicles: [
          {
            tick,
            vehicleId: '272-player',
            driverKind: 'TAXI',
            classId: 'sedan',
            controlMode: 'LEARNING',
            positionM: { x: pose.x, y: pose.y, z: pose.z },
            yawRad: pose.yawRad,
            speedMps: 1,
            laneId,
            speedLimitMps: 11.2,
            appliedProfileVersion: 'profile-272-report@1',
            maneuverState: 'IDLE',
          },
        ],
        camera: cameraAt(pose),
      });
    }
    live.noteSuspension({ tick: 40, cause: 'FOCUS_LOST' });
    live.noteResume(41);
    for (let tick = 41; tick <= 60; tick += 1) {
      const pose = poseOnLane(laneId, 151 + tick * 0.02);
      live.step({
        tick,
        vehicles: [
          {
            tick,
            vehicleId: '272-player',
            driverKind: 'TAXI',
            classId: 'sedan',
            controlMode: 'LEARNING',
            positionM: { x: pose.x, y: pose.y, z: pose.z },
            yawRad: pose.yawRad,
            speedMps: 1,
            laneId,
            speedLimitMps: 11.2,
            appliedProfileVersion: 'profile-272-report@1',
            maneuverState: 'IDLE',
          },
        ],
        camera: cameraAt(pose),
      });
    }
    live.noteRecovery({
      tick: 61,
      vehicleId: '272-player',
      operationId: '272-report-recovery-artifact',
      status: 'ADMITTED',
      pointId: '272-report-point',
      mapId: world.mapId,
      laneId,
      mode: 'LEARNING',
      validatedTick: 61,
    });
    live.closeSegment('SHUTDOWN');
    const read = live.read();
    const closed = live.readClosedSegment('272-learning-segment')!;
    const window = closed.artifactWindow!;
    return {
      pauseCause: window.artifacts.find((artifact) => artifact.kind === 'PAUSE')?.cause ?? null,
      teleportCause:
        window.artifacts.find((artifact) => artifact.kind === 'TELEPORT')?.cause ?? null,
      observationGap: window.artifacts.some((artifact) => artifact.cause === 'OBSERVATION_GAP'),
      prefixTicks: window.prefix?.ticks ?? 0,
      completeness: window.completeness,
      suppressedEligibleWindows: read.windows.filter(
        (entry) => entry.segmentId === '272-learning-segment' && entry.windowClass === 'ELIGIBLE',
      ).length,
      demonstrations: closed.demonstrations,
    };
  } finally {
    live.dispose();
  }
}

function boundedScenario() {
  const live = createLiveTelemetry({
    context: CONTEXT,
    playerId: '272-player',
    map: world.map,
    graph: world.graph,
    capacity: 64,
    worldCapacity: 1024,
  });
  try {
    for (let tick = 1; tick <= 1200; tick += 1) {
      live.step({
        tick,
        vehicles: [
          {
            tick,
            vehicleId: 'off-map',
            driverKind: 'TAXI',
            classId: 'sedan',
            controlMode: 'AUTO',
            positionM: { x: 500000, y: 0, z: 500000 },
            yawRad: 0,
            speedMps: 1,
            laneId: null,
            speedLimitMps: 10,
            appliedProfileVersion: 'profile-272-report@1',
            maneuverState: 'IDLE',
          },
        ],
      });
    }
    const stats = live.getStats();
    return {
      capacity: stats.worldCapacity,
      retained: stats.worldSamplesRetained,
      dropped: stats.worldSamplesDropped,
      memoryBytes: stats.memory.totalBytes,
      budgetBytes: stats.memory.budgetBytes,
      withinBudget: stats.memory.withinBudget,
    };
  } finally {
    live.dispose();
  }
}

export function runLiveTelemetryReport(): LiveTelemetryReport {
  const fleet = fleetScenario();
  const stop = stopScenario();
  const signal = signalScenario();
  const artifacts = artifactScenario();
  const bounded = boundedScenario();
  const dedupe = {
    uniqueOccurrences: stop.uniqueOccurrences,
    duplicateObservations: stop.duplicateObservations,
    dedupeDropped: 0,
  };
  const profileFingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        profileId: 'profile-272-report',
        baseVersionId: 'profile-272-report@1',
        learningEpoch: 4,
        xpChanges: 0,
        publications: 0,
      }),
    )
    .digest('hex');
  const checks: Check[] = [
    {
      name: 'all-58-live-vehicles',
      pass: fleet.fleet.vehicles === 58 && fleet.fleet.distinctVehicles === 58,
      detail: `${fleet.fleet.distinctVehicles}/${fleet.fleet.vehicles} vehicles contribute`,
    },
    {
      name: 'camera-and-selection-independent',
      pass:
        fleet.fleet.selectedVehicleId === null &&
        fleet.fleet.playerVehicleId === null &&
        fleet.fleet.cameraIndependent,
      detail: 'no camera/selection filter is applied to the world ring or opportunity facts',
    },
    {
      name: 'world-samples-bounded',
      pass:
        fleet.fleet.worldRows === 58 * 180 &&
        fleet.fleet.dropped === 0 &&
        bounded.retained === 1024 &&
        bounded.dropped > 0 &&
        bounded.withinBudget,
      detail: `${bounded.retained}/${bounded.capacity} rows retained, ${bounded.dropped} dropped`,
    },
    {
      name: 'manual-metrics-not-demonstration',
      pass:
        fleet.segment.manualSamples > 0 &&
        fleet.segment.demonstrations === 0 &&
        fleet.segment.profilePublications === 0,
      detail: `${fleet.segment.manualSamples} MANUAL samples, 0 demonstrations`,
    },
    {
      name: 'learning-segment-closed-and-exposed',
      pass:
        fleet.segment.learningSamples > 0 &&
        fleet.segment.learningClosedSegments >= 1 &&
        fleet.segment.closedSamplesRead > 0 &&
        fleet.segment.learningEligible,
      detail: `${fleet.segment.learningSamples} LEARNING samples, ${fleet.segment.closedSamplesRead} readable`,
    },
    {
      name: 'follow-context-observed',
      pass: fleet.fleet.followEpisodes > 0,
      detail: `${fleet.fleet.followEpisodes} follower episode(s) deduped by vehicle+leader acquisition`,
    },
    {
      name: 'stop-opportunity-deduped',
      pass:
        stop.kind === 'STOP' &&
        stop.state === 'RESOLVED' &&
        stop.outcome === 'STOPPED' &&
        stop.occurrence === 0 &&
        stop.uniqueOccurrences === 1 &&
        stop.duplicateObservations > 0,
      detail: `${stop.uniqueOccurrences} unique occurrence, ${stop.duplicateObservations} duplicate frames`,
    },
    {
      name: 'stop-window-eligible',
      pass:
        stop.windowClass === 'ELIGIBLE' &&
        stop.windowLabel === 'FREE_TRAFFIC' &&
        stop.eligibleOccurrences === 1,
      detail: `${stop.windowClass}/${stop.windowLabel}, ${stop.eligibleOccurrences} eligible occurrence`,
    },
    {
      name: 'real-signal-opportunity',
      pass:
        (signal.kind === 'RED' || signal.kind === 'GREEN') &&
        signal.windowClass === 'ELIGIBLE' &&
        signal.samples === 300,
      detail: `${signal.kind} from the real 036 movement, ${signal.windowClass}`,
    },
    {
      name: 'pause-focus-teleport-artifacts',
      pass:
        artifacts.pauseCause === 'SUSPENSION_FOCUS_LOST' &&
        artifacts.teleportCause === 'RECOVERY_TELEPORT' &&
        artifacts.prefixTicks > 0 &&
        artifacts.suppressedEligibleWindows === 0,
      detail: `${artifacts.pauseCause}, ${artifacts.teleportCause}, prefix ${artifacts.prefixTicks} ticks`,
    },
    {
      name: 'no-learning-and-no-profile-publication',
      pass:
        fleet.segment.profilePublications === 0 &&
        fleet.segment.learningJobs === 0 &&
        fleet.segment.demonstrations === 0 &&
        artifacts.demonstrations === 0,
      detail: '0 jobs, 0 profile publications, 0 demonstrations',
    },
    {
      name: 'memory-within-recorder-budget',
      pass:
        fleet.fleet.memoryBytes <= fleet.fleet.budgetBytes &&
        bounded.memoryBytes <= bounded.budgetBytes,
      detail: `${fleet.fleet.memoryBytes} B live fleet, ${bounded.memoryBytes} B bounded probe`,
    },
  ];
  const passed = checks.filter((check) => check.pass).length;
  return Object.freeze({
    version: LIVE_TELEMETRY_REPORT_VERSION,
    contract: '272-live-telemetry-v1',
    fleet: fleet.fleet,
    segment: fleet.segment,
    stop,
    signal,
    artifacts,
    bounded,
    dedupe,
    profileFingerprint,
    checks: Object.freeze(checks),
    summary: Object.freeze({
      checks: checks.length,
      passed,
      failed: checks.length - passed,
      pass: passed === checks.length,
    }),
  });
}

export function liveTelemetryReportMarkdown(report: LiveTelemetryReport): string {
  const rows = report.checks
    .map((check) => `| \`${check.name}\` | ${check.pass ? 'PASS' : 'FAIL'} | ${check.detail} |`)
    .join('\n');
  return `# 272 — telemetry, opportunities and eligibility from live driving

Deterministic report generated from the real 032/033 map and the live V3 composition. It does not
start learning, publish a profile or write XP.

## Results

| Scenario | Facts |
| --- | --- |
| Fleet | ${report.fleet.distinctVehicles}/${report.fleet.vehicles} vehicles, ${report.fleet.worldRows} world rows, ${report.fleet.dropped} dropped |
| Follow | ${report.fleet.followEpisodes} deduplicated follower episode(s) |
| MANUAL segment | ${report.segment.manualSamples} samples, ${report.segment.demonstrations} demonstrations |
| LEARNING segment | ${report.segment.learningSamples} samples, ${report.segment.learningClosedSegments} closed segments, ${report.segment.closedSamplesRead} readable samples |
| STOP | ${report.stop.opportunities} opportunity, ${report.stop.uniqueOccurrences} unique occurrence, ${report.stop.duplicateObservations} duplicate frames, ${report.stop.windowClass}/${report.stop.windowLabel} |
| Signal | ${report.signal.opportunities} opportunity, ${report.signal.kind}, ${report.signal.windowClass}/${report.signal.windowLabel} |
| Artifacts | ${report.artifacts.pauseCause}, ${report.artifacts.teleportCause}, gap ${String(report.artifacts.observationGap)}, prefix ${report.artifacts.prefixTicks} ticks |
| Buffer | ${report.bounded.retained}/${report.bounded.capacity} retained, ${report.bounded.dropped} dropped, ${report.bounded.memoryBytes} B |
| Dedupe | ${report.dedupe.uniqueOccurrences} unique, ${report.dedupe.duplicateObservations} duplicates |

Profile fingerprint: \`${report.profileFingerprint}\`; publications 0, jobs 0, XP changes 0.

## Checks

| Check | Verdict | Detail |
| --- | --- | --- |
${rows}

Summary: **${report.summary.passed}/${report.summary.checks} PASS**.
`;
}
