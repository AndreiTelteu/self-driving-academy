import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = [
  'summary.json',
  'hardware.json',
  'archive-complete.json',
  ...Array.from({ length: 10 }, (_, i) => `run-${i}.json`),
];
export async function pairedEvidenceHash(directory) {
  const digest = createHash('sha256');
  for (const file of files) digest.update(file).update(await readFile(resolve(directory, file)));
  return digest.digest('hex');
}
const p95 = (values) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

// A desktop's absolute timings cannot establish a laptop regression. The original
// physics hashes remain mandatory; performance uses independently pinned local pairs.
export async function readMatchedNative(root, pins, after, budgets) {
  assert(/^[a-z0-9-]+$/.test(pins.pairedCapture), 'Pinned paired namespace');
  assert(/^[a-f0-9]{64}$/.test(pins.pairedHash ?? ''), 'Reviewed paired hash required');
  const directory = resolve(root, 'Docs/Evidence/026-wheel-dynamics', pins.pairedCapture);
  assert.equal(await pairedEvidenceHash(directory), pins.pairedHash, 'Pinned raw paired evidence');
  const summary = JSON.parse(await readFile(resolve(directory, 'summary.json')));
  assert.equal(summary.state, 'NATIVE_LAPTOP_PAIRED_PASS');
  for (const key of ['runtime', 'cpu', 'os'])
    assert.equal(summary[key], after[key], `Matched ${key}`);
  const archive = JSON.parse(await readFile(resolve(directory, 'archive-complete.json')));
  assert.deepEqual(archive, summary.binding, 'Paired archive binding');
  const source = createHash('sha256');
  for (const input of archive.inputs) {
    const bytes = await readFile(resolve(directory, 'source', input.path));
    assert.equal(bytes.length, input.bytes);
    assert.equal(hash(bytes), input.sha256);
    source.update(input.path).update(bytes);
    if (
      input.path.startsWith('src/') ||
      input.path.startsWith('Docs/Evidence/026-wheel-dynamics/before/source/src/')
    )
      assert.equal(
        after.inputs.find((item) => item.path === input.path)?.sha256,
        input.sha256,
        'Same measured production',
      );
  }
  assert.equal(source.digest('hex'), archive.sourceHash);
  assert.equal(
    hash(await readFile(resolve(directory, 'rapier-native-artifact.mjs'))),
    after.native.sha256,
  );
  const runs = [];
  for (let i = 0; i < 10; i++) {
    const run = JSON.parse(await readFile(resolve(directory, `run-${i}.json`)));
    assert.equal(run.pair, Math.floor(i / 2));
    assert.equal(run.enabled, run.pair % 2 === 0 ? i % 2 === 1 : i % 2 === 0);
    assert.equal(run.warmupTicks, 180);
    assert.equal(run.measuredTicks, 600);
    assert.deepEqual(run.cleanup, {
      bodies: { entities: 0, subscriptions: 0 },
      collisions: { vehicles: 0, obstacles: 0, colliders: 0, disposed: true },
    });
    for (const key of ['tick', 'projection', 'step']) {
      assert.equal(run.channels[key].length, 600);
      assert(run.channels[key].every((value) => Number.isFinite(value) && value >= 0));
    }
    runs.push(run);
  }
  const confirmations = { tick: 0, projection: 0 };
  const pairs = [];
  for (let pair = 0; pair < 5; pair++) {
    const before = runs.find((run) => run.pair === pair && !run.enabled);
    const current = runs.find((run) => run.pair === pair && run.enabled);
    assert.equal(current.inputHash, before.inputHash);
    assert.equal(current.physicalHash, before.physicalHash);
    const metrics = {};
    for (const key of ['tick', 'projection', 'step']) {
      const a = p95(before.channels[key]),
        b = p95(current.channels[key]);
      metrics[key] = { beforeP95Ms: a, afterP95Ms: b };
      if (
        key in confirmations &&
        b > a * (1 + budgets.regressionProposal.p95RelativeIncrease) &&
        b - a > budgets.regressionProposal.p95AbsoluteIncreaseMs
      )
        confirmations[key]++;
    }
    assert(
      metrics.tick.afterP95Ms <= budgets.proposedBudgets.laptop.authoritativeTickP95Ms,
      'Laptop tick budget',
    );
    pairs.push({ pair, metrics, physicalParity: true });
  }
  assert.deepEqual(pairs, summary.pairs, 'Raw paired numerical readback');
  for (const count of Object.values(confirmations))
    assert(count < budgets.regressionProposal.confirmationsOutOfFive, 'Matched native regression');
  return { confirmations, pairs, capture: pins.pairedCapture, hardwareClass: 'laptop' };
}
