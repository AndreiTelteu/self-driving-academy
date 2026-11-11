import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AUTOSAVE_BUDGET,
  AUTOSAVE_INTERVAL_SECONDS,
  AUTOSAVE_INTERVAL_TICKS,
  createRepositoryPipelineStore,
  createSessionAutosave,
} from '../../src/persistence/index';
import type {
  BoundedGeneration,
  BoundedPipelineStore,
  BoundedStoreCommit,
  ProgressSaveStore,
} from '../../src/persistence/index';
import { FIXED_TICK_HZ } from '../../src/simulation/index';
import { countingClock } from './bounded-pipeline-fixtures';
import {
  AUTOSAVE_CHECKPOINT,
  AUTOSAVE_NOW,
  AUTOSAVE_SESSION,
  AUTOSAVE_VERSIONS,
  autosaveSource,
  createAutosaveHarness,
  createAutosaveWorld,
  runAutosaveWorld,
  stepAutosaveWorld,
} from './autosave-fixtures';
import type { AutosaveHarness } from './autosave-fixtures';
import { createSaveHarness, reopen, saveInput } from './progress-save-fixture';

/**
 * PBI 131 target tests: the periodic autosave is tick-driven and bounded, the close contract is
 * explicit, and neither path pretends an unfinished save is durable. Time is injected everywhere;
 * the only clock read in a skipped tick is zero, which is asserted with a counting clock.
 */

const MANIFEST = JSON.parse(
  readFileSync(new URL('../../Docs/performance-budgets.json', import.meta.url), 'utf8'),
) as { proposedCapacities: Record<string, number | null> };

/** Microtask turns; the autosave never schedules a timer, so this is a deterministic settle. */
async function settle(times = 6): Promise<void> {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

/** Bounded, deterministic wait for a state only a real write can produce (no timer involved). */
async function until(predicate: () => boolean, turns = 500): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error('The expected state was not reached within the bounded microtask turns');
}

async function tickTo(
  harness: AutosaveHarness,
  targetTick: number,
  onTick?: (tick: number) => void,
): Promise<number> {
  let current = harness.world.tick;
  while (current < targetTick) {
    stepAutosaveWorld(harness.world);
    current = harness.world.tick;
    harness.autosave.onTick(autosaveSource(harness.world));
    onTick?.(current);
  }
  return current;
}

test('131 the periodic autosave fires exactly at the interval tick and never before', async () => {
  const clock = countingClock([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const harness = await createAutosaveHarness({
    intervalTicks: 60,
    store: 'SCRIPTED',
    monotonic: clock.clock,
  });
  let captures = 0;
  await tickTo(harness, 59, () => {
    assert.equal(harness.autosave.status().counters.captured, 0);
  });
  assert.equal(harness.autosave.status().counters.ticks, 59);
  assert.equal(harness.autosave.status().counters.requests, 0);
  assert.equal(clock.readCount(), 0, 'a tick that is not due never reads the clock');
  assert.equal(harness.autosave.status().simulated.nextDueTick, 60);

  stepAutosaveWorld(harness.world);
  const decision = harness.autosave.onTick(autosaveSource(harness.world));
  assert.equal(decision.status, 'CAPTURED');
  assert.equal(decision.tick, 60);
  assert.equal(clock.readCount(), 2, 'the capture reads the clock exactly twice');
  captures += 1;
  await harness.autosave.flush();
  assert.equal(harness.autosave.status().counters.commits, 1);
  assert.equal(captures, 1);

  await tickTo(harness, 120, (tick) => {
    if (tick < 120) assert.equal(harness.autosave.status().counters.requests, 1);
  });
  assert.equal(harness.autosave.status().counters.requests, 2, 'the second window fires at 120');
  await harness.autosave.flush();
  assert.equal(harness.autosave.status().counters.commits, 2);
  assert.equal(harness.autosave.status().simulated.unsavedTicks, 0);
  assert.equal(harness.scripted?.handed.length, 2);
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 the production interval is 900 ticks, i.e. 15 seconds at 60 Hz, not a millisecond timer', () => {
  assert.equal(AUTOSAVE_INTERVAL_TICKS, 900);
  assert.equal(FIXED_TICK_HZ, 60);
  assert.equal(AUTOSAVE_INTERVAL_SECONDS, 15);
  assert.equal(AUTOSAVE_BUDGET.intervalTicks, 900);
  assert.equal(AUTOSAVE_BUDGET.intervalSeconds, 15);
  assert.equal(AUTOSAVE_BUDGET.tickHz, 60);
  assert.equal(AUTOSAVE_BUDGET.capturesPerInterval, 1);
  assert.equal(
    AUTOSAVE_BUDGET.transferIngressBytes,
    MANIFEST.proposedCapacities.pendingWorkerPayloadBytes,
  );
  assert.equal(
    AUTOSAVE_BUDGET.preparingGenerations,
    MANIFEST.proposedCapacities.preparingCheckpoints,
  );
  assert.equal(
    AUTOSAVE_BUDGET.committingGenerations,
    MANIFEST.proposedCapacities.committingCheckpoints,
  );
  assert.equal(AUTOSAVE_BUDGET.maxCheckpointBytes, 1_048_576);
  assert.equal(AUTOSAVE_BUDGET.maxProgressBodyBytes, 262_144);
});

test('131 a due request waits in one deferred slot while the previous write runs', async () => {
  const harness = await createAutosaveHarness({
    intervalTicks: 30,
    store: 'SCRIPTED',
    mode: 'STUCK',
  });
  const store = harness.scripted;
  assert.ok(store !== null);
  if (store === null) return;

  await tickTo(harness, 30);
  await until(() => store.handed.length === 1);
  assert.equal(harness.autosave.status().counters.captured, 1);
  assert.equal(harness.autosave.status().phase, 'PENDING');
  assert.equal(store.handed.length, 1);

  await tickTo(harness, 90);
  const waiting = harness.autosave.status();
  assert.equal(waiting.counters.deferredRequests, 1, 'one bounded deferred slot, not a queue');
  assert.equal(waiting.counters.captured, 1, 'no second capture while the first commits');
  assert.equal(waiting.simulated.deferredTick, 90);
  assert.equal(waiting.pending, true);
  assert.equal(waiting.view.claimsCompletedSave, false);

  store.mode = 'OK';
  store.releaseAll();
  await harness.autosave.flush();
  assert.equal(harness.autosave.status().pipeline.phase, 'IDLE');
  assert.equal(harness.autosave.status().phase, 'PENDING', 'the deferred request is still due');

  await tickTo(harness, 91);
  await harness.autosave.flush();
  const caughtUp = harness.autosave.status();
  assert.equal(caughtUp.counters.catchUpRequests, 1);
  assert.equal(caughtUp.counters.captured, 2);
  assert.deepEqual(
    store.handed.map((generation) => generation.tick),
    [30, 91],
    'the deferred window is saved once, at the next boundary, not once per missed window',
  );
  assert.equal(caughtUp.simulated.unsavedTicks, 0);
  assert.equal(
    caughtUp.simulated.nextDueTick,
    120,
    'the periodic window continues from the catch-up',
  );
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 a newer due window replaces the deferred one instead of growing a queue', async () => {
  const harness = await createAutosaveHarness({
    intervalTicks: 30,
    store: 'SCRIPTED',
    mode: 'STUCK',
  });
  const store = harness.scripted;
  assert.ok(store !== null);
  if (store === null) return;
  await tickTo(harness, 30);
  await until(() => store.handed.length === 1);
  await tickTo(harness, 90);
  const stats = harness.autosave.status();
  assert.equal(stats.counters.captured, 1);
  assert.equal(stats.simulated.deferredTick, 90);
  assert.equal(stats.counters.deferredRequests, 1);
  store.mode = 'OK';
  store.releaseAll();
  await harness.autosave.flush();
  await tickTo(harness, 91);
  await harness.autosave.flush();
  assert.deepEqual(
    store.handed.map((generation) => generation.tick),
    [30, 91],
  );
  assert.equal(harness.autosave.status().counters.catchUpRequests, 1);
  assert.equal(harness.autosave.status().counters.captured, 2);
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 close during an in-flight write waits for the 222 lane and then saves the close tick', async () => {
  const harness = await createAutosaveHarness({
    intervalTicks: 30,
    store: 'SCRIPTED',
    mode: 'STUCK',
  });
  const store = harness.scripted;
  assert.ok(store !== null);
  if (store === null) return;
  await tickTo(harness, 30);
  await until(() => store.handed.length === 1);
  assert.equal(store.handed.length, 1);

  await tickTo(harness, 45);
  const closing = harness.autosave.close({
    source: autosaveSource(harness.world),
    progress: harness.progress(),
    reason: 'TEST',
  });
  await settle();
  assert.equal(store.handed.length, 1, 'close never opens a second writer while one commit runs');

  store.mode = 'OK';
  store.releaseAll();
  const result = await closing;
  assert.equal(result.status, 'SAVED');
  assert.equal(result.progress, 'COMMITTED');
  assert.equal(result.checkpoint, 'COMMITTED');
  assert.equal(result.closeTick, 45);
  assert.equal(result.durableTick, 45);
  assert.equal(result.unsavedTicks, 0);
  assert.equal(result.retryable, false);
  assert.deepEqual(
    store.handed.map((generation) => generation.tick),
    [30, 45],
    'the in-flight generation is committed first, then the close generation',
  );
  assert.equal(harness.autosave.status().phase, 'CLOSED');
  assert.equal(harness.autosave.onTick(autosaveSource(harness.world)).code, 'AUTOSAVE_CLOSED');
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 a failed close write is explicit, retains the payload and can be retried', async () => {
  const harness = await createAutosaveHarness({ progressRejections: 1 });
  runAutosaveWorld(harness.world, 30);
  const failed = await harness.autosave.close({
    source: autosaveSource(harness.world),
    progress: harness.progress(),
    reason: 'TEST',
  });
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.progress, 'REJECTED');
  assert.equal(
    failed.checkpoint,
    'SKIPPED',
    'a failed progress write never publishes a newer world',
  );
  assert.equal(failed.code, 'STORAGE_FULL');
  assert.equal(failed.retryable, true);
  assert.equal(failed.durableTick, null);
  assert.equal(failed.unsavedTicks, 30);
  const status = harness.autosave.status();
  assert.equal(status.phase, 'ERROR');
  assert.equal(status.view.label, 'SAVE_FAILED');
  assert.equal(status.view.claimsCompletedSave, false);
  assert.equal(status.lastError?.stage, 'PROGRESS');

  const retried = await harness.autosave.retryClose();
  assert.equal(retried.status, 'SAVED');
  assert.equal(retried.progress, 'COMMITTED');
  assert.equal(retried.checkpoint, 'COMMITTED');
  assert.equal(retried.durableTick, 30);
  assert.equal(retried.attempt, 2);
  assert.equal(harness.autosave.status().phase, 'CLOSED');
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 a failed checkpoint after a durable progress write is PARTIAL, not SAVED', async () => {
  const harness = await createAutosaveHarness({ store: 'SCRIPTED', rejectNext: 1 });
  runAutosaveWorld(harness.world, 30);
  const failed = await harness.autosave.close({
    source: autosaveSource(harness.world),
    progress: harness.progress(),
  });
  assert.equal(failed.status, 'PARTIAL');
  assert.equal(failed.progress, 'COMMITTED');
  assert.equal(failed.checkpoint, 'REJECTED');
  assert.equal(failed.code, 'STORAGE_FULL');
  assert.equal(failed.durableTick, null);
  assert.equal(failed.retryable, true);
  assert.equal(harness.autosave.status().phase, 'ERROR');
  assert.equal(harness.autosave.status().lastError?.stage, 'CHECKPOINT');

  const retried = await harness.autosave.retryClose();
  assert.equal(retried.status, 'SAVED');
  assert.equal(retried.durableTick, 30);
  assert.equal(retried.checkpoint, 'COMMITTED');
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 progress rows are durable before the checkpoint row of the same cycle', async () => {
  const save = await createSaveHarness();
  const base = createRepositoryPipelineStore({ repository: save.repository });
  let trackerRowsAtHandoff = -1;
  const ordered: BoundedPipelineStore = {
    handoff(generation: BoundedGeneration): Promise<BoundedStoreCommit> {
      trackerRowsAtHandoff = 0;
      return save.repository.listProgress(AUTOSAVE_SESSION).then((rows) => {
        trackerRowsAtHandoff = rows.filter((row) => row.body.kind === 'MISSION_TRACKER').length;
        return base.handoff(generation);
      });
    },
  };
  const autosave = createSessionAutosave({
    store: ordered,
    progressStore: save.store,
    inventory: () => saveInput(save),
    sessionId: AUTOSAVE_SESSION,
    checkpointId: AUTOSAVE_CHECKPOINT,
    versions: AUTOSAVE_VERSIONS,
    intervalTicks: 30,
    now: () => AUTOSAVE_NOW,
  });
  const world = createAutosaveWorld();
  runAutosaveWorld(world, 30);
  autosave.onTick(autosaveSource(world));
  await autosave.flush();
  assert.equal(
    trackerRowsAtHandoff,
    1,
    'the 130 tracker row was already durable at checkpoint time',
  );
  assert.equal(autosave.status().counters.commits, 1);
  autosave.dispose();
  save.repository.close();
});

test('131 reload after a periodic autosave reads the saved tick and the saved progress', async () => {
  const harness = await createAutosaveHarness({ intervalTicks: 900 });
  runAutosaveWorld(harness.world, 900);
  const decision = harness.autosave.onTick(autosaveSource(harness.world));
  assert.equal(decision.status, 'CAPTURED');
  await harness.autosave.flush();
  const saved = harness.autosave.status();
  assert.equal(saved.counters.commits, 1);
  assert.equal(saved.simulated.lastSavedTick, 900);
  assert.equal(saved.simulated.unsavedTicks, 0);

  const checkpoint = await harness.save.repository.latestCheckpoint(AUTOSAVE_SESSION);
  assert.equal(checkpoint?.tick, 900);
  const rows = await harness.save.repository.listProgress(AUTOSAVE_SESSION);
  assert.equal(rows.filter((row) => row.body.kind === 'MISSION_TRACKER').length, 1);
  assert.equal(rows.filter((row) => row.body.kind === 'CAMPAIGN_LEDGER').length, 1);

  const liveDigest = (
    rows.find((row) => row.body.kind === 'MISSION_TRACKER')?.body as { digest?: string }
  ).digest;
  harness.save.repository.close();
  const second = await reopen({
    factory: harness.save.factory,
    locks: harness.save.locks,
    catalog: harness.save.catalog,
  });
  const loaded = await second.store.load({ sessionId: AUTOSAVE_SESSION, playerId: 'player:130' });
  assert.equal(loaded.tracker?.digest, liveDigest);
  assert.equal(loaded.tracker?.summary.completed, 3);
  assert.equal((await second.repository.latestCheckpoint(AUTOSAVE_SESSION))?.tick, 900);
  assert.equal(loaded.settingsSource, 'STORED');
  second.repository.close();
  harness.autosave.dispose();
});

test('131 reload after a close reads exactly the close tick and the closed progress', async () => {
  const harness = await createAutosaveHarness({ intervalTicks: 900 });
  runAutosaveWorld(harness.world, 950);
  const result = await harness.autosave.close({
    source: autosaveSource(harness.world),
    progress: harness.progress(),
    reason: 'PAGE_HIDE',
  });
  assert.equal(result.status, 'SAVED');
  assert.equal(result.checkpoint, 'COMMITTED');
  assert.equal(result.durableTick, 950);
  assert.equal(result.progressRevision !== null, true);

  harness.save.repository.close();
  const second = await reopen({
    factory: harness.save.factory,
    locks: harness.save.locks,
    catalog: harness.save.catalog,
  });
  const checkpoint = await second.repository.latestCheckpoint(AUTOSAVE_SESSION);
  assert.equal(checkpoint?.tick, 950);
  assert.equal(checkpoint?.checkpointId, AUTOSAVE_CHECKPOINT);
  const loaded = await second.store.load({ sessionId: AUTOSAVE_SESSION, playerId: 'player:130' });
  assert.equal(loaded.empty, false);
  assert.equal(loaded.tracker?.summary.completed, 3);
  assert.equal(loaded.campaign?.counts.completions, 3);
  second.repository.close();
  harness.autosave.dispose();
});

test('131 a failed close leaves the last confirmed commit as the recovery base', async () => {
  const harness = await createAutosaveHarness({ intervalTicks: 30, store: 'SCRIPTED' });
  await tickTo(harness, 30);
  await harness.autosave.flush();
  assert.equal(harness.autosave.status().simulated.lastSavedTick, 30);

  const store = harness.scripted;
  assert.ok(store !== null);
  if (store === null) return;
  await tickTo(harness, 50);
  store.rejectNext = 1;
  const failed = await harness.autosave.close({
    source: autosaveSource(harness.world),
    progress: harness.progress(),
  });
  assert.notEqual(failed.status, 'SAVED');
  assert.equal(failed.status, 'PARTIAL');
  assert.equal(failed.durableTick, 30, 'the close does not pretend the new tick was saved');
  assert.equal(failed.unsavedTicks, 20);
  assert.equal(failed.retryable, true);
  assert.equal(harness.autosave.status().view.claimsCompletedSave, false);
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 the status view distinguishes pending, success and error without claiming a save', async () => {
  const harness = await createAutosaveHarness({
    intervalTicks: 30,
    store: 'SCRIPTED',
    mode: 'STUCK',
  });
  const store = harness.scripted;
  assert.ok(store !== null);
  if (store === null) return;
  assert.equal(harness.autosave.status().phase, 'IDLE');
  assert.equal(harness.autosave.status().view.label, 'NOT_SAVED_YET');
  assert.equal(harness.autosave.status().view.claimsCompletedSave, false);

  await tickTo(harness, 30);
  await settle();
  const pending = harness.autosave.status();
  assert.equal(pending.phase, 'PENDING');
  assert.equal(pending.view.label, 'SAVING');
  assert.equal(pending.view.claimsCompletedSave, false);

  store.mode = 'OK';
  store.releaseAll();
  await harness.autosave.flush();
  const success = harness.autosave.status();
  assert.equal(success.phase, 'SUCCESS');
  assert.equal(success.view.label, 'SAVED');
  assert.equal(success.view.claimsCompletedSave, true);
  assert.equal(success.simulated.unsavedTicks, 0);

  store.rejectNext = 1;
  await tickTo(harness, 60);
  await harness.autosave.flush();
  const error = harness.autosave.status();
  assert.equal(error.phase, 'ERROR');
  assert.equal(error.view.label, 'SAVE_FAILED');
  assert.equal(error.view.claimsCompletedSave, false);
  assert.equal(error.lastError?.code, 'STORAGE_FULL');
  assert.equal(error.lastError?.tick, 60);
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 save time is kept apart from simulated time', async () => {
  let wall = 0;
  const harness = await createAutosaveHarness({
    intervalTicks: 30,
    store: 'SCRIPTED',
    now: () => `2026-11-11T12:00:${String(wall).padStart(2, '0')}Z`,
  });
  runAutosaveWorld(harness.world, 30);
  wall = 7;
  harness.autosave.onTick(autosaveSource(harness.world));
  await harness.autosave.flush();
  const status = harness.autosave.status();
  assert.equal(status.simulated.tick, 30, 'the simulated tick is the world tick');
  assert.equal(status.simulated.lastSavedTick, 30);
  assert.equal(status.simulated.unsavedTicks, 0);
  assert.equal(status.intervalTicks, 30, 'the interval is declared in ticks');
  assert.equal(status.intervalSeconds, 30 / FIXED_TICK_HZ);
  assert.equal(status.saveTime.lastSuccessAt, '2026-11-11T12:00:07Z');
  assert.equal(status.lastCycle?.tick, 30);

  const before = status.counters.requests;
  wall = 30;
  assert.equal(
    harness.autosave.status().counters.requests,
    before,
    'wall time never triggers a save',
  );
  assert.equal(harness.autosave.status().simulated.tick, 30);
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 saveNow forces one cycle between windows and still waits for the lane', async () => {
  const harness = await createAutosaveHarness({
    intervalTicks: 900,
    store: 'SCRIPTED',
    mode: 'STUCK',
  });
  const store = harness.scripted;
  assert.ok(store !== null);
  if (store === null) return;
  runAutosaveWorld(harness.world, 45);
  assert.equal(harness.autosave.saveNow(autosaveSource(harness.world)).status, 'CAPTURED');
  const manual = harness.autosave.saveNow(autosaveSource(harness.world));
  assert.equal(manual.status, 'COALESCED', 'the same tick never becomes a second generation');
  await settle();
  runAutosaveWorld(harness.world, 5);
  assert.equal(harness.autosave.saveNow(autosaveSource(harness.world)).status, 'CAPTURED');
  store.mode = 'OK';
  store.releaseAll();
  await harness.autosave.flush();
  assert.equal(harness.autosave.status().counters.commits, 2);
  assert.deepEqual(
    store.handed.map((generation) => generation.tick),
    [45, 50],
    'the manual requests share the single lane and keep the freshest prepared tick',
  );
  assert.equal(harness.autosave.status().simulated.unsavedTicks, 0);
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 a close without work is explicit and the session refuses further ticks', async () => {
  const harness = await createAutosaveHarness({ noProgress: true, store: 'SCRIPTED' });
  const nothing = await harness.autosave.close();
  assert.equal(nothing.status, 'NOTHING_TO_SAVE');
  assert.equal(nothing.progress, 'NOT_REQUESTED');
  assert.equal(nothing.checkpoint, 'NOT_REQUESTED');
  assert.equal(harness.autosave.status().phase, 'CLOSED');
  assert.equal(harness.autosave.onTick(autosaveSource(harness.world)).code, 'AUTOSAVE_CLOSED');
  assert.equal((await harness.autosave.close()).status, 'ALREADY_CLOSED');
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 a checkpoint-only session closes without inventing a progress payload', async () => {
  const harness = await createAutosaveHarness({ noProgress: true });
  runAutosaveWorld(harness.world, 40);
  const result = await harness.autosave.close({
    source: autosaveSource(harness.world),
    reason: 'TEST',
  });
  assert.equal(result.status, 'SAVED');
  assert.equal(result.progress, 'NOT_REQUESTED');
  assert.equal(result.checkpoint, 'COMMITTED');
  assert.equal(result.durableTick, 40);
  assert.equal(result.unsavedTicks, 0);
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 the interval and the tick source are validated instead of guessed', async () => {
  const harness = await createAutosaveHarness({ store: 'SCRIPTED' });
  assert.throws(
    () =>
      createSessionAutosave({
        store: {
          handoff: () => Promise.reject(new Error('unused')),
        },
        sessionId: 'session-131',
        checkpointId: 'checkpoint-131',
        versions: AUTOSAVE_VERSIONS,
        intervalTicks: 0,
      }),
    /AUTOSAVE_INVALID_INTERVAL/,
  );
  assert.throws(
    () =>
      createSessionAutosave({
        store: {
          handoff: () => Promise.reject(new Error('unused')),
        },
        sessionId: 'session-131',
        checkpointId: 'checkpoint-131',
        versions: AUTOSAVE_VERSIONS,
        intervalTicks: 1.5,
      }),
    /AUTOSAVE_INVALID_INTERVAL/,
  );

  runAutosaveWorld(harness.world, 10);
  assert.equal(harness.autosave.onTick(autosaveSource(harness.world)).status, 'SKIPPED');
  const older = {
    tick: 3,
    boundary: 'BOUNDARY' as const,
    capture: () => {
      throw new Error('no world at tick 3');
    },
  };
  assert.equal(harness.autosave.onTick(older).code, 'AUTOSAVE_TICK_REGRESSION');
  harness.autosave.dispose();
  harness.save.repository.close();
});

test('131 dispose refuses new work and releases the pending state', async () => {
  const harness = await createAutosaveHarness({
    intervalTicks: 10,
    store: 'SCRIPTED',
    mode: 'STUCK',
  });
  const store = harness.scripted;
  assert.ok(store !== null);
  if (store === null) return;
  harness.autosave.onTick(autosaveSource(harness.world));
  harness.autosave.dispose();
  const status = harness.autosave.status();
  assert.equal(status.phase, 'CLOSED');
  assert.equal(status.pipeline.phase, 'DISPOSED');
  assert.equal(harness.autosave.onTick(autosaveSource(harness.world)).code, 'AUTOSAVE_DISPOSED');
  store.mode = 'OK';
  store.releaseAll();
  harness.save.repository.close();
});

test('131 the progress store rejects an unwired payload instead of dropping it', async () => {
  const save = await createSaveHarness();
  const base = createRepositoryPipelineStore({ repository: save.repository });
  const autosave = createSessionAutosave({
    store: base,
    progressStore: null,
    inventory: () => saveInput(save),
    sessionId: AUTOSAVE_SESSION,
    checkpointId: AUTOSAVE_CHECKPOINT,
    versions: AUTOSAVE_VERSIONS,
    now: () => AUTOSAVE_NOW,
  });
  const world = createAutosaveWorld();
  runAutosaveWorld(world, 10);
  const result = await autosave.close({ source: autosaveSource(world), progress: saveInput(save) });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.code, 'AUTOSAVE_PROGRESS_UNAVAILABLE');
  assert.equal(result.progress, 'REJECTED');
  assert.equal(result.retryable, true);
  autosave.dispose();
  save.repository.close();
});

test('131 the 130 progress store is the only progress writer used by the autosave', async () => {
  const harness = await createAutosaveHarness({ intervalTicks: 30 });
  const delegate: ProgressSaveStore = harness.save.store;
  const calls: number[] = [];
  const counted: ProgressSaveStore = {
    catalog: delegate.catalog,
    save: (input, hooks) => {
      calls.push(input.sessionId.length);
      return delegate.save(input, hooks);
    },
    load: (input) => delegate.load(input),
    open: (input) => delegate.open(input),
    reset: (input, hooks) => delegate.reset(input, hooks),
  };
  const autosave = createSessionAutosave({
    store: createRepositoryPipelineStore({ repository: harness.save.repository }),
    progressStore: counted,
    inventory: () => saveInput(harness.save),
    sessionId: AUTOSAVE_SESSION,
    checkpointId: AUTOSAVE_CHECKPOINT,
    versions: AUTOSAVE_VERSIONS,
    intervalTicks: 30,
    now: () => AUTOSAVE_NOW,
  });
  runAutosaveWorld(harness.world, 30);
  autosave.onTick(autosaveSource(harness.world));
  await autosave.flush();
  assert.equal(calls.length, 1, 'one cycle calls the real 130 store exactly once');
  assert.equal(calls[0], AUTOSAVE_SESSION.length);
  const loaded = await harness.save.store.load({
    sessionId: AUTOSAVE_SESSION,
    playerId: 'player:130',
  });
  assert.notEqual(loaded.tracker, null);
  assert.equal(loaded.tracker?.revision, 1);
  autosave.dispose();
  harness.autosave.dispose();
  harness.save.repository.close();
});
