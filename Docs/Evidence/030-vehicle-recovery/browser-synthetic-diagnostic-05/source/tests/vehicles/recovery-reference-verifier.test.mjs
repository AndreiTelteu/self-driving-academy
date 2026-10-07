import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyRecordEnvelope, channels } from '../browser/vehicle-recovery/verify-records.mjs';
const digest = 'a'.repeat(64),
  t = '2026-10-06T12:00:00.000Z';
function fixture() {
  const source = [
    'tests/browser/vehicle-recovery-reference.mjs',
    'tests/browser/vehicle-recovery/verify-reference.mjs',
    'tests/browser/vehicle-recovery/verify-records.mjs',
    'tests/browser/vehicle-recovery/road-fixture.ts',
    'tests/vehicles/recovery-reference-verifier.test.mjs',
    'tests/vehicles/controller-reference.ts',
    'scripts/register-typescript.mjs',
    'package.json',
    'package-lock.json',
    'Docs/performance-budgets.json',
    'src/world/parser.ts',
    'src/world/lane-graph.ts',
    'src/vehicles/controller.ts',
    'src/vehicles/rapier/index.ts',
    'src/vehicles/damage-state.ts',
  ];
  const manifest = {
    root: 'fixture',
    expectedCommit: 'ad32',
    startedAt: t,
    archivedAt: t,
    sourceHash: digest,
    inputs: source.map((path) => ({ path })),
    native: { archiveRelativePath: 'native/rapier.mjs', bytes: 100, sha256: digest },
    protocol: {
      populations: [70, 110],
      pairs: 5,
      warmupTicks: 180,
      measuredTicks: 600,
      hz: 60,
      observerOrder: 'even OFF/ON; odd ON/OFF',
      samples:
        'ON600 whole/controllerIncremental/nativeStep/nativeQuery/nativeBridge/nativeTotal; OFF null',
      checkpointTicks: [240, 300, 360, 420, 480, 540, 600, 660, 720, 780],
      memoryScope: 'raw V8 heap proxy endpoints only, no total/native RAM claim',
      fixture:
        'alternating real sedan/compact, existing mechanics; all actors native; authored contact geometry',
    },
  };
  const started = {
    protocol: '030-before-v1',
    implementationPresent: false,
    expectedCommit: manifest.expectedCommit,
    root: manifest.root,
    startedAt: t,
  };
  const first = { firstWorldAt: t };
  const complete = {
    status: 'PASS',
    runCount: 20,
    errors: null,
    startedAt: t,
    archivedAt: t,
    completedAt: t,
  };
  const runs = Array.from({ length: 20 }, (_, ordinal) => {
    const count = ordinal < 10 ? 70 : 110;
    const m = {
      classId: 'sedan',
      version: 'actual',
      massKg: 1400,
      appliedEngineForceN: [0, 0, 0, 0],
      appliedSteeringRadians: [0, 0, 0, 0],
      wheelBrakeImpulseLimitNs: [1, 1, 1, 1],
    };
    return {
      count,
      startedAt: t,
      completedAt: t,
      physicalDigest: digest,
      controlDigest: digest,
      nativeInputDigest: digest,
      checkpoints: [{ physicalHash: digest, controlHash: digest, nativeHash: digest }],
      initialMechanics: Array.from({ length: count }, () => structuredClone(m)),
      finalMechanics: Array.from({ length: count }, () => structuredClone(m)),
      observer: true,
      raw: Object.fromEntries(channels.map((k) => [k, Array(600).fill(1)])),
      summaries: Object.fromEntries(channels.map((k) => [k, { p50: 1, p95: 1, p99: 1 }])),
    };
  });
  const files = runs.map((_, i) => 'run-' + String(i).padStart(2, '0') + '.json');
  return { manifest, started, first, complete, runs, files };
}
const verify = (f) =>
  verifyRecordEnvelope(f.manifest, f.started, f.first, f.complete, f.runs, f.files);
test('bounded envelope accepts its complete positive control then rejects missing/nonfinite samples and forged summary', () => {
  const f = fixture();
  verify(f);
  for (const mutate of [
    (f) => f.runs[3].raw.wholeMs.pop(),
    (f) => (f.runs[3].raw.wholeMs[7] = NaN),
    (f) => (f.runs[3].summaries.wholeMs.p95 = 2),
  ]) {
    const copy = structuredClone(f);
    mutate(copy);
    assert.throws(() => verify(copy));
  }
});
test('rejects partial inventory, failure markers, source omission and terminal chronology', () => {
  for (const mutate of [
    (f) => f.files.pop(),
    (f) => f.files.push('failure.json'),
    (f) => f.manifest.inputs.pop(),
    (f) => (f.complete.completedAt = '2026-10-06T11:59:59Z'),
    (f) => (f.started.startedAt = 'bad'),
    (f) => (f.manifest.protocol.measuredTicks = 599),
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => verify(f));
  }
});
test('rejects escaped native path, malformed SHA and nonfinite mechanics', () => {
  for (const mutate of [
    (f) => (f.manifest.native.archiveRelativePath = '../rapier.mjs'),
    (f) => (f.runs[0].checkpoints[0].physicalHash = 'bad'),
    (f) => (f.runs[0].initialMechanics[0].massKg = Infinity),
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => verify(f));
  }
});
