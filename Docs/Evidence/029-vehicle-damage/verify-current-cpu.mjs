import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const historical = process.argv.slice(2).includes('--historical');
assert.ok(process.argv.slice(2).every(arg => arg === '--historical'), 'Usage: node verify-current-cpu.mjs [--historical]');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const folder = 'Docs/Evidence/029-vehicle-damage/';
const read = path => readFile(resolve(root, path));
const json = async path => JSON.parse(await read(path));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const capture = await json(folder + 'after-current027-node.json');
const before = await json(folder + 'before-node.json');
const start = await json(folder + 'after-current027-start.json');
const first = await json(folder + 'after-current027-first-world.json');
assert.equal(capture.commit, 'bf78ad85bb0b32e63d065e663829c6aa8cad2fb1');
assert.equal(capture.productionControllerPresent, true);
assert.equal(capture.instrumentedControllerUsed, false);
assert.equal(capture.drivetrainOptIn, false);
assert.equal(capture.beforeSourceHash, before.sourceHash);
assert.equal(start.sourceHash, capture.sourceHash);
assert.deepEqual(start.inputs, capture.inputs);
assert.deepEqual(start.nativeArtifact, capture.nativeArtifact);
assert.equal(first.firstWorldAt, capture.firstWorldAt);
assert.equal(start.archivedAt, capture.archivedAt);
assert.equal(start.startedAt, capture.startedAt);
assert.ok(Number.isFinite(Date.parse(capture.startedAt)) && Number.isFinite(Date.parse(capture.archivedAt)) && Number.isFinite(Date.parse(capture.firstWorldAt)));
assert.ok(Date.parse(capture.startedAt) <= Date.parse(capture.archivedAt) && Date.parse(capture.archivedAt) <= Date.parse(capture.firstWorldAt));
async function verifySources(report, archive, requireCurrent) {
  const aggregate = createHash('sha256');
  const paths = new Set();
  assert.ok(report.inputs.length > 0);
  for (const input of report.inputs) {
    assert.ok(typeof input.path === 'string' && !input.path.includes('..') && !input.path.startsWith('/') && !input.path.includes('\\') && !input.path.includes(':'));
    assert.ok(!paths.has(input.path)); paths.add(input.path);
    const bytes = await read(archive + '/' + input.path);
    assert.equal(bytes.length, input.bytes); assert.equal(sha(bytes), input.sha256);
    aggregate.update(input.path).update(bytes);
    if (requireCurrent) { const current = await read(input.path); assert.equal(current.length, input.bytes); assert.equal(sha(current), input.sha256, `Current bytes drift: ${input.path}`); }
  }
  assert.equal(aggregate.digest('hex'), report.sourceHash);
  return paths.size;
}
const beforeInputs = await verifySources(before, folder + 'source-before', false);
const currentInputs = await verifySources(capture, folder + 'source-after-current027', !historical);
const archivedReference = await json(folder + 'source-after-current027/' + folder + 'before-node.json');
assert.deepEqual(archivedReference, before);
assert.equal(capture.nativeArtifact.bytes, before.nativeArtifact.bytes);
assert.equal(capture.nativeArtifact.sha256, before.nativeArtifact.sha256);
assert.equal(capture.nativeArtifact.archiveRelativePath, folder + 'native-after-current027/rapier.mjs');
for (const path of [capture.nativeArtifact.archiveRelativePath, folder + 'native-before/rapier.mjs']) { const bytes = await read(path); assert.equal(bytes.length, before.nativeArtifact.bytes); assert.equal(sha(bytes), before.nativeArtifact.sha256); }
if (!historical) { const bytes = await readFile(capture.nativeArtifact.path); assert.equal(bytes.length, capture.nativeArtifact.bytes); assert.equal(sha(bytes), capture.nativeArtifact.sha256); }
assert.equal(capture.runs.length, 10);
const pairs = [];
const seen = new Set();
const percentile = (values, q) => [...values].sort((a,b) => a-b)[Math.ceil(values.length*q)-1];
for (let index=0;index<10;index++) {
  const run = capture.runs[index];
  const expectedPair = Math.floor(index/2);
  const expectedObserver = expectedPair%2 ? index%2===0 : index%2===1;
  assert.equal(run.pair,expectedPair); assert.equal(run.observer,expectedObserver);
  const key=`${run.pair}:${run.observer}`; assert.ok(!seen.has(key)); seen.add(key);
  assert.equal(run.warmupTicks,180); assert.equal(run.measuredTicks,600); assert.equal(run.simulatedSeconds,10);
  const reference = before.runs.find(r=>r.pair===run.pair && r.observer===run.observer); assert.ok(reference);
  assert.equal(run.finalPhysicalHash,reference.finalPhysicalHash); assert.equal(run.effectiveInputHash,reference.effectiveInputHash); assert.deepEqual(run.physicalTrace,reference.physicalTrace);
  assert.equal(run.physicalTrace.length,10);
  assert.deepEqual(await json(`${folder}after-current027-pair${run.pair}-${run.observer?'on':'off'}.json`),run);
  assert.equal(run.startedAt,capture.startedAt); assert.equal(run.archivedAt,capture.archivedAt); assert.equal(run.firstWorldAt,capture.firstWorldAt);
  const clean=run.cleanup; assert.equal(clean.bodies.entities,0); assert.equal(clean.bodies.subscriptions,0); assert.equal(clean.collisions.vehicles,0); assert.equal(clean.collisions.obstacles,0); assert.equal(clean.collisions.colliders,0); assert.equal(clean.collisions.disposed,true); assert.equal(clean.disposedReadRejected,true);
  for (const field of ['vehicles','targets','projections','players','retainedBatches']) assert.equal(clean.controller[field],0);
  assert.equal(clean.controller.disposed,true); assert.equal(clean.controller.tick,780); assert.equal(clean.controller.fault,null);
  if (run.observer) {
    for (const values of [run.rawTickCpuMs,run.rawControllerIncrementalMs,...Object.values(run.rawNativePhasesMs)]) { assert.equal(values.length,600); assert.ok(values.every(Number.isFinite)); }
    for (const [field,values] of [['tickCpuMs',run.rawTickCpuMs],['controllerIncrementalMs',run.rawControllerIncrementalMs]]) for (const [label,q] of [['p50',.5],['p95',.95],['p99',.99]]) assert.equal(run[field][label],percentile(values,q));
    for (const [field,values] of Object.entries(run.rawNativePhasesMs)) for (const [label,q] of [['p50',.5],['p95',.95],['p99',.99]]) assert.equal(run.nativePhasesMs[field][label],percentile(values,q));
    const beforeP95Ms=reference.tickCpuMs.p95,afterP95Ms=run.tickCpuMs.p95;
    pairs.push({pair:run.pair,beforeP95Ms,afterP95Ms,deltaMs:afterP95Ms-beforeP95Ms,relativeIncrease:afterP95Ms/beforeP95Ms-1,confirmedRegression:afterP95Ms-beforeP95Ms>1 && afterP95Ms/beforeP95Ms-1>.1,absolutePass:afterP95Ms<=5.5});
  } else { assert.equal(run.rawTickCpuMs,null); assert.equal(run.rawControllerIncrementalMs,null); assert.equal(run.rawNativePhasesMs,null); assert.equal(run.tickCpuMs.p95,null); }
}
const gate=capture.cpuGate;
assert.deepEqual(gate.pairs,pairs); assert.equal(gate.beforeSourceHash,before.sourceHash);
assert.equal(gate.absoluteP95LimitMs,5.5); assert.equal(gate.relativeIncreaseThreshold,.1); assert.equal(gate.absoluteIncreaseThresholdMs,1); assert.equal(gate.requiredConfirmations,3);
const confirmations=pairs.filter(pair=>pair.confirmedRegression).length;
assert.equal(gate.confirmations,confirmations); assert.equal(gate.passed,confirmations<3 && pairs.every(pair=>pair.absolutePass));
assert.deepEqual(await json(folder+'cpu-comparison-current027.json'),gate);
console.log(JSON.stringify({mode:historical?'HISTORICAL_ARCHIVE_ONLY':'CURRENT_SOURCE_AND_ARCHIVE',verificationPassed:true,cpuGatePassed:gate.passed,confirmations,sourceHash:capture.sourceHash,beforeInputs,currentInputs,runs:10,orderedOnChannelsVerified:true,nativeArchiveVerified:true,physicalAndCleanupVerified:true,limitations:'CPU-only real production defaultdrivetrainopt-in absent; historicalfailedcaptures unchanged. No heap/hardware/fullbrowser/soak/Done claim. Historicalmode does not check current source/native bytes.'},null,2));
