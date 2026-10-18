// Independent SOURCE-only069 native baseline reader. No world acquisition.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  sha256,
  REFERENCE_PROTOCOL,
  descriptors,
  verifyInventory,
} from '../../../scripts/manual-segments-reference-records.mjs';
import { referencePreparseBytes } from '../../../tests/telemetry/manual-segments-reference.ts';
import { parseInterventionSegment } from '../../../src/telemetry/index.ts';
export function boundedPath(root, path) {
  assert.equal(typeof path, 'string');
  assert(!path.includes('\\') && !path.startsWith('/') && !/^[A-Za-z]:/.test(path));
  const target = resolve(root, path),
    part = relative(root, target);
  assert(
    part && !part.startsWith('..' + sep) && part !== '..' && !resolve(path).startsWith('\\\\'),
  );
  return target;
}
export function verifyChronology(manifest, started, first, complete, records) {
  assert.deepEqual(manifest.protocol, REFERENCE_PROTOCOL);
  assert.deepEqual(started.protocol, REFERENCE_PROTOCOL);
  assert.deepEqual(complete.protocol, REFERENCE_PROTOCOL);
  assert.equal(complete.status, 'PASS');
  assert.equal(complete.worlds, 24);
  assert.equal(started.phase, 'CHRONOLOGICAL_BEFORE_PRODUCT_ABSENT');
  assert.equal(started.commit, manifest.commit);
  assert.equal(started.startedAt, manifest.startedAt);
  assert.equal(complete.startedAt, manifest.startedAt);
  for (const row of [first, complete]) assert.equal(row.sourceHash, manifest.sourceHash);
  assert.equal(complete.archivedAt, manifest.archivedAt);
  assert.equal(complete.firstWorldAt, first.firstWorldAt);
  assert.equal(first.nativeSha256, manifest.native.sha256);
  const time = (value) => {
    assert.equal(typeof value, 'string');
    const n = Date.parse(value);
    assert(Number.isFinite(n));
    return n;
  };
  assert(time(started.startedAt) <= time(manifest.archivedAt));
  assert(time(manifest.archivedAt) <= time(first.firstWorldAt));
  let previousCompleted = time(manifest.archivedAt);
  for (const record of records) {
    const worldStarted = time(record.worldStartedAt),
      worldCompleted = time(record.completedAt);
    assert(worldStarted >= time(manifest.archivedAt), 'World began before archives');
    assert(worldStarted >= previousCompleted, 'World chronology overlaps/reorders');
    assert(worldStarted <= worldCompleted, 'Completion precedes acquisition');
    assert(
      time(first.firstWorldAt) <= worldCompleted && worldCompleted <= time(complete.completedAt),
    );
    previousCompleted = worldCompleted;
  }
}
export async function verifyReference(folder, historical = false) {
  const root = resolve(folder),
    files = await readdir(root);
  assert.deepEqual(
    files.sort(),
    [
      'started.json',
      'manifest.json',
      'first-world.json',
      'complete.json',
      'source',
      'native',
      'worlds',
    ].sort(),
    'Exact successful capture root inventory',
  );
  const json = async (p) => JSON.parse(await readFile(boundedPath(root, p)));
  const manifest = await json('manifest.json'),
    started = await json('started.json'),
    first = await json('first-world.json'),
    complete = await json('complete.json');
  assert.equal(manifest.version, '069-native-reference-manifest-v1');
  assert.match(manifest.sourceHash, /^[a-f0-9]{64}$/);
  assert(Array.isArray(manifest.inputs) && manifest.inputs.length > 50);
  assert.equal(new Set(manifest.inputs.map((v) => v.path)).size, manifest.inputs.length);
  assert.deepEqual(
    manifest.inputs.map((v) => v.path),
    manifest.inputs.map((v) => v.path).sort(),
  );
  const archivedSourceFiles = execFileSync('rg', ['--files', resolve(root, 'source/src')], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\r?\n/)
    .map((p) => 'src/' + relative(resolve(root, 'source/src'), p).replaceAll('\\', '/'))
    .sort();
  assert.deepEqual(
    manifest.inputs.filter((v) => v.path.startsWith('src/')).map((v) => v.path),
    archivedSourceFiles,
    'Complete archived production coverage',
  );
  const required = [
    'scripts/benchmark-manual-segments-reference.mjs',
    'scripts/manual-segments-reference-records.mjs',
    'tests/telemetry/manual-segments-reference.ts',
    'tests/telemetry/manual-segments-reference-records.test.mjs',
    'tests/input/vehicle-selection-native-guard-v2.ts',
    'tests/input/vehicle-selection-reference.ts',
    'Docs/Evidence/069-manual-segments/verify-reference.mjs',
    'scripts/register-typescript.mjs',
    'package.json',
    'package-lock.json',
    'Docs/performance-budgets.json',
  ];
  assert.deepEqual(
    manifest.inputs
      .filter((v) => !v.path.startsWith('src/'))
      .map((v) => v.path)
      .sort(),
    required.sort(),
  );
  const allArchiveFiles = execFileSync('rg', ['--files', resolve(root, 'source')], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\r?\n/)
    .map((p) => relative(resolve(root, 'source'), p).replaceAll('\\', '/'))
    .sort();
  assert.deepEqual(
    allArchiveFiles,
    manifest.inputs.map((v) => v.path),
    'No unlisted archived source/helper',
  );
  const source = createHash('sha256');
  for (const row of manifest.inputs) {
    assert.equal(row.archiveRelativePath, 'source/' + row.path);
    assert.match(row.sha256, /^[a-f0-9]{64}$/);
    assert(Number.isSafeInteger(row.bytes) && row.bytes > 0);
    const bytes = await readFile(boundedPath(root, row.archiveRelativePath));
    assert.equal(bytes.length, row.bytes);
    assert.equal(sha256(bytes), row.sha256);
    source.update(row.path).update(bytes);
    assert.equal(
      createHash('sha1')
        .update(Buffer.from('blob ' + bytes.length + '\0'))
        .update(bytes)
        .digest('hex'),
      row.gitBlob,
      'Raw Git blob byte provenance',
    );
    if (!historical) {
      const current = await readFile(boundedPath(process.cwd(), row.path));
      assert.equal(current.length, row.bytes);
      assert.equal(sha256(current), row.sha256, 'CURRENT source mismatch ' + row.path);
    }
  }
  assert.equal(source.digest('hex'), manifest.sourceHash);
  assert.equal(manifest.native.archiveRelativePath, 'native/rapier.mjs');
  const native = await readFile(boundedPath(root, manifest.native.archiveRelativePath));
  assert.equal(native.length, manifest.native.bytes);
  assert.equal(sha256(native), manifest.native.sha256);
  if (!historical) {
    const installed = await readFile(
      fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
    );
    assert.equal(installed.length, manifest.native.bytes, 'CURRENT installed native size');
    assert.equal(sha256(installed), manifest.native.sha256, 'CURRENT installed native bytes');
  }
  assert.deepEqual(await readdir(resolve(root, 'native')), ['rapier.mjs']);
  const records = await verifyInventory(root, manifest.sourceHash);
  verifyChronology(manifest, started, first, complete, records);
  for (const record of records) {
    for (const segment of record.segmentRecords)
      assert.deepEqual(parseInterventionSegment(segment), segment);
    assert.equal(record.lifecycle.length, 20);
    for (let i = 0; i < 20; i++) {
      const cycle = record.lifecycle[i];
      assert.equal(cycle.cycle, i);
      assert.equal(cycle.nativeSerialBefore, 780);
      assert.equal(cycle.nativeSerialAfter, 780);
      assert.equal(cycle.beforeHash, cycle.afterHash);
      assert.equal(cycle.disposed.disposed, true);
      assert.equal(cycle.disposed.currentRecords, 0);
      assert.equal(cycle.disposed.retainedRecords, 0);
    }
    for (const phase of ['beforeWarmup', 'afterWarmup', 'afterMeasured']) {
      const value = record.heap[phase];
      assert(value && Object.values(value).every((n) => Number.isFinite(n) && n >= 0));
    }
    if (record.descriptor.kind === 'SEMANTIC') {
      assert.equal(record.maximumRecord.samples, 32);
      assert(record.maximumRecord.bytes <= 65536);
      assert.equal(record.maximumRecord.timings.length, 5);
      assert(record.maximumRecord.timings.every((v) => Number.isFinite(v) && v >= 0 && v <= 5.5));
      assert.deepEqual(parseInterventionSegment(record.emptyRecord), record.emptyRecord);
      const stress = record.schemaStress;
      assert.equal(stress.scope, 'SYNTHETIC_SCHEMA_STRESS_NOT_NATIVE_EVENTS_OR_CONFLICTS');
      assert.equal(stress.bytes, 65536);
      assert.equal(referencePreparseBytes(stress.record), 65536);
      assert.equal(Buffer.byteLength(JSON.stringify(stress.record)), 65536);
      assert.equal(stress.record.samples.length, 32);
      assert.equal(stress.record.events.length, 8);
      assert.equal(stress.overByteRejected, true);
      assert.deepEqual(parseInterventionSegment(stress.record), stress.record);
      assert.equal(stress.timings.length, 5);
      for (const t of stress.timings) {
        assert(Object.values(t).every((v) => Number.isFinite(v) && v >= 0));
        assert.equal(t.totalMs, t.preflightMs + t.parseMs + t.commitMs);
        assert(t.totalMs <= 5.5, 'Supported maximum boundary CPU budget');
      }
    }
  }
  return {
    status: 'PASS_SUPPLEMENTAL_NATIVE_REFERENCE',
    mode: historical ? 'HISTORICAL_ARCHIVE' : 'CURRENT',
    sourceHash: manifest.sourceHash,
    nativeSha256: manifest.native.sha256,
    worlds: records.length,
    normalP95: records
      .filter((r) => r.descriptor.count === 70 && r.descriptor.observer)
      .map((r) => ({
        pair: r.descriptor.pair,
        p95: r.distributions.tickMs.p95,
        rapierP95: r.distributions.rapierMs.p95,
        heap: r.heap,
      })),
    scope: 'No renderer/FPS/estimator/full recorder/exact total RAM acceptance',
  };
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const result = await verifyReference(process.argv[2], process.argv.includes('--historical'));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
