import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compareArms } from './steady-numeric-checks-v3.mjs';
const base = 'Docs/Evidence/068-vehicle-switch/browser-steady-v3-01';
const captureId = '08ece12f1c58faef806d234441c2746b8dabe7176c2b9af3299bebddf395f693-webgpu';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const terminal = await json(base + '/capture-webgpu-terminal.json');
assert.equal(terminal.captureId, captureId);
assert.equal(terminal.status, 'FAILED');
const failureBytes = await readFile(base + '/failure-webgpu.json');
assert.equal(sha(failureBytes), terminal.reportSha256);
const failure = JSON.parse(failureBytes);
const records = [], integrity = [];
for (let ordinal = 0; ordinal < 20; ordinal++) {
  const stem = `${base}/${captureId}/world-${ordinal}`;
  const end = await json(stem + '-terminal.json');
  assert.equal(end.status, 'PASS');
  const parts = [];
  for (let part = 0; part < end.parts; part++) parts.push(await readFile(`${stem}-part-${part}.bin`));
  const bytes = Buffer.concat(parts);
  assert.equal(bytes.length, end.bytes);
  assert.equal(sha(bytes), end.sha256);
  records.push(JSON.parse(bytes));
  integrity.push({ ordinal, parts: end.parts, bytes: bytes.length, sha256: sha(bytes) });
}
let numericValidation;
try {
  const comparison = compareArms(records);
  numericValidation = { status: 'PASS', violations: comparison.violations,
    trackedMemoryPairs: comparison.trackedMemoryPairs, memoryDisposition: comparison.memoryDisposition };
} catch (error) {
  numericValidation = { status: 'FAILED', message: error.message, stack: error.stack };
}
const result = { status: 'FAILED_FULL_CAPTURE', hardwareFullAcceptance: false,
  performanceAcceptance: false, scope: 'Independent twenty-arm raw validation; required lifecycle failed',
  captureId, failureSha256: sha(failureBytes), numericValidation,
  lifecycle: failure.lifecycle.map(row => ({ cycle: row.cycle, admitted: row.admitted !== null,
    causes: row.causes, cleanupErrors: row.cleanup.errors,
    acquisitionSnapshots: Object.keys(row.cleanup.snapshots) })),
  failedSurface: { cssResolution: failure.cssResolution,
    internalResolution: failure.internalResolution, dpr: failure.dpr }, integrity };
await writeFile('Docs/Evidence/068-vehicle-switch/parent-steady-v3-partial-verification.json',
  JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...result, integrity: `${integrity.length} byte-exact world records` }));
