// Evidence-only independent verification. Never starts a renderer, build or benchmark.
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('.');
const args = process.argv.slice(2);
const historical = args.includes('--historical');
assert(args.length === (historical ? 3 : 2), 'Expected capture/backend and optional --historical');
const [captureId, renderer] = args.filter((argument) => argument !== '--historical');
assert.match(captureId ?? '', /^[0-9TZ]{18,24}$/);
assert(
  ['WEBGPU', 'WEBGL2'].includes(renderer),
  'Usage: node scripts/verify-scheduling-hardware-evidence.mjs <captureId> <WEBGPU|WEBGL2>',
);
const prefix = renderer.toLowerCase();
const directory = join(root, 'Docs/Evidence/219-simulation-scheduling/hardware', captureId);
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => assert.deepEqual(a, b);
const range = (values) => ({ min: Math.min(...values), max: Math.max(...values) });
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const manifest = read(join(directory, 'build-manifest.json'));
const comparison = read(join(directory, `${prefix}-both-comparison.json`));
const names = readdirSync(directory).filter(
  (name) => name.startsWith(prefix + '-') && name.endsWith('.json'),
);
const failureFiles = names.filter((name) => name.includes('failure'));
assert.equal(failureFiles.length, 0, 'Retained protocol failure must block acceptance');
const runFiles = names.filter((name) =>
  new RegExp(`^${prefix}-(unphased_reference|entity_phased)-[1-5]-(off|on)[.]json$`).test(name),
);
assert.equal(runFiles.length, 20);
const reports = runFiles.map((name) => ({ name, report: read(join(directory, name)) }));
const sourceHash = '995b6fbaa5d2f9cd42bca0bac4c9dc70f2dac89df85ae92c3705b7f14f78bcb3';
const artifactHash = '784022537c183d72b1c001e243fc16b5dc573f7834e7e3747a8b4beb4d51dc50';
assert.equal(manifest.commit, '4096b8d83b6399a01e7bf0db16b28e5faae32479');
assert.equal(manifest.sourceHash, sourceHash);
assert.equal(manifest.artifactHash, artifactHash);
const archive = join(
  root,
  'Docs/Evidence/219-simulation-scheduling/hardware',
  `source-${sourceHash}`,
);
const sourceAggregate = createHash('sha256');
const sourceFiles = manifest.inputs.map((path) => {
  const bytes = readFileSync(join(archive, path));
  if (!historical) equal(bytes, readFileSync(join(root, path)));
  sourceAggregate.update(path).update(bytes);
  return { path, bytes: bytes.length, sha256: sha(bytes), currentChecked: !historical };
});
assert.equal(sourceFiles.length, 80);
assert.equal(sourceAggregate.digest('hex'), sourceHash);
assert.equal(sha(JSON.stringify(manifest.artifacts)), artifactHash);
const artifactArchive = join(
  root,
  'Docs/Evidence/219-simulation-scheduling/hardware',
  `artifacts-${artifactHash}.zip`,
);
const archiveBytes = readFileSync(artifactArchive);
const archiveInventory = JSON.parse(
  execFileSync(
    'python',
    [
      '-c',
      `
import sys,json,hashlib,zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    names=archive.namelist()
    if len(set(names)) != len(names): raise RuntimeError('Duplicate archive entries')
    if archive.testzip() is not None: raise RuntimeError('Artifact archive CRC failure')
    rows=[]
    for name in names:
        if name.startswith('/') or '..' in name.split('/') or '\\\\' in name: raise RuntimeError('Unsafe artifact archive entry')
        data=archive.read(name)
        rows.append({'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
    print(json.dumps(rows))
`,
      artifactArchive,
    ],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  ),
);
const artifactFiles = manifest.artifacts.map((item) => {
  const archived = archiveInventory.find((entry) => entry.path === item.path);
  equal(archived, item);
  return { ...item, archivedBytesMatch: true };
});
assert.equal(archiveInventory.length, artifactFiles.length + 1);
const archivedManifest = archiveInventory.find((entry) => entry.path === 'build-manifest.json');
assert.equal(archivedManifest.sha256, sha(readFileSync(join(directory, 'build-manifest.json'))));
assert.equal(artifactFiles.length, 141);
const identity = { ...manifest };
delete identity.artifactHash;
delete identity.artifacts;
delete identity.note;
const metadataKeys = [
  'identity',
  'artifactHash',
  'captureId',
  'browser',
  'renderer',
  'actualGpuInfo',
  'preset',
  'adaptiveQuality',
  'cssResolution',
  'internalResolution',
  'dpr',
  'network',
  'inspector',
  'workload',
  'chronologicalBaseline',
  'hardware',
];
const metadata = Object.fromEntries(metadataKeys.map((key) => [key, comparison[key]]));
equal(metadata.identity, identity);
assert.equal(metadata.captureId, captureId);
assert.equal(metadata.renderer, renderer);
assert.match(metadata.actualGpuInfo.vendor, /AMD/i);
assert.match(
  metadata.actualGpuInfo.renderer,
  renderer === 'WEBGL2' ? /AMD Radeon RX 7900 XTX/ : /rdna-3/i,
);
assert.doesNotMatch(metadata.actualGpuInfo.renderer, /swiftshader|llvmpipe|software|basic render/i);
equal(metadata.cssResolution, [1920, 1080]);
equal(metadata.internalResolution, [1920, 1080]);
assert.equal(metadata.dpr, 1);
assert.equal(metadata.adaptiveQuality, false);
assert.equal(metadata.preset, 'MEDIUM_FIXED_EARLY_FIXTURE');
equal(metadata.hardware, read(join(directory, 'hardware.json')));
const runs = [];
for (const { name, report } of reports) {
  equal(Object.fromEntries(metadataKeys.map((key) => [key, report[key]])), metadata);
  assert.equal(report.smoke, false);
  assert.equal(report.kind, 'run');
  const r = report.run;
  assert.equal(
    name,
    `${prefix}-${report.arm.toLowerCase()}-${r.repeat}-${r.observe ? 'on' : 'off'}.json`,
  );
  assert(r.warmupElapsedMs >= 30000);
  assert(r.measuredRafSpanMs >= 120000);
  assert(r.measuredElapsedMs >= 120000);
  assert(r.frameMs.count > 0 && r.frameMs.count <= 60000);
  assert.equal(r.frameMs.count, r.mainThreadMs.count);
  const ratio = r.simulatedSecondsDuringMeasure / (r.measuredRafSpanMs / 1000);
  assert(Math.abs(ratio - r.simulatedToWallRatio) < 1e-12);
  assert(ratio >= 0.98);
  assert.equal(r.finalState.status, 'running');
  assert(r.finalState.debtSeconds < 0.25);
  assert.equal(r.counts.vehicles, 70);
  assert.equal(r.counts.controllers, r.counts.physicsSteps * 70);
  assert.equal(r.counts.physicsSteps, r.finalState.tick);
  assert.equal(r.finalState.simulatedSeconds, r.finalState.tick / 60);
  assert(r.counts.lastContextSourceTick <= r.finalState.tick);
  assert(r.counts.lastDecisionTick <= r.finalState.tick);
  assert.equal(r.cleanup.worldDisposed, true);
  for (const [key, value] of Object.entries(r.cleanup))
    if (key !== 'worldDisposed') assert.equal(value, 0, key);
  assert.equal(r.longTasks.supported, true);
  assert.equal(r.longTasks.overflow, false);
  assert.equal(r.semanticCheckpoints.length, 15);
  equal(
    r.semanticCheckpoints.map((c) => c.tick),
    [6, ...Array.from({ length: 14 }, (_, i) => (i + 1) * 600)],
  );
  if (r.observe) assert(r.optionalTickCpuMs.count > 0 && r.optionalTickCpuMs.count <= 60000);
  else assert.equal(r.optionalTickCpuMs, null);
  assert.equal(r.exactPageMemoryBytes, null);
  runs.push({ arm: report.arm, ...r });
}
assert.equal(new Set(runs.map((r) => `${r.arm}:${r.repeat}:${r.observe}`)).size, 20);
for (const arm of ['UNPHASED_REFERENCE', 'ENTITY_PHASED']) {
  const armReport = read(join(directory, `${prefix}-${arm.toLowerCase()}-arm.json`));
  equal(Object.fromEntries(metadataKeys.map((key) => [key, armReport[key]])), metadata);
  assert.equal(armReport.smoke, false);
  const result = armReport.result;
  assert.equal(result.fixtureVersion, '219-physical70-scheduling-v1');
  equal(
    [
      result.protocol.repetitions,
      result.protocol.warmupMs,
      result.protocol.measureMs,
      result.protocol.foreground,
      result.protocol.clock,
      result.protocol.sampleCapacity,
    ],
    [5, 30000, 120000, true, 'actualRAF', 60000],
  );
  const included = comparison.results.find((r) => r.arm === arm);
  equal(included, result);
  assert.equal(result.runs.length, 10);
  for (const r of result.runs)
    equal(
      r,
      reports.find(
        (x) =>
          x.report.arm === arm &&
          x.report.run.repeat === r.repeat &&
          x.report.run.observe === r.observe,
      ).report.run,
    );
  equal(
    result.runs.map((r) => [r.repeat, r.observe]),
    Array.from({ length: 5 }, (_, i) => [
      [i + 1, Boolean(i % 2)],
      [i + 1, !(i % 2)],
    ]).flat(),
  );
}
const relativePairs = [];
for (let repeat = 1; repeat <= 5; repeat++)
  for (const observe of [false, true]) {
    const before = runs.find(
      (r) => r.arm === 'UNPHASED_REFERENCE' && r.repeat === repeat && r.observe === observe,
    );
    const after = runs.find(
      (r) => r.arm === 'ENTITY_PHASED' && r.repeat === repeat && r.observe === observe,
    );
    equal(before.semanticCheckpoints, after.semanticCheckpoints);
    const frameP95DeltaMs = after.frameMs.p95 - before.frameMs.p95;
    const mainThreadP95DeltaMs = after.mainThreadMs.p95 - before.mainThreadMs.p95;
    relativePairs.push({
      repeat,
      observe,
      frameP95DeltaMs,
      mainThreadP95DeltaMs,
      regressed:
        (frameP95DeltaMs > 1 && after.frameMs.p95 > before.frameMs.p95 * 1.1) ||
        (mainThreadP95DeltaMs > 1 && after.mainThreadMs.p95 > before.mainThreadMs.p95 * 1.1),
    });
  }
const absoluteBudgetFailures = runs
  .filter(
    (r) =>
      r.frameMs.p95 > 18.5 ||
      r.frameMs.p99 > 25 ||
      r.mainThreadMs.p95 > 10 ||
      r.longTasks.maxMs > 50,
  )
  .map((r) => ({ arm: r.arm, repeat: r.repeat, observe: r.observe }));
const confirmedRegression = [false, true].some(
  (observe) => relativePairs.filter((p) => p.observe === observe && p.regressed).length >= 3,
);
equal(comparison.budgets, {
  frameP95Ms: 18.5,
  frameP99Ms: 25,
  mainThreadP95Ms: 10,
  applicationLongTaskMaximumMs: 50,
});
equal(comparison.frameBudgetFailures, absoluteBudgetFailures);
assert.equal(comparison.confirmedRegression, confirmedRegression);
for (const pair of relativePairs)
  equal(
    comparison.regressionPairs.find((p) => p.repeat === pair.repeat && p.observe === pair.observe),
    pair,
  );
assert.equal(comparison.semanticCheckpointsEqual, true);
assert.equal(comparison.smoke, false);
assert.equal(
  comparison.acceptance,
  absoluteBudgetFailures.length || confirmedRegression
    ? 'BUDGET_FAILED'
    : 'EARLY_FIXTURE_FRAME_PASS',
);
const metrics = [];
for (const arm of ['UNPHASED_REFERENCE', 'ENTITY_PHASED'])
  for (const observe of [false, true]) {
    const group = runs.filter((r) => r.arm === arm && r.observe === observe);
    const summary = { arm, observe };
    for (const key of ['frameMs', 'mainThreadMs', 'optionalTickCpuMs'])
      if (group.every((r) => r[key])) {
        summary[key] = Object.fromEntries(
          ['p50', 'p95', 'p99', 'max', 'mean'].map((metric) => [
            metric,
            {
              median: median(group.map((r) => r[key][metric])),
              ...range(group.map((r) => r[key][metric])),
            },
          ]),
        );
      }
    if (group.every((r) => r.gpuTimer.samples))
      summary.gpuTimerMs = Object.fromEntries(
        ['p50', 'p95', 'p99', 'max', 'mean'].map((metric) => [
          metric,
          {
            median: median(group.map((r) => r.gpuTimer.samples[metric])),
            ...range(group.map((r) => r.gpuTimer.samples[metric])),
          },
        ]),
      );
    metrics.push(summary);
  }
const observerOverhead = [];
for (const arm of ['UNPHASED_REFERENCE', 'ENTITY_PHASED'])
  for (let repeat = 1; repeat <= 5; repeat++) {
    const off = runs.find((r) => r.arm === arm && r.repeat === repeat && !r.observe),
      on = runs.find((r) => r.arm === arm && r.repeat === repeat && r.observe);
    observerOverhead.push({
      arm,
      repeat,
      frameP95DeltaMs: on.frameMs.p95 - off.frameMs.p95,
      mainThreadP95DeltaMs: on.mainThreadMs.p95 - off.mainThreadMs.p95,
      ownedDiagnosticBytesDelta: on.ownedDiagnosticBytes - off.ownedDiagnosticBytes,
    });
  }
const reportHashes = [
  ...runFiles,
  `${prefix}-unphased_reference-arm.json`,
  `${prefix}-entity_phased-arm.json`,
  `${prefix}-both-comparison.json`,
  'build-manifest.json',
  'hardware.json',
].map((path) => {
  const bytes = readFileSync(join(directory, path));
  return { path, bytes: bytes.length, sha256: sha(bytes) };
});
const verification = {
  captureId,
  renderer,
  verificationMode: historical ? 'HISTORICAL_ARCHIVE_ONLY' : 'CURRENT_AND_ARCHIVE',
  result:
    absoluteBudgetFailures.length || confirmedRegression
      ? 'FAIL_FULL_EARLY_FIXTURE'
      : 'PASS_FULL_EARLY_FIXTURE',
  identity,
  artifactHash,
  archivedSources: {
    count: sourceFiles.length,
    aggregateSha256: sourceHash,
    currentChecked: !historical,
  },
  artifactArchive: {
    path: artifactArchive,
    bytes: archiveBytes.length,
    sha256: sha(archiveBytes),
    artifactCount: artifactFiles.length,
    allArchivedHashesAndBytesMatch: true,
  },
  reportHashes,
  runCount: runs.length,
  checkpointCount: runs.reduce((sum, r) => sum + r.semanticCheckpoints.length, 0),
  exactMatchingCrossArmPairs: relativePairs.length,
  cleanupAllZero: true,
  fullDurations: {
    warmupMs: range(runs.map((r) => r.warmupElapsedMs)),
    measuredRafMs: range(runs.map((r) => r.measuredRafSpanMs)),
  },
  simulationToWall: range(runs.map((r) => r.simulatedToWallRatio)),
  metrics,
  absoluteBudgetFailures,
  relativePairs,
  confirmedRegression,
  observerOverhead,
  longTasks: {
    supportedAll: true,
    total: runs.reduce((sum, r) => sum + r.longTasks.count, 0),
    maxMs: Math.max(...runs.map((r) => r.longTasks.maxMs)),
  },
  framesOverBudget: {
    over18_5: runs.reduce((sum, r) => sum + r.framesOver18_5Ms, 0),
    over25: runs.reduce((sum, r) => sum + r.framesOver25Ms, 0),
  },
  gpuTimerStatuses: [...new Set(runs.map((r) => r.gpuTimer.status))],
  exactPageMemoryBytes: null,
  limits: [
    'Early70-car fixture, synthetic route work and incomplete context; no full-game/laptop gate.',
    'GPU results asynchronous, exact page memory unavailable; startup hardware identity is not continuous thermal/power telemetry.',
  ],
};
console.log(JSON.stringify(verification, null, 2));
assert.equal(
  verification.result,
  'PASS_FULL_EARLY_FIXTURE',
  'Measured budget failure must fail verification',
);
