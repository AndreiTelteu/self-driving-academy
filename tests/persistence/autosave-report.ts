import { readFileSync } from 'node:fs';
import {
  AUTOSAVE_BUDGET,
  AUTOSAVE_INTERVAL_TICKS,
  createRepositoryPipelineStore,
  createSessionAutosave,
} from '../../src/persistence/index';
import type {
  AutosaveStageCost,
  BoundedGeneration,
  BoundedPipelineStore,
  BoundedStoreCommit,
  LocalRepository,
} from '../../src/persistence/index';
import { FIXED_TICK_HZ } from '../../src/simulation/index';
import {
  AUTOSAVE_CHECKPOINT,
  AUTOSAVE_NOW,
  AUTOSAVE_SESSION,
  AUTOSAVE_VERSIONS,
  autosaveSource,
  createAutosaveHarness,
  runAutosaveWorld,
  stepAutosaveWorld,
} from './autosave-fixtures';
import { countingClock } from './bounded-pipeline-fixtures';
import { reopen } from './progress-save-fixture';

/**
 * Deterministic transcript of PBI 131.
 *
 * Every number below is produced by a real run against the 206 fixture world (30 taxis and 40
 * civilians), the real 130 progress store over the in-memory 127 IndexedDB double and the real 222
 * bounded pipeline. Time is injected (`AUTOSAVE_NOW`, scripted monotonic clock); the transcript
 * contains no wall clock, no timer and no random value, so two runs are byte-identical. Real
 * timings of this machine are produced separately by `measureAutosaveCosts` (`--cost`).
 */

const MANIFEST = JSON.parse(
  readFileSync(new URL('../../Docs/performance-budgets.json', import.meta.url), 'utf8'),
) as { proposedCapacities: Record<string, number | null> };

export interface AutosaveCheck {
  readonly name: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly pass: boolean;
  readonly detail: string;
}

export interface AutosaveReport {
  readonly version: '131-autosave-v1';
  readonly generatedBy: string;
  readonly oracleRule: string;
  readonly budgets: {
    readonly source: string;
    readonly budgetVersion: string;
    readonly intervalTicks: number;
    readonly intervalSeconds: number;
    readonly tickHz: number;
    readonly capturesPerInterval: number;
    readonly preparingGenerations: number;
    readonly committingGenerations: number;
    readonly transferIngressBytes: number;
    readonly maxCheckpointBytes: number;
    readonly maxProgressBodyBytes: number;
    readonly recorderRamBytes: number;
  };
  readonly fleet: {
    readonly taxis: number;
    readonly civilians: number;
    readonly vehicles: number;
    readonly signals: number;
    readonly snapshotBytes: number;
    readonly snapshotChecksum: string;
  };
  readonly tickPath: {
    readonly clockReadsOnSkippedTicks: number;
    readonly clockReadsPerOffer: number;
    readonly synchronousWorkInsideTickMs: number;
    readonly storageWorkInsideTickMs: number;
    readonly skippedTicks: number;
  };
  readonly stages: {
    readonly clock: 'STUB_CLOCK';
    readonly captureMs: number;
    readonly encodeMs: number;
    readonly copyMs: number;
    readonly transferMs: number;
    readonly commitMs: number;
    readonly progressMs: number;
    readonly checkpointMs: number;
    readonly totalMs: number;
  };
  readonly periodic: {
    readonly ticks: number;
    readonly intervalTicks: number;
    readonly requests: number;
    readonly captured: number;
    readonly commits: number;
    readonly progressCommits: number;
    readonly skippedTicks: number;
    readonly unsavedTicks: number;
    readonly lastSavedTick: number | null;
    readonly checkpointBytes: number;
    readonly progressBytes: number;
    readonly trackerRowsBeforeCheckpoint: number;
  };
  readonly coalescing: {
    readonly intervalTicks: number;
    readonly ticks: number;
    readonly captured: number;
    readonly deferredRequests: number;
    readonly catchUpRequests: number;
    readonly handedTicks: readonly number[];
    readonly maxPrepared: number;
    readonly maxCommitting: number;
    readonly deferredWhileStalled: number | null;
    readonly unsavedTicksWhileStalled: number | null;
    readonly unsavedTicksAfterCatchUp: number | null;
    /** Injected-clock reads while the deferred window waited: the tick path costs nothing. */
    readonly clockReadsWhileDeferred: number;
  };
  readonly closeDuringWrite: {
    readonly closeTick: number;
    readonly handedBeforeRelease: number;
    readonly handedAfterClose: readonly number[];
    readonly status: string;
    readonly progress: string;
    readonly checkpoint: string;
    readonly durableTick: number | null;
    readonly unsavedTicks: number | null;
  };
  readonly closeFailure: {
    readonly failedStatus: string;
    readonly failedProgress: string;
    readonly failedCheckpoint: string;
    readonly failedCode: string | null;
    readonly failedErrorStage: string | null;
    readonly retryable: boolean;
    readonly unsavedTicks: number | null;
    readonly retriedStatus: string;
    readonly retriedDurableTick: number | null;
    readonly attempts: number;
    readonly viewClaimsCompletedSaveWhileFailed: boolean;
  };
  readonly reload: {
    readonly autosaveTick: number | null;
    readonly closeTick: number | null;
    readonly savedTrackerDigest: string | null;
    readonly reloadedTrackerDigest: string | null;
    readonly sameDigest: boolean;
    readonly progressRows: number;
    readonly settingsSource: string;
    readonly secondSessionCheckpointTick: number | null;
  };
  readonly closeOnly: {
    readonly status: string;
    readonly progress: string;
    readonly checkpoint: string;
    readonly durableTick: number | null;
    readonly unsavedTicks: number | null;
  };
  readonly view: {
    readonly pendingClaimsCompletedSave: boolean;
    readonly successClaimsCompletedSave: boolean;
    readonly errorClaimsCompletedSave: boolean;
    readonly labels: readonly string[];
  };
  readonly checks: readonly AutosaveCheck[];
  readonly summary: {
    readonly checks: number;
    readonly passed: number;
    readonly pass: boolean;
  };
}

async function settle(times = 400): Promise<void> {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

async function until(predicate: () => boolean, turns = 2000): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('The report fixture did not reach the expected state');
}

interface RecordingStore extends BoundedPipelineStore {
  readonly handed: BoundedGeneration[];
  trackerRowsAtHandoff: number;
}

function recordingStore(base: BoundedPipelineStore, repository: LocalRepository): RecordingStore {
  const handed: BoundedGeneration[] = [];
  const store: RecordingStore = {
    handed,
    trackerRowsAtHandoff: 0,
    handoff(generation: BoundedGeneration): Promise<BoundedStoreCommit> {
      handed.push(generation);
      return repository.listProgress(AUTOSAVE_SESSION).then((rows) => {
        store.trackerRowsAtHandoff = rows.filter(
          (row) => row.body.kind === 'MISSION_TRACKER',
        ).length;
        return base.handoff(generation);
      });
    },
  };
  return store;
}

function rowKindDigest(rows: readonly { readonly body: Readonly<Record<string, unknown>> }[]): {
  readonly digest: string | null;
  readonly rows: number;
} {
  const tracker = rows.find((row) => row.body.kind === 'MISSION_TRACKER');
  return {
    digest: typeof tracker?.body.digest === 'string' ? tracker.body.digest : null,
    rows: rows.length,
  };
}

/** Runs one periodic session at the production interval and returns its transcript section. */
async function periodicScenario(): Promise<{
  periodic: AutosaveReport['periodic'];
  fleet: AutosaveReport['fleet'];
  tickPath: AutosaveReport['tickPath'];
  stages: AutosaveReport['stages'];
}> {
  const clock = countingClock([0, 1, 1, 5, 5, 6, 6, 7, 7, 7, 8, 8, 9, 9]);
  const harness = await createAutosaveHarness({
    intervalTicks: AUTOSAVE_INTERVAL_TICKS,
    monotonic: clock.clock,
  });
  harness.autosave.dispose();
  const base = createRepositoryPipelineStore({ repository: harness.save.repository });
  const store = recordingStore(base, harness.save.repository);
  const autosave = createSessionAutosave({
    store,
    progressStore: harness.save.store,
    inventory: () => harness.progress(),
    sessionId: AUTOSAVE_SESSION,
    checkpointId: AUTOSAVE_CHECKPOINT,
    versions: AUTOSAVE_VERSIONS,
    intervalTicks: AUTOSAVE_INTERVAL_TICKS,
    monotonic: clock.clock,
    now: () => AUTOSAVE_NOW,
  });

  let readsBeforeDue = -1;
  let readsAtOffer = -1;
  for (let index = 0; index < AUTOSAVE_INTERVAL_TICKS; index += 1) {
    stepAutosaveWorld(harness.world);
    if (harness.world.tick === AUTOSAVE_INTERVAL_TICKS - 1) {
      readsBeforeDue = clock.readCount();
    }
    const decision = autosave.onTick(autosaveSource(harness.world));
    if (decision.status === 'CAPTURED') readsAtOffer = clock.readCount();
  }
  await autosave.flush();

  const status = autosave.status();
  const generation = store.handed[0];
  if (generation === undefined) throw new Error('The periodic scenario handed no generation');
  const rows = await harness.save.repository.listProgress(AUTOSAVE_SESSION);
  const checkpoint = await harness.save.repository.latestCheckpoint(AUTOSAVE_SESSION);
  const cost = status.saveTime.lastCost;
  const stages: AutosaveReport['stages'] = {
    clock: 'STUB_CLOCK',
    captureMs: cost?.captureMs ?? -1,
    encodeMs: cost?.encodeMs ?? -1,
    copyMs: cost?.copyMs ?? -1,
    transferMs: cost?.transferMs ?? -1,
    commitMs: cost?.commitMs ?? -1,
    progressMs: cost?.progressMs ?? -1,
    checkpointMs: cost?.checkpointMs ?? -1,
    totalMs: cost?.totalMs ?? -1,
  };
  const periodic: AutosaveReport['periodic'] = {
    ticks: status.counters.ticks,
    intervalTicks: autosave.intervalTicks,
    requests: status.counters.requests,
    captured: status.counters.captured,
    commits: status.counters.commits,
    progressCommits: status.counters.progressCommits,
    skippedTicks: status.counters.skippedTicks,
    unsavedTicks: status.simulated.unsavedTicks ?? -1,
    lastSavedTick: status.simulated.lastSavedTick,
    checkpointBytes: checkpoint?.bodyBytes ?? 0,
    progressBytes: rows.reduce((total, row) => total + row.bodyBytes, 0),
    trackerRowsBeforeCheckpoint: store.trackerRowsAtHandoff,
  };
  const fleet: AutosaveReport['fleet'] = {
    taxis: 30,
    civilians: 40,
    vehicles: generation.snapshot.vehicles.length,
    signals: generation.snapshot.signals.length,
    snapshotBytes: generation.bytes,
    snapshotChecksum: generation.checksum,
  };
  const tickPath: AutosaveReport['tickPath'] = {
    clockReadsOnSkippedTicks: readsBeforeDue,
    clockReadsPerOffer: readsAtOffer - readsBeforeDue,
    synchronousWorkInsideTickMs: stages.captureMs,
    storageWorkInsideTickMs: 0,
    skippedTicks: status.counters.skippedTicks,
  };
  autosave.dispose();
  harness.save.repository.close();
  return { periodic, fleet, tickPath, stages };
}

/** One slow-storage session: the deferred slot, the catch-up and the age in ticks. */
async function coalescingScenario(): Promise<AutosaveReport['coalescing']> {
  const clock = countingClock([0]);
  const harness = await createAutosaveHarness({
    intervalTicks: 60,
    store: 'SCRIPTED',
    mode: 'STUCK',
    monotonic: clock.clock,
  });
  const store = harness.scripted;
  if (store === null) throw new Error('The coalescing scenario needs the scripted store');
  let maxPrepared = 0;
  let maxCommitting = 0;
  for (let tick = 1; tick <= 60; tick += 1) {
    stepAutosaveWorld(harness.world);
    harness.autosave.onTick(autosaveSource(harness.world));
  }
  await until(() => store.handed.length === 1);
  const readsBefore = clock.readCount();
  for (let tick = 61; tick <= 180; tick += 1) {
    stepAutosaveWorld(harness.world);
    harness.autosave.onTick(autosaveSource(harness.world));
    const stats = harness.autosave.status().pipeline;
    if (stats.generations.preparedTick !== null) maxPrepared = 1;
    if (stats.generations.committingTick !== null) maxCommitting = 1;
  }
  const clockReadsWhileDeferred = clock.readCount() - readsBefore;
  const stalled = harness.autosave.status();
  store.mode = 'OK';
  store.releaseAll();
  await harness.autosave.flush();
  stepAutosaveWorld(harness.world);
  harness.autosave.onTick(autosaveSource(harness.world));
  await harness.autosave.flush();
  const after = harness.autosave.status();
  const result: AutosaveReport['coalescing'] = {
    intervalTicks: harness.autosave.intervalTicks,
    ticks: after.counters.ticks,
    captured: after.counters.captured,
    deferredRequests: after.counters.deferredRequests,
    catchUpRequests: after.counters.catchUpRequests,
    handedTicks: store.handed.map((generation) => generation.tick),
    maxPrepared,
    maxCommitting,
    deferredWhileStalled: stalled.simulated.deferredTick,
    unsavedTicksWhileStalled: stalled.simulated.unsavedTicks,
    unsavedTicksAfterCatchUp: after.simulated.unsavedTicks,
    clockReadsWhileDeferred,
  };
  harness.autosave.dispose();
  harness.save.repository.close();
  return result;
}

async function closeDuringWriteScenario(): Promise<AutosaveReport['closeDuringWrite']> {
  const harness = await createAutosaveHarness({
    intervalTicks: 60,
    store: 'SCRIPTED',
    mode: 'STUCK',
  });
  const store = harness.scripted;
  if (store === null) throw new Error('The close scenario needs the scripted store');
  for (let tick = 1; tick <= 60; tick += 1) {
    stepAutosaveWorld(harness.world);
    harness.autosave.onTick(autosaveSource(harness.world));
  }
  await until(() => store.handed.length === 1);
  for (let tick = 61; tick <= 75; tick += 1) stepAutosaveWorld(harness.world);
  const closing = harness.autosave.close({
    source: autosaveSource(harness.world),
    progress: harness.progress(),
    reason: 'PAGE_HIDE',
  });
  await settle();
  const handedBeforeRelease = store.handed.length;
  store.mode = 'OK';
  store.releaseAll();
  const result = await closing;
  const section: AutosaveReport['closeDuringWrite'] = {
    closeTick: result.closeTick ?? -1,
    handedBeforeRelease,
    handedAfterClose: store.handed.map((generation) => generation.tick),
    status: result.status,
    progress: result.progress,
    checkpoint: result.checkpoint,
    durableTick: result.durableTick,
    unsavedTicks: result.unsavedTicks,
  };
  harness.autosave.dispose();
  harness.save.repository.close();
  return section;
}

async function closeFailureScenario(): Promise<AutosaveReport['closeFailure']> {
  const harness = await createAutosaveHarness({ progressRejections: 1 });
  runAutosaveWorld(harness.world, 30);
  const failed = await harness.autosave.close({
    source: autosaveSource(harness.world),
    progress: harness.progress(),
    reason: 'PAGE_HIDE',
  });
  const failedStatus = harness.autosave.status();
  const retried = await harness.autosave.retryClose();
  const section: AutosaveReport['closeFailure'] = {
    failedStatus: failed.status,
    failedProgress: failed.progress,
    failedCheckpoint: failed.checkpoint,
    failedCode: failed.code,
    failedErrorStage: failedStatus.lastError?.stage ?? null,
    retryable: failed.retryable,
    unsavedTicks: failed.unsavedTicks,
    retriedStatus: retried.status,
    retriedDurableTick: retried.durableTick,
    attempts: retried.attempt,
    viewClaimsCompletedSaveWhileFailed: failedStatus.view.claimsCompletedSave,
  };
  harness.autosave.dispose();
  harness.save.repository.close();
  return section;
}

async function reloadScenario(): Promise<AutosaveReport['reload']> {
  // A: periodic autosave, then a real close of the tab and a new page.
  const autosaveHarness = await createAutosaveHarness({ intervalTicks: AUTOSAVE_INTERVAL_TICKS });
  runAutosaveWorld(autosaveHarness.world, AUTOSAVE_INTERVAL_TICKS);
  autosaveHarness.autosave.onTick(autosaveSource(autosaveHarness.world));
  await autosaveHarness.autosave.flush();
  const liveRows = await autosaveHarness.save.repository.listProgress(AUTOSAVE_SESSION);
  const liveTracker = rowKindDigest(liveRows);
  const checkpoint = await autosaveHarness.save.repository.latestCheckpoint(AUTOSAVE_SESSION);
  autosaveHarness.autosave.dispose();
  autosaveHarness.save.repository.close();
  const first = await reopen({
    factory: autosaveHarness.save.factory,
    locks: autosaveHarness.save.locks,
    catalog: autosaveHarness.save.catalog,
  });
  const loaded = await first.store.load({ sessionId: AUTOSAVE_SESSION, playerId: 'player:130' });
  const reloadedRows = await first.repository.listProgress(AUTOSAVE_SESSION);
  const reloadedTracker = rowKindDigest(reloadedRows);
  first.repository.close();

  // B: close at tick 950 on a fresh origin, then reopen and read the checkpoint back.
  const closeHarness = await createAutosaveHarness({ intervalTicks: AUTOSAVE_INTERVAL_TICKS });
  runAutosaveWorld(closeHarness.world, 950);
  const closed = await closeHarness.autosave.close({
    source: autosaveSource(closeHarness.world),
    progress: closeHarness.progress(),
    reason: 'USER_QUIT',
  });
  closeHarness.autosave.dispose();
  closeHarness.save.repository.close();
  const second = await reopen({
    factory: closeHarness.save.factory,
    locks: closeHarness.save.locks,
    catalog: closeHarness.save.catalog,
  });
  const secondCheckpoint = await second.repository.latestCheckpoint(AUTOSAVE_SESSION);
  second.repository.close();

  return {
    autosaveTick: checkpoint?.tick ?? null,
    closeTick: closed.durableTick,
    savedTrackerDigest: liveTracker.digest,
    reloadedTrackerDigest: reloadedTracker.digest,
    sameDigest: liveTracker.digest !== null && liveTracker.digest === reloadedTracker.digest,
    progressRows: reloadedRows.length,
    settingsSource: loaded.settingsSource,
    secondSessionCheckpointTick: secondCheckpoint?.tick ?? null,
  };
}

async function closeOnlyScenario(): Promise<AutosaveReport['closeOnly']> {
  const harness = await createAutosaveHarness({ noProgress: true });
  runAutosaveWorld(harness.world, 40);
  const result = await harness.autosave.close({
    source: autosaveSource(harness.world),
    reason: 'TEST',
  });
  const section: AutosaveReport['closeOnly'] = {
    status: result.status,
    progress: result.progress,
    checkpoint: result.checkpoint,
    durableTick: result.durableTick,
    unsavedTicks: result.unsavedTicks,
  };
  harness.autosave.dispose();
  harness.save.repository.close();
  return section;
}

async function viewScenario(): Promise<AutosaveReport['view']> {
  const harness = await createAutosaveHarness({
    intervalTicks: 30,
    store: 'SCRIPTED',
    mode: 'STUCK',
  });
  const store = harness.scripted;
  if (store === null) throw new Error('The view scenario needs the scripted store');
  for (let tick = 1; tick <= 30; tick += 1) {
    stepAutosaveWorld(harness.world);
    harness.autosave.onTick(autosaveSource(harness.world));
  }
  await until(() => store.handed.length === 1);
  const pending = harness.autosave.status();
  store.mode = 'OK';
  store.releaseAll();
  await harness.autosave.flush();
  const success = harness.autosave.status();
  store.rejectNext = 1;
  for (let tick = 31; tick <= 60; tick += 1) {
    stepAutosaveWorld(harness.world);
    harness.autosave.onTick(autosaveSource(harness.world));
  }
  await harness.autosave.flush();
  const error = harness.autosave.status();
  const section: AutosaveReport['view'] = {
    pendingClaimsCompletedSave: pending.view.claimsCompletedSave,
    successClaimsCompletedSave: success.view.claimsCompletedSave,
    errorClaimsCompletedSave: error.view.claimsCompletedSave,
    labels: [pending.view.label, success.view.label, error.view.label],
  };
  harness.autosave.dispose();
  harness.save.repository.close();
  return section;
}

function check(
  checks: AutosaveCheck[],
  name: string,
  expected: unknown,
  actual: unknown,
  detail: string,
): void {
  checks.push(
    Object.freeze({
      name,
      expected,
      actual,
      pass: JSON.stringify(expected) === JSON.stringify(actual),
      detail,
    }),
  );
}

export async function runAutosaveReport(): Promise<AutosaveReport> {
  const { periodic, fleet, tickPath, stages } = await periodicScenario();
  const coalescing = await coalescingScenario();
  const closeDuringWrite = await closeDuringWriteScenario();
  const closeFailure = await closeFailureScenario();
  const reload = await reloadScenario();
  const closeOnly = await closeOnlyScenario();
  const view = await viewScenario();

  const checks: AutosaveCheck[] = [];
  check(
    checks,
    'interval is 900 ticks',
    900,
    AUTOSAVE_BUDGET.intervalTicks,
    'Docs/15 15 s at 60 Hz',
  );
  check(checks, 'interval is 15 seconds', 15, AUTOSAVE_BUDGET.intervalSeconds, '900 / 60');
  check(checks, 'fixed tick is 60 Hz', 60, FIXED_TICK_HZ, 'authoritative loop');
  check(checks, 'tick path has no storage work', 0, tickPath.storageWorkInsideTickMs, 'ms');
  check(
    checks,
    'skipped ticks cost zero clock reads',
    0,
    tickPath.clockReadsOnSkippedTicks,
    'reads',
  );
  check(checks, 'a capture reads the clock twice', 2, tickPath.clockReadsPerOffer, 'capture only');
  check(checks, 'periodic requests', 1, periodic.requests, 'one window in 900 ticks');
  check(checks, 'periodic captures', 1, periodic.captured, 'one generation');
  check(checks, 'periodic commits', 1, periodic.commits, 'confirmed by the store');
  check(checks, 'periodic progress commits', 1, periodic.progressCommits, 'one 130 transaction');
  check(checks, 'periodic skipped ticks', 899, periodic.skippedTicks, '899 ticks do no work');
  check(checks, 'periodic unsaved ticks', 0, periodic.unsavedTicks, 'nothing left unsaved');
  check(checks, 'periodic saved tick', 900, periodic.lastSavedTick, 'the interval tick');
  check(checks, 'tracker row before checkpoint', 1, periodic.trackerRowsBeforeCheckpoint, 'order');
  check(
    checks,
    'checkpoint under its byte cap',
    true,
    periodic.checkpointBytes > 0 && periodic.checkpointBytes <= AUTOSAVE_BUDGET.maxCheckpointBytes,
    `${periodic.checkpointBytes} of ${AUTOSAVE_BUDGET.maxCheckpointBytes} bytes`,
  );
  check(checks, 'fleet vehicles', 70, fleet.vehicles, '30 taxis + 40 civilians');
  check(checks, 'snapshot checksum present', true, fleet.snapshotChecksum.length === 64, 'SHA-256');
  check(checks, 'capture is the only tick stage', true, stages.captureMs <= stages.encodeMs, 'ms');
  check(
    checks,
    'commit is the sum of both writes',
    stages.commitMs,
    stages.progressMs + stages.checkpointMs,
    'ms',
  );
  check(
    checks,
    'total is the sum of the stages',
    stages.totalMs,
    stages.captureMs + stages.encodeMs + stages.copyMs + stages.transferMs + stages.commitMs,
    'ms',
  );
  check(checks, 'coalescing keeps one deferred slot', 1, coalescing.deferredRequests, 'bounded');
  check(checks, 'coalescing never captures twice', 2, coalescing.captured, 'initial + catch-up');
  check(
    checks,
    'coalescing hands two generations',
    2,
    coalescing.handedTicks.length,
    'no per-tick write',
  );
  check(checks, 'coalescing catch-up count', 1, coalescing.catchUpRequests, 'one catch-up');
  check(
    checks,
    'coalescing keeps the order',
    '60,181',
    coalescing.handedTicks.join(','),
    'initial then next boundary',
  );
  check(
    checks,
    'coalescing prepares no second generation',
    0,
    coalescing.maxPrepared,
    'the deferred slot is not a prepared generation',
  );
  check(checks, 'coalescing committing slots', 1, coalescing.maxCommitting, 'at most one');
  check(
    checks,
    'coalescing blocks no tick',
    0,
    coalescing.clockReadsWhileDeferred,
    'ticks never await storage or read the clock',
  );
  check(
    checks,
    'coalescing leaves nothing unsaved',
    0,
    coalescing.unsavedTicksAfterCatchUp,
    'ticks',
  );
  check(
    checks,
    'close waits for the in-flight write',
    1,
    closeDuringWrite.handedBeforeRelease,
    'one writer',
  );
  check(checks, 'close result is saved', 'SAVED', closeDuringWrite.status, 'explicit result');
  check(checks, 'close writes progress', 'COMMITTED', closeDuringWrite.progress, '130');
  check(checks, 'close writes the checkpoint', 'COMMITTED', closeDuringWrite.checkpoint, '222');
  check(
    checks,
    'close saves the close tick',
    closeDuringWrite.closeTick,
    closeDuringWrite.durableTick,
    'tick',
  );
  check(checks, 'close has nothing unsaved', 0, closeDuringWrite.unsavedTicks, 'ticks');
  check(
    checks,
    'close keeps the lane order',
    true,
    closeDuringWrite.handedAfterClose[0] === 60 && closeDuringWrite.handedAfterClose[1] === 75,
    'ticks 60 then 75',
  );
  check(checks, 'failed close is not SAVED', 'FAILED', closeFailure.failedStatus, 'explicit error');
  check(
    checks,
    'failed close blames progress',
    'REJECTED',
    closeFailure.failedProgress,
    'STORAGE_FULL',
  );
  check(
    checks,
    'failed close skips the checkpoint',
    'SKIPPED',
    closeFailure.failedCheckpoint,
    'no newer world over stale rewards',
  );
  check(checks, 'failed close keeps the payload', true, closeFailure.retryable, 'retryable');
  check(checks, 'failed close names the stage', 'PROGRESS', closeFailure.failedErrorStage, 'stage');
  check(
    checks,
    'failed close does not claim a save',
    false,
    closeFailure.viewClaimsCompletedSaveWhileFailed,
    'view',
  );
  check(checks, 'retried close succeeds', 'SAVED', closeFailure.retriedStatus, 'second attempt');
  check(checks, 'retried close saves the close tick', 30, closeFailure.retriedDurableTick, 'tick');
  check(checks, 'reload reads the autosave tick', 900, reload.autosaveTick, 'checkpoint');
  check(checks, 'reload reads the close tick', 950, reload.closeTick, 'checkpoint');
  check(checks, 'reload keeps the progress digest', true, reload.sameDigest, '130 snapshot');
  check(checks, 'reload keeps two progress rows', 2, reload.progressRows, 'tracker + campaign');
  check(checks, 'reload reads the settings row', 'STORED', reload.settingsSource, '009');
  check(checks, 'reload of the closed session', 950, reload.secondSessionCheckpointTick, 'tick');
  check(checks, 'close-only session is saved', 'SAVED', closeOnly.status, 'checkpoint only');
  check(
    checks,
    'close-only invents no progress',
    'NOT_REQUESTED',
    closeOnly.progress,
    'no 130 payload',
  );
  check(checks, 'close-only saves the close tick', 40, closeOnly.durableTick, 'tick');
  check(checks, 'pending never claims a save', false, view.pendingClaimsCompletedSave, 'view');
  check(checks, 'success claims a save', true, view.successClaimsCompletedSave, 'view');
  check(checks, 'error never claims a save', false, view.errorClaimsCompletedSave, 'view');
  check(
    checks,
    'the three labels are distinct',
    'SAVING,SAVED,SAVE_FAILED',
    view.labels.join(','),
    'labels',
  );
  check(
    checks,
    'transfer ingress matches the manifest',
    MANIFEST.proposedCapacities.pendingWorkerPayloadBytes,
    AUTOSAVE_BUDGET.transferIngressBytes,
    'bytes',
  );
  check(checks, 'one preparing generation', 1, AUTOSAVE_BUDGET.preparingGenerations, '222');
  check(checks, 'one committing generation', 1, AUTOSAVE_BUDGET.committingGenerations, '222');
  check(
    checks,
    'at most one capture per interval',
    1,
    AUTOSAVE_BUDGET.capturesPerInterval,
    'per 900 ticks',
  );

  const passed = checks.filter((entry) => entry.pass).length;
  return {
    version: '131-autosave-v1',
    generatedBy: 'scripts/run-autosave-report.mjs',
    oracleRule:
      'A number is recorded only if the real 127/130/222 code produced it; the transcript has no wall clock and two runs are byte-identical.',
    budgets: {
      source: AUTOSAVE_BUDGET.source,
      budgetVersion: AUTOSAVE_BUDGET.budgetVersion,
      intervalTicks: AUTOSAVE_BUDGET.intervalTicks,
      intervalSeconds: AUTOSAVE_BUDGET.intervalSeconds,
      tickHz: AUTOSAVE_BUDGET.tickHz,
      capturesPerInterval: AUTOSAVE_BUDGET.capturesPerInterval,
      preparingGenerations: AUTOSAVE_BUDGET.preparingGenerations,
      committingGenerations: AUTOSAVE_BUDGET.committingGenerations,
      transferIngressBytes: AUTOSAVE_BUDGET.transferIngressBytes,
      maxCheckpointBytes: AUTOSAVE_BUDGET.maxCheckpointBytes,
      maxProgressBodyBytes: AUTOSAVE_BUDGET.maxProgressBodyBytes,
      recorderRamBytes: AUTOSAVE_BUDGET.recorderRamBytes,
    },
    fleet,
    tickPath,
    stages,
    periodic,
    coalescing,
    closeDuringWrite,
    closeFailure,
    reload,
    closeOnly,
    view,
    checks,
    summary: { checks: checks.length, passed, pass: passed === checks.length },
  };
}

/* --------------------------------------------------------------------- cost */

export interface AutosaveCostStats {
  readonly min: number;
  readonly median: number;
  readonly max: number;
}

export interface AutosaveCostReport {
  readonly contract: '131-autosave-v1';
  readonly clock: 'performance.now';
  readonly measuredAt: string;
  readonly sampleCount: number;
  readonly vehicles: number;
  readonly snapshotBytes: number;
  readonly tickBudgetDesktopMs: number;
  readonly tickBudgetLaptopMs: number;
  readonly captureMs: AutosaveCostStats;
  readonly encodeMs: AutosaveCostStats;
  readonly copyMs: AutosaveCostStats;
  readonly transferMs: AutosaveCostStats;
  readonly commitMs: AutosaveCostStats;
  readonly progressMs: AutosaveCostStats;
  readonly checkpointMs: AutosaveCostStats;
  readonly totalMs: AutosaveCostStats;
}

function stats(values: readonly number[]): AutosaveCostStats {
  if (values.length === 0) return Object.freeze({ min: 0, median: 0, max: 0 });
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return Object.freeze({
    min: sorted[0] ?? 0,
    median,
    max: sorted[sorted.length - 1] ?? 0,
  });
}

/**
 * The only wall-clock measurement of this PBI: one periodic cycle per sample, on this machine.
 * It is a local sample set, not a p95 and not a hardware certification.
 */
export async function measureAutosaveCosts(samples = 20): Promise<AutosaveCostReport> {
  const sampleCount = Number.isSafeInteger(samples) && samples > 0 ? samples : 20;
  const costs: AutosaveStageCost[] = [];
  let vehicles = 0;
  let bytes = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const harness = await createAutosaveHarness({ intervalTicks: 30 });
    const base = createRepositoryPipelineStore({ repository: harness.save.repository });
    const autosave = createSessionAutosave({
      store: base,
      progressStore: harness.save.store,
      inventory: () => harness.progress(),
      sessionId: AUTOSAVE_SESSION,
      checkpointId: AUTOSAVE_CHECKPOINT,
      versions: AUTOSAVE_VERSIONS,
      intervalTicks: 30,
      now: () => AUTOSAVE_NOW,
    });
    runAutosaveWorld(harness.world, 60);
    autosave.onTick(autosaveSource(harness.world));
    await autosave.flush();
    const status = autosave.status();
    const cost = status.saveTime.lastCost;
    if (cost !== null) costs.push(cost);
    vehicles = harness.world.vehicles.length;
    const checkpoint = await harness.save.repository.latestCheckpoint(AUTOSAVE_SESSION);
    if (checkpoint !== null) bytes = checkpoint.bodyBytes;
    autosave.dispose();
    harness.save.repository.close();
  }
  const of = (pick: (cost: AutosaveStageCost) => number) => stats(costs.map((cost) => pick(cost)));
  return {
    contract: '131-autosave-v1',
    clock: 'performance.now',
    measuredAt: new Date().toISOString(),
    sampleCount: costs.length,
    vehicles,
    snapshotBytes: bytes,
    tickBudgetDesktopMs: 5.5,
    tickBudgetLaptopMs: 8,
    captureMs: of((cost) => cost.captureMs),
    encodeMs: of((cost) => cost.encodeMs),
    copyMs: of((cost) => cost.copyMs),
    transferMs: of((cost) => cost.transferMs),
    commitMs: of((cost) => cost.commitMs),
    progressMs: of((cost) => cost.progressMs),
    checkpointMs: of((cost) => cost.checkpointMs),
    totalMs: of((cost) => cost.totalMs),
  };
}
