// Independent SOURCE-only069 AFTER reader; original BEFORE remains historical, never replaced.
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
  compareOriginal,
  PINNED_BEFORE, validateBeforeBinding,
  validateOriginalInventory,validateMemory,
} from '../../../scripts/manual-segments-after-records.mjs';
import {verifyModuleClosure,captureImportRoots} from '../../../scripts/manual-segments-archive-closure.mjs';
import {verifyReference} from './verify-reference.mjs';
import {validateCheckedProduct} from '../../../scripts/manual-segments-calibration-proof.mjs';
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
  assert.equal(started.phase, 'ACTUAL_PRODUCTION_AFTER_ORIGINAL_BEFORE');
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
export async function verifyOriginalBefore(beforeRoot,manifest,beforeInventory){
  const beforeManifestBytes=await readFile(resolve(beforeRoot,'manifest.json'));assert.equal(sha256(beforeManifestBytes),PINNED_BEFORE.manifestSha256);
  validateOriginalInventory(beforeInventory);
  for(const row of beforeInventory){const data=await readFile(boundedPath(beforeRoot,row.path));assert.equal(data.length,row.bytes);assert.equal(sha256(data),row.sha256,'Original accepted raw BEFORE file '+row.path);}
  const beforeManifest=JSON.parse(beforeManifestBytes),beforeComplete=JSON.parse(await readFile(resolve(beforeRoot,'complete.json')));validateBeforeBinding(beforeManifest,beforeComplete,sha256(beforeManifestBytes),manifest);
  assert.equal(sha256(await readFile(resolve(beforeRoot,'complete.json'))),'d943d35b90d7774d46bd3cc8efa85a2324247f34894319149bb610f4aa039ef6','Exact accepted original terminal');
  const proof=await verifyReference(beforeRoot,true);assert.equal(proof.status,'PASS_SUPPLEMENTAL_NATIVE_REFERENCE'); // Complete original archive/native/protocol/inventory proof, intentionally HISTORICAL.
  return {sourceHash:PINNED_BEFORE.sourceHash,worlds:24};
}

export async function verifyAfter(folder, historical = false) {
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
  assert.equal(manifest.version, '069-native-after-manifest-v1');
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
  const checked=await json('source/Docs/Evidence/069-manual-segments/implementation-scoped-checks-03/results-final.json');validateCheckedProduct(checked);
  const required = [
    'scripts/benchmark-manual-segments-after.mjs',
    'scripts/manual-segments-after-records.mjs',
    'scripts/manual-segments-calibration-proof.mjs',
    'scripts/manual-segments-archive-closure.mjs',
    'tests/telemetry/manual-segments-after-validation.test.mjs',
    'tests/contracts/fixtures.ts',
    'tests/telemetry/manual-segments-after-calibration.test.ts',
    'tests/telemetry/manual-segments-after.ts',
    'tests/telemetry/manual-segments-after-records.test.mjs',
    'tests/telemetry/manual-segments-after-cleanup.test.ts',
    'Docs/Evidence/069-manual-segments/verify-after.mjs',
    'Docs/Evidence/069-manual-segments/implementation-scoped-checks-03/results-final.json',
    'Docs/Evidence/069-manual-segments/implementation-scoped-checks-03/archive-start.json',
    ...checked.source.map(r=>r.path).filter(p=>!p.startsWith('src/')),
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
    [...new Set(required)].sort(),
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
  await verifyModuleClosure({paths:manifest.inputs.map(row=>row.path),roots:captureImportRoots(manifest.inputs.map(row=>row.path),checked),readSource:path=>readFile(boundedPath(root,'source/'+path)),lockBytes:await readFile(boundedPath(root,'source/package-lock.json'))});
  for(const row of checked.source){const archived=await readFile(boundedPath(root,'source/'+row.path));assert.equal(archived.length,row.bytes);assert.equal(sha256(archived),row.sha256,'Checked original069 product source binding');}
  if(!historical){const currentSrc=execFileSync('rg',['--files','src'],{encoding:'utf8'}).trim().split(/\r?\n/).map(p=>p.replaceAll('\\','/')).sort();assert.deepEqual(currentSrc,manifest.inputs.filter(r=>r.path.startsWith('src/')).map(r=>r.path));}
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
    for (const phase of ['beforeWarmup', 'afterWarmup', 'afterMeasured']) {
      const value = record.heap[phase];
      validateMemory(value);
    }
    if (record.descriptor.kind === 'SEMANTIC') {
      assert.equal(record.maximumRecord.samples, 32);
      assert(record.maximumRecord.bytes <= 65536);
      assert.equal(record.maximumRecord.scope,'ACTUAL_PRODUCTION_LIFECYCLE_NATIVE_SAMPLES_TERMINAL_BOUNDARY');
      assert(Number.isFinite(record.maximumRecord.nativeLifecycleBoundaryMs)&&record.maximumRecord.nativeLifecycleBoundaryMs>=0&&record.maximumRecord.nativeLifecycleBoundaryMs<=5.5,'Actual32native sample boundary budget');
      assert.deepEqual(parseInterventionSegment(record.emptyRecord), record.emptyRecord);
      const stress = record.schemaStress;
      assert.equal(stress.scope, 'SYNTHETIC_SCHEMA_STRESS_ACTUAL_069_SERVICES_NOT_NATIVE_EVENTS_NOT_ESTIMATOR');
      assert.equal(stress.bytes, 65536);
      assert.equal(referencePreparseBytes(stress.record), 65536);
      assert.equal(Buffer.byteLength(JSON.stringify(stress.record)), 65536);
      assert.equal(stress.record.samples.length, 32);
      assert.equal(stress.record.events.length, 8);
      assert.equal(stress.overByteRejected, true);
      assert.deepEqual(parseInterventionSegment(stress.record), stress.record);
      assert.equal(stress.cleanup.length,5);for(const cleanup of stress.cleanup){assert.equal(cleanup.errors.length,0);assert.deepEqual(cleanup.attempts,['intake','bus','store']);assert.equal(cleanup.snapshots.store.records,0);assert.equal(cleanup.snapshots.bus.retainedEvents,0);assert.equal(cleanup.snapshots.intake.entries,0);assert.equal(cleanup.snapshots.intake.pending,0);}
      assert.equal(stress.timings.length, 5);
      for (const t of stress.timings) {
        assert(Object.values(t).every((v) => Number.isFinite(v) && v >= 0));
        assert.equal(t.totalMs,t.admissionMs+t.reserveMs+t.commitMs+t.readbackMs+t.eventMs+t.intakeMs);
        assert.deepEqual(Object.keys(t).sort(),['admissionMs','reserveMs','commitMs','readbackMs','eventMs','intakeMs','totalMs'].sort());
        assert(t.totalMs <= 5.5, 'Supported maximum boundary CPU budget');
      }
    }
  }
  assert.deepEqual(manifest.before,{relativePath:'../native-before-01',sourceHash:'3f36bba2d86fcc71501056fd599006f5042fe699aa41ee19283e88d48c563cf6',manifestSha256:manifest.before.manifestSha256});
  const beforeRoot=resolve(root,manifest.before.relativePath);assert.equal(beforeRoot,resolve(root,'../native-before-01'));
  const beforeInventory=(await json('source/Docs/Evidence/069-manual-segments/implementation-scoped-checks-03/archive-start.json')).beforeFiles;
  await verifyOriginalBefore(beforeRoot,manifest,beforeInventory);
  const before=[];for(const d of descriptors())before.push(JSON.parse(await readFile(resolve(beforeRoot,'worlds/world-'+d.ordinal+'.complete.json'))));
  const comparison=compareOriginal(before,records);
  assert.equal(manifest.productionWorkingTree,'CURRENT_DIRTY_069_NOT_PUBLISHED_COMMIT');assert.equal(manifest.publishedBaseOnly,true);
  return {status:comparison.verdict==='PASS'?'PASS_SUPPLEMENTAL_NATIVE_AFTER':'FAIL_SUPPLEMENTAL_NATIVE_AFTER',mode:historical?'HISTORICAL_ARCHIVE':'CURRENT',sourceHash:manifest.sourceHash,nativeSha256:manifest.native.sha256,worlds:records.length,beforeSource:manifest.before.sourceHash,comparison,normal:records.filter(r=>r.descriptor.count===70&&r.descriptor.observer).map(r=>({pair:r.descriptor.pair,raw:r.distributions,heap:r.heap})),ownerMaximum8EventCoverage:'UNVALIDATED_NO_ACTIVE_RECORD_EVENT_IMPORT_API',scope:'Actual069 services/nativeCPU/rawJSproxy; no RAF/render/normalFrame/GPU/input latency/full estimator/exactRAM claim'};

}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const result = await verifyAfter(process.argv[2], process.argv.includes('--historical'));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');if(result.status.startsWith('FAIL'))process.exitCode=1;
}
