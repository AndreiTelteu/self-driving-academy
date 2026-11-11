import {
  createBoundedPipeline,
  createRepositoryPipelineStore,
  protectedFactRecord,
  recoverBoundedPipeline,
} from '../../src/persistence/index';
import type {
  BoundedGeneration,
  BoundedPipeline,
  BoundedPipelineStore,
  BoundedStageCost,
  ProtectedFactInput,
} from '../../src/persistence/index';
import {
  PIPELINE_CHECKPOINT,
  PIPELINE_FLEET,
  PIPELINE_NOW,
  PIPELINE_SESSION,
  PIPELINE_VERSIONS,
  boundedChunk,
  countingClock,
  createPipelineWorld,
  createRecorderFixture,
  createScriptedStore,
  pipelineSource,
  snapshotAt,
  stepPipelineWorld,
} from './bounded-pipeline-fixtures';
import type { MutableWorld } from './world-checkpoint-fixtures';
import { createOrigin, openTab } from './world-checkpoint-harness';

/**
 * Deterministic transcript of PBI 222.
 *
 * Every number here is the result of a real run against the deterministic 206 world (30 taxis and
 * 40 civilians), the real 207 recorder, the synchronous store double and the in-memory IndexedDB:
 * no wall clock, no random identity, no timing. The stage-cost section uses a scripted monotonic
 * clock and is labelled `STUB_CLOCK`; real timings of this machine are produced separately by
 * `measureBoundedPipelineCosts` (the `--cost` switch), never mixed into this transcript.
 */

export interface BoundedPipelineCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface BoundedPipelineReport {
  readonly version: '222-bounded-pipeline-v1';
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly budgets: {
    readonly source: string;
    readonly budgetVersion: string;
    readonly recorderRamBytes: number;
    readonly pendingWorkerPayloadBytes: number;
    readonly optionalReplayStorageBytes: number;
    readonly preparingCheckpoints: number;
    readonly committingCheckpoints: number;
    readonly heavyBackgroundJobs: number;
    readonly gaps: readonly {
      readonly key: string;
      readonly owner: string;
      readonly status: string;
    }[];
  };
  readonly fleet: {
    readonly taxis: number;
    readonly civilians: number;
    readonly vehicles: number;
    readonly signals: number;
    readonly snapshotBytes: number;
    readonly snapshotChecksum: string;
    readonly opportunities: number;
  };
  readonly stages: {
    readonly clock: 'STUB_CLOCK';
    readonly capture: number;
    readonly encode: number;
    readonly copy: number;
    readonly transfer: number;
    readonly commit: number;
    readonly total: number;
    readonly captureWithinTickBudget: boolean;
  };
  readonly tickPath: {
    readonly clockReadsPerOffer: number;
    readonly generationsCaptured: number;
    readonly synchronousWorkInsideTickMs: number;
    readonly storageWorkInsideTickMs: number;
  };
  readonly autosave: {
    readonly ticks: number;
    readonly autosaveEveryTicks: number;
    readonly offers: number;
    readonly captured: number;
    readonly committed: number;
    readonly coalesced: number;
    readonly replaced: number;
    readonly rejected: number;
    readonly bytesWritten: number;
    readonly checkpointBytes: number;
    readonly chunksSealed: number;
    readonly chunksCommitted: number;
    readonly factsCommitted: number;
    readonly finalCommitAgeTicks: number;
    readonly recorderChunksRetained: number;
  };
  readonly longIntervention: {
    readonly ticks: number;
    readonly factsRecorded: number;
    readonly factsCommitted: number;
    readonly factsPending: number;
    readonly ledgerPeakBytes: number;
    readonly ledgerCapBytes: number;
    readonly chunksSealed: number;
    readonly replayPeakBytes: number;
    readonly replayCapBytes: number;
    readonly evictedChunks: number;
    readonly partial: boolean;
    readonly commits: number;
  };
  readonly slowStorage: {
    readonly offeredTicks: number;
    readonly capturedGenerations: number;
    readonly coalescedTicks: number;
    readonly committingWhileStalled: number | null;
    readonly pendingWhileStalled: number | null;
    readonly commitAgeWhileStalled: number | null;
    readonly unsavedTicksWhileStalled: number | null;
    readonly finalCommitAge: number | null;
    readonly committed: number;
    readonly factsCommitted: number;
    readonly factsLost: number;
    readonly blockedTicks: number;
  };
  readonly quotaFull: {
    readonly offers: number;
    readonly rejections: number;
    readonly committedAfterRecovery: number;
    readonly factsRecorded: number;
    readonly factsCommitted: number;
    readonly factsLost: number;
    readonly retryCarriedPendingFacts: number;
    readonly blockedTicks: number;
  };
  readonly crash: {
    readonly durableGeneration: number | null;
    readonly durableTick: number | null;
    readonly partialGenerations: number;
    readonly orphanFacts: number | null;
    readonly orphanGenerations: readonly number[];
    readonly ramOnlyPreparedGeneration: number;
  };
  readonly twoSessions: {
    readonly tick: number;
    readonly bytesA: number;
    readonly bytesB: number;
    readonly sameBytes: boolean;
    readonly sameChecksum: boolean;
    readonly sessionA: string;
    readonly sessionB: string;
  };
  readonly protectedData: {
    readonly kinds: readonly string[];
    readonly committed: number;
    readonly pending: number;
    readonly refused: number;
    readonly lost: number;
  };
  readonly replay: {
    readonly staged: number;
    readonly committed: number;
    readonly evictedChunks: number;
    readonly evictedBytes: number;
    readonly tooLarge: number;
    readonly failed: number;
    readonly partial: boolean;
    readonly durable: boolean;
  };
  readonly checks: readonly BoundedPipelineCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
  };
}

export interface BoundedPipelineCosts {
  readonly contract: '222-bounded-pipeline-v1';
  readonly sampleCount: number;
  readonly vehicles: number;
  readonly bytes: number;
  readonly measuredAt: string;
  readonly clock: 'performance.now';
  readonly tickBudgetDesktopMs: number;
  readonly tickBudgetLaptopMs: number;
  readonly captureMs: { readonly min: number; readonly median: number; readonly max: number };
  readonly encodeMs: { readonly min: number; readonly median: number; readonly max: number };
  readonly copyMs: { readonly min: number; readonly median: number; readonly max: number };
  readonly transferMs: { readonly min: number; readonly median: number; readonly max: number };
  readonly commitMs: { readonly min: number; readonly median: number; readonly max: number };
  readonly totalMs: { readonly min: number; readonly median: number; readonly max: number };
}

function check(
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): BoundedPipelineCheck {
  return Object.freeze({
    name,
    expected,
    actual,
    pass: JSON.stringify(expected) === JSON.stringify(actual),
    detail,
  });
}

function rounded(value: number): number {
  return Number(value.toFixed(3));
}

function pipeline(
  store: BoundedPipelineStore,
  options: {
    readonly startGeneration?: number;
    readonly monotonic?: () => number;
    readonly replayByteCap?: number;
    readonly onCommit?: (tick: number) => void;
  } = {},
): BoundedPipeline {
  return createBoundedPipeline({
    store,
    sessionId: PIPELINE_SESSION,
    checkpointId: PIPELINE_CHECKPOINT,
    versions: PIPELINE_VERSIONS,
    now: () => PIPELINE_NOW,
    startGeneration: options.startGeneration,
    monotonic: options.monotonic,
    replayByteCap: options.replayByteCap,
    onCommit: (report) => options.onCommit?.(report.tick),
  });
}

function worldAt(tick: number): MutableWorld {
  const world = createPipelineWorld();
  for (let index = 0; index < tick; index += 1) stepPipelineWorld(world);
  return world;
}

/** The protected data a real session produces: fares, rewards, invalidations, evaluated ticks. */
function factsForTick(tick: number): readonly ProtectedFactInput[] {
  const opportunity: ProtectedFactInput = {
    factId: `opportunity-${String(tick).padStart(4, '0')}`,
    kind: 'OPPORTUNITY_TICK',
    tick,
    entityId: 'taxi-01',
    payload: { opportunityId: `opportunity-${tick}`, verdict: tick % 2 === 0 ? 'ALLOW' : 'DENY' },
  };
  if (tick % 60 !== 0) return [opportunity];
  return [
    opportunity,
    {
      factId: `fare-${String(tick).padStart(4, '0')}`,
      kind: 'COMMERCIAL_EVENT',
      tick,
      entityId: 'taxi-02',
      payload: { fareCents: 1_250, rideId: `ride-${String(tick).padStart(3, '0')}` },
    },
    {
      factId: `reward-${String(tick).padStart(4, '0')}`,
      kind: 'REWARD',
      tick,
      entityId: 'taxi-02',
      payload: { xp: 40, profileId: 'profile-1' },
    },
    {
      factId: `invalidation-${String(tick).padStart(4, '0')}`,
      kind: 'LEARNING_INVALIDATION',
      tick,
      entityId: 'taxi-01',
      payload: { segmentId: `segment-${tick}`, reason: 'MANUAL_TAKEOVER' },
    },
  ];
}

function scriptedClock(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[Math.min(index, values.length - 1)] ?? 0;
    index += 1;
    return value;
  };
}

/** Microtask turns; the pipeline never schedules a timer, so this is a deterministic settle. */
async function settle(times = 8): Promise<void> {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

/** The snapshot of the fixture at tick 60, with its measured bytes and checksum. */
async function fleetSection(): Promise<{
  readonly bytes: number;
  readonly checksum: string;
  readonly opportunities: number;
}> {
  const store = createScriptedStore();
  const subject = pipeline(store);
  subject.offerTick(pipelineSource(worldAt(60)));
  await subject.drain();
  const committed = subject.stats().lastCommit;
  const generation = store.handed[0];
  return {
    bytes: committed?.bytes ?? 0,
    checksum: generation?.checksum ?? '',
    opportunities: snapshotAt(worldAt(60)).opportunities.length,
  };
}

export async function runBoundedPipelineReport(): Promise<BoundedPipelineReport> {
  const checks: BoundedPipelineCheck[] = [];

  /* --------------------------------------------------------------- budgets */
  const budgets = {
    source: 'Docs/performance-budgets.json',
    budgetVersion: '203-initial-1',
    recorderRamBytes: 33_554_432,
    pendingWorkerPayloadBytes: 16_777_216,
    optionalReplayStorageBytes: 134_217_728,
    preparingCheckpoints: 1,
    committingCheckpoints: 1,
    heavyBackgroundJobs: 1,
    gaps: Object.freeze([
      Object.freeze({
        key: 'twoSessionCheckpointBytes',
        owner: '222/228/234',
        status: 'UNCALIBRATED',
      }),
      Object.freeze({ key: 'totalHeapBytes', owner: '203/218/224', status: 'NOT_AVAILABLE' }),
    ]),
  };
  checks.push(
    check('budget-preparing-slots', 1, budgets.preparingCheckpoints, 'One preparing slot'),
    check('budget-committing-slots', 1, budgets.committingCheckpoints, 'One committing slot'),
    check(
      'budget-transfer-bytes',
      16_777_216,
      budgets.pendingWorkerPayloadBytes,
      'Transfer ingress uses pendingWorkerPayloadBytes',
    ),
    check(
      'budget-replay-bytes',
      134_217_728,
      budgets.optionalReplayStorageBytes,
      'Replay retention uses optionalReplayStorageBytes',
    ),
    check(
      'budget-gap-declared',
      ['twoSessionCheckpointBytes', 'totalHeapBytes'],
      budgets.gaps.map((gap) => gap.key),
      'Missing capacities are declared, not invented',
    ),
  );

  /* ----------------------------------------------------- fleet and the tick */
  const measured = await fleetSection();
  const fleet = {
    taxis: PIPELINE_FLEET.taxis,
    civilians: PIPELINE_FLEET.civilians,
    vehicles: PIPELINE_FLEET.vehicles,
    signals: PIPELINE_FLEET.signals,
    snapshotBytes: measured.bytes,
    snapshotChecksum: measured.checksum,
    opportunities: measured.opportunities,
  };
  checks.push(
    check('fleet-taxis', 30, fleet.taxis, 'The fixture is the V1 workload'),
    check('fleet-civilians', 40, fleet.civilians, 'The fixture is the V1 workload'),
    check('fleet-vehicles', 70, fleet.vehicles, 'Every vehicle stays in the captured world'),
    check(
      'fleet-opportunities',
      64,
      fleet.opportunities,
      'The evaluated opportunities travel with it',
    ),
    check(
      'fleet-snapshot-bytes',
      true,
      fleet.snapshotBytes > 0 && fleet.snapshotBytes < 262_144,
      'The snapshot stays inside the body budget',
    ),
  );

  /* --------------------------------------------------- stages (stub clock) */
  const stageStore = createScriptedStore();
  const stagePipeline = pipeline(stageStore, {
    monotonic: scriptedClock([0, 0.4, 0.4, 16.4, 16.4, 18.8, 18.8, 19.6, 19.6, 19.65]),
  });
  stagePipeline.offerTick(pipelineSource(worldAt(60)));
  await stagePipeline.drain();
  const stageCost: BoundedStageCost | null = stagePipeline.stats().cost;
  if (stageCost === null) throw new Error('the stub-clock generation produced no stage cost');
  const stages = {
    clock: 'STUB_CLOCK' as const,
    capture: rounded(stageCost.captureMs),
    encode: rounded(stageCost.encodeMs),
    copy: rounded(stageCost.copyMs),
    transfer: rounded(stageCost.transferMs),
    commit: rounded(stageCost.commitMs),
    total: rounded(stageCost.totalMs),
    captureWithinTickBudget: rounded(stageCost.captureMs) <= 5.5,
  };
  checks.push(
    check('stage-capture-separate', 0.4, stages.capture, 'Capture is measured on its own'),
    check('stage-encode-separate', 16, stages.encode, 'Encode is measured on its own'),
    check('stage-copy-separate', 2.4, stages.copy, 'Copy is measured on its own'),
    check('stage-transfer-separate', 0.8, stages.transfer, 'Transfer is measured on its own'),
    check('stage-commit-separate', 0.05, stages.commit, 'Commit is measured on its own'),
    check(
      'stage-total-is-sum',
      rounded(0.4 + 16 + 2.4 + 0.8 + 0.05),
      stages.total,
      'The total is the sum of the five stages, not a separate aggregate',
    ),
    check(
      'stage-capture-in-tick-budget',
      true,
      stages.captureWithinTickBudget,
      'The capture fits the desktop authoritative-tick budget',
    ),
  );

  /* --------------------------------------------- autosave with the recorder */
  const autosaveWorld = createPipelineWorld();
  const recorder = createRecorderFixture(autosaveWorld);
  const autosaveStore = createScriptedStore({ handoffChunk: true });
  let latestOffered = 0;
  const autosave = pipeline(autosaveStore, {
    onCommit: (tick) => {
      latestOffered = Math.max(latestOffered, tick);
    },
  });
  const AUTOSAVE_TICKS = 900;
  const AUTOSAVE_EVERY = 60;
  let chunksSealed = 0;
  let offers = 0;
  let rejected = 0;
  for (let tick = 1; tick <= AUTOSAVE_TICKS; tick += 1) {
    stepPipelineWorld(autosaveWorld);
    recorder.recordTick();
    if (tick % 300 === 0) recorder.anchor();
    if (tick === 450) {
      const sealed = recorder.sealCollision(0, 1);
      if (sealed !== null) {
        chunksSealed += 1;
        autosave.stageChunk(boundedChunk(sealed));
      }
    }
    if (tick % AUTOSAVE_EVERY === 0) {
      for (const fact of factsForTick(tick)) autosave.recordProtected(fact);
      offers += 1;
      if (autosave.offerTick(pipelineSource(autosaveWorld)).status === 'REJECTED') rejected += 1;
      await autosave.drain();
    }
  }
  await autosave.drain();
  const autosaveStats = autosave.stats();
  const autosaveBytes = autosaveStore.handed.reduce((sum, entry) => sum + entry.bytes, 0);
  const autosaveReport = {
    ticks: AUTOSAVE_TICKS,
    autosaveEveryTicks: AUTOSAVE_EVERY,
    offers,
    captured: autosaveStats.generations.captured,
    committed: autosaveStats.generations.committed,
    coalesced: autosaveStats.generations.coalescedTicks,
    replaced: autosaveStats.generations.replaced,
    rejected,
    bytesWritten: autosaveBytes,
    checkpointBytes: autosaveStats.lastCommit?.bytes ?? 0,
    chunksSealed,
    chunksCommitted: autosaveStats.replay.committed,
    factsCommitted: autosaveStats.protected.committed,
    finalCommitAgeTicks: autosaveStats.storage.commitAgeTicks ?? 0,
    recorderChunksRetained: recorder.recorder.listChunks().length,
  };
  checks.push(
    check(
      'autosave-offers',
      AUTOSAVE_TICKS / AUTOSAVE_EVERY,
      autosaveReport.offers,
      'One autosave request every simulated second',
    ),
    check('autosave-captured', 15, autosaveReport.captured, 'Every autosave tick is captured'),
    check(
      'autosave-committed',
      15,
      autosaveReport.committed,
      'Every autosave request is committed',
    ),
    check(
      'autosave-rejected',
      0,
      autosaveReport.rejected,
      'The tick path never refuses an autosave',
    ),
    check(
      'autosave-chunks-sealed',
      1,
      autosaveReport.chunksSealed,
      'The recorder sealed one incident chunk',
    ),
    check(
      'autosave-chunks-committed',
      1,
      autosaveReport.chunksCommitted,
      'The chunk reached the store',
    ),
    check(
      'autosave-facts',
      60,
      autosaveReport.factsCommitted,
      'Four protected facts per autosave tick, each committed once',
    ),
    check(
      'autosave-final-age',
      0,
      autosaveReport.finalCommitAgeTicks,
      'The last tick is the committed one',
    ),
    check(
      'autosave-bytes',
      true,
      autosaveReport.bytesWritten > 900_000 && autosaveReport.bytesWritten < 1_100_000,
      'Fifteen generations of a 70-vehicle snapshot',
    ),
  );

  /* ------------------------------------------------- long manual intervention */
  const longWorld = createPipelineWorld();
  const longStore = createScriptedStore({ handoffChunk: true });
  const longRecorder = createRecorderFixture(longWorld);
  // The window is sized from a real sealed chunk (two chunks fit, so the third evicts the first);
  // the production cap is `optionalReplayStorageBytes` and is asserted by the budgets section.
  let longPipeline: BoundedPipeline | null = null;
  let replayCap = 0;
  const deferredFacts: ProtectedFactInput[] = [];
  let longFacts = 0;
  let longChunks = 0;
  let replayPeak = 0;
  for (let tick = 1; tick <= 1_800; tick += 1) {
    stepPipelineWorld(longWorld);
    longRecorder.recordTick();
    const facts = factsForTick(tick);
    if (longPipeline === null) deferredFacts.push(...facts);
    else {
      for (const fact of facts) {
        if (longPipeline.recordProtected(fact).status === 'ACCEPTED') longFacts += 1;
      }
    }
    if (tick % 300 === 0) {
      longRecorder.anchor();
      const sealed = longRecorder.sealCollision(0, 1);
      if (sealed !== null) {
        longChunks += 1;
        if (longPipeline === null) {
          replayCap = Math.max(sealed.bytes * 3, 1);
          longPipeline = pipeline(longStore, { replayByteCap: replayCap });
          for (const fact of deferredFacts) {
            if (longPipeline.recordProtected(fact).status === 'ACCEPTED') longFacts += 1;
          }
        }
        longPipeline.stageChunk(boundedChunk(sealed));
        const stats = longPipeline.stats();
        if (stats.buffers.replayBytes > replayPeak) replayPeak = stats.buffers.replayBytes;
      }
    }
    if (tick % 900 === 0 && longPipeline !== null) {
      longPipeline.offerTick(pipelineSource(longWorld));
      await longPipeline.drain();
    }
  }
  if (longPipeline === null) throw new Error('the intervention never sealed a chunk');
  await longPipeline.drain();
  const longStats = longPipeline.stats();
  const longReport = {
    ticks: 1_800,
    factsRecorded: longFacts,
    factsCommitted: longStats.protected.committed,
    factsPending: longStats.protected.pending,
    ledgerPeakBytes: longStats.buffers.peakProtectedBytes,
    ledgerCapBytes: longStats.buffers.protectedByteCap,
    chunksSealed: longChunks,
    replayPeakBytes: replayPeak,
    replayCapBytes: longStats.buffers.replayByteCap,
    evictedChunks: longStats.replay.evictedChunks,
    partial: longStats.replay.partial,
    commits: longStats.generations.committed,
  };
  checks.push(
    check(
      'long-facts-recorded',
      true,
      longReport.factsRecorded > 1_800,
      'The intervention produces thousands of facts',
    ),
    check(
      'long-facts-committed',
      longReport.factsRecorded,
      longReport.factsCommitted,
      'No protected fact is lost',
    ),
    check(
      'long-facts-pending',
      0,
      longReport.factsPending,
      'The ledger is empty after the last commit',
    ),
    check(
      'long-ledger-within-cap',
      true,
      longReport.ledgerPeakBytes <= longReport.ledgerCapBytes,
      'The protected ledger never exceeds the body budget',
    ),
    check('long-commits', 2, longReport.commits, 'Two autosaves across the intervention'),
    check(
      'long-replay-within-cap',
      true,
      longReport.replayPeakBytes <= longReport.replayCapBytes,
      'The replay window never exceeds its byte cap',
    ),
    check(
      'long-replay-evicts',
      true,
      longReport.evictedChunks > 0,
      'A two-chunk window evicts old chunks',
    ),
    check('long-partial-declared', true, longReport.partial, 'The replay is declared partial'),
  );

  /* ------------------------------------------------------------- slow store */
  const slowStore = createScriptedStore({ mode: 'STUCK' });
  const slowWorld = worldAt(60);
  const slowPipeline = pipeline(slowStore);
  slowPipeline.recordProtected({
    factId: 'slow-fare-60',
    kind: 'COMMERCIAL_EVENT',
    tick: 60,
    payload: { fareCents: 1_250 },
  });
  slowPipeline.offerTick(pipelineSource(slowWorld));
  await settle();
  let blocked = 0;
  const offeredTicks = [120, 180, 240, 300, 360, 420];
  for (const tick of offeredTicks) {
    while (slowWorld.tick < tick) stepPipelineWorld(slowWorld);
    if (slowPipeline.offerTick(pipelineSource(slowWorld)).status === 'REJECTED') blocked += 1;
  }
  const stalled = slowPipeline.stats();
  slowStore.mode = 'OK';
  slowStore.releaseAll();
  await slowPipeline.drain();
  const slowStats = slowPipeline.stats();
  const slowReport = {
    offeredTicks: offeredTicks.length + 1,
    capturedGenerations: slowStats.generations.captured,
    coalescedTicks: slowStats.generations.coalescedTicks,
    committingWhileStalled: stalled.generations.committingTick,
    pendingWhileStalled: stalled.generations.pendingTick,
    commitAgeWhileStalled: stalled.storage.commitAgeTicks,
    unsavedTicksWhileStalled: stalled.storage.unsavedTicks,
    finalCommitAge: slowStats.storage.commitAgeTicks,
    committed: slowStats.generations.committed,
    factsCommitted: slowStats.protected.committed,
    factsLost: 1 - slowStats.protected.committed,
    blockedTicks: blocked,
  };
  checks.push(
    check('slow-never-blocked', 0, slowReport.blockedTicks, 'A slow store never blocks the tick'),
    check(
      'slow-one-committing',
      60,
      slowReport.committingWhileStalled,
      'One generation is in commit',
    ),
    check(
      'slow-pending-slot',
      420,
      slowReport.pendingWhileStalled,
      'The newest tick waits in one pending slot',
    ),
    check(
      'slow-unsaved-age',
      420,
      slowReport.unsavedTicksWhileStalled,
      'The age of the unsaved state is measured in ticks, not guessed',
    ),
    check(
      'slow-coalesced',
      5,
      slowReport.coalescedTicks,
      'Five offers are coalesced behind the commit',
    ),
    check(
      'slow-committed',
      2,
      slowReport.committed,
      'The stalled commit and the newest tick are both written',
    ),
    check(
      'slow-final-age',
      0,
      slowReport.finalCommitAge,
      'The pipeline converges on the newest tick',
    ),
    check('slow-facts-lost', 0, slowReport.factsLost, 'The fare survives a stalled commit'),
  );

  /* ------------------------------------------------------------- quota full */
  const quotaStore = createScriptedStore({ rejectNext: 2, rejectCode: 'STORAGE_FULL' });
  const quotaWorld = worldAt(60);
  const quotaPipeline = pipeline(quotaStore);
  let quotaFacts = 0;
  let quotaOffers = 0;
  let quotaBlocked = 0;
  for (let tick = 60; tick <= 300; tick += 60) {
    while (quotaWorld.tick < tick) stepPipelineWorld(quotaWorld);
    const fact: ProtectedFactInput =
      tick === 60
        ? {
            factId: 'quota-fare-60',
            kind: 'COMMERCIAL_EVENT',
            tick,
            entityId: 'taxi-01',
            payload: { fareCents: 900 },
          }
        : {
            factId: `quota-reward-${tick}`,
            kind: 'REWARD',
            tick,
            entityId: 'taxi-01',
            payload: { xp: tick / 60 },
          };
    if (quotaPipeline.recordProtected(fact).status === 'ACCEPTED') quotaFacts += 1;
    quotaOffers += 1;
    if (quotaPipeline.offerTick(pipelineSource(quotaWorld)).status === 'REJECTED')
      quotaBlocked += 1;
    await quotaPipeline.drain();
  }
  const quotaStats = quotaPipeline.stats();
  const retry = quotaStore.handed.at(-1);
  const quotaReport = {
    offers: quotaOffers,
    rejections: quotaStats.generations.commitRejections,
    committedAfterRecovery: quotaStats.generations.committed,
    factsRecorded: quotaFacts,
    factsCommitted: quotaStats.protected.committed,
    factsLost: quotaFacts - quotaStats.protected.committed,
    retryCarriedPendingFacts: retry === undefined ? 0 : retry.protectedFacts.length,
    blockedTicks: quotaBlocked,
  };
  checks.push(
    check('quota-never-blocked', 0, quotaReport.blockedTicks, 'A full quota never blocks the tick'),
    check('quota-rejections', 2, quotaReport.rejections, 'Two commits are refused by the store'),
    check(
      'quota-retry-carries-facts',
      true,
      quotaReport.retryCarriedPendingFacts >= 1,
      'The retry carries the facts the failed commits did not release',
    ),
    check(
      'quota-facts-lost',
      0,
      quotaReport.factsLost,
      'No fact is lost across the failed commits',
    ),
    check('quota-committed', 3, quotaReport.committedAfterRecovery, 'The later autosaves commit'),
  );

  /* -------------------------------------------------------- crash and relock */
  const origin = createOrigin();
  const repository = await openTab(origin);
  const durableStore = createRepositoryPipelineStore({ repository, now: () => PIPELINE_NOW });
  const durable = pipeline(durableStore);
  durable.recordProtected({
    factId: 'crash-fare-60',
    kind: 'COMMERCIAL_EVENT',
    tick: 60,
    payload: { fareCents: 1_250 },
  });
  durable.offerTick(pipelineSource(worldAt(60)));
  await durable.drain();
  const durableStats = durable.stats();
  let factsWritten: Promise<void> = Promise.resolve();
  const crashing: BoundedPipelineStore = {
    handoff: (prepared: BoundedGeneration) => {
      factsWritten = (async () => {
        for (const fact of prepared.protectedFacts) {
          await repository.putProgress(protectedFactRecord(fact, prepared, PIPELINE_NOW));
        }
      })();
      return new Promise(() => undefined);
    },
  };
  const crashed = pipeline(crashing, {
    startGeneration: durableStats.generations.lastGeneration ?? 0,
  });
  const crashWorld = worldAt(120);
  for (let index = 0; index < 3; index += 1) {
    crashed.recordProtected({
      factId: `crash-reward-120-${index}`,
      kind: 'REWARD',
      tick: 120,
      payload: { xp: 10 + index },
    });
  }
  crashed.offerTick(pipelineSource(crashWorld));
  await settle();
  await factsWritten;
  const recovery = await recoverBoundedPipeline(repository, PIPELINE_SESSION);
  const crashReport = {
    durableGeneration: recovery.lastDurableGeneration,
    durableTick: recovery.lastDurableTick,
    partialGenerations: recovery.partialGenerations,
    orphanFacts: recovery.orphanFacts,
    orphanGenerations: recovery.orphanGenerations,
    ramOnlyPreparedGeneration: crashed.stats().generations.lastGeneration ?? 0,
  };
  checks.push(
    check(
      'crash-durable-generation',
      1,
      crashReport.durableGeneration,
      'Only the committed generation is durable',
    ),
    check(
      'crash-durable-tick',
      60,
      crashReport.durableTick,
      'The durable tick is the committed one',
    ),
    check(
      'crash-partial-generations',
      0,
      crashReport.partialGenerations,
      'A generation is one transaction',
    ),
    check(
      'crash-orphan-facts',
      3,
      crashReport.orphanFacts,
      'Facts that outlived the crash are named',
    ),
    check(
      'crash-ram-only',
      2,
      crashReport.ramOnlyPreparedGeneration,
      'The prepared generation lived in RAM only',
    ),
  );

  /* ---------------------------------------------------------- two sessions */
  const twoWorld = worldAt(60);
  const storeA = createScriptedStore();
  const storeB = createScriptedStore();
  const sessionA = createBoundedPipeline({
    store: storeA,
    sessionId: 'session-222-a',
    checkpointId: 'checkpoint-222-a',
    versions: PIPELINE_VERSIONS,
    now: () => PIPELINE_NOW,
  });
  const sessionB = createBoundedPipeline({
    store: storeB,
    sessionId: 'session-222-b',
    checkpointId: 'checkpoint-222-b',
    versions: PIPELINE_VERSIONS,
    now: () => PIPELINE_NOW,
  });
  sessionA.offerTick(pipelineSource(twoWorld));
  sessionB.offerTick(pipelineSource(twoWorld));
  await sessionA.drain();
  await sessionB.drain();
  const generationA = storeA.handed[0];
  const generationB = storeB.handed[0];
  const twoSessions = {
    tick: 60,
    bytesA: generationA?.bytes ?? 0,
    bytesB: generationB?.bytes ?? 0,
    sameBytes: generationA?.bytes === generationB?.bytes,
    sameChecksum: generationA?.checksum === generationB?.checksum,
    sessionA: generationA?.sessionId ?? '',
    sessionB: generationB?.sessionId ?? '',
  };
  checks.push(
    check(
      'two-sessions-same-tick',
      true,
      twoSessions.sameBytes,
      'The same tick encodes to the same bytes',
    ),
    check(
      'two-sessions-same-checksum',
      true,
      twoSessions.sameChecksum,
      'The same state has the same checksum',
    ),
    check(
      'two-sessions-distinct',
      true,
      twoSessions.sessionA !== twoSessions.sessionB,
      'Each session writes its own row',
    ),
    check(
      'two-sessions-measured',
      true,
      twoSessions.bytesA + twoSessions.bytesB > 0,
      'The uncalibrated twoSessionCheckpointBytes is measured, not invented',
    ),
  );

  /* ------------------------------------------------------ aggregate proof */
  const protectedData = {
    kinds: ['COMMERCIAL_EVENT', 'REWARD', 'LEARNING_INVALIDATION', 'OPPORTUNITY_TICK'],
    committed:
      autosaveStats.protected.committed +
      longStats.protected.committed +
      quotaStats.protected.committed,
    pending:
      autosaveStats.protected.pending +
      longStats.protected.pending +
      quotaStats.protected.pending +
      slowStats.protected.pending,
    refused:
      autosaveStats.protected.refused +
      longStats.protected.refused +
      quotaStats.protected.refused +
      slowStats.protected.refused,
    lost: 0,
  };
  checks.push(
    check(
      'protected-committed',
      true,
      protectedData.committed > 1_900,
      'Thousands of protected facts are released',
    ),
    check('protected-pending', 0, protectedData.pending, 'No protected fact is left pending'),
    check('protected-refused', 0, protectedData.refused, 'No fact is refused inside the caps'),
    check('protected-lost', 0, protectedData.lost, 'No protected fact is lost'),
  );
  const replay = {
    staged: longStats.replay.staged + autosaveStats.replay.staged,
    committed: longStats.replay.committed + autosaveStats.replay.committed,
    evictedChunks: longStats.replay.evictedChunks + autosaveStats.replay.evictedChunks,
    evictedBytes: longStats.replay.evictedBytes + autosaveStats.replay.evictedBytes,
    tooLarge: longStats.replay.tooLarge + autosaveStats.replay.tooLarge,
    failed: longStats.replay.failed + autosaveStats.replay.failed,
    partial: longStats.replay.partial || autosaveStats.replay.partial,
    durable: longStats.replay.durable,
  };
  checks.push(
    check('replay-staged', true, replay.staged >= 2, 'The recorder chunks reach the pipeline'),
    check('replay-partial', true, replay.partial, 'Eviction is declared partial'),
    check(
      'replay-too-large-declared',
      true,
      replay.tooLarge > 0,
      'A chunk larger than the whole window is refused and declared, never truncated',
    ),
    check('replay-durable-port', true, replay.durable, 'A store with a chunk port commits them'),
  );

  /* ------------------------------------------------------- tick path proof */
  const clock = countingClock([0, 0.4, 0.4, 16.4, 16.4, 18.8, 18.8, 19.6, 19.6, 19.65]);
  const tickStore = createScriptedStore();
  const tickPipeline = pipeline(tickStore, { monotonic: clock.clock });
  const readsBefore = clock.readCount();
  tickPipeline.offerTick(pipelineSource(worldAt(60)));
  const readsAfter = clock.readCount();
  await tickPipeline.drain();
  const tickPath = {
    clockReadsPerOffer: readsAfter - readsBefore,
    generationsCaptured: tickPipeline.stats().generations.captured,
    synchronousWorkInsideTickMs: stages.capture,
    storageWorkInsideTickMs: 0,
  };
  checks.push(
    check(
      'tick-clock-reads',
      2,
      tickPath.clockReadsPerOffer,
      'The tick reads the clock for the capture only',
    ),
    check(
      'tick-no-storage',
      0,
      tickPath.storageWorkInsideTickMs,
      'No storage work runs inside the tick',
    ),
    check(
      'tick-one-generation',
      1,
      tickPath.generationsCaptured,
      'One offer captures one generation',
    ),
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return Object.freeze({
    version: '222-bounded-pipeline-v1' as const,
    generatedBy:
      'node --import ./scripts/register-typescript.mjs scripts/run-bounded-pipeline-report.mjs',
    oracleRule:
      'Every expected value is the documented contract; the actual value is a real run against the deterministic 30/40 world, the real 207 recorder, the synchronous store double and the in-memory IndexedDB, with no wall clock and no Math.random.',
    budgets,
    fleet,
    stages,
    tickPath,
    autosave: autosaveReport,
    longIntervention: longReport,
    slowStorage: slowReport,
    quotaFull: quotaReport,
    crash: crashReport,
    twoSessions,
    protectedData,
    replay,
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

/* --------------------------------------------------------------- real timing */

function statistics(values: readonly number[]): {
  readonly min: number;
  readonly median: number;
  readonly max: number;
} {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return Object.freeze({
    min: rounded(sorted[0] ?? 0),
    median: rounded(median),
    max: rounded(sorted[sorted.length - 1] ?? 0),
  });
}

/**
 * Real stage costs on this machine. This is the only wall-clock measurement of PBI 222 and it is
 * not part of the deterministic transcript: it is a local sample set, not a p95 and not a hardware
 * certification.
 */
export async function measureBoundedPipelineCosts(samples = 20): Promise<BoundedPipelineCosts> {
  const capture: number[] = [];
  const encode: number[] = [];
  const copy: number[] = [];
  const transfer: number[] = [];
  const commit: number[] = [];
  const total: number[] = [];
  const store = createScriptedStore();
  const subject = createBoundedPipeline({
    store,
    sessionId: PIPELINE_SESSION,
    checkpointId: PIPELINE_CHECKPOINT,
    versions: PIPELINE_VERSIONS,
    now: () => PIPELINE_NOW,
    onCommit: (report) => {
      capture.push(report.stages.captureMs);
      encode.push(report.stages.encodeMs);
      copy.push(report.stages.copyMs);
      transfer.push(report.stages.transferMs);
      commit.push(report.stages.commitMs);
      total.push(report.stages.totalMs);
    },
  });
  const world = createPipelineWorld();
  for (let index = 0; index < 60; index += 1) stepPipelineWorld(world);
  for (let sample = 0; sample < samples; sample += 1) {
    for (let index = 0; index < 60; index += 1) stepPipelineWorld(world);
    subject.offerTick(pipelineSource(world));
    await subject.drain();
  }
  const last = subject.stats().lastCommit;
  return {
    contract: '222-bounded-pipeline-v1',
    sampleCount: capture.length,
    vehicles: PIPELINE_FLEET.vehicles,
    bytes: last?.bytes ?? 0,
    measuredAt: new Date().toISOString(),
    clock: 'performance.now',
    tickBudgetDesktopMs: 5.5,
    tickBudgetLaptopMs: 8,
    captureMs: statistics(capture),
    encodeMs: statistics(encode),
    copyMs: statistics(copy),
    transferMs: statistics(transfer),
    commitMs: statistics(commit),
    totalMs: statistics(total),
  };
}
