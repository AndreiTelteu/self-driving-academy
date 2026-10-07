import { readPairCheckpoints } from './validation-checkpoints.ts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPerformanceReport } from '../src/telemetry/performance.ts';

const path = process.argv[2];
assert(path, 'Explicit report path required');
const report = JSON.parse(await readFile(path, 'utf8'));
assert.equal(report.schemaVersion, 1);
assert.equal(report.role, 'hardware-browser');
assert(
  ['218-browser-counter-v1', '218-browser-counter-v2'].includes(report.identity.fixtureVersion),
  'Development/smoke cannot close hardware validation',
);
const resume = report.identity.hardware.resume;
if (resume?.resumedPairs > 0) {
  assert(
    resume.confirmedComparable === true && process.argv.includes('--allow-resumed-pairs'),
    'Resumed evidence requires explicit hardware/thermal review and --allow-resumed-pairs',
  );
}
createPerformanceReport({
  role: report.role,
  identity: report.identity,
  scope: report.scope,
  coldLoad: report.coldLoad,
  warmLoad: report.warmLoad,
  runs: report.runs,
  unavailable: report.unavailable,
  exclusions: report.exclusions,
});
if (report.identity.fixtureVersion === '218-browser-counter-v2') {
  assert(resume && typeof resume.sessionId === 'string', 'Checkpoint session required');
  const pairs = await readPairCheckpoints(resolve('Evidence/218/checkpoints'), resume.sessionId);
  assert.equal(pairs.length, 5, 'Five immutable pair checkpoints required');
  for (const pair of pairs) {
    assert.equal(pair.identity.profile, 'full');
    assert.equal(pair.identity.build.sourceHash, report.identity.sourceHash);
    assert.equal(
      pair.identity.buildManifest.artifactHash,
      report.identity.hardware.buildManifest.artifactHash,
    );
    assert.deepEqual(
      pair.payload.runs,
      report.runs.filter((run) => run.repeat === pair.pair),
    );
    assert.deepEqual(pair.payload.cold, report.coldLoad[pair.pair - 1]);
    assert.deepEqual(pair.payload.warm, report.warmLoad[pair.pair - 1]);
  }
}
assert.equal(report.coldLoad.length, 5);
assert.equal(report.warmLoad.length, 5);
const hash = createHash('sha256');
for (const file of report.identity.inputs) hash.update(file).update(await readFile(file));
assert.equal(
  hash.digest('hex'),
  report.identity.sourceHash,
  'Current source differs from measured build',
);
const manifest = report.identity.hardware.buildManifest;
assert.equal(manifest.commit, report.identity.commit);
assert.equal(manifest.sourceHash, report.identity.sourceHash);
assert.equal(
  createHash('sha256').update(JSON.stringify(manifest.artifacts)).digest('hex'),
  manifest.artifactHash,
);
for (const artifact of manifest.artifacts) {
  const bytes = await readFile(resolve('.pbi-validation-218/build', artifact.path));
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256);
}
for (let repeat = 1; repeat <= 5; repeat++) {
  assert.equal(report.coldLoad[repeat - 1].repeat, repeat);
  assert.equal(report.warmLoad[repeat - 1].repeat, repeat);
}
for (const run of report.runs) {
  assert.equal(run.simulation.clock, 'real-raf');
  assert.equal(run.simulation.overloads, 0);
  assert(run.simulation.ratio >= 0.98, 'Counter fixture real-time throughput failure');
  assert.equal(run.collector.dropped, 0);
  assert.equal(run.collector.complete, true);
  assert.equal(run.referenceCpuMs.count, run.referenceFrameMs.count);
  assert(run.referenceCpuMs.count > 0 && run.referenceCpuMs.count <= 60000);
  assert.equal(run.resources.retainedSnapshotsAfterDispose, 0);
  assert.equal(run.resources.exactPageMemoryBytes, null);
  assert.equal(run.resources.exactGpuMemoryBytes, null);
  assert.equal(run.collector.metrics.inputToCommandMs.distribution, null);
  assert.equal(run.collector.metrics.tickCpuMs.distribution, null);
  assert.equal(run.longTasks.overflow, false);
}
console.log(
  JSON.stringify(
    {
      valid: true,
      fixture: report.identity.fixtureVersion,
      pairs: 5,
      cold: 5,
      warm: 5,
      sourceHash: report.identity.sourceHash,
      artifactHash: manifest.artifactHash,
      artifactsVerified: manifest.artifacts.length,
      scope:
        'Own collector and counter/bootstrap only; controlled cold/gameplay/laptop not certified',
      clockPrecision:
        'Browser p95 overhead delta indistinguishable at current clock resolution; not a claim of zero cost',
      hardwareCapture: report.identity.hardware.capturedAt,
    },
    null,
    2,
  ),
);
