import assert from 'node:assert/strict';
import { readFile, access, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = 'Docs/Evidence/045-behavior-fsm';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const summaries = [];
for (const version of ['before', 'before-v2']) {
  const report = JSON.parse(await readFile(`${root}/${version}.json`, 'utf8'));
  const aggregate = createHash('sha256');
  for (const input of report.inputs) {
    const bytes = await readFile(`${root}/source-${version}/${input.path}`);
    assert.equal(bytes.length, input.bytes);
    assert.equal(hash(bytes), input.sha256);
    if (version === 'before-v2') assert.equal(hash(await readFile(input.path)), input.sha256);
    aggregate.update(input.path).update(bytes);
  }
  assert.equal(aggregate.digest('hex'), report.sourceHash);
  assert.equal(hash(await readFile(report.nativeArtifact.path)), report.nativeArtifact.sha256);
  assert.equal(report.runs.length, 20);
  const populations = [];
  for (const count of [70, 110]) {
    const runs = report.runs.filter((run) => run.count === count);
    assert.equal(runs.length, 10);
    for (const run of runs) {
      assert.equal(run.sampleBytes, run.observer ? 14400 : 0);
      assert.equal(run.inputsCount, 780);
      assert.equal(run.physicalTicks, 780);
      assert.deepEqual(run.checkpoints, runs[0].checkpoints);
      assert.equal(run.decisionDigest, runs[0].decisionDigest);
      assert.equal(run.finalPhysicalHash, runs[0].finalPhysicalHash);
      for (const [actual, expected] of [
        [run.cleanup.body.entities, 0],
        [run.cleanup.body.subscriptions, 0],
        [run.cleanup.collision.colliders, 0],
        [run.cleanup.scheduler.actors, 0],
        [run.cleanup.scheduler.identities, 0],
        [run.cleanup.scheduler.urgent, 0],
        [run.cleanup.road.cachedContexts, 0],
        [run.cleanup.controller.vehicles, 0],
      ])
        assert.equal(actual, expected);
      if (version === 'before-v2') {
        assert.deepEqual(
          Object.keys(run.states).sort(),
          ['BLOCKED', 'STOP', 'YIELD', 'SERVICE', 'CHANGE_LANE', 'FOLLOW'].sort(),
        );
        assert.equal(run.reasons.INCOMPLETE_CONTEXT, undefined);
      }
    }
    const p95s = runs
      .filter((run) => run.observer)
      .map((run) => run.tickMs.p95)
      .sort((a, b) => a - b);
    populations.push({
      count,
      tickP95MedianMs: p95s[2],
      tickP95EachMs: p95s,
      decisions: runs[0].decisions,
      states: runs[0].states ?? null,
      reasons: runs[0].reasons,
      finalPhysicalHash: runs[0].finalPhysicalHash,
      desktopProvisionalTickBudget:
        count === 70 ? { limitMs: 5.5, status: p95s[2] <= 5.5 ? 'PASS' : 'FAIL' } : null,
    });
  }
  summaries.push({
    version,
    sourceHash: report.sourceHash,
    sourceCount: report.inputs.length,
    nativeArtifact: report.nativeArtifact,
    populations,
  });
}
await assert.rejects(access('src/autonomy/behavior-fsm.ts'), (error) => error.code === 'ENOENT');
const result = {
  integrityStatus: 'PASS',
  normalPolicyCoverage: 'BEFORE_V2_ALL_SIX_STATES',
  originalBaselineLimitation:
    'Native70 offroad, all decisions INCOMPLETE_CONTEXT; preserved, not accepted for policy-path timing.',
  scope:
    'Unpaced Node CPU and provisional tick comparison; no hardware FPS/laptop/fullgame verdict.',
  summaries,
};
await writeFile(`${root}/baseline-verification.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
