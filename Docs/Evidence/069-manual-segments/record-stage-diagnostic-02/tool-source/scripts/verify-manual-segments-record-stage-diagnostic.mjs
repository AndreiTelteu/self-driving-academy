// SOURCE-only independent diagnostic inventory/raw numeric reader. Never a PBI acceptance reader.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { verifyPreflight } from './verify-manual-segments-record-stage-preflight.mjs';
const root = resolve('Docs/Evidence/069-manual-segments/record-stage-diagnostic-02');
const json = async (p) => JSON.parse(await readFile(resolve(root, p)));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const stages = [
  'bytewalk',
  'parse005',
  'immutability',
  'cachehit',
  'append',
  'bridge',
  'authorityStats',
  'controllerStats',
];
export function quantile(values, p) {
  assert(values.length === 600);
  assert(values.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0));
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
}
export function validateOwnerCleanup(record) {
  assert.deepEqual(record.cleanup.attempts, [
    'selection',
    'bridge',
    'intake',
    'bus',
    'cameraTarget',
    'segment',
    'mode',
    'authority',
    'keyboard',
    'controller',
    'world',
  ]);
  assert.deepEqual(record.cleanup.errors, []);
  assert.equal(record.cleanup.disposedReadRejected, true);
  const zero = {
    body: ['entities', 'subscriptions'],
    collision: ['vehicles', 'obstacles', 'colliders'],
    controller: ['vehicles', 'targets', 'projections', 'players', 'retainedBatches'],
    keyboard: ['heldKeys', 'retainedFrames'],
    authority: ['vehicles', 'players', 'retainedHistory', 'retainedBatches'],
    mode: ['intents', 'inFlight', 'retainedHistory'],
    segment: ['records', 'open', 'reservations'],
    intake: ['entries', 'pending', 'acknowledgedReceipts', 'referencedPayloadBytes'],
    bus: [
      'retainedEvents',
      'retainedCodeUnits',
      'listeners',
      'pending',
      'admissionLedgerEntries',
      'admissionLedgerCodeUnits',
    ],
    selection: ['vehicles', 'pending', 'inFlight', 'retainedHistory'],
  };
  for (const [owner, keys] of Object.entries(zero)) {
    const row = record.cleanup.snapshots[owner];
    assert(row && typeof row === 'object');
    for (const key of keys) assert.equal(row[key], 0, owner + '.' + key);
    if (owner !== 'body') assert.equal(row.disposed, true);
  }
  assert.equal(record.cleanup.snapshots.cameraTarget, null);
  assert.equal(record.cleanup.snapshots.authority.seat, null);
  assert.equal(record.cleanup.snapshots.bridge.disposed, true);
  assert.equal(record.cleanup.snapshots.bridge.busy, false);
  assert.equal(record.cleanup.snapshots.bridge.bound, false);
}
export function validateAbsoluteFlags(complete, records) {
  assert.deepEqual(
    complete.absoluteGateFlags,
    records
      .filter((x) => x.descriptor.observer)
      .map((x) => ({
        pair: x.descriptor.pair,
        tickP95: quantile(x.raw.tickMs, 0.95),
        rapierP95: quantile(x.raw.rapierMs, 0.95),
        normalTickViolation: quantile(x.raw.tickMs, 0.95) > 5.5,
        normalRapierViolation: quantile(x.raw.rapierMs, 0.95) > 3,
      })),
  );
}
export async function verify() {
  await verifyPreflight();
  const proof = await json('runtime-proof.json');
  const { validateRecord } = await import(
    pathToFileURL(resolve(proof.runtime, 'scripts/manual-segments-after-records.mjs')).href
  ); // Exact derived bytes proved BEFORE this trusted local COPY validator import.
  assert.equal(proof.scope, 'INSTRUMENTED_COPY_ONLY_NO_ACCEPTANCE');
  assert.equal(proof.observerBytes, 76800);
  assert(proof.inputs.length <= 512);
  assert.equal(new Set(proof.inputs.map((r) => r.path)).size, proof.inputs.length);
  for (const r of proof.inputs) {
    assert(
      typeof r.path === 'string' &&
        !r.path.includes('..') &&
        !r.path.startsWith('/') &&
        !r.path.includes('\\'),
    );
    const b = await readFile(resolve(root, 'runtime-source', r.path));
    assert.equal(b.length, r.bytes);
    assert.equal(sha(b), r.sha256);
  }
  assert.equal(sha(Buffer.from(JSON.stringify(proof.inputs))), proof.sourceHash);
  const native = await readFile(resolve(root, 'native/rapier.mjs'));
  assert.equal(native.length, 4340292);
  assert.equal(sha(native), '02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0');
  const complete = await json('capture/complete.json'),
    manifest = await json('capture/manifest.json'),
    first = await json('capture/first-world.json');
  assert.equal(complete.status, 'DIAGNOSTIC_COLLECTED_NOT_ACCEPTANCE');
  assert.equal(complete.worlds, 10);
  assert.equal(
    manifest.sourceHash,
    '9fa30829a05b8fa6e2b91ba600efcbb8367fc7eea1fb7e3233417a1b19bb4c10',
  );
  assert.equal(complete.sourceHash, manifest.sourceHash);
  assert.equal(first.sourceHash, manifest.sourceHash);
  assert(Date.parse(first.firstWorldAt) <= Date.parse(complete.completedAt));
  assert.deepEqual(manifest.diagnosticRuntimeProof, proof);
  assert(
    Date.parse(proof.preparedAt) <= Date.parse(manifest.archivedAt) &&
      Date.parse(manifest.archivedAt) <= Date.parse(first.firstWorldAt),
  );
  const files = (await readdir(resolve(root, 'capture/worlds'))).sort();
  const expected = Array.from({ length: 10 }, (_, i) =>
    ['started', 'complete', 'stages'].map((s) => 'world-' + i + '.' + s + '.json'),
  )
    .flat()
    .sort();
  assert.deepEqual(files, expected);
  const rootFiles = await readdir(resolve(root, 'capture'));
  assert(!rootFiles.some((x) => /failure|rejected|incomplete/.test(x)));
  const runs = [];
  for (let i = 0; i < 10; i++) {
    const r = await json('capture/worlds/world-' + i + '.complete.json'),
      s = await json('capture/worlds/world-' + i + '.stages.json'),
      start = await json('capture/worlds/world-' + i + '.started.json');
    const descriptor = {
      ordinal: i,
      count: 70,
      pair: Math.floor(i / 2),
      observer: Math.floor(i / 2) % 2 === 0 ? i % 2 === 1 : i % 2 === 0,
      classId: null,
      fixedMode: null,
      kind: 'FLEET',
    };
    assert.deepEqual(r.descriptor, descriptor);
    assert.deepEqual(start.descriptor, descriptor);
    assert.equal(start.sourceHash, manifest.sourceHash);
    validateRecord(r, descriptor, manifest.sourceHash);
    validateOwnerCleanup(r);
    assert.equal(r.descriptor.ordinal, i);
    assert.equal(r.descriptor.count, 70);
    assert.equal(r.descriptor.pair, Math.floor(i / 2));
    assert.equal(r.descriptor.observer, Math.floor(i / 2) % 2 === 0 ? i % 2 === 1 : i % 2 === 0);
    assert.equal(r.nativeStepSerial, 780);
    assert.equal(r.acceptedTick, 780);
    assert.equal(r.primary, null);
    assert.equal(r.terminalErrors, null);
    assert.equal(r.cleanup.errors.length, 0);
    assert.equal(r.cleanup.disposedReadRejected, true);
    assert.deepEqual(
      r.checkpoints.map((c) => c.tick),
      Array.from({ length: 13 }, (_, j) => (j + 1) * 60),
    );
    assert(Date.parse(start.startedAt) <= Date.parse(r.completedAt));
    assert.equal(s.ownedBytes, 76800);
    assert.equal(s.observer, r.descriptor.observer);
    assert.equal(s.scope, 'INCLUSIVE_NESTED_NOT_ADDITIVE');
    assert.deepEqual(Object.keys(s.counts), stages);
    assert.deepEqual(Object.keys(s.times), stages);
    const metrics = {};
    for (const stage of stages) {
      const c = s.counts[stage];
      assert(c.length === 600 && c.every((x) => Number.isSafeInteger(x) && x >= 0 && x <= 1e7));
      if (s.observer) {
        metrics[stage] = {
          calls: c.reduce((a, b) => a + b, 0),
          perTickInclusiveP50: quantile(s.times[stage], 0.5),
          perTickInclusiveP95: quantile(s.times[stage], 0.95),
          inclusiveTotalMs: s.times[stage].reduce((a, b) => a + b, 0),
        };
      } else {
        assert.equal(s.times[stage], null);
        metrics[stage] = { calls: c.reduce((a, b) => a + b, 0), times: null };
      }
    }
    runs.push({
      record: r,
      metrics,
      whole: s.observer
        ? {
            p50: quantile(r.raw.tickMs, 0.5),
            p95: quantile(r.raw.tickMs, 0.95),
            normalViolation: quantile(r.raw.tickMs, 0.95) > 5.5,
          }
        : null,
    });
  }
  validateAbsoluteFlags(
    complete,
    runs.map((x) => x.record),
  );
  for (let pair = 0; pair < 5; pair++) {
    const [a, b] = runs.slice(pair * 2, pair * 2 + 2);
    for (const field of ['nativeInputDigest', 'packetDigest', 'physicalDigest', 'rawInputDigest'])
      assert.equal(a.record[field], b.record[field]);
    assert.deepEqual(a.record.checkpoints, b.record.checkpoints);
  }
  return {
    status: 'VERIFIED_DIAGNOSTIC_ONLY_NOT_ACCEPTANCE',
    sourceHash: proof.sourceHash,
    worlds: 10,
    runs: runs.map((x) => ({
      descriptor: x.record.descriptor,
      metrics: x.metrics,
      whole: x.whole,
    })),
    limits:
      'Nested inclusive timers/callback overhead; no pureallocation/GC causality. Original failedAFTER and baseline unchanged.',
  };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename))
  console.log(JSON.stringify(await verify(), null, 2));
