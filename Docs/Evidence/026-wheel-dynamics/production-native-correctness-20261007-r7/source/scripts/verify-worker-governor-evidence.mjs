import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
async function sourceHash(inputs) {
  const hash = createHash('sha256');
  for (const input of inputs) hash.update(input).update(await readFile(input));
  return hash.digest('hex');
}
const browser = await read('Evidence/221/browser.json');
const cpu = await read('Evidence/221/cpu.json');
const build = await read('Evidence/221/browser-build.json');
assert.equal(browser.build.sourceHash, await sourceHash(browser.build.inputs));
assert.equal(cpu.sourceHash, await sourceHash(cpu.inputs));
assert.equal(browser.build.sourceHash, build.sourceHash);
assert.equal(browser.build.commit, build.commit);
assert.equal(browser.artifactHash, build.artifactHash);
assert.equal(
  build.artifactHash,
  createHash('sha256').update(JSON.stringify(build.artifacts)).digest('hex'),
);
for (const artifact of build.artifacts) {
  const bytes = await readFile(`.pbi-validation-221/build/${artifact.path}`);
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
}
assert.equal(browser.foreground.visibleAndFocusedThroughout, true);
for (const report of [browser, cpu]) {
  assert.equal(report.repeats.length, 5);
  assert.equal(report.gameplayGate, 'NOT_VALIDATED');
  assert.equal(report.workerBudgetVersion, '221-synthetic-1');
  for (const repeat of report.repeats) {
    const probe = repeat.probe ?? repeat;
    assert.ok(probe.maxSliceMs <= 10);
    assert.ok(probe.interactiveEndToEndMs <= 2000);
    assert.equal(probe.attemptedComparisonStarts, 2);
    assert.equal(probe.logicalComparisonResults, 1);
    assert.equal(probe.liveBufferAttached, true);
    assert.equal(probe.worldTokensMaximum, 1);
    assert.equal(probe.usage.jobs, 0);
    assert.equal(probe.usage.bytes, 0);
    assert.equal(probe.usage.persistenceIngressJobs, 0);
    assert.equal(probe.usage.transport.jobs, 0);
    assert.equal(probe.storeAfterAcknowledgement.records, 0);
    assert.equal(probe.storeAfterAcknowledgement.bytes, 0);
    assert.ok(
      probe.measurements.every(
        (sample) => sample.cancellationMs === null || sample.cancellationMs <= 100,
      ),
    );
    for (const jobId of new Set(probe.progressEvents.map((event) => event.jobId))) {
      const events = probe.progressEvents.filter((event) => event.jobId === jobId);
      for (let i = 1; i < events.length; i++)
        assert.ok(events[i].atMs - events[i - 1].atMs >= 199.5);
    }
    if (repeat.probe) {
      assert.ok(repeat.measuredBaselineMs >= 1000 && repeat.measuredWorkerMs >= 1000);
      assert.ok(repeat.baseline.count > 0 && repeat.workerFrames.count > 0);
    } else assert.equal(repeat.transferCount, 4);
  }
}
console.log(
  'PASS: 221 source/artifact identities, five paired browser bursts, five CPU repetitions, cooperative budgets and ownership cleanup; gameplay/laptop remain unvalidated',
);
