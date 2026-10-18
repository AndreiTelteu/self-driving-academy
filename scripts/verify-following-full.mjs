// Independent full/local48 reader; exact origin/current closure, raw samples, pacing, power, pairs and unchanged budgets.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  nativeValidationProtocol,
  validateNativeDurations,
} from './native-validation-protocol.mjs';
import { assertLongitudinalPowerComparable } from './longitudinal-full-power.mjs';
const hash = (b) => createHash('sha256').update(b).digest('hex'),
  p95 = (a) => [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * 0.95)];
export function validateFollowingFullRun(run, protocol, budget) {
  assert.equal(run.count, 70);
  const n = run.observer ? protocol.measuredTicks : 0;
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
  validateNativeDurations(run, protocol);
  assert.equal(run.trace.length, Math.floor((protocol.warmupTicks + protocol.measuredTicks) / 60));
  assert(run.trace.some((r) => r[1] > 0));
  for (let i = 0; i < run.trace.length; i++) {
    const row = run.trace[i];
    assert.equal(row[0], (i + 1) * 60);
    assert(row.every(Number.isFinite));
    assert(row[1] >= 0 && row[1] <= 30);
    assert(row[2] >= 0 && row[2] <= 1);
  }
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
  if (protocol.mode === 'full' && run.observer) {
    assert(
      run.tickP95Ms <= budget.proposedBudgets.laptop.authoritativeTickP95Ms,
      'Normal8ms budget',
    );
    assert(run.rapierP95Ms <= budget.proposedBudgets.laptop.rapierStepP95Ms, 'Rapier5ms budget');
  }
}
export async function inspectFollowingFull(folder, currentRoot) {
  const binding = JSON.parse(await readFile(resolve(folder, 'binding.json'))),
    bytes = await readFile(resolve(folder, 'report.json')),
    report = JSON.parse(bytes),
    terminal = JSON.parse(await readFile(resolve(folder, 'terminal.json')));
  await assert.rejects(access(resolve(folder, 'failure.json')), { code: 'ENOENT' });
  assert.equal(report.status, 'CAPTURE_COMPLETE');
  assert.equal(report.fixture, '048-full-native-paced-v1');
  assert.equal(hash(bytes), terminal.reportSha256);
  assert.equal(terminal.sourceHash, binding.sourceHash);
  assert.equal(hash(JSON.stringify(binding.inputs)), binding.sourceHash);
  const protocol = nativeValidationProtocol(report.protocol.mode);
  assert.deepEqual(report.protocol, protocol);
  assert.deepEqual(binding.protocol, protocol);
  assert.equal(report.runs.length, protocol.pairs * 2);
  assert(binding.inputs.length <= 512);
  const sources = new Map();
  for (const input of binding.inputs) {
    let source;
    try {
      source = await readFile(resolve(folder, 'source', input.path));
    } catch (error) {
      assert.equal(error.code, 'ENOENT');
      source = execFileSync('git', ['show', binding.prerequisiteCommit + ':' + input.path]);
    }
    assert.equal(source.length, input.bytes);
    assert.equal(hash(source), input.sha256);
    sources.set(input.path, source);
    if (currentRoot)
      assert.equal(hash(await readFile(resolve(currentRoot, input.path))), input.sha256);
  }
  assert.equal(hash(await readFile(binding.native.durableArtifact)), binding.native.sha256);
  if (currentRoot) assert.equal(hash(await readFile(binding.native.path)), binding.native.sha256);
  const origin = JSON.parse(sources.get('full-origin.json'));
  assert.deepEqual(origin, binding.origin);
  assert.equal(
    hash(sources.get('scripts/benchmark-following-full.mjs')),
    origin.derivedRunnerSha256,
  );
  assert.equal(hash(sources.get('scripts/benchmark-following.mjs')), origin.commonRunnerSha256);
  for (const input of origin.originalInputs) {
    const overlay = origin.overlays.find((o) => o.path === input.path);
    assert.equal(hash(sources.get(input.path)), overlay?.sha256 ?? input.sha256);
    if (overlay) {
      assert(
        (binding.phase === 'after' && overlay.path === 'src/autonomy/following.ts') ||
          (origin.commonProvenanceOverlay === true &&
            ['src/autonomy/road-context.ts', 'src/autonomy/cruise-targets.ts'].includes(
              overlay.path,
            )),
        'Unapproved source overlay',
      );
      assert.equal(overlay.originalSha256, input.sha256);
    }
  }
  assert(origin.overlays.length <= (origin.commonProvenanceOverlay === true ? 3 : 1));
  assert.equal(new Set(origin.overlays.map((o) => o.path)).size, origin.overlays.length);
  if (origin.commonProvenanceOverlay === true)
    for (const path of ['src/autonomy/road-context.ts', 'src/autonomy/cruise-targets.ts'])
      assert(
        origin.overlays.some((o) => o.path === path),
        'Missing declared common overlay',
      );
  assert.equal(origin.phase, binding.phase);
  assert.equal(origin.retrospectiveBefore, binding.phase === 'before');
  const parentRoot = resolve(folder, '..'),
    originalBindingBytes = await readFile(
      resolve(parentRoot, origin.originalLabel, 'binding.json'),
    );
  assert.equal(hash(originalBindingBytes), origin.originalBindingSha256);
  const originalBinding = JSON.parse(originalBindingBytes);
  assert.equal(originalBinding.sourceHash, origin.originalSourceHash);
  assert.deepEqual(originalBinding.inputs, origin.originalInputs);
  const powerStart = JSON.parse(await readFile(resolve(folder, 'power-start.json'))),
    powerEnd = JSON.parse(await readFile(resolve(folder, 'power-end.json')));
  assert.deepEqual(report.powerStart, powerStart);
  assert.deepEqual(binding.powerStart, powerStart);
  assert.deepEqual(report.powerEnd, powerEnd);
  assertLongitudinalPowerComparable(powerStart, powerEnd);
  const budget = JSON.parse(sources.get('Docs/performance-budgets.json'));
  assert.equal(budget.budgetVersion, '203-initial-1');
  for (let pair = 0; pair < protocol.pairs; pair++) {
    const runs = report.runs.filter((r) => r.pair === pair);
    assert.deepEqual(
      runs.map((r) => r.observer),
      pair % 2 ? [true, false] : [false, true],
    );
    for (const run of runs) validateFollowingFullRun(run, protocol, budget);
    assert.equal(runs[0].physicalHash, runs[1].physicalHash);
    assert.deepEqual(runs[0].trace, runs[1].trace);
    const checkpointPath = resolve(folder, 'pairs', `70-${pair}.json`),
      checkpointBytes = await readFile(checkpointPath);
    assert.equal(
      hash(checkpointBytes),
      (await readFile(checkpointPath + '.sha256', 'utf8')).trim(),
    );
    assert.deepEqual(JSON.parse(checkpointBytes), {
      sourceHash: binding.sourceHash,
      nativeHash: binding.native.sha256,
      protocol,
      runs,
    });
  }
  return { binding, report, budget };
}
export function compareFollowingFull(after, before) {
  assert.deepEqual(after.budget, before.budget);
  const regressionBudget = after.budget.regressionProposal;
  assert.equal(after.binding.phase, 'after');
  assert.equal(before.binding.phase, 'before');
  assert.deepEqual(after.report.protocol, before.report.protocol);
  for (const key of ['runtime', 'cpu', 'os']) assert.equal(after.report[key], before.report[key]);
  assert.equal(after.binding.native.sha256, before.binding.native.sha256);
  assertLongitudinalPowerComparable(before.report.powerStart, after.report.powerEnd);
  assertLongitudinalPowerComparable(before.report.powerStart, after.report.powerStart);
  assertLongitudinalPowerComparable(before.report.powerEnd, after.report.powerEnd);
  const changed = new Set([
    'src/autonomy/following.ts',
    'src/autonomy/longitudinal-control.ts',
    'src/autonomy/index.ts',
    'src/profiles/parameter-registry.ts',
    'full-origin.json',
  ]);
  for (const input of after.binding.inputs)
    if (!changed.has(input.path)) {
      const old = before.binding.inputs.find((i) => i.path === input.path);
      assert(old, 'Common closure absent ' + input.path);
      assert.equal(input.sha256, old.sha256, 'Common source changed ' + input.path);
    }
  const pairs = [];
  let confirmations = 0;
  for (let pair = 0; pair < after.report.protocol.pairs; pair++) {
    const a = after.report.runs.find((r) => r.pair === pair && r.observer),
      b = before.report.runs.find((r) => r.pair === pair && r.observer);
    assert.deepEqual(a.trace, b.trace);
    assert.equal(a.physicalHash, b.physicalHash);
    const delta = a.tickP95Ms - b.tickP95Ms,
      regression =
        delta > regressionBudget.p95AbsoluteIncreaseMs &&
        a.tickP95Ms > b.tickP95Ms * (1 + regressionBudget.p95RelativeIncrease);
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
  if (after.report.protocol.mode === 'full')
    assert(
      confirmations < regressionBudget.confirmationsOutOfFive,
      'Full regression three-of-five',
    );
  return { mode: after.report.protocol.mode, confirmations, pairs };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [after, before] = process.argv.slice(2),
    currentArg = process.argv.find((a) => a.startsWith('--current-root='));
  const a = await inspectFollowingFull(
      after,
      currentArg ? currentArg.slice('--current-root='.length) : null,
    ),
    b = await inspectFollowingFull(before);
  console.log(
    JSON.stringify(
      {
        status: 'PASS',
        scope:
          a.report.protocol.mode === 'full'
            ? 'Full local NORMAL70 only, not fleet/browser FPS'
            : 'Technical preflight, not numerical acceptance',
        comparison: compareFollowingFull(a, b),
      },
      null,
      2,
    ),
  );
}
