import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EXPERIMENT_WORKER_VERSION,
  ExperimentBatchRunner,
  ExperimentWorldRegistry,
  experimentReportLabel,
  readExperimentWorkerBudgets,
} from '../../src/experiments';
import type {
  ExperimentBatchProgress,
  ExperimentBatchRequest,
  ExperimentBatchRow,
  ExperimentBatchState,
  ExperimentWorkerBudgets,
} from '../../src/experiments';
import { createExperimentGovernorPort } from '../../src/experiments/experiment-worker-governor';
import {
  EXPERIMENT_PROFILES,
  EXPERIMENT_WORKER_IDENTITY,
  WORKER_ERROR_SEED,
  copyManifest,
  createDeterministicPort,
  createGovernorProbe,
  createLiveExperimentHarness,
  nextMacrotask,
  readPerformanceManifest,
} from './experiment-worker-harness';

/**
 * PBI 144 target tests.
 *
 * Behaviour is exercised with a deterministic port (one macrotask per slice, no wall clock); the
 * admission, refusal and preemption paths are exercised with the real 221 coordinator and the real
 * 142 rerun, so "admitted through 221" is proven by the code that actually admits it.
 */

function budgets(): ExperimentWorkerBudgets {
  const read = readExperimentWorkerBudgets(readPerformanceManifest());
  assert.equal(read.status, 'READY', read.status === 'REFUSED' ? read.detail : '');
  if (read.status !== 'READY') throw new Error('The manifest budgets are unusable');
  return read.budgets;
}

function request(overrides: Partial<ExperimentBatchRequest> = {}): ExperimentBatchRequest {
  return {
    batchId: 'batch-144',
    worldKey: 'world-144',
    model: { kind: 'FULL' },
    scenario: { scenarioId: 'city-v1/exchange-west', ticks: 24 },
    profileVersionIds: [...EXPERIMENT_PROFILES],
    baseSeeds: [142_000, 142_001, 142_002],
    ...overrides,
  };
}

function makeRunner(
  options: Parameters<typeof createDeterministicPort>[0] = {},
  onProgress?: (progress: ExperimentBatchProgress) => void,
) {
  const fixture = createDeterministicPort(options);
  const worlds = new ExperimentWorldRegistry(1);
  let clock = 0;
  const runner = new ExperimentBatchRunner({
    port: fixture.port,
    budgets: budgets(),
    worlds,
    now: () => (clock += 1),
    onProgress,
  });
  return { runner, fixture, worlds };
}

function waitFor(
  runner: ExperimentBatchRunner,
  predicate: (state: { state: ExperimentBatchState; completedSlices: number }) => boolean,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      const state = runner.state('batch-144');
      if (state !== null && predicate(state)) {
        resolve();
        return;
      }
      if (Date.now() - started > 10_000) {
        reject(new Error('The batch never reached the expected state'));
        return;
      }
      setImmediate(poll);
    };
    setImmediate(poll);
  });
}

/* ------------------------------------------------------------------ budgets */

test('budgets come from the real manifest and uncalibrated values are gaps, not defaults', () => {
  const read = readExperimentWorkerBudgets(readPerformanceManifest());
  assert.equal(read.status, 'READY');
  if (read.status !== 'READY') return;
  assert.equal(read.budgets.version, '221-synthetic-1');
  assert.equal(read.budgets.source, 'src/workers/governor.ts');
  assert.equal(read.budgets.residentWorlds, 1);
  assert.equal(read.budgets.activeHeavyJobs, 1);
  assert.equal(read.budgets.sliceMaximumMs, 10);
  assert.equal(read.budgets.progressIntervalMinimumMs, 200);
  assert.equal(read.budgets.progressHzMaximum, 5);
  assert.equal(read.budgets.cancellationTargetMaximumMs, 100);
  assert.equal(read.budgets.ownedPendingPayloadBytes, 16 * 1024 * 1024);
  const paths = read.gaps.map((gap) => gap.path);
  assert.ok(paths.includes('workerSchedulingProposal.queueCountAndAge'));
  assert.ok(paths.includes('proposedCapacities.totalHeapBytes'));
  assert.ok(paths.includes('proposedCapacities.wasmBytes'));
});

test('a manifest without the worker contract is refused instead of defaulted', () => {
  const manifest = copyManifest();
  delete manifest.resourceAdmissionContracts;
  const read = readExperimentWorkerBudgets(manifest);
  assert.equal(read.status, 'REFUSED');
  if (read.status !== 'REFUSED') return;
  assert.deepEqual([...read.codes], ['BUDGET_MISSING']);
  assert.ok(read.paths.includes('resourceAdmissionContracts'));
  assert.ok(read.detail.includes('no default is invented'));
});

test('a manifest that contradicts itself or admits two worlds is refused', () => {
  const twoWorlds = copyManifest();
  const scheduling = twoWorlds.workerSchedulingProposal as Record<string, unknown>;
  scheduling.residentExperimentWorlds = 2;
  const contested = readExperimentWorkerBudgets(twoWorlds);
  assert.equal(contested.status, 'REFUSED');
  if (contested.status === 'REFUSED') assert.deepEqual([...contested.codes], ['BUDGET_INVALID']);

  const twoHeavy = copyManifest();
  const workers = (twoHeavy.resourceAdmissionContracts as Record<string, unknown>)
    .workers as Record<string, unknown>;
  workers.activeHeavyJobs = 2;
  const heavy = readExperimentWorkerBudgets(twoHeavy);
  assert.equal(heavy.status, 'REFUSED');
  if (heavy.status === 'REFUSED') assert.ok(heavy.detail.includes('one heavy job at a time'));
});

/* --------------------------------------------------------------- happy path */

test('a complete batch reports progress after every slice and only complete results', async () => {
  const events: number[] = [];
  const { runner, fixture } = makeRunner({}, (progress) => {
    if (progress.state === 'RUNNING') events.push(progress.completedSlices);
  });
  const result = await runner.start(request());
  assert.equal(result.version, EXPERIMENT_WORKER_VERSION);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.progress.totalSlices, 3);
  assert.equal(result.progress.completedSlices, 3);
  assert.equal(result.progress.fraction, 1);
  assert.equal(result.results.complete.length, 3);
  assert.equal(result.results.partial.length, 0);
  assert.equal(result.results.partialReason, null);
  assert.ok(result.results.complete.every((row) => row.label === 'COMPLETE'));
  assert.deepEqual([...new Set(events)], [0, 1, 2, 3]);
  assert.equal(fixture.runs, 3);
  assert.equal(result.summary.runs, 3);
  assert.equal(result.summary.decisions, 72);
  assert.equal(result.refusals.total, 0);
  assert.equal(result.world.active, false);
  assert.equal(runner.usage.worlds.grants, 1);
  runner.dispose();
});

test('the caller keeps its turn: start returns at once and the UI loop runs between slices', async () => {
  const { runner } = makeRunner();
  let uiTurns = 0;
  let ticking = true;
  const loop = (async () => {
    while (ticking) {
      uiTurns += 1;
      await nextMacrotask();
    }
  })();
  const pending = runner.start(request());
  assert.equal(runner.state('batch-144')?.state, 'RUNNING');
  const result = await pending;
  ticking = false;
  await loop;
  assert.equal(result.status, 'COMPLETED');
  assert.ok(uiTurns >= result.progress.totalSlices, `the UI loop ran ${uiTurns} turns`);
  runner.dispose();
});

/* --------------------------------------------------------------- cancelling */

test('cancellation stops at the next slice boundary and keeps labelled PARTIAL results', async () => {
  const { runner } = makeRunner();
  const pending = runner.start(request({ baseSeeds: [1, 2, 3, 4, 5] }));
  await waitFor(runner, (state) => state.completedSlices === 2);
  assert.equal(runner.cancel('batch-144'), true);
  const result = await pending;
  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.progress.completedSlices, 2);
  assert.equal(result.progress.totalSlices, 5);
  assert.equal(result.results.complete.length, 0);
  assert.equal(result.results.partial.length, 2);
  assert.equal(result.results.partialReason, 'CANCELLED_BY_REQUEST');
  assert.ok(result.results.partial.every((row) => row.label === 'PARTIAL'));
  assert.ok(result.results.partial.every((row) => row.partialReason === 'CANCELLED_BY_REQUEST'));
  assert.equal(result.cancellation.discardedSlices, 1);
  assert.equal(result.cancellation.atSliceIndex, 2);
  assert.ok(result.slices.some((slice) => slice.status === 'CANCELLED'));
  runner.dispose();
});

test('a batch cancelled while paused keeps its rows and says why', async () => {
  const { runner } = makeRunner();
  const pending = runner.start(request({ baseSeeds: [1, 2, 3, 4] }));
  await waitFor(runner, (state) => state.completedSlices === 1);
  assert.equal(
    runner.interruptForLearning('batch-144', { learningEpoch: 9, segmentId: 'segment-9' }),
    true,
  );
  await waitFor(runner, (state) => state.state === 'PAUSED' && state.completedSlices >= 2);
  assert.equal(runner.cancel('batch-144'), true);
  const result = await pending;
  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.results.partialReason, 'CANCELLED_WHILE_PAUSED');
  assert.ok(result.results.partial.length >= 2);
  assert.equal(result.learning.pauseCount, 1);
  assert.equal(result.learning.resumeCount, 0);
  assert.equal(result.learning.interrupts[0]?.status, 'PAUSED');
  runner.dispose();
});

/* ---------------------------------------------------------------- learning */

test('learning pauses the batch at a slice boundary and resume continues from there', async () => {
  const { runner } = makeRunner();
  const pending = runner.start(request({ baseSeeds: [1, 2, 3, 4] }));
  await waitFor(runner, (state) => state.completedSlices === 1);
  assert.equal(
    runner.interruptForLearning('batch-144', { learningEpoch: 12, segmentId: 'segment-12' }),
    true,
  );
  await waitFor(runner, (state) => state.state === 'PAUSED' && state.completedSlices >= 2);
  assert.equal(runner.state('batch-144')?.state, 'PAUSED');
  assert.equal(runner.resumeAfterLearning('batch-144', { learningEpoch: 12 }), true);
  const result = await pending;
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.learning.pauseCount, 1);
  assert.equal(result.learning.resumeCount, 1);
  const interrupt = result.learning.interrupts[0];
  assert.equal(interrupt?.learningEpoch, 12);
  assert.equal(interrupt?.segmentId, 'segment-12');
  assert.equal(interrupt?.atSliceIndex, 1);
  assert.equal(interrupt?.status, 'RESUMED');
  assert.equal(interrupt?.resumeAtSliceIndex, 2);
  assert.equal(result.results.complete.length, 4);
  runner.dispose();
});

/* ----------------------------------------------------------------- failures */

test('a worker error stops the batch with its own code and keeps the produced rows', async () => {
  const { runner } = makeRunner({ plan: ['COMPLETE', 'ERROR', 'COMPLETE'] });
  const result = await runner.start(request());
  assert.equal(result.status, 'FAILED');
  assert.deepEqual([...result.codes], ['SLICE_FAILED']);
  assert.equal(result.progress.completedSlices, 1);
  assert.equal(result.results.partial.length, 1);
  assert.equal(result.results.partialReason, 'SLICE_FAILED');
  assert.equal(result.refusals.byCode.SLICE_FAILED, 1);
  assert.ok(result.detail.includes('crashed'));
  runner.dispose();
});

test('a 221 refusal and a 221 suspension are explicit and counted', async () => {
  const refused = makeRunner({ plan: ['REFUSE'] });
  const refusal = await refused.runner.start(request({ baseSeeds: [1, 2] }));
  assert.equal(refusal.status, 'REFUSED');
  assert.deepEqual([...refusal.codes], ['CAPACITY_INSUFFICIENT']);
  assert.equal(refusal.refusals.byCode.CAPACITY_INSUFFICIENT, 1);
  assert.equal(refusal.results.partial.length, 0);

  const suspended = makeRunner({ plan: ['SUSPEND'] });
  const suspension = await suspended.runner.start(request({ baseSeeds: [1, 2] }));
  assert.equal(suspension.status, 'SUSPENDED');
  assert.deepEqual([...suspension.codes], ['SESSION_SUSPENDED']);
  assert.equal(suspension.results.partialReason, 'SESSION_SUSPENDED');
  refused.runner.dispose();
  suspended.runner.dispose();
});

/* ------------------------------------------------------------ single world */

test('a second batch is refused while the single resident world is active', async () => {
  const { runner, worlds } = makeRunner();
  const first = runner.start(request({ batchId: 'batch-a', baseSeeds: [1, 2] }));
  const second = await runner.start(request({ batchId: 'batch-b', baseSeeds: [1, 2] }));
  assert.equal(second.status, 'REFUSED');
  assert.deepEqual([...second.codes], ['WORLD_RESERVED']);
  assert.equal(second.detail.includes('batch-a'), true);
  assert.equal(second.world.active, false);
  assert.equal(worlds.usage.refusals.byCode.WORLD_RESERVED, 1);
  assert.equal(worlds.usage.active, 1);
  const done = await first;
  assert.equal(done.status, 'COMPLETED');
  assert.equal(worlds.usage.active, 0);
  runner.dispose();
});

test('a duplicate batch id is refused while the first batch runs', async () => {
  const { runner } = makeRunner();
  const first = runner.start(request({ baseSeeds: [1, 2, 3] }));
  const duplicate = await runner.start(request({ baseSeeds: [1, 2, 3] }));
  assert.equal(duplicate.status, 'REFUSED');
  assert.deepEqual([...duplicate.codes], ['BATCH_DUPLICATE']);
  await first;
  runner.dispose();
});

/* ------------------------------------------------------------------- model */

test('a simplified model is labelled and cannot claim physics fidelity', async () => {
  const { runner } = makeRunner();
  const result = await runner.start(
    request({
      batchId: 'batch-simplified',
      baseSeeds: [1, 2],
      model: {
        kind: 'SIMPLIFIED',
        approximation: 'kinematic lane following without tyre slip',
        notValidated: ['wet friction', 'heavy vehicles'],
        physicsFidelity: false,
      },
    }),
  );
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.model.kind, 'SIMPLIFIED');
  assert.equal(result.model.physicsFidelity, false);
  assert.equal(result.model.approximation, 'kinematic lane following without tyre slip');
  assert.deepEqual([...result.model.notValidated], ['wet friction', 'heavy vehicles']);
  assert.ok(result.results.complete.every((row) => row.model === 'SIMPLIFIED'));
  const label = experimentReportLabel(result);
  assert.equal(label.label, 'COMPLETE');
  assert.equal(label.physicsFidelity, false);
  assert.ok(label.text.includes('SIMPLIFIED'));
  assert.ok(label.text.includes('not validated'));
  runner.dispose();
});

test('a simplified model that claims full physics is refused with a closed code', async () => {
  const { runner } = makeRunner();
  const result = await runner.start(
    request({
      model: {
        kind: 'SIMPLIFIED',
        approximation: 'single-track bicycle model',
        notValidated: ['impact response'],
        physicsFidelity: true,
      },
    }),
  );
  assert.equal(result.status, 'REFUSED');
  assert.deepEqual([...result.codes], ['SIMPLIFIED_CLAIMS_FIDELITY']);
  assert.equal(result.model.physicsFidelity, false);
  assert.equal(runner.usage.worlds.grants, 0);
  runner.dispose();
});

test('an undeclared simplification is refused instead of being reported as FULL', async () => {
  const { runner } = makeRunner();
  const result = await runner.start(
    request({ model: { kind: 'SIMPLIFIED', physicsFidelity: false } }),
  );
  assert.equal(result.status, 'REFUSED');
  assert.deepEqual([...result.codes], ['MODEL_NOT_DECLARED']);
  runner.dispose();
});

test('a full batch is reported as full physics and a partial one as PARTIAL', async () => {
  const { runner } = makeRunner({ plan: ['COMPLETE', 'COMPLETE', 'COMPLETE'] });
  const complete = await runner.start(request({ batchId: 'batch-full' }));
  assert.equal(experimentReportLabel(complete).label, 'COMPLETE');
  assert.equal(experimentReportLabel(complete).physicsFidelity, true);
  const partial = makeRunner({ plan: ['COMPLETE', 'ERROR'] });
  const partialResult = await partial.runner.start(
    request({ batchId: 'batch-partial', baseSeeds: [1, 2] }),
  );
  assert.equal(experimentReportLabel(partialResult).label, 'PARTIAL');
  assert.equal(partialResult.results.complete.length, 0);
  assert.equal(partialResult.results.partial.length, 1);
  runner.dispose();
  partial.runner.dispose();
});

/* ------------------------------------------------------------------ budgets */

test('each slice is measured against the manifest budget and an overrun is reported', async () => {
  const within = makeRunner({ stepMs: 4 });
  const ok = await within.runner.start(request());
  assert.ok(ok.slices.every((slice) => slice.overBudget === false));
  assert.ok(ok.slices.every((slice) => slice.stepMs === 4));
  const over = makeRunner({ stepMs: 12 });
  const slow = await over.runner.start(request());
  assert.equal(slow.status, 'COMPLETED');
  assert.ok(slow.slices.every((slice) => slice.overBudget === true));
  assert.equal(slow.budgets.sliceMaximumMs, 10);
  within.runner.dispose();
  over.runner.dispose();
});

/* ------------------------------------------------------- real 221 admission */

test('the real 221 coordinator refuses the slice when its capacity is full', async () => {
  const probe = createGovernorProbe();
  try {
    await probe.hold(8 * 1024 * 1024);
    await probe.hold(8 * 1024 * 1024);
    const port = createExperimentGovernorPort({
      governor: probe.governor,
      identity: () => EXPERIMENT_WORKER_IDENTITY,
    });
    let clock = 0;
    const runner = new ExperimentBatchRunner({
      port,
      budgets: budgets(),
      worlds: new ExperimentWorldRegistry(1),
      now: () => (clock += 1),
    });
    const result = await runner.start(request({ baseSeeds: [142_000] }));
    assert.equal(result.status, 'REFUSED');
    assert.deepEqual([...result.codes], ['CAPACITY_INSUFFICIENT']);
    assert.equal(result.refusals.byCode.CAPACITY_INSUFFICIENT, 1);
    assert.equal(port.usage.submissions, 1);
    assert.equal(port.usage.refusals, 1);
    runner.dispose();
  } finally {
    probe.dispose();
  }
});

test('real 142 run cells complete as one admitted batch through 221', async () => {
  const harness = createLiveExperimentHarness();
  try {
    const port = createExperimentGovernorPort({
      governor: harness.governor,
      identity: () => EXPERIMENT_WORKER_IDENTITY,
    });
    let clock = 0;
    const runner = new ExperimentBatchRunner({
      port,
      budgets: budgets(),
      worlds: new ExperimentWorldRegistry(1),
      now: () => (clock += 1),
    });
    const result = await runner.start(request({ baseSeeds: [142_000, 142_001, 142_002] }));
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.results.complete.length, 3);
    assert.equal(result.summary.runs, 3);
    assert.equal(result.summary.decisions, 72);
    assert.ok(result.summary.divergent > 0);
    assert.ok(result.results.complete.every((row) => row.decisions === 24));
    assert.ok(result.results.complete.every((row) => row.divergent + row.identical === 24));
    assert.ok(
      result.results.complete.every((row) => row.profileVersionIds.length === 2),
      'each row keeps the compared profile pair',
    );
    assert.equal(port.usage.refusals, 0);
    assert.equal(port.usage.completed, 3);
    assert.ok(result.slices.every((slice) => typeof slice.stepMs === 'number'));
    runner.dispose();
  } finally {
    harness.dispose();
  }
});

test('cancelling a real batch stops after the current run cell and keeps it PARTIAL', async () => {
  const harness = createLiveExperimentHarness();
  try {
    const port = createExperimentGovernorPort({
      governor: harness.governor,
      identity: () => EXPERIMENT_WORKER_IDENTITY,
    });
    let clock = 0;
    let release!: () => void;
    const firstSlice = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner = new ExperimentBatchRunner({
      port,
      budgets: budgets(),
      worlds: new ExperimentWorldRegistry(1),
      now: () => (clock += 1),
      onProgress: (progress) => {
        if (progress.completedSlices === 1) release();
      },
    });
    const pending = runner.start(request({ baseSeeds: [142_000, 142_001, 142_002, 142_003] }));
    await firstSlice;
    assert.equal(runner.cancel('batch-144'), true);
    const result = await pending;
    assert.equal(result.status, 'CANCELLED');
    assert.ok(result.progress.completedSlices >= 1);
    assert.equal(result.results.complete.length, 0);
    assert.equal(result.results.partial.length, result.progress.completedSlices);
    assert.ok(result.results.partial.every((row) => row.label === 'PARTIAL'));
    assert.equal(result.results.partialReason, 'CANCELLED_BY_REQUEST');
    runner.dispose();
  } finally {
    harness.dispose();
  }
});

test('learning preempts a cooperative slice through 221 and the batch pauses at the boundary', async () => {
  let started!: () => void;
  const inFlight = new Promise<void>((resolve) => {
    started = resolve;
  });
  const harness = createLiveExperimentHarness({
    task: 'COOPERATIVE',
    onFirstStep: () => started(),
  });
  try {
    const port = createExperimentGovernorPort({
      governor: harness.governor,
      identity: () => EXPERIMENT_WORKER_IDENTITY,
    });
    let clock = 0;
    let releasePaused!: () => void;
    const paused = new Promise<void>((resolve) => {
      releasePaused = resolve;
    });
    const runner = new ExperimentBatchRunner({
      port,
      budgets: budgets(),
      worlds: new ExperimentWorldRegistry(1),
      now: () => (clock += 1),
      onProgress: (progress) => {
        if (progress.state === 'PAUSED' && progress.completedSlices >= 1) releasePaused();
      },
    });
    const pending = runner.start(request({ baseSeeds: [142_000, 142_001] }));
    await inFlight;
    const learning = harness.submitLearning(3);
    const outcome = await learning;
    assert.equal(outcome.status, 'result');
    assert.equal(
      runner.interruptForLearning('batch-144', { learningEpoch: 3, segmentId: 'learning/3' }),
      true,
    );
    await paused;
    assert.equal(runner.resumeAfterLearning('batch-144', { learningEpoch: 3 }), true);
    const result = await pending;
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.results.complete.length, 2);
    assert.ok(result.learning.preemptedSlices >= 1, '221 preempted the slice for learning');
    const preempted = result.slices.find((slice) => slice.preempted);
    assert.ok(preempted !== undefined);
    assert.equal(typeof preempted.cancellationMs, 'number');
    assert.equal(result.learning.pauseCount, 1);
    assert.equal(result.learning.resumeCount, 1);
    runner.dispose();
  } finally {
    harness.dispose();
  }
});

test('a real worker error keeps the completed run cells and names the failure', async () => {
  const harness = createLiveExperimentHarness();
  try {
    const port = createExperimentGovernorPort({
      governor: harness.governor,
      identity: () => EXPERIMENT_WORKER_IDENTITY,
    });
    let clock = 0;
    const runner = new ExperimentBatchRunner({
      port,
      budgets: budgets(),
      worlds: new ExperimentWorldRegistry(1),
      now: () => (clock += 1),
    });
    const result = await runner.start(
      request({ baseSeeds: [142_000, WORKER_ERROR_SEED, 142_002] }),
    );
    assert.equal(result.status, 'FAILED');
    assert.deepEqual([...result.codes], ['SLICE_FAILED']);
    assert.equal(result.progress.completedSlices, 1);
    assert.equal(result.results.partial.length, 1);
    const row: ExperimentBatchRow | undefined = result.results.partial[0];
    assert.equal(row?.baseSeed, 142_000);
    assert.equal(row?.label, 'PARTIAL');
    assert.equal(result.results.partialReason, 'SLICE_FAILED');
    assert.ok(result.detail.includes(String(WORKER_ERROR_SEED)));
    runner.dispose();
  } finally {
    harness.dispose();
  }
});
