import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const folder = 'Docs/Evidence/023-vehicle-classes';
const historical = process.argv.includes('--historical');
const sourcePath = (path) => (historical ? `${folder}/source-at-capture/${path}` : path);
const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const budgets = await read(sourcePath('Docs/performance-budgets.json'));
const manifest = await read(`${folder}/build-manifest.json`);
const errors = [];
const check = (ok, message) => {
  if (!ok) errors.push(message);
};
if (historical) {
  const accepted = await read(`${folder}/summary.json`);
  check(
    accepted.status === 'PASS' &&
      accepted.mode === 'current' &&
      accepted.identity.sourceHash === manifest.sourceHash &&
      accepted.identity.artifactHash === manifest.artifactHash,
    'Historical validation requires matching successful current-source artifact acceptance',
  );
}
const source = createHash('sha256');
for (const path of manifest.inputs) source.update(path).update(await readFile(sourcePath(path)));
check(
  source.digest('hex') === manifest.sourceHash,
  `${historical ? 'Archived' : 'Current'} source identity differs from capture`,
);
check(
  createHash('sha256').update(JSON.stringify(manifest.artifacts)).digest('hex') ===
    manifest.artifactHash,
  'Artifact manifest hash mismatch',
);
for (const artifact of historical ? [] : manifest.artifacts) {
  const bytes = await readFile(resolve('.pbi-validation-023/build', artifact.path));
  check(
    bytes.length === artifact.bytes &&
      createHash('sha256').update(bytes).digest('hex') === artifact.sha256,
    `Artifact mismatch ${artifact.path}`,
  );
}
const summary = {
  status: 'PENDING',
  mode: historical ? 'historical' : 'current',
  artifactValidation: historical
    ? 'Captured artifact manifest hash checked; artifact bytes were checked at acceptance and are not rechecked in historical mode.'
    : 'Current artifact bytes and captured artifact manifest hash checked.',
  identity: manifest,
  backends: {},
  scope: 'Early physics classes desktop, not full gameplay/laptop gate.',
};
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (const backend of ['webgpu', 'webgl2']) {
  const report = await read(`${folder}/${backend}.json`);
  const before = await read(`Docs/Evidence/022-physics-adapter/${backend}.json`);
  const classes = await read(`${folder}/classes-${backend}.json`);
  check(
    report.fixtureVersion === '023-classes-v2' &&
      report.protocol.production &&
      report.protocol.foreground &&
      report.protocol.pairs === 5 &&
      report.protocol.warmupS === 30 &&
      report.protocol.measuredTargetS === 120 &&
      report.protocol.cssResolution[0] === 1920 &&
      report.protocol.cssResolution[1] === 1080 &&
      report.protocol.internalResolution[0] === 1920 &&
      report.protocol.internalResolution[1] === 1080,
    `${backend}: full production protocol and CSS/internal resolution`,
  );
  check(
    report.renderer === (backend === 'webgpu' ? 'WEBGPU' : 'WEBGL2') &&
      report.resolution[0] === 1920 &&
      report.resolution[1] === 1080 &&
      report.dpr === 1 &&
      /amd/i.test(JSON.stringify(report.actualGpuInfo)) &&
      !/swiftshader|llvmpipe|software/i.test(JSON.stringify(report.actualGpuInfo)),
    `${backend}: actual hardware backend and viewport`,
  );
  check(
    report.identity.sourceHash === manifest.sourceHash &&
      report.artifactHash === manifest.artifactHash,
    `${backend}: report identity`,
  );
  check(
    classes.identity.sourceHash === manifest.sourceHash &&
      classes.artifactHash === manifest.artifactHash,
    `${backend}: visual identity`,
  );
  check(
    report.runs.length === 10 && report.lifecycle.cycles.length === 20,
    `${backend}: full protocol/cycles`,
  );
  const expectedOrder = [
    'default',
    'mixed',
    'mixed',
    'default',
    'default',
    'mixed',
    'mixed',
    'default',
    'default',
    'mixed',
  ];
  check(
    report.runs.every((run, index) => run.epoch === index && run.mode === expectedOrder[index]),
    `${backend}: alternating paired order and sequential epochs`,
  );
  check(
    JSON.stringify(report.hardware.cpu) === JSON.stringify(before.hardware.cpu) &&
      JSON.stringify(report.hardware.gpu) === JSON.stringify(before.hardware.gpu),
    `${backend}: hardware changed`,
  );
  for (const run of report.runs) {
    const d = run.distributions,
      b = budgets.proposedBudgets.desktop;
    check(run.warmupS === 30 && run.measuredS >= 120, `${backend}:${run.epoch} protocol`);
    check(
      d.frame.p95 <= b.frameP95Ms &&
        d.frame.p99 <= b.frameP99Ms &&
        d.main.p95 <= b.mainThreadP95Ms &&
        d.tick.p95 <= b.authoritativeTickP95Ms &&
        d.step.p95 <= b.rapierStepP95Ms,
      `${backend}:${run.epoch} absolute budgets`,
    );
    check(
      run.simulatedToReal >= budgets.proposedBudgets.simulationToActiveWallTimeMinimum &&
        run.validity.foreground &&
        !run.validity.visibilityLost &&
        !run.validity.deviceLost &&
        run.validity.overloadCount === 0,
      `${backend}:${run.epoch} validity/throughput`,
    );
    check(
      run.longTasks.maxMs <= budgets.proposedBudgets.normalSteadyStateApplicationLongTaskMaximumMs,
      `${backend}:${run.epoch} longtask`,
    );
    check(
      run.physics.vehicles === 70 && run.physics.bodies === 134 && run.physics.colliders === 138,
      `${backend}:${run.epoch} retained physical workload`,
    );
    check(
      run.mapping.entities === 70 && run.mapping.subscriptions === 70,
      `${backend}:${run.epoch} identical bridge`,
    );
  }
  for (const item of [...report.runs, ...report.lifecycle.cycles]) {
    const c = item.cleanup;
    check(
      c.worldDisposeCompleted &&
        c.mappingAfter.entities === 0 &&
        c.mappingAfter.subscriptions === 0 &&
        JSON.stringify(c.sceneBaseline) === JSON.stringify(c.sceneAfter),
      `${backend}: cleanup`,
    );
    check(
      c.physicsBeforeWorldDispose.vehicles === 0 &&
        c.physicsBeforeWorldDispose.bodies === 64 &&
        c.physicsBeforeWorldDispose.colliders === 68,
      `${backend}: native cleanup`,
    );
  }
  const defaults = report.runs.filter((r) => r.mode === 'default'),
    mixed = report.runs.filter((r) => r.mode === 'mixed'),
    old = before.runs.filter((r) => r.mode === 'bridge');
  check(defaults.length === 5 && mixed.length === 5 && old.length === 5, `${backend}: paired arms`);
  const metrics = {};
  for (const metric of ['frame', 'main', 'tick', 'step', 'readback', 'dispatch']) {
    const prior = old.map((r) => r.distributions[metric].p95),
      current = defaults.map((r) => r.distributions[metric].p95),
      newer = mixed.map((r) => r.distributions[metric].p95);
    const regressions = current.filter(
      (value, index) => value > prior[index] * 1.1 && value - prior[index] > 1,
    ).length;
    check(regressions < 3, `${backend}:${metric} default compatibility regression`);
    metrics[metric] = {
      beforeMedianP95Ms: median(prior),
      defaultMedianP95Ms: median(current),
      mixedMedianP95Ms: median(newer),
      incrementalMixedMs: median(newer) - median(current),
      compatibilityRegressions: regressions,
    };
  }
  check(
    classes.classes[1].accelerationSpeedMps > classes.classes[0].accelerationSpeedMps * 1.15 &&
      classes.classes[1].brakingDistanceM < classes.classes[0].brakingDistanceM * 0.95,
    `${backend}: actual class differences`,
  );
  summary.backends[backend] = {
    metrics,
    comparison: classes.classes,
    baselineIdentity: before.identity,
    baselineArtifactHash: before.artifactHash,
    sampleBytes: report.runs[0].sampleBytes,
    exactWasmMemory: null,
    exactGpuMemory: null,
  };
}
summary.status = errors.length ? 'FAIL' : 'PASS';
summary.errors = errors;
await writeFile(
  `${folder}/${historical ? 'historical-summary' : 'summary'}.json`,
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify({ status: summary.status, errors }));
if (errors.length) process.exitCode = 1;
