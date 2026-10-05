import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = 'Docs/Evidence/024-vehicle-controller';
const historical = process.argv.includes('--historical');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function verifySource(record, archive, alwaysArchived = false) {
  const source = createHash('sha256');
  for (const item of record.inputs) {
    const path = typeof item === 'string' ? item : item.path;
    const bytes = await readFile(
      historical || alwaysArchived ? `${folder}/${archive}/${path}` : path,
    );
    if (typeof item !== 'string') {
      assert.equal(bytes.length, item.bytes);
      assert.equal(hash(bytes), item.sha256);
    }
    source.update(path).update(bytes);
  }
  assert.equal(source.digest('hex'), record.sourceHash, `Source identity: ${archive}`);
}
const before = await json(`${folder}/before-node.json`);
const after = await json(`${folder}/after-node.json`);
const manifest = await json(`${folder}/build-manifest.json`);
await verifySource(before, 'source-before', true);
await verifySource(after, 'source-after');
await verifySource(manifest, 'source-at-capture');
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.artifactHash);
assert(
  !manifest.inputs.some((path) => /simulation\/(index|scheduling)\.ts$/.test(path)),
  '024 capture must exclude unfinished scheduler',
);
assert.equal(before.productionControllerAbsent, true);
assert.equal(after.productionControllerPresent, true);
assert.equal(after.beforeSourceHash, before.sourceHash);
assert.equal(after.exactPhysicalCompatibility, true);
assert.deepEqual(after.nativeArtifact, before.nativeArtifact);
assert.equal(before.runs.length, 10);
assert.equal(after.runs.length, 10);
for (let index = 0; index < 10; index++) {
  const a = after.runs[index],
    b = before.runs[index];
  assert.equal(a.pair, Math.floor(index / 2));
  assert.equal(a.observer, a.pair % 2 ? index % 2 === 0 : index % 2 === 1);
  assert.equal(a.observer, b.observer);
  assert.equal(a.warmupTicks, 180);
  assert.equal(a.measuredTicks, 600);
  assert(a.elapsedWallMs > 0 && a.warmupWallMs > 0);
  assert.equal(a.sampleSlotsPerChannel, a.observer ? 600 : 0);
  assert.equal(a.sampleBytes, a.observer ? 33600 : 0);
  assert.equal(a.finalPhysicalHash, b.finalPhysicalHash);
  assert.equal(a.effectiveInputHash, b.effectiveInputHash);
  assert.deepEqual(a.physicalTrace, b.physicalTrace);
  assert.equal(a.physicalTrace.length, 10);
  if (!a.observer) assert.equal(a.tickCpuMs.p95, null);
  assert.equal(a.controllerStats.vehicles, 70);
  assert.equal(a.controllerStats.retainedBatches, 0);
  assert.equal(a.cleanup.bodies.entities, 0);
  assert.equal(a.cleanup.bodies.subscriptions, 0);
  assert.equal(a.cleanup.collisions.vehicles, 0);
  assert.equal(a.cleanup.collisions.obstacles, 0);
  assert.equal(a.cleanup.collisions.colliders, 0);
  assert.equal(a.cleanup.collisions.disposed, true);
  assert.equal(a.cleanup.disposedReadRejected, true);
  assert.equal(a.cleanup.controller.vehicles, 0);
  assert.equal(a.cleanup.controller.projections, 0);
  assert.equal(a.cleanup.controller.disposed, true);
}
const backends = [];
for (const renderer of ['WEBGPU', 'WEBGL2']) {
  const report = await json(`${folder}/drive-${renderer.toLowerCase()}.json`);
  assert.equal(report.fixtureVersion, '024-controller-drive-v1');
  assert.equal(report.identity.sourceHash, manifest.sourceHash);
  assert.equal(report.identity.commit, manifest.commit);
  assert.equal(report.artifactHash, manifest.artifactHash);
  assert.equal(report.renderer, renderer);
  assert.equal(report.foreground, true);
  assert.deepEqual(report.cssResolution, [1920, 1080]);
  assert.deepEqual(report.internalResolution, [1920, 1080]);
  assert.equal(report.dpr, 1);
  assert.match(JSON.stringify(report.actualGpuInfo), /AMD|Radeon/i);
  assert.equal(report.classes.length, 2);
  for (const [index, arm] of report.classes.entries()) {
    assert.equal(arm.classId, index === 0 ? 'sedan' : 'compact');
    assert(arm.ticks >= 961 && arm.ticks <= 965);
    assert(arm.elapsedWallMs >= 15000);
    assert(arm.maxParityError < 0.005);
    assert.equal(arm.takeoverIgnored, 1);
    assert.equal(arm.resumedNeutral, true);
    assert.equal(arm.overloadCount, 0);
    assert.equal(arm.checkpoints.length, 16);
    const byTick = new Map(arm.checkpoints.map((point) => [point.tick, point]));
    assert(byTick.get(360).physical[0].speed > 5);
    assert(byTick.get(720).physical[0].speed < byTick.get(540).physical[0].speed);
    assert(byTick.get(900).physical[0].speed < 12);
    for (const point of arm.checkpoints) {
      for (const control of point.controls) {
        assert.equal(control.command.tick, point.tick);
        if (control.command.brake > 0 || control.command.handbrake)
          assert.equal(control.command.throttle, 0);
      }
      assert.equal(point.controls[0].command.throttle, point.controls[1].command.throttle);
    }
    assert.equal(byTick.get(540).controls[0].turnSignal, 'LEFT');
    assert.equal(byTick.get(900).controls[0].turnSignal, 'HAZARD');
    assert.equal(byTick.get(960).controls[1].mode, 'MANUAL');
    assert.equal(byTick.get(960).controls[1].turnSignal, 'RIGHT');
  }
  backends.push(renderer);
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const beforeTickP95Ms = median(
  before.runs.filter((run) => run.observer).map((run) => run.tickCpuMs.p95),
);
const afterTickP95Ms = median(
  after.runs.filter((run) => run.observer).map((run) => run.tickCpuMs.p95),
);
const cpuDiagnostic = {
  beforeTickP95Ms,
  afterTickP95Ms,
  deltaMs: afterTickP95Ms - beforeTickP95Ms,
  deltaPercent: (afterTickP95Ms / beforeTickP95Ms - 1) * 100,
  controllerIncrementalP95Ms: median(
    after.runs.filter((run) => run.observer).map((run) => run.controllerIncrementalMs.p95),
  ),
  trackedObserverSampleBytes: { before: 28800, after: 33600, incremental: 4800 },
  note: 'Additional controller work is reported separately. Unpaced Node has no renderer/FPS or page heap gate; original baseline preserved.',
};
const summary = {
  status: 'PASS',
  mode: historical ? 'historical archived-source' : 'current-source',
  verifiedAt: new Date().toISOString(),
  beforeSourceHash: before.sourceHash,
  afterSourceHash: after.sourceHash,
  browserSourceHash: manifest.sourceHash,
  artifactHash: manifest.artifactHash,
  exactPhysicalCompatibility: true,
  cpuDiagnostic,
  cpuScope: 'Bounded unpaced Node observer diagnostic; no FPS gate.',
  backends,
  browserScope:
    'Headed functional driving, source parity/takeover/brake/signals/resume; no steady frame gate.',
};
await writeFile(
  `${folder}/${historical ? 'historical-summary' : 'summary'}.json`,
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary));
