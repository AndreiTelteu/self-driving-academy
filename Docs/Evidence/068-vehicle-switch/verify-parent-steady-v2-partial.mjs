import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { order, validateArm } from './steady-numeric-checks-v2.mjs';
const base = 'Docs/Evidence/068-vehicle-switch/browser-steady-v2-01';
const captureId = 'fada7e2b787fc8e455ec651ad4c308069f7b37b80a81121af8dd1de8c5b51655-webgpu';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const terminal = await json(base + '/capture-webgpu-terminal.json');
assert.equal(terminal.captureId, captureId);
assert.equal(terminal.status, 'FAILED');
const failure = await readFile(base + '/failure-webgpu.json');
assert.equal(sha(failure), terminal.reportSha256);
const worlds = [];
for (let ordinal = 0; ordinal < 2; ordinal++) {
  const stem = `${base}/${captureId}/world-${ordinal}`;
  const end = await json(stem + '-terminal.json');
  const chunks = [];
  for (let part = 0; part < end.parts; part++) chunks.push(await readFile(`${stem}-part-${part}.bin`));
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.length, end.bytes);
  assert.equal(sha(bytes), end.sha256);
  const record = JSON.parse(bytes);
  let numericValidation;
  if (ordinal === 0) {
    try { validateArm(record, order()[ordinal]); numericValidation = { status: 'PASS' }; }
    catch (error) { numericValidation = { status: 'FAILED', message: error.message, stack: error.stack }; }
  } else {
    assert.equal(record.tick, 0);
    assert.equal(record.warmFrames, 0);
    const wait = record.warmDiagnostic.wait;
    assert.equal(wait.returnedStamp, wait.previousStamp);
    assert.equal(wait.gapMs, 0);
    assert.deepEqual(wait.counterBefore, { nativeSerial: 0, controllerTick: 0 });
    assert.deepEqual(wait.counterAfter, wait.counterBefore);
    assert.equal(record.clockState.overloadCount, 0);
    assert.equal(record.clockState.debtSeconds, 0);
    assert.deepEqual(record.cleanup.errors, []);
    numericValidation = { status: 'INCOMPLETE', cause: 'Repeated RAF timestamp; zero interval rejected' };
  }
  worlds.push({ ordinal, sha256: sha(bytes), bytes: bytes.length, numericValidation,
    tick: record.tick, initialRafProof: record.initialRafProof, warmDiagnostic: record.warmDiagnostic });
}
const result = { status: 'FAILED_FULL_CAPTURE', performanceAcceptance: false,
  hardwareFullAcceptance: false, completeArms: 1, requiredArms: 20,
  captureId, failureSha256: sha(failure), worlds };
await writeFile('Docs/Evidence/068-vehicle-switch/parent-steady-v2-partial-verification.json',
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
