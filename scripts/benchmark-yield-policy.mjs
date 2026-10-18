// Native execution requires the parent's exclusive CPU grant. Authoring is not a capture.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, platform, release } from 'node:os';
import { runYieldNative } from '../tests/autonomy/yield-policy-native-fixture.ts';
import { referenceYield } from '../tests/autonomy/yield-policy-reference.ts';

const phase = process.argv[2];
assert.equal(
  phase,
  'before',
  'AFTER adapter requires parent review of the eventual production contract',
);
const folder = 'Docs/Evidence/052-yield-policy',
  archive = `${folder}/source-before`,
  output = `${folder}/before.json`;
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
};
assert.equal(await exists('src/autonomy/yield-policy.ts'), false, 'Production052 must be absent');
assert.equal(await exists(output), false, 'Immutable report exists');
assert.equal(await exists(archive), false, 'Immutable archive exists');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((p) => p.replaceAll('\\', '/'));
files.push(
  'scripts/benchmark-yield-policy.mjs',
  'tests/autonomy/yield-policy-reference.ts',
  'tests/autonomy/yield-policy-native-fixture.ts',
  'tests/world/priority-rules-fixture.ts',
  'tests/world/intersection-conflicts-fixture.ts',
  'tests/world/negative-fixtures.ts',
  'tests/vehicles/controller-reference.ts',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
  'Docs/yield-policy.md',
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
  const target = `${archive}/${path}`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
const sourceHash = source.digest('hex'),
  nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
  nativeBytes = await readFile(nativePath),
  nativeArchive = `${archive}/native/rapier.mjs`;
await mkdir(dirname(nativeArchive), { recursive: true });
await writeFile(nativeArchive, nativeBytes);
const nativeArtifact = {
  path: nativePath,
  archive: relative(folder, nativeArchive).replaceAll('\\', '/'),
  bytes: nativeBytes.length,
  sha256: hash(nativeBytes),
};
const report = {
  status: 'CAPTURE_IN_PROGRESS',
  phase,
  sourceHash,
  inputs,
  nativeArtifact,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  capturedAt: new Date().toISOString(),
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  budgetVersion: '203-initial-1',
  fixtureVersion: '052-native-crossing-owner-prediction-v1',
  scope:
    'Real024/038/Rapier driving with two active crossing actors and68/108 parked physically simulated actors. Policy timing is one active subject; this is not110 simultaneous policy decisions or hardware FPS. Owner candidate prediction/commitment is explicit and unchanged between phases.',
  calibration: [],
  runs: [],
  parity: null,
  gates: null,
};
const distribution = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Object.fromEntries(
    [50, 95, 99].map((p) => [`p${p}`, sorted[Math.floor(((sorted.length - 1) * p) / 100)]]),
  );
};
const compact = (capture) => {
  const { costs, commands, finalBodies, ...rest } = capture;
  assert.equal(capture.cleanup.controller.vehicles, 0);
  assert.equal(capture.cleanup.priority.vehicles, 0);
  assert.equal(capture.cleanup.bodies.entities, 0);
  assert.equal(capture.cleanup.collision.colliders, 0);
  return {
    ...rest,
    commandHash: hash(JSON.stringify(commands)),
    finalPhysicalHash: hash(JSON.stringify(finalBodies)),
    finalCrossingBodies: finalBodies.slice(0, 2),
    observerSamples: costs.length,
    observerPayloadBytes: costs.length * 3 * 8,
    timing: costs.length
      ? {
          tickMs: distribution(costs.map((c) => c.tickMs)),
          stepMs: distribution(costs.map((c) => c.stepMs)),
          policyMs: distribution(
            costs.filter((_, index) => (181 + index) % 6 === 0).map((c) => c.policyMs),
          ),
        }
      : null,
  };
};
const base = {
  otherDistanceM: 20,
  otherSpeedMps: 3,
  otherThrottle: 0,
  classId: 'sedan',
  thresholdS: 3,
};
try {
  // Physical attempts are preserved even if no risky contact occurs. No threshold changes to pass.
  for (const classId of ['sedan', 'compact'])
    for (const otherDistanceM of [14, 18, 22])
      for (const thresholdS of [0.2, 3]) {
        const capture = await runYieldNative({
          ...base,
          classId,
          otherDistanceM,
          otherThrottle: 1,
          thresholdS,
          measured: false,
        });
        report.calibration.push(compact(capture));
      }
  const auto = await runYieldNative({ ...base, thresholdS: 0.2, mode: 'AUTO' }),
    manual = await runYieldNative({ ...base, thresholdS: 0.2, mode: 'MANUAL' });
  const manualCommandValues = (capture) =>
    capture.commands.map((pair) =>
      pair.map((command) => {
        const values = { ...command };
        delete values.source;
        return values;
      }),
    );
  assert.deepEqual(auto.finalBodies, manual.finalBodies, 'Manual/AUTO identical mechanics');
  assert.deepEqual(manualCommandValues(auto), manualCommandValues(manual));
  report.parity = {
    status: 'PASS',
    nativePoseHash: hash(JSON.stringify(auto.finalBodies)),
    effectiveCommandHash: hash(JSON.stringify(manualCommandValues(auto))),
  };
  for (const count of [70, 110])
    for (let pair = 0; pair < 5; pair++)
      for (const measured of pair % 2 ? [true, false] : [false, true]) {
        const capture = await runYieldNative({
          ...base,
          count,
          measured,
          evaluator: referenceYield,
        });
        report.runs.push({
          count,
          pair,
          measured,
          warmupTicks: 180,
          measuredTicks: 600,
          ...compact(capture),
        });
      }
  for (const count of [70, 110]) {
    const selected = report.runs.filter((r) => r.count === count);
    assert.equal(new Set(selected.map((r) => r.finalPhysicalHash)).size, 1);
    assert.equal(new Set(selected.map((r) => r.commandDigest)).size, 1);
  }
  const accepted = report.calibration.some((r) =>
      r.trace.some((t) => t.decision.action === 'ACCEPT'),
    ),
    refused = report.calibration.some((r) => r.trace.some((t) => t.decision.action === 'REFUSE')),
    riskyCollision = report.calibration.some(
      (r) => r.options.thresholdS === 0.2 && r.collisionTick !== null && r.maxImpulseNs > 0,
    ),
    exposure = report.calibration.some((r) =>
      r.evidence.some((e) => e.kind === 'CROSSED_WITH_PRIORITY_EXPOSURE'),
    );
  report.gates = { accepted, refused, riskyCollision, exposure, manualAutoParity: true };
  report.status = Object.values(report.gates).every(Boolean)
    ? 'BASELINE_CAPTURED_CALIBRATION_PASS'
    : 'CALIBRATION_PENDING';
} catch (error) {
  report.status = 'FAILED';
  report.error = { name: error.name, message: error.message, stack: error.stack };
} finally {
  for (const input of inputs)
    assert.equal(hash(await readFile(input.path)), input.sha256, 'Sources changed during capture');
  assert.equal(hash(await readFile(nativePath)), nativeArtifact.sha256);
  assert.equal(await exists('src/autonomy/yield-policy.ts'), false);
  await writeFile(output, JSON.stringify(report, null, 2), { flag: 'wx' });
}
console.log(
  JSON.stringify({
    status: report.status,
    sourceHash,
    gates: report.gates,
    runs: report.runs.length,
    calibration: report.calibration.length,
  }),
);
if (report.status !== 'BASELINE_CAPTURED_CALIBRATION_PASS') process.exitCode = 1;
