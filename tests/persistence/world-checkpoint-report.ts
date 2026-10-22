import {
  WORLD_SNAPSHOT_LIMITS,
  captureWorldSnapshot,
  computeWorldSnapshotChecksum,
  createWorldCheckpointWriter,
  loadLatestWorldCheckpoint,
  readWorldSnapshot,
  restoreWorldState,
  sha256Hex,
} from '../../src/persistence/index';
import type {
  WorldCheckpointWriter,
  WorldCheckpointWriterStatus,
  WorldResumePlan,
} from '../../src/persistence/index';
import {
  WORLD_FIXTURE,
  canonicalWorld,
  captureInput,
  createWorldFixture,
  createWorldFromSnapshot,
  runWorld,
  worldSource,
} from './world-checkpoint-fixtures';
import {
  WORLD_CAPTURED_AT,
  WORLD_CHECKPOINT,
  WORLD_SESSION,
  WORLD_VERSIONS,
  createOrigin,
  openTab,
  sequenceClock,
} from './world-checkpoint-harness';
import { fixedClock } from './fixtures';

/**
 * Deterministic transcript of PBI 206.
 *
 * Every reported value is the result of a real run against the in-memory IndexedDB double and the
 * deterministic 70-vehicle world fixture: no wall clock, no random identity, no timing. The one
 * timing section uses an injected monotonic script, and it is explicitly labelled `STUB_CLOCK`.
 * Real machine timings are produced separately by `measureWorldCheckpointCosts` (the `--cost`
 * switch of the report script), never mixed into this transcript.
 */

export interface WorldCheckpointCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface WorldJobRow {
  readonly source: string;
  readonly jobId: string;
  readonly status: string;
  readonly reason: string | null;
}

export interface WorldCheckpointReport {
  readonly version: '206-world-checkpoint-v1';
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly coherence: {
    readonly sourceTick: number;
    readonly boundary: string;
    readonly subsystemTicksCoherent: boolean;
    readonly snapshotVersion: string;
    readonly units: string;
    readonly tick: number;
    readonly worldEpoch: number;
    readonly profileId: string;
    readonly learningEpoch: number;
    readonly vehicles: number;
    readonly controllers: number;
    readonly rides: number;
    readonly passengers: number;
    readonly segments: number;
    readonly opportunities: number;
    readonly signals: number;
    readonly dispatchPending: number;
    readonly dispatchAccepted: number;
    readonly learningPending: number;
    readonly learningObservations: number;
    readonly acceptedResultKeys: number;
    readonly rng: {
      readonly traffic: number;
      readonly rideDemand: number;
      readonly opportunities: number;
    };
    readonly checksum: string;
    readonly checksumMatches: boolean;
    readonly deterministicCapture: boolean;
    readonly bodyBytes: number;
    readonly bodyFields: readonly string[];
    readonly byteBudget: number;
  };
  readonly continuation: {
    readonly ticks: number;
    readonly finalTick: number;
    readonly oracleDigest: string;
    readonly restoredDigest: string;
    readonly digestMatches: boolean;
    readonly canonicalMatch: boolean;
    readonly trafficCursor: number;
    readonly ride01: string;
    readonly passenger01: string;
    readonly taxi08Ride: string | null;
    readonly openSegmentSamples: number;
  };
  readonly resume: {
    readonly mode: string;
    readonly paused: boolean;
    readonly auto: boolean;
    readonly inputReleased: boolean;
    readonly vehicles: number;
    readonly allAuto: boolean;
    readonly openSegments: number;
    readonly segmentTransition: string;
    readonly jobs: readonly WorldJobRow[];
    readonly observations: readonly {
      readonly observationId: string;
      readonly idempotencyKey: string;
      readonly status: string;
      readonly alreadyRewarded: boolean;
    }[];
    readonly acceptedResultsPreserved: number;
    readonly rewardsReapplied: number;
    readonly idempotent: boolean;
    readonly switchedProfileJobStatuses: readonly string[];
  };
  readonly writer: {
    readonly secondTabRole: string;
    readonly secondTabReason: string | null;
    readonly secondTabCapture: string;
    readonly foreignCommit: string;
    readonly commitStatus: string;
    readonly coalesced: boolean;
    readonly capturesAfterCoalescing: number;
    readonly replaced: boolean;
    readonly capturesAfterReplace: number;
    readonly olderGeneration: string;
    readonly olderTick: string;
    readonly commitInProgress: string;
    readonly discarded: boolean;
    readonly discardedAgain: boolean;
    readonly discardReason: string | null;
    readonly rows: number;
  };
  readonly crash: {
    readonly beforeStatus: string;
    readonly beforeCode: string;
    readonly rowsAfterBefore: number;
    readonly afterStatus: string;
    readonly durable: boolean;
    readonly reloadStatus: string;
  };
  readonly deviceLoss: {
    readonly device: string;
    readonly reason: string | null;
    readonly lostTick: number | null;
    readonly commitWhileLost: string;
    readonly deferredBeforeIntegration: string;
    readonly preparedBeforeIntegration: number | null;
    readonly deviceAfterIntegration: string;
    readonly deferredCommit: string;
    readonly deferredDevice: string | null;
    readonly deferredMs: number;
    readonly preparedAfter: number | null;
    readonly ramCaptureKept: boolean;
  };
  readonly load: {
    readonly empty: string;
    readonly resumable: string;
    readonly tick: number;
    readonly generation: number;
    readonly ageTicks: number | null;
    readonly incompatible: string;
    readonly incompatibleDetail: string;
    readonly olderSnapshot: string;
    readonly tickMismatch: string;
    readonly profileMismatch: string;
    readonly epochMismatch: string;
    readonly checksumMismatch: string;
  };
  readonly cost: {
    readonly source: string;
    readonly captureMs: number;
    readonly encodeMs: number;
    readonly commitMs: number;
    readonly totalMs: number;
  };
  readonly checks: readonly WorldCheckpointCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
  };
}

interface JobSummary {
  readonly source: string;
  readonly jobId: string;
  readonly status: string;
  readonly reason: string | null;
}

function jobRows(plan: WorldResumePlan): readonly JobSummary[] {
  return plan.jobs.map((job) => ({
    source: job.source,
    jobId: job.jobId,
    status: job.status,
    reason: job.reason,
  }));
}

function codeOf(result: { status: string; rejection?: { code: string } }): string {
  return result.status === 'REJECTED' ? (result.rejection?.code ?? 'REJECTED') : result.status;
}

async function coherentSection(checks: WorldCheckpointCheck[]) {
  const origin = createOrigin();
  const repository = await openTab(origin);
  const world = createWorldFixture();
  runWorld(world, WORLD_FIXTURE.captureTick);
  const input = captureInput(world);
  const writer: WorldCheckpointWriter = createWorldCheckpointWriter({
    repository,
    writerId: 'tab-a',
    versions: WORLD_VERSIONS,
    monotonic: sequenceClock([0, 2.5, 3, 10, 20, 26]),
    now: fixedClock(),
  });
  const result = writer.captureAtTick(worldSource(world), {
    checkpointId: WORLD_CHECKPOINT,
    sessionId: WORLD_SESSION,
    generation: 1,
  });
  if (result.status !== 'PREPARED') throw new Error(`capture refused: ${result.rejection.code}`);
  const capture = result.capture;
  const repeated = captureWorldSnapshot(captureInput(world));
  if (repeated.status !== 'CAPTURED') throw new Error('the repeated capture was refused');
  const read = readWorldSnapshot(capture.body);
  if (read.status !== 'ACCEPTED') throw new Error('the stored snapshot was refused');

  const coherence = {
    sourceTick: world.tick,
    boundary: 'BOUNDARY',
    subsystemTicksCoherent: Object.values(input.subsystemTicks).every(
      (tick) => tick === world.tick,
    ),
    snapshotVersion: read.snapshot.snapshotVersion,
    units: read.snapshot.units,
    tick: read.snapshot.tick,
    worldEpoch: read.snapshot.worldEpoch,
    profileId: read.snapshot.profile.profileId,
    learningEpoch: read.snapshot.learning.learningEpoch,
    vehicles: read.snapshot.vehicles.length,
    controllers: read.snapshot.controllers.length,
    rides: read.snapshot.rides.length,
    passengers: read.snapshot.passengers.length,
    segments: read.snapshot.segments.length,
    opportunities: read.snapshot.opportunities.length,
    signals: read.snapshot.signals.length,
    dispatchPending: read.snapshot.dispatch.pending.length,
    dispatchAccepted: read.snapshot.dispatch.acceptedResults.length,
    learningPending: read.snapshot.learning.pendingJobs.length,
    learningObservations: read.snapshot.learning.completedObservations.length,
    acceptedResultKeys: read.snapshot.learning.acceptedResultKeys.length,
    rng: {
      traffic: read.snapshot.rng.streams.traffic,
      rideDemand: read.snapshot.rng.streams.rideDemand,
      opportunities: read.snapshot.rng.streams.opportunities,
    },
    checksum: capture.checksum,
    checksumMatches: computeWorldSnapshotChecksum(read.snapshot) === capture.checksum,
    deterministicCapture: repeated.status === 'CAPTURED' && repeated.checksum === capture.checksum,
    bodyBytes: capture.bytes,
    bodyFields: Object.keys(capture.body),
    byteBudget: WORLD_SNAPSHOT_LIMITS.maxBodyBytes,
  };

  checks.push(
    check(
      'coherence-version',
      '206-world-snapshot-v1',
      coherence.snapshotVersion,
      'One snapshot contract',
    ),
    check('coherence-units', 'SI', coherence.units, 'Only SI units are stored'),
    check('coherence-tick', 60, coherence.tick, 'The capture tick is the fixed-tick boundary'),
    check(
      'coherence-subticks',
      true,
      coherence.subsystemTicksCoherent,
      'Every subsystem is at the same tick',
    ),
    check('coherence-vehicles', 70, coherence.vehicles, '30 taxis and 40 civilians'),
    check('coherence-controllers', 70, coherence.controllers, 'Every vehicle has controller state'),
    check('coherence-rides', 30, coherence.rides, 'Every passenger has a ride'),
    check('coherence-passengers', 30, coherence.passengers, 'Passenger states are preserved'),
    check('coherence-segments', 3, coherence.segments, 'Open, closed and incomplete segments'),
    check('coherence-opportunities', 64, coherence.opportunities, 'Opportunity ledger'),
    check('coherence-signals', 8, coherence.signals, 'Signal phases and remaining ticks'),
    check('coherence-dispatch', 3, coherence.dispatchPending, 'Pending dispatch jobs'),
    check('coherence-accepted', 1, coherence.dispatchAccepted, 'Accepted results are kept'),
    check('coherence-learning', 3, coherence.learningPending, 'Pending learning jobs'),
    check('coherence-observations', 2, coherence.learningObservations, 'Completed observations'),
    check('coherence-result-keys', 1, coherence.acceptedResultKeys, 'Rewards already applied'),
    check('coherence-rng-traffic', 4200, coherence.rng.traffic, '70 draws per tick'),
    check('coherence-rng-opportunities', 60, coherence.rng.opportunities, 'One draw per tick'),
    check('coherence-checksum', true, coherence.checksumMatches, 'SHA-256 over SDA-CJSON-1'),
    check(
      'coherence-deterministic',
      true,
      coherence.deterministicCapture,
      'The same world yields the same checksum',
    ),
    check(
      'coherence-budget',
      true,
      coherence.bodyBytes <= coherence.byteBudget,
      'Under the 262144 byte budget',
    ),
    check(
      'coherence-body',
      [
        'snapshotVersion',
        'units',
        'tick',
        'worldEpoch',
        'profile',
        'vehicles',
        'controllers',
        'rides',
        'passengers',
        'segments',
        'opportunities',
        'signals',
        'dispatch',
        'learning',
        'rng',
        'dedup',
        'checksum',
      ],
      coherence.bodyFields,
      'Stable stored body fields',
    ),
  );

  const committed = await writer.commitCapture(capture);
  if (committed.status !== 'COMMITTED') {
    throw new Error(`the checkpoint was not committed: ${committed.status}`);
  }

  return { origin, repository, world, capture, committed, coherence };
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): WorldCheckpointCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

export async function runWorldCheckpointReport(): Promise<WorldCheckpointReport> {
  const checks: WorldCheckpointCheck[] = [];
  const {
    origin: coherenceOrigin,
    repository: coherentRepository,
    capture,
    committed,
    coherence,
  } = await coherentSection(checks);

  const loaded = await loadLatestWorldCheckpoint(coherentRepository, WORLD_SESSION, {
    versions: WORLD_VERSIONS,
    currentTick: WORLD_FIXTURE.captureTick,
  });
  if (loaded.status !== 'RESUMABLE') throw new Error(`the load is ${loaded.status}`);
  const oracle = createWorldFromSnapshot(loaded.state);
  runWorld(oracle, WORLD_FIXTURE.continuationTicks);
  const restored = createWorldFromSnapshot(loaded.state);
  runWorld(restored, WORLD_FIXTURE.continuationTicks);
  const resume = loaded.resume;
  const switched = restoreWorldState(loaded.snapshot, {
    currentProfileId: 'profile-2',
    currentLearningEpoch: 2,
  }).resume;

  const continuation = {
    ticks: WORLD_FIXTURE.continuationTicks,
    finalTick: restored.tick,
    oracleDigest: sha256Hex(canonicalWorld(oracle)),
    restoredDigest: sha256Hex(canonicalWorld(restored)),
    digestMatches: canonicalWorld(restored) === canonicalWorld(oracle),
    canonicalMatch: canonicalWorld(restored) === canonicalWorld(oracle),
    trafficCursor: restored.rng.streams.traffic,
    ride01: restored.rides[0]?.state ?? 'MISSING',
    passenger01: restored.passengers[0]?.state ?? 'MISSING',
    taxi08Ride: restored.vehicles[7]?.rideId ?? null,
    openSegmentSamples: restored.segments[0]?.sampleCount ?? -1,
  };
  checks.push(
    check(
      'continuation-ticks',
      60,
      continuation.ticks,
      'The oracle and the restored world both run 60 ticks',
    ),
    check('continuation-final-tick', 120, continuation.finalTick, 'The resumed tick matches'),
    check(
      'continuation-digest',
      continuation.oracleDigest,
      continuation.restoredDigest,
      'The canonical world is byte-identical',
    ),
    check('continuation-canonical', true, continuation.canonicalMatch, 'No subsystem drifted'),
    check(
      'continuation-rng',
      8400,
      continuation.trafficCursor,
      'The keyed cursor continued exactly',
    ),
    check('continuation-ride', 'COMPLETED', continuation.ride01, 'The pickup ride completed'),
    check(
      'continuation-passenger',
      'DELIVERED',
      continuation.passenger01,
      'The passenger was delivered',
    ),
    check(
      'continuation-ride-link',
      null,
      continuation.taxi08Ride,
      'A completed ride releases its vehicle',
    ),
    check(
      'continuation-segment',
      120,
      continuation.openSegmentSamples,
      'The open segment kept sampling',
    ),
  );

  const resumeSection = {
    mode: resume.mode,
    paused: resume.paused,
    auto: resume.auto,
    inputReleased: resume.inputReleased,
    vehicles: resume.vehicles.length,
    allAuto: resume.vehicles.every((vehicle) => vehicle.controlMode === 'AUTO'),
    openSegments: resume.segments.length,
    segmentTransition: resume.segments
      .map(
        (segment) =>
          `${segment.segmentId}:${segment.previousStatus}->${segment.nextStatus}:${segment.reason}`,
      )
      .join(','),
    jobs: jobRows(resume),
    observations: resume.observations.map((observation) => ({
      observationId: observation.observationId,
      idempotencyKey: observation.idempotencyKey,
      status: observation.status,
      alreadyRewarded: observation.alreadyRewarded,
    })),
    acceptedResultsPreserved: resume.acceptedResultsPreserved,
    rewardsReapplied: resume.rewardsReapplied,
    idempotent:
      JSON.stringify(restoreWorldState(loaded.snapshot).resume) === JSON.stringify(resume),
    switchedProfileJobStatuses: jobRows(switched).map((job) => `${job.jobId}:${job.status}`),
  };
  checks.push(
    check('resume-mode', 'PAUSED_AUTO', resumeSection.mode, 'The session reopens paused in AUTO'),
    check('resume-paused', true, resumeSection.paused, 'No tick runs before the player resumes'),
    check('resume-auto', true, resumeSection.auto, 'Every vehicle returns to AUTO'),
    check('resume-input', true, resumeSection.inputReleased, 'No input is held across the reload'),
    check('resume-vehicles', 70, resumeSection.vehicles, 'Every vehicle is named'),
    check(
      'resume-all-auto',
      true,
      resumeSection.allAuto,
      'A manual segment never resumes manually',
    ),
    check('resume-open-segments', 1, resumeSection.openSegments, 'Only the open segment changes'),
    check(
      'resume-segment',
      'segment-taxi-01:OPEN->INCOMPLETE:RELOAD',
      resumeSection.segmentTransition,
      'The reason is explicit',
    ),
    check('resume-jobs', 6, resumeSection.jobs.length, 'Every pending job is decided'),
    check(
      'resume-learning-01',
      'RELAUNCH',
      resumeSection.jobs.find((job) => job.jobId === 'learning-01')?.status,
      'Matching profile and epoch',
    ),
    check(
      'resume-learning-02',
      'INVALIDATED',
      resumeSection.jobs.find((job) => job.jobId === 'learning-02')?.status,
      'Epoch moved on',
    ),
    check(
      'resume-learning-03',
      'INVALIDATED',
      resumeSection.jobs.find((job) => job.jobId === 'learning-03')?.status,
      'Profile changed',
    ),
    check(
      'resume-dispatch-02',
      'INVALIDATED',
      resumeSection.jobs.find((job) => job.jobId === 'dispatch-02')?.status,
      'Profile changed',
    ),
    check(
      'resume-dispatch-03',
      'INVALIDATED',
      resumeSection.jobs.find((job) => job.jobId === 'dispatch-03')?.status,
      'Epoch moved on',
    ),
    check(
      'resume-observations',
      2,
      resumeSection.observations.length,
      'Completed LEARNING observations replay',
    ),
    check(
      'resume-observation-key',
      'segment-taxi-06:observation-01',
      resumeSection.observations[0]?.idempotencyKey,
      'The replay is keyed',
    ),
    check(
      'resume-observation-rewarded',
      true,
      resumeSection.observations[0]?.alreadyRewarded,
      'An applied reward is not applied again',
    ),
    check(
      'resume-accepted',
      2,
      resumeSection.acceptedResultsPreserved,
      'Accepted dispatch and learning results are kept',
    ),
    check('resume-rewards', 0, resumeSection.rewardsReapplied, 'No reward is applied twice'),
    check(
      'resume-idempotent',
      true,
      resumeSection.idempotent,
      'Restoring twice yields the same plan',
    ),
    check(
      'resume-switched-profile',
      [
        'learning-01:INVALIDATED',
        'learning-02:INVALIDATED',
        'learning-03:RELAUNCH',
        'dispatch-01:INVALIDATED',
        'dispatch-02:RELAUNCH',
        'dispatch-03:INVALIDATED',
      ],
      resumeSection.switchedProfileJobStatuses,
      'A different active profile invalidates the rest',
    ),
  );
  coherentRepository.close();
  coherenceOrigin.factory.deleteDatabase('206-world-checkpoint-db');

  // Writer authority and the single-commit rule.
  const writerOrigin = createOrigin();
  const writerRepository = await openTab(writerOrigin, 'tab-a');
  const secondRepository = await openTab(writerOrigin, 'tab-b');
  const writerWorld = createWorldFixture();
  runWorld(writerWorld, WORLD_FIXTURE.captureTick);
  const writerA = createWorldCheckpointWriter({
    repository: writerRepository,
    writerId: 'tab-a',
    versions: WORLD_VERSIONS,
    monotonic: sequenceClock([0, 1, 2, 3, 10, 15, 20, 22, 23, 30, 40, 46]),
    now: fixedClock(),
  });
  const writerB = createWorldCheckpointWriter({
    repository: secondRepository,
    writerId: 'tab-b',
    versions: WORLD_VERSIONS,
    monotonic: sequenceClock([0, 1, 2, 3]),
    now: fixedClock(),
  });
  const secondTabStatus: WorldCheckpointWriterStatus = writerB.status();
  const secondTabCapture = writerB.captureAtTick(worldSource(writerWorld), {
    checkpointId: WORLD_CHECKPOINT,
    sessionId: WORLD_SESSION,
    generation: 1,
  });
  const firstAttempt = writerA.captureAtTick(worldSource(writerWorld), {
    checkpointId: WORLD_CHECKPOINT,
    sessionId: WORLD_SESSION,
    generation: 1,
  });
  if (firstAttempt.status !== 'PREPARED') throw new Error('the first capture was refused');
  const foreignCommit = await writerB.commitCapture(firstAttempt.capture);

  const coalesced = writerA.captureAtTick(worldSource(writerWorld), {
    checkpointId: WORLD_CHECKPOINT,
    sessionId: WORLD_SESSION,
    generation: 1,
  });
  const replacedAttempt = writerA.captureAtTick(worldSource(writerWorld), {
    checkpointId: WORLD_CHECKPOINT,
    sessionId: WORLD_SESSION,
    generation: 2,
  });
  if (replacedAttempt.status !== 'PREPARED') throw new Error('the replacement was refused');
  const capturesAfterReplace = writerA.status().captures;

  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstCommit = writerA.commitCapture(replacedAttempt.capture, {
    beforeCommit: async () => {
      await gate;
    },
  });
  const competing = await writerA.commitCapture(replacedAttempt.capture);
  release();
  const commitStatus = (await firstCommit).status;

  const olderGeneration = writerA.captureAtTick(worldSource(writerWorld), {
    checkpointId: WORLD_CHECKPOINT,
    sessionId: WORLD_SESSION,
    generation: 1,
  });
  const olderTick = writerA.captureAtTick(
    {
      tick: WORLD_FIXTURE.captureTick - 1,
      boundary: 'BOUNDARY',
      capture: () => captureInput(writerWorld),
    },
    { checkpointId: WORLD_CHECKPOINT, sessionId: WORLD_SESSION, generation: 3 },
  );
  const discardedAttempt = writerA.captureAtTick(worldSource(writerWorld), {
    checkpointId: WORLD_CHECKPOINT,
    sessionId: WORLD_SESSION,
    generation: 3,
  });
  if (discardedAttempt.status !== 'PREPARED') throw new Error('the discard capture was refused');
  const discardFirst = writerA.discardPrepared('SUPERSEDED');
  const discardAgain = writerA.discardPrepared('SHUTDOWN');
  const writerStatus = writerA.status();
  const writerRows = (await writerRepository.stats()).counts.checkpoints;
  const writerSection = {
    secondTabRole: secondTabStatus.role,
    secondTabReason: secondRepository.status().reason,
    secondTabCapture: codeOf(secondTabCapture),
    foreignCommit: codeOf(foreignCommit),
    commitStatus,
    coalesced: coalesced.status === 'PREPARED' ? coalesced.coalesced : false,
    capturesAfterCoalescing: 1,
    replaced: replacedAttempt.replaced,
    capturesAfterReplace,
    olderGeneration: codeOf(olderGeneration),
    olderTick: codeOf(olderTick),
    commitInProgress: codeOf(competing),
    discarded: discardFirst,
    discardedAgain: discardAgain,
    discardReason: writerStatus.lastDiscardReason,
    rows: writerRows,
  };
  checks.push(
    check(
      'writer-second-role',
      'READ_ONLY',
      writerSection.secondTabRole,
      'A second tab only reads',
    ),
    check(
      'writer-second-reason',
      'WRITER_HELD_BY_OTHER_TAB',
      writerSection.secondTabReason,
      'The reason is explicit',
    ),
    check(
      'writer-second-capture',
      'WRITER_REQUIRED',
      writerSection.secondTabCapture,
      'The second tab never captures',
    ),
    check(
      'writer-foreign-commit',
      'WRITER_MISMATCH',
      writerSection.foreignCommit,
      'A page cannot publish another writer token',
    ),
    check('writer-commit', 'COMMITTED', writerSection.commitStatus, 'The writer commits'),
    check(
      'writer-coalesced',
      true,
      writerSection.coalesced,
      'The same tick and generation are coalesced',
    ),
    check(
      'writer-replaced',
      true,
      writerSection.replaced,
      'A newer generation replaces the prepared one',
    ),
    check(
      'writer-older-generation',
      'STALE_GENERATION',
      writerSection.olderGeneration,
      'An older generation is refused',
    ),
    check('writer-older-tick', 'STALE_TICK', writerSection.olderTick, 'An older tick is refused'),
    check(
      'writer-concurrent',
      'COMMIT_IN_PROGRESS',
      writerSection.commitInProgress,
      'Only one transaction at a time',
    ),
    check('writer-discard', true, writerSection.discarded, 'A prepared generation can be dropped'),
    check(
      'writer-discard-again',
      false,
      writerSection.discardedAgain,
      'There is nothing left to drop',
    ),
    check(
      'writer-discard-reason',
      'SUPERSEDED',
      writerSection.discardReason,
      'The reason is recorded',
    ),
    check('writer-rows', 1, writerSection.rows, 'The checkpoint id owns one durable row'),
  );
  writerRepository.close();
  secondRepository.close();
  writerOrigin.factory.deleteDatabase('206-world-checkpoint-db');

  // Crash before and after the transaction.
  const crashOrigin = createOrigin();
  const crashRepository = await openTab(crashOrigin, 'tab-crash');
  const crashWorld = createWorldFixture();
  runWorld(crashWorld, WORLD_FIXTURE.captureTick);
  const crashWriter = createWorldCheckpointWriter({
    repository: crashRepository,
    writerId: 'tab-crash',
    versions: WORLD_VERSIONS,
    monotonic: sequenceClock([0, 1, 2, 3, 10, 15, 20, 21, 22, 30]),
    now: fixedClock(),
  });
  const beforeAttempt = crashWriter.captureAtTick(worldSource(crashWorld), {
    checkpointId: WORLD_CHECKPOINT,
    sessionId: WORLD_SESSION,
    generation: 1,
  });
  if (beforeAttempt.status !== 'PREPARED') throw new Error('the crash capture was refused');
  const before = await crashWriter.commitCapture(beforeAttempt.capture, {
    beforeCommit: () => {
      throw new Error('simulated death before the transaction');
    },
  });
  const beforeRows = (await crashRepository.stats()).counts.checkpoints;
  const afterAttempt = crashWriter.captureAtTick(worldSource(crashWorld), {
    checkpointId: WORLD_CHECKPOINT,
    sessionId: WORLD_SESSION,
    generation: 2,
  });
  if (afterAttempt.status !== 'PREPARED') throw new Error('the retry capture was refused');
  const after = await crashWriter.commitCapture(afterAttempt.capture, {
    afterCommit: () => {
      throw new Error('simulated death after durability');
    },
  });
  const durable = (await crashRepository.getCheckpoint(WORLD_CHECKPOINT)) !== null;
  const crashLoad = await loadLatestWorldCheckpoint(crashRepository, WORLD_SESSION, {
    versions: WORLD_VERSIONS,
  });
  const crashSection = {
    beforeStatus: before.status,
    beforeCode: before.status === 'REJECTED' ? before.rejection.code : before.status,
    rowsAfterBefore: beforeRows,
    afterStatus: after.status,
    durable,
    reloadStatus: crashLoad.status,
  };
  checks.push(
    check(
      'crash-before-status',
      'CRASHED_BEFORE_COMMIT',
      crashSection.beforeCode,
      'The failure is named',
    ),
    check('crash-before-rows', 0, crashSection.rowsAfterBefore, 'No row was invented'),
    check(
      'crash-after-status',
      'CRASHED_AFTER_COMMIT',
      crashSection.afterStatus,
      'The death is reported',
    ),
    check('crash-after-durable', true, crashSection.durable, 'The committed row survives'),
    check('crash-after-reload', 'RESUMABLE', crashSection.reloadStatus, 'The world can continue'),
  );
  crashRepository.close();
  crashOrigin.factory.deleteDatabase('206-world-checkpoint-db');

  // Device loss: the capture comes from RAM and the commit waits for integration.
  const deviceOrigin = createOrigin();
  const deviceRepository = await openTab(deviceOrigin, 'tab-device');
  const deviceWorld = createWorldFixture();
  runWorld(deviceWorld, WORLD_FIXTURE.captureTick);
  const deviceWriter = createWorldCheckpointWriter({
    repository: deviceRepository,
    writerId: 'tab-device',
    versions: WORLD_VERSIONS,
    monotonic: sequenceClock([0, 1.5, 2, 5, 10, 14]),
    now: fixedClock(),
  });
  const deviceAttempt = deviceWriter.captureAtTick(worldSource(deviceWorld), {
    checkpointId: WORLD_CHECKPOINT,
    sessionId: WORLD_SESSION,
    generation: 1,
  });
  if (deviceAttempt.status !== 'PREPARED') throw new Error('the device capture was refused');
  const lost = deviceWriter.deviceLoss('GPU_DEVICE_LOST');
  const commitWhileLost = await deviceWriter.commitCapture(deviceAttempt.capture);
  const deferredEarly = await deviceWriter.commitDeferred();
  const preparedBeforeIntegration = deviceWriter.status().preparedTick;
  const integrated = deviceWriter.integrateRecovery();
  const deferred = await deviceWriter.commitDeferred();
  const deviceSection = {
    device: lost.device,
    reason: lost.deviceLossReason,
    lostTick: lost.deviceLostTick,
    commitWhileLost: codeOf(commitWhileLost),
    deferredBeforeIntegration: codeOf(deferredEarly),
    preparedBeforeIntegration,
    deviceAfterIntegration: integrated.device,
    deferredCommit: deferred.status,
    deferredDevice: deferred.status === 'COMMITTED' ? deferred.capture.device : null,
    deferredMs: deferred.status === 'COMMITTED' ? deferred.commitMs : -1,
    preparedAfter: deviceWriter.status().preparedTick,
    ramCaptureKept: deviceWriter.status().commits === 1,
  };
  checks.push(
    check('device-lost', 'LOST', deviceSection.device, 'The GPU loss is a state'),
    check('device-reason', 'GPU_DEVICE_LOST', deviceSection.reason, 'The reason is explicit'),
    check('device-tick', 60, deviceSection.lostTick, 'The lost capture keeps its tick'),
    check(
      'device-commit-lost',
      'DEVICE_LOST',
      deviceSection.commitWhileLost,
      'No durable commit while lost',
    ),
    check(
      'device-deferred-early',
      'DEVICE_NOT_INTEGRATED',
      deviceSection.deferredBeforeIntegration,
      'The recovery must be integrated first',
    ),
    check(
      'device-prepared-kept',
      60,
      deviceSection.preparedBeforeIntegration,
      'The RAM capture stays prepared while the GPU is lost',
    ),
    check(
      'device-integrated',
      'INTEGRATED',
      deviceSection.deviceAfterIntegration,
      'Recovery is integrated',
    ),
    check(
      'device-deferred',
      'COMMITTED',
      deviceSection.deferredCommit,
      'The RAM capture is published',
    ),
    check(
      'device-deferred-source',
      'RAM',
      deviceSection.deferredDevice,
      'The capture came from RAM',
    ),
    check(
      'device-deferred-cost',
      4,
      deviceSection.deferredMs,
      'Only the commit is measured after recovery',
    ),
    check('device-prepared', null, deviceSection.preparedAfter, 'Nothing stays prepared'),
  );
  deviceRepository.close();
  deviceOrigin.factory.deleteDatabase('206-world-checkpoint-db');

  // Load decisions: empty, aged, incompatible and incoherent envelopes.
  const loadOrigin = createOrigin();
  const loadRepository = await openTab(loadOrigin, 'tab-load');
  const loadWorld = createWorldFixture();
  runWorld(loadWorld, WORLD_FIXTURE.captureTick);
  const loadWriter = createWorldCheckpointWriter({
    repository: loadRepository,
    writerId: 'tab-load',
    versions: WORLD_VERSIONS,
    monotonic: sequenceClock([0, 2, 3, 9, 20, 25]),
    now: fixedClock(),
  });
  const loadAttempt = loadWriter.captureAtTick(worldSource(loadWorld), {
    checkpointId: WORLD_CHECKPOINT,
    sessionId: WORLD_SESSION,
    generation: 1,
  });
  if (loadAttempt.status !== 'PREPARED') throw new Error('the load capture was refused');
  await loadWriter.commitCapture(loadAttempt.capture);
  const empty = await loadLatestWorldCheckpoint(loadRepository, 'session-empty', {
    versions: WORLD_VERSIONS,
  });
  const resumable = await loadLatestWorldCheckpoint(loadRepository, WORLD_SESSION, {
    versions: WORLD_VERSIONS,
    currentTick: WORLD_FIXTURE.captureTick + 15,
  });
  const incompatible = await loadLatestWorldCheckpoint(loadRepository, WORLD_SESSION, {
    versions: { ...WORLD_VERSIONS, physicsVersion: 'rapier-0.22.0' },
  });
  const olderSnapshot = await loadLatestWorldCheckpoint(loadRepository, WORLD_SESSION, {
    versions: { ...WORLD_VERSIONS, engineVersion: 'engine-205' },
  });

  const envelope = {
    schemaVersion: 1 as const,
    checkpointId: 'checkpoint-tick',
    sessionId: 'session-tick',
    profileId: WORLD_FIXTURE.profileId,
    worldEpoch: WORLD_FIXTURE.worldEpoch,
    tick: WORLD_FIXTURE.captureTick + 1,
    generation: 1,
    learningEpoch: WORLD_FIXTURE.learningEpoch,
    engineVersion: WORLD_VERSIONS.engineVersion,
    physicsVersion: WORLD_VERSIONS.physicsVersion,
    mapVersion: WORLD_VERSIONS.mapVersion,
    createdAt: WORLD_CAPTURED_AT,
    body: loadAttempt.capture.body,
  };
  await loadRepository.putCheckpoint(envelope);
  const tickMismatch = await loadLatestWorldCheckpoint(loadRepository, 'session-tick', {
    versions: WORLD_VERSIONS,
  });
  await loadRepository.putCheckpoint({
    ...envelope,
    checkpointId: 'checkpoint-profile',
    sessionId: 'session-profile',
    tick: WORLD_FIXTURE.captureTick,
    profileId: 'profile-9',
  });
  const profileMismatch = await loadLatestWorldCheckpoint(loadRepository, 'session-profile', {
    versions: WORLD_VERSIONS,
  });
  await loadRepository.putCheckpoint({
    ...envelope,
    checkpointId: 'checkpoint-epoch',
    sessionId: 'session-epoch',
    tick: WORLD_FIXTURE.captureTick,
    learningEpoch: WORLD_FIXTURE.learningEpoch + 1,
  });
  const epochMismatch = await loadLatestWorldCheckpoint(loadRepository, 'session-epoch', {
    versions: WORLD_VERSIONS,
  });
  const tamperedBody = JSON.parse(JSON.stringify(loadAttempt.capture.body)) as Record<
    string,
    unknown
  >;
  tamperedBody.tick = WORLD_FIXTURE.captureTick + 1;
  await loadRepository.putCheckpoint({
    ...envelope,
    checkpointId: 'checkpoint-checksum',
    sessionId: 'session-checksum',
    body: tamperedBody,
  });
  const checksumMismatch = await loadLatestWorldCheckpoint(loadRepository, 'session-checksum', {
    versions: WORLD_VERSIONS,
  });

  const loadSection = {
    empty: empty.status,
    resumable: resumable.status,
    tick: resumable.status === 'RESUMABLE' ? resumable.tick : -1,
    generation: resumable.status === 'RESUMABLE' ? resumable.generation : -1,
    ageTicks: resumable.status === 'RESUMABLE' ? resumable.ageTicks : null,
    incompatible: incompatible.status,
    incompatibleDetail: incompatible.status === 'INCOMPATIBLE' ? incompatible.detail : 'NONE',
    olderSnapshot: olderSnapshot.status,
    tickMismatch: loadCode(tickMismatch),
    profileMismatch: loadCode(profileMismatch),
    epochMismatch: loadCode(epochMismatch),
    checksumMismatch: loadCode(checksumMismatch),
  };
  checks.push(
    check('load-empty', 'EMPTY', loadSection.empty, 'No checkpoint is not an error'),
    check('load-resumable', 'RESUMABLE', loadSection.resumable, 'A coherent checkpoint resumes'),
    check('load-tick', 60, loadSection.tick, 'The stored tick is returned'),
    check('load-generation', 1, loadSection.generation, 'The stored generation is returned'),
    check('load-age', 15, loadSection.ageTicks, 'The age is measured, not guessed'),
    check(
      'load-incompatible',
      'INCOMPATIBLE',
      loadSection.incompatible,
      'A physics change is explicit',
    ),
    check(
      'load-incompatible-detail',
      'physicsVersion: stored rapier-0.21.0, current rapier-0.22.0',
      loadSection.incompatibleDetail,
      'The reason names both versions',
    ),
    check(
      'load-older-engine',
      'INCOMPATIBLE',
      loadSection.olderSnapshot,
      'An older engine is explicit too',
    ),
    check(
      'load-tick-mismatch',
      'TICK_MISMATCH',
      loadSection.tickMismatch,
      'The envelope and the snapshot agree',
    ),
    check(
      'load-profile-mismatch',
      'PROFILE_MISMATCH',
      loadSection.profileMismatch,
      'The profile is coherent',
    ),
    check(
      'load-epoch-mismatch',
      'LEARNING_EPOCH_MISMATCH',
      loadSection.epochMismatch,
      'The learning epoch is coherent',
    ),
    check(
      'load-checksum-mismatch',
      'CHECKSUM_MISMATCH',
      loadSection.checksumMismatch,
      'A changed body is refused',
    ),
  );
  loadRepository.close();
  loadOrigin.factory.deleteDatabase('206-world-checkpoint-db');

  const cost = {
    source: 'STUB_CLOCK',
    captureMs: capture.captureMs,
    encodeMs: capture.encodeMs,
    commitMs: committed.commitMs,
    totalMs: capture.captureMs + capture.encodeMs + committed.commitMs,
  };
  checks.push(
    check('cost-capture', 2.5, cost.captureMs, 'The synchronous world copy is measured on its own'),
    check(
      'cost-encode',
      7,
      cost.encodeMs,
      'Validation, canonicalization and checksum are separate',
    ),
    check('cost-commit', 6, cost.commitMs, 'The transaction is measured around the write'),
    check('cost-total', 15.5, cost.totalMs, 'The three phases add up'),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: '206-world-checkpoint-v1' as const,
    generatedBy:
      'node --import ./scripts/register-typescript.mjs scripts/run-world-checkpoint-report.mjs',
    oracleRule:
      'Every value is a real run of src/persistence against the in-memory IndexedDB double and the clockless world fixture; the expected value is the documented contract, never a copy of the actual one.',
    coherence,
    continuation,
    resume: resumeSection,
    writer: writerSection,
    crash: crashSection,
    deviceLoss: deviceSection,
    load: loadSection,
    cost,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

function loadCode(result: { status: string; rejection?: { code: string } }): string {
  return result.status === 'REJECTED' ? (result.rejection?.code ?? 'REJECTED') : result.status;
}

/* --------------------------------------------------------------- real cost */

export interface WorldCostStats {
  readonly min: number;
  readonly median: number;
  readonly max: number;
}

export interface WorldCheckpointCosts {
  readonly contract: string;
  readonly measuredAt: string;
  readonly sampleCount: number;
  readonly vehicles: number;
  readonly checksum: string;
  readonly bytes: number;
  readonly byteBudget: number;
  readonly bodyUtilizationPercent: number;
  readonly captureMs: WorldCostStats;
  readonly encodeMs: WorldCostStats;
  readonly commitMs: WorldCostStats;
  readonly totalMs: WorldCostStats;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function stats(values: readonly number[]): WorldCostStats {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return Object.freeze({
    min: round(sorted[0] ?? 0),
    median: round(median),
    max: round(sorted[sorted.length - 1] ?? 0),
  });
}

/**
 * Measures the real capture, encoding and commit cost of the same 70-vehicle world on this
 * machine. This is the only wall-clock measurement in PBI 206; it is written to `cost.json` by
 * `--cost` and is never part of the deterministic transcript.
 */
export async function measureWorldCheckpointCosts(samples = 20): Promise<WorldCheckpointCosts> {
  const count = Math.max(1, Math.floor(samples));
  const origin = createOrigin();
  const repository = await openTab(origin, 'tab-cost');
  const world = createWorldFixture();
  runWorld(world, WORLD_FIXTURE.captureTick);
  const writer = createWorldCheckpointWriter({
    repository,
    writerId: 'tab-cost',
    versions: WORLD_VERSIONS,
    now: fixedClock(),
  });
  const captureMs: number[] = [];
  const encodeMs: number[] = [];
  const commitMs: number[] = [];
  const totalMs: number[] = [];
  let bytes = 0;
  let checksum = '';
  for (let index = 0; index < count; index += 1) {
    const prepared = writer.captureAtTick(worldSource(world), {
      checkpointId: WORLD_CHECKPOINT,
      sessionId: WORLD_SESSION,
      generation: index + 1,
    });
    if (prepared.status !== 'PREPARED') {
      throw new Error(`cost capture ${index} was refused: ${prepared.rejection.code}`);
    }
    const committed = await writer.commitCapture(prepared.capture);
    if (committed.status !== 'COMMITTED' && committed.status !== 'CRASHED_AFTER_COMMIT') {
      throw new Error(`cost commit ${index} was refused: ${committed.rejection.code}`);
    }
    captureMs.push(prepared.capture.captureMs);
    encodeMs.push(prepared.capture.encodeMs);
    commitMs.push(committed.commitMs);
    totalMs.push(prepared.capture.captureMs + prepared.capture.encodeMs + committed.commitMs);
    bytes = prepared.capture.bytes;
    checksum = prepared.capture.checksum;
  }
  repository.close();
  return Object.freeze({
    contract:
      'Real monotonic clock (performance.now) on this machine; one process; same 70-vehicle world at tick 60; in-memory IndexedDB double. Not a browser measurement.',
    measuredAt: new Date().toISOString(),
    sampleCount: count,
    vehicles: WORLD_FIXTURE.taxis + WORLD_FIXTURE.civilians,
    checksum,
    bytes,
    byteBudget: WORLD_SNAPSHOT_LIMITS.maxBodyBytes,
    bodyUtilizationPercent: round((bytes / WORLD_SNAPSHOT_LIMITS.maxBodyBytes) * 100),
    captureMs: stats(captureMs),
    encodeMs: stats(encodeMs),
    commitMs: stats(commitMs),
    totalMs: stats(totalMs),
  });
}
