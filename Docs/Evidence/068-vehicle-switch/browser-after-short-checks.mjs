import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { owned, distribution } from './browser-evidence-checks.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
export function ownedActual(run) {
  const snapshot = run.cleanup.snapshots.selection;
  assert.equal(run.cleanup.attempts.filter((name) => name === 'selection').length, 1);
  for (const field of ['vehicles', 'pending', 'inFlight']) assert.equal(snapshot[field], 0);
  assert.equal(snapshot.projection, null);
  assert.equal(snapshot.disposed, true);
  assert.equal(snapshot.retainedHistory, 0);
  // Existing exact ownership assertions remain intact; only the additional068 owner is removed
  // from the temporary reader view after independently validating it above.
  owned({
    ...run,
    cleanup: {
      ...run.cleanup,
      attempts: run.cleanup.attempts.filter((name) => name !== 'selection'),
    },
  });
}
export function compareShort(actual, baseline) {
  assert.equal(baseline.status, 'PASS');
  assert.equal(baseline.fixtureVersion, '068-selection-browser-reference-v1');
  for (let index = 0; index < 2; index++) {
    const a = actual.arms[index],
      b = baseline.arms[index];
    assert.equal(a.classId, b.classId);
    assert.deepEqual(a.context, b.context);
    assert.deepEqual(a.identities, b.identities);
    // RAF endpoints may accept a final catch-up tick. Compare all canonical first720ticks,
    // not a truncated checkpoint subset or a presumed identical frame endpoint.
    for (const field of ['rawPacketsJsonl', 'rawControlsJsonl', 'rawNativeInputsJsonl']) {
      const ap = a[field].trimEnd().split('\n'),
        bp = b[field].trimEnd().split('\n');
      assert.ok(ap.length >= 720 && bp.length >= 720);
      assert.deepEqual(ap.slice(0, 720), bp.slice(0, 720), `${a.classId}:${field}`);
    }
    assert.deepEqual(
      a.checkpoints.filter((p) => p.tick <= 720),
      b.checkpoints.filter((p) => p.tick <= 720),
    );
    assert.deepEqual(a.initialMechanics, b.initialMechanics);
    assert.equal(a.assignmentDigest, b.assignmentDigest);
    for (let i = 0; i < b.selectionProofs.length; i++) {
      const ap = a.selectionProofs[i],
        bp = b.selectionProofs[i];
      for (const field of [
        'tick',
        'serial',
        'serialAfter',
        'context',
        'selectedIdentity',
        'selectionSource',
        'selectedKind',
        'cameraSelected',
        'oldSeat',
        'segmentBefore',
        'segmentAfter',
        'authority',
        'assignmentBefore',
        'assignmentAfter',
        'selected',
        'before',
        'after',
        'assignmentText',
      ])
        assert.deepEqual(ap[field], bp[field], `${a.classId}:proof${i}:${field}`);
    }
    assert.ok(a.selectionProofs.length >= b.selectionProofs.length);
  }
  const counts = { frame: 0, work: 0 };
  for (let pair = 0; pair < 5; pair++) {
    const a = actual.frameRuns.find((run) => run.pair === pair && run.observer);
    const b = baseline.frameRuns.find((run) => run.pair === pair && run.observer);
    assert.ok(a && b);
    for (const [key, field] of [
      ['frame', 'frameMs'],
      ['work', 'workMs'],
    ]) {
      const ap95 = distribution(a.rawTimings[field]).p95;
      const bp95 = distribution(b.rawTimings[field]).p95;
      if (ap95 > bp95 * 1.1 && ap95 - bp95 > 1) counts[key]++;
    }
  }
  assert.ok(counts.frame < 3 && counts.work < 3, JSON.stringify({ relativeShortFailure: counts }));
  return counts;
}
export async function worldInventory(folder, report) {
  const root = folder + '/' + report.captureId;
  const files = await readdir(root);
  const expected = [];
  const runs = [
    report.guards[0],
    report.arms[0],
    report.guards[1],
    report.arms[1],
    ...report.frameRuns,
  ];
  assert.equal(runs.length, 14);
  let totalBytes = 0;
  for (let sequence = 0; sequence < 14; sequence++) {
    const startedName = `world-${sequence}-started.json`,
      terminalName = `world-${sequence}-terminal.json`;
    const beginName = `world-${sequence}-begin.json`;
    expected.push(beginName, startedName, terminalName);
    const begin = await json(root + '/' + beginName);
    assert.equal(begin.status, 'STARTED');
    assert.equal(begin.captureId, report.captureId);
    assert.equal(begin.sequence, sequence);
    const start = await json(root + '/' + startedName),
      terminal = await json(root + '/' + terminalName);
    assert.ok(Date.parse(begin.receivedAt) <= Date.parse(start.createdAt));
    assert.equal(start.status, 'STARTED');
    assert.equal(start.captureId, report.captureId);
    assert.equal(start.sequence, sequence);
    assert.ok(Number.isInteger(start.parts) && start.parts >= 1 && start.parts <= 64);
    assert.equal(start.parts, Math.ceil(start.worldBytes / 524288));
    assert.equal(terminal.status, 'PASS');
    assert.equal(terminal.parts, start.parts);
    assert.equal(terminal.bytes, start.worldBytes);
    assert.ok(Date.parse(start.createdAt) <= Date.parse(terminal.createdAt));
    const chunks = [];
    for (let part = 0; part < start.parts; part++) {
      const name = `world-${sequence}-part-${part}.bin`;
      expected.push(name);
      const bytes = await readFile(root + '/' + name);
      assert.equal(bytes.length, Math.min(524288, start.worldBytes - part * 524288));
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks);
    totalBytes += bytes.length;
    assert.equal(bytes.length, start.worldBytes);
    assert.equal(sha(bytes), start.worldSha256);
    assert.equal(sha(bytes), terminal.sha256);
    const record = JSON.parse(bytes.toString('utf8'));
    assert.equal(record.disposition, 'PASS');
    assert.deepEqual(record.causes, []);
    assert.equal(record.partial, null);
    const { pair: ignoredPair, ...run } = runs[sequence];
    void ignoredPair;
    assert.deepEqual(record.result, run);
  }
  assert.ok(totalBytes <= 67108864);
  assert.deepEqual(
    files.sort(),
    expected.sort(),
    'Immutable world inventory extra/failed/incomplete records',
  );
}
