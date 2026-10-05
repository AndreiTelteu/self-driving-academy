import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const folder = 'Docs/Evidence/025-keyboard-input',
  historical = process.argv.includes('--historical');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function verifySource(record, archive, archived = false) {
  const source = createHash('sha256');
  for (const input of record.inputs) {
    const path = typeof input === 'string' ? input : input.path;
    const bytes = await readFile(historical || archived ? `${folder}/${archive}/${path}` : path);
    if (typeof input !== 'string') {
      assert.equal(hash(bytes), input.sha256);
      assert.equal(bytes.length, input.bytes);
    }
    source.update(path).update(bytes);
  }
  assert.equal(source.digest('hex'), record.sourceHash, archive);
}
const before = await json(`${folder}/before-node.json`),
  after = await json(`${folder}/after-node.json`);
await verifySource(before, 'source-before', true);
await verifySource(after, 'source-after');
assert.equal(before.phase, 'before');
assert.equal(after.phase, 'after');
assert.equal(before.runs.length, 10);
assert.equal(after.runs.length, 10);
assert.equal(after.beforeSourceHash, before.sourceHash);
assert.deepEqual(after.nativeArtifact, before.nativeArtifact);
assert.equal(after.exactNeutralPhysicalCompatibility, true);
for (let index = 0; index < 10; index++) {
  const a = after.runs[index],
    b = before.runs[index];
  assert.equal(a.observer, b.observer);
  assert.equal(a.pair, b.pair);
  assert.equal(a.warmupTicks, 180);
  assert.equal(a.measuredTicks, 600);
  assert(a.elapsedWallMs > 0 && a.warmupWallMs > 0);
  assert.equal(a.sampleBytes, a.observer ? 9600 : 0);
  assert.equal(a.finalPhysicalHash, b.finalPhysicalHash);
  assert.deepEqual(a.physicalTrace, b.physicalTrace);
  assert.equal(a.filterStats.heldKeys, 0);
  assert.equal(a.filterStats.retainedFrames, 0);
  assert.equal(a.cleanup.filter.disposed, true);
  assert.equal(a.cleanup.filter.heldKeys, 0);
  assert.equal(a.cleanup.body.entities, 0);
  assert.equal(a.cleanup.collision.colliders, 0);
  assert.equal(a.cleanup.disposedReadRejected, true);
}
const calibration = await json(`${folder}/calibration.json`);
assert.equal(calibration.status, 'PASS');
assert.equal(calibration.runs.length, 6);
const calibrationSource = createHash('sha256');
for (const path of calibration.inputPaths)
  calibrationSource
    .update(path)
    .update(await readFile(historical ? `${folder}/source-calibration/${path}` : path));
assert.equal(calibrationSource.digest('hex'), calibration.sourceHash);
assert.equal(calibration.nativeArtifact.sha256, after.nativeArtifact.sha256);
assert.equal(calibration.nativeArtifact.bytes, after.nativeArtifact.bytes);
for (const run of calibration.runs) {
  assert(['sedan', 'compact'].includes(run.classId));
  assert([0, 50, 100].includes(run.slider));
  assert(
    run.throttleFullTick > 0 &&
      run.returnTicks > 0 &&
      run.returnTicks < 180 &&
      run.brakeFullTick > 0 &&
      run.stopTicks < 900 &&
      run.brakingDistance > 0 &&
      run.brakingDistance < 150,
  );
}
const manifest = await json(`${folder}/build-manifest.json`);
await verifySource(manifest, 'source-at-capture');
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.artifactHash);
const backends = [];
for (const renderer of ['WEBGPU', 'WEBGL2']) {
  const report = await json(`${folder}/drive-${renderer.toLowerCase()}.json`);
  assert.equal(report.fixtureVersion, '025-keyboard-drive-v1');
  assert.equal(report.identity.sourceHash, manifest.sourceHash);
  assert.equal(report.artifactHash, manifest.artifactHash);
  assert.equal(report.renderer, renderer);
  assert.equal(report.foreground, true);
  assert.match(JSON.stringify(report.actualGpuInfo), /AMD|Radeon/i);
  assert.deepEqual(report.cssResolution, [1920, 1080]);
  assert.deepEqual(report.internalResolution, [1920, 1080]);
  assert.equal(report.dpr, 1);
  assert.deepEqual(report.trusted.codes, ['KeyA', 'KeyD', 'KeyS', 'KeyW']);
  assert(
    report.trusted.presses >= 4 &&
      report.trusted.releases >= 4 &&
      report.trusted.editablePresses >= 1,
  );
  assert.equal(report.trusted.manualRawPress, true);
  assert.equal(report.trusted.manualFilteredPress, true);
  assert(report.trusted.manualFrames > 0);
  assert.equal(report.classes.length, 2);
  for (const [index, arm] of report.classes.entries()) {
    assert.equal(arm.classId, index === 0 ? 'sedan' : 'compact');
    assert(arm.ticks >= 660 && arm.ticks <= 664);
    assert(arm.elapsedWallMs >= 10500);
    assert.equal(arm.overloadCount, 0);
    assert.equal(arm.editableReleased, true);
    assert.equal(arm.blurReleased, true);
    assert.equal(arm.resumedNeutral, true);
    assert.equal(arm.checkpoints.length, 22);
    const byTick = new Map(arm.checkpoints.map((point) => [point.tick, point]));
    assert.equal(byTick.get(180).input.command.throttle, 0);
    assert.equal(byTick.get(300).input.raw.throttle, 1);
    assert.equal(byTick.get(300).input.command.throttle, 1);
    assert(byTick.get(330).input.command.steering > 0);
    assert.equal(byTick.get(390).input.raw.brake, 1);
    assert.equal(byTick.get(390).input.command.throttle, 0);
    assert.equal(byTick.get(510).input.raw.steering, -1);
    assert.equal(byTick.get(570).input.command.handbrake, true);
    assert.equal(byTick.get(660).input.command.throttle, 0);
    assert.equal(byTick.get(660).input.command.steering, 0);
    for (const point of arm.checkpoints) {
      assert.equal(point.input.raw.tick, point.tick);
      assert.equal(point.input.command.tick, point.tick);
      assert.equal(point.input.mappingVersion, '025-keyboard-v1');
      assert(Math.abs(point.input.command.steering) <= point.input.steeringFactor + 1e-12);
      if (point.input.command.brake > 0 || point.input.command.handbrake)
        assert.equal(point.input.command.throttle, 0);
    }
  }
  backends.push(renderer);
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = {
  status: 'PASS',
  verifiedAt: new Date().toISOString(),
  mode: historical ? 'historical archived-source' : 'current-source',
  beforeSourceHash: before.sourceHash,
  afterSourceHash: after.sourceHash,
  browserSourceHash: manifest.sourceHash,
  calibrationSourceHash: calibration.sourceHash,
  exactNeutralPhysicalCompatibility: true,
  backends,
  cpuDiagnostic: {
    beforeTickP95Ms: median(
      before.runs.filter((run) => run.observer).map((run) => run.tickCpuMs.p95),
    ),
    afterTickP95Ms: median(
      after.runs.filter((run) => run.observer).map((run) => run.tickCpuMs.p95),
    ),
    filterIncrementalP95Ms: median(
      after.runs.filter((run) => run.observer).map((run) => run.filterIncrementalMs.p95),
    ),
  },
  scope:
    'SinglePLAYER025 filter with70native cars, actual two-class calibration, real browser DOM protocol plus trusted keyboard/editable checks. No final fleet FPS, page heap total or laptop gate.',
};
await writeFile(
  `${folder}/${historical ? 'historical-summary' : 'summary'}.json`,
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary));
