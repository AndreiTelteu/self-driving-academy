// Independent archive, numeric budget, semantics and cleanup reader. Never mutates captures.
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const root = 'Docs/Evidence/047-longitudinal-control',
  label = process.argv[2],
  beforeLabel = process.argv[3];
assert(/^[a-z0-9-]+$/.test(label));
async function inspect(label, current = false) {
  const folder = `${root}/${label}`,
    binding = JSON.parse(await readFile(`${folder}/binding.json`)),
    bytes = await readFile(`${folder}/report.json`),
    report = JSON.parse(bytes),
    terminal = JSON.parse(await readFile(`${folder}/terminal.json`));
  await assert.rejects(access(`${folder}/failure.json`), { code: 'ENOENT' });
  assert.equal(terminal.status, 'CAPTURE_COMPLETE');
  assert.equal(hash(bytes), terminal.reportSha256);
  assert.equal(terminal.sourceHash, binding.sourceHash);
  const aggregate = createHash('sha256');
  for (const item of binding.inputs) {
    const bytes = await readFile(`${folder}/source/${item.path}`);
    assert.equal(bytes.length, item.bytes);
    assert.equal(hash(bytes), item.sha256);
    aggregate.update(item.path).update(bytes);
    if (current) assert.equal(hash(await readFile(item.path)), item.sha256);
  }
  assert.equal(aggregate.digest('hex'), binding.sourceHash);
  const native = await readFile(`${folder}/native/rapier.mjs`);
  assert.equal(native.length, binding.native.bytes);
  assert.equal(hash(native), binding.native.sha256);
  if (current) assert.equal(hash(await readFile(binding.native.path)), binding.native.sha256);
  assert.equal(report.status, 'CAPTURE_COMPLETE');
  assert.equal(report.fixture, '047-targeted-native-v1');
  assert.equal(report.runs.length, 12);
  const p95 = (values) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * 0.95)];
  for (const count of [70, 110]) {
    const runs = report.runs.filter((r) => r.count === count);
    assert.equal(runs.length, 6);
    assert.equal(new Set(runs.map((r) => r.trace)).size, 1);
    assert.equal(new Set(runs.map((r) => r.physical)).size, 1);
    for (let pair = 0; pair < 3; pair++) {
      const pairRuns = runs.filter((r) => r.pair === pair);
      assert.deepEqual(
        pairRuns.map((r) => r.observer),
        pair % 2 ? [true, false] : [false, true],
      );
    }
  }
  for (const run of report.runs) {
    const length = run.observer ? 600 : 0;
    for (const values of Object.values(run.samples)) {
      assert.equal(values.length, length);
      assert(values.every((n) => Number.isFinite(n) && n >= 0));
    }
    assert.equal(run.sampleBytes, length * 3 * 8);
    for (const [key, channel] of [
      ['tickP95Ms', 'tickMs'],
      ['stageP95Ms', 'stageMs'],
      ['rapierStepP95Ms', 'rapierStepMs'],
    ])
      assert.equal(run[key], run.observer ? p95(run.samples[channel]) : null);
    if (binding.phase === 'after') {
      assert.equal(run.cleanup.longitudinal.actors, 0);
      assert.equal(run.cleanup.longitudinal.identities, 0);
    }
    assert.equal(run.cleanup.body.entities, 0);
    assert.equal(run.cleanup.road.cachedContexts, 0);
    assert.equal(run.cleanup.behavior.actors, 0);
    assert.equal(run.cleanup.controller.vehicles, 0);
    assert.equal(run.cleanup.body.subscriptions, 0);
    assert.equal(run.cleanup.behavior.identities, 0);
    assert.equal(run.cleanup.behavior.decisions, 0);
    assert.equal(run.cleanup.road.identities, 0);
    assert.equal(run.calls, binding.phase === 'after' && run.observer ? run.count * 600 : 0);
    if (run.calls) assert(Number.isFinite(run.ownMeanMs) && run.ownMeanMs >= 0);
    else assert.equal(run.ownMeanMs, null);
    if (run.count === 70 && run.observer) {
      assert(run.tickP95Ms <= 8, 'Laptop normal tick budget8ms');
      assert(run.rapierStepP95Ms <= 5, 'Laptop normal Rapier budget5ms');
    }
  }
  return { binding, report };
}
const current = process.argv.includes('--current'),
  actual = await inspect(label, current);
let comparisons = [];
if (beforeLabel && !beforeLabel.startsWith('--')) {
  const before = await inspect(beforeLabel);
  assert.equal(before.binding.phase, 'before');
  assert.equal(actual.binding.phase, 'after');
  assert(Date.parse(before.binding.capturedAt) < Date.parse(actual.binding.capturedAt));
  for (const key of ['runtime', 'cpu', 'os', 'fixture', 'budgetVersion'])
    assert.equal(actual.report[key], before.report[key]);
  assert.equal(actual.binding.native.sha256, before.binding.native.sha256);
  const fixed = actual.binding.inputs.filter(
    (i) =>
      ![
        'src/autonomy/longitudinal-control.ts',
        'src/autonomy/index.ts',
        'src/profiles/parameter-registry.ts',
      ].includes(i.path),
  );
  for (const item of fixed) {
    const previous = before.binding.inputs.find((i) => i.path === item.path);
    assert(previous, `AFTER common input missing BEFORE: ${item.path}`);
    assert.equal(item.sha256, previous.sha256, `Common fixture changed ${item.path}`);
  }
  for (const count of [70, 110]) {
    let regressions = 0;
    for (const run of actual.report.runs.filter((r) => r.count === count)) {
      const old = before.report.runs.find(
        (r) => r.count === count && r.pair === run.pair && r.observer === run.observer,
      );
      assert.equal(run.trace, old.trace);
      assert.equal(run.physical, old.physical);
      if (run.observer && run.tickP95Ms > old.tickP95Ms * 1.1 && run.tickP95Ms - old.tickP95Ms > 1)
        regressions++;
    }
    comparisons.push({ count, regressions });
    assert(regressions < 2, 'Targeted regression requires full escalation');
  }
}
console.log(
  JSON.stringify({
    status: 'PASS',
    label,
    current,
    sourceHash: actual.binding.sourceHash,
    comparisons,
  }),
);
