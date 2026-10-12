// Independent full-paced archive/checkpoint reader. No capture mutation or runtime import.
import assert from 'node:assert/strict';
import { validateLongitudinalFullRun } from './longitudinal-full-validation.mjs';
import { assertLongitudinalPowerComparable } from './longitudinal-full-power.mjs';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const root = resolve('Docs/Evidence/047-longitudinal-control');
const aggregateNumeric = process.argv.includes('--aggregate-diagnostics');
const numericFailures = [];
async function inspect(folder, currentRoot) {
  const bytes = await readFile(`${folder}/report.json`),
    report = JSON.parse(bytes),
    binding = JSON.parse(await readFile(`${folder}/binding.json`)),
    terminal = JSON.parse(await readFile(`${folder}/terminal.json`));
  await assert.rejects(access(`${folder}/failure.json`), { code: 'ENOENT' });
  assert.equal(terminal.status, 'CAPTURE_COMPLETE');
  assert.equal(report.status, 'CAPTURE_COMPLETE');
  assert.equal(digest(bytes), terminal.reportSha256);
  assert.equal(terminal.sourceHash, binding.sourceHash);
  assert.deepEqual(report.powerStart, binding.powerStart);
  assert.deepEqual(report.powerStart, JSON.parse(await readFile(`${folder}/power-start.json`)));
  assert.deepEqual(report.powerEnd, JSON.parse(await readFile(`${folder}/power-end.json`)));
  assertLongitudinalPowerComparable(report.powerStart, report.powerEnd);
  assert(Date.parse(report.powerStart.capturedAt) <= Date.parse(binding.capturedAt));
  assert(Date.parse(report.powerEnd.capturedAt) <= Date.parse(terminal.completedAt));
  assert(['before', 'after'].includes(binding.phase));
  const aggregate = createHash('sha256');
  for (const input of binding.inputs) {
    const bytes = await readFile(`${folder}/source/${input.path}`);
    assert.equal(bytes.length, input.bytes);
    assert.equal(digest(bytes), input.sha256);
    aggregate.update(input.path).update(bytes);
    if (currentRoot)
      assert.equal(digest(await readFile(resolve(currentRoot, input.path))), input.sha256);
  }
  assert.equal(aggregate.digest('hex'), binding.sourceHash);
  const budget = JSON.parse(await readFile(`${folder}/source/Docs/performance-budgets.json`));
  assert.equal(report.budgetVersion, budget.budgetVersion);
  assert.equal(report.normalTickBudgetMs, budget.proposedBudgets.laptop.authoritativeTickP95Ms);
  const native = await readFile(`${folder}/native/rapier.mjs`);
  assert.equal(native.length, binding.native.bytes);
  assert.equal(digest(native), binding.native.sha256);
  if (currentRoot) assert.equal(digest(await readFile(binding.native.path)), binding.native.sha256);
  const origin = binding.origin,
    originalFolder = resolve(root, origin.originLabel),
    originalBytes = await readFile(`${originalFolder}/binding.json`),
    original = JSON.parse(originalBytes);
  assert.equal(digest(originalBytes), origin.originalBindingSha256);
  assert.equal(original.sourceHash, origin.originalSourceHash);
  assert.equal(original.phase, binding.phase);
  assert.equal(origin.retrospectiveBefore, binding.phase === 'before');
  assert.deepEqual(origin.originalInputs, original.inputs);
  assert.equal(
    digest(await readFile(`${originalFolder}/source/scripts/benchmark-longitudinal-control.mjs`)),
    origin.commonRunnerSha256,
  );
  assert.equal(
    digest(await readFile(`${folder}/source/scripts/benchmark-longitudinal-full.mjs`)),
    origin.derivedRunnerSha256,
  );
  for (const input of original.inputs) {
    const archived = await readFile(`${folder}/source/${input.path}`);
    assert.equal(digest(archived), input.sha256, `Frozen origin changed: ${input.path}`);
  }
  const protocol = report.protocol,
    preflight = protocol.mode === 'preflight';
  assert.deepEqual(protocol, binding.protocol);
  assert.equal(protocol.pacedHz, 60);
  assert.equal(protocol.warmupTicks, preflight ? 30 : 1800);
  assert.equal(protocol.measuredTicks, preflight ? 60 : 7200);
  assert.equal(protocol.pairs, preflight ? 1 : 5);
  assert.deepEqual(protocol.populations, [70, 110]);
  assert.equal(protocol.offlineInstrumentationBytes, protocol.measuredTicks * 3 * 8);
  assert.equal(report.offlineInstrumentationBytes, protocol.offlineInstrumentationBytes);
  assert.equal(report.fixture, '047-full-native-paced-v2');
  assert.equal(report.runs.length, 4 * protocol.pairs);
  for (const count of [70, 110]) {
    const runs = report.runs.filter((run) => run.count === count);
    assert.equal(runs.length, 2 * protocol.pairs);
    assert.equal(new Set(runs.map((run) => run.trace)).size, 1);
    assert.equal(new Set(runs.map((run) => run.physical)).size, 1);
    for (let pair = 0; pair < protocol.pairs; pair++) {
      const pairRuns = runs.filter((run) => run.pair === pair);
      assert.deepEqual(
        pairRuns.map((run) => run.observer),
        pair % 2 ? [true, false] : [false, true],
      );
      const checkpoint = await readFile(`${folder}/pairs/${count}-${pair}.json`),
        checkpointHash = (
          await readFile(`${folder}/pairs/${count}-${pair}.json.sha256`)
        ).toString();
      assert.equal(digest(checkpoint), checkpointHash);
      const decoded = JSON.parse(checkpoint);
      assert.equal(decoded.sourceHash, binding.sourceHash);
      assert.equal(decoded.nativeHash, binding.native.sha256);
      assert.deepEqual(decoded.protocol, protocol);
      assert.deepEqual(decoded.runs, pairRuns);
    }
  }
  for (const run of report.runs)
    validateLongitudinalFullRun(
      run,
      binding.phase,
      protocol,
      budget,
      aggregateNumeric ? numericFailures : null,
    );
  return { binding, report, budget };
}
const folder = resolve(process.argv[2]),
  beforeFolder =
    process.argv[3]?.startsWith('--') || !process.argv[3] ? null : resolve(process.argv[3]),
  currentOption = process.argv.find((value) => value.startsWith('--current-root='));
const currentRoot = currentOption ? resolve(currentOption.slice('--current-root='.length)) : null;
const actual = await inspect(folder, currentRoot),
  comparisons = [];
if (beforeFolder) {
  const before = await inspect(beforeFolder);
  assert.equal(before.binding.phase, 'before');
  assert.equal(actual.binding.phase, 'after');
  assert(Date.parse(before.binding.capturedAt) < Date.parse(actual.binding.capturedAt));
  assert.deepEqual(before.report.protocol, actual.report.protocol);
  for (const key of ['runtime', 'cpu', 'os', 'fixture', 'budgetVersion'])
    assert.equal(before.report[key], actual.report[key]);
  assert.equal(before.binding.native.sha256, actual.binding.native.sha256);
  assertLongitudinalPowerComparable(before.report.powerStart, actual.report.powerStart);
  const mutable = new Set([
    'src/autonomy/longitudinal-control.ts',
    'src/autonomy/index.ts',
    'src/profiles/parameter-registry.ts',
    'full-origin.json',
  ]);
  for (const input of actual.binding.inputs)
    if (!mutable.has(input.path)) {
      const previous = before.binding.inputs.find((item) => item.path === input.path);
      assert(previous, `Missing common input ${input.path}`);
      assert.equal(previous.sha256, input.sha256, `Common fixture changed ${input.path}`);
    }
  for (const count of [70, 110]) {
    let regressions = 0;
    for (const run of actual.report.runs.filter((run) => run.count === count)) {
      const old = before.report.runs.find(
        (candidate) =>
          candidate.count === count &&
          candidate.pair === run.pair &&
          candidate.observer === run.observer,
      );
      assert.equal(run.trace, old.trace);
      assert.equal(run.physical, old.physical);
      if (
        run.observer &&
        run.tickP95Ms >
          old.tickP95Ms * (1 + actual.budget.regressionProposal.p95RelativeIncrease) &&
        run.tickP95Ms - old.tickP95Ms > actual.budget.regressionProposal.p95AbsoluteIncreaseMs
      )
        regressions++;
    }
    comparisons.push({ count, regressions });
    if (actual.report.protocol.mode === 'full') {
      const accepted = regressions < actual.budget.regressionProposal.confirmationsOutOfFive;
      if (aggregateNumeric && !accepted)
        numericFailures.push({ count, message: 'Full relative regression gate', regressions });
      else if (!aggregateNumeric) assert(accepted, 'Full relative regression gate');
    }
  }
}
console.log(
  JSON.stringify({
    status: numericFailures.length
      ? 'FAIL'
      : actual.report.protocol.mode === 'preflight'
        ? 'TECHNICAL_PREFLIGHT_PASS'
        : 'PASS',
    ...(aggregateNumeric ? { technicalStatus: 'PASS', numericFailures } : {}),
    folder,
    mode: actual.report.protocol.mode,
    sourceHash: actual.binding.sourceHash,
    retrospectiveBefore: actual.binding.origin.retrospectiveBefore,
    comparisons,
    throughputDiagnostics: actual.report.runs.map((run) => ({
      count: run.count,
      pair: run.pair,
      observer: run.observer,
      ratio:
        ((actual.report.protocol.warmupTicks + actual.report.protocol.measuredTicks) * 1000) /
        60 /
        run.elapsedWallMs,
    })),
  }),
);
if (numericFailures.length) process.exitCode = 1;
