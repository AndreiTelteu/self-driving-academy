import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FLEET_BUDGETS,
  FLEET_WORKLOADS,
  evaluateRun,
  hardwareColumn,
  reproducibilityFindings,
  stressFindings,
  summarizeRepeats,
  workloadById,
} from './plan.ts';
import type { RunVerdictInput } from './plan.ts';

const manifest = JSON.parse(readFileSync('Docs/performance-budgets.json', 'utf8'));

const base = (overrides: Partial<RunVerdictInput> = {}): RunVerdictInput => ({
  workload: 'maximum-30',
  row: 'laptop',
  frameP95Ms: 20,
  frameP99Ms: 30,
  mainThreadP95Ms: 12,
  authoritativeTickP95Ms: 4,
  rapierStepP95Ms: 2,
  gpuP95Ms: null,
  inputToCommandP95Ms: 20,
  learningEndToEndP95Ms: 40,
  simulationToWallRatio: 0.999,
  applicationLongTaskMaximumMs: null,
  physicalVehicles: 70,
  expectedVehicles: 70,
  contacts: 3,
  collisions: 1,
  cleanupLeaked: false,
  overloads: 0,
  status: 'running',
  offscreenVehiclesRetained: true,
  aggressiveVehicles: 23,
  prudentVehicles: 47,
  learningSegments: 24,
  ...overrides,
});

test('the gate matrix follows the fixed manifest and keeps the stress probe separate', () => {
  assert.deepEqual(
    FLEET_WORKLOADS.map((spec) => [spec.taxis, spec.civilians, spec.stress]),
    [
      [20, 20, false],
      [24, 40, false],
      [30, 40, false],
      [30, 80, true],
    ],
  );
  assert.equal(workloadById('normal-24').civilians, manifest.workloads.normal.civilians);
  assert.equal(workloadById('maximum-30').taxis, manifest.workloads.maximumV1.taxis);
  assert.equal(workloadById('overload-30-80').civilians, manifest.workloads.overload.civilians);
  assert.equal(manifest.workloads.overload.normalFpsGate, false);
  assert.throws(() => workloadById('normal-99'));
});

test('budgets are the fixed manifest values, not local recalibrations', () => {
  for (const column of ['laptop', 'desktop']) {
    const proposed = manifest.proposedBudgets[column];
    const used = FLEET_BUDGETS[column];
    assert.equal(used.frameP95Ms, proposed.frameP95Ms);
    assert.equal(used.frameP99Ms, proposed.frameP99Ms);
    assert.equal(used.mainThreadP95Ms, proposed.mainThreadP95Ms);
    assert.equal(used.authoritativeTickP95Ms, proposed.authoritativeTickP95Ms);
    assert.equal(used.rapierStepP95Ms, proposed.rapierStepP95Ms);
    assert.equal(used.gpuP95Ms, proposed.gpuP95Ms);
    assert.equal(used.inputToCommandP95Ms, proposed.inputToCommandP95Ms);
    assert.equal(
      used.simulationToWallRatioMinimum,
      manifest.proposedBudgets.simulationToActiveWallTimeMinimum,
    );
    assert.equal(
      used.learningEndToEndP95Ms,
      manifest.proposedBudgets.segmentCloseToProfileActivationP95Ms,
    );
    assert.equal(
      used.applicationLongTaskMaximumMs,
      manifest.proposedBudgets.normalSteadyStateApplicationLongTaskMaximumMs,
    );
  }
  assert.equal(manifest.budgetVersion, '203-initial-1');
});

test('the measured laptop identity selects the laptop column and nothing else', () => {
  assert.equal(
    hardwareColumn({
      model: '82YM',
      cpu: 'AMD Ryzen 7 7735U with Radeon Graphics',
      gpu: 'AMD Radeon(TM) Graphics',
    }),
    'laptop',
  );
  assert.equal(
    hardwareColumn({
      model: 'System Product Name',
      cpu: 'AMD Ryzen 9 7950X3D',
      gpu: 'AMD Radeon RX 7900 XTX',
    }),
    'desktop',
  );
  assert.throws(() => hardwareColumn({ model: 'unknown', cpu: 'unknown', gpu: 'unknown' }));
  assert.equal(manifest.hardware.laptop.measurementStatus, 'SKIPPED_USER_WAIVER');
  assert.equal(
    manifest.acceptance.waiverScope,
    '203 laptop bootstrap only; no waiver of later gameplay, cold-start, soak or release gates.',
  );
});

test('a normal workload within the laptop budgets has no failure', () => {
  assert.deepEqual(evaluateRun(base()), []);
});

test('every absolute budget and structural guarantee fails loudly', () => {
  const cases: [Partial<RunVerdictInput>, string][] = [
    [{ frameP95Ms: 35.5 }, 'frameP95Ms'],
    [{ frameP99Ms: 50.5 }, 'frameP99Ms'],
    [{ mainThreadP95Ms: 20.5 }, 'mainThreadP95Ms'],
    [{ authoritativeTickP95Ms: 8.5 }, 'authoritativeTickP95Ms'],
    [{ rapierStepP95Ms: 5.5 }, 'rapierStepP95Ms'],
    [{ gpuP95Ms: 28.5 }, 'gpuP95Ms'],
    [{ inputToCommandP95Ms: 80.5 }, 'inputToCommandP95Ms'],
    [{ learningEndToEndP95Ms: 2000.5 }, 'learningEndToEndP95Ms'],
    [{ simulationToWallRatio: 0.979 }, 'simulationToWallRatio'],
    [{ applicationLongTaskMaximumMs: 51 }, 'applicationLongTaskMaximumMs'],
    [{ physicalVehicles: 69 }, 'physicalVehicles'],
    [{ offscreenVehiclesRetained: false }, 'offscreenVehiclesRetained'],
    [{ status: 'overload' }, 'fixedTickStatus'],
    [{ overloads: 1 }, 'overloads'],
    [{ cleanupLeaked: true }, 'cleanupLeaked'],
    [{ contacts: 0 }, 'contacts'],
    [{ aggressiveVehicles: 0 }, 'aggressiveVehicles'],
    [{ prudentVehicles: 0 }, 'prudentVehicles'],
    [{ learningSegments: 0 }, 'learningSegments'],
  ];
  for (const [patch, metric] of cases) {
    const failures = evaluateRun(base(patch));
    assert.equal(failures.length, 1, `${metric} should be the only failure`);
    assert.equal(failures[0]!.metric, metric);
  }
});

test('the desktop column is stricter and cannot be borrowed by the laptop probe', () => {
  const laptopComfortable = base({ frameP95Ms: 25, mainThreadP95Ms: 15 });
  assert.deepEqual(evaluateRun(laptopComfortable), []);
  const desktop = evaluateRun({ ...laptopComfortable, row: 'desktop' });
  assert.deepEqual(desktop.map((failure) => failure.metric).sort(), [
    'frameP95Ms',
    'frameP99Ms',
    'mainThreadP95Ms',
  ]);
});

test('the stress probe reports FPS findings without gating normal V1', () => {
  const stress = base({ workload: 'overload-30-80', expectedVehicles: 110, physicalVehicles: 110 });
  const slow = { ...stress, frameP95Ms: 90, frameP99Ms: 140, authoritativeTickP95Ms: 22 };
  assert.deepEqual(stressFindings(slow), []);
  assert.ok(evaluateRun(slow).length >= 3);
  assert.deepEqual(
    stressFindings({ ...slow, contacts: 0 }).map((failure) => failure.metric),
    ['contacts'],
  );
  assert.deepEqual(
    stressFindings({ ...slow, physicalVehicles: 109 }).map((failure) => failure.metric),
    ['physicalVehicles'],
  );
});

test('reproducibility keeps every repeat and flags real spread', () => {
  const rows = [10, 11, 10.5, 12, 10].map((value) => ({
    frameP50Ms: value / 2,
    frameP95Ms: value,
    frameP99Ms: value * 1.4,
    mainThreadP95Ms: value / 3,
    authoritativeTickP95Ms: value / 5,
    rapierStepP95Ms: value / 8,
    gpuP95Ms: null,
    inputToCommandP95Ms: value * 2,
    learningEndToEndP95Ms: value * 5,
  }));
  const summaries = summarizeRepeats(rows);
  const frame = summaries.find((entry) => entry.metric === 'frameP95Ms')!;
  assert.equal(frame.repeats, 5);
  assert.equal(frame.median, 10.5);
  assert.equal(frame.minimum, 10);
  assert.equal(frame.maximum, 12);
  assert.equal(frame.relativeSpread, 0.19);
  assert.deepEqual(reproducibilityFindings(summaries, 0.25), []);
  const strict = reproducibilityFindings(summaries, 0.1);
  assert.equal(strict.length, 5);
  assert.ok(strict.some((entry) => entry.startsWith('frameP95Ms')));
  assert.ok(!strict.some((entry) => entry.startsWith('rapierStepP95Ms')));
  /* Sub-millisecond jitter cannot fail the gate even when it is relatively large. */
  const noise = summarizeRepeats(
    [0.2, 0.3, 0.25, 0.22, 0.28].map((value) => ({
      frameP50Ms: value,
      frameP95Ms: value,
      frameP99Ms: value,
      mainThreadP95Ms: value,
      authoritativeTickP95Ms: value,
      rapierStepP95Ms: value,
      gpuP95Ms: null,
      inputToCommandP95Ms: value,
      learningEndToEndP95Ms: value,
    })),
  );
  assert.deepEqual(reproducibilityFindings(noise, 0.1), []);
  assert.equal(
    summaries.find((entry) => entry.metric === 'gpuP95Ms'),
    undefined,
  );
});
