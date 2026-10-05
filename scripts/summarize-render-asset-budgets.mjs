import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir = 'Docs/Evidence/223-render-assets';
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const output = {
  schemaVersion: 1,
  budgetVersion: '203-initial-1',
  capVersion: '223-initial-1',
  scope:
    'Early presentation fixture on available real desktop. Not full gameplay/laptop/final-asset calibration.',
  backends: [],
};
const correction = JSON.parse(await readFile(`${dir}/metadata-correction.json`, 'utf8'));
assert.equal(correction.rendererAndTimedWorkloadUnchanged, true);
for (const backend of ['webgpu', 'webgl2']) {
  const report = JSON.parse(await readFile(`${dir}/${backend}.json`, 'utf8'));
  assert.equal(report.fixtureVersion, '223-render-assets-v1');
  const arms = ['global-normal', 'local-thin'].map((mode) => {
    const runs = report.runs.filter((run) => run.mode === mode);
    assert.equal(runs.length, 5);
    for (const run of runs) {
      assert.equal(run.role, 'STEADY_STATE');
      assert.equal(run.warmupMs, 30000);
      assert.ok(run.measuredMs >= 120000);
      assert.ok(run.authorityUnchanged);
      assert.deepEqual(run.diagnostics, []);
      assert.equal(run.longTasks.dropped, 0);
      if (run.longTasks.available) assert.ok(run.longTasks.maxMs <= 50, 'Steady-state long task');
    }
    return {
      mode,
      repetitions: runs.map((run) => ({
        repeat: run.repeat,
        frameP95Ms: run.frame.p95,
        frameP99Ms: run.frame.p99,
        mainThreadP95Ms: run.mainThread.p95,
        drawCallsMax: run.drawCalls.max,
        trackedCounters: run.trackedCounters,
      })),
      frameP95Ms: median(runs.map((run) => run.frame.p95)),
      frameP99Ms: median(runs.map((run) => run.frame.p99)),
      mainThreadP95Ms: median(runs.map((run) => run.mainThread.p95)),
      drawCallsMax: Math.max(...runs.map((run) => run.drawCalls.max)),
    };
  });
  const [baseline, after] = arms;
  const confirmations = { frame: 0, mainThread: 0, trackedMatrixBytes: 0 };
  for (let i = 0; i < 5; i++)
    for (const [metric, key] of [
      ['frame', 'frameP95Ms'],
      ['mainThread', 'mainThreadP95Ms'],
    ]) {
      const delta = after.repetitions[i][key] - baseline.repetitions[i][key];
      if (delta > 1 && delta > baseline.repetitions[i][key] * 0.1) confirmations[metric]++;
    }
  for (let index = 0; index < 5; index++) {
    const beforeBytes = baseline.repetitions[index].trackedCounters.matrixBufferBytes;
    const afterBytes = after.repetitions[index].trackedCounters.matrixBufferBytes;
    const delta = afterBytes - beforeBytes;
    if (delta > 5 * 1024 * 1024 && delta > beforeBytes * 0.1) confirmations.trackedMatrixBytes++;
  }
  const regression = Object.values(confirmations).some((n) => n >= 3);
  const absolutePass = after.repetitions.every(
    (run) => run.frameP95Ms <= 18.5 && run.frameP99Ms <= 25 && run.mainThreadP95Ms <= 10,
  );
  assert.equal(regression, false, `${backend} repeated CPU/frame regression`);
  assert.equal(absolutePass, true, `${backend} desktop early fixture over absolute proposal`);
  assert.equal(report.oversized.accepted, false);
  assert.equal(report.cycles.length, 20);
  assert.deepEqual(report.cleanup.before, report.cleanup.after);
  // Preserve the original detached-canvas field; independent source reconstruction
  // and real-backend smokes certify this post-measurement metadata correction.
  const cssProof = correction.backends.find((entry) => entry.backend === report.backend);
  assert.equal(report.identity.sourceHash, cssProof.measurementSourceHash);
  assert.deepEqual(report.cssResolution, cssProof.measuredCssField);
  assert.deepEqual(cssProof.independentlyVerifiedCss, [1920, 1080]);
  assert.equal(report.loading.length, 5);
  for (const load of report.loading)
    assert.deepEqual(load.diagnostics, [], `${backend} asset load/first-use over budget`);
  assert.equal(report.rejectedAsset.decodeLoads, 0);
  assert.equal(report.adaptation.downgraded.preset, 'LOW');
  assert.equal(report.adaptation.upgraded.preset, 'MEDIUM');
  assert.deepEqual(
    report.runs.slice(0, 10).map((run) => run.mode),
    Array.from({ length: 5 }, () => ['global-normal', 'local-thin']).flat(),
  );
  for (const proof of report.functional) {
    assert.equal(proof.pickNear, 'vehicle-0');
    assert.equal(proof.pickMoving, 'vehicle-0');
    assert.equal(proof.distant, 'vehicle-0');
    assert.equal(proof.signalMutable, true);
    assert.equal(proof.qualitySwitch.low.internalWidth, 960);
    assert.equal(proof.qualitySwitch.restored.internalWidth, 1920);
    assert.equal(proof.qualitySwitch.authorityUnchanged, true);
  }
  output.backends.push({
    backend: report.backend,
    identity: report.identity,
    arms,
    confirmations,
    regression,
    absolutePass,
    load: {
      coldMedianMs: median(report.loading.map((r) => r.coldMs)),
      warmMedianMs: median(report.loading.map((r) => r.warmMs)),
      firstUseMs: report.loading.map((r) => r.firstUseMs),
      diagnostics: report.loading.map((r) => r.diagnostics),
    },
    auxiliary: report.runs
      .filter((r) => r.role === 'ISOLATED_AUXILIARY')
      .map((r) => ({
        mode: r.mode,
        repeat: r.repeat,
        mainThread: r.mainThread,
        drawCalls: r.drawCalls,
        activeMeshes: r.activeMeshes,
      })),
    gpuMs: null,
    exactGpuBytes: null,
    nativeDecoderWorkspaceBytes: null,
    hardware: report.hardware,
    cssMetadata: cssProof,
    metadataCorrection: correction,
  });
}
await writeFile(`${dir}/summary.json`, JSON.stringify(output, null, 2));
console.log(
  JSON.stringify(
    output.backends.map(({ backend, arms, regression, absolutePass }) => ({
      backend,
      arms: arms.map(({ mode, frameP95Ms, frameP99Ms, mainThreadP95Ms, drawCallsMax }) => ({
        mode,
        frameP95Ms,
        frameP99Ms,
        mainThreadP95Ms,
        drawCallsMax,
      })),
      regression,
      absolutePass,
    })),
    null,
    2,
  ),
);
