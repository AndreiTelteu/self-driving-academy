import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';

const smoke = process.argv.includes('--smoke');
const historical = process.argv.includes('--historical');
const evidence = resolve('Docs/Evidence/022-physics-adapter');
const build = resolve('.pbi-validation-022/build');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifest = await json(resolve(evidence, 'build-manifest.json'));
const budgets = await json('Docs/performance-budgets.json');
const hardware = await json(resolve(evidence, 'hardware.json'));
const browserEvidence = smoke ? null : await json(resolve(evidence, 'browser-verification.json'));
if (browserEvidence) {
  assert.equal(browserEvidence.sourceHash, manifest.sourceHash);
  assert.equal(browserEvidence.artifactHash, manifest.artifactHash);
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const source = createHash('sha256');
assert(Array.isArray(manifest.inputs) && manifest.inputs.length > 0);
assert.equal(new Set(manifest.inputs).size, manifest.inputs.length);
const workspace = resolve('.') + sep;
for (const input of manifest.inputs) {
  const path = historical ? resolve(evidence, 'source-at-capture', input) : resolve(input);
  assert(path.startsWith(workspace), 'Source outside workspace');
  source.update(input).update(await readFile(path));
}
assert.equal(source.digest('hex'), manifest.sourceHash, 'Measured source bytes changed');
assert.equal(manifest.budgetVersion, budgets.budgetVersion);
assert.equal(digest(JSON.stringify(manifest.artifacts)), manifest.artifactHash);
assert(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0);
for (const artifact of manifest.artifacts) {
  const path = resolve(build, artifact.path);
  assert(path.startsWith(build + sep), 'Artifact outside build');
  assert((await stat(path)).isFile());
  const bytes = await readFile(path);
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(digest(bytes), artifact.sha256, `Changed artifact: ${artifact.path}`);
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const finite = (value) => assert(typeof value === 'number' && Number.isFinite(value) && value >= 0);
const verifyCleanup = (cleanup) => {
  assert.deepEqual(cleanup.sceneAfter, cleanup.sceneBaseline);
  assert.deepEqual(cleanup.mappingAfter, { entities: 0, subscriptions: 0 });
  assert.deepEqual(cleanup.physicsBeforeWorldDispose, { vehicles: 0, bodies: 64, colliders: 68 });
  assert.equal(cleanup.worldDisposeCompleted, true);
};
const summaries = [];
for (const backend of ['WEBGPU', 'WEBGL2']) {
  const report = await json(
    resolve(evidence, `${backend.toLowerCase()}${smoke ? '-smoke' : ''}.json`),
  );
  assert.equal(report.fixtureVersion, `022-paired-v1${smoke ? '-SMOKE' : ''}`);
  assert.equal(report.renderer, backend);
  assert.equal(report.identity.sourceHash, manifest.sourceHash);
  assert.equal(report.identity.commit, manifest.commit);
  assert.equal(report.identity.budgetVersion, manifest.budgetVersion);
  assert.equal(report.identity.engineVersion, manifest.engineVersion);
  assert.equal(report.identity.physicsVersion, manifest.physicsVersion);
  assert.deepEqual(report.identity.inputs, manifest.inputs);
  assert.equal(report.artifactHash, manifest.artifactHash);
  assert.deepEqual(report.hardware, hardware);
  assert(hardware.cpu?.length > 0 && hardware.gpu?.length > 0);
  assert(hardware.memory?.reduce((total, dimm) => total + dimm.Capacity, 0) > 0);
  assert(hardware.powerScheme && hardware.os);
  assert.match(report.browser, /Chrome\//);
  assert.deepEqual(report.resolution, [1920, 1080]);
  assert(report.dpr > 0);
  assert(report.actualGpuInfo, 'Actual renderer identification is required');
  if (browserEvidence) {
    const observed = browserEvidence.backends[backend];
    assert.equal(observed.headed, true);
    assert.equal(observed.inspectorClosed, true);
    assert.equal(observed.foregroundObserved, true);
    assert.deepEqual(observed.consoleErrors, []);
    assert.equal(observed.calibration.rotatedTranslatedPoseVerified, true);
    assert.equal(observed.calibration.velocityVerified, true);
    assert.equal(observed.calibration.removeRecreateVerified, true);
    const screenshot = resolve(evidence, observed.calibration.screenshot);
    assert(screenshot.startsWith(evidence + sep));
    assert((await stat(screenshot)).isFile());
    const launchLog = resolve(evidence, observed.headedLaunchEvidence);
    assert(launchLog.startsWith(evidence + sep));
    assert((await stat(launchLog)).isFile());
  }
  assert(
    !/swiftshader|llvmpipe|software rasterizer|basic render driver|\bwarp\b/i.test(
      JSON.stringify(report.actualGpuInfo),
    ),
    'Software GPU is not hardware evidence',
  );
  assert.equal(report.protocol.production, true);
  assert.equal(report.protocol.foreground, true);
  assert.deepEqual(report.protocol.cssResolution, [1920, 1080]);
  assert.deepEqual(report.protocol.internalResolution, [1920, 1080]);
  assert.equal(report.protocol.pairs, smoke ? 1 : 5);
  assert.equal(report.protocol.coldNavigationControlled, false);
  assert.equal(report.limits.physics.vehicles, 110);
  assert.equal(report.limits.physics.bodies, 207);
  assert.equal(report.limits.physics.colliders, 256);
  assert.equal(report.limits.physics.worlds, 1);
  assert.equal(report.limits.physics.hz, 60);
  assert.deepEqual(report.limits.mapping, {
    entities: 110,
    subscriptionsPerBody: 8,
    subscriptions: 880,
  });
  assert.equal(report.runs.length, smoke ? 2 : 10);
  const cap = budgets.proposedBudgets.desktop;
  for (const [index, run] of report.runs.entries()) {
    assert.equal(run.epoch, index);
    assert.equal(
      run.mode,
      (Math.floor(index / 2) % 2 === 0) === (index % 2 === 0) ? 'direct' : 'bridge',
    );
    assert.equal(run.warmupS, smoke ? 1 : budgets.protocol.warmupSeconds);
    assert(run.measuredS >= (smoke ? 3 : budgets.protocol.measuredSeconds));
    assert(run.simulatedToReal >= budgets.proposedBudgets.simulationToActiveWallTimeMinimum);
    assert.equal(run.sampleBytes, 6 * 60000 * 8);
    assert.deepEqual(run.physics, { vehicles: 70, bodies: 134, colliders: 138 });
    assert.deepEqual(run.mapping, { entities: 70, subscriptions: run.mode === 'bridge' ? 70 : 0 });
    assert.deepEqual(run.validity, {
      foreground: true,
      visibilityLost: false,
      deviceLost: false,
      overloadCount: 0,
    });
    verifyCleanup(run.cleanup);
    assert(run.callbacks > 0 && run.callbacks % 70 === 0);
    for (const metric of ['frame', 'main', 'tick', 'step', 'readback', 'dispatch']) {
      const d = run.distributions[metric];
      assert(d && d.count > 0 && d.count <= 60000, `Missing/overflow ${metric}`);
      for (const field of ['min', 'p50', 'p95', 'p99', 'max', 'mean']) finite(d[field]);
      assert(d.min <= d.p50 && d.p50 <= d.p95 && d.p95 <= d.p99 && d.p99 <= d.max);
      assert.equal(
        d.histogram.reduce((a, b) => a + b, 0),
        d.count,
      );
    }
    assert(run.distributions.tick.count / 60 / run.measuredS >= 0.98);
    assert.equal(run.longTasks.finalTaskYieldedAndDrained, true);
    assert(run.longTasks.measuredEndTimestamp > run.longTasks.measuredStartTimestamp);
    assert.equal(run.exactGpuMemory, null);
    assert.equal(run.exactWasmMemory, null);
    assert.equal(run.gpuTimer, null);
    if (!smoke) {
      assert(run.distributions.frame.p95 <= cap.frameP95Ms);
      assert(run.distributions.frame.p99 <= cap.frameP99Ms);
      assert(run.distributions.main.p95 <= cap.mainThreadP95Ms);
      assert(run.distributions.tick.p95 <= cap.authoritativeTickP95Ms);
      assert(run.distributions.step.p95 <= cap.rapierStepP95Ms);
      if (run.longTasks.supported)
        assert(
          run.longTasks.maxMs <=
            budgets.proposedBudgets.normalSteadyStateApplicationLongTaskMaximumMs,
        );
    }
  }
  assert.equal(report.lifecycle.cycles.length, 20);
  assert.deepEqual(report.lifecycle.after, report.lifecycle.baseline);
  for (const [index, cycle] of report.lifecycle.cycles.entries()) {
    assert.equal(cycle.cycle, index);
    assert.deepEqual(cycle.physics, { vehicles: 70, bodies: 134, colliders: 138 });
    assert.deepEqual(cycle.mapping, { entities: 70, subscriptions: 1 });
    assert.deepEqual(cycle.peakMapping, { entities: 70, subscriptions: 2 });
    assert.equal(cycle.staleCalls, 1);
    assert.equal(cycle.oldUnsubscribeDidNotAffectNew, true);
    verifyCleanup(cycle.cleanup);
  }
  const comparisons = [];
  for (let pair = 0; pair < (smoke ? 1 : 5); pair++) {
    const arms = report.runs.slice(pair * 2, pair * 2 + 2);
    const direct = arms.find((run) => run.mode === 'direct');
    const bridge = arms.find((run) => run.mode === 'bridge');
    comparisons.push(
      Object.fromEntries(
        ['frame', 'main', 'tick', 'step', 'readback', 'dispatch'].map((metric) => {
          const baseline = direct.distributions[metric].p95;
          const current = bridge.distributions[metric].p95;
          const deltaMs = current - baseline;
          const regression =
            deltaMs > budgets.regressionProposal.p95AbsoluteIncreaseMs &&
            current > baseline * (1 + budgets.regressionProposal.p95RelativeIncrease);
          return [metric, { directP95Ms: baseline, bridgeP95Ms: current, deltaMs, regression }];
        }),
      ),
    );
  }
  if (!smoke)
    for (const metric of ['frame', 'main', 'tick', 'step']) {
      assert(
        comparisons.filter((pair) => pair[metric].regression).length <
          budgets.regressionProposal.confirmationsOutOfFive,
        `Confirmed regression: ${backend} ${metric}`,
      );
    }
  summaries.push({
    backend,
    comparisons,
    bridgeMedianP95Ms: Object.fromEntries(
      ['frame', 'main', 'tick', 'step', 'readback', 'dispatch'].map((metric) => [
        metric,
        median(
          report.runs
            .filter((run) => run.mode === 'bridge')
            .map((run) => run.distributions[metric].p95),
        ),
      ]),
    ),
    resourceCleanup: report.lifecycle,
    longTasksSupported: report.runs.every((run) => run.longTasks.supported),
    exactGpuMemory: null,
    exactWasmMemory: null,
    gpuTimer: null,
  });
}
await writeFile(
  resolve(
    evidence,
    `${historical ? 'historical-' : ''}${smoke ? 'smoke-summary.json' : 'summary.json'}`,
  ),
  JSON.stringify(
    {
      fixtureVersion: smoke ? '022-paired-v1-SMOKE' : '022-paired-v1',
      commit: manifest.commit,
      sourceHash: manifest.sourceHash,
      artifactHash: manifest.artifactHash,
      artifactsVerified: manifest.artifacts.length,
      ...(historical
        ? {
            historicalSources:
              'Explicit --historical: exact source closure archived before PBI023 extended vehicle mechanics; original report identity and artifact bytes verified unchanged',
          }
        : {}),
      budgetVersion: manifest.budgetVersion,
      verification: smoke
        ? 'SMOKE_ONLY_NOT_PERFORMANCE_ACCEPTANCE'
        : 'EARLY_ADAPTER_DESKTOP_ACCEPTED',
      gameplayGate: 'NOT_VALIDATED',
      laptopGate: 'NOT_VALIDATED',
      memoryScope:
        'Bounded owned-resource counts; exact heap/WASM/GPU memory unavailable; no overlapping categories summed',
      summaries,
    },
    null,
    2,
  ),
);
console.log(
  `022 ${smoke ? 'smoke' : 'desktop adapter'}: PASS; source bytes, ${manifest.artifacts.length} artifacts, both backends, paired arms and 20 cleanup cycles verified`,
);
