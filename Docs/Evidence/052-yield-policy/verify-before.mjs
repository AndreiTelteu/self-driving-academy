import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const folder = new URL('./', import.meta.url);
const report = JSON.parse(await readFile(new URL('before.json', folder), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = createHash('sha256');
for (const entry of report.inputs) {
  const bytes = await readFile(new URL(`source-before/${entry.path}`, folder));
  assert.equal(bytes.length, entry.bytes);
  assert.equal(hash(bytes), entry.sha256);
  source.update(entry.path).update(bytes);
}
assert.equal(source.digest('hex'), report.sourceHash);
assert.equal(hash(await readFile(new URL(report.nativeArtifact.archive, folder))), report.nativeArtifact.sha256);
assert.equal(report.status, 'BASELINE_CAPTURED_CALIBRATION_PASS');
assert.equal(report.calibration.length, 12);
assert.equal(report.runs.length, 20);
assert(Object.values(report.gates).every(Boolean));
for (const classId of ['sedan', 'compact']) {
  for (const distance of [14, 18]) {
    const paired = report.calibration.filter((r) => r.options.classId === classId && r.options.otherDistanceM === distance);
    const risky = paired.find((r) => r.options.thresholdS === 0.2);
    const prudent = paired.find((r) => r.options.thresholdS === 3);
    assert(risky.firstEntryTick < prudent.firstEntryTick);
    assert(risky.collisionTick !== null && risky.maxImpulseNs > 0);
    assert.equal(prudent.collisionTick, null);
    assert(risky.evidence.some((e) => e.kind === 'CROSSED_WITH_PRIORITY_EXPOSURE' && e.learningEligible === null));
  }
}
for (const count of [70, 110]) {
  const runs = report.runs.filter((r) => r.count === count);
  assert.equal(runs.length, 10);
  assert.equal(new Set(runs.map((r) => r.finalPhysicalHash)).size, 1);
  assert.equal(new Set(runs.map((r) => r.commandDigest)).size, 1);
  for (const run of runs) {
    assert.equal(run.cleanup.bodies.entities, 0);
    assert.equal(run.cleanup.controller.vehicles, 0);
    assert.equal(run.cleanup.priority.vehicles, 0);
    assert.equal(run.cleanup.collision.colliders, 0);
    assert.equal(run.observerSamples, run.measured ? 600 : 0);
    if (count === 70 && run.measured) assert(run.timing.tickMs.p95 <= 5.5);
  }
}
assert.equal(report.parity.status, 'PASS');
if (!process.argv.includes('--historical'))
  await assert.rejects(access(new URL('../../../src/autonomy/yield-policy.ts', folder)), { code: 'ENOENT' });
console.log(JSON.stringify({ verified: true, sourceHash: report.sourceHash, runs: report.runs.length,
  historicalArchiveOnly: process.argv.includes('--historical'),
  scope: 'Chronological preproduction reference/native capture, not hardware acceptance' }));
