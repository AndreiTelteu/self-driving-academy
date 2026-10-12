// Independent integrity/raw/semantics/resource/budget reader; never rewrites capture status.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const p95 = (a) => [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * 0.95)];
export async function inspectFollowing(folder, currentRoot) {
  const binding = JSON.parse(await readFile(resolve(folder, 'binding.json'))),
    raw = await readFile(resolve(folder, 'report.json')),
    report = JSON.parse(raw),
    terminal = JSON.parse(await readFile(resolve(folder, 'terminal.json')));
  await assert.rejects(access(resolve(folder, 'failure.json')), { code: 'ENOENT' });
  assert.equal(hash(raw), terminal.reportSha256);
  assert.equal(terminal.sourceHash, binding.sourceHash);
  assert.equal(hash(JSON.stringify(binding.inputs)), binding.sourceHash);
  assert.equal(report.fixture, '048-targeted-local-v2');
  assert.equal(report.status, 'CAPTURE_COMPLETE');
  assert.equal(report.runs.length, 12);
  for (const item of binding.inputs) {
    let bytes;
    try {
      bytes = await readFile(resolve(folder, 'source', item.path));
    } catch (error) {
      assert.equal(error.code, 'ENOENT');
      bytes = execFileSync('git', ['show', binding.prerequisiteCommit + ':' + item.path]);
    }
    assert.equal(hash(bytes), item.sha256);
    assert.equal(bytes.length, item.bytes);
    if (currentRoot)
      assert.equal(hash(await readFile(resolve(currentRoot, item.path))), item.sha256);
  }
  assert.equal(hash(await readFile(binding.native.durableArtifact)), binding.native.sha256);
  if (currentRoot) assert.equal(hash(await readFile(binding.native.path)), binding.native.sha256);
  for (const run of report.runs) {
    const n = run.observer ? 600 : 0;
    assert.equal(run.sampleBytes, n * 24);
    for (const channel of ['tick', 'own', 'rapier']) {
      assert.equal(run.samples[channel].length, n);
      assert(run.samples[channel].every((v) => Number.isFinite(v) && v >= 0));
    }
    for (const [field, channel] of [
      ['tickP95Ms', 'tick'],
      ['ownP95Ms', 'own'],
      ['rapierP95Ms', 'rapier'],
    ])
      assert.equal(run[field], run.observer ? p95(run.samples[channel]) : null);
    for (const [object, key] of [
      [run.cleanup.body, 'entities'],
      [run.cleanup.body, 'subscriptions'],
      [run.cleanup.fixture.road, 'cachedContexts'],
      [run.cleanup.fixture.road, 'identities'],
      [run.cleanup.fixture.behavior, 'actors'],
      [run.cleanup.fixture.behavior, 'decisions'],
      [run.cleanup.policy, 'actors'],
      [run.cleanup.policy, 'identities'],
      [run.cleanup.policy, 'delayedBrakeStates'],
      [run.cleanup.policy, 'cachedTargets'],
      [run.cleanup.policy, 'scratchRetainedFields'],
      [run.cleanup.controller, 'vehicles'],
    ])
      assert.equal(object[key], 0);
    assert(run.trace.some((row) => row[1] > 0));
    assert(run.trace.every((row) => row.length === 3 && row.every(Number.isFinite)));
    if (run.count === 70 && run.observer) {
      assert(run.tickP95Ms <= 8, 'Normal provisional laptop8ms');
      assert(run.rapierP95Ms <= 5, 'Rapier5ms');
    }
  }
  for (const count of [70, 110])
    for (let pair = 0; pair < 3; pair++) {
      const runs = report.runs.filter((r) => r.count === count && r.pair === pair);
      assert.deepEqual(
        runs.map((r) => r.observer),
        pair % 2 ? [true, false] : [false, true],
      );
      assert.deepEqual(runs[0].trace, runs[1].trace);
      assert.equal(runs[0].physicalHash, runs[1].physicalHash);
    }
  return { binding, report };
}
export function compareFollowing(actual, before) {
  assert.equal(actual.binding.phase, 'after');
  assert.equal(before.binding.phase, 'before');
  for (const key of ['fixture', 'runtime', 'cpu', 'os'])
    assert.equal(actual.report[key], before.report[key]);
  assert.equal(actual.binding.native.sha256, before.binding.native.sha256);
  const changed = new Set([
    'src/autonomy/following.ts',
    'src/autonomy/longitudinal-control.ts',
    'src/autonomy/index.ts',
    'src/profiles/parameter-registry.ts',
  ]);
  for (const input of actual.binding.inputs)
    if (!changed.has(input.path)) {
      const old = before.binding.inputs.find((i) => i.path === input.path);
      assert(old, 'Missing common input');
      assert.equal(input.sha256, old.sha256, 'Common source changed ' + input.path);
    }
  const results = [];
  for (const count of [70, 110]) {
    let confirmations = 0;
    const pairs = [];
    for (let pair = 0; pair < 3; pair++) {
      const a = actual.report.runs.find((r) => r.count === count && r.pair === pair && r.observer),
        b = before.report.runs.find((r) => r.count === count && r.pair === pair && r.observer);
      assert.deepEqual(a.trace, b.trace);
      assert.equal(a.physicalHash, b.physicalHash);
      const delta = a.tickP95Ms - b.tickP95Ms,
        regression = delta > 1 && a.tickP95Ms > b.tickP95Ms * 1.1;
      if (regression) confirmations++;
      pairs.push({
        pair,
        before: b.tickP95Ms,
        after: a.tickP95Ms,
        delta,
        incrementalOwnMs: a.ownP95Ms - b.ownP95Ms,
        regression,
      });
    }
    results.push({ count, confirmations, pairs });
    assert(confirmations < 2, 'Escalation required ' + count);
  }
  return results;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [after, before] = process.argv.slice(2);
  const a = await inspectFollowing(after, process.argv.includes('--current') ? '.' : null),
    b = await inspectFollowing(before);
  console.log(JSON.stringify({ status: 'PASS', comparisons: compareFollowing(a, b) }, null, 2));
}
