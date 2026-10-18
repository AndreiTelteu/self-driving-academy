// Read-only verification; never constructs native worlds or changes evidence.
import assert from 'node:assert/strict';
import { validateCurrentRaw } from '../../../tests/autonomy/yield-policy-current-proof.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

assert.equal(process.argv[2], '--capture=after-main029', 'Select the immutable capture explicitly');
const folder = new URL('./', import.meta.url);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (name) => JSON.parse(await readFile(new URL(name, folder), 'utf8'));
const raw = await readFile(new URL('after-main029.json', folder));
const report = JSON.parse(raw);
const before = await json('before.json');

assert.equal(report.status, 'AFTER_NATIVE_PASS');
assert.equal(report.beforeSourceHash, before.sourceHash);
assert.equal(report.fixtureVersion, before.fixtureVersion);
assert.equal(report.scope, before.scope);
assert(Date.parse(before.capturedAt) < Date.parse(report.capturedAt));
assert.equal(process.argv.length, 3);
assert.equal(report.requiredMain, 'ad32db9c609cce1132669c95312ae202a62b87ed');
execFileSync('git', ['merge-base', '--is-ancestor', report.requiredMain, report.commit]);
assert.equal(report.phase, 'after-current-main029');
assert.equal(report.worldsAttempted, 34);
assert.deepEqual(report.currentSourceGuardErrors, []);
for (const key of ['archiveStartedAt','sourceArchivedAt','capturedAt','firstWorldAt','endAt']) assert(Number.isFinite(Date.parse(report[key])));
assert(Date.parse(report.archiveStartedAt) <= Date.parse(report.sourceArchivedAt));
assert(Date.parse(report.sourceArchivedAt) <= Date.parse(report.capturedAt));
assert(Date.parse(report.capturedAt) <= Date.parse(report.firstWorldAt));
assert(Date.parse(report.firstWorldAt) <= Date.parse(report.endAt));
assert.equal(report.nativeArtifact.archive, 'source-after-main029/native/rapier.mjs');

async function archive(capture, prefix) {
  const digest = createHash('sha256');
  const paths = new Set();
  for (const entry of capture.inputs) {
    assert(!entry.path.includes('..') && !entry.path.includes('\\') && !entry.path.startsWith('/'));
    assert(!paths.has(entry.path)); paths.add(entry.path);
    const bytes = await readFile(new URL(`${prefix}/${entry.path}`, folder));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(sha(bytes), entry.sha256);
    digest.update(entry.path).update(bytes);
  }
  assert.equal(digest.digest('hex'), capture.sourceHash);
}
await archive(before, 'source-before');
await archive(report, 'source-after-main029');
for (const entry of report.inputs) assert.deepEqual(await readFile(entry.path), await readFile(new URL('source-after-main029/' + entry.path, folder)), 'CURRENT bytes changed');
assert.deepEqual(report.inputs.map(entry => entry.path), report.inputs.map(entry => entry.path).sort());
for (const name of ['tests/autonomy/yield-policy-native-fixture.ts',
  'tests/autonomy/yield-policy-reference.ts', 'tests/world/priority-rules-fixture.ts',
  'tests/world/intersection-conflicts-fixture.ts', 'tests/vehicles/controller-reference.ts']) {
  assert.equal(report.inputs.find((e) => e.path === name).sha256,
    before.inputs.find((e) => e.path === name).sha256);
}
const native = await readFile(new URL(report.nativeArtifact.archive, folder));
assert.equal(native.length, report.nativeArtifact.bytes);
assert.equal(native.length, 4340292);
assert.deepEqual(await readFile(report.nativeArtifact.installedPath), native);
assert.equal(sha(native), report.nativeArtifact.sha256);
assert.equal(sha(native), before.nativeArtifact.sha256);
assert.equal(report.calibration.length, 12);
assert.equal(report.runs.length, 20);
assert.deepEqual(report.parity, before.parity);
assert.equal(report.parity.status, 'PASS');
const physical = ['options', 'profileVersionId', 'trace', 'evidence', 'commandHash',
  'commandDigest', 'finalPhysicalHash', 'finalCrossingBodies', 'acceptedTick',
  'firstEntryTick', 'clearTick', 'collisionTick', 'maxImpulseNs', 'owned', 'cleanup'];
function compare(row, reference, expectedActors) {
  validateCurrentRaw(row, expectedActors);
  for (const key of physical) assert.deepEqual(row[key], reference[key], key);
  assert(row.trace.length <= 130);
  assert.equal(row.cleanup.bodies.entities, 0);
  assert.equal(row.cleanup.controller.vehicles, 0);
  assert.equal(row.cleanup.controller.targets, 0);
  assert.equal(row.cleanup.controller.projections, 0);
  assert.equal(row.cleanup.controller.retainedBatches, 0);
  assert.equal(row.cleanup.priority.vehicles, 0);
  assert.equal(row.cleanup.priority.retainedObservationCodeUnits, 0);
  assert.equal(row.cleanup.collision.colliders, 0);
  assert.equal(row.owned.controller.retainedBatches, 0);
  assert.equal(row.owned.bodies.entities, expectedActors);
  assert.equal(row.owned.collision.colliders, expectedActors);
  assert.equal(row.observerSamples, row.options.measured ? 600 : 0);
  assert.equal(row.observerPayloadBytes, row.observerSamples * 3 * 8);
  if (row.options.measured) {
    for (const metric of Object.values(row.timing)) {
      assert(Number.isFinite(metric.p50) && metric.p50 >= 0);
      assert(metric.p50 <= metric.p95 && metric.p95 <= metric.p99);
    }
    if (row.options.count === 70) assert(row.timing.tickMs.p95 <= 5.5);
  } else assert.equal(row.timing, null);
}
// The immutable fixture defaults calibration to exactly two actors; workloads explicitly
// request 70/110. Validate that historical default rather than applying a missing-count fallback.
const originalFixture = await readFile(new URL(
  'source-before/tests/autonomy/yield-policy-native-fixture.ts', folder), 'utf8');
assert(originalFixture.includes('count = options.count ?? 2,'));
report.calibration.forEach((row, index) => {
  assert.equal(Object.hasOwn(row.options, 'count'), false);
  assert.equal(Object.hasOwn(before.calibration[index].options, 'count'), false);
  compare(row, before.calibration[index], 2);
});
const recomputed = [];
report.runs.forEach((row, index) => {
  const reference = before.runs[index];
  assert([70, 110].includes(row.count));
  assert.equal(row.options.count, row.count);
  compare(row, reference, row.count);
  for (const key of ['count', 'pair', 'measured', 'warmupTicks', 'measuredTicks'])
    assert.equal(row[key], reference[key]);
  assert.equal(row.warmupTicks, 180); assert.equal(row.measuredTicks, 600);
  if (row.measured) recomputed.push({ count: row.count, pair: row.pair,
    tickDeltaP95Ms: row.timing.tickMs.p95 - reference.timing.tickMs.p95,
    policyDeltaP95Ms: row.timing.policyMs.p95 - reference.timing.policyMs.p95,
    regression: row.timing.tickMs.p95 > reference.timing.tickMs.p95 * 1.1 &&
      row.timing.tickMs.p95 - reference.timing.tickMs.p95 > 1 });
});
assert.deepEqual(report.comparisons, recomputed);
for (const count of [70, 110]) {
  const rows = report.runs.filter((r) => r.count === count);
  assert.equal(rows.length, 10);
  assert.equal(rows.filter((r) => r.measured).length, 5);
  assert.equal(new Set(rows.map((r) => r.finalPhysicalHash)).size, 1);
  assert.equal(new Set(rows.map((r) => r.commandDigest)).size, 1);
  assert(recomputed.filter((r) => r.count === count && r.regression).length < 3);
}
for (const classId of ['sedan', 'compact']) for (const distance of [14, 18]) {
  const rows = report.calibration.filter((r) => r.options.classId === classId && r.options.otherDistanceM === distance);
  const risky = rows.find((r) => r.options.thresholdS === 0.2);
  const prudent = rows.find((r) => r.options.thresholdS === 3);
  assert(risky.firstEntryTick < prudent.firstEntryTick);
  assert(risky.collisionTick !== null && risky.maxImpulseNs > 0);
  assert.equal(prudent.collisionTick, null);
  assert(risky.evidence.some((e) => e.kind === 'CROSSED_WITH_PRIORITY_EXPOSURE' && e.learningEligible === null));
}
for (const threshold of [0.2, 3]) {
  const row = report.calibration.find((r) => r.options.classId === 'compact' && r.options.otherDistanceM === 22 && r.options.thresholdS === threshold);
  assert(row.collisionTick !== null && row.maxImpulseNs > 0, 'Preserve collisions under both thresholds; no safety guarantee');
}
console.log(JSON.stringify({verified: true, capture: 'after-main029', sourceHash: report.sourceHash,
  nativePathExplicit: true, currentSourceVerified: true, calibration: 12, worlds: 20, hardwareAcceptance: false,
  memoryScope: 'Bounded observer numeric payload and actual ownership cleanup, not whole heap'}));
