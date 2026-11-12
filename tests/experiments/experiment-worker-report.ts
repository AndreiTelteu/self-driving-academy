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
  ExperimentBatchResult,
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
  readPerformanceManifest,
} from './experiment-worker-harness';

/**
 * Deterministic evidence transcript for PBI 144.
 *
 * Every scenario below runs the real contract; the admission, refusal and preemption scenarios also
 * run the real 221 coordinator and the real 142 rerun. The transcript deliberately projects only
 * facts that do not depend on the machine: statuses, slice sequence, progress fractions, labelled
 * rows, refusal codes and learning transitions. Wall-clock fields (`stepMs`, `cancellationMs`,
 * `wall`) are measured separately by `npm run experiment:worker -- --cost` and are not part of
 * `report.json`, so `--check` is an exact staleness check instead of a projection with nulled
 * numbers.
 */

export interface ExperimentWorkerCheck {
  readonly name: string;
  readonly expected: string | number | boolean | null;
  readonly actual: string | number | boolean | null;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ExperimentWorkerScenario {
  readonly name: string;
  readonly status: string;
  readonly totalSlices: number;
  readonly completedSlices: number;
  readonly fraction: number;
  readonly attempts: readonly number[];
  readonly completeRows: number;
  readonly partialRows: number;
  readonly partialReason: string | null;
  readonly rowLabels: readonly string[];
  readonly codes: readonly string[];
  readonly refusals: Readonly<Record<string, number>>;
  readonly learning: Readonly<{
    pauseCount: number;
    resumeCount: number;
    preemptedSlices: number;
    interrupts: readonly Readonly<{
      learningEpoch: number;
      atSliceIndex: number;
      inFlight: boolean;
      status: string;
      resumeAtSliceIndex: number | null;
    }>[];
  }>;
  readonly model: Readonly<{ kind: string; physicsFidelity: boolean; disclaimer: string }>;
  readonly progress: readonly Readonly<{
    state: string;
    completedSlices: number;
    fraction: number;
  }>[];
  readonly summary: Readonly<{
    runs: number;
    decisions: number;
    identical: number;
    divergent: number;
    causes: Readonly<Record<string, number>>;
    parameters: readonly string[];
  }>;
  readonly cancelled: boolean;
  readonly discardedSlices: number;
  readonly note: string;
}

export interface ExperimentWorkerReport {
  readonly version: typeof EXPERIMENT_WORKER_VERSION;
  readonly budgets: Readonly<{
    status: string;
    version: string | null;
    residentWorlds: number | null;
    activeHeavyJobs: number | null;
    executionJobs: number | null;
    sliceMaximumMs: number | null;
    progressIntervalMinimumMs: number | null;
    progressHzMaximum: number | null;
    cancellationTargetMaximumMs: number | null;
    ownedPendingPayloadBytes: number | null;
    gaps: readonly string[];
  }>;
  readonly refusalProbe: Readonly<{
    status: string;
    codes: readonly string[];
    paths: readonly string[];
  }>;
  readonly scenarios: readonly ExperimentWorkerScenario[];
  readonly checks: readonly ExperimentWorkerCheck[];
  readonly summary: Readonly<{ checks: number; passed: number; pass: boolean }>;
}

function compare(
  name: string,
  expected: ExperimentWorkerCheck['expected'],
  actual: ExperimentWorkerCheck['actual'],
  detail: string,
): ExperimentWorkerCheck {
  return Object.freeze({ name, expected, actual, pass: expected === actual, detail });
}

function budgetsOrThrow(): ExperimentWorkerBudgets {
  const read = readExperimentWorkerBudgets(readPerformanceManifest());
  if (read.status !== 'READY') throw new Error(`The manifest budgets are unusable: ${read.detail}`);
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

function scenarioOf(
  name: string,
  result: ExperimentBatchResult,
  note: string,
): ExperimentWorkerScenario {
  return Object.freeze({
    name,
    status: result.status,
    totalSlices: result.progress.totalSlices,
    completedSlices: result.progress.completedSlices,
    fraction: result.progress.fraction,
    attempts: Object.freeze(result.slices.map((slice) => slice.attempts)),
    completeRows: result.results.complete.length,
    partialRows: result.results.partial.length,
    partialReason: result.results.partialReason,
    rowLabels: Object.freeze(
      [...result.results.complete, ...result.results.partial].map((row) => row.label),
    ),
    codes: Object.freeze([...result.codes]),
    refusals: Object.freeze({ ...result.refusals.byCode }),
    learning: Object.freeze({
      pauseCount: result.learning.pauseCount,
      resumeCount: result.learning.resumeCount,
      preemptedSlices: result.learning.preemptedSlices,
      interrupts: Object.freeze(
        result.learning.interrupts.map((interrupt) =>
          Object.freeze({
            learningEpoch: interrupt.learningEpoch,
            atSliceIndex: interrupt.atSliceIndex,
            inFlight: interrupt.inFlight,
            status: interrupt.status,
            resumeAtSliceIndex: interrupt.resumeAtSliceIndex,
          }),
        ),
      ),
    }),
    model: Object.freeze({
      kind: result.model.kind,
      physicsFidelity: result.model.physicsFidelity,
      disclaimer: result.model.disclaimer,
    }),
    progress: Object.freeze(
      result.progress.events.map((event: ExperimentBatchProgress) =>
        Object.freeze({
          state: event.state,
          completedSlices: event.completedSlices,
          fraction: event.fraction,
        }),
      ),
    ),
    summary: Object.freeze({
      runs: result.summary.runs,
      decisions: result.summary.decisions,
      identical: result.summary.identical,
      divergent: result.summary.divergent,
      causes: Object.freeze({ ...result.summary.causes }),
      parameters: Object.freeze([...result.summary.parameters]),
    }),
    cancelled: result.cancellation.requested,
    discardedSlices: result.cancellation.discardedSlices,
    note,
  });
}

function deterministicRunner(
  options: Parameters<typeof createDeterministicPort>[0] = {},
  onProgress?: (progress: ExperimentBatchProgress) => void,
) {
  const fixture = createDeterministicPort(options);
  const worlds = new ExperimentWorldRegistry(1);
  let clock = 0;
  const runner = new ExperimentBatchRunner({
    port: fixture.port,
    budgets: budgetsOrThrow(),
    worlds,
    now: () => (clock += 1),
    onProgress,
  });
  return { runner, fixture, worlds };
}

function polling(
  runner: ExperimentBatchRunner,
  batchId: string,
  predicate: (state: Readonly<{ state: string; completedSlices: number }>) => boolean,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let turns = 0;
    const poll = () => {
      const state = runner.state(batchId);
      if (state !== null && predicate(state)) {
        resolve();
        return;
      }
      turns += 1;
      if (turns > 20_000) {
        reject(new Error(`The batch ${batchId} never reached the expected state`));
        return;
      }
      setImmediate(poll);
    };
    setImmediate(poll);
  });
}

export async function runExperimentWorkerReport(): Promise<ExperimentWorkerReport> {
  const checks: ExperimentWorkerCheck[] = [];
  const scenarios: ExperimentWorkerScenario[] = [];
  const budgetRead = readExperimentWorkerBudgets(readPerformanceManifest());
  const budgetGaps = budgetRead.gaps.map((gap) => gap.path);

  checks.push(
    compare(
      'budget.manifest.status',
      'READY',
      budgetRead.status,
      'The budgets are read from Docs/performance-budgets.json, never typed here',
    ),
    compare(
      'budget.manifest.version',
      '221-synthetic-1',
      budgetRead.status === 'READY' ? budgetRead.budgets.version : null,
      'The 221 worker admission contract version',
    ),
    compare(
      'budget.manifest.residentWorlds',
      1,
      budgetRead.status === 'READY' ? budgetRead.budgets.residentWorlds : null,
      'One resident experiment world',
    ),
    compare(
      'budget.manifest.sliceMaximumMs',
      10,
      budgetRead.status === 'READY' ? budgetRead.budgets.sliceMaximumMs : null,
      'Per-slice budget used to flag an overrun',
    ),
    compare(
      'budget.manifest.progressHzMaximum',
      5,
      budgetRead.status === 'READY' ? budgetRead.budgets.progressHzMaximum : null,
      'Progress cap derived from the 200 ms interval',
    ),
    compare(
      'budget.manifest.cancellationTargetMaximumMs',
      100,
      budgetRead.status === 'READY' ? budgetRead.budgets.cancellationTargetMaximumMs : null,
      'Cooperative cancellation target',
    ),
    compare(
      'budget.manifest.gaps',
      4,
      budgetGaps.length,
      `Uncalibrated values are reported: ${budgetGaps.join(', ')}`,
    ),
  );

  const missing = copyManifest();
  delete missing.resourceAdmissionContracts;
  const missingRead = readExperimentWorkerBudgets(missing);
  const missingPaths = missingRead.status === 'REFUSED' ? missingRead.paths : [];
  checks.push(
    compare(
      'budget.missing.status',
      'REFUSED',
      missingRead.status,
      'A manifest without the 221 contract is refused instead of defaulted',
    ),
    compare(
      'budget.missing.code',
      'BUDGET_MISSING',
      missingRead.status === 'REFUSED' ? (missingRead.codes[0] ?? null) : null,
      'The closed budget refusal code',
    ),
    compare(
      'budget.missing.path',
      true,
      missingPaths.includes('resourceAdmissionContracts'),
      'The refusal names the missing manifest path',
    ),
  );

  /* ------------------------------------------------------------ complete batch */

  {
    const { runner, fixture } = deterministicRunner();
    const result = await runner.start(
      request({ baseSeeds: [142_000, 142_001, 142_002, 142_003, 142_004] }),
    );
    scenarios.push(
      scenarioOf(
        'complete',
        result,
        'Five slices, one progress event per slice, only COMPLETE results',
      ),
    );
    checks.push(
      compare(
        'complete.status',
        'COMPLETED',
        result.status,
        'A batch that runs every slice completes',
      ),
      compare('complete.slices', 5, result.progress.totalSlices, 'One slice per base seed'),
      compare('complete.completed', 5, result.progress.completedSlices, 'All five slices ran'),
      compare('complete.fraction', 1, result.progress.fraction, 'Progress reaches one'),
      compare('complete.rows', 5, result.results.complete.length, 'Five complete rows'),
      compare('complete.partialRows', 0, result.results.partial.length, 'Nothing is partial'),
      compare(
        'complete.progressSequence',
        '0,1,2,3,4,5',
        result.progress.events.map((event) => event.completedSlices).join(','),
        'Progress is emitted before the first slice and after each one',
      ),
      compare(
        'complete.labels',
        'COMPLETE,COMPLETE,COMPLETE,COMPLETE,COMPLETE',
        result.results.complete.map((row) => row.label).join(','),
        'Every row carries the COMPLETE label',
      ),
      compare(
        'complete.decisions',
        120,
        result.summary.decisions,
        'Five real run cells report 24 decisions each',
      ),
      compare('complete.refusals', 0, result.refusals.total, 'No slice was refused'),
      compare('complete.worldReleased', false, result.world.active, 'The world lease is released'),
      compare('complete.fixtureRuns', 5, fixture.runs, 'The port ran exactly one slice per seed'),
    );
    runner.dispose();
  }

  /* ---------------------------------------------------------------- cancellation */

  {
    const { runner } = deterministicRunner();
    const pending = runner.start(request({ baseSeeds: [1, 2, 3, 4, 5] }));
    await polling(runner, 'batch-144', (state) => state.completedSlices === 2);
    runner.cancel('batch-144');
    const result = await pending;
    scenarios.push(
      scenarioOf(
        'cancel',
        result,
        'Cancelled after two slices; the produced rows are kept as PARTIAL',
      ),
    );
    checks.push(
      compare(
        'cancel.status',
        'CANCELLED',
        result.status,
        'A cancelled batch never claims completion',
      ),
      compare(
        'cancel.completed',
        2,
        result.progress.completedSlices,
        'Two slices finished before the stop',
      ),
      compare(
        'cancel.completeRows',
        0,
        result.results.complete.length,
        'No result is presented as complete',
      ),
      compare(
        'cancel.partialRows',
        2,
        result.results.partial.length,
        'Both produced rows are kept',
      ),
      compare(
        'cancel.partialReason',
        'CANCELLED_BY_REQUEST',
        result.results.partialReason,
        'The reason is explicit',
      ),
      compare(
        'cancel.labels',
        'PARTIAL,PARTIAL',
        result.results.partial.map((row) => row.label).join(','),
        'Each kept row is labelled PARTIAL',
      ),
      compare(
        'cancel.discarded',
        1,
        result.cancellation.discardedSlices,
        'The in-flight slice was discarded',
      ),
      compare(
        'cancel.progressStates',
        true,
        (result.progress.events[result.progress.events.length - 1]?.fraction ?? 1) < 1,
        'The transcript never shows a cancelled batch reaching full progress',
      ),
    );
    runner.dispose();
  }

  /* ------------------------------------------------------------------- learning */

  {
    const { runner } = deterministicRunner();
    const pending = runner.start(request({ baseSeeds: [1, 2, 3, 4] }));
    await polling(runner, 'batch-144', (state) => state.completedSlices === 1);
    runner.interruptForLearning('batch-144', { learningEpoch: 12, segmentId: 'segment-12' });
    await polling(
      runner,
      'batch-144',
      (state) => state.state === 'PAUSED' && state.completedSlices >= 2,
    );
    runner.resumeAfterLearning('batch-144', { learningEpoch: 12 });
    const result = await pending;
    scenarios.push(
      scenarioOf(
        'learning',
        result,
        'Learning pauses the batch at a slice boundary and resumes it',
      ),
    );
    checks.push(
      compare('learning.status', 'COMPLETED', result.status, 'The resumed batch finishes'),
      compare(
        'learning.pauseCount',
        1,
        result.learning.pauseCount,
        'One learning interrupt was applied',
      ),
      compare('learning.resumeCount', 1, result.learning.resumeCount, 'One explicit resume'),
      compare(
        'learning.atSlice',
        1,
        result.learning.interrupts[0]?.atSliceIndex ?? -1,
        'Paused while slice 1 was in flight',
      ),
      compare(
        'learning.resumeAt',
        2,
        result.learning.interrupts[0]?.resumeAtSliceIndex ?? -1,
        'It continued at the next boundary, not from scratch',
      ),
      compare(
        'learning.interruptStatus',
        'RESUMED',
        result.learning.interrupts[0]?.status ?? null,
        'The interrupt records both pause and resume',
      ),
      compare(
        'learning.rows',
        4,
        result.results.complete.length,
        'Every slice still produced its row',
      ),
    );
    runner.dispose();
  }

  /* -------------------------------------------------------------- single world */

  {
    const { runner } = deterministicRunner();
    const first = runner.start(request({ batchId: 'batch-a', baseSeeds: [1, 2] }));
    const second = await runner.start(request({ batchId: 'batch-b', baseSeeds: [1, 2] }));
    scenarios.push(
      scenarioOf('world', second, 'The second batch names the holder of the single resident world'),
    );
    checks.push(
      compare('world.status', 'REFUSED', second.status, 'A second world is refused, not cloned'),
      compare(
        'world.code',
        'WORLD_RESERVED',
        second.codes[0] ?? null,
        'The refusal code is closed',
      ),
      compare(
        'world.holder',
        true,
        second.detail.includes('batch-a'),
        'The refusal names the holder',
      ),
      compare('world.refusals', 1, runner.usage.worlds.refusals.total, 'The refusal is counted'),
    );
    await first;
    runner.dispose();
  }

  /* ---------------------------------------------------------------------- model */

  {
    const { runner } = deterministicRunner();
    const simplified = await runner.start(
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
    const claimed = await runner.start(
      request({
        batchId: 'batch-claimed',
        baseSeeds: [1, 2],
        model: {
          kind: 'SIMPLIFIED',
          approximation: 'single-track bicycle model',
          notValidated: ['impact response'],
          physicsFidelity: true,
        },
      }),
    );
    scenarios.push(
      scenarioOf(
        'simplified',
        simplified,
        'The approximation is labelled and never reported as physics',
      ),
    );
    checks.push(
      compare(
        'model.simplifiedStatus',
        'COMPLETED',
        simplified.status,
        'A declared approximation may run',
      ),
      compare(
        'model.kind',
        'SIMPLIFIED',
        simplified.model.kind,
        'The kind is carried in the result',
      ),
      compare(
        'model.physicsFidelity',
        false,
        simplified.model.physicsFidelity,
        'A simplified model is never full physics',
      ),
      compare(
        'model.reportFidelity',
        false,
        experimentReportLabel(simplified).physicsFidelity,
        'The report label cannot upgrade it either',
      ),
      compare(
        'model.disclaimer',
        true,
        simplifiedDisclaimer(simplified),
        'The disclaimer names what is not validated',
      ),
      compare(
        'model.claimedStatus',
        'REFUSED',
        claimed.status,
        'A simplified model that claims fidelity is refused',
      ),
      compare(
        'model.claimedCode',
        'SIMPLIFIED_CLAIMS_FIDELITY',
        claimed.codes[0] ?? null,
        'The claim has its own closed code',
      ),
    );
    runner.dispose();
  }

  /* ---------------------------------------------------------------------- budget */

  {
    const { runner } = deterministicRunner({ stepMs: 12 });
    const result = await runner.start(request());
    scenarios.push(
      scenarioOf(
        'slice-budget',
        result,
        'A 12 ms step against the 10 ms manifest budget is reported',
      ),
    );
    checks.push(
      compare(
        'sliceBudget.overruns',
        3,
        result.slices.filter((slice) => slice.overBudget).length,
        'All three slices are over budget',
      ),
      compare('sliceBudget.stepMs', 12, result.slices[0]?.stepMs ?? -1, 'The real step is kept'),
      compare(
        'sliceBudget.allocated',
        10,
        result.budgets.sliceMaximumMs,
        'The allocation comes from the manifest',
      ),
    );
    runner.dispose();
  }

  /* -------------------------------------------------------------- real 221 stack */

  {
    const harness = createLiveExperimentHarness();
    try {
      const port = createExperimentGovernorPort({
        governor: harness.governor,
        identity: () => EXPERIMENT_WORKER_IDENTITY,
      });
      let clock = 0;
      const runner = new ExperimentBatchRunner({
        port,
        budgets: budgetsOrThrow(),
        worlds: new ExperimentWorldRegistry(1),
        now: () => (clock += 1),
      });
      const result = await runner.start(request({ baseSeeds: [142_000, 142_001, 142_002] }));
      scenarios.push(
        scenarioOf(
          'live-221',
          result,
          'Three real 142 run cells, each admitted by the shared 221 coordinator',
        ),
      );
      checks.push(
        compare('live.status', 'COMPLETED', result.status, 'The real stack completes the batch'),
        compare('live.rows', 3, result.results.complete.length, 'One row per real run cell'),
        compare('live.decisions', 72, result.summary.decisions, 'Three seeds × 24 decisions'),
        compare(
          'live.divergent',
          true,
          result.summary.divergent > 0,
          `Real divergences: ${result.summary.divergent}`,
        ),
        compare(
          'live.causes',
          true,
          Object.keys(result.summary.causes).length > 0,
          `Cause distribution read from 142: ${JSON.stringify(result.summary.causes)}`,
        ),
        compare('live.refusals', 0, port.usage.refusals, 'No slice was refused'),
        compare(
          'live.admitted',
          3,
          port.usage.completed,
          'Every slice went through the coordinator',
        ),
      );
      runner.dispose();
    } finally {
      harness.dispose();
    }
  }

  /* ------------------------------------------------------------------ 221 refusal */

  {
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
        budgets: budgetsOrThrow(),
        worlds: new ExperimentWorldRegistry(1),
        now: () => (clock += 1),
      });
      const result = await runner.start(request({ baseSeeds: [142_000] }));
      scenarios.push(
        scenarioOf(
          'refused-221',
          result,
          'The coordinator has no capacity, so the slice is refused',
        ),
      );
      checks.push(
        compare('refusal.status', 'REFUSED', result.status, 'The refusal is explicit'),
        compare(
          'refusal.code',
          'CAPACITY_INSUFFICIENT',
          result.codes[0] ?? null,
          'The 221 refusal is carried',
        ),
        compare('refusal.count', 1, result.refusals.total, 'The refusal is counted'),
        compare(
          'refusal.rows',
          0,
          result.results.partial.length,
          'A refused first slice produced nothing',
        ),
      );
      runner.dispose();
    } finally {
      probe.dispose();
    }
  }

  /* ------------------------------------------------------------- worker error */

  {
    const harness = createLiveExperimentHarness();
    try {
      const port = createExperimentGovernorPort({
        governor: harness.governor,
        identity: () => EXPERIMENT_WORKER_IDENTITY,
      });
      let clock = 0;
      const runner = new ExperimentBatchRunner({
        port,
        budgets: budgetsOrThrow(),
        worlds: new ExperimentWorldRegistry(1),
        now: () => (clock += 1),
      });
      const result = await runner.start(
        request({ baseSeeds: [142_000, WORKER_ERROR_SEED, 142_002] }),
      );
      scenarios.push(scenarioOf('worker-error', result, 'The worker fails on the second run cell'));
      checks.push(
        compare('error.status', 'FAILED', result.status, 'A worker error stops the batch'),
        compare(
          'error.code',
          'SLICE_FAILED',
          result.codes[0] ?? null,
          'The failure has its own code',
        ),
        compare(
          'error.completed',
          1,
          result.progress.completedSlices,
          'Only the first slice finished',
        ),
        compare(
          'error.partialRows',
          1,
          result.results.partial.length,
          'Its row is kept, labelled PARTIAL',
        ),
        compare(
          'error.partialReason',
          'SLICE_FAILED',
          result.results.partialReason,
          'The partial reason names the failure',
        ),
      );
      runner.dispose();
    } finally {
      harness.dispose();
    }
  }

  /* ------------------------------------------------------- learning preemption */

  {
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
      const runner = new ExperimentBatchRunner({
        port,
        budgets: budgetsOrThrow(),
        worlds: new ExperimentWorldRegistry(1),
        now: () => (clock += 1),
      });
      const pending = runner.start(request({ baseSeeds: [142_000, 142_001] }));
      await inFlight;
      const learning = await harness.submitLearning(3);
      if (learning.status !== 'result') throw new Error('The learning probe did not finish');
      runner.interruptForLearning('batch-144', { learningEpoch: 3, segmentId: 'learning/3' });
      await polling(
        runner,
        'batch-144',
        (state) => state.state === 'PAUSED' && state.completedSlices >= 1,
      );
      runner.resumeAfterLearning('batch-144', { learningEpoch: 3 });
      const result = await pending;
      scenarios.push(
        scenarioOf(
          'learning-preemption',
          result,
          'An interactive learning job preempts the slice in 221, then the batch pauses and resumes',
        ),
      );
      checks.push(
        compare(
          'preemption.status',
          'COMPLETED',
          result.status,
          'The batch finishes after the interrupt',
        ),
        compare(
          'preemption.preempted',
          1,
          result.learning.preemptedSlices,
          '221 preempted exactly one slice',
        ),
        compare('preemption.pause', 1, result.learning.pauseCount, 'The batch paused once'),
        compare('preemption.resume', 1, result.learning.resumeCount, 'The batch resumed once'),
        compare(
          'preemption.inFlight',
          true,
          result.learning.interrupts[0]?.inFlight ?? false,
          'The interrupt landed while a slice was running',
        ),
        compare(
          'preemption.rows',
          2,
          result.results.complete.length,
          'Both run cells produced their row',
        ),
      );
      runner.dispose();
    } finally {
      harness.dispose();
    }
  }

  const passed = checks.filter((check) => check.pass).length;
  return Object.freeze({
    version: EXPERIMENT_WORKER_VERSION,
    budgets: Object.freeze({
      status: budgetRead.status,
      version: budgetRead.status === 'READY' ? budgetRead.budgets.version : null,
      residentWorlds: budgetRead.status === 'READY' ? budgetRead.budgets.residentWorlds : null,
      activeHeavyJobs: budgetRead.status === 'READY' ? budgetRead.budgets.activeHeavyJobs : null,
      executionJobs: budgetRead.status === 'READY' ? budgetRead.budgets.executionJobs : null,
      sliceMaximumMs: budgetRead.status === 'READY' ? budgetRead.budgets.sliceMaximumMs : null,
      progressIntervalMinimumMs:
        budgetRead.status === 'READY' ? budgetRead.budgets.progressIntervalMinimumMs : null,
      progressHzMaximum:
        budgetRead.status === 'READY' ? budgetRead.budgets.progressHzMaximum : null,
      cancellationTargetMaximumMs:
        budgetRead.status === 'READY' ? budgetRead.budgets.cancellationTargetMaximumMs : null,
      ownedPendingPayloadBytes:
        budgetRead.status === 'READY' ? budgetRead.budgets.ownedPendingPayloadBytes : null,
      gaps: Object.freeze(budgetGaps),
    }),
    refusalProbe: Object.freeze({
      status: missingRead.status,
      codes:
        missingRead.status === 'REFUSED'
          ? Object.freeze([...missingRead.codes])
          : Object.freeze([]),
      paths: Object.freeze(missingPaths),
    }),
    scenarios: Object.freeze(scenarios),
    checks: Object.freeze(checks),
    summary: Object.freeze({ checks: checks.length, passed, pass: passed === checks.length }),
  });
}

/** True when the simplified disclaimer names the unvalidated behaviour. */
function simplifiedDisclaimer(result: ExperimentBatchResult): boolean {
  return (
    result.model.disclaimer.includes('SIMPLIFIED') &&
    result.model.disclaimer.includes('not validated')
  );
}

export interface ExperimentWorkerCost {
  readonly contract: string;
  readonly generatedAt: string;
  readonly node: string;
  readonly platform: string;
  readonly samples: number;
  readonly slices: number;
  readonly sliceMs: Readonly<{ min: number; median: number; max: number }>;
  readonly batchMs: Readonly<{ min: number; median: number; max: number }>;
  readonly limits: Readonly<{
    sliceMaximumMs: number;
    cancellationTargetMaximumMs: number;
  }>;
  readonly overBudgetSlices: number;
  readonly note: string;
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

function summarise(
  values: readonly number[],
): Readonly<{ min: number; median: number; max: number }> {
  if (values.length === 0) return Object.freeze({ min: 0, median: 0, max: 0 });
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
 * Real cost probe: the only measurement that uses a wall clock.
 *
 * One slice is one real 142 run cell; 142 does not expose an incremental evaluation yet, so the
 * whole cell runs in one worker step and may exceed the 10 ms slice budget. The probe measures what
 * really happened and reports the overrun instead of hiding it.
 */
export async function runExperimentWorkerCost(samples = 5): Promise<ExperimentWorkerCost> {
  const { performance } = await import('node:perf_hooks');
  const sliceTimes: number[] = [];
  const batchTimes: number[] = [];
  let overBudget = 0;
  const limits = budgetsOrThrow();
  for (let sample = 0; sample < samples; sample += 1) {
    const harness = createLiveExperimentHarness({ now: () => performance.now() });
    try {
      const port = createExperimentGovernorPort({
        governor: harness.governor,
        identity: () => EXPERIMENT_WORKER_IDENTITY,
      });
      let clock = 0;
      const runner = new ExperimentBatchRunner({
        port,
        budgets: limits,
        worlds: new ExperimentWorldRegistry(1),
        now: () => (clock += 1),
      });
      const started = performance.now();
      const result = await runner.start(
        request({ batchId: `cost-${sample}`, baseSeeds: [142_000, 142_001, 142_002] }),
      );
      batchTimes.push(performance.now() - started);
      for (const slice of result.slices) {
        if (slice.stepMs === null) continue;
        sliceTimes.push(slice.stepMs);
        if (slice.overBudget) overBudget += 1;
      }
      runner.dispose();
    } finally {
      harness.dispose();
    }
  }
  return Object.freeze({
    contract: EXPERIMENT_WORKER_VERSION,
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    samples,
    slices: sliceTimes.length,
    sliceMs: summarise(sliceTimes),
    batchMs: summarise(batchTimes),
    limits: Object.freeze({
      sliceMaximumMs: limits.sliceMaximumMs,
      cancellationTargetMaximumMs: limits.cancellationTargetMaximumMs,
    }),
    overBudgetSlices: overBudget,
    note:
      'One slice is one real 142 run cell executed inside one worker step; the run cell is not internally sliced. ' +
      'Single machine, single run, not a p95 and not a hardware certification.',
  });
}

export function experimentWorkerReportMarkdown(report: ExperimentWorkerReport): string {
  const lines: string[] = [];
  lines.push('# 144 — experiment batches in a worker: progress and cancellation');
  lines.push('');
  lines.push(`Contract: \`${report.version}\`.`);
  lines.push('');
  lines.push('## Budgets read from the manifest');
  lines.push('');
  lines.push('| Budget | Value |');
  lines.push('| --- | --- |');
  const budget = report.budgets;
  lines.push(`| status | ${budget.status} |`);
  lines.push(`| version | ${String(budget.version)} |`);
  lines.push(`| resident experiment worlds | ${String(budget.residentWorlds)} |`);
  lines.push(`| heavy jobs at a time | ${String(budget.activeHeavyJobs)} |`);
  lines.push(`| execution jobs | ${String(budget.executionJobs)} |`);
  lines.push(`| slice maximum (ms) | ${String(budget.sliceMaximumMs)} |`);
  lines.push(`| progress interval (ms) | ${String(budget.progressIntervalMinimumMs)} |`);
  lines.push(`| progress maximum (Hz) | ${String(budget.progressHzMaximum)} |`);
  lines.push(`| cancellation target (ms) | ${String(budget.cancellationTargetMaximumMs)} |`);
  lines.push(`| owned pending payload (bytes) | ${String(budget.ownedPendingPayloadBytes)} |`);
  lines.push('');
  lines.push(`Gaps reported, not invented: ${budget.gaps.join(', ')}.`);
  lines.push('');
  lines.push('## Scenarios');
  lines.push('');
  lines.push(
    '| Scenario | Status | Slices | Complete rows | Partial rows | Partial reason | Codes | Learning |',
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const scenario of report.scenarios) {
    lines.push(
      `| ${scenario.name} | ${scenario.status} | ${scenario.completedSlices}/${scenario.totalSlices} | ${scenario.completeRows} | ${scenario.partialRows} | ${scenario.partialReason ?? '—'} | ${scenario.codes.join(', ') || '—'} | pause ${scenario.learning.pauseCount} / resume ${scenario.learning.resumeCount} / preempted ${scenario.learning.preemptedSlices} |`,
    );
  }
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  lines.push('| Check | Expected | Actual | Result |');
  lines.push('| --- | --- | --- | --- |');
  for (const check of report.checks)
    lines.push(
      `| ${check.name} | ${String(check.expected)} | ${String(check.actual)} | ${check.pass ? 'PASS' : 'FAIL'} |`,
    );
  lines.push('');
  lines.push(
    `Summary: ${report.summary.passed}/${report.summary.checks} checks, overall ${report.summary.pass ? 'PASS' : 'FAIL'}.`,
  );
  lines.push('');
  return lines.join('\n');
}

/** Markdown for the wall-clock probe; it is written next to the deterministic transcript. */
export function experimentWorkerCostMarkdown(cost: ExperimentWorkerCost): string {
  return [
    '# 144 — real slice cost',
    '',
    `Probe: ${cost.contract}, ${cost.samples} batch(es), ${cost.slices} slice(s).`,
    `Recorded: ${cost.generatedAt}, Node ${cost.node}, ${cost.platform}.`,
    '',
    '| Measure | Min (ms) | Median (ms) | Max (ms) |',
    '| --- | --- | --- | --- |',
    `| run cell (one slice) | ${cost.sliceMs.min} | ${cost.sliceMs.median} | ${cost.sliceMs.max} |`,
    `| whole batch (3 slices) | ${cost.batchMs.min} | ${cost.batchMs.median} | ${cost.batchMs.max} |`,
    '',
    `Manifest budget: slice ≤ ${cost.limits.sliceMaximumMs} ms, cancellation response ≤ ${cost.limits.cancellationTargetMaximumMs} ms.`,
    `Slices over the slice budget: ${cost.overBudgetSlices} of ${cost.slices}.`,
    '',
    cost.note,
    '',
  ].join('\n');
}
