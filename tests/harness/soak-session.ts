/**
 * PBI 159 — sesiune lungă (soak) de memorie, cozi și stabilitatea flotei.
 *
 * Sesiunea rulează **timp de perete real**, la cadența reală de 60 Hz, pe contractele livrate:
 * 057 populație, 058 trafic civil, 059/060 cerere + dispecer, 036 semafoare, 044 context rutier,
 * 024 controller, 022/028 fizică Rapier + contacte, 112 pipeline de learning, 207 recorder,
 * 206/222 checkpoint + pipeline mărginit, 132 retenție cu cote și evacuare, 221 governor de
 * worker-e cu lease de vârstă, plus 054 pentru clasificarea blocajelor de flotă.
 *
 * Fiecare ciclu de lifecycle este: start (construiește lumea) → curse cu intervenții MANUAL/LEARNING
 * → reset (oprește și eliberează runtime-ul, verifică scurgerile) → reload (reconstruiește lumea din
 * starea durabilă și verifică flota). Seria de măsurători este eșantionată la intervale regulate:
 * memorie (heap/RSS), lungimea cozilor (governor, 222, segmente de learning), mărimea retenției
 * (207 + 132), cadența și frecvența CPU raportată de OS.
 *
 * Modulul nu atinge `src/` și nu modifică bugetele din manifest; le citește la construirea raportului.
 */
import { performance } from 'node:perf_hooks';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { createRapierProbe } from '../../src/vehicles/rapier';
import { createVehicleController } from '../../src/vehicles';
import type { BodyIdentity, BodyState, VehicleCommandPacket } from '../../src/vehicles';
import { createCollisionEventAdapter, createEventBus } from '../../src/simulation';
import type { SimulationEvent } from '../../src/simulation';
import { createRoadContext, evaluateBlockedRecovery } from '../../src/autonomy';
import type { BlockedRecoveryState, RoadContextFrame } from '../../src/autonomy';
import { createCandidateProfileStore } from '../../src/learning';
import { getParameterDefinition, parseDrivingProfile } from '../../src/profiles';
import type { DrivingProfile } from '../../src/profiles';
import {
  createCivilTraffic,
  createFleetScenario,
  createProfileActivation,
  createProfileActivationSource,
} from '../../src/fleet';
import type { FleetScenario } from '../../src/fleet';
import { createSignalController } from '../../src/world';
import { createProfilePipeline } from '../../src/app/profile-pipeline';
import type { ProfileLearningSegment, ProfilePipeline } from '../../src/app/profile-pipeline';
import {
  VERTICAL_SLICE_ENGINE_VERSION,
  VERTICAL_SLICE_PLAYER_ID,
  VERTICAL_SLICE_SESSION_ID,
  VERTICAL_SLICE_WORLD_EPOCH,
  verticalSliceBaseParameters,
  verticalSliceLearningSegment,
} from '../../src/app/vertical-slice';
import { createWorldRecorder } from '../../src/replay';
import type { WorldRecorder, WorldRecorderStats } from '../../src/replay';
import { createBoundedPipeline } from '../../src/persistence';
import type {
  BoundedPipeline,
  BoundedPipelineStore,
  BoundedStoreCommit,
} from '../../src/persistence';
import {
  createDataRetention,
  defaultRetentionQuotas,
  retentionDomainOrder,
} from '../../src/persistence/data-retention';
import type {
  RetentionArtifact,
  RetentionDomain,
  RetentionUsageStatus,
} from '../../src/persistence/data-retention';
import type { WorldCaptureInput } from '../../src/persistence';
import { WorkerClient, WorkerResourceGovernor, WorkerRuntime } from '../../src/workers';
import type { Packet, TaskFactory, Transport } from '../../src/workers';
import { governorLimits } from '../../src/workers/governor';
import { createLearningQueueHarness } from './learning-queue-harness';
import { GovernorMemoryStore } from './governor-store';
import { syntheticRouteSearch } from '../simulation/scheduling-reference';
import { percentile } from './hardware-budget';

export const SOAK_VERSION = '159-soak-v1' as const;
export const SOAK_FIXTURE_VERSION = '159-soak-v1' as const;
/** Cerința explicită a PBI-ului: minimum 60 de minute de timp de perete. */
export const SOAK_REQUIRED_MINUTES = 60;
/** Cerința explicită a PBI-ului: 20 de cicluri de lifecycle. */
export const SOAK_REQUIRED_CYCLES = 20;
export const SOAK_DEFAULT_SAMPLE_SECONDS = 30;
export const SOAK_TICK_SECONDS = 1 / 60;
export const SOAK_TAXIS = 24;
export const SOAK_CIVILIANS = 40;
export const SOAK_SEED = 159_001;
export const SOAK_DECISION_CADENCE_TICKS = 6;
export const SOAK_AUTOSAVE_CADENCE_TICKS = 90;
export const SOAK_LEARNING_CADENCE_TICKS = 300;
export const SOAK_MANUAL_WINDOW_TICKS = 300;
export const SOAK_OBSERVATION_HALF_EXTENT_M = 80;
/** Lease-ul de vârstă al joburilor opționale, din contractul 221 (`governorLimits.optionalAgeMs`). */
export const SOAK_STALL_AGE_MS = governorLimits.optionalAgeMs;
/** Pragul de recuperare a cancelării, din manifest (`workerSchedulingProposal.cancellationResponseMaximumMs`). */
export const SOAK_CANCELLATION_TARGET_MS = 100;
/** `regressionProposal.memoryAbsoluteIncreaseBytes` din manifestul 203. */
export const SOAK_MEMORY_PLATEAU_BYTES = 5 * 1024 * 1024;
/** `regressionProposal.memoryRelativeIncrease` din manifestul 203. */
export const SOAK_MEMORY_PLATEAU_RATIO = 0.1;
export const SOAK_PLATEAU_WINDOW_FRACTION = 0.25;

const FIXTURE_NOW = '2026-11-12T00:00:00.000Z';

export interface SoakMemorySample {
  readonly rssBytes: number;
  readonly heapUsedBytes: number;
  readonly heapTotalBytes: number;
  readonly externalBytes: number;
  readonly arrayBuffersBytes: number;
}

export interface SoakQueueSample {
  readonly governorJobs: number;
  readonly governorBytes: number;
  readonly activeHeavyJobs: number;
  readonly protectionRecords: number;
  readonly protectionBytes: number;
  readonly pipelinePreparingBytes: number;
  readonly pipelineTransferringBytes: number;
  readonly pipelineProtectedPending: number;
  readonly pendingLearningSegments: number;
}

export interface SoakRetentionSample {
  readonly recorderChargedBytes: number;
  readonly recorderPeakChargedBytes: number;
  readonly recorderRetainedSamples: number;
  readonly recorderChunksRetained: number;
  readonly retentionArtifacts: number;
  readonly retentionRamBytes: number;
  readonly retentionDbBytes: number;
  readonly retentionEvictions: number;
  readonly retentionStatus: RetentionUsageStatus;
}

export interface SoakFleetSample {
  readonly vehicles: number;
  readonly physicalBodies: number;
  readonly movingBodies: number;
  readonly contacts: number;
  readonly decisions: number;
  readonly manualTicks: number;
}

export interface SoakTimingSample {
  readonly tickCount: number;
  readonly tickP50Ms: number;
  readonly tickP95Ms: number;
  readonly tickMaxMs: number;
  readonly driftMs: number;
  readonly cpuSpeedMhzMin: number | null;
  readonly cpuSpeedMhzMax: number | null;
  readonly cpuSpeedMhzMedian: number | null;
}

export interface SoakMeasurementSample {
  readonly atMs: number;
  readonly cycle: number;
  readonly tick: number;
  readonly simulatedSeconds: number;
  readonly memory: SoakMemorySample;
  readonly queues: SoakQueueSample;
  readonly retention: SoakRetentionSample;
  readonly fleet: SoakFleetSample;
  readonly timing: SoakTimingSample;
}

export type SoakIncidentKind =
  | 'FLEET_BLOCKED'
  | 'WORKER_JOB_EXPIRED'
  | 'WORKER_QUEUE_PRESSURE'
  | 'LEARNING_SEGMENT_STALLED'
  | 'CHECKPOINT_STORE_STALLED'
  | 'RETENTION_OVER_QUOTA';

export interface SoakIncident {
  readonly kind: SoakIncidentKind;
  readonly cycle: number;
  readonly atMs: number;
  readonly detail: string;
  readonly reason: string;
  readonly action: string;
  readonly recovered: boolean;
  readonly recoveryMs: number | null;
  readonly recovery: string;
}

export interface SoakLifecycleCycle {
  readonly index: number;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
  readonly wallMs: number;
  readonly ticks: number;
  readonly simulatedSeconds: number;
  readonly racesDispatched: number;
  readonly racesReleased: number;
  readonly manualInterventions: number;
  readonly manualTicks: number;
  readonly learningSegments: number;
  readonly learningActivations: number;
  readonly workerJobs: number;
  readonly workerStale: number;
  readonly pipelineCommits: number;
  readonly pipelineCommitFailures: number;
  readonly checkpointsOffered: number;
  readonly resetMs: number;
  readonly reloadMs: number;
  readonly peakGovernorJobs: number;
  readonly peakGovernorBytes: number;
  readonly governorJobsAtEnd: number;
  readonly governorBytesAtEnd: number;
  readonly maxCancellationMs: number | null;
  readonly peakRecorderBytes: number;
  readonly peakRetentionBytes: number;
  readonly retentionDbBytesAfterCycle: number;
  readonly retentionArtifactsAfterCycle: number;
  readonly retentionEvictions: number;
  readonly cleanupLeaked: boolean;
  readonly bodiesAfterCleanup: number;
  readonly heapAfterResetBytes: number;
  readonly rssAfterResetBytes: number;
  readonly incidents: number;
  readonly unrecoveredIncidents: number;
}

export interface SoakEnvironment {
  readonly node: string;
  readonly platform: string;
  readonly release: string;
  readonly arch: string;
  readonly cpuModel: string;
  readonly logicalCores: number;
  readonly totalMemoryBytes: number;
  readonly gcAvailable: boolean;
}

export interface SoakProtocol {
  readonly durationMinutes: number;
  readonly cycles: number;
  readonly sampleIntervalSeconds: number;
  readonly seed: number;
  readonly taxis: number;
  readonly civilians: number;
  readonly tickSeconds: number;
  readonly workload: string;
  readonly pacing: 'WALL_CLOCK_60HZ';
  readonly gcBeforeMemorySample: boolean;
}

export interface SoakMeasurement {
  readonly version: typeof SOAK_VERSION;
  readonly fixtureVersion: typeof SOAK_FIXTURE_VERSION;
  readonly commit: string;
  readonly environment: SoakEnvironment;
  readonly protocol: SoakProtocol;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly baseline: SoakMeasurementSample;
  readonly final: SoakMeasurementSample;
  readonly series: readonly SoakMeasurementSample[];
  readonly cycles: readonly SoakLifecycleCycle[];
  readonly incidents: readonly SoakIncident[];
  readonly notes: readonly string[];
}

export interface SoakOptions {
  readonly durationMinutes?: number;
  readonly cycles?: number;
  readonly sampleIntervalSeconds?: number;
  readonly seed?: number;
  readonly pace?: boolean;
  readonly commit?: string;
  readonly gc?: () => void;
  readonly log?: (line: string) => void;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Lifecycle cycles on which the worker lease stall is induced; defaults to 6 and 14. */
  readonly stallCycles?: readonly number[];
}

interface ActorPlan {
  readonly id: string;
  readonly driverKind: 'TAXI' | 'CIVILIAN';
  readonly style: 'PRUDENT' | 'AGGRESSIVE';
  laneId: string;
  cursorM: number;
  readonly contactRole: 'LEADER' | 'FOLLOWER' | null;
}

interface SoakRuntime {
  index: number;
  worldEpoch: number;
  scenario: FleetScenario;
  world: Awaited<ReturnType<typeof createRapierProbe>>;
  bus: ReturnType<typeof createEventBus>;
  road: ReturnType<typeof createRoadContext>;
  signals: ReturnType<typeof createSignalController>;
  collision: ReturnType<typeof createCollisionEventAdapter>;
  controller: ReturnType<typeof createVehicleController>;
  traffic: ReturnType<typeof createCivilTraffic>;
  store: ReturnType<typeof createCandidateProfileStore>;
  pipeline112: ProfilePipeline;
  queueHarness: ReturnType<typeof createLearningQueueHarness>;
  activation: ReturnType<typeof createProfileActivation>;
  recorder: WorldRecorder;
  governor: WorkerResourceGovernor;
  workerRuntime: WorkerRuntime;
  governorStore: GovernorMemoryStore;
  pipeline222: BoundedPipeline;
  pipelineStore: SoakPipelineStore;
  actors: ActorPlan[];
  identities: Map<string, BodyIdentity>;
  states: Map<string, BodyState>;
  laneOrder: Map<string, ActorPlan[]>;
  offs: (() => void)[];
  routeCache: Map<string, readonly string[] | null>;
  tick: number;
  clock: { value: number };
  closed: boolean;
  racesDispatched: number;
  racesReleased: number;
  manualInterventions: number;
  manualTicks: number;
  learningSegments: number;
  learningActivations: number;
  workerJobs: number;
  workerStale: number;
  pipelineCommits: number;
  pipelineCommitFailures: number;
  checkpointsOffered: number;
  peakGovernorJobs: number;
  peakGovernorBytes: number;
  cancelSamples: number[];
  peakRecorderBytes: number;
  peakRetentionBytes: number;
  incidents: SoakIncident[];
  manual: { actorId: string; untilTick: number } | null;
  learnState: { pending: Promise<unknown> | null; closedAt: number | null };
  blocked: Map<string, { sampleIndex: number; state: BlockedRecoveryState; decision: string }>;
  stalledJobs: Map<string, { submittedAt: number; key: string; cancelAt: number | null }>;
  pendingJobs: Set<Promise<unknown>>;
  externalObservations: () => readonly {
    vehicleId: string;
    driverKind: 'TAXI';
    positionM: { x: number; y: number; z: number };
    headingRad: number;
    speedMps: number;
    radiusM: number;
  }[];
  publishContext: (tick: number) => void;
  commandFor: (actor: ActorPlan, tick: number, dtSeconds: number) => VehicleCommandPacket;
  frameOf: (tick: number) => Parameters<WorldRecorder['recordTick']>[0];
  snapshotSource: (tick: number) => Parameters<BoundedPipeline['offerTick']>[0];
}

interface SoakPipelineStore extends BoundedPipelineStore {
  readonly commits: number;
  readonly lastCommittedBytes: number;
}

const EMPTY_QUEUES: SoakQueueSample = Object.freeze({
  governorJobs: 0,
  governorBytes: 0,
  activeHeavyJobs: 0,
  protectionRecords: 0,
  protectionBytes: 0,
  pipelinePreparingBytes: 0,
  pipelineTransferringBytes: 0,
  pipelineProtectedPending: 0,
  pendingLearningSegments: 0,
});

const EMPTY_FLEET: SoakFleetSample = Object.freeze({
  vehicles: 0,
  physicalBodies: 0,
  movingBodies: 0,
  contacts: 0,
  decisions: 0,
  manualTicks: 0,
});

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function headingOf(state: BodyState): number {
  const q = state.transform.rotationQuaternion;
  const forwardX = 2 * (q.x * q.z + q.w * q.y),
    forwardZ = 1 - 2 * (q.x * q.x + q.y * q.y);
  return Math.atan2(forwardZ, forwardX);
}

function speedOf(state: BodyState): number {
  return Math.hypot(state.velocityMps.x, state.velocityMps.z);
}

function laneSample(
  graph: FleetScenario['graph'],
  laneId: string,
  longitudinalM: number,
): { x: number; y: number; z: number; headingRad: number; lengthM: number } | null {
  const path = graph.getDirectedPath(laneId);
  if (!path || path.points.length < 2) return null;
  let remaining = Math.min(Math.max(longitudinalM, 0), path.lengthM);
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const from = path.points[index]!,
      to = path.points[index + 1]!;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length <= 0) continue;
    if (remaining <= length || index === path.points.length - 2) {
      const fraction = Math.min(1, Math.max(0, remaining / length));
      return {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
        z: from.z + (to.z - from.z) * fraction,
        headingRad: Math.atan2(to.z - from.z, to.x - from.x),
        lengthM: path.lengthM,
      };
    }
    remaining -= length;
  }
  const last = path.points[path.points.length - 1]!;
  return { x: last.x, y: last.y, z: last.z, headingRad: 0, lengthM: path.lengthM };
}

function styleProjection(
  store: ReturnType<typeof createCandidateProfileStore>,
  versionId: string,
): DrivingProfile {
  const version = store.getVersion(versionId);
  if (version === null) throw new Error(`Missing base profile version ${versionId}`);
  const parameters: Record<string, number> = Object.create(null),
    unitsByParameter: Record<string, string> = Object.create(null),
    provenanceByParameter: Record<string, string> = Object.create(null),
    evidenceByParameter: Record<string, null> = Object.create(null);
  for (const key of Object.keys(version.parameters)) {
    parameters[key] = version.parameters[key]!;
    unitsByParameter[key] = getParameterDefinition(key).unit;
    provenanceByParameter[key] = 'BASE';
    evidenceByParameter[key] = null;
  }
  return parseDrivingProfile({
    schemaVersion: 1,
    units: 'SI',
    profileId: version.profileId,
    versionId: version.versionId,
    parentVersionId: version.parentVersionId,
    engineVersion: version.engineVersion,
    parameters,
    unitsByParameter,
    provenanceByParameter,
    evidenceByParameter,
    sourceSegmentIds: [...version.sourceSegmentIds],
    createdAt: version.createdAt,
    checksum: version.checksum,
  });
}

/** In-process loopback with real packet routing and a real event-loop boundary per message. */
class LoopbackPair {
  private runtimeReceive: ((value: unknown) => void) | null = null;
  private runtimeError: ((reason: string) => void) | null = null;
  private clientReceive: ((value: unknown) => void) | null = null;
  private clientError: ((reason: string) => void) | null = null;
  private closed = false;
  readonly runtimeTransport: Transport = {
    send: (packet) => {
      if (this.closed) return;
      const handler = this.clientReceive;
      if (handler !== null) setTimeout(() => handler(packet), 0);
    },
    listen: (message, error) => {
      this.runtimeReceive = message;
      this.runtimeError = error;
      return () => {
        this.runtimeReceive = null;
        this.runtimeError = null;
      };
    },
  };
  readonly clientTransport: Transport = {
    send: (packet) => {
      if (this.closed) return;
      const handler = this.runtimeReceive;
      if (handler !== null) setTimeout(() => handler(packet), 0);
    },
    listen: (message, error) => {
      this.clientReceive = message;
      this.clientError = error;
      return () => {
        this.clientReceive = null;
        this.clientError = null;
      };
    },
  };
  close(): void {
    this.closed = true;
    this.runtimeError?.('Loopback closed');
    this.clientError?.('Loopback closed');
    this.runtimeReceive = null;
    this.clientReceive = null;
    this.runtimeError = null;
    this.clientError = null;
  }
}

/** Deterministic synthetic worker tasks: real slices, real deadlines, real cancellation checks. */
function soakTaskFactory(): TaskFactory {
  let worlds = 0;
  return (job) => {
    if (++worlds > 1) throw new Error('World concurrency violated');
    let slices = 0;
    let maxSliceMs = 0;
    const wanted = new Uint32Array(job.buffer)[0] || 1;
    return {
      step(deadline) {
        const start = performance.now();
        if (wanted > 1)
          while (performance.now() < Math.min(deadline, start + 2)) {
            /* CPU slice */
          }
        slices++;
        maxSliceMs = Math.max(maxSliceMs, performance.now() - start);
        return {
          done: slices >= wanted,
          progress: slices / wanted,
          ...(slices >= wanted
            ? { result: new Float64Array([slices, maxSliceMs, worlds]).buffer }
            : {}),
        };
      },
      dispose() {
        worlds--;
      },
    };
  };
}

function createSoakPipelineStore(): SoakPipelineStore {
  let commits = 0;
  let lastCommittedBytes = 0;
  return {
    get commits() {
      return commits;
    },
    get lastCommittedBytes() {
      return lastCommittedBytes;
    },
    handoff(generation) {
      // The durable write is a real asynchronous boundary; ownership of the payload stays here.
      return new Promise<BoundedStoreCommit>((resolve) => {
        setTimeout(() => {
          commits += 1;
          lastCommittedBytes = generation.bytes;
          resolve({
            status: 'COMMITTED',
            generation: generation.generation,
            code: null,
            message: null,
            bytes: generation.bytes,
            factsDurable: generation.protectedFacts.length,
          });
        }, 0);
      });
    },
  };
}

/** 132 ledger: durable replay/telemetry artifacts accumulate and are evicted at their quota. */
class RetentionLedger {
  private artifacts: RetentionArtifact[] = [];
  private sequence = 0;
  private evictions = 0;

  retain(domain: RetentionDomain, kind: RetentionArtifact['kind'], bytes: number): void {
    if (bytes <= 0) return;
    this.artifacts.push(
      Object.freeze({
        artifactId: `${domain.toLowerCase()}-${this.sequence}`,
        domain,
        kind,
        sequence: this.sequence,
        ramBytes: 0,
        dbBytes: bytes,
        clipId: null,
        clipSequence: null,
        protection: null,
        status: 'COMPLETE' as const,
      }),
    );
    this.sequence += 1;
  }

  assess(): {
    artifacts: number;
    ramBytes: number;
    dbBytes: number;
    evictions: number;
    status: RetentionUsageStatus;
  } {
    const retention = createDataRetention({
      artifacts: this.artifacts,
      quotas: defaultRetentionQuotas(),
    });
    const assessment = retention.assess();
    return {
      artifacts: assessment.domains.reduce((total, domain) => total + domain.artifacts, 0),
      ramBytes: assessment.domains.reduce((total, domain) => total + domain.ramBytes, 0),
      dbBytes: assessment.domains.reduce((total, domain) => total + domain.dbBytes, 0),
      evictions: this.evictions,
      status: assessment.status,
    };
  }

  /** Real 132 cleanup: export the domain first, then apply the eviction plan at the quota. */
  cleanup(): { evicted: number; bytes: number } {
    let evicted = 0;
    let bytes = 0;
    for (const domain of retentionDomainOrder) {
      const retention = createDataRetention({
        artifacts: this.artifacts,
        quotas: defaultRetentionQuotas(),
      });
      const assessment = retention.assess();
      const usage = assessment.domains.find((entry) => entry.domain === domain);
      if (!usage || usage.status === 'WITHIN') continue;
      const exported = retention.exportDomain(domain);
      const planned = retention.planCleanup({
        domain,
        criterion: 'OLDEST_FIRST',
        exportDigest: exported.checksum.value,
        stopAtQuota: true,
      });
      if (planned.status !== 'PLANNED') continue;
      const applied = retention.applyCleanup(planned.plan);
      if (applied.status !== 'APPLIED') continue;
      const removed = new Set(applied.evicted.map((entry) => entry.artifactId));
      this.artifacts = this.artifacts.filter((artifact) => !removed.has(artifact.artifactId));
      evicted += applied.evicted.length;
      bytes += applied.evictedBytes.db;
      this.evictions += applied.evicted.length;
    }
    return { evicted, bytes };
  }
}

function createMeasurementSample(input: {
  atMs: number;
  cycle: number;
  tick: number;
  memory: SoakMemorySample;
  queues: SoakQueueSample;
  retention: SoakRetentionSample;
  fleet: SoakFleetSample;
  timing: SoakTimingSample;
}): SoakMeasurementSample {
  return Object.freeze({
    atMs: Math.round(input.atMs),
    cycle: input.cycle,
    tick: input.tick,
    simulatedSeconds: Math.round(input.tick * SOAK_TICK_SECONDS * 1000) / 1000,
    memory: Object.freeze({ ...input.memory }),
    queues: Object.freeze({ ...input.queues }),
    retention: Object.freeze({ ...input.retention }),
    fleet: Object.freeze({ ...input.fleet }),
    timing: Object.freeze({ ...input.timing }),
  });
}

function cpuSpeed(): { min: number | null; max: number | null; median: number | null } {
  const speeds = cpus()
    .map((cpu) => cpu.speed)
    .filter((speed) => Number.isFinite(speed) && speed > 0);
  if (speeds.length === 0) return { min: null, max: null, median: null };
  return {
    min: Math.min(...speeds),
    max: Math.max(...speeds),
    median: percentile(speeds, 0.5),
  };
}

function memoryOf(): SoakMemorySample {
  const usage = process.memoryUsage();
  return Object.freeze({
    rssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    heapTotalBytes: usage.heapTotal,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  });
}

function identityOf(
  rt: SoakRuntime,
  jobId: string,
  segmentId: string,
  priority: Packet['priority'],
  buffer: ArrayBuffer,
): Packet {
  return {
    jobId,
    segmentId,
    baseVersionId: `soak-base-${rt.index}`,
    profileId: `profile-soak-${rt.index}`,
    learningEpoch: 1,
    sessionId: `soak-session-${rt.index}`,
    worldEpoch: rt.worldEpoch,
    type: 'start',
    sequence: 0,
    payloadBytes: buffer.byteLength,
    ownership: 'copy',
    priority,
    buffer,
  };
}

/** Real 207 chunk bytes are handed to the 132 ledger; the recorder keeps its RAM window bounded. */
function retainCycleArtifacts(ledger: RetentionLedger, rt: SoakRuntime): void {
  const stats = rt.recorder.getStats();
  ledger.retain('WORLD_RECORDER', 'REPLAY_CHUNK', stats.chargedBytes);
}

async function openRuntime(input: {
  index: number;
  seed: number;
  ledger: RetentionLedger;
  log: (line: string) => void;
}): Promise<SoakRuntime> {
  const { index, seed } = input;
  const worldEpoch = index;
  const context = {
    schemaVersion: 1,
    units: 'SI',
    sessionId: `soak-session-${index}`,
    worldEpoch,
  } as const;
  const scope = { sessionId: context.sessionId, worldEpoch };
  const scenario = createFleetScenario({
    taxiCount: SOAK_TAXIS,
    civilianCount: SOAK_CIVILIANS,
    seed: seed + index,
    scenarioId: `soak159-cycle-${index}`,
    sessionId: context.sessionId,
    worldEpoch,
  });
  const world = await createRapierProbe();
  const bus = createEventBus(scope);
  const road = createRoadContext(scenario.map);
  const signals = createSignalController(scenario.map, { context, eventBus: bus });
  const collision = createCollisionEventAdapter({ context, physics: world, eventBus: bus });
  const controller = createVehicleController(context, world);
  const profileId = scenario.configuration.profile.profileId;
  const baseVersionId = `soak-base-${index}`;
  const store = createCandidateProfileStore({
    engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
    now: () => FIXTURE_NOW,
  });
  const base = store.createBase({
    profileId,
    versionId: baseVersionId,
    parameters: verticalSliceBaseParameters(),
    createdAt: FIXTURE_NOW,
  });
  if (base.status !== 'ACCEPTED') throw new Error('Soak base style version rejected by 109');
  const baseStyle = styleProjection(store, baseVersionId);
  const clock = { value: 0 };
  const activation = createProfileActivation({
    registry: scenario.registry,
    source: createProfileActivationSource({ profileId, versionId: baseVersionId }),
    engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
    clock: () => clock.value,
    now: () => FIXTURE_NOW,
  });
  const queueHarness = createLearningQueueHarness({ engineVersion: VERTICAL_SLICE_ENGINE_VERSION });
  const pipeline112 = createProfilePipeline({
    engineVersion: VERTICAL_SLICE_ENGINE_VERSION,
    playerId: VERTICAL_SLICE_PLAYER_ID,
    profileId,
    learningEpoch: 1,
    sessionId: VERTICAL_SLICE_SESSION_ID,
    worldEpoch: VERTICAL_SLICE_WORLD_EPOCH,
    queue: queueHarness.queue,
    store,
    activation,
    tick: () => clock.value,
  });
  const traffic = createCivilTraffic({
    registry: scenario.registry,
    map: scenario.map,
    graph: scenario.graph,
    planner: scenario.planner,
    styleSource: { activeStyle: (): DrivingProfile => baseStyle },
    seed,
  });
  const recorder = createWorldRecorder({
    sessionId: `soak-session-${index}`,
    worldEpoch,
    versions: {
      engineVersion: 'babylon-9.29.0',
      physicsVersion: 'rapier-0.21.0',
      mapVersion: `map-soak-${SOAK_TAXIS}x${SOAK_CIVILIANS}`,
    },
    pinBeforeSeconds: 5,
    pinAfterSeconds: 5,
    now: () => FIXTURE_NOW,
  });
  const loopback = new LoopbackPair();
  const workerRuntime = new WorkerRuntime(loopback.runtimeTransport, soakTaskFactory());
  const governorStore = new GovernorMemoryStore();
  const governor = new WorkerResourceGovernor(
    new WorkerClient(loopback.clientTransport, () => ({
      baseVersionId,
      profileId,
      learningEpoch: 1,
      sessionId: `soak-session-${index}`,
      worldEpoch,
    })),
    governorStore,
  );
  const pipelineStore = createSoakPipelineStore();
  const pipeline222 = createBoundedPipeline({
    store: pipelineStore,
    sessionId: `soak-session-${index}`,
    checkpointId: `soak-checkpoint-${index}`,
    versions: {
      engineVersion: 'babylon-9.29.0',
      physicsVersion: 'rapier-0.21.0',
      mapVersion: `map-soak-${SOAK_TAXIS}x${SOAK_CIVILIANS}`,
    },
    now: () => FIXTURE_NOW,
  });

  const civilLanes = scenario.map.lanes
    .filter((lane) => lane.access.includes('CIVIL'))
    .map((lane) => lane.id)
    .sort();
  const actors: ActorPlan[] = [];
  const identities = new Map<string, BodyIdentity>();
  const states = new Map<string, BodyState>();
  const offs: (() => void)[] = [];
  const routeCache = new Map<string, readonly string[] | null>();
  const laneOrder = new Map<string, ActorPlan[]>();

  const primaryLane = (id: string, fallbackIndex: number): string => {
    const taxiLane = scenario.positions.laneFor(id);
    if (taxiLane) return taxiLane;
    return civilLanes[fallbackIndex % Math.max(civilLanes.length, 1)]!;
  };

  scenario.taxiIds.forEach((id, actorIndex) =>
    actors.push({
      id,
      driverKind: 'TAXI',
      style: actorIndex % 3 === 1 ? 'AGGRESSIVE' : 'PRUDENT',
      laneId: primaryLane(id, actorIndex),
      cursorM: (actorIndex % 7) * 6,
      contactRole: actorIndex === 1 ? 'FOLLOWER' : actorIndex === 0 ? 'LEADER' : null,
    }),
  );
  scenario.civilianIds.forEach((id, actorIndex) => {
    actors.push({
      id,
      driverKind: 'CIVILIAN',
      style: actorIndex % 3 === 1 ? 'AGGRESSIVE' : 'PRUDENT',
      laneId: civilLanes[(actorIndex + scenario.taxiIds.length) % Math.max(civilLanes.length, 1)]!,
      cursorM: (actorIndex % 7) * 6,
      contactRole: null,
    });
  });

  const planById = new Map(actors.map((actor) => [actor.id, actor]));
  const initialPositions = new Map<string, { x: number; z: number }>();
  actors.forEach((actor, actorIndex) => {
    const lane = laneSample(scenario.graph, actor.laneId, actor.cursorM);
    const position = lane
      ? { x: lane.x, y: 0.85, z: lane.z }
      : { x: (actorIndex % 10) * 2.4 - 12, y: 0.85, z: Math.floor(actorIndex / 10) * 6 };
    world.addClassCar(actor.id, position, actorIndex % 2 ? 'compact' : 'sedan');
    const identity = world.bodyIdentity(actor.id)!;
    const heading = lane?.headingRad ?? 0;
    const halfTurn = (Math.PI / 2 - heading) / 2;
    world.setPose(identity, {
      positionM: { ...position },
      rotationQuaternion: { x: 0, y: Math.sin(halfTurn), z: 0, w: Math.cos(halfTurn) },
    });
    identities.set(actor.id, identity);
    controller.register(identity);
    initialPositions.set(actor.id, { x: position.x, z: position.z });
    offs.push(world.subscribeBody(identity, (state) => states.set(actor.id, state)));
  });

  /* Declared fixture obstacles: enough real contacts for the recorder and the blocked-recovery path. */
  world.addBox({ x: 0, y: 1, z: 44 }, { x: 22, y: 1, z: 0.6 });
  world.addBox({ x: -14, y: 1, z: 22 }, { x: 0.6, y: 1, z: 12 });
  for (let debris = 0; debris < 24; debris += 1)
    world.addBox(
      { x: (debris % 6) * 0.8 - 2.5, y: 0.4 + Math.floor(debris / 6) * 0.65, z: 38 },
      { x: 0.35, y: 0.35, z: 0.35 },
    );

  const spawnPoints = [...initialPositions.values()];
  const minX = Math.min(...spawnPoints.map((point) => point.x));
  const maxX = Math.max(...spawnPoints.map((point) => point.x));
  const minZ = Math.min(...spawnPoints.map((point) => point.z));
  const maxZ = Math.max(...spawnPoints.map((point) => point.z));
  world.addBox(
    { x: (minX + maxX) / 2, y: -0.5, z: (minZ + maxZ) / 2 },
    { x: (maxX - minX) / 2 + 80, y: 0.5, z: (maxZ - minZ) / 2 + 80 },
  );

  const observationCenter = initialPositions.get(actors[0]!.id)!;
  const invisibleVehicleIds = new Set(
    actors
      .map((actor) => actor.id)
      .filter((id) => {
        const position = initialPositions.get(id)!;
        return (
          Math.abs(position.x - observationCenter.x) > SOAK_OBSERVATION_HALF_EXTENT_M ||
          Math.abs(position.z - observationCenter.z) > SOAK_OBSERVATION_HALF_EXTENT_M
        );
      }),
  );

  const refreshLaneOrder = (): void => {
    for (const list of laneOrder.values()) list.length = 0;
    for (const actor of actors) {
      let list = laneOrder.get(actor.laneId);
      if (!list) {
        list = [];
        laneOrder.set(actor.laneId, list);
      }
      list.push(actor);
    }
    for (const list of laneOrder.values()) list.sort((left, right) => right.cursorM - left.cursorM);
  };
  refreshLaneOrder();

  const externalVehicleObservations = () =>
    actors
      .filter((actor) => actor.driverKind === 'TAXI')
      .map((actor) => {
        const state = states.get(actor.id)!;
        return {
          vehicleId: actor.id,
          driverKind: 'TAXI' as const,
          positionM: state.transform.positionM,
          headingRad: headingOf(state),
          speedMps: speedOf(state),
          radiusM: 1.8,
        };
      });

  const commandFor = (
    rt: SoakRuntime,
    actor: ActorPlan,
    tick: number,
    dtSeconds: number,
  ): VehicleCommandPacket => {
    const state = states.get(actor.id)!;
    const speed = speedOf(state);
    actor.cursorM += speed * dtSeconds;
    let lane = laneSample(scenario.graph, actor.laneId, actor.cursorM);
    if (!lane || actor.cursorM >= lane.lengthM) {
      const successors = scenario.graph.getSuccessors(
        actor.laneId,
        actor.driverKind === 'TAXI' ? 'TAXI' : 'CIVIL',
      );
      actor.laneId = successors.length ? successors[0]!.id : actor.laneId;
      actor.cursorM = 0;
      lane = laneSample(scenario.graph, actor.laneId, 0);
    }
    const ahead = laneSample(scenario.graph, actor.laneId, actor.cursorM + 9);
    const target = ahead ?? lane;
    const style =
      actor.style === 'AGGRESSIVE'
        ? { cruiseMps: 13, minimumGapM: 1.6, headwayS: 0.35 }
        : { cruiseMps: 8, minimumGapM: 4.5, headwayS: 1.1 };
    let desired = style.cruiseMps;
    const snapshot = traffic.get(actor.id);
    if (snapshot) desired = Math.min(desired, 2);
    const order = laneOrder.get(actor.laneId) ?? [];
    const orderIndex = order.indexOf(actor);
    if (orderIndex > 0) {
      const leader = order[orderIndex - 1]!;
      const gap = leader.cursorM - actor.cursorM;
      const minimum = style.minimumGapM + speed * style.headwayS * 0.1;
      if (gap < minimum) desired = Math.min(desired, Math.max(0, speed - 2.5));
    }
    const heading = headingOf(state);
    const wanted = target ? target.headingRad : heading;
    let error = wanted - heading;
    while (error > Math.PI) error -= 2 * Math.PI;
    while (error < -Math.PI) error += 2 * Math.PI;
    const player =
      rt.manual !== null && rt.manual.actorId === actor.id && tick < rt.manual.untilTick;
    const throttle = player
      ? clamp(0.55 + 0.35 * Math.sin(tick / 37), 0, 1)
      : actor.contactRole === 'FOLLOWER'
        ? clamp((desired - speed) * 0.55, 0, 1)
        : clamp((desired - speed) * 0.55, 0, 1);
    const brake = player
      ? clamp(0.2 + 0.2 * Math.cos(tick / 53), 0, 1)
      : actor.contactRole === 'LEADER'
        ? 0.35
        : desired < speed - 0.4
          ? clamp((speed - desired) * 0.45, 0, 1)
          : 0;
    return {
      identity: identities.get(actor.id)!,
      command: {
        ...context,
        vehicleId: actor.id,
        tick,
        source: player ? ('PLAYER' as const) : ('AUTONOMY' as const),
        throttle: Math.round(throttle * 1000) / 1000,
        brake: Math.round(brake * 1000) / 1000,
        steering:
          Math.round(
            clamp(error * 0.55 + (player ? Math.sin(tick / 41) * 0.12 : 0), -1, 1) * 1000,
          ) / 1000,
        handbrake: false,
        turnSignal: 'OFF' as const,
      },
    };
  };

  const publishContext = (tick: number): void => {
    const frame: RoadContextFrame = {
      ...scope,
      tick,
      vehicles: actors
        .map((actor) => {
          const state = states.get(actor.id)!;
          const plan = planById.get(actor.id)!;
          return {
            id: actor.id,
            incarnation: identities.get(actor.id)!.generation,
            positionM: state.transform.positionM,
            headingRad: headingOf(state),
            access: plan.driverKind === 'TAXI' ? ('TAXI' as const) : ('CIVIL' as const),
            speedMps: speedOf(state),
            radiusM: 1.2,
            route: null,
            distances: [],
          };
        })
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)),
      obstacles: [],
      zones: [],
      signals: [],
      completeness: { vehicles: true, obstacles: false, zones: false, signals: false },
    };
    road.updateFrame(frame);
  };

  const frameOf = (tick: number) => ({
    tick,
    vehicles: actors.map((actor, actorIndex) => {
      const state = states.get(actor.id)!;
      return {
        entityId: actor.id,
        handle: actorIndex + 1,
        vehicleClass: (actor.driverKind === 'TAXI' ? 'TAXI' : 'CIVILIAN') as 'TAXI' | 'CIVILIAN',
        controlMode: (rt.manual !== null &&
        rt.manual.actorId === actor.id &&
        tick < rt.manual.untilTick
          ? 'MANUAL'
          : 'AUTO') as 'AUTO' | 'MANUAL',
        position: { ...state.transform.positionM },
        rotation: { ...state.transform.rotationQuaternion },
        linearVelocity: { ...state.velocityMps },
        fsmState: 'CRUISE',
        rideId: null,
        passengerIds: [],
        inCamera: !invisibleVehicleIds.has(actor.id),
      };
    }),
    signals: [] as {
      signalId: string;
      phase: 'GREEN' | 'YELLOW' | 'RED';
      remainingTicks: number;
    }[],
  });

  const snapshotSource = (tick: number) => ({
    tick,
    boundary: 'BOUNDARY' as const,
    capture: (): WorldCaptureInput => {
      const controllers = [...states.values()].map((state) => ({
        entityId: state.identity.entityId,
        fsmState: 'CRUISE',
        fsmStateTick: tick,
        controlMode: 'AUTO' as const,
        targetSpeed: speedOf(state),
        laneOffset: 0,
        memory: { integrator: 0, ticks_in_state: 0 },
      }));
      const vehicles = [...states.values()].map((state, bodyIndex) => ({
        entityId: state.identity.entityId,
        handle: bodyIndex + 1,
        vehicleClass: (planById.get(state.identity.entityId)?.driverKind === 'TAXI'
          ? 'TAXI'
          : 'CIVILIAN') as 'TAXI' | 'CIVILIAN',
        position: { ...state.transform.positionM },
        rotation: { ...state.transform.rotationQuaternion },
        linearVelocity: { ...state.velocityMps },
        angularVelocity: { x: 0, y: 0, z: 0 },
        controlMode: 'AUTO' as const,
        fsmState: 'CRUISE',
        routeId: 'route-159-fixture',
        routeNodeIndex: 0,
        routeProgress: 0,
        segmentId: null,
        rideId: null,
        passengerIds: [] as string[],
      }));
      return {
        tick,
        tickBoundary: 'BOUNDARY',
        subsystemTicks: {
          physics: tick,
          controllers: tick,
          rides: tick,
          passengers: tick,
          opportunities: tick,
          signals: tick,
          dispatch: tick,
          learning: tick,
          rng: tick,
        },
        worldEpoch,
        profile: { profileId, activeVersionId: baseVersionId, activationSequence: 0 },
        vehicles,
        controllers,
        rides: [],
        passengers: [],
        segments: [],
        opportunities: [],
        signals: [],
        dispatch: { pending: [], acceptedResults: [] },
        learning: {
          learningEpoch: 1,
          pendingJobs: [],
          completedObservations: [],
          acceptedResultKeys: [],
        },
        rng: { seed, streams: { traffic: 0, rideDemand: 0, opportunities: 0 } },
        dedup: { lastEventSequence: 0, seenEventIds: [] },
      };
    },
  });

  const rt: SoakRuntime = {
    index,
    worldEpoch,
    scenario,
    world,
    bus,
    road,
    signals,
    collision,
    controller,
    traffic,
    store,
    pipeline112,
    queueHarness,
    activation,
    recorder,
    governor,
    workerRuntime,
    governorStore,
    pipeline222,
    pipelineStore,
    actors,
    identities,
    states,
    laneOrder,
    offs,
    routeCache,
    tick: 0,
    clock,
    closed: false,
    racesDispatched: 0,
    racesReleased: 0,
    manualInterventions: 0,
    manualTicks: 0,
    learningSegments: 0,
    learningActivations: 0,
    workerJobs: 0,
    workerStale: 0,
    pipelineCommits: 0,
    pipelineCommitFailures: 0,
    checkpointsOffered: 0,
    peakGovernorJobs: 0,
    peakGovernorBytes: 0,
    cancelSamples: [],
    peakRecorderBytes: 0,
    peakRetentionBytes: 0,
    incidents: [],
    manual: null,
    learnState: { pending: null, closedAt: null },
    blocked: new Map(),
    stalledJobs: new Map(),
    pendingJobs: new Set(),
    externalObservations: externalVehicleObservations,
    publishContext,
    commandFor: (actor, tick, dtSeconds) => commandFor(rt, actor, tick, dtSeconds),
    frameOf,
    snapshotSource,
  };

  offs.push(
    bus.subscribe((event: SimulationEvent) => {
      if (event.type === 'COLLISION') recorder.recordEvent(event);
    }),
  );
  world.publishBodies(0, false);
  signals.step(0);
  traffic.step({ tick: 0, dtSeconds: SOAK_TICK_SECONDS, vehicles: externalVehicleObservations() });
  publishContext(0);

  input.log(
    `[soak] ciclul ${index}: start (${scenario.taxiIds.length} taxiuri, ${scenario.civilianIds.length} civili, epoch ${worldEpoch})`,
  );
  return rt;
}

async function closeRuntime(rt: SoakRuntime): Promise<{
  resetMs: number;
  cleanupLeaked: boolean;
  bodiesAfterCleanup: number;
}> {
  if (rt.closed) return { resetMs: 0, cleanupLeaked: false, bodiesAfterCleanup: 0 };
  rt.closed = true;
  const started = performance.now();
  if (rt.learnState.pending !== null) {
    await Promise.race([
      rt.learnState.pending.catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  await Promise.race([
    rt.pipeline222.drain(),
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ]);
  for (const off of rt.offs) off();
  rt.recorder.dispose();
  rt.pipeline222.dispose();
  rt.pipeline112.dispose();
  rt.queueHarness.dispose();
  rt.activation.dispose();
  rt.store.dispose();
  rt.collision.dispose();
  rt.signals.dispose();
  rt.road.dispose();
  rt.controller.dispose();
  rt.bus.dispose();
  rt.scenario.dispose();
  rt.governor.dispose();
  rt.workerRuntime.dispose();
  rt.world.dispose();
  const resources = rt.world.bodyResources();
  return {
    resetMs: performance.now() - started,
    cleanupLeaked: resources.entities !== 0 || resources.subscriptions !== 0,
    bodiesAfterCleanup: resources.entities,
  };
}

function recordSample(
  rt: SoakRuntime | null,
  input: {
    ledger: RetentionLedger;
    atMs: number;
    cycle: number;
    tickDurations: readonly number[];
    driftMs: number;
    simulatedSeconds: number;
    gc?: () => void;
  },
): SoakMeasurementSample {
  input.gc?.();
  const memory = memoryOf();
  const speed = cpuSpeed();
  const queues: SoakQueueSample =
    rt === null
      ? EMPTY_QUEUES
      : Object.freeze({
          governorJobs: rt.governor.usage.jobs,
          governorBytes: rt.governor.usage.bytes,
          activeHeavyJobs: rt.governor.usage.activeHeavyJobs,
          protectionRecords: rt.governorStore.usage.records,
          protectionBytes: rt.governorStore.usage.bytes,
          pipelinePreparingBytes: rt.pipeline222.stats().buffers.preparingBytes,
          pipelineTransferringBytes: rt.pipeline222.stats().buffers.transferringBytes,
          pipelineProtectedPending: rt.pipeline222.stats().protected.pending,
          pendingLearningSegments: rt.learnState.pending === null ? 0 : 1,
        });
  const retentionAssessment = input.ledger.assess();
  const recorderStats: WorldRecorderStats | null = rt === null ? null : rt.recorder.getStats();
  const retention: SoakRetentionSample = Object.freeze({
    recorderChargedBytes: recorderStats?.chargedBytes ?? 0,
    recorderPeakChargedBytes: recorderStats?.peakChargedBytes ?? 0,
    recorderRetainedSamples: recorderStats?.retainedSamples ?? 0,
    recorderChunksRetained: recorderStats?.chunksRetained ?? 0,
    retentionArtifacts: retentionAssessment.artifacts,
    retentionRamBytes: retentionAssessment.ramBytes,
    retentionDbBytes: retentionAssessment.dbBytes,
    retentionEvictions: retentionAssessment.evictions,
    retentionStatus: retentionAssessment.status,
  });
  const fleet: SoakFleetSample =
    rt === null
      ? EMPTY_FLEET
      : Object.freeze({
          vehicles: rt.actors.length,
          physicalBodies: rt.world.bodyResources().entities,
          movingBodies: rt.actors.filter((actor) => {
            const state = rt.states.get(actor.id);
            return state !== undefined && speedOf(state) > 0.05;
          }).length,
          contacts: rt.world.contacts(),
          decisions: rt.road.getContext(rt.actors[0]!.id) === null ? 0 : 1,
          manualTicks: rt.manualTicks,
        });
  const durations = [...input.tickDurations];
  const timing: SoakTimingSample = Object.freeze({
    tickCount: durations.length,
    tickP50Ms: durations.length ? percentile(durations, 0.5) : 0,
    tickP95Ms: durations.length ? percentile(durations, 0.95) : 0,
    tickMaxMs: durations.length ? Math.max(...durations) : 0,
    driftMs: Math.round(input.driftMs),
    cpuSpeedMhzMin: speed.min,
    cpuSpeedMhzMax: speed.max,
    cpuSpeedMhzMedian: speed.median,
  });
  return createMeasurementSample({
    atMs: input.atMs,
    cycle: input.cycle,
    tick: rt?.tick ?? 0,
    memory,
    queues,
    retention,
    fleet,
    timing,
  });
}

/**
 * Runs the real soak. Nothing here simulates wall time: the loop is paced against the process clock
 * and a cycle closes only when its reserved wall-clock slot has actually elapsed.
 */
export async function runSoak(options: SoakOptions = {}): Promise<SoakMeasurement> {
  const now = options.now ?? (() => performance.now());
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = options.log ?? (() => {});
  const durationMinutes = options.durationMinutes ?? SOAK_REQUIRED_MINUTES;
  const cycles = options.cycles ?? SOAK_REQUIRED_CYCLES;
  const sampleIntervalSeconds = options.sampleIntervalSeconds ?? SOAK_DEFAULT_SAMPLE_SECONDS;
  const seed = options.seed ?? SOAK_SEED;
  const pace = options.pace ?? true;
  const stallCycles = options.stallCycles ?? Object.freeze([6, 14]);
  if (!(durationMinutes > 0)) throw new RangeError('A soak needs a positive duration');
  if (!Number.isInteger(cycles) || cycles < 1)
    throw new RangeError('A soak needs at least one cycle');
  if (!(sampleIntervalSeconds > 0)) throw new RangeError('A soak needs a positive sample interval');

  const protocol: SoakProtocol = Object.freeze({
    durationMinutes,
    cycles,
    sampleIntervalSeconds,
    seed,
    taxis: SOAK_TAXIS,
    civilians: SOAK_CIVILIANS,
    tickSeconds: SOAK_TICK_SECONDS,
    workload: `${SOAK_TAXIS} taxiuri / ${SOAK_CIVILIANS} civili (workload normal V1)`,
    pacing: 'WALL_CLOCK_60HZ',
    gcBeforeMemorySample: options.gc !== undefined,
  });
  const environment: SoakEnvironment = Object.freeze({
    node: process.version,
    platform: platform(),
    release: release(),
    arch: arch(),
    cpuModel: cpus()[0]?.model?.trim() ?? 'unknown',
    logicalCores: cpus().length,
    totalMemoryBytes: totalmem(),
    gcAvailable: options.gc !== undefined,
  });
  const startedAt = new Date().toISOString();
  const started = now();
  const durationMs = durationMinutes * 60_000;
  const slotMs = durationMs / cycles;
  const resetReserveMs = clamp(slotMs * 0.12, 600, 6000);
  const ledger = new RetentionLedger();
  const series: SoakMeasurementSample[] = [];
  const cycleRecords: SoakLifecycleCycle[] = [];
  const incidents: SoakIncident[] = [];
  const notes: string[] = [];
  const tickDurationWindow: number[] = [];
  const sampleIntervalMs = sampleIntervalSeconds * 1000;
  let nextSampleAt = started + sampleIntervalMs;
  let nextStallCheckAt = started;

  const baseline = recordSample(null, {
    ledger,
    atMs: 0,
    cycle: 0,
    tickDurations: [],
    driftMs: 0,
    simulatedSeconds: 0,
    gc: options.gc,
  });
  log(
    `[soak] baseline: rss ${(baseline.memory.rssBytes / 1048576).toFixed(1)} MiB, heap ${(
      baseline.memory.heapUsedBytes / 1048576
    ).toFixed(1)} MiB, ${cycles} cicluri, ${durationMinutes} min`,
  );

  let rt = await openRuntime({ index: 1, seed, ledger, log });

  for (let cycleIndex = 1; cycleIndex <= cycles; cycleIndex += 1) {
    const cycleStarted = now();
    const previousTick = rt.tick;
    const cycleSlotEnd = started + cycleIndex * slotMs;
    const raceEnd = cycleSlotEnd - (cycleIndex < cycles ? resetReserveMs : 0);
    const paceAnchorWall = cycleStarted;
    const paceAnchorTick = rt.tick;

    while (true) {
      rt.tick += 1;
      const tick = rt.tick;
      const tickStarted = now();
      if (tick % 20 === 0) {
        for (const list of rt.laneOrder.values()) list.length = 0;
        for (const actor of rt.actors) {
          let list = rt.laneOrder.get(actor.laneId);
          if (!list) {
            list = [];
            rt.laneOrder.set(actor.laneId, list);
          }
          list.push(actor);
        }
        for (const list of rt.laneOrder.values())
          list.sort((left, right) => right.cursorM - left.cursorM);
      }

      if (tick % SOAK_DECISION_CADENCE_TICKS === 0) {
        for (const actor of rt.actors) {
          rt.road.getContext(actor.id);
          const key = `route:${actor.id}`;
          if (!rt.routeCache.has(key))
            rt.routeCache.set(key, syntheticRouteSearch(rt.scenario.graph, 'west-in', 'west-out'));
        }
      }
      rt.traffic.step({
        tick,
        dtSeconds: SOAK_TICK_SECONDS,
        vehicles: rt.actors
          .filter((actor) => actor.driverKind === 'TAXI')
          .map((actor) => {
            const state = rt.states.get(actor.id)!;
            return {
              vehicleId: actor.id,
              driverKind: 'TAXI' as const,
              positionM: state.transform.positionM,
              headingRad: headingOf(state),
              speedMps: speedOf(state),
              radiusM: 1.8,
            };
          }),
      });
      if (tick % SOAK_DECISION_CADENCE_TICKS === 0) {
        rt.scenario.demand.advance(tick);
        for (const active of rt.scenario.dispatcher.assignments()) {
          if (tick - active.tick >= 90) {
            rt.scenario.dispatcher.release(active.taxiId, 'COMPLETED', tick);
            rt.racesReleased += 1;
          }
        }
        const before = rt.scenario.dispatcher.assignments().length;
        rt.scenario.dispatcher.step({ tick, maxAssignments: 4 });
        rt.racesDispatched += Math.max(0, rt.scenario.dispatcher.assignments().length - before);
      }

      if (rt.manual === null && tick % 1800 === 900) {
        const actor = rt.actors.find((entry) => entry.driverKind === 'TAXI')!;
        rt.manual = { actorId: actor.id, untilTick: tick + SOAK_MANUAL_WINDOW_TICKS };
        rt.manualInterventions += 1;
      }
      if (rt.manual !== null && tick >= rt.manual.untilTick) rt.manual = null;
      if (rt.manual !== null) rt.manualTicks += 1;

      const packets = rt.actors.map((actor) => rt.commandFor(actor, tick, SOAK_TICK_SECONDS));
      rt.collision.beforePhysicsStep(tick);
      rt.controller.step({ tick, dtSeconds: SOAK_TICK_SECONDS }, packets, [], true);
      rt.collision.captureAfterPhysicsStep(tick);
      rt.world.publishBodies(tick, true);
      rt.signals.step(tick);
      if (tick % SOAK_DECISION_CADENCE_TICKS === 0) rt.publishContext(tick);
      rt.recorder.recordTick(rt.frameOf(tick));
      if (tick % SOAK_AUTOSAVE_CADENCE_TICKS === 0) {
        const offered = rt.pipeline222.offerTick(rt.snapshotSource(tick));
        if (offered.status !== 'REJECTED') rt.checkpointsOffered += 1;
      }
      if (tick % SOAK_LEARNING_CADENCE_TICKS === 0 && rt.learnState.pending === null) {
        const ordinal = rt.learningSegments + 1;
        rt.learningSegments += 1;
        const segment: ProfileLearningSegment = verticalSliceLearningSegment({
          scenario: ordinal % 2 ? 'PRUDENT' : 'RECKLESS',
          segmentId: `${rt.index}:segment:${ordinal}`,
          order: ordinal,
          interventionId: `${rt.index}:intervention:${ordinal}`,
          reason: `soak 159 cycle ${rt.index} segment ${ordinal}`,
        });
        rt.queueHarness.plan(segment.segmentId, 'result');
        const closedAt = now();
        rt.learnState.closedAt = closedAt;
        rt.learnState.pending = rt.pipeline112
          .onSegmentClosed(segment)
          .then(() => undefined)
          .catch(() => undefined)
          .finally(() => {
            rt.learnState.pending = null;
            rt.learnState.closedAt = null;
          });
        rt.pendingJobs.add(rt.learnState.pending);
        if (rt.learnState.pending !== null)
          void rt.learnState.pending.finally(() => rt.pendingJobs.delete(rt.learnState.pending!));
        const learningBuffer = new Uint32Array([1]).buffer;
        const learningPacket = identityOf(
          rt,
          String(++rt.workerJobs),
          segment.segmentId,
          'interactive',
          learningBuffer,
        );
        rt.workerJobs += 1;
        const admission = await rt.governor.submit(learningPacket, 'learning');
        if (admission.ticket) {
          rt.pendingJobs.add(admission.ticket.outcome);
          void admission.ticket.outcome.finally(() =>
            rt.pendingJobs.delete(admission.ticket!.outcome),
          );
        }
      }
      if (tick % (SOAK_LEARNING_CADENCE_TICKS * 2) === 0) {
        const comparison = new Uint32Array([4]).buffer;
        const packet = identityOf(
          rt,
          String(++rt.workerJobs),
          `comparison-${rt.index}-${tick}`,
          'optional',
          comparison,
        );
        rt.workerJobs += 1;
        const admission = await rt.governor.submit(packet, 'comparison');
        if (admission.ticket) {
          rt.pendingJobs.add(admission.ticket.outcome);
          void admission.ticket.outcome.finally(() =>
            rt.pendingJobs.delete(admission.ticket!.outcome),
          );
        }
      }
      rt.clock.value = tick;
      const step = rt.pipeline112.advance();
      if (step?.status === 'APPLIED') rt.learningActivations += 1;

      /* Explicit cancellation path: a running optional job is cancelled and the response measured. */
      if (tick % 600 === 0) {
        const cancelBuffer = new Uint32Array([200]).buffer;
        const packet = identityOf(
          rt,
          String(++rt.workerJobs),
          `cancel-${rt.index}-${tick}`,
          'optional',
          cancelBuffer,
        );
        rt.workerJobs += 1;
        const admission = await rt.governor.submit(packet, 'comparison');
        if (admission.ticket) {
          const ticket = admission.ticket;
          const key = ticket.key;
          /* Cancel only once the job is actually executing, so the response is a real interrupt. */
          const startedCancel = now();
          const poll = setInterval(() => {
            if (ticket.state === 'RUNNING' || now() - startedCancel > 2000) {
              clearInterval(poll);
              rt.governor.cancel(key);
            }
          }, 10);
          rt.pendingJobs.add(ticket.outcome);
          void ticket.outcome
            .then(() => {
              const measurement = rt.governor.measurements
                .filter((entry) => entry.key === key)
                .at(-1);
              if (measurement?.cancellationMs !== null && measurement?.cancellationMs !== undefined)
                rt.cancelSamples.push(measurement.cancellationMs);
            })
            .catch(() => undefined)
            .finally(() => rt.pendingJobs.delete(ticket.outcome));
        }
      }
      rt.peakGovernorJobs = Math.max(rt.peakGovernorJobs, rt.governor.usage.jobs);
      rt.peakGovernorBytes = Math.max(rt.peakGovernorBytes, rt.governor.usage.bytes);
      rt.peakRecorderBytes = Math.max(rt.peakRecorderBytes, rt.recorder.getStats().chargedBytes);

      const tickMs = now() - tickStarted;
      tickDurationWindow.push(tickMs);

      /* Induce a real worker stall twice per soak: the lease must reclaim it and the governor must
         return to zero usage afterwards. */
      if (stallCycles.includes(cycleIndex) && tick === previousTick + 30) {
        const stallBuffer = new Uint32Array([20_000]).buffer;
        const packet = identityOf(
          rt,
          String(++rt.workerJobs),
          `stall-${rt.index}`,
          'optional',
          stallBuffer,
        );
        rt.workerJobs += 1;
        const admission = await rt.governor.submit(packet, 'comparison');
        if (admission.ticket) {
          const submittedAt = now();
          const key = admission.ticket.key;
          rt.stalledJobs.set(key, { submittedAt, key, cancelAt: null });
          const ticket = admission.ticket;
          rt.pendingJobs.add(ticket.outcome);
          void ticket.outcome
            .then((outcome) => {
              const entry = rt.stalledJobs.get(key);
              if (entry === undefined) return;
              rt.stalledJobs.delete(key);
              const endToEndMs = now() - entry.submittedAt;
              if (outcome.status === 'stale' || endToEndMs >= SOAK_STALL_AGE_MS) {
                rt.workerStale += 1;
                rt.incidents.push(
                  Object.freeze({
                    kind: 'WORKER_JOB_EXPIRED',
                    cycle: rt.index,
                    atMs: Math.round(now() - started),
                    detail: `job opțional ${key} a depășit lease-ul de ${SOAK_STALL_AGE_MS} ms (status ${outcome.status})`,
                    reason: 'LEASE_EXPIRED',
                    action: 'RECLAIM_VIA_LEASE',
                    recovered: rt.governor.usage.jobs === 0,
                    recoveryMs: null,
                    recovery: 'lease-ul 221 a reclamat jobul; governor.usage.jobs = 0',
                  }),
                );
              }
            })
            .catch(() => undefined)
            .finally(() => rt.pendingJobs.delete(ticket.outcome));
        }
      }

      /* Real sampling: memory, queues, retention, fleet and throttling evidence. */
      const wall = now();
      if (wall >= nextSampleAt) {
        const sample = recordSample(rt, {
          ledger,
          atMs: wall - started,
          cycle: cycleIndex,
          tickDurations: tickDurationWindow.splice(0, tickDurationWindow.length),
          driftMs: wall - cycleStarted - ((tick - previousTick) * 1000) / 60,
          simulatedSeconds: tick * SOAK_TICK_SECONDS,
          gc: options.gc,
        });
        series.push(sample);
        log(
          `[soak] ${new Date().toISOString()} ciclu ${cycleIndex} t=${tick} heap=${(
            sample.memory.heapUsedBytes / 1048576
          ).toFixed(1)} MiB rss=${(sample.memory.rssBytes / 1048576).toFixed(1)} MiB cozi=${
            sample.queues.governorJobs
          } retenție=${(sample.retention.retentionDbBytes / 1048576).toFixed(1)} MiB tickP95=${sample.timing.tickP95Ms.toFixed(
            2,
          )} ms`,
        );
        nextSampleAt += sampleIntervalMs;
        if (nextSampleAt <= wall) nextSampleAt = wall + sampleIntervalMs;
      }

      /* Fleet blocks: a taxi that has not moved for two consecutive samples is a reported block. */
      if (wall >= nextStallCheckAt && cycleIndex >= 1) {
        nextStallCheckAt = wall + sampleIntervalMs;
        const sampleIndex = Math.round((wall - started) / sampleIntervalMs);
        for (const actor of rt.actors) {
          if (actor.driverKind !== 'TAXI') continue;
          const state = rt.states.get(actor.id);
          if (state === undefined) continue;
          const stagnant = speedOf(state) < 0.3;
          const entry = rt.blocked.get(actor.id);
          if (!stagnant) {
            rt.blocked.delete(actor.id);
            continue;
          }
          if (entry === undefined) {
            rt.blocked.set(actor.id, {
              sampleIndex,
              state: {
                stagnantSinceTick: rt.tick,
                stagnantTicks: 0,
                blockedSinceTick: rt.tick,
                stage: 'WAITING',
                rerouteAttempts: 0,
                lastRerouteTick: null,
                escalatedTick: null,
                clearTicks: 0,
                lastDecisionTick: null,
              },
              decision: '',
            });
            continue;
          }
          if (sampleIndex - entry.sampleIndex < 1) continue;
          const decision = evaluateBlockedRecovery({
            sessionId: `soak-session-${rt.index}`,
            worldEpoch: rt.worldEpoch,
            actor: { id: actor.id, incarnation: rt.identities.get(actor.id)!.generation },
            decisionTick: rt.tick,
            graph: rt.scenario.graph,
            observation: {
              version: '054-progress-observation-v1',
              units: 'SI',
              tick: rt.tick,
              access: 'TAXI',
              speedMps: speedOf(state),
              laneId: actor.laneId,
              positionM: state.transform.positionM,
              headingRad: headingOf(state),
              leaderId: null,
              leaderGapM: null,
              leaderSpeedMps: null,
              routeStatus: 'READY',
              blockedLaneAheadId: null,
              planner: {
                origin: actor.laneId,
                destination: 'west-out',
                access: 'TAXI',
                graphVersion: '159-soak-graph-v1',
                costVersion: '159-soak-cost-v1',
                blocked: [],
              },
              allowRecoveryEscalation: true,
            },
            state: entry.state,
          });
          entry.state = decision.state;
          entry.decision = `${decision.reason}/${decision.action}`;
          if (sampleIndex - entry.sampleIndex >= 2) {
            /* Declared fixture recovery at the 030 port: place the actor at the start of a real 033
               successor lane and let 024/022 drive it again. */
            const successors = rt.scenario.graph.getSuccessors(actor.laneId, 'TAXI');
            const targetLane = successors[0]?.id ?? actor.laneId;
            const point = laneSample(rt.scenario.graph, targetLane, 0);
            if (point !== null) {
              const heading = point.headingRad;
              const halfTurn = (Math.PI / 2 - heading) / 2;
              rt.world.setPose(rt.identities.get(actor.id)!, {
                positionM: { x: point.x, y: 0.85, z: point.z },
                rotationQuaternion: {
                  x: 0,
                  y: Math.sin(halfTurn),
                  z: 0,
                  w: Math.cos(halfTurn),
                },
              });
              actor.laneId = targetLane;
              actor.cursorM = 0;
              rt.incidents.push(
                Object.freeze({
                  kind: 'FLEET_BLOCKED',
                  cycle: cycleIndex,
                  atMs: Math.round(wall - started),
                  detail: `taxi ${actor.id} nemișcat ${Math.round(
                    (sampleIndex - entry.sampleIndex) * sampleIntervalSeconds,
                  )} s`,
                  reason: entry.decision,
                  action: 'REQUEST_REROUTE',
                  recovered: true,
                  recoveryMs: Math.round((sampleIndex - entry.sampleIndex) * sampleIntervalMs),
                  recovery: `repoziționat la începutul benzii ${targetLane} (portul 030 al fixture-ului)`,
                }),
              );
              rt.blocked.delete(actor.id);
            }
          }
        }
      }

      // Pacing: the loop keeps the 60 Hz wall-clock cadence; a slow machine reports the drift.
      if (pace && tick % 6 === 0) {
        const target = paceAnchorWall + (tick - paceAnchorTick) * (1000 / 60);
        const ahead = target - now();
        if (ahead > 2) await sleep(Math.min(ahead, 1000));
      }
      if (wall >= raceEnd) break;
      if (wall - started > durationMs * 1.5) throw new Error('Soak exceeded its wall-clock guard');
    }

    const cycleEnded = now();
    const cycleStats = rt.recorder.getStats();
    retainCycleArtifacts(ledger, rt);
    let retentionAfter = ledger.assess();
    if (retentionAfter.status !== 'WITHIN') {
      const before = retentionAfter;
      const cleanup = ledger.cleanup();
      retentionAfter = ledger.assess();
      rt.incidents.push(
        Object.freeze({
          kind: 'RETENTION_OVER_QUOTA',
          cycle: cycleIndex,
          atMs: Math.round(cycleEnded - started),
          detail: `retenția ${before.status}: ${before.artifacts} artefacte, ${(
            before.dbBytes / 1048576
          ).toFixed(1)} MiB`,
          reason: 'QUOTA_EXCEEDED',
          action: 'EXPORT_THEN_EVICT_OLDEST',
          recovered: retentionAfter.status === 'WITHIN',
          recoveryMs: null,
          recovery: `132 a evitat ${cleanup.evicted} artefacte (${(cleanup.bytes / 1048576).toFixed(
            1,
          )} MiB)`,
        }),
      );
    }
    rt.peakRetentionBytes = Math.max(rt.peakRetentionBytes, retentionAfter.dbBytes);

    // Settle the real queues before the reset so "blocked queue" is measured, not assumed.
    await Promise.race([
      Promise.allSettled([...rt.pendingJobs]),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
    const governorAtEnd = rt.governor.usage;
    const cycleCancellations = rt.cancelSamples.length ? Math.max(...rt.cancelSamples) : null;
    rt.cancelSamples.length = 0;

    const closed = await closeRuntime(rt);
    const resetDoneAt = now();
    options.gc?.();
    const resetMemory = memoryOf();

    cycleRecords.push(
      Object.freeze({
        index: cycleIndex,
        startedAtMs: Math.round(cycleStarted - started),
        finishedAtMs: Math.round(resetDoneAt - started),
        wallMs: Math.round(resetDoneAt - cycleStarted),
        ticks: rt.tick - previousTick,
        simulatedSeconds: Math.round((rt.tick - previousTick) * SOAK_TICK_SECONDS * 1000) / 1000,
        racesDispatched: rt.racesDispatched,
        racesReleased: rt.racesReleased,
        manualInterventions: rt.manualInterventions,
        manualTicks: rt.manualTicks,
        learningSegments: rt.learningSegments,
        learningActivations: rt.learningActivations,
        workerJobs: rt.workerJobs,
        workerStale: rt.workerStale,
        pipelineCommits: rt.pipeline222.stats().generations.committed,
        pipelineCommitFailures: rt.pipeline222.stats().generations.commitRejections,
        checkpointsOffered: rt.checkpointsOffered,
        resetMs: Math.round(closed.resetMs),
        reloadMs: 0,
        peakGovernorJobs: rt.peakGovernorJobs,
        peakGovernorBytes: rt.peakGovernorBytes,
        governorJobsAtEnd: governorAtEnd.jobs,
        governorBytesAtEnd: governorAtEnd.bytes,
        maxCancellationMs: cycleCancellations === null ? null : Math.round(cycleCancellations),
        peakRecorderBytes: cycleStats.peakChargedBytes,
        peakRetentionBytes: retentionAfter.dbBytes,
        retentionDbBytesAfterCycle: retentionAfter.dbBytes,
        retentionArtifactsAfterCycle: retentionAfter.artifacts,
        retentionEvictions: retentionAfter.evictions,
        cleanupLeaked: closed.cleanupLeaked,
        bodiesAfterCleanup: closed.bodiesAfterCleanup,
        heapAfterResetBytes: resetMemory.heapUsedBytes,
        rssAfterResetBytes: resetMemory.rssBytes,
        incidents: rt.incidents.length,
        unrecoveredIncidents: rt.incidents.filter((incident) => !incident.recovered).length,
      }),
    );
    incidents.push(...rt.incidents);
    log(
      `[soak] ciclu ${cycleIndex}/${cycles} închis: ${Math.round(
        (resetDoneAt - cycleStarted) / 1000,
      )} s, ${rt.tick - previousTick} tick-uri, reset ${Math.round(closed.resetMs)} ms, scurgeri ${
        closed.cleanupLeaked ? 'DA' : 'nu'
      }, incidente ${rt.incidents.length}`,
    );

    if (cycleIndex < cycles) {
      const reloadStarted = now();
      rt = await openRuntime({ index: cycleIndex + 1, seed, ledger, log });
      const record = cycleRecords[cycleRecords.length - 1]!;
      const reloadMs = Math.round(now() - reloadStarted);
      const last = cycleRecords.length - 1;
      cycleRecords[last] = Object.freeze({
        ...record,
        reloadMs,
        finishedAtMs: Math.round(now() - started),
      });
      const counts = rt.scenario.registry.counts();
      if (counts.taxis !== SOAK_TAXIS || counts.civilians !== SOAK_CIVILIANS)
        throw new Error(
          `Reload ${cycleIndex + 1} restored ${counts.taxis}/${counts.civilians} instead of ${SOAK_TAXIS}/${SOAK_CIVILIANS}`,
        );
    }
  }

  const finalSample = recordSample(null, {
    ledger,
    atMs: now() - started,
    cycle: cycles,
    tickDurations: [],
    driftMs: 0,
    simulatedSeconds: 0,
    gc: options.gc,
  });
  const finishedAt = new Date().toISOString();
  const actualDurationMs = now() - started;
  if (actualDurationMs < durationMs)
    notes.push(
      `durata reală ${Math.round(actualDurationMs)} ms este sub ținta de ${durationMs} ms`,
    );
  if (incidents.length === 0) notes.push('niciun incident blocat: cozile și flota au rămas curate');
  notes.push(
    `baseline-ul de memorie a fost citit înainte de prima lume; finalul după ultimul reset (heap forcible GC: ${
      options.gc !== undefined ? 'da' : 'nu'
    })`,
  );

  return Object.freeze({
    version: SOAK_VERSION,
    fixtureVersion: SOAK_FIXTURE_VERSION,
    commit: options.commit ?? 'unknown',
    environment,
    protocol,
    startedAt,
    finishedAt,
    durationMs: Math.round(actualDurationMs),
    baseline,
    final: finalSample,
    series: Object.freeze(series),
    cycles: Object.freeze(cycleRecords),
    incidents: Object.freeze(incidents),
    notes: Object.freeze(notes),
  });
}
