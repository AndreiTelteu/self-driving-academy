import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const folder = 'Docs/Evidence/052-yield-policy';
const budgets = JSON.parse(await readFile('Docs/performance-budgets.json', 'utf8'));
for (const backend of ['webgpu', 'webgl2']) {
  const report = JSON.parse(await readFile(`${folder}/drive-${backend}.json`, 'utf8'));
  assert.equal(report.fixtureVersion, '052-yield-browser-v1');
  assert.equal(report.full, true);
  assert.equal(report.foreground, true);
  assert.equal(report.renderer, backend.toUpperCase());
  assert.equal(report.dpr, 1);
  assert.deepEqual(report.cssResolution, [1920, 1080]);
  assert.deepEqual(report.internalResolution, [1920, 1080]);
  assert(report.identity.sourceHash && report.artifactHash && report.hardware);
  assert.equal(report.runs.length, 10);
  assert.equal(report.calibration.length, 4);
  for (const classId of ['sedan', 'compact']) {
    const risky = report.calibration.find((r) => r.classId === classId && r.thresholdS === 0.2),
      prudent = report.calibration.find((r) => r.classId === classId && r.thresholdS === 3);
    assert(risky.firstEntryTick < prudent.firstEntryTick);
    assert(risky.collisionTick !== null && risky.maxImpulseNs > 0);
    assert.equal(prudent.collisionTick, null);
    assert(
      risky.evidence.some(
        (e) => e.kind === 'CROSSED_WITH_PRIORITY_EXPOSURE' && e.learningEligible === null,
      ),
    );
  }
  let regressions = 0;
  for (let pair = 0; pair < 5; pair++) {
    const reference = report.runs.find((r) => r.pair === pair && !r.current),
      current = report.runs.find((r) => r.pair === pair && r.current);
    assert.equal(reference.commandDigest, current.commandDigest);
    assert.deepEqual(reference.finalCrossingBodies, current.finalCrossingBodies);
    for (const run of [reference, current]) {
      assert.equal(run.warmupSeconds, 30);
      assert.equal(run.measuredSeconds, 120);
      assert(
        run.simulationToActiveWallTime >= budgets.proposedBudgets.simulationToActiveWallTimeMinimum,
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
      assert.equal(run.memory.cars, 70);
      assert.equal(run.memory.retainedProductionHistory, 0);
      assert.equal(run.cleanup.bodies.entities, 0);
      assert.equal(run.cleanup.controller.vehicles, 0);
      assert.equal(run.cleanup.priority.vehicles, 0);
      assert.equal(run.cleanup.collision.colliders, 0);
    }
    if (
      ['frame', 'main', 'tick'].some(
        (metric) =>
          current.stats[metric].p95 - reference.stats[metric].p95 > 1 &&
          current.stats[metric].p95 > reference.stats[metric].p95 * 1.1,
      )
    )
      regressions++;
  }
  assert(regressions < 3, 'Confirmed hardware regression');
}
console.log(
  JSON.stringify({
    verified: true,
    scope: 'Actual052bothbackends; one active policy subject, not full fleet/game/laptop',
  }),
);
