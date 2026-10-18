import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = 'Docs/Evidence/052-yield-policy/raf-scheduling-20261006T150911155Z';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = await json(folder + '/build-manifest.json');
const results = [];
for (const preference of ['AUTO', 'WEBGL2']) {
  const base = `${folder}/captures/${preference}`;
  const bytes = await readFile(base + '/submitted.json');
  const report = JSON.parse(bytes);
  const envelope = await json(base + '/submitted-envelope.json');
  const start = await json(base + '/started.json');
  const terminal = await json(base + '/terminal.json');
  assert.equal(bytes.length, envelope.bytes);
  assert.equal(sha(bytes), envelope.sha256);
  assert.equal(report.captureId, start.captureId);
  assert.equal(terminal.captureId, report.captureId);
  assert.equal(report.status, 'COMPLETE_DIAGNOSTIC');
  assert.equal(terminal.status, report.status);
  assert.equal(report.performanceAcceptance, false);
  assert.equal(report.hardwareFullAcceptance, false);
  for (const key of ['sourceHash', 'artifactHash', 'nativeHash']) {
    assert.equal(start[key], manifest[key]);
    assert.equal(report.build[key], manifest[key]);
  }
  assert.equal(report.error, null);
  assert.equal(report.cleanup.total, 0);
  assert.equal(report.cleanup.omitted, 0);
  assert.equal(report.cleanup.resources, report.cleanup.attempted);
  assert.equal(report.cleanup.readbacks.listeners.owned, 0);
  assert.equal(report.cleanup.readbacks.heartbeat.cleared, true);
  assert.deepEqual(report.cleanup.readbacks.backend, {
    sceneDisposed: true, engineScenes: 0, sceneMeshes: 0, sceneMaterials: 0,
  });
  assert.equal(report.nativeCleanup.controller.tick, 2400);
  assert.equal(report.nativeCleanup.controller.disposed, true);
  for (const key of ['vehicles', 'targets', 'projections', 'players', 'retainedBatches'])
    assert.equal(report.nativeCleanup.controller[key], 0);
  assert.deepEqual(report.nativeCleanup.bodies, { entities: 0, subscriptions: 0 });
  assert.equal(report.nativeCleanup.collision.colliders, 0);
  assert.equal(report.longTaskOverflow, 0);
  const phases = {};
  for (const wait of report.waits) {
    assert.equal(wait.timeout, false);
    assert.ok(Number.isFinite(wait.callbackMs) && wait.callbackMs >= wait.requestMs);
    assert.ok(wait.beforeReadEndMs <= wait.requestMs);
    assert.ok(wait.callbackMs <= wait.afterReadStartMs && wait.afterReadStartMs <= wait.afterReadEndMs);
    assert.ok(wait.stampMs <= wait.callbackMs + 1e-6);
    assert.equal(wait.nativeBefore, wait.nativeAfter);
    assert.equal(wait.controllerBefore, wait.controllerAfter);
    const phase = phases[wait.phase] ??= { count: 0, firstCount: 0, maxWaitMs: 0, maxStampGapMs: 0, previousStamp: null };
    phase.count++;
    phase.firstCount += Number(wait.first);
    phase.maxWaitMs = Math.max(phase.maxWaitMs, wait.callbackMs - wait.requestMs);
    if (phase.previousStamp !== null)
      phase.maxStampGapMs = Math.max(phase.maxStampGapMs, wait.stampMs - phase.previousStamp);
    phase.previousStamp = wait.stampMs;
  }
  for (const phase of Object.values(phases)) { assert.equal(phase.firstCount, 1); delete phase.previousStamp; }
  results.push({ preference, renderer: report.renderer, captureId: report.captureId,
    sha256: sha(bytes), bytes: bytes.length, waits: report.waits.length, phases,
    observerSupported: report.observerSupported, observerError: report.observerError,
    longTasks: report.longTasks, cleanup: 'ZERO_READBACKS',
    apiAvailability: report.apiAvailability });
}
const result = { status: 'COMPLETE_DIAGNOSTICS_VERIFIED', hardwareFullAcceptance: false,
  performanceAcceptance: false, causality: 'UNKNOWN; earlier full-run stalls not reproduced by this bounded diagnostic', results };
await writeFile('Docs/Evidence/052-yield-policy/parent-raf-diagnostic-results.json',
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
