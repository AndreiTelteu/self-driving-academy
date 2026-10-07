import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { order, validateArm } from './steady-numeric-checks.mjs';

const base = 'Docs/Evidence/068-vehicle-switch/browser-steady-01';
const captureId = 'de329df675e21bd24e88ce94f2d68758de7c4e34366be29096bc9d3b7a4dc7ca-webgpu';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const terminal = await json(`${base}/capture-webgpu-terminal.json`);
assert.equal(terminal.captureId, captureId);
assert.equal(terminal.status, 'FAILED');
assert.equal(terminal.incomplete, true);
const failure = await readFile(`${base}/failure-webgpu.json`);
assert.equal(sha(failure), terminal.reportSha256);
const arms = [];
for (let ordinal = 0; ordinal < 4; ordinal++) {
  const stem = `${base}/${captureId}/world-${ordinal}`;
  const end = await json(`${stem}-terminal.json`);
  const parts = [];
  for (let part = 0; part < end.parts; part++)
    parts.push(await readFile(`${stem}-part-${part}.bin`));
  const bytes = Buffer.concat(parts);
  assert.equal(bytes.length, end.bytes);
  assert.equal(sha(bytes), end.sha256);
  const record = JSON.parse(bytes);
  let numericValidation;
  if (ordinal < 3) {
    assert.equal(end.status, 'PASS');
    try {
      validateArm(record, order()[ordinal]);
      numericValidation = { status: 'PASS' };
    } catch (error) {
      numericValidation = { status: 'FAILED', message: error.message, stack: error.stack };
    }
  } else {
    assert.equal(record.tick, 0);
    assert.equal(record.warmFrames, 0);
    assert.equal(record.nativeCounterSamples, 0);
    assert.equal(record.clockState.tick, 0);
    assert.ok(record.causes.some(cause => String(cause).includes('Warm actual RAF debt bound')));
    assert.deepEqual(record.cleanup.errors, []);
    assert.throws(() => validateArm(record, order()[ordinal]));
    numericValidation = { status: 'INCOMPLETE' };
  }
  arms.push({ ordinal, arm: record.arm, disposition: record.disposition,
    tick: record.tick, warmFrames: record.warmFrames,
    numericValidation, warmStarted: record.warmStarted,
    heapBeforeWarmupReadEnded: record.heap.heapBeforeWarmup.readEnded,
    distributions: record.distributions, causes: record.causes,
    sha256: sha(bytes), bytes: bytes.length });
}
const result = { scope: 'Partial evidence integrity and individual arm numeric validation only',
  captureId, status: 'FAILED_FULL_CAPTURE', hardwareFullAccepted: false,
  completeArms: 3, requiredArms: 20, failureSha256: sha(failure), arms };
await writeFile('Docs/Evidence/068-vehicle-switch/parent-steady-partial-verification.json',
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
