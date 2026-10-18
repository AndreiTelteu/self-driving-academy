import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rawDistribution,
  validateTimingArm,
  validateCalibrationArm,
  validateCaptureInventory,
  validateCalibrationNative,
} from './protocol';
function arm(warm: number, seconds: number, cars: number) {
  const ticks = seconds * 60,
    frame = Array(ticks).fill(1000 / 60);
  const raw = {
    frame,
    main: Array(ticks).fill(2),
    tick: Array(ticks).fill(1),
    step: Array(ticks).fill(0.7),
    policy: Array(ticks).fill(0.1),
  };
  const start = 1000 + warm * 1000,
    previous = start - 1;
  const span = frame.reduce((sum, value) => sum + value, 0);
  return {
    warmupSeconds: warm,
    measuredSeconds: seconds,
    overloadCount: 0,
    memory: { numericChannelBytes: 1248000, cars },
    raw,
    stats: Object.fromEntries(
      Object.entries(raw).map(([name, values]) => [name, rawDistribution(values)]),
    ),
    measurement: {
      originMs: 1000,
      windowStartMs: start,
      windowEndMs: start + seconds * 1000,
      previousFrameMs: previous,
      firstFrameMs: previous + frame[0]!,
      lastFrameMs: previous + span,
      lastWallMs: previous + span,
      samples: ticks,
      nativeTicks: ticks,
    },
    activeWallSeconds: (previous + span - 1000) / 1000,
    simulationToActiveWallTime: seconds / (span / 1000),
  };
}
test('052 raw window rejects shortened RAF even with valid native count and declared ratio', () => {
  const value = arm(30, 120, 70);
  assert.doesNotThrow(() => validateTimingArm(value));
  const raw = { ...value.raw, frame: [5, 7, 8], main: [1, 2, 3] };
  assert.throws(() =>
    validateTimingArm({
      ...value,
      raw,
      stats: { ...value.stats, frame: rawDistribution(raw.frame), main: rawDistribution(raw.main) },
      measurement: { ...value.measurement, samples: 3 },
    }),
  );
  assert.throws(() =>
    validateTimingArm({ ...value, raw: { ...value.raw, tick: value.raw.tick.slice(1) } }),
  );
  assert.throws(() =>
    validateTimingArm({
      ...value,
      measurement: { ...value.measurement, lastFrameMs: value.measurement.lastFrameMs + 1000 },
    }),
  );
  assert.throws(() => validateTimingArm({ ...value, simulationToActiveWallTime: 0.99 }));
  assert.throws(() =>
    validateTimingArm({ ...value, stats: { ...value.stats, frame: { p95: 0 } } }),
  );
  assert.throws(() => validateTimingArm({ ...value, overloadCount: 1 }));
});
test('052 calibration validates all five raw channels and exact 780 ticks', () => {
  const value = arm(0, 13, 2);
  assert.doesNotThrow(() => validateCalibrationArm(value));
  assert.throws(() =>
    validateCalibrationArm({ ...value, raw: { ...value.raw, policy: value.raw.policy.slice(1) } }),
  );
  assert.throws(() => validateCalibrationArm({ ...value, raw: { ...value.raw, frame: [NaN] } }));
  assert.throws(() =>
    validateCalibrationArm({ ...value, memory: { ...value.memory, numericChannelBytes: 0 } }),
  );
  assert.throws(() => validateCalibrationArm({ ...value, stats: { ...value.stats, step: {} } }));
});
test('052 failed or incomplete sibling smoke cannot coexist with final acceptance', () => {
  const make = (backend: string, full: boolean) => ({
    name: backend + (full ? '-full' : '-smoke'),
    files: ['started.json', 'terminal.json', 'report.json'],
    start: { captureId: backend + full, backend, full, sourceHash: 'source' },
    terminal: { captureId: backend + full, status: 'SAVED_PENDING_VERIFICATION', arms: 14 },
  });
  const full = [make('WEBGPU', true), make('WEBGL2', true)],
    smoke = make('WEBGPU', false);
  assert.doesNotThrow(() => validateCaptureInventory([...full, smoke], 'source'));
  assert.throws(() =>
    validateCaptureInventory(
      [...full, { ...smoke, files: [...smoke.files, 'failure.json'] }],
      'source',
    ),
  );
  assert.throws(() =>
    validateCaptureInventory([...full, { ...smoke, terminal: undefined }], 'source'),
  );
  assert.throws(() =>
    validateCaptureInventory(
      [...full, { ...smoke, terminal: { ...smoke.terminal, captureId: 'other' } }],
      'source',
    ),
  );
});

test('052 calibration rejects a duplicate/missing native observation or checkpoint', () => {
  const value = {
    nativeReadbacks: Array.from({ length: 130 }, (_, index) => ({ tick: (index + 1) * 6 })),
    checkpoints: Array.from({ length: 6 }, (_, index) => ({ tick: (index + 1) * 120 })),
  };
  assert.doesNotThrow(() => validateCalibrationNative(value));
  assert.throws(() =>
    validateCalibrationNative({ ...value, nativeReadbacks: value.nativeReadbacks.slice(1) }),
  );
  assert.throws(() =>
    validateCalibrationNative({
      ...value,
      nativeReadbacks: [{ tick: 12 }, ...value.nativeReadbacks.slice(1)],
    }),
  );
  assert.throws(() =>
    validateCalibrationNative({ ...value, checkpoints: value.checkpoints.slice(1) }),
  );
});
