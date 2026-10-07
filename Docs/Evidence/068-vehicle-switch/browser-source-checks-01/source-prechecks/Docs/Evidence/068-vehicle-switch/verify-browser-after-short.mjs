import assert from 'node:assert/strict';
import { readBabylonPoint } from './browser-vector-wire-v2.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import './verify-browser-after-short-build.mjs';
import {
  assignment,
  bodies,
  checkpoints,
  identity,
  immutable,
  modeProofs,
  proofs,
  distribution,
  assertCaptureInventory,
} from './browser-evidence-checks.mjs';
import { ownedActual, compareShort, worldInventory } from './browser-after-short-checks.mjs';
const folder = 'Docs/Evidence/068-vehicle-switch/browser-after-short-01',
  json = async (path) => JSON.parse(await readFile(path, 'utf8')),
  m = await json(folder + '/build-manifest.json'),
  a = await json(folder + '/build-archive.json');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const files = await readdir(folder);
assertCaptureInventory(files);
const results = [];
for (const renderer of ['webgpu', 'webgl2']) {
  const rawReport = await readFile(folder + '/drive-' + renderer + '.json'),
    r = JSON.parse(rawReport),
    started = await json(folder + '/capture-' + renderer + '-started.json'),
    terminal = await json(folder + '/capture-' + renderer + '-terminal.json');
  assert.equal(started.status, 'STARTED');
  assert.equal(terminal.status, 'PASS');
  assert.equal(terminal.incomplete, false);
  assert.equal(started.captureId, m.sourceHash + '-' + renderer);
  assert.equal(r.captureId, started.captureId);
  assert.equal(terminal.captureId, started.captureId);
  assert.equal(terminal.filename, 'drive-' + renderer + '.json');
  assert.equal(terminal.reportSha256, hash(rawReport));
  assert.equal(r.requestedBackend, renderer === 'webgpu' ? 'AUTO' : 'WEBGL2');
  assert.equal(started.requestedBackend, r.requestedBackend);
  assert.equal(terminal.requestedBackend, r.requestedBackend);
  assert.equal(started.startedAt, r.startedAt);
  assert.ok(
    Date.parse(started.createdAt) <= Date.parse(r.firstWorldAt) &&
      Date.parse(r.createdAt) <= Date.parse(terminal.createdAt),
  );
  assert.equal(r.surfaceInvalidation, null);
  assert.equal(r.status, 'PASS');
  assert.equal(r.fixtureVersion, '068-selection-browser-actual-v1');
  assert.equal(r.identity.sourceHash, m.sourceHash);
  assert.equal(r.artifactHash, m.artifactHash);
  assert.equal(r.renderer, renderer.toUpperCase());
  assert.equal(r.foreground, true);
  assert.deepEqual(r.cssResolution, [1920, 1080]);
  assert.deepEqual(r.internalResolution, [1920, 1080]);
  assert.equal(r.dpr, 1);
  assert.equal(r.worldsCreated, 14);
  assert.ok(/AMD|Radeon/i.test(JSON.stringify(r.actualGpuInfo)));
  assert.ok(/AMD|Radeon/i.test(JSON.stringify(r.hardware.gpu)));
  assert.ok(
    Date.parse(a.createdAt) <= Date.parse(r.startedAt) &&
      Date.parse(r.startedAt) <= Date.parse(r.firstWorldAt) &&
      Date.parse(r.firstWorldAt) <= Date.parse(r.createdAt),
  );
  assert.equal(r.rendererCleanup.sceneDisposed, true);
  assert.equal(r.rendererCleanup.captureListeners, 0);
  for (const key of ['meshes', 'materials', 'cameras']) assert.equal(r.rendererCleanup[key], 0);
  assert.equal(r.guards.length, 2);
  assert.equal(r.arms.length, 2);
  assert.equal(r.frameRuns.length, 10);
  await worldInventory(folder, r);
  compareShort(r, await json('Docs/Evidence/068-vehicle-switch/browser-before/drive-' + renderer + '.json'));
  for (let i = 0; i < 2; i++) {
    const g = r.guards[i],
      arm = r.arms[i];
    assert.equal(g.classId, ['sedan', 'compact'][i]);
    assert.equal(arm.classId, g.classId);
    for (const key of [
      'actualPicker',
      'nearestOcclusion',
      'hiddenRejected',
      'disabledRejected',
      'offscreenTaxiAccepted',
      'civilFleetRejected',
      'retiredGenerationRejected',
      'pausedNoTick',
    ])
      assert.equal(g[key], true);
    assert.equal(g.syntheticDomEvents, 0);
    assignment(g);
    assert.deepEqual(
      g.events.map((e) => ({ tick: e.tick, mode: e.mode, selected: e.selected })),
      [
        { tick: 1, mode: 'AUTO', selected: 'car-1' },
        { tick: 2, mode: 'AUTO', selected: 'car-0' },
        { tick: 3, mode: 'MANUAL', selected: 'car-0' },
        { tick: 4, mode: 'AUTO', selected: 'car-1' },
        { tick: 5, mode: 'AUTO', selected: 'car-0' },
        { tick: 6, mode: 'LEARNING', selected: 'car-0' },
        { tick: 7, mode: 'AUTO', selected: 'car-1' },
        { tick: 8, mode: 'AUTO', selected: 'car-0' },
      ],
    );
    assert.deepEqual(
      g.selectionProofs.map((p) => ({ tick: p.tick, selected: p.selected })),
      [1, 2, 4, 5, 7, 8].map((tick) => ({
        tick,
        selected: [1, 4, 7].includes(tick) ? 'car-1' : 'car-0',
      })),
    );
    assert.equal(g.owned.guard.nativeSteps, 8);
    for (const event of g.events) {
      assert.equal(event.context.worldEpoch, g.context.worldEpoch);
      assert.equal(event.context.sessionId, g.context.sessionId);
      bodies(event.bodies, g.identities);
      assert.equal(event.controls.length, 2);
      assert.equal(event.nativeInputs.length, 2);
      if ([1, 4, 7].includes(event.tick)) {
        assert.equal(event.worldPick.intent.entityId, 'car-1');
        assert.deepEqual(event.worldPick.identity, g.identities[1]);
        readBabylonPoint(event.worldPick.point);
      } else assert.equal(event.worldPick, null);
      if (event.mode === 'AUTO') {
        assert.equal(event.seat, null);
      } else {
        assert.equal(event.seat.mode, event.mode);
        assert.deepEqual(event.seat.identity, g.identities[0]);
      }
    }
    modeProofs(g, [
      { tick: 3, mode: 'MANUAL' },
      { tick: 6, mode: 'LEARNING' },
    ]);
    assert.equal(g.pauses.length, 2);
    for (let j = 0; j < 2; j++) {
      const pause = g.pauses[j];
      assert.equal(pause.mode, ['MANUAL', 'LEARNING'][j]);
      assert.equal(pause.priorTick, [3, 6][j]);
      assert.equal(pause.afterTick, pause.priorTick);
      assert.equal(pause.priorSerial, pause.priorTick);
      assert.equal(pause.afterSerial, pause.priorSerial);
      assert.equal(pause.rejected, true);
      bodies(pause.before, g.identities);
      assert.deepEqual(pause.after, pause.before);
    }
    const pick = g.picking;
    assert.equal(pick.visibleIntent.entityId, 'car-1');
    readBabylonPoint(pick.point);
    assert.notEqual(pick.hiddenPick?.entityId, 'car-1');
    assert.notEqual(pick.disabledPick?.entityId, 'car-1');
    assert.equal(pick.occludedPick, null);
    const offscreenPoint = readBabylonPoint(pick.offscreenPoint, false);
    assert.ok(
      offscreenPoint.x < 0 ||
        offscreenPoint.x >= 1920 ||
        offscreenPoint.y < 0 ||
        offscreenPoint.y >= 1080 ||
        offscreenPoint.z < 0 ||
        offscreenPoint.z > 1,
    );
    assert.deepEqual(pick.oldIdentity, g.identities[1]);
    identity(pick.replacementIdentity);
    assert.equal(pick.replacementIdentity.entityId, pick.oldIdentity.entityId);
    assert.notEqual(pick.replacementIdentity.generation, pick.oldIdentity.generation);
    ownedActual(g);
    proofs(g);
    assert.ok(arm.ticks >= 720 && arm.ticks <= 726);
    assert.equal(arm.owned.guard.nativeSteps, arm.ticks);
    assert.equal(arm.observer, null);
    assert.equal(arm.rawTimings, null);
    assert.equal(arm.overloadCount, 0);
    assert.ok(arm.maximumPlayers <= 1);
    assert.deepEqual(
      arm.checkpoints.filter((c) => c.tick <= 720).map((c) => c.tick),
      Array.from({ length: 12 }, (_, i) => (i + 1) * 60),
    );
    assignment(arm);
    checkpoints(arm);
    const claims = [];
    for (let cycle = 0; 1 + 60 * cycle <= arm.ticks; cycle++)
      if (cycle % 3 !== 0)
        claims.push({ tick: 1 + 60 * cycle, mode: ['AUTO', 'MANUAL', 'LEARNING'][cycle % 3] });
    modeProofs(arm, claims);
    const counts = { AUTO: 0, MANUAL: 0, LEARNING: 0 };
    for (let tick = 1; tick <= arm.ticks; tick++) {
      const mode =
        (tick - 1) % 60 < 20
          ? ['AUTO', 'MANUAL', 'LEARNING'][Math.floor((tick - 1) / 60) % 3]
          : 'AUTO';
      counts[mode]++;
    }
    assert.deepEqual(arm.modes, counts);
    assert.equal(arm.maximumPlayers, 1);
    for (const name of ['maxSpeedMps', 'maxDisplacementM', 'maxRafGapMs', 'elapsedWallMs'])
      assert.ok(Number.isFinite(arm[name]) && arm[name] >= 0);
    assert.deepEqual(arm.finalMechanics.map(immutable), arm.initialMechanics.map(immutable));
    const expected = [];
    for (let tick = 1; tick <= arm.ticks; tick++)
      if (tick % 60 === 21 || tick % 60 === 41)
        expected.push({ tick, selected: tick % 60 === 21 ? 'car-1' : 'car-0' });
    assert.deepEqual(
      arm.selectionProofs.map((p) => ({ tick: p.tick, selected: p.selected })),
      expected,
    );
    ownedActual(arm);
    proofs(arm);
  }
  for (let index = 0; index < 10; index++) {
    const run = r.frameRuns[index],
      pair = Math.floor(index / 2),
      observer = pair % 2 === 0 ? index % 2 === 1 : index % 2 === 0;
    assert.equal(run.pair, pair);
    assert.equal(run.observer, observer);
    const counts = { AUTO: 0, MANUAL: 0, LEARNING: 0 };
    for (let tick = 1; tick <= run.ticks; tick++) {
      const mode =
        (tick - 1) % 60 < 20
          ? ['AUTO', 'MANUAL', 'LEARNING'][Math.floor((tick - 1) / 60) % 3]
          : 'AUTO';
      counts[mode]++;
    }
    assert.deepEqual(run.modes, counts);
    assert.equal(run.maximumPlayers, counts.MANUAL + counts.LEARNING > 0 ? 1 : 0);
    assert.equal(run.frames, 600);
    assignment(run);
    checkpoints(run);
    const claims = [];
    for (let cycle = 0; 1 + 60 * cycle <= run.ticks; cycle++)
      if (cycle % 3 !== 0)
        claims.push({ tick: 1 + 60 * cycle, mode: ['AUTO', 'MANUAL', 'LEARNING'][cycle % 3] });
    modeProofs(run, claims);
    assert.equal(run.warmupFrames, 30);
    assert.equal(run.overloadCount, 0);
    assert.ok(run.maximumPlayers <= 1);
    assert.deepEqual(run.frameMs, distribution(run.rawTimings.frameMs));
    assert.ok(run.frameMs.p50 > 0 && run.frameMs.p95 <= 18.5 && run.frameMs.p99 <= 25);
    assert.equal(run.sampleBytes, 600 * 8 * (observer ? 3 : 1));
    if (observer) {
      assert.deepEqual(run.workMs, distribution(run.rawTimings.workMs));
      assert.deepEqual(run.uiMs, distribution(run.rawTimings.uiMs));
      assert.ok(run.workMs.p95 <= 10);
    } else {
      assert.equal(run.workMs, null);
      assert.equal(run.uiMs, null);
      assert.equal(run.rawTimings.workMs, null);
      assert.equal(run.rawTimings.uiMs, null);
    }
    for (const name of ['maxSpeedMps', 'maxDisplacementM', 'maxRafGapMs', 'elapsedWallMs'])
      assert.ok(Number.isFinite(run[name]) && run[name] >= 0);
    assert.equal(run.owned.guard.nativeSteps, run.ticks);
    assert.deepEqual(run.finalMechanics.map(immutable), run.initialMechanics.map(immutable));
    const expected = [];
    for (let tick = 1; tick <= run.ticks; tick++)
      if (tick % 60 === 21 || tick % 60 === 41)
        expected.push({ tick, selected: tick % 60 === 21 ? 'car-1' : 'car-0' });
    assert.deepEqual(
      run.selectionProofs.map((p) => ({ tick: p.tick, selected: p.selected })),
      expected,
    );
    ownedActual(run);
    proofs(run);
  }
  results.push({
    renderer: r.renderer,
    sourceHash: m.sourceHash,
    artifactHash: m.artifactHash,
    worlds: r.worldsCreated,
  });
}
console.log(
  JSON.stringify({
    status: 'PASS',
    results,
    scope:
      'Chronological scoped camera/picking/selection BEFORE;raw600RAF arrays recomputed;not fullfleetFPS/trustedkeys/fullDocs25steady acceptance.',
  }),
);
