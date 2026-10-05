import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const folder = 'Docs/Evidence/045-behavior-fsm',
  historical = process.argv.includes('--historical');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function sources(report, archive, current) {
  const aggregate = createHash('sha256');
  for (const input of report.inputs) {
    const bytes = await readFile(`${folder}/${archive}/${input.path}`);
    assert.equal(bytes.length, input.bytes);
    assert.equal(hash(bytes), input.sha256);
    if (current) assert.equal(hash(await readFile(input.path)), input.sha256);
    aggregate.update(input.path).update(bytes);
  }
  assert.equal(aggregate.digest('hex'), report.sourceHash);
  const archivedNative = await readFile(`${folder}/native/rapier.mjs`);
  assert.equal(archivedNative.length, report.nativeArtifact.bytes);
  assert.equal(hash(archivedNative), report.nativeArtifact.sha256);
  if (current) {
    const installedNative = await readFile(report.nativeArtifact.path);
    assert.equal(installedNative.length, report.nativeArtifact.bytes);
    assert.equal(hash(installedNative), report.nativeArtifact.sha256);
  }
}
const before = await json(`${folder}/before-v2.json`),
  after = await json(`${folder}/after-v2.json`);
await sources(before, 'source-before-v2', false);
await sources(after, 'source-after-v2', !historical);
assert(new Date(before.capturedAt) < new Date(after.capturedAt));
assert.equal(after.beforeSourceHash, before.sourceHash);
assert.deepEqual(after.nativeArtifact, before.nativeArtifact);
assert.equal(before.runs.length, 20);
assert.equal(after.runs.length, 20);
const summaries = [];
for (const count of [70, 110]) {
  const old = before.runs.filter((run) => run.count === count),
    next = after.runs.filter((run) => run.count === count);
  assert.equal(old.length, 10);
  assert.equal(next.length, 10);
  for (let index = 0; index < 10; index++) {
    const a = next[index],
      b = old[index];
    assert.equal(a.pair, b.pair);
    assert.equal(a.observer, b.observer);
    assert.equal(a.sampleBytes, a.observer ? 14400 : 0);
    assert.equal(a.inputsCount, 780);
    assert.equal(a.physicalTicks, 780);
    assert.deepEqual(a.checkpoints, b.checkpoints);
    assert.equal(a.finalPhysicalHash, b.finalPhysicalHash);
    assert.equal(a.decisionDigest, b.decisionDigest);
    assert.deepEqual(a.states, b.states);
    assert.deepEqual(a.reasons, b.reasons);
    assert.deepEqual(
      Object.keys(a.states).sort(),
      ['BLOCKED', 'STOP', 'YIELD', 'SERVICE', 'CHANGE_LANE', 'FOLLOW'].sort(),
    );
    assert.equal(a.reasons.INCOMPLETE_CONTEXT, undefined);
    assert.equal(a.owned.behavior.actors, count);
    assert.equal(a.owned.behavior.identities, count);
    assert.equal(a.owned.behavior.decisions, count);
    assert.equal(a.owned.behavior.retainedHistory, 0);
    for (const value of [
      a.cleanup.behavior.actors,
      a.cleanup.behavior.identities,
      a.cleanup.behavior.decisions,
      a.cleanup.behavior.retiredIdentities,
      a.cleanup.body.entities,
      a.cleanup.body.subscriptions,
      a.cleanup.collision.colliders,
      a.cleanup.scheduler.actors,
      a.cleanup.scheduler.identities,
      a.cleanup.scheduler.urgent,
      a.cleanup.road.cachedContexts,
      a.cleanup.controller.vehicles,
    ])
      assert.equal(value, 0);
    if (a.observer) {
      assert(a.ownerCost.measuredCalls > 0);
      for (const value of [
        a.ownerCost.totalMs,
        a.ownerCost.meanPerDecisionMs,
        a.ownerCost.maxPerDecisionMs,
      ])
        assert(Number.isFinite(value) && value >= 0);
    }
  }
  const observed = next.filter((run) => run.observer),
    baseline = old.filter((run) => run.observer);
  const confirmed = observed.filter(
    (run, index) =>
      run.tickMs.p95 > baseline[index].tickMs.p95 * 1.1 &&
      run.tickMs.p95 - baseline[index].tickMs.p95 > 1,
  ).length;
  const absoluteFailures = count === 70 ? observed.filter((run) => run.tickMs.p95 > 5.5).length : 0;
  summaries.push({
    count,
    beforeTickP95Ms: baseline.map((run) => run.tickMs.p95),
    afterTickP95Ms: observed.map((run) => run.tickMs.p95),
    confirmedRelativeFailures: confirmed,
    absoluteNormalFailures: absoluteFailures,
    ownerPerDecisionMeanMs: observed.map((run) => run.ownerCost.meanPerDecisionMs),
  });
  assert(confirmed < 3, `${count}: confirmed NodeCPU regression`);
  assert.equal(absoluteFailures, 0, 'Normal70 provisional5.5ms tick budget exceeded');
}
const result = {
  status: 'PASS',
  verifiedAt: new Date().toISOString(),
  mode: historical ? 'historical-exact-byte-archives' : 'current-source',
  beforeSourceHash: before.sourceHash,
  afterSourceHash: after.sourceHash,
  summaries,
  memory: {
    baselineNewOwner:
      'Absent production045, observed in original chronologically archived BEFORE; no invented heap byte comparison.',
    after:
      '20nativeworlds currentbounded70/110scalarstates, identities/currentprojections and zeroaftercleanup; ownership counters distinct from exact heap/WASM.',
  },
  scope:
    'ActualNodeCPU/parser/selection/ownership comparison only. No inherited219hardwarePASS, FPS/laptop/fullgame or lane/service driving claim.',
};
await writeFile(
  `${folder}/after-verification${historical ? '-historical' : ''}.json`,
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
