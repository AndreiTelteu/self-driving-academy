import assert from 'node:assert/strict';
export const channels = [
  'wholeMs',
  'controllerIncrementalMs',
  'nativeStepMs',
  'nativeQueryMs',
  'nativeBridgeMs',
  'nativeTotalMs',
];
export function verifyRecordEnvelope(manifest, started, first, complete, runs, files) {
  assert.equal(manifest.phase, 'AFTER');
  assert.equal(manifest.originalBeforeSourceHash, 'e7e5241caa9ef9c5ac1a27460defc9de679a86de3c6a3287eb8409fe3e27d755');
  assert.equal(started.originalBeforeSourceHash, manifest.originalBeforeSourceHash);
  assert.deepEqual(manifest.protocol, {
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
  });
  const time = (value) => {
    const t = Date.parse(value);
    assert(Number.isFinite(t), 'Finite timestamp');
    return t;
  };
  assert.equal(started.phase, undefined);
  assert.equal(started.protocol, '030-after-v1');
  assert.equal(started.implementationPresent, true);
  assert.equal(started.expectedCommit, manifest.expectedCommit);
  assert.equal(started.root, manifest.root);
  assert.equal(started.startedAt, manifest.startedAt);
  assert(time(started.startedAt) <= time(manifest.archivedAt));
  assert(time(manifest.archivedAt) <= time(first.firstWorldAt));
  assert.equal(runs.length, 20);
  assert.equal(complete.runCount, 20);
  assert.equal(complete.status, 'PASS');
  assert.equal(complete.errors, null);
  assert.equal(complete.startedAt, manifest.startedAt);
  assert.equal(complete.archivedAt, manifest.archivedAt);
  assert(
    !files.some((f) => /failure|rejected|incomplete|partial/i.test(f)),
    'Failed/partial inventory',
  );
  assert.deepEqual(
    files.filter((f) => /^run-/.test(f)).sort(),
    Array.from({ length: 20 }, (_, i) => 'run-' + String(i).padStart(2, '0') + '.json'),
  );
  const required = [
    'tests/browser/vehicle-recovery-after.mjs',
    'tests/browser/vehicle-recovery/verify-after.mjs',
    'tests/browser/vehicle-recovery/verify-after-records.mjs',
    'src/vehicles/recovery-state.ts',
    'src/vehicles/recovery-port.ts',
    'src/vehicles/recovery-ledger.ts',
    'src/vehicles/recovery-road.ts',
    'src/app/vehicle-recovery-road.ts',
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
  for (const path of required)
    assert(
      manifest.inputs.some((r) => r.path === path),
      'Required source ' + path,
    );
  assert.equal(manifest.native.archiveRelativePath, 'native/rapier.mjs');
  assert(Number.isSafeInteger(manifest.native.bytes) && manifest.native.bytes > 0);
  const digest = (value) =>
    assert(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'SHA256 shape');
  digest(manifest.sourceHash);
  digest(manifest.native.sha256);
  for (const run of runs) {
    assert(time(first.firstWorldAt) <= time(run.startedAt));
    assert(time(run.startedAt) <= time(run.completedAt));
    assert(time(run.completedAt) <= time(complete.completedAt));
    for (const key of ['physicalDigest', 'controlDigest', 'nativeInputDigest']) digest(run[key]);
    for (const cp of run.checkpoints)
      for (const key of ['physicalHash', 'controlHash', 'nativeHash']) digest(cp[key]);
    const numericTree = (value) => {
      if (typeof value === 'number') assert(Number.isFinite(value));
      else if (value && typeof value === 'object')
        for (const child of Object.values(value)) numericTree(child);
    };
    numericTree(run.initialMechanics);
    numericTree(run.finalMechanics);
    assert.equal(run.initialMechanics.length, run.count);
    assert.equal(run.finalMechanics.length, run.count);
    for (const m of [...run.initialMechanics, ...run.finalMechanics]) {
      assert(['sedan', 'compact'].includes(m.classId));
      assert(typeof m.version === 'string');
      assert(Number.isFinite(m.massKg) && m.massKg > 0);
      for (const key of [
        'appliedEngineForceN',
        'appliedSteeringRadians',
        'wheelBrakeImpulseLimitNs',
      ])
        assert(Array.isArray(m[key]) && m[key].length === 4);
    }
    if (run.observer) {
      assert.deepEqual(Object.keys(run.raw).sort(), [...channels].sort());
      for (const key of channels) {
        const raw = run.raw[key];
        assert.equal(raw.length, 600);
        assert(raw.every((v) => Number.isFinite(v) && v >= 0));
        const sorted = [...raw].sort((a, b) => a - b);
        for (const [name, p] of [
          ['p50', 0.5],
          ['p95', 0.95],
          ['p99', 0.99],
        ])
          assert.equal(run.summaries[key][name], sorted[Math.ceil(600 * p) - 1]);
      }
    }
  }
}
