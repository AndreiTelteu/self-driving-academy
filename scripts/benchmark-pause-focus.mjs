// PBI 070 targeted probe: native CPU cost and owned-resource envelope of the pause/focus owner,
// measured BEFORE (070 runtime path disabled: 012 + 008 only) and AFTER (070 composed), plus an
// explicit "suspended" arm whose whole point is that it removes work.
//
// Run: node --import ./scripts/register-typescript.mjs scripts/benchmark-pause-focus.mjs [--baseline]
// Sequential and alone; no browser, GPU, renderer, FPS or input-latency claim.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createApplicationLifecycle } from '../src/app/application-lifecycle.ts';

const baseline = process.argv.includes('--baseline');
const FRAMES = 10000;
const TRANSITIONS = 2000;
const READS = 10000;
const OBSERVER_CAPACITY = 10000;
const REPETITIONS = 5;
const FIXTURE_VERSION = '070-pause-focus-native-v1';

function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}
function distribution(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}
const micros = (milliseconds) => (milliseconds === null ? null : milliseconds * 1000);

/** Real 012 lifecycle + real 008 loop, with an optional real 070 owner on top. */
function buildHarness(withOwner) {
  let now = 0;
  let callback;
  let ticks = 0;
  let renders = 0;
  const tickSequence = [];
  const app = createApplicationLifecycle({
    createBackend: async () => ({
      rendererKind: 'CPU mock',
      render() {
        renders++;
      },
      resize() {},
      dispose() {},
    }),
    createSimulation: () => ({
      captureSnapshot: () => ({ tick: ticks }),
      step(step) {
        ticks = step.tick;
        tickSequence.push(step.tick);
      },
      interpolate: (_previous, current) => current,
    }),
    show() {},
    now: () => now,
    isHidden: () => false,
    scheduleFrame(next) {
      callback = next;
      return 1;
    },
    cancelFrame() {},
    subscribeResize: () => () => {},
    subscribeVisibility: () => () => {},
  });
  let owner = null;
  let suspends = 0;
  let resumes = 0;
  let heldResets = 0;
  if (withOwner) {
    owner = createPauseFocusOwner({
      suspend(cause) {
        suspends++;
        app.pause(cause);
      },
      resume(cause) {
        resumes++;
        const state = app.getState();
        if (state.kind === 'PAUSED' && state.reason === cause) app.play();
      },
      resetHeldCommands() {
        heldResets++;
      },
    });
  }
  return {
    app,
    get owner() {
      return owner;
    },
    counters: () => ({ ticks, renders, suspends, resumes, heldResets }),
    tickSequence,
    setNow(value) {
      now = value;
    },
    frame(time) {
      now = time;
      callback?.();
    },
  };
}

async function liveArm(withOwner, observed) {
  const harness = buildHarness(withOwner);
  await harness.app.load();
  harness.app.play();
  if (harness.owner) {
    harness.owner.setMode('AUTO');
    harness.owner.setSurface('panel', true);
    harness.owner.setSurface('diagnostic', true);
  }
  const samples = [];
  const start = performance.now();
  for (let frame = 1; frame <= FRAMES; frame++) {
    const before = observed ? performance.now() : 0;
    harness.frame((frame * 1000) / 60);
    if (observed) samples.push(performance.now() - before);
  }
  const milliseconds = performance.now() - start;
  const counters = harness.counters();
  harness.app.dispose();
  return {
    milliseconds,
    ticks: counters.ticks,
    renders: counters.renders,
    suspensions: counters.suspends,
    observedMs: observed ? distribution(samples) : null,
  };
}

async function suspendedArm(withOwner, observed) {
  const harness = buildHarness(withOwner);
  await harness.app.load();
  harness.app.play();
  if (harness.owner) {
    harness.owner.setMode('MANUAL');
    harness.owner.setSurface('panel', true);
  } else {
    harness.app.pause('manual');
  }
  const ticksAtPause = harness.counters().ticks;
  const samples = [];
  const start = performance.now();
  for (let frame = 1; frame <= FRAMES; frame++) {
    const before = observed ? performance.now() : 0;
    harness.frame(60000 + (frame * 1000) / 60);
    if (observed) samples.push(performance.now() - before);
  }
  const milliseconds = performance.now() - start;
  const counters = harness.counters();
  harness.app.dispose();
  return {
    milliseconds,
    ticksBeforePause: ticksAtPause,
    ticksWhileSuspended: counters.ticks - ticksAtPause,
    renders: counters.renders,
    suspensions: counters.suspends,
    observedMs: observed ? distribution(samples) : null,
  };
}

/** Anchor time first, then alternate suspend/resume; no tick may advance while suspended. */
async function transitionArm(withOwner) {
  const harness = buildHarness(withOwner);
  await harness.app.load();
  harness.app.play();
  if (harness.owner) harness.owner.setMode('MANUAL');
  harness.setNow(1000 / 60);
  harness.frame(1000 / 60);
  const samples = [];
  let ticksWhileSuspended = 0;
  let time = 1000 / 60;
  for (let edge = 0; edge < TRANSITIONS; edge++) {
    const before = performance.now();
    time += 1000 / 60;
    if (harness.owner) harness.owner.setSurface('panel', edge % 2 === 0);
    else if (edge % 2 === 0) harness.app.pause('manual');
    else harness.app.play();
    time += 1000 / 60;
    const ticksBefore = harness.counters().ticks;
    harness.frame(time);
    if (edge % 2 === 0) ticksWhileSuspended += harness.counters().ticks - ticksBefore;
    samples.push(performance.now() - before);
  }
  const counters = harness.counters();
  const sequence = [...harness.tickSequence];
  harness.app.dispose();
  return {
    edges: TRANSITIONS,
    suspensions: counters.suspends,
    resumes: counters.resumes,
    heldResets: counters.heldResets,
    ticksWhileSuspended,
    ticksTotal: counters.ticks,
    contiguous: sequence.every((tick, index) => tick === index + 1),
    distinctTicks: new Set(sequence).size === sequence.length,
    observedMs: distribution(samples),
  };
}

function readArm() {
  const harness = buildHarness(true);
  const owner = harness.owner;
  owner.setMode('MANUAL');
  owner.setSurface('panel', true);
  const samples = [];
  let last = null;
  for (let index = 0; index < READS; index++) {
    const before = performance.now();
    last = owner.getState();
    samples.push(performance.now() - before);
  }
  const result = {
    observedMs: distribution(samples),
    suspended: last.suspended,
    cause: last.cause,
  };
  owner.dispose();
  return result;
}

/** Owned-resource envelope: the owner preallocates no typed arrays and retains no history. */
function memoryArm(withOwner) {
  const before = process.memoryUsage();
  const cycles = [];
  for (let cycle = 0; cycle < 20; cycle++) {
    if (!withOwner) {
      cycles.push({ cycle, retained: 0 });
      continue;
    }
    const owner = createPauseFocusOwner({ suspend() {}, resume() {} });
    owner.setMode('MANUAL');
    owner.setSurface('panel', true);
    owner.setSurface('panel', false);
    owner.setFocusLost(true);
    owner.setFocusLost(false);
    for (let index = 0; index < PAUSE_FOCUS_MAX_HELD_COMMANDS; index++)
      owner.holdCommand(`code-${index}`);
    owner.holdPanelAction('resume');
    const live = owner.getState();
    const stats = owner.getStats();
    owner.dispose();
    const after = owner.getState();
    cycles.push({
      cycle,
      liveHeld: live.heldCommands.length,
      liveHeldAction: live.heldPanelAction,
      liveSuspended: live.suspended,
      suspensions: stats.suspensions,
      resumes: stats.resumes,
      heldResets: stats.heldResets,
      afterDisposeHeld: after.heldCommands.length,
      afterDisposeHeldAction: after.heldPanelAction,
      disposed: owner.getStats().disposed,
      disposedRejects: (() => {
        try {
          owner.setFocusLost(true);
          return false;
        } catch {
          return true;
        }
      })(),
    });
  }
  const after = process.memoryUsage();
  return {
    cycles,
    allCyclesReleased: cycles.every(
      (row) =>
        row.retained === 0 || (row.afterDisposeHeld === 0 && row.afterDisposeHeldAction === null),
    ),
    ownership: withOwner
      ? {
          heldCommandCapacity: PAUSE_FOCUS_MAX_HELD_COMMANDS,
          surfaceFlags: 3,
          retainedTypedArrays: 0,
          preallocatedBufferBytes: 0,
          retainedHistoryEntries: 0,
        }
      : { retainedTypedArrays: 0, preallocatedBufferBytes: 0, retainedHistoryEntries: 0 },
    process: {
      label: 'DIAGNOSTIC_NOT_COMPARABLE_ACROSS_JIT_GC',
      heapUsedDeltaBytes: after.heapUsed - before.heapUsed,
      arrayBuffersDeltaBytes: after.arrayBuffers - before.arrayBuffers,
    },
  };
}

let ownerModule = {};
if (!baseline) ownerModule = await import('../src/app/pause-focus.ts');
const { createPauseFocusOwner, PAUSE_FOCUS_MAX_HELD_COMMANDS } = {
  createPauseFocusOwner: ownerModule.createPauseFocusOwner,
  PAUSE_FOCUS_MAX_HELD_COMMANDS: ownerModule.PAUSE_FOCUS_MAX_HELD_COMMANDS,
};

const budgets = JSON.parse(
  readFileSync(new URL('../Docs/performance-budgets.json', import.meta.url)),
);
const report = {
  pbi: '070',
  mode: baseline ? 'before' : 'after',
  featurePath: baseline
    ? 'DISABLED (012 + 008 only)'
    : 'COMPOSED (070 owner + 012 lifecycle + 008 loop)',
  validationProfile: 'targeted-validation-v1',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  hardware: {
    cpu: cpus()[0]?.model ?? null,
    logicalCpus: cpus().length,
    os: `${platform()} ${release()}`,
    totalMemBytes: totalmem(),
  },
  engine:
    'Babylon.js is the project engine; this probe is a CPU Node fixture and exercises no renderer',
  backend: 'CPU Node mock renderer; no GPU, browser, FPS, frame-time or input-latency measurement',
  preset: 'unavailable (no renderer composed)',
  budgetVersion: `${budgets.budgetVersion} PROVISIONAL_UNCALIBRATED`,
  budgetComparison: {
    status: budgets.status,
    approvedGate: budgets.approvedGate,
    desktopAuthoritativeTickP95Ms: budgets.proposedBudgets.desktop.authoritativeTickP95Ms,
    desktopFrameP95Ms: budgets.proposedBudgets.desktop.frameP95Ms,
    laptopAuthoritativeTickP95Ms: budgets.proposedBudgets.laptop.authoritativeTickP95Ms,
    simulationToActiveWallTimeMinimum: budgets.proposedBudgets.simulationToActiveWallTimeMinimum,
    note: 'isolated local cost only; the owner adds no per-tick work, so there is no authoritative-tick row to close',
  },
  fixtureVersion: FIXTURE_VERSION,
  protocol: {
    repetitions: REPETITIONS,
    warmup: 'one identical unmeasured pass per probe before the measured repetitions',
    framesPerLiveSuspensionArm: FRAMES,
    transitionEdgesPerRepetition: TRANSITIONS,
    readsPerRepetition: READS,
    observerCapacity: OBSERVER_CAPACITY,
    order: 'sequential, one arm at a time, alone in the process',
  },
  arms: {
    live: null,
    liveObserved: null,
    suspended: null,
    suspendedObserved: null,
    transitions: null,
    reads: null,
  },
  repetitions: [],
  selfCheck: null,
};

// Warmup: one identical unmeasured pass per probe.
await liveArm(!baseline, false);
await suspendedArm(!baseline, false);
await transitionArm(!baseline);

for (let repetition = 0; repetition < REPETITIONS; repetition++) {
  report.repetitions.push({
    repetition: repetition + 1,
    live: await liveArm(!baseline, false),
    liveObserved: await liveArm(!baseline, true),
    suspended: await suspendedArm(!baseline, false),
    suspendedObserved: await suspendedArm(!baseline, true),
    transitions: await transitionArm(!baseline),
    reads: baseline ? null : readArm(),
  });
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
report.arms.live = {
  medianMs: median(report.repetitions.map((row) => row.live.milliseconds)),
  medianTicks: median(report.repetitions.map((row) => row.live.ticks)),
};
report.arms.liveObserved = {
  p50Micros: micros(median(report.repetitions.map((row) => row.liveObserved.observedMs.p50))),
  p95Micros: micros(median(report.repetitions.map((row) => row.liveObserved.observedMs.p95))),
  p99Micros: micros(median(report.repetitions.map((row) => row.liveObserved.observedMs.p99))),
};
report.arms.suspended = {
  medianMs: median(report.repetitions.map((row) => row.suspended.milliseconds)),
  ticksWhileSuspended: median(report.repetitions.map((row) => row.suspended.ticksWhileSuspended)),
  suspensionEdges: median(report.repetitions.map((row) => row.suspended.suspensions)),
};
report.arms.suspendedObserved = {
  p50Micros: micros(median(report.repetitions.map((row) => row.suspendedObserved.observedMs.p50))),
  p95Micros: micros(median(report.repetitions.map((row) => row.suspendedObserved.observedMs.p95))),
  p99Micros: micros(median(report.repetitions.map((row) => row.suspendedObserved.observedMs.p99))),
};
report.arms.transitions = {
  p50Micros: micros(median(report.repetitions.map((row) => row.transitions.observedMs.p50))),
  p95Micros: micros(median(report.repetitions.map((row) => row.transitions.observedMs.p95))),
  p99Micros: micros(median(report.repetitions.map((row) => row.transitions.observedMs.p99))),
  suspensions: median(report.repetitions.map((row) => row.transitions.suspensions)),
  resumes: median(report.repetitions.map((row) => row.transitions.resumes)),
  heldResets: median(report.repetitions.map((row) => row.transitions.heldResets)),
  ticksWhileSuspended: median(report.repetitions.map((row) => row.transitions.ticksWhileSuspended)),
  contiguous: report.repetitions.every((row) => row.transitions.contiguous),
  distinctTicks: report.repetitions.every((row) => row.transitions.distinctTicks),
};
report.arms.reads = baseline
  ? null
  : {
      p50Micros: micros(median(report.repetitions.map((row) => row.reads.observedMs.p50))),
      p95Micros: micros(median(report.repetitions.map((row) => row.reads.observedMs.p95))),
      suspended: report.repetitions[0].reads.suspended,
      cause: report.repetitions[0].reads.cause,
    };
report.memory = memoryArm(!baseline);
const checks = {
  liveArmAdvancesTicks: report.repetitions.every((row) => row.live.ticks > 0),
  suspendedArmAdvancesNoTicks: report.repetitions.every(
    (row) => row.suspended.ticksWhileSuspended === 0,
  ),
  suspendedArmStillRenders: report.repetitions.every((row) => row.suspended.renders >= FRAMES),
  transitionArmSuspendsNothingWhilePaused: report.repetitions.every(
    (row) => row.transitions.ticksWhileSuspended === 0,
  ),
  transitionArmTickSequenceContiguous: report.repetitions.every(
    (row) => row.transitions.contiguous && row.transitions.distinctTicks,
  ),
  memoryReleasesEveryCycle: report.memory.allCyclesReleased,
  memoryOwnsNoTypedArrays: report.memory.ownership.retainedTypedArrays === 0,
};
if (!baseline)
  checks.transitionArmEdgesMatch = report.repetitions.every(
    (row) =>
      row.transitions.suspensions === TRANSITIONS / 2 &&
      row.transitions.resumes === TRANSITIONS / 2 &&
      row.transitions.heldResets === TRANSITIONS / 2,
  );
report.selfCheck = { ...checks, passed: Object.values(checks).every((value) => value === true) };
console.log(JSON.stringify(report, null, 2));
