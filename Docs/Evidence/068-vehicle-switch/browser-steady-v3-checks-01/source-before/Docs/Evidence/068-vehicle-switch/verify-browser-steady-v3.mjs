import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import './verify-browser-steady-v3-build.mjs';
import { assertCaptureInventory } from './browser-evidence-checks.mjs';
import { compareArms, order } from './steady-numeric-checks-v3.mjs';
const folder = 'Docs/Evidence/068-vehicle-switch/browser-steady-v3-01';
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = await json(folder + '/build-manifest.json'),
  archive = await json(folder + '/build-archive.json');
const derivationPath = 'Docs/Evidence/068-vehicle-switch/historical-steady-derivation-v2-01.json';
const derivationBytes = await readFile(
  process.argv.includes('--historical')
    ? folder + '/source-at-capture/' + derivationPath
    : derivationPath,
);
assert.equal(sha(derivationBytes), manifest.historicalDerivationHash);
const derivation = JSON.parse(derivationBytes);
assert.equal(derivation.status, 'DERIVED_SOURCE_ONLY');
assert.equal(
  derivation.historicalSourceHash,
  '0e215d02f8451a78a533ca87ebe44eddc1a197b8c8f29cff40c5f7e5963ae585',
);
assert.equal(
  derivation.nativeBeforeHash,
  'fcb9a71661d7630cfbb137ba08b176fef1a6ed0927ed50c4e438b0d12809cace',
);
assert.equal(derivation.sharedRuntimeCommit, 'ad32db9c609cce1132669c95312ae202a62b87ed');
for (const row of derivation.rows) {
  const bytes = await readFile(row.archivedPath);
  assert.equal(bytes.length, row.bytes);
  assert.equal(sha(bytes), row.sha256);
}
assertCaptureInventory(await readdir(folder));
const results = [];
const immutable = (m) =>
  Object.fromEntries(
    [
      'classId',
      'version',
      'massKg',
      'powerW',
      'grip',
      'brakeAccelerationMps2',
      'wheels',
      'turningRadiusM',
    ].map((key) => [key, m[key]]),
  );
for (const renderer of ['webgpu', 'webgl2']) {
  const raw = await readFile(folder + '/drive-' + renderer + '.json'),
    report = JSON.parse(raw),
    start = await json(folder + '/capture-' + renderer + '-started.json'),
    terminal = await json(folder + '/capture-' + renderer + '-terminal.json');
  assert.equal(start.status, 'STARTED');
  assert.equal(terminal.status, 'PASS');
  assert.equal(terminal.incomplete, false);
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.causes, []);
  assert.equal(report.fixtureVersion, '068-selection-historical-steady-v3');
  assert.equal(report.identity.sourceHash, manifest.sourceHash);
  assert.equal(report.identity.historicalDerivationHash, manifest.historicalDerivationHash);
  assert.equal(report.artifactHash, manifest.artifactHash);
  assert.equal(report.captureId, manifest.sourceHash + '-' + renderer);
  assert.equal(start.captureId, report.captureId);
  assert.equal(terminal.captureId, report.captureId);
  assert.equal(terminal.reportSha256, sha(raw));
  assert.equal(terminal.filename, 'drive-' + renderer + '.json');
  assert.equal(report.requestedBackend, renderer === 'webgpu' ? 'AUTO' : 'WEBGL2');
  assert.equal(report.renderer, renderer.toUpperCase());
  assert.equal(report.foreground, true);
  assert.equal(report.surfaceInvalidation, null);
  assert.equal(report.dpr, 1);
  assert.deepEqual(report.cssResolution, [1920, 1080]);
  assert.deepEqual(report.internalResolution, [1920, 1080]);
  assert.ok(/AMD|Radeon/i.test(JSON.stringify(report.actualGpuInfo)));
  assert.ok(/AMD|Radeon/i.test(JSON.stringify(report.hardware.gpu)));
  assert.equal(report.startedAt, start.startedAt);
  assert.ok(
    Date.parse(archive.createdAt) <= Date.parse(start.createdAt) &&
      Date.parse(start.createdAt) <= Date.parse(report.firstWorldAt) &&
      Date.parse(report.createdAt) <= Date.parse(terminal.createdAt),
  );
  assert.equal(report.worldsCreated, 40);
  assert.equal(report.summaries.length, 20);
  assert.equal(report.lifecycle.length, 20);
  assert.equal(report.captureListeners, 0);
  assert.equal(report.rendererCleanup.disposed, true);
  for (const key of ['meshes', 'materials', 'cameras'])
    assert.equal(report.rendererCleanup[key], 0);
  const root = folder + '/' + report.captureId,
    expected = [],
    records = [];
  let total = 0;
  const baseline = await json(
    'Docs/Evidence/068-vehicle-switch/browser-before/drive-' + renderer + '.json',
  );
  const mechanics = Object.fromEntries(
    baseline.arms.map((arm) => [arm.classId, immutable(arm.initialMechanics[0])]),
  );
  for (let sequence = 0; sequence < 20; sequence++) {
    const beginName = `world-${sequence}-begin.json`,
      startedName = `world-${sequence}-started.json`,
      terminalName = `world-${sequence}-terminal.json`;
    expected.push(beginName, startedName, terminalName);
    const begin = await json(root + '/' + beginName),
      started = await json(root + '/' + startedName),
      ended = await json(root + '/' + terminalName);
    assert.equal(begin.status, 'STARTED');
    assert.equal(begin.sequence, sequence);
    assert.equal(begin.captureId, report.captureId);
    assert.deepEqual(begin.metadata, order()[sequence]);
    assert.equal(started.sequence, sequence);
    assert.equal(started.captureId, report.captureId);
    assert.equal(started.status, 'STARTED');
    assert.equal(ended.status, 'PASS');
    assert.equal(ended.parts, started.parts);
    assert.equal(ended.bytes, started.worldBytes);
    assert.ok(Number.isInteger(started.parts) && started.parts >= 1 && started.parts <= 64);
    assert.equal(started.parts, Math.ceil(started.worldBytes / 524288));
    const parts = [];
    for (let index = 0; index < started.parts; index++) {
      const name = `world-${sequence}-part-${index}.bin`;
      expected.push(name);
      const bytes = await readFile(root + '/' + name);
      assert.equal(bytes.length, Math.min(524288, started.worldBytes - index * 524288));
      parts.push(bytes);
    }
    const bytes = Buffer.concat(parts);
    total += bytes.length;
    assert.equal(bytes.length, started.worldBytes);
    assert.equal(sha(bytes), started.worldSha256);
    assert.equal(sha(bytes), ended.sha256);
    const record = JSON.parse(bytes);
    assert.ok(
      Date.parse(begin.receivedAt) <= Date.parse(record.firstWorldAt) &&
        Date.parse(record.createdAt) <= Date.parse(started.createdAt) &&
        Date.parse(started.createdAt) <= Date.parse(ended.createdAt),
    );
    assert.deepEqual(report.summaries[sequence], {
      arm: record.arm,
      tick: record.tick,
      measuredTicks: record.measuredTicks,
      frames: record.frames,
      firstWorldAt: record.firstWorldAt,
      createdAt: record.createdAt,
      disposition: record.disposition,
    });
    assert.equal(record.initialMechanics.length, 70);
    assert.equal(record.finalMechanics.length, 70);
    for (let index = 0; index < 70; index++) {
      assert.deepEqual(
        immutable(record.initialMechanics[index]),
        mechanics[record.profiles[index]],
      );
      assert.deepEqual(immutable(record.finalMechanics[index]), mechanics[record.profiles[index]]);
    }
    records.push(record);
  }
  assert.deepEqual(
    (await readdir(root)).sort(),
    expected.sort(),
    'No failed/incomplete/extra arm records',
  );
  assert.ok(total <= 112 * 1024 * 1024);
  const numeric = compareArms(records);
  for (let cycle = 0; cycle < 20; cycle++) {
    const record = report.lifecycle[cycle],
      live = record.admitted,
      after = record.cleanup.snapshots;
    assert.equal(record.cycle, cycle);
    assert.deepEqual(record.causes, []);
    assert.deepEqual(record.cleanup.errors, []);
    assert.equal(live.body.entities, 70);
    assert.equal(live.authority.vehicles, 70);
    assert.equal(live.authority.players, 0);
    assert.equal(live.selection.vehicles, 70);
    assert.equal(live.registry, 70);
    assert.equal(live.uiElements, 4);
    assert.equal(live.uiTextNodes, 3);
    assert.equal(live.uiListeners, 0);
    assert.equal(after.body.entities, 0);
    assert.equal(after.body.subscriptions, 0);
    assert.equal(after.collision.colliders, 0);
    for (const key of ['vehicles', 'players', 'targets', 'projections'])
      assert.equal(after.controller[key], 0);
    assert.equal(after.authority.vehicles, 0);
    assert.equal(after.authority.players, 0);
    assert.equal(after.keyboard.heldKeys, 0);
    assert.equal(after.keyboard.disposed, true);
    assert.equal(after.mode.intents, 0);
    assert.equal(after.mode.inFlight, 0);
    assert.equal(after.mode.projection, null);
    assert.equal(after.selection.vehicles, 0);
    assert.equal(after.selection.pending, 0);
    assert.equal(after.selection.inFlight, 0);
    assert.equal(after.selection.projection, null);
    assert.equal(after.selection.disposed, true);
    assert.equal(after.segment.retainedSegments, 0);
    assert.equal(after.registry.bindings, 0);
    assert.equal(after.camera.disposed, true);
    assert.equal(after.camera.selected, null);
    assert.equal(after.controller.disposed, true);
    assert.equal(after.keyboard.pendingPreferences, false);
    assert.equal(after.selection.retainedHistory, 0);
    assert.equal(record.cleanup.resourceCap, 192);
    assert.equal(record.cleanup.readerCap, 192);
    assert.equal(new Set(record.cleanup.attempts).size, record.cleanup.attempts.length);
    for (let index = 0; index < 70; index++) {
      assert.equal(after['mesh-' + index].disposed, true);
      assert.equal(after['material-' + index].disposed, true);
    }
    assert.equal(after.renderer.disposed, true);
    assert.equal(after.ui.connected, false);
    for (const key of ['meshes', 'materials', 'cameras']) assert.equal(after.renderer[key], 0);
  }
  results.push({
    renderer,
    actual20Arms: true,
    actual20LifecycleAdmissions: true,
    bytes: total,
    ...numeric,
    limits:
      'Historical match collected after production/common029; original native andshort gates independent. Trackedbrowserheap precision explicitlylimited; GPUtimer uncollected, no exactWASM/wholegame/laptop/training claim.',
  });
}
console.log(
  JSON.stringify(
    {
      status: 'PASS_REQUIRED_STEADY_SUBSET',
      sourceHash: manifest.sourceHash,
      artifactHash: manifest.artifactHash,
      results,
    },
    null,
    2,
  ),
);
