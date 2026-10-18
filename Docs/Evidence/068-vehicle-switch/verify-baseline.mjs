// Original strict068 preproduction verifier. --historical does not claim current production absence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const folder = resolve(root, 'Docs/Evidence/068-vehicle-switch');
const historical = process.argv.includes('--historical');
assert(
  process.argv.slice(2).every((v) => v === '--historical'),
  'Unsupported verifier argument',
);
const bytes = (path) => readFile(path),
  hash = (value) => createHash('sha256').update(value).digest('hex');
const report = JSON.parse(await bytes(resolve(folder, 'before.json')));
assert.equal(report.status, 'PASS');
assert.equal(report.fixtureVersion, '068-published067-selection-reference-v1');
assert.equal(report.budgetVersion, '203-initial-1');
const start = JSON.parse(await bytes(resolve(folder, 'before-started.json'))),
  first = JSON.parse(await bytes(resolve(folder, 'before-first-world.json')));
assert.equal(start.startedAt, report.startedAt);
assert.equal(first.firstWorldAt, report.firstWorldAt);
assert.equal(first.sourceHash, report.sourceHash);
assert(Date.parse(report.startedAt) <= Date.parse(report.nativeArtifact.archivedAt));
assert(Date.parse(report.nativeArtifact.archivedAt) <= Date.parse(report.firstWorldAt));
assert(Date.parse(report.firstWorldAt) <= Date.parse(report.capturedAt));
const source = createHash('sha256'),
  paths = new Set();
for (const input of report.inputs) {
  assert(!paths.has(input.path));
  paths.add(input.path);
  assert(!input.path.includes('..') && !input.path.startsWith('/') && !input.path.includes('\\'));
  const actual = await bytes(resolve(folder, 'source-before', input.path));
  assert.equal(actual.length, input.bytes);
  assert.equal(hash(actual), input.sha256);
  source.update(input.path).update(actual);
  if (!historical)
    assert.equal(
      hash(await bytes(resolve(root, input.path))),
      input.sha256,
      'Current source differs: ' + input.path,
    );
}
assert.equal(source.digest('hex'), report.sourceHash);
assert(paths.has('scripts/benchmark-vehicle-selection-before.mjs'));
assert(paths.has('tests/input/vehicle-selection-reference.ts'));
assert(!paths.has('src/input/vehicle-selection.ts'));
if (!historical) {
  let absent = false;
  try {
    await access(resolve(root, 'src/input/vehicle-selection.ts'));
  } catch (error) {
    if (error.code === 'ENOENT') absent = true;
    else throw error;
  }
  assert(absent, '068 production must still be absent');
}
const native = await bytes(resolve(folder, report.nativeArtifact.archiveRelativePath));
assert.equal(native.length, report.nativeArtifact.bytes);
assert.equal(hash(native), report.nativeArtifact.sha256);
assert.equal(first.nativeSha256, report.nativeArtifact.sha256);
if (!historical)
  assert.equal(hash(await bytes(report.nativeArtifact.path)), report.nativeArtifact.sha256);
assert.deepEqual(report.resourceFailures, []);
assert.equal(report.runs.length, 20);
assert.equal(report.scenarios.length, 12);
assert.equal(report.guards.length, 2);
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)];
function cleanup(c) {
  assert.deepEqual(c.errors, []);
  assert.equal(new Set(c.attempts).size, c.attempts.length);
  for (const key of ['vehicles', 'targets', 'projections', 'players'])
    assert.equal(c.controller[key], 0);
  assert.equal(c.controller.disposed, true);
  assert.equal(c.controller.retainedBatches, 0);
  assert.equal(c.authority.vehicles, 0);
  assert.equal(c.authority.players, 0);
  assert.equal(c.authority.seat, null);
  assert.equal(c.authority.disposed, true);
  assert.equal(c.authority.retainedHistory, 0);
  assert.equal(c.authority.retainedBatches, 0);
  assert.equal(c.keyboard.heldKeys, 0);
  assert.equal(c.keyboard.retainedFrames, 0);
  assert.equal(c.keyboard.pendingPreferences, false);
  assert.equal(c.keyboard.disposed, true);
  assert.equal(c.body.entities, 0);
  assert.equal(c.body.subscriptions, 0);
  assert.equal(c.collision.colliders, 0);
  assert.equal(c.collision.vehicles, 0);
  assert.equal(c.collision.obstacles, 0);
  assert.equal(c.collision.disposed, true);
  assert.equal(c.segment.retainedSegments, 0);
  assert.equal(c.segment.disposed, true);
  assert.equal(c.segment.retainedHistory, 0);
}
function validate(r) {
  cleanup(r.cleanup);
  assert.deepEqual(r.cleanup.attempts, [
    'assignments',
    'cameraTarget',
    'segment',
    'mode',
    'authority',
    'keyboard',
    'controller',
    'world',
  ]);
  assert(Number.isInteger(r.count) && r.count >= 2 && r.count <= 110);
  const cycles =
    r.fixedMode === null
      ? { AUTO: 5, MANUAL: 4, LEARNING: 4 }
      : {
          AUTO: r.fixedMode === 'AUTO' ? 13 : 0,
          MANUAL: r.fixedMode === 'MANUAL' ? 13 : 0,
          LEARNING: r.fixedMode === 'LEARNING' ? 13 : 0,
        };
  const controlled = cycles.MANUAL + cycles.LEARNING;
  assert.equal(r.explicitClaims, controlled);
  assert.equal(r.oldFilterClears, controlled);
  assert.equal(r.owned.segment.opened, controlled);
  assert.equal(r.owned.segment.closed, controlled);
  assert.equal(r.cleanup.segment.opened, controlled);
  assert.equal(r.cleanup.segment.closed, controlled);
  assert.equal(r.owned.segment.retainedSegments, controlled ? 1 : 0);
  assert.deepEqual(r.modeCounts, {
    AUTO: cycles.AUTO * 60 + controlled * 40,
    MANUAL: cycles.MANUAL * 20,
    LEARNING: cycles.LEARNING * 20,
  });
  assert.equal(r.maximumPlayers, controlled ? 1 : 0);
  assert.equal(r.owned.controller.vehicles, r.count);
  assert.equal(r.owned.controller.tick, 780);
  assert.equal(r.owned.controller.disposed, false);
  assert.equal(r.owned.controller.players, 0);
  assert.equal(r.owned.authority.vehicles, r.count);
  assert.equal(r.owned.authority.tick, 780);
  assert.equal(r.owned.body.entities, r.count);
  assert.equal(r.owned.body.subscriptions, 0);
  assert.equal(r.owned.assignments, r.count);
  assert.equal(r.owned.collision.vehicles, r.count);
  assert(r.owned.collision.colliders <= 256);
  assert(r.owned.collision.obstacles <= 96);
  assert(r.classId === null || ['sedan', 'compact'].includes(r.classId));
  assert(['TAXI', 'CIVIL'].includes(r.targetKind));

  assert.equal(r.warmupTicks, 180);
  assert.equal(r.measuredTicks, 600);
  assert.equal(r.physicalTicks, 780);
  assert(r.maximumPlayers <= 1);
  assert.equal(r.selections, 26);
  assert.equal(r.cameraUpdates, 780);
  assert(r.maxDisplacementM < 0.7);
  assert.equal(r.drivingPoseWrites, 0);
  assert.equal(r.drivingVelocityWrites, 0);
  assert.equal(r.checkpoints.length, 13);
  r.checkpoints.forEach((c, i) => assert.equal(c.tick, (i + 1) * 60));
  assert.equal(r.selectionTrace.length, 26);
  for (let cycle = 0; cycle < 13; cycle++) {
    const depart = r.selectionTrace[cycle * 2],
      back = r.selectionTrace[cycle * 2 + 1];
    assert.equal(depart.tick, cycle * 60 + 21);
    assert.equal(back.tick, cycle * 60 + 41);
    assert.equal(depart.selected, 'car-1');
    assert.equal(back.selected, 'car-0');
    assert.equal(depart.seat, null);
    assert.equal(back.seat, null);
    assert.equal(depart.assignmentDigest, r.assignmentDigest);
    assert.equal(back.assignmentDigest, r.assignmentDigest);
  }
  assert.equal(r.initialMechanics.length, r.count);
  assert.equal(r.finalMechanics.length, r.count);
  for (const mechanics of [...r.initialMechanics, ...r.finalMechanics])
    assert.equal(mechanics.classId, r.classId);
  const immutable = (mechanics) =>
    Object.fromEntries(
      Object.entries(mechanics).filter(
        ([key]) =>
          !['appliedEngineForceN', 'appliedSteeringRadians', 'wheelBrakeImpulseLimitNs'].includes(
            key,
          ),
      ),
    );
  assert.deepEqual(r.initialMechanics.map(immutable), r.finalMechanics.map(immutable));
  assert.equal(r.cleanup.body.entities, 0);
  assert.equal(r.cleanup.collision.colliders, 0);
  assert.equal(r.cleanup.segment.retainedSegments, 0);
  assert.equal(r.cleanup.mode.intents, 0);
  assert.equal(r.cleanup.mode.inFlight, 0);
  assert.equal(r.cleanup.mode.disposed, true);
  assert.equal(r.cleanup.cameraTarget, null);
  assert.equal(r.cleanup.assignments, 0);
  if (r.observer) {
    assert.equal(r.sampleBytes, 600 * 3 * 8);
    for (const [rawKey, summaryKey] of [
      ['tickMs', 'tickMs'],
      ['authorityMs', 'existingAuthorityMs'],
      ['referenceSelectionMs', 'referenceSelectionMs'],
    ]) {
      const values = r.rawTimings[rawKey];
      assert.equal(values.length, 600);
      assert(values.every((v) => Number.isFinite(v) && v >= 0));
      assert.deepEqual(r[summaryKey], {
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        p99: percentile(values, 0.99),
      });
    }
  } else {
    assert.equal(r.sampleBytes, 0);
    assert.equal(r.rawTimings, null);
    assert.equal(r.tickMs, null);
    assert.equal(r.existingAuthorityMs, null);
    assert.equal(r.referenceSelectionMs, null);
  }
}
for (const r of [...report.runs, ...report.scenarios]) validate(r);
const canonicalOrder = [];
for (const count of [70, 110])
  for (let pair = 0; pair < 5; pair++)
    for (const observer of pair % 2 ? [true, false] : [false, true])
      canonicalOrder.push({ count, pair, observer });
assert.deepEqual(
  report.runs.map(({ count, pair, observer }) => ({ count, pair, observer })),
  canonicalOrder,
);
for (const r of report.runs) {
  assert.equal(r.classId, null);
  assert.equal(r.fixedMode, null);
  assert.equal(r.targetKind, 'TAXI');
}
const scenarioOrder = [];
for (const classId of ['sedan', 'compact'])
  for (const targetKind of ['TAXI', 'CIVIL'])
    for (const fixedMode of ['AUTO', 'MANUAL', 'LEARNING'])
      scenarioOrder.push({ classId, targetKind, fixedMode });
assert.deepEqual(
  report.scenarios.map(({ classId, targetKind, fixedMode }) => ({
    classId,
    targetKind,
    fixedMode,
  })),
  scenarioOrder,
);
for (const r of report.scenarios) {
  assert.equal(r.count, 2);
  assert.equal(r.observer, false);
  assert.equal(r.pair, 0);
}
assert.deepEqual(
  report.guards.map((r) => r.classId),
  ['sedan', 'compact'],
);
for (const count of [70, 110]) {
  const group = report.runs.filter((r) => r.count === count);
  assert.equal(group.length, 10);
  for (let pair = 0; pair < 5; pair++)
    assert.deepEqual(
      group
        .filter((r) => r.pair === pair)
        .map((r) => r.observer)
        .sort(),
      [false, true],
    );
  for (const r of group) {
    for (const key of [
      'decisionDigest',
      'rawPlayerDigest',
      'selectionDigest',
      'assignmentDigest',
      'finalPhysicalHash',
    ])
      assert.equal(r[key], group[0][key]);
    assert.deepEqual(r.checkpoints, group[0].checkpoints);
    assert.deepEqual(r.selectionTrace, group[0].selectionTrace);
    for (const mode of ['AUTO', 'MANUAL', 'LEARNING']) assert(r.modeCounts[mode] > 0);
  }
  if (count === 70)
    assert(
      group.filter((r) => r.observer).every((r) => r.tickMs.p95 <= 5.5),
      'Normal70 unchanged5.5ms cap',
    );
}
for (const classId of ['sedan', 'compact']) {
  for (const kind of ['TAXI', 'CIVIL'])
    for (const mode of ['AUTO', 'MANUAL', 'LEARNING'])
      assert.equal(
        report.scenarios.filter(
          (r) => r.classId === classId && r.targetKind === kind && r.fixedMode === mode,
        ).length,
        1,
      );
  const g = report.guards.find((r) => r.classId === classId);
  assert(g);
  for (const key of [
    'hiddenRejected',
    'civilFleetRejected',
    'retiredGenerationRejected',
    'boundaryMismatchBeforePhysicsRejected',
    'acceptedReleaseBeforeClosureFault',
  ])
    assert.equal(g[key], true);
  assert.equal(g.pausedPhysicalTicks, 0);
  cleanup(g.cleanup);
  assert.deepEqual(g.cleanup.attempts, ['segment', 'authority', 'keyboard', 'controller', 'world']);
  assert.equal(g.cleanup.segment.opened, 2);
  assert.equal(g.cleanup.segment.closed, 1);
  assert.equal(g.cleanup.authority.tick, 4);
}
console.log(
  JSON.stringify({
    status: 'PASS',
    scope: historical ? 'HISTORICAL strict preproduction archive' : 'CURRENT strict preproduction',
    sourceHash: report.sourceHash,
    inputs: report.inputs.length,
    nativeSha256: report.nativeArtifact.sha256,
    worlds: 34,
  }),
);
