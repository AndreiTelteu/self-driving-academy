// Run only after a dedicated CPU grant; preserves the original BEFORE protocol and every attempt.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, platform, release } from 'node:os';
import { runYieldNative } from '../tests/autonomy/yield-policy-native-fixture.ts';
import { productionYieldReference } from '../tests/autonomy/yield-policy-production-adapter.ts';
const folder = 'Docs/Evidence/052-yield-policy',
  output = `${folder}/after.json`,
  archive = `${folder}/source-after`;
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
assert.equal(await exists(output), false, 'Immutable AFTER report exists');
assert.equal(await exists(archive), false, 'Immutable AFTER archive exists');
const before = JSON.parse(await readFile(`${folder}/before.json`, 'utf8'));
assert.equal(before.status, 'BASELINE_CAPTURED_CALIBRATION_PASS');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
// These files are the unchanged chronological physical/reference protocol, not a replacement baseline.
for (const path of [
  'tests/autonomy/yield-policy-native-fixture.ts',
  'tests/autonomy/yield-policy-reference.ts',
  'tests/world/priority-rules-fixture.ts',
  'tests/world/intersection-conflicts-fixture.ts',
  'tests/vehicles/controller-reference.ts',
]) {
  const proof = before.inputs.find((entry) => entry.path === path);
  assert(proof);
  assert.equal(hash(await readFile(path)), proof.sha256, 'Original fixture/reference changed');
}
const files = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((p) => p.replaceAll('\\', '/'));
files.push(
  'scripts/benchmark-yield-policy-after.mjs',
  'tests/autonomy/yield-policy-native-fixture.ts',
  'tests/autonomy/yield-policy-reference.ts',
  'tests/autonomy/yield-policy-production-adapter.ts',
  'tests/world/priority-rules-fixture.ts',
  'tests/world/intersection-conflicts-fixture.ts',
  'tests/world/negative-fixtures.ts',
  'tests/vehicles/controller-reference.ts',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
files.sort();
const source = createHash('sha256'),
  inputs = [];
await mkdir(archive, { recursive: true });
await writeFile(`${archive}/.gitattributes`, '* -text\n');
for (const path of files) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  await mkdir(dirname(`${archive}/${path}`), { recursive: true });
  await writeFile(`${archive}/${path}`, bytes);
}
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
  nativeBytes = await readFile(nativePath);
assert.equal(hash(nativeBytes), before.nativeArtifact.sha256);
await mkdir(`${archive}/native`, { recursive: true });
await writeFile(`${archive}/native/rapier.mjs`, nativeBytes);
const report = {
  status: 'CAPTURE_IN_PROGRESS',
  phase: 'after',
  capturedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: source.digest('hex'),
  inputs,
  beforeSourceHash: before.sourceHash,
  nativeArtifact: { ...before.nativeArtifact, archive: 'source-after/native/rapier.mjs' },
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  budgetVersion: '203-initial-1',
  fixtureVersion: before.fixtureVersion,
  scope: before.scope,
  calibration: [],
  runs: [],
  parity: null,
  comparisons: [],
};
const distribution = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Object.fromEntries(
    [50, 95, 99].map((p) => [`p${p}`, sorted[Math.floor(((sorted.length - 1) * p) / 100)]]),
  );
};
const compact = ({ costs, commands, finalBodies, ...capture }) => ({
  ...capture,
  commandHash: hash(JSON.stringify(commands)),
  finalPhysicalHash: hash(JSON.stringify(finalBodies)),
  finalCrossingBodies: finalBodies.slice(0, 2),
  observerSamples: costs.length,
  observerPayloadBytes: costs.length * 3 * 8,
  timing: costs.length
    ? {
        tickMs: distribution(costs.map((c) => c.tickMs)),
        stepMs: distribution(costs.map((c) => c.stepMs)),
        policyMs: distribution(costs.filter((_, i) => (181 + i) % 6 === 0).map((c) => c.policyMs)),
      }
    : null,
});
const base = {
  otherDistanceM: 20,
  otherSpeedMps: 3,
  otherThrottle: 0,
  classId: 'sedan',
  thresholdS: 3,
  evaluator: productionYieldReference,
};
try {
  for (const classId of ['sedan', 'compact'])
    for (const otherDistanceM of [14, 18, 22])
      for (const thresholdS of [0.2, 3]) {
        const capture = compact(
          await runYieldNative({
            ...base,
            classId,
            otherDistanceM,
            otherThrottle: 1,
            thresholdS,
            measured: false,
          }),
        );
        const reference = before.calibration[report.calibration.length];
        report.calibration.push(capture);
        for (const key of [
          'acceptedTick',
          'firstEntryTick',
          'clearTick',
          'collisionTick',
          'maxImpulseNs',
          'trace',
          'evidence',
          'commandHash',
          'finalPhysicalHash',
          'commandDigest',
        ])
          assert.deepEqual(capture[key], reference[key], `Physical calibration mismatch:${key}`);
      }
  const auto = await runYieldNative({ ...base, thresholdS: 0.2, mode: 'AUTO' }),
    manual = await runYieldNative({ ...base, thresholdS: 0.2, mode: 'MANUAL' });
  const commandValues = (capture) =>
    capture.commands.map((pair) =>
      pair.map((command) => {
        const values = { ...command };
        delete values.source;
        return values;
      }),
    );
  assert.deepEqual(auto.finalBodies, manual.finalBodies);
  assert.deepEqual(commandValues(auto), commandValues(manual));
  report.parity = {
    status: 'PASS',
    nativePoseHash: hash(JSON.stringify(auto.finalBodies)),
    effectiveCommandHash: hash(JSON.stringify(commandValues(auto))),
  };
  assert.deepEqual(report.parity, before.parity);
  for (const count of [70, 110])
    for (let pair = 0; pair < 5; pair++)
      for (const measured of pair % 2 ? [true, false] : [false, true]) {
        const capture = compact(await runYieldNative({ ...base, count, measured })),
          reference = before.runs[report.runs.length];
        report.runs.push({
          count,
          pair,
          measured,
          warmupTicks: 180,
          measuredTicks: 600,
          ...capture,
        });
        for (const key of [
          'trace',
          'evidence',
          'commandHash',
          'commandDigest',
          'finalPhysicalHash',
          'acceptedTick',
          'firstEntryTick',
          'clearTick',
          'collisionTick',
        ])
          assert.deepEqual(capture[key], reference[key], `Native workload mismatch:${key}`);
        assert.equal(capture.cleanup.controller.vehicles, 0);
        assert.equal(capture.cleanup.priority.vehicles, 0);
        assert.equal(capture.cleanup.bodies.entities, 0);
        assert.equal(capture.cleanup.collision.colliders, 0);
        if (measured) {
          if (count === 70) assert(capture.timing.tickMs.p95 <= 5.5);
          report.comparisons.push({
            count,
            pair,
            tickDeltaP95Ms: capture.timing.tickMs.p95 - reference.timing.tickMs.p95,
            policyDeltaP95Ms: capture.timing.policyMs.p95 - reference.timing.policyMs.p95,
            regression:
              capture.timing.tickMs.p95 > reference.timing.tickMs.p95 * 1.1 &&
              capture.timing.tickMs.p95 - reference.timing.tickMs.p95 > 1,
          });
        }
      }
  for (const count of [70, 110])
    assert(report.comparisons.filter((r) => r.count === count && r.regression).length < 3);
  report.status = 'AFTER_NATIVE_PASS';
} catch (error) {
  report.status = 'FAILED';
  report.error = { name: error.name, message: error.message, stack: error.stack };
} finally {
  for (const entry of inputs) assert.equal(hash(await readFile(entry.path)), entry.sha256);
  await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx' });
}
console.log(
  JSON.stringify({
    status: report.status,
    sourceHash: report.sourceHash,
    runs: report.runs.length,
  }),
);
if (report.status !== 'AFTER_NATIVE_PASS') process.exitCode = 1;
