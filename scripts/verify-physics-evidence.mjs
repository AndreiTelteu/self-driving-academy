import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
const report = JSON.parse(await readFile('Evidence/021/desktop-webgpu.json', 'utf8'));
assert.equal(report.identity.fixtureVersion, '021-many-contact-v1');
assert.equal(report.identity.physicsVersion, '0.21.0');
assert.equal(report.identity.budgetVersion, '203-initial-1');
assert.equal(report.identity.backend, 'WEBGPU');
assert.equal(report.gameplayGate, 'NOT_VALIDATED');
assert.equal(report.runs.length, 10);
assert.equal(report.physicsRuns.length, 10);
const hash = createHash('sha256');
const historicalInputs = [];
for (const input of report.identity.inputs) {
  const current = await readFile(input);
  const snapshot = 'Evidence/021/performance-budgets-at-capture.json';
  const bytes =
    input === 'Docs/performance-budgets.json' && existsSync(snapshot)
      ? await readFile(snapshot)
      : current;
  if (!bytes.equals(current))
    historicalInputs.push({
      input,
      snapshot,
      reason:
        'Subsequent admission subcontracts; measured protocol/thresholds preserved in snapshot',
    });
  hash.update(input).update(bytes);
}
assert.equal(
  hash.digest('hex'),
  report.identity.sourceHash,
  'Measured code or capture-time manifest bytes changed',
);
const manifest = report.identity.hardware.buildManifest;
assert.equal(manifest.sourceHash, report.identity.sourceHash);
assert.equal(manifest.commit, report.identity.commit);
assert.equal(
  createHash('sha256').update(JSON.stringify(manifest.artifacts)).digest('hex'),
  manifest.artifactHash,
);
const artifactRoot = resolve('.pbi-validation-021/build');
for (const item of manifest.artifacts) {
  const path = resolve(artifactRoot, item.path);
  assert(path.startsWith(artifactRoot + sep));
  assert((await stat(path)).isFile());
  const bytes = await readFile(path);
  assert.equal(bytes.length, item.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
}
assert.deepEqual(
  await readFile('Evidence/021/pre-physics-218-baseline.json'),
  await readFile('Evidence/218/desktop-webgpu.json'),
);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (let repeat = 1; repeat <= 5; repeat++) {
  const pair = report.runs.filter((run) => run.repeat === repeat);
  assert.equal(pair.length, 2);
  assert(pair.some((run) => run.enabled) && pair.some((run) => !run.enabled));
}
for (const run of report.runs) {
  assert(run.warmupMs >= 30000 && run.activeDurationMs >= 120000);
  assert(run.collector.complete && run.collector.dropped === 0);
  assert.equal(run.simulation.overloads, 0);
  assert(run.simulation.ratio >= 0.98);
  assert(run.referenceFrameMs.p95 <= 18.5 && run.referenceFrameMs.p99 <= 25);
  assert(run.referenceCpuMs.p95 <= 10);
  if (run.enabled) assert(run.collector.metrics.tickCpuMs.distribution.p95 <= 5.5);
  assert.equal(run.resources.bodies, 134);
  assert.equal(run.resources.colliders, 138);
  assert.equal(run.resources.vehicles, 70);
  assert(!run.longTasks.overflow);
  if (run.longTasks.supported) assert(run.longTasks.maximumMs <= 50);
}
for (const run of report.physicsRuns) {
  assert.equal(run.counts.vehicles, 70);
  assert.equal(run.ticks, 7200);
  assert(run.minContacts >= 100 && run.samplesContacts >= 119);
  assert(run.costs.step.p95 <= 3);
  assert.equal(run.queryCountPerTick, 70);
  assert.equal(run.representativeBridgeCallsPerTick, 1610);
}
assert.equal(report.physicsConfig.worlds, 1);
assert.equal(report.physicsConfig.hz, 60);
assert.equal(report.physicsConfig.solverIterations, 8);
assert.equal(report.physicsConfig.ccdSubsteps, 4);
const active = report.runs.filter((run) => run.enabled);
const physical = report.physicsRuns.filter((run) => run.enabled);
const old = JSON.parse(await readFile('Evidence/021/pre-physics-218-baseline.json', 'utf8'));
const summary = {
  capturedAt: report.capturedAt,
  commit: report.identity.commit,
  sourceHash: report.identity.sourceHash,
  artifactHash: manifest.artifactHash,
  artifactCount: manifest.artifacts.length,
  role: '021 prototype desktop; not full-game or laptop gate',
  stepP95MedianMs: median(physical.map((r) => r.costs.step.p95)),
  controllerP95MedianMs: median(physical.map((r) => r.costs.controller.p95)),
  queryP95MedianMs: median(physical.map((r) => r.costs.query.p95)),
  bridgeReadbackP95MedianMs: median(physical.map((r) => r.costs.bridgeReadback.p95)),
  mainThreadP95MedianMs: median(active.map((r) => r.referenceCpuMs.p95)),
  frameP95MedianMs: median(active.map((r) => r.referenceFrameMs.p95)),
  frameP99MedianMs: median(active.map((r) => r.referenceFrameMs.p99)),
  previousKernelMainThreadP95MedianMs: median(
    old.runs.filter((r) => r.enabled).map((r) => r.referenceCpuMs.p95),
  ),
  mainThreadIncrementP95Ms:
    median(active.map((r) => r.referenceCpuMs.p95)) -
    median(old.runs.filter((r) => r.enabled).map((r) => r.referenceCpuMs.p95)),
  collectorP95DeltasMs: report.overhead.map((r) => r.cpuP95DeltaMs),
  minSolverContacts: Math.min(...report.physicsRuns.map((r) => r.minContacts)),
  maxSolverContacts: Math.max(...report.physicsRuns.map((r) => r.maxContacts)),
  overloads: 0,
  historicalInputs,
  gpuTimerMs: null,
  exactWasmMemoryBytes: null,
  verification:
    'PASS: source/build bytes, protocol, capacities, physics and frame prototype budgets',
};
await writeFile('Evidence/021/summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
