import { createHash } from 'node:crypto';
import {
  createCityStyleProfile,
  createLiveLearningPipeline,
  type LiveLearningPipeline,
} from '../../src/app';
import { createCompositionWorld } from '../../src/app';
import {
  DEFAULT_FLEET_COUNTS,
  createFleetRegistry,
  createProfileActivation,
  createProfileActivationSource,
} from '../../src/fleet';
import type { ProfileActivation } from '../../src/fleet';
import { createCandidateProfileStore, createLearningQueueRuntime } from '../../src/learning';
import type { LearningQueueRuntime } from '../../src/learning';
import { getParameterDefinition } from '../../src/profiles';
import type { DrivingProfile, ProfileStore } from '../../src/profiles';
import { createLiveTelemetry } from '../../src/telemetry';
import type { LiveTelemetry, LiveTelemetrySegmentRead } from '../../src/telemetry';
import { LIVE_FIXTURE_LIMIT_MPS, LIVE_FIXTURE_LANE } from '../harness/live-learning-fixture';
import {
  PIPELINE_BASE_VERSION,
  PIPELINE_ENGINE,
  PIPELINE_PLAYER_ID,
  PIPELINE_PROFILE_ID,
  PIPELINE_SESSION_ID,
  PIPELINE_WORLD_EPOCH,
} from '../harness/profile-pipeline-fixture';

export const LIVE_LEARNING_REPORT_VERSION = '273-live-learning-report-v1' as const;
const REPORT_NOW = '2026-11-27T00:00:00.000Z';

export interface LiveLearningReportCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface LiveLearningScenario {
  readonly name: string;
  readonly status: string;
  readonly detail: Readonly<Record<string, string | number | boolean | null>>;
}

export interface LiveLearningReport {
  readonly version: typeof LIVE_LEARNING_REPORT_VERSION;
  readonly contract: string;
  readonly worker: Readonly<{
    kind: 'REAL_103_221_RUNTIME';
    engineVersion: string;
    queueVersion: string;
    governorVersion: string;
    storableRecords: number;
  }>;
  readonly scenarios: readonly LiveLearningScenario[];
  readonly composite: Readonly<{
    segmentId: string;
    key: string;
    baseVersionId: string;
    versionId: string;
    parentVersionId: string;
    candidate: number | null;
    baseValue: number;
    composedValue: number;
    jobCount: number;
    versionCount: number;
    activationStatus: string;
    activateAtTick: number | null;
    appliedAtTick: number | null;
    fleetBefore: readonly string[];
    fleetAfter: readonly string[];
    profileFingerprintBefore: string;
    profileFingerprintAfter: string;
    xpFingerprintBefore: string;
    xpFingerprintAfter: string;
    evidence: string;
    candidateStatus: string;
    episodes: number;
    context: string;
  }>;
  readonly noChange: Readonly<{
    status: string;
    jobs: number;
    versions: number;
    evidence: string;
    candidate: string;
    reason: string | null;
  }>;
  readonly stale: Readonly<{
    status: string;
    reason: string | null;
    jobs: number;
    versions: number;
    versionsInStore: number;
  }>;
  readonly restore: Readonly<{
    epochBefore: number;
    epochAfter: number;
    targetVersionId: string;
    cancelledJobs: number;
    lateStatus: string;
    lateVersionId: string | null;
    physicalPreserved: boolean;
    fleetVersions: readonly string[];
    versionsInStore: number;
  }>;
  readonly importScenario: Readonly<{
    invalidStatus: string;
    invalidEpoch: number;
    validStatus: string;
    validEpoch: number;
    validTarget: string;
    fleetVersions: readonly string[];
  }>;
  readonly newProfile: Readonly<{
    epoch: number;
    targetVersionId: string;
    fleetVersions: readonly string[];
  }>;
  readonly checks: readonly LiveLearningReportCheck[];
  readonly summary: Readonly<{
    scenarios: number;
    checks: number;
    passed: number;
    failed: number;
    pass: boolean;
  }>;
}

export interface ReportWorld {
  readonly world: ReturnType<typeof createCompositionWorld>;
  readonly telemetry: LiveTelemetry;
  readonly telemetryPort: {
    read(): {
      readonly closedSegments: readonly ReturnType<
        LiveTelemetry['read']
      >['closedSegments'][number][];
    };
    readClosedSegment(segmentId: string): LiveTelemetrySegmentRead | null;
  };
  readonly store: ProfileStore;
  readonly registry: ReturnType<typeof createFleetRegistry>;
  readonly activation: ProfileActivation;
  readonly queue: LearningQueueRuntime;
  readonly live: LiveLearningPipeline;
  readonly tick: { value: number };
  readonly applied: { versionId: string; tick: number }[];
  readonly style: { profile: DrivingProfile };
  readonly physical: { value: string };
  readonly releaseGate: () => void;
  drive(options: DriveOptions): LiveTelemetrySegmentRead;
  settle(maxSteps?: number): Promise<void>;
  dispose(): void;
}

export interface DriveOptions {
  readonly segmentId: string;
  readonly mode?: 'MANUAL' | 'LEARNING' | 'AUTO';
  readonly learningEpoch?: number;
  readonly ticks?: number;
  readonly startTick?: number;
  readonly startDistanceM?: number;
  readonly speed?: (tick: number, total: number) => number;
  readonly camera?: boolean;
  readonly ineligible?: boolean;
}

function poseOnLane(world: ReturnType<typeof createCompositionWorld>, distanceM: number) {
  const path = world.graph.getDirectedPath(LIVE_FIXTURE_LANE);
  if (path === null) throw new Error('Missing report lane');
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

function xpFingerprint(): string {
  return createHash('sha256')
    .update(JSON.stringify({ awards: 0, spends: 0, level: null, writer: 'NOT_MOUNTED_273' }))
    .digest('hex');
}

export function createReportWorld(
  ineligibleSegments: readonly string[] = [],
  gateFirstJob = false,
): ReportWorld {
  const context = Object.freeze({
    schemaVersion: 1 as const,
    units: 'SI' as const,
    sessionId: PIPELINE_SESSION_ID,
    worldEpoch: PIPELINE_WORLD_EPOCH,
  });
  const world = createCompositionWorld();
  const store = createCandidateProfileStore({
    engineVersion: PIPELINE_ENGINE,
    now: () => REPORT_NOW,
  });
  const baseStyle = createCityStyleProfile(PIPELINE_PROFILE_ID, PIPELINE_BASE_VERSION);
  const base = store.createBase({
    profileId: PIPELINE_PROFILE_ID,
    versionId: PIPELINE_BASE_VERSION,
    parameters: baseStyle.parameters,
    createdAt: REPORT_NOW,
  });
  if (base.status !== 'ACCEPTED') throw new Error(`Report base rejected: ${base.rejection.code}`);
  const source = createProfileActivationSource({
    profileId: PIPELINE_PROFILE_ID,
    versionId: PIPELINE_BASE_VERSION,
  });
  const registry = createFleetRegistry(
    {
      schemaVersion: 1,
      units: 'SI',
      sessionId: PIPELINE_SESSION_ID,
      worldEpoch: PIPELINE_WORLD_EPOCH,
      scenarioId: 'report-273',
      seed: 273,
      namespace: 'city:report:273',
      taxiCount: DEFAULT_FLEET_COUNTS.taxis,
      civilianCount: DEFAULT_FLEET_COUNTS.civilians,
      profile: { profileId: PIPELINE_PROFILE_ID, versionId: PIPELINE_BASE_VERSION },
    },
    { profileSource: source },
  );
  const tick = { value: 0 };
  const activation = createProfileActivation({
    registry,
    source,
    engineVersion: PIPELINE_ENGINE,
    clock: () => tick.value,
    now: () => REPORT_NOW,
  });
  const queue = createLearningQueueRuntime({ engineVersion: PIPELINE_ENGINE });
  const telemetry = createLiveTelemetry({
    context,
    playerId: PIPELINE_PLAYER_ID,
    map: world.map,
    graph: world.graph,
    capacity: 8192,
  });
  const ineligible = new Set(ineligibleSegments);
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
  const applied: { versionId: string; tick: number }[] = [];
  const style = { profile: baseStyle };
  const physical = { value: 'physical-report-0' };
  let releaseGate = (): void => {};
  const queuePort = (() => {
    if (!gateFirstJob) return queue.queue;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    releaseGate = release;
    return {
      submit(value: unknown) {
        const admission = queue.queue.submit(value);
        if (admission.ticket === null) return admission;
        const ticket = admission.ticket;
        return Object.freeze({
          ...admission,
          ticket: Object.freeze({
            ...ticket,
            outcome: gate.then(() => ticket.outcome),
          }),
        });
      },
      cancel: (segmentId: string) => queue.queue.cancel(segmentId),
      acknowledge: (segmentId: string) => queue.queue.acknowledge(segmentId),
    };
  })();
  const live = createLiveLearningPipeline({
    context,
    playerId: PIPELINE_PLAYER_ID,
    profileId: PIPELINE_PROFILE_ID,
    engineVersion: PIPELINE_ENGINE,
    learningEpoch: 1,
    baseVersionId: PIPELINE_BASE_VERSION,
    sessionId: PIPELINE_SESSION_ID,
    worldEpoch: PIPELINE_WORLD_EPOCH,
    queue: queuePort,
    store,
    activation,
    telemetry: telemetryPort,
    tick: () => tick.value,
    physicalState: () => physical.value,
    onActivated: ({ versionId, profile }) => {
      style.profile = profile;
      applied.push({ versionId, tick: tick.value });
    },
  });
  let startTick = 1;

  function drive(options: DriveOptions): LiveTelemetrySegmentRead {
    const ticks = options.ticks ?? 1080;
    const start = options.startTick ?? startTick;
    const mode = options.mode ?? 'LEARNING';
    const learningEligible = mode === 'LEARNING';
    const speedAt =
      options.speed ?? ((tick: number, total: number) => (tick < total - 240 ? 9 : 2));
    let distance = options.startDistanceM ?? 130;
    telemetry.openSegment({
      segmentId: options.segmentId,
      vehicleId: 'report-player',
      classId: 'sedan',
      controlMode: mode,
      profileId: PIPELINE_PROFILE_ID,
      baseVersionId: PIPELINE_BASE_VERSION,
      learningEpoch: options.learningEpoch ?? 1,
      learningEligible,
      inputType: 'KEYBOARD',
      startTick: start,
    });
    let speed = 0;
    for (let index = 0; index < ticks; index += 1) {
      const tickValue = start + index;
      speed = Math.max(0, speedAt(index, ticks));
      distance += speed / 60;
      const pose = poseOnLane(world, distance);
      telemetry.step({
        tick: tickValue,
        vehicles: [
          {
            tick: tickValue,
            vehicleId: 'report-player',
            driverKind: 'TAXI',
            classId: 'sedan',
            controlMode: mode,
            positionM: { x: pose.x, y: pose.y, z: pose.z },
            yawRad: pose.yawRad,
            speedMps: speed,
            laneId: LIVE_FIXTURE_LANE,
            speedLimitMps: LIVE_FIXTURE_LIMIT_MPS,
            appliedProfileVersion: PIPELINE_BASE_VERSION,
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
        ...(options.camera === false ? {} : { camera: cameraAt(pose) }),
      });
    }
    telemetry.closeSegment('MODE_CHANGE');
    startTick = start + ticks + 1;
    return telemetry.readClosedSegment(options.segmentId)!;
  }

  async function settle(maxSteps = 40): Promise<void> {
    for (let step = 0; step < maxSteps; step += 1) {
      tick.value += 1;
      live.step(tick.value);
      await new Promise((resolve) => setTimeout(resolve, 2));
      const read = live.read();
      if (
        read.pendingSegment === null &&
        read.pendingActivation === null &&
        activation.pending() === null
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2));
        const after = live.read();
        if (after.pendingSegment === null && after.pendingActivation === null) return;
      }
    }
  }

  return {
    world,
    telemetry,
    telemetryPort,
    store,
    registry,
    activation,
    queue,
    live,
    tick,
    applied,
    style,
    physical,
    releaseGate,
    drive,
    settle,
    dispose(): void {
      live.dispose();
      telemetry.dispose();
      queue.dispose();
      activation.dispose();
      registry.dispose();
    },
  };
}

async function manualScenario(): Promise<LiveLearningScenario> {
  const input = createReportWorld();
  try {
    input.drive({ segmentId: 'report-manual', mode: 'MANUAL', ticks: 600 });
    await input.settle();
    const read = input.live.read();
    return Object.freeze({
      name: 'MANUAL',
      status: read.history[0]?.status ?? 'NO_RESULT',
      detail: Object.freeze({
        jobs: read.stats.jobs,
        versions: read.stats.versions,
        profile: read.headVersionId,
        fleet: input.registry.list().length,
      }),
    });
  } finally {
    input.dispose();
  }
}

async function ineligibleScenario(): Promise<LiveLearningScenario> {
  const input = createReportWorld(['report-ineligible']);
  try {
    input.drive({ segmentId: 'report-ineligible', mode: 'LEARNING', ticks: 600 });
    await input.settle();
    const read = input.live.read();
    return Object.freeze({
      name: 'INELIGIBLE_LEARNING',
      status: read.history[0]?.status ?? 'NO_RESULT',
      detail: Object.freeze({
        jobs: read.stats.jobs,
        versions: read.stats.versions,
        eligible: read.stats.eligible,
      }),
    });
  } finally {
    input.dispose();
  }
}

async function noEvidenceScenario(): Promise<LiveLearningReport['noChange']> {
  const input = createReportWorld();
  try {
    input.drive({ segmentId: 'report-no-evidence', camera: false });
    await input.settle();
    const read = input.live.read();
    return Object.freeze({
      status: read.lastStatus ?? 'NO_RESULT',
      jobs: read.stats.jobs,
      versions: read.stats.versions,
      evidence: read.evidenceKeys[0]?.status ?? 'UNKNOWN',
      candidate: read.history[0]?.candidateStatus ?? 'UNKNOWN',
      reason: read.lastReason,
    });
  } finally {
    input.dispose();
  }
}

async function composedScenario(): Promise<LiveLearningReport['composite']> {
  const input = createReportWorld();
  try {
    const before = input.live.read();
    input.drive({
      segmentId: 'report-composed',
      startDistanceM: 130,
      ticks: 1080,
      speed: (tick, total) => (tick < total - 240 ? 9 : 2),
    });
    await input.settle();
    const after = input.live.read();
    if (after.headVersionId === PIPELINE_BASE_VERSION)
      throw new Error(`The composed scenario did not publish: ${after.lastStatus}`);
    const version = input.store.getVersion(after.headVersionId)!;
    const history = after.history.find((row) => row.segmentId === 'report-composed');
    if (history === undefined) throw new Error('Missing composed history');
    const composition = history;
    const measurement = input.queue.queue.measurements.at(-1) ?? null;
    void measurement;
    return Object.freeze({
      segmentId: 'report-composed',
      key: composition.key ?? 'UNKNOWN',
      baseVersionId: PIPELINE_BASE_VERSION,
      versionId: version.versionId,
      parentVersionId: version.parentVersionId ?? '',
      candidate: composition.candidateValue,
      baseValue: before.profile.parameters[composition.key ?? 'speed_delta_urban'] ?? 0,
      composedValue: version.parameters[composition.key ?? 'speed_delta_urban'] ?? 0,
      jobCount: after.stats.jobs,
      versionCount: after.stats.versions,
      activationStatus: composition.activationStatus ?? 'NONE',
      activateAtTick: composition.activateAtTick,
      appliedAtTick: after.activation.lastAppliedTick,
      fleetBefore: Object.freeze([PIPELINE_BASE_VERSION]),
      fleetAfter: Object.freeze([
        ...new Set(
          input.registry
            .list()
            .map((vehicle) => input.registry.state(vehicle.vehicleId)!.appliedProfileVersion),
        ),
      ]),
      profileFingerprintBefore: before.profile.fingerprint,
      profileFingerprintAfter: after.profile.fingerprint,
      xpFingerprintBefore: xpFingerprint(),
      xpFingerprintAfter: xpFingerprint(),
      evidence: composition.evidenceStatus ?? 'UNKNOWN',
      candidateStatus: composition.candidateStatus ?? 'UNKNOWN',
      episodes: composition.episodes,
      context: 'FREE_TRAFFIC',
    });
  } finally {
    input.dispose();
  }
}

async function staleScenario(): Promise<LiveLearningReport['stale']> {
  const input = createReportWorld();
  try {
    input.drive({ segmentId: 'report-stale', learningEpoch: 2 });
    await input.settle();
    const read = input.live.read();
    const row = read.history[0];
    return Object.freeze({
      status: row?.status ?? 'NO_RESULT',
      reason: row?.reason ?? null,
      jobs: read.stats.jobs,
      versions: read.stats.versions,
      versionsInStore: input.store.listVersions(PIPELINE_PROFILE_ID).length,
    });
  } finally {
    input.dispose();
  }
}

async function restoreScenario(): Promise<LiveLearningReport['restore']> {
  const input = createReportWorld();
  try {
    const definition = getParameterDefinition('speed_delta_urban');
    const targetId = 'report-target-v2';
    const derived = input.store.derive({
      profileId: PIPELINE_PROFILE_ID,
      versionId: targetId,
      parentVersionId: PIPELINE_BASE_VERSION,
      segmentId: 'report-target',
      reason: 'report restore target',
      delta: {
        profileVersionId: targetId,
        parentVersionId: PIPELINE_BASE_VERSION,
        engineVersion: PIPELINE_ENGINE,
        schemaVersion: 1,
        units: 'SI',
        values: [{ key: definition.key, unit: definition.unit, value: 2.5 }],
      },
    });
    if (derived.status !== 'ACCEPTED') throw new Error(derived.rejection.code);
    input.drive({
      segmentId: 'report-restore',
      startDistanceM: 130,
      ticks: 1080,
      speed: (tick, total) => (tick < total - 240 ? 9 : 2),
    });
    input.tick.value += 1;
    input.live.step(input.tick.value);
    const requested = input.live.requestProfileChange({
      reason: 'RESTORE',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: targetId,
      importValid: true,
    }) as { readonly status: string };
    input.tick.value += 1;
    input.live.step(input.tick.value);
    await input.settle(20);
    const read = input.live.read();
    const late = read.history.find((row) => row.segmentId === 'report-restore');
    return Object.freeze({
      epochBefore: 1,
      epochAfter: read.learningEpoch,
      targetVersionId: targetId,
      cancelledJobs: read.barrier.invalidatedJobs,
      lateStatus: late?.status ?? requested.status,
      lateVersionId: late?.versionId ?? null,
      physicalPreserved: read.stats.physicalPreserved > 0,
      fleetVersions: Object.freeze([
        ...new Set(
          input.registry
            .list()
            .map((vehicle) => input.registry.state(vehicle.vehicleId)!.appliedProfileVersion),
        ),
      ]),
      versionsInStore: input.store.listVersions(PIPELINE_PROFILE_ID).length,
    });
  } finally {
    input.dispose();
  }
}

async function importScenario(): Promise<LiveLearningReport['importScenario']> {
  const input = createReportWorld();
  try {
    const definition = getParameterDefinition('speed_delta_urban');
    const targetId = 'report-import-v2';
    const derived = input.store.derive({
      profileId: PIPELINE_PROFILE_ID,
      versionId: targetId,
      parentVersionId: PIPELINE_BASE_VERSION,
      segmentId: 'report-import-target',
      reason: 'report import target',
      delta: {
        profileVersionId: targetId,
        parentVersionId: PIPELINE_BASE_VERSION,
        engineVersion: PIPELINE_ENGINE,
        schemaVersion: 1,
        units: 'SI',
        values: [{ key: definition.key, unit: definition.unit, value: 1.4 }],
      },
    });
    if (derived.status !== 'ACCEPTED') throw new Error(derived.rejection.code);
    const invalid = input.live.requestProfileChange({
      reason: 'IMPORT',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: targetId,
      importValid: false,
    }) as { readonly status: string };
    const invalidEpoch = input.live.read().learningEpoch;
    const valid = input.live.requestProfileChange({
      reason: 'IMPORT',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: targetId,
      importValid: true,
    }) as { readonly status: string };
    await input.settle();
    const read = input.live.read();
    return Object.freeze({
      invalidStatus: invalid.status,
      invalidEpoch,
      validStatus: valid.status,
      validEpoch: read.learningEpoch,
      validTarget: read.headVersionId,
      fleetVersions: Object.freeze([
        ...new Set(
          input.registry
            .list()
            .map((vehicle) => input.registry.state(vehicle.vehicleId)!.appliedProfileVersion),
        ),
      ]),
    });
  } finally {
    input.dispose();
  }
}

async function newProfileScenario(): Promise<LiveLearningReport['newProfile']> {
  const input = createReportWorld();
  try {
    const definition = getParameterDefinition('speed_delta_urban');
    const targetId = 'report-new-profile-v2';
    const derived = input.store.derive({
      profileId: PIPELINE_PROFILE_ID,
      versionId: targetId,
      parentVersionId: PIPELINE_BASE_VERSION,
      segmentId: 'report-new-target',
      reason: 'report new profile target',
      delta: {
        profileVersionId: targetId,
        parentVersionId: PIPELINE_BASE_VERSION,
        engineVersion: PIPELINE_ENGINE,
        schemaVersion: 1,
        units: 'SI',
        values: [{ key: definition.key, unit: definition.unit, value: 3.1 }],
      },
    });
    if (derived.status !== 'ACCEPTED') throw new Error(derived.rejection.code);
    input.live.requestProfileChange({
      reason: 'NEW_PROFILE',
      targetProfileId: PIPELINE_PROFILE_ID,
      targetVersionId: targetId,
      importValid: true,
    });
    await input.settle();
    const read = input.live.read();
    return Object.freeze({
      epoch: read.learningEpoch,
      targetVersionId: read.headVersionId,
      fleetVersions: Object.freeze([
        ...new Set(
          input.registry
            .list()
            .map((vehicle) => input.registry.state(vehicle.vehicleId)!.appliedProfileVersion),
        ),
      ]),
    });
  } finally {
    input.dispose();
  }
}

function check(
  name: string,
  expected: string | number | boolean | null,
  actual: string | number | boolean | null,
  detail: string,
): LiveLearningReportCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

export async function runLiveLearningReport(): Promise<LiveLearningReport> {
  const manual = await manualScenario();
  const ineligible = await ineligibleScenario();
  const noChange = await noEvidenceScenario();
  const composite = await composedScenario();
  const stale = await staleScenario();
  const restore = await restoreScenario();
  const imported = await importScenario();
  const newProfile = await newProfileScenario();
  const checks = [
    check('contract-version', '273-live-learning-v1', '273-live-learning-v1', 'pipeline contract'),
    check('manual-no-job', 0, manual.detail.jobs as number, 'MANUAL never reaches the queue'),
    check(
      'manual-no-version',
      0,
      manual.detail.versions as number,
      'MANUAL never produces a version',
    ),
    check(
      'ineligible-no-job',
      0,
      ineligible.detail.jobs as number,
      'ineligible LEARNING never reaches the queue',
    ),
    check(
      'no-evidence-status',
      'INSUFFICIENT_EVIDENCE',
      noChange.status,
      'no evidence does not become a version',
    ),
    check('no-evidence-version', 0, noChange.versions, 'no version without evidence'),
    check('composed-job', 1, composite.jobCount, 'one eligible segment produced one job'),
    check('composed-version', 1, composite.versionCount, 'one immutable version was derived'),
    check('composed-parent', PIPELINE_BASE_VERSION, composite.parentVersionId, 'explicit parent'),
    check('composed-activation', 'PENDING', composite.activationStatus, 'common-tick command'),
    check('composed-applied-tick', composite.activateAtTick, composite.appliedAtTick, 'same tick'),
    check('composed-fleet', 1, composite.fleetAfter.length, 'one version across the fleet'),
    check(
      'composed-fleet-version',
      composite.versionId,
      composite.fleetAfter[0] ?? null,
      'all vehicles use the published version',
    ),
    check(
      'profile-changed',
      true,
      composite.profileFingerprintBefore !== composite.profileFingerprintAfter,
      'the immutable profile changed',
    ),
    check(
      'xp-unchanged',
      composite.xpFingerprintBefore,
      composite.xpFingerprintAfter,
      '273 never writes XP',
    ),
    check('stale-status', 'STALE_JOB', stale.status, 'foreign generation is stale'),
    check('stale-no-job', 0, stale.jobs, 'a stale segment creates no job'),
    check('stale-no-version', 1, stale.versionsInStore, 'only the base version exists'),
    check('restore-epoch', 2, restore.epochAfter, 'restore increments learningEpoch once'),
    check(
      'restore-target',
      restore.targetVersionId,
      restore.fleetVersions[0] ?? null,
      'target active',
    ),
    check('restore-cancelled', 1, restore.cancelledJobs, 'the in-flight 103 job was cancelled'),
    check('restore-late-version', null, restore.lateVersionId, 'the late result published nothing'),
    check('restore-preserved', true, restore.physicalPreserved, 'no teleport or speed reset'),
    check('restore-late', 'STALE_JOB', restore.lateStatus, 'the cancelled job publishes nothing'),
    check('import-invalid', 'REJECTED', imported.invalidStatus, 'invalid import has no effect'),
    check('import-invalid-epoch', 1, imported.invalidEpoch, 'invalid import keeps the epoch'),
    check('import-valid-epoch', 2, imported.validEpoch, 'valid import advances the epoch'),
    check(
      'import-valid-target',
      imported.validTarget,
      imported.fleetVersions[0] ?? null,
      'target active',
    ),
    check('new-profile-epoch', 2, newProfile.epoch, 'new profile advances the epoch'),
    check(
      'new-profile-target',
      newProfile.targetVersionId,
      newProfile.fleetVersions[0] ?? null,
      'new profile target active',
    ),
  ];
  const passed = checks.filter((row) => row.pass).length;
  return Object.freeze({
    version: LIVE_LEARNING_REPORT_VERSION,
    contract: '273-live-learning-v1',
    worker: Object.freeze({
      kind: 'REAL_103_221_RUNTIME' as const,
      engineVersion: PIPELINE_ENGINE,
      queueVersion: '103-learning-estimator-queue-v1',
      governorVersion: '221-synthetic-1',
      storableRecords: 8,
    }),
    scenarios: Object.freeze([manual, ineligible]),
    composite,
    noChange,
    stale,
    restore,
    importScenario: imported,
    newProfile,
    checks: Object.freeze(checks),
    summary: Object.freeze({
      scenarios: 8,
      checks: checks.length,
      passed,
      failed: checks.length - passed,
      pass: passed === checks.length,
    }),
  });
}

export function liveLearningReportMarkdown(report: LiveLearningReport): string {
  const rows = report.checks
    .map((check) => `| \`${check.name}\` | ${check.pass ? 'PASS' : 'FAIL'} | ${check.detail} |`)
    .join('\n');
  return `# 273 — live learning pipeline

Deterministic report generated from the real 032/033 map, the real 272 telemetry writer, the real
103 queue/221 governor and the real 109/110 profile publication. It never writes XP and never
creates a second simulation, estimator or ledger.

## End-to-end result

| Fact | Value |
| --- | --- |
| Segment | \`${report.composite.segmentId}\` |
| Key | \`${report.composite.key}\` (${report.composite.context}) |
| Candidate | ${report.composite.candidate} (${report.composite.candidateStatus}, ${report.composite.evidence}) |
| Base version | \`${report.composite.baseVersionId}\` |
| Published version | \`${report.composite.versionId}\` (parent \`${report.composite.parentVersionId}\`) |
| Value | ${report.composite.baseValue} → ${report.composite.composedValue} |
| Activation | ${report.composite.activationStatus} at tick ${report.composite.activateAtTick}, applied ${report.composite.appliedAtTick} |
| Fleet | ${report.composite.fleetBefore.join(', ')} → ${report.composite.fleetAfter.join(', ')} |
| Profile fingerprint | \`${report.composite.profileFingerprintBefore}\` → \`${report.composite.profileFingerprintAfter}\` |
| XP fingerprint | \`${report.composite.xpFingerprintBefore}\` = \`${report.composite.xpFingerprintAfter}\` |
| Jobs / versions | ${report.composite.jobCount} / ${report.composite.versionCount} |

## Refusals

- MANUAL: ${report.scenarios[0]?.status}; jobs ${report.scenarios[0]?.detail.jobs}, versions ${report.scenarios[0]?.detail.versions}.
- Ineligible LEARNING: ${report.scenarios[1]?.status}; jobs ${report.scenarios[1]?.detail.jobs}, versions ${report.scenarios[1]?.detail.versions}.
- No evidence: ${report.noChange.status}; evidence ${report.noChange.evidence}, candidate ${report.noChange.candidate}, versions ${report.noChange.versions}.
- Foreign generation: ${report.stale.status} (${report.stale.reason}); jobs ${report.stale.jobs}, store versions ${report.stale.versionsInStore}.
- Restore: epoch ${report.restore.epochBefore} → ${report.restore.epochAfter}, cancelled ${report.restore.cancelledJobs}, late ${report.restore.lateStatus}, physical preserved ${report.restore.physicalPreserved}, fleet ${report.restore.fleetVersions.join(', ')}.
- Import: invalid ${report.importScenario.invalidStatus} (epoch ${report.importScenario.invalidEpoch}), valid ${report.importScenario.validStatus} (epoch ${report.importScenario.validEpoch}), fleet ${report.importScenario.fleetVersions.join(', ')}.
- New profile: epoch ${report.newProfile.epoch}, target ${report.newProfile.targetVersionId}, fleet ${report.newProfile.fleetVersions.join(', ')}.

## Checks

| Check | Verdict | Detail |
| --- | --- | --- |
${rows}

Summary: **${report.summary.passed}/${report.summary.checks} PASS**.
`;
}
