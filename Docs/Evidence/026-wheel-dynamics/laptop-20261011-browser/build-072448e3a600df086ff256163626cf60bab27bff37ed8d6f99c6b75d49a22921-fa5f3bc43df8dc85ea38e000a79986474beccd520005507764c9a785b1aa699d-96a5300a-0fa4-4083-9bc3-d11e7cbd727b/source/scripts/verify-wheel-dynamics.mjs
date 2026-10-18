import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  readNative,
  readCurrentNative,
  BEFORE_SOURCE,
  AFTER_SOURCE,
} from '../tests/browser/wheel-dynamics-v2/numeric-reader.mjs';
const folder = 'Docs/Evidence/026-wheel-dynamics';
const reference =
  process.argv
    .find((argument) => argument.startsWith('--reference='))
    ?.slice('--reference='.length) ?? 'historical';
assert(
  ['current', 'historical'].includes(reference),
  'Choose explicit current/historical reference',
);
const current = reference === 'current' ? await readCurrentNative() : null;
const before = await readNative(`${folder}/before`, 'before', BEFORE_SOURCE);
const captureArgument = process.argv.find((argument) => argument.startsWith('--after-capture='));
const afterCapture =
  captureArgument?.slice('--after-capture='.length) ??
  current?.pins.afterCapture ??
  'after-main-027';
assert(/^[a-z0-9-]+$/.test(afterCapture), 'Invalid immutable AFTER capture');
assert.equal(
  afterCapture,
  current?.pins.afterCapture ?? 'after-main-027',
  'Pinned reference namespace only',
);
const after =
  current?.after ?? (await readNative(`${folder}/${afterCapture}`, 'after', AFTER_SOURCE));
const originalCalibrationBytes = await readFile(`${folder}/calibration-v2.json`);
assert.equal(
  createHash('sha256').update(originalCalibrationBytes).digest('hex'),
  'd8f7d9022f00d26399baba91ee9591132ac89d818c1c4711108c243e06b47e6c',
);
const calibration = current?.calibration ?? JSON.parse(originalCalibrationBytes);
const budgets = JSON.parse(await readFile('Docs/performance-budgets.json', 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const [name, report] of [
  ['before', before],
  ['after', after],
]) {
  assert.equal(report.phase, name);
  assert.equal(report.runs.length, 10);
  assert.equal(report.fixture, '026-many-contact-projection-v1');
  assert.equal(hash(await readFile(report.native.archive)), report.native.sha256);
  for (const input of report.inputs)
    assert.equal(
      hash(
        await readFile(`${folder}/${name === 'after' ? afterCapture : name}/source/${input.path}`),
      ),
      input.sha256,
    );
  for (const run of report.runs) {
    assert.equal(run.warmupTicks, 180);
    assert.equal(run.measuredTicks, 600);
    assert.deepEqual(run.physics, { vehicles: 70, bodies: 134, colliders: 138 });
    assert.equal(run.cleanup.bodies.entities, 0);
    assert.equal(run.cleanup.collisions.colliders, 0);
    assert.equal(run.cleanup.disposedReadRejected, true);
  }
}
assert.equal(before.native.sha256, after.native.sha256);
const increases = { tick: 0, projection: 0 };
const comparisons = [];
for (let i = 0; i < 10; i++) {
  const a = before.runs[i],
    b = after.runs[i];
  assert.equal(a.pair, b.pair);
  assert.equal(a.observe, b.observe);
  assert.equal(a.inputHash, b.inputHash);
  assert.equal(a.physicalHash, b.physicalHash);
  if (a.observe && !current) {
    const incremental = {};
    for (const metric of ['tick', 'projection']) {
      incremental[metric] = b.metrics[metric].p95 - a.metrics[metric].p95;
      if (
        incremental[metric] > budgets.regressionProposal.p95AbsoluteIncreaseMs &&
        b.metrics[metric].p95 >
          a.metrics[metric].p95 * (1 + budgets.regressionProposal.p95RelativeIncrease)
      )
        increases[metric]++;
    }
    assert(b.metrics.tick.p95 <= budgets.proposedBudgets.desktop.authoritativeTickP95Ms);
    comparisons.push({ pair: a.pair, incrementalP95Ms: incremental });
  }
}
if (current) {
  for (const pair of current.matchedNative.pairs) {
    const incremental = {};
    for (const metric of ['tick', 'projection']) {
      const { beforeP95Ms, afterP95Ms } = pair.metrics[metric];
      incremental[metric] = afterP95Ms - beforeP95Ms;
      if (
        incremental[metric] > budgets.regressionProposal.p95AbsoluteIncreaseMs &&
        afterP95Ms > beforeP95Ms * (1 + budgets.regressionProposal.p95RelativeIncrease)
      )
        increases[metric]++;
    }
    assert(pair.metrics.tick.afterP95Ms <= budgets.proposedBudgets.laptop.authoritativeTickP95Ms);
    comparisons.push({ pair: pair.pair, incrementalP95Ms: incremental });
  }
}
for (const metric of ['tick', 'projection'])
  assert(
    increases[metric] < budgets.regressionProposal.confirmationsOutOfFive,
    `Confirmed ${metric} regression`,
  );
for (const classId of ['sedan', 'compact']) {
  const get = (surface, speed, scenario) =>
    calibration.runs.find(
      (r) =>
        r.classId === classId &&
        r.surface === surface &&
        r.speedMps === speed &&
        r.scenario === scenario,
    );
  for (const speed of [10, 20, 30]) {
    const dry = get('dry-asphalt', speed, 'braking'),
      reduced = get('reduced-adhesion', speed, 'braking');
    assert(dry.stopped && reduced.stopped);
    assert(reduced.brakingDistanceM > dry.brakingDistanceM * 1.1);
    assert.equal(dry.mechanics.surface.id, 'dry-asphalt');
    assert.equal(reduced.mechanics.surface.id, 'reduced-adhesion');
    assert(reduced.mechanics.grip < dry.mechanics.grip);
  }
  assert(
    get('dry-asphalt', 20, 'turning').maxWheelLateralMps >
      get('dry-asphalt', 8, 'turning').maxWheelLateralMps + 0.5,
  );
}
if (process.argv.includes('--browser')) {
  assert.equal(
    reference,
    'historical',
    'Legacy browser verifier cannot accept a current v2 build; use verifySuite current binding',
  );
  for (const backend of ['webgpu', 'webgl2']) {
    const report = JSON.parse(await readFile(`${folder}/drive-${backend}.json`, 'utf8'));
    assert.equal(report.full, true);
    assert.equal(report.foreground, true);
    assert.equal(report.dpr, 1);
    assert.equal(report.renderer, backend.toUpperCase());
    assert.deepEqual(report.cssResolution, [1920, 1080]);
    assert.deepEqual(report.internalResolution, [1920, 1080]);
    assert.equal(report.runs.length, 10);
    let frameRegressions = 0,
      mainRegressions = 0;
    for (let pair = 0; pair < 5; pair++) {
      const a = report.runs.find((r) => r.pair === pair && !r.current),
        b = report.runs.find((r) => r.pair === pair && r.current);
      for (const run of [a, b]) {
        assert.equal(run.warmupSeconds, 30);
        assert.equal(run.measuredSeconds, 120);
        assert.equal(run.overloadCount, 0);
        assert(
          run.simulationToActiveWallTime >=
            budgets.proposedBudgets.simulationToActiveWallTimeMinimum,
        );
        assert(run.stats.frame.p95 <= budgets.proposedBudgets.desktop.frameP95Ms);
        assert(run.stats.frame.p99 <= budgets.proposedBudgets.desktop.frameP99Ms);
        assert(run.stats.main.p95 <= budgets.proposedBudgets.desktop.mainThreadP95Ms);
        assert(run.stats.tick.p95 <= budgets.proposedBudgets.desktop.authoritativeTickP95Ms);
        assert(run.stats.step.p95 <= budgets.proposedBudgets.desktop.rapierStepP95Ms);
        if (run.longTasks.supported)
          assert(
            run.longTasks.maxMs <=
              budgets.proposedBudgets.normalSteadyStateApplicationLongTaskMaximumMs,
          );
        assert.equal(run.memory.worlds, 1);
        assert.equal(run.memory.retainedWheelHistory, 0);
        assert.equal(run.memory.wheelMeshes, 280);
        assert.equal(run.memory.chassisMeshes, 70);
      }
      const regression = (metric) =>
        b.stats[metric].p95 - a.stats[metric].p95 >
          budgets.regressionProposal.p95AbsoluteIncreaseMs &&
        b.stats[metric].p95 >
          a.stats[metric].p95 * (1 + budgets.regressionProposal.p95RelativeIncrease);
      if (regression('frame')) frameRegressions++;
      if (regression('main')) mainRegressions++;
    }
    assert(frameRegressions < 3 && mainRegressions < 3, 'Confirmed hardware regression');
  }
}
console.log(
  JSON.stringify(
    {
      verified: true,
      afterCapture,
      reference,
      acceptance:
        reference === 'current' ? 'NATIVE_ONLY_NOT_BROWSER_OR_HARDWARE' : 'HISTORICAL_ONLY',
      comparisons,
      browserVerified: process.argv.includes('--browser'),
      scope: 'Early native wheel fixture, not game/laptop gates',
    },
    null,
    2,
  ),
);
