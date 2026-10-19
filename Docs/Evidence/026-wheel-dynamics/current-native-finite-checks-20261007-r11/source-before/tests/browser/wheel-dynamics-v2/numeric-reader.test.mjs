// UNEXECUTED numeric reader tests: mathematical thresholds and honest historical classification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  percentile,
  classifyLegacy,
  verifyNativeParity,
  verifyCaptureNumbers,
  readNative,
  readCurrentNative,
  BEFORE_SOURCE,
  validateNativeCalibration,
  readPinnedCalibration,
  verifyProductionManifests,
} from './numeric-reader.mjs';
import { requireCurrentPins, CURRENT_NATIVE_REFERENCE } from './current-native-reference.mjs';
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
test('current native proposal fails closed before archive reads until exact reviewed pins exist', { skip: CURRENT_NATIVE_REFERENCE.afterSourceHash !== null }, async () => {
  assert.throws(() => requireCurrentPins(), /INCOMPLETE/);
  await assert.rejects(readCurrentNative(), /INCOMPLETE/);
});
test('historical original BEFORE cannot adopt an arbitrary current source claim', async () => {
  await assert.rejects(readNative('Docs/Evidence/026-wheel-dynamics/before', 'before', 'a'.repeat(64)), /Historical reference source pin/);
  const before = await readNative('Docs/Evidence/026-wheel-dynamics/before', 'before', BEFORE_SOURCE);
  assert.equal(before.sourceHash, BEFORE_SOURCE);
});
test('complete production manifest requires native/calibration bytes, including private cleanup imports', () => {
  const browser = [{ path: 'src/vehicles/rapier/private-cleanup.ts', sha256: 'actual-reviewed-by-reader' }];
  verifyProductionManifests(browser, browser, browser);
  assert.throws(() => verifyProductionManifests(browser, [], browser), /Complete production/);
  assert.throws(() => verifyProductionManifests(browser, browser, [{ ...browser[0], sha256: 'historical' }]), /bytes differ/);
  assert.throws(() => verifyProductionManifests([], browser, browser), /Empty production/);
});
test('fresh calibration preserves all28 unique scenarios and original material/slip/recontact gates', async () => {
  const calibration = await readPinnedCalibration();
  validateNativeCalibration(calibration, calibration);
  for (const change of [
    (value) => value.runs.pop(),
    (value) => { value.runs[1] = value.runs[0]; },
    (value) => { value.runs.find((r) => r.scenario === 'braking' && r.surface === 'reduced-adhesion').brakingDistanceM = 0; },
    (value) => { value.runs.find((r) => r.scenario === 'airborne').maxContacts = 3; },
    (value) => { value.runs[0].geometricRadiusM = 18; },
    (value) => { value.runs[0].steeringRadians += 0.01; },
    (value) => { delete value.runs[0].curve; },
    (value) => { delete value.runs.find((r) => r.scenario === 'turning').curve; },
    (value) => { value.runs[0].curve[0].wheels.pop(); },
    (value) => { value.runs.find((r) => r.scenario === 'curb').curve[0].wheels = []; },
    (value) => { value.runs.find((r) => r.scenario === 'airborne').curve[0].wheels = []; },
    (value) => { value.runs[0].curve[0].speedMps = Infinity; },
    (value) => { value.runs[0].maxWheelLateralMps = NaN; },
    (value) => { value.runs[0].ticks = 0; },
    (value) => { value.runs[0].curve[0].tick = 0; },
    (value) => { value.runs[0].final.position.x += 0.00001; },
  ]) {
    const changed = structuredClone(calibration); change(changed);
    assert.throws(() => validateNativeCalibration(changed, calibration));
  }
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

// SOURCE10 draft: independent pinned originals, never a capture/current self-comparison.
test('browser eight deterministic results reject each hostile field and full wrong shape', async () => {
  const fixture = await numericFixture();
  const mutations = [
    ['null steering', (r) => { r.steeringRadians = null; }],
    ['zero lateral', (r) => { r.maxWheelLateralMps = 0; }],
    ['null curve speed', (r) => { r.curve[0].speedMps = null; }],
    ['empty final wheels', (r) => { r.final.wheels = []; }],
    ['three settled wheels', (r) => { r.settled.wheels.pop(); }],
    ['empty sampled wheels', (r) => { r.curve[0].wheels = []; }],
    ['missing wheel lateral', (r) => { r.curve[0].wheelLateralMps.pop(); }],
    ['nonfinite suspension', (r) => { r.final.wheels[0].suspensionLengthM = Infinity; }],
    ['NaN lateral', (r) => { r.maxWheelLateralMps = NaN; }],
    ['missing curve', (r) => { delete r.curve; }],
    ['wrong class', (r) => { r.classId = 'compact'; }],
    ['wrong scenario', (r) => { r.scenario = 'airborne'; }],
    ['wrong speed', (r) => { r.speedMps = 8; }],
    ['wrong material', (r) => { r.mechanics.surface.id = 'unknown'; }],
    ['wrong sampled tick', (r) => { r.curve[0].tick = 0; }],
    ['wrong ticks', (r) => { r.ticks += 1; }],
    ['tiny finite pose change', (r) => { r.final.position.x += 0.00001; }],
    ['extra deterministic field', (r) => { r.unapproved = true; }],
    ['missing deterministic boolean', (r) => { delete r.stopped; }],
  ];
  for (const [label, mutate] of mutations) {
    const changed = structuredClone(fixture.capture);
    mutate(changed.terminal.dto.report.calibration[0]);
    assert.throws(() => verifyCaptureNumbers(changed, fixture.budgets), undefined, label);
  }
  const wrong = structuredClone(fixture.capture);
  // Shape satisfied the former superficial checks; no original output is used for its numbers.
  wrong.terminal.dto.report.calibration = ['sedan', 'compact'].flatMap((classId) =>
    ['dry-asphalt', 'reduced-adhesion'].flatMap((surface) =>
      ['braking', 'turning'].map((scenario) => ({ classId, surface, scenario, speedMps: 20,
        geometricRadiusM: 17, steeringRadians: null, mechanics: { surface: { id: surface },
          grip: surface === 'dry-asphalt' ? 1 : 0.1 }, maxWheelLateralMps: 0,
        brakingDistanceM: surface === 'dry-asphalt' ? 1 : 2, stopped: true,
        final: { wheels: [] }, curve: [{ speedMps: null,
          wheels: Array.from({ length: 4 }, () => ({ suspensionLengthM: 0 })) }],
        lifetime: structuredClone(fixture.capture.terminal.dto.report.calibration[0].lifetime),
        readbacks: structuredClone(fixture.capture.terminal.dto.report.calibration[0].readbacks) }))));
  assert.throws(() => verifyCaptureNumbers(wrong, fixture.budgets));
  const duplicate = structuredClone(fixture.capture);
  duplicate.terminal.dto.report.calibration[1] = structuredClone(duplicate.terminal.dto.report.calibration[0]);
  assert.throws(() => verifyCaptureNumbers(duplicate, fixture.budgets));
});
