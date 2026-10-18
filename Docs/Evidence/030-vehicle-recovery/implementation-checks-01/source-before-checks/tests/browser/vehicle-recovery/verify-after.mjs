/**Independent030 historical/current BEFORE byte+raw+physical validator SOURCE draft.*/
import assert from 'node:assert/strict';
import { verifyRecordEnvelope } from './verify-after-records.mjs';
import { recoveryRoadFixture } from './road-fixture.ts';
import { readFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const folder = resolve(process.argv[2] ?? 'Docs/Evidence/030-vehicle-recovery/after-01');
const historical = process.argv.includes('--historical');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = async (name) => JSON.parse(await readFile(folder + '/' + name));
const manifest = await read('manifest.json'),
  complete = await read('complete.json'),
  first = await read('first-world.json');
const files = await readdir(folder);
assert.deepEqual([...files].sort(), ['.gitattributes', 'started.json', 'manifest.json', 'first-world.json',
  'complete.json', 'comparison.json', 'road-fixture.json', 'source', 'native',
  ...Array.from({ length: 20 }, (_, i) => 'run-' + String(i).padStart(2, '0') + '.json')].sort(),
  'Exact current AFTER top-level inventory');
assert(!files.includes('failure.json'), 'Immutable failed capture rejected');
assert.equal(complete.status, 'PASS');
assert.equal(complete.runCount, 20);
assert.equal(complete.sourceHash, manifest.sourceHash);
assert.equal(first.sourceHash, manifest.sourceHash);
assert.equal(manifest.expectedCommit, 'ad32db9c609cce1132669c95312ae202a62b87ed');
assert(Date.parse(manifest.startedAt) <= Date.parse(manifest.archivedAt));
assert(Date.parse(manifest.archivedAt) <= Date.parse(first.firstWorldAt));
assert.equal(manifest.phase, 'AFTER');
assert.equal(manifest.originalBeforeSourceHash, 'e7e5241caa9ef9c5ac1a27460defc9de679a86de3c6a3287eb8409fe3e27d755');
if (!historical) {
 const actualSource = execFileSync('rg', ['--files','src'], {encoding:'utf8'}).trim().split(/\r?\n/).map(p=>p.replaceAll('\\','/')).sort();
 assert.deepEqual(manifest.inputs.filter(r=>r.path.startsWith('src/')).map(r=>r.path).sort(),actualSource);
}
const source = createHash('sha256');
const unique = new Set();
for (const row of manifest.inputs) {
  assert(!unique.has(row.path));
  unique.add(row.path);
  assert(!row.path.includes('..') && !row.path.includes('\\') && !row.path.startsWith('/'));
  const bytes = await readFile(folder + '/source/' + row.path);
  assert.equal(bytes.length, row.bytes);
  assert.equal(hash(bytes), row.sha256);
  source.update(row.path).update(bytes);
  assert.equal(row.expectedHeadBlob, null, '030 dirty source is not falsely claimed publishedad32');
  if (!historical) {
    const current = await readFile(row.path);
    assert.equal(current.length, row.bytes);
    assert.equal(hash(current), row.sha256, 'Current bytes ' + row.path);
  }
}
assert.equal(source.digest('hex'), manifest.sourceHash);
const native = await readFile(folder + '/' + manifest.native.archiveRelativePath);
assert.equal(native.length, manifest.native.bytes);
assert.equal(hash(native), manifest.native.sha256);
assert.equal(complete.nativeSha256, manifest.native.sha256);
if (!historical) assert.equal(hash(await readFile(manifest.native.path)), manifest.native.sha256);
assert.equal(files.filter((f) => /^run-\d\d\.json$/.test(f)).length, 20);
const runs = [];
let ordinal = 0;
for (const count of [70, 110])
  for (let pair = 0; pair < 5; pair++)
    for (const observer of pair % 2 ? [true, false] : [false, true]) {
      const run = await read('run-' + String(ordinal).padStart(2, '0') + '.json');
      assert.equal(run.ordinal, ordinal++);
      assert.equal(run.count, count);
      assert.equal(run.pair, pair);
      assert.equal(run.observer, observer);
      assert.equal(run.status, 'PASS');
      assert.equal(run.completedTicks, 780);
      assert.equal(run.warmupTicks, 180);
      assert.equal(run.measuredTicks, 600);
      assert.equal(run.failure, null);
      assert.equal(run.sampleBytes, observer ? 28800 : 0);
      assert.equal(run.checkpoints.length, 10);
      assert.deepEqual(
        run.checkpoints.map((c) => c.tick),
        [240, 300, 360, 420, 480, 540, 600, 660, 720, 780],
      );
      assert(Date.parse(first.firstWorldAt) <= Date.parse(run.startedAt));
      assert(Date.parse(run.startedAt) <= Date.parse(run.completedAt));
      assert(Number.isFinite(run.heapBeforeMeasured) && run.heapBeforeMeasured > 0);
      assert(Number.isFinite(run.heapAfterMeasuredRaw) && run.heapAfterMeasuredRaw > 0);
      assert(Number.isFinite(run.measuredWallMs) && run.measuredWallMs > 0);
      if (observer) {
        assert.deepEqual(
          Object.keys(run.raw).sort(),
          [
            'wholeMs',
            'controllerIncrementalMs',
            'nativeStepMs',
            'nativeQueryMs',
            'nativeBridgeMs',
            'nativeTotalMs',
          ].sort(),
        );
        for (const [key, values] of Object.entries(run.raw)) {
          assert.equal(values.length, 600);
          assert(values.every((v) => Number.isFinite(v) && v >= 0));
          const sorted = [...values].sort((a, b) => a - b);
          for (const [name, p] of [
            ['p50', 0.5],
            ['p95', 0.95],
            ['p99', 0.99],
          ])
            assert.equal(run.summaries[key][name], sorted[Math.ceil(600 * p) - 1]);
        }
        if (count === 70) assert(run.summaries.wholeMs.p95 <= 5.5);
      } else {
        assert.equal(run.raw, null);
        assert.equal(run.summaries, null);
      }
      assert.deepEqual(run.cleanup.attempts, ['recovery', 'eventBus', 'controller', 'damage', 'world']);
      assert.equal(run.cleanup.recovery.vehicles,0); assert.equal(run.cleanup.recovery.candidates,0);
      assert.equal(run.cleanup.recovery.disposed,true); assert.equal(run.cleanup.nativeRecovery.activePorts,0);
      assert.equal(run.cleanup.recovery.ledger.serializedBytes,2); assert.equal(run.cleanup.recovery.ledger.reservedBytes,0);
      assert.equal(run.cleanup.eventBus.retainedEvents,0); assert.equal(run.cleanup.eventBus.disposed,true);
      assert.equal(run.owned.recovery.vehicles,count); assert.equal(run.owned.recovery.pending,0);
      assert.equal(run.owned.recovery.inFlight,0); assert.equal(run.owned.recovery.fault,null);
      assert.equal(run.owned.recovery.ledger.records,0); assert.equal(run.owned.nativeRecovery.activePorts,1);
      assert.deepEqual(run.cleanup.errors, []);
      assert.equal(run.cleanup.controller.vehicles, 0);
      assert.equal(run.cleanup.controller.players, 0);
      assert.equal(run.cleanup.controller.disposed, true);
      assert.equal(run.cleanup.damage.vehicles, 0);
      assert.equal(run.cleanup.damage.disposed, true);
      assert.equal(run.cleanup.body.entities, 0);
      assert.equal(run.cleanup.body.subscriptions, 0);
      assert.equal(run.cleanup.collision.colliders, 0);
      assert.equal(run.cleanup.collision.disposed, true);
      const fixed = (m) => {
        const {
          appliedEngineForceN,
          appliedSteeringRadians,
          wheelBrakeImpulseLimitNs,
          ...mechanics
        } = m;
        return mechanics;
      };
      assert.deepEqual(run.finalMechanics.map(fixed), run.initialMechanics.map(fixed));
      runs.push(run);
    }
for (const count of [70, 110]) {
  const group = runs.filter((r) => r.count === count);
  for (const row of group)
    for (const key of [
      'checkpoints',
      'physicalDigest',
      'controlDigest',
      'nativeInputDigest',
      'initialMechanics',
      'finalMechanics',
    ])
      assert.deepEqual(row[key], group[0][key]);
}
verifyRecordEnvelope(manifest, await read('started.json'), first, complete, runs, files);
const road = await read('road-fixture.json');
const expectedRoad = recoveryRoadFixture();
assert.deepEqual(road.map, expectedRoad.map);
assert.deepEqual(road.graphStats, expectedRoad.graph.getStats());
assert.equal(road.graphStats.lanes, 4);
const originalFolder = resolve('Docs/Evidence/030-vehicle-recovery/before-01');
const baseline = JSON.parse(await readFile(originalFolder + '/manifest.json'));
assert.equal(baseline.sourceHash, manifest.originalBeforeSourceHash);
assert.equal(JSON.parse(await readFile(originalFolder + '/complete.json')).status,'PASS');
assert.equal(hash(await readFile(originalFolder + '/' + baseline.native.archiveRelativePath)), baseline.native.sha256);
assert.equal(manifest.native.sha256, baseline.native.sha256);
const originalDigest = createHash('sha256');
for (const input of baseline.inputs) {
 const bytes=await readFile(originalFolder+'/source/'+input.path);
 assert.equal(bytes.length,input.bytes);assert.equal(hash(bytes),input.sha256);
 originalDigest.update(input.path).update(bytes);
}
assert.equal(originalDigest.digest('hex'),baseline.sourceHash);
const comparisons={};
for(const run of runs) {
 const before=JSON.parse(await readFile(originalFolder+'/run-'+String(run.ordinal).padStart(2,'0')+'.json'));
 assert.equal(before.status,'PASS');
 for(const key of ['checkpoints','physicalDigest','controlDigest','nativeInputDigest','initialMechanics','finalMechanics'])
  assert.deepEqual(run[key],before[key],'ORIGINAL BEFORE '+run.ordinal+'/'+key);
 if(run.observer) {
  const sorted=[...before.raw.wholeMs].sort((a,b)=>a-b);
  assert.equal(sorted.length,600);assert(sorted.every(v=>Number.isFinite(v)&&v>=0));
  assert.equal(before.summaries.wholeMs.p95, sorted[Math.ceil(600*.95)-1]);
  const a=before.summaries.wholeMs.p95,b=run.summaries.wholeMs.p95;
  (comparisons[run.count]??=[]).push({pair:run.pair,before:a,after:b,deltaMs:b-a,ratio:b/a,regression:b-a>1&&b/a>1.1});
 }
}
assert.deepEqual((await read('comparison.json')).flags,comparisons);
for(const group of Object.values(comparisons))assert(group.filter(r=>r.regression).length<3,'Original joint relative gate');
console.log(JSON.stringify({status:'CPU_AFTER_ONLY_PASS',mode:historical?'HISTORICAL_ARCHIVE':'CURRENT_BYTES',sourceHash:manifest.sourceHash,
 originalBeforeSourceHash:baseline.sourceHash,nativeHash:manifest.native.sha256,inputs:manifest.inputs.length,runs:runs.length,
 comparisons,physicalParity:true,cleanup:true,memory:'RAW_LIVE_PROXY_ENDPOINTS_ONLY; hardware/retention/totalRAM acceptance pending',
 hardwareAcceptance:false,pbiDone:false}));
