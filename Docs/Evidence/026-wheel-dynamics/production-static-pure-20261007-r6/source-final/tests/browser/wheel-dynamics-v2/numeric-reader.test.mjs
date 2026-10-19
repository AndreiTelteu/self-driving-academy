// UNEXECUTED numeric reader tests: mathematical thresholds and honest historical classification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  percentile,
  classifyLegacy,
  verifyNativeParity,
  verifyCaptureNumbers,
} from './numeric-reader.mjs';
const budgets = {
  regressionProposal: {
    p95RelativeIncrease: 0.1,
    p95AbsoluteIncreaseMs: 1,
    confirmationsOutOfFive: 3,
  },
  proposedBudgets: { desktop: { authoritativeTickP95Ms: 5.5 } },
};
const native = (value) => ({
  runs: Array.from({ length: 10 }, (_, index) => ({
    pair: Math.floor(index / 2),
    observe: index % 2 === 1,
    inputHash: 'same',
    physicalHash: 'same',
    metrics: { tick: { p95: value }, projection: { p95: value } },
  })),
});
test('numeric percentile uses ascending nearest rank and rejects null/NaN/empty raw', () => {
  assert.equal(percentile([10, 2, 3, 1], 0.5), 2);
  for (const values of [[], [null], [NaN], [Infinity], [-1]])
    assert.throws(() => percentile(values, 0.95));
});
test('original relative AND absolute formula and3of5 confirmation are preserved', () => {
  verifyNativeParity(native(4), native(4.9), budgets); // >10% but <=1ms is not a regression
  const after = native(5.1);
  assert.throws(() => verifyNativeParity(native(4), after, budgets), /Confirmed/);
  after.runs[5].metrics.tick.p95 = 4;
  after.runs[5].metrics.projection.p95 = 4;
  after.runs[7].metrics.tick.p95 = 4;
  after.runs[7].metrics.projection.p95 = 4;
  after.runs[9].metrics.tick.p95 = 4;
  after.runs[9].metrics.projection.p95 = 4;
  verifyNativeParity(native(4), after, budgets);
  after.runs[0].physicalHash = 'changed';
  assert.throws(() => verifyNativeParity(native(4), after, budgets), /parity/);
});
test('legacy recorded error staysFAIL, missing full raw staysINCOMPLETE; diagnostic neverPASS', () => {
  assert.equal(classifyLegacy({ error: 'Fixed-tick overload', foreground: true }).state, 'FAIL');
  assert.equal(
    classifyLegacy({ full: true, foreground: true, runs: Array(10).fill({}) }).state,
    'INCOMPLETE',
  );
  assert.throws(() => verifyCaptureNumbers({ state: 'INCOMPLETE' }, budgets), /INCOMPLETE/);
});

async function numericFixture() {
  const { readFile } = await import('node:fs/promises');
  const budgets = JSON.parse(await readFile('Docs/performance-budgets.json', 'utf8'));
  const calibration = JSON.parse(
    await readFile('Docs/Evidence/026-wheel-dynamics/calibration-v2.json', 'utf8'),
  ).runs.filter((x) => x.speedMps === 20 && ['braking', 'turning'].includes(x.scenario));
  const clean = () => ({
    failed: false,
    closed: true,
    pending: false,
    overflow: 0,
    causeOverflow: 0,
    lateCount: 0,
    causes: [],
    journal: [],
    lastTrigger: {
      requestEntryMs: 149983,
      callbackEntryMs: 150000,
      continuationEntryMs: 150000,
      requestCounters: { nativeCount: 8999, renderCount: 8999 },
      callbackCounters: { nativeCount: 8999, renderCount: 8999 },
      continuationCounters: { nativeCount: 8999, renderCount: 8999 },
    },
    scheduling: {
      requests: 9001,
      callbacks: 9001,
      continuations: 9001,
      maxCallbackDelayMs: 16,
      maxContinuationDelayMs: 16,
    },
    boundaries: {
      'native-exit': { counters: { nativeCount: 9000 } },
      'render-exit': { counters: { nativeCount: 9000, renderCount: 9000 } },
    },
  });
  const cleanup = () => ({
    'native-resources': {
      bodies: { entities: 0, subscriptions: 0 },
      collisions: { colliders: 0, disposed: true },
    },
  });
  const stats = (values) => ({
    count: values.length,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: Math.max(...values),
  });
  const binding = { sourceHash: 'a'.repeat(64), mode: 'full' };
  const raw = Array.from({ length: 10 }, (_, index) => {
    const pair = Math.floor(index / 2),
      current = pair % 2 ? index % 2 === 0 : index % 2 === 1;
    const channels = {
      frame: Array(7200).fill(1000 / 60),
      main: Array(7200).fill(2),
      projection: Array(7200).fill(0.1),
      tick: Array(7200).fill(1),
      step: Array(7200).fill(0.5),
    };
    return {
      dto: {
        armIndex: index,
        pair,
        current,
        frames: 7200,
        ticks: 7200,
        channels,
        lifetime: clean(),
        readbacks: cleanup(),
        longTaskEntries: [],
      },
    };
  });
  const runs = raw.map(({ dto }) => ({
    pair: dto.pair,
    current: dto.current,
    frames: dto.frames,
    ticks: dto.ticks,
    warmupSeconds: 30,
    measuredSeconds: 120,
    activeSeconds: 150,
    overloadCount: 0,
    maxDebtMs: 16,
    maxSteps: 1,
    gates: {
      fixedDtSeconds: 1 / 60,
      maxCatchupSteps: 4,
      overloadDebtMs: 250,
      simulationMinimum: 0.98,
    },
    simulationToActiveWallTime: 1,
    physics: { vehicles: 70, bodies: 134, colliders: 138 },
    stats: Object.fromEntries(
      Object.entries(dto.channels).map(([key, values]) => [key, stats(values)]),
    ),
    measurementStartMs: 30000,
    measurementEndMs: 150000,
    longTasks: { supported: true, count: 0, maxMs: 0 },
    memory: {
      worlds: 1,
      retainedWheelHistory: 0,
      wheelMeshes: 280,
      chassisMeshes: 70,
      trackedJsHeapStartBytes: null,
      trackedJsHeapEndBytes: null,
      exactPageHeapBytes: null,
      exactWasmBytes: null,
    },
    sampleBytes: 1200000,
    gpuP95Ms: null,
  }));
  const report = {
    identity: { sourceHash: binding.sourceHash, budgetVersion: budgets.budgetVersion },
    renderer: 'WEBGPU',
    dpr: 1,
    cssResolution: [1920, 1080],
    internalResolution: [1920, 1080],
    actualGpuInfo: 'TEST_ONLY_NO_HARDWARE_RESULT',
    runs,
    calibration: calibration.map((x) => ({ ...x, lifetime: clean(), readbacks: cleanup() })),
  };
  return {
    budgets,
    capture: {
      state: 'RAW_READY',
      start: { binding },
      backend: { dto: { renderer: 'WEBGPU' } },
      terminal: {
        dto: {
          state: 'CAPTURE_COMPLETE',
          report,
          lifetime: {
            ...clean(),
            journal: ['journal-start', 'focus-poll'].map((kind, index) => ({
              kind,
              at: index * 1000,
              focused: true,
              hidden: false,
              connected: true,
              visibility: 'visible',
            })),
          },
          readbacks: {
            surface: { connected: false },
            backend: { sceneDisposed: true },
            engine: { engineDisposed: true },
          },
        },
      },
      raw,
      late: [],
    },
  };
}
test('full ten-arm/eight real-schema calibration reader computes required numeric gates; mutations fail individually', async () => {
  const fixture = await numericFixture();
  assert.equal(verifyCaptureNumbers(fixture.capture, fixture.budgets).numericState, 'NUMERIC_PASS');
  for (const mutate of [
    (value) => {
      value.raw[0].dto.channels.frame.pop();
    },
    (value) => {
      value.terminal.dto.report.runs[0].stats.tick.p95 = 0;
    },
    (value) => {
      value.terminal.dto.report.runs[0].maxSteps = 5;
    },
    (value) => {
      value.terminal.dto.report.runs[0].maxDebtMs = 251;
    },
    (value) => {
      value.terminal.dto.report.runs[0].simulationToActiveWallTime = 0.97;
    },
    (value) => {
      value.raw[0].dto.readbacks['native-resources'].bodies.subscriptions = 1;
    },
    (value) => {
      value.late.push({ state: 'FAILED_UNKNOWN' });
    },
    (value) => {
      value.terminal.dto.report.calibration.pop();
    },
    (value) => {
      value.terminal.dto.report.runs[0].memory.wheelMeshes = 279;
    },
  ]) {
    const changed = structuredClone(fixture.capture);
    mutate(changed);
    assert.throws(() => verifyCaptureNumbers(changed, fixture.budgets));
  }
});
