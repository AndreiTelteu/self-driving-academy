import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';

const folder = 'Docs/Evidence/027-braking-reverse',
  historical = process.argv.includes('--historical');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function source(record, archive, alwaysArchived = false) {
  const digest = createHash('sha256');
  for (const input of record.inputs) {
    const path = typeof input === 'string' ? input : input.path,
      bytes = await readFile(historical || alwaysArchived ? `${folder}/${archive}/${path}` : path);
    if (typeof input !== 'string') {
      assert.equal(hash(bytes), input.sha256);
      assert.equal(bytes.length, input.bytes);
    }
    digest.update(path).update(bytes);
  }
  assert.equal(digest.digest('hex'), record.sourceHash, archive);
}
const before = await json(`${folder}/before-node.json`),
  after = await json(`${folder}/after-node.json`);
await source(before, 'source-before', true);
await source(after, 'source-after');
assert.equal(before.phase, 'before');
assert.equal(after.phase, 'after');
assert.equal(before.runs.length, 10);
assert.equal(after.runs.length, 10);
assert(new Date(before.capturedAt) < new Date(after.capturedAt));
assert.equal(after.beforeSourceHash, before.sourceHash);
assert.equal(after.exactNeutralPhysicalCompatibility, true);
assert.deepEqual(after.nativeArtifact, before.nativeArtifact);
const durableNative = await readFile(`${folder}/native/rapier.mjs`);
assert.equal(durableNative.length, before.nativeArtifact.bytes);
assert.equal(hash(durableNative), before.nativeArtifact.sha256);
const nativeArchiveMetadata = await json(`${folder}/native/archive-metadata.json`);
assert.equal(nativeArchiveMetadata.sha256, before.nativeArtifact.sha256);
assert.equal(nativeArchiveMetadata.bytes, before.nativeArtifact.bytes);
if (!historical) {
  const installedNative = await readFile(before.nativeArtifact.path);
  assert.equal(installedNative.length, before.nativeArtifact.bytes);
  assert.equal(hash(installedNative), before.nativeArtifact.sha256);
}
await assert.rejects(access(`${folder}/source-before/src/vehicles/drivetrain.ts`));
await access(`${folder}/source-after/src/vehicles/drivetrain.ts`);
for (let index = 0; index < 10; index++) {
  const a = after.runs[index],
    b = before.runs[index];
  assert.equal(a.pair, b.pair);
  assert.equal(a.observer, b.observer);
  assert.equal(a.warmupTicks, 180);
  assert.equal(a.measuredTicks, 600);
  assert(a.elapsedWallMs > 0 && a.warmupWallMs > 0);
  assert.equal(b.sampleBytes, b.observer ? 9600 : 0);
  assert.equal(a.sampleBytes, a.observer ? 14400 : 0);
  assert.deepEqual(a.physicalTrace, b.physicalTrace);
  assert.equal(a.finalPhysicalHash, b.finalPhysicalHash);
  assert.equal(a.drivetrainStats.states, 70);
  assert.equal(a.drivetrainStats.enabled, 1);
  assert.equal(a.drivetrainStats.retainedHistory, 0);
  assert.equal(a.cleanup.controller.drivetrain.states, 0);
  assert.equal(a.cleanup.body.entities, 0);
  assert.equal(a.cleanup.collision.colliders, 0);
  assert.equal(a.cleanup.filter.heldKeys, 0);
  assert.equal(a.cleanup.disposedReadRejected, true);
}
const calibration = await json(`${folder}/calibration.json`);
await source(calibration, 'source-calibration');
assert.equal(calibration.status, 'PASS');
assert.equal(calibration.runs.length, 6);
assert.equal(calibration.turns.length, 4);
assert.deepEqual(calibration.nativeArtifact, after.nativeArtifact);
assert.equal(calibration.guards.nearZeroTicks, 6);
assert.equal(calibration.guards.nearZeroSpeedMps, 0.2);
const verifyDrive = (drive) => {
  assert.equal(drive.version, '027-braking-reverse-v1');
  assert(drive.nearZeroTicks >= 0 && drive.nearZeroTicks <= 6);
  assert(Number.isFinite(drive.physicalInput.throttle));
  assert(Math.abs(drive.physicalInput.throttle) <= 1);
  if (drive.physicalInput.brake > 0 || drive.physicalInput.handbrake)
    assert.equal(drive.physicalInput.throttle, 0);
  if (drive.phase === 'STOPPING' || drive.phase === 'NEAR_ZERO_DWELL')
    assert.equal(drive.physicalInput.throttle, 0);
  if (drive.physicalInput.throttle < 0) assert.equal(drive.engagedDirection, 'REVERSE');
  if (drive.nearZeroTicks === 6) {
    assert(drive.motion !== null);
    assert(drive.motion.totalSpeedMps <= 0.2);
  }
};
for (const run of calibration.runs) {
  assert(['sedan', 'compact'].includes(run.classId));
  assert([0, 50, 100].includes(run.slider));
  assert(
    run.reverseEngagedTick > 6 &&
      run.reverseMotionTick >= run.reverseEngagedTick &&
      run.forwardEngagedTick > run.reverseMotionTick &&
      run.forwardMotionTick >= run.forwardEngagedTick,
  );
  for (const engagement of [run.reverseEngagement, run.forwardEngagement]) {
    assert.equal(engagement.dwell, 6);
    assert(engagement.motion.totalSpeedMps <= 0.2);
  }
  assert(run.forwardBrakingDistance > 0);
  for (const point of run.curves) verifyDrive(point.realized.drivetrain);
}
for (const classId of ['sedan', 'compact']) {
  const arms = calibration.turns.filter((turn) => turn.classId === classId);
  assert.equal(arms.length, 2);
  assert.equal(arms[0].handbrake, false);
  assert.equal(arms[1].handbrake, true);
  assert(arms[1].distance < arms[0].distance && arms[1].final.speed < arms[0].final.speed);
  assert.deepEqual(arms[1].mechanics.wheelBrakeImpulseLimitNs.slice(0, 2), [0, 0]);
  assert(arms[1].mechanics.wheelBrakeImpulseLimitNs.slice(2).every((value) => value > 0));
}
const manifest = await json(`${folder}/build-manifest.json`);
await source(manifest, 'source-at-capture');
assert.equal(hash(JSON.stringify(manifest.artifacts)), manifest.artifactHash);
const artifactArchive = JSON.parse(
  execFileSync('powershell.exe', ['-NoProfile', '-File', `${folder}/artifact-archive.ps1`], {
    encoding: 'utf8',
  }),
);
const savedArtifactArchive = await json(`${folder}/artifact-archive.json`);
assert.deepEqual(artifactArchive, savedArtifactArchive);
assert.equal(artifactArchive.status, 'PASS');
assert.equal(artifactArchive.sourceHash, manifest.sourceHash);
assert.equal(artifactArchive.artifactHash, manifest.artifactHash);
assert.deepEqual(artifactArchive.artifacts, manifest.artifacts);
for (const renderer of ['WEBGPU', 'WEBGL2']) {
  const report = await json(`${folder}/drive-${renderer.toLowerCase()}.json`);
  assert.equal(report.fixtureVersion, '027-braking-reverse-drive-v1');
  assert.equal(report.identity.sourceHash, manifest.sourceHash);
  assert.equal(report.artifactHash, manifest.artifactHash);
  assert.equal(report.renderer, renderer);
  assert.equal(report.foreground, true);
  assert.match(JSON.stringify(report.actualGpuInfo), /AMD|Radeon/i);
  assert.deepEqual(report.cssResolution, [1920, 1080]);
  assert.deepEqual(report.internalResolution, [1920, 1080]);
  assert.equal(report.dpr, 1);
  assert.equal(report.classes.length, 2);
  for (const [index, arm] of report.classes.entries()) {
    assert.equal(arm.classId, index === 0 ? 'sedan' : 'compact');
    assert(arm.ticks > 420 && arm.ticks < 3000);
    assert(arm.elapsedWallMs >= ((arm.ticks - 2) / 60) * 1000 * 0.98);
    assert.equal(arm.overloadCount, 0);
    assert.equal(arm.startup.warmupFrames, 30);
    assert.equal(arm.startup.physicsTicks, 0);
    assert(Number.isFinite(arm.startup.warmupElapsedMs) && arm.startup.warmupElapsedMs > 0);
    assert(Number.isFinite(arm.maxRafGapMs) && arm.maxRafGapMs > 0);
    assert.equal(arm.reverseMotion, true);
    assert.equal(arm.forwardMotion, true);
    assert.equal(arm.neutralReleased, true);
    assert(arm.checkpoints.length <= 100);
    for (const engagement of [arm.reverseEngagement, arm.forwardEngagement]) {
      assert.equal(engagement.drive.nearZeroTicks, 6);
      assert(engagement.drive.motion.totalSpeedMps <= 0.2);
    }
    assert.deepEqual(arm.handbrakeMechanics.wheelBrakeImpulseLimitNs.slice(0, 2), [0, 0]);
    assert(arm.handbrakeMechanics.wheelBrakeImpulseLimitNs.slice(2).every((value) => value > 0));
    for (const point of arm.checkpoints) {
      verifyDrive(point.realized.drivetrain);
      assert.equal(point.input.raw.tick, point.tick);
      assert.equal(point.realized.command.tick, point.tick);
      assert.equal(
        Math.abs(point.realized.drivetrain.physicalInput.throttle),
        point.realized.command.throttle,
      );
    }
  }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const summary = {
  status: 'PASS',
  verifiedAt: new Date().toISOString(),
  mode: historical ? 'historical archived-source' : 'current-source',
  beforeSourceHash: before.sourceHash,
  afterSourceHash: after.sourceHash,
  calibrationSourceHash: calibration.sourceHash,
  browserSourceHash: manifest.sourceHash,
  backends: ['WEBGPU', 'WEBGL2'],
  neutralPhysicalCompatibility: 'exact10runs',
  cpuDiagnostic: {
    beforeTickP95Ms: median(
      before.runs.filter((run) => run.observer).map((run) => run.tickCpuMs.p95),
    ),
    afterTickP95Ms: median(
      after.runs.filter((run) => run.observer).map((run) => run.tickCpuMs.p95),
    ),
    drivetrainStageP95Ms: median(
      after.runs.filter((run) => run.observer).map((run) => run.drivetrainStageMs.p95),
    ),
  },
  scope:
    '70 bounded per-token drivetrain states plus one027 keyboard adapter; actual two-class reverse/dwell/handbrake calibration and visible hardware driving. No fleetFPS, pageheap, ABS/transmission realism or laptop claim.',
};
await writeFile(
  `${folder}/${historical ? 'historical-summary' : 'summary'}.json`,
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary));
