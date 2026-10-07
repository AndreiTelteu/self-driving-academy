// CURRENT/HISTORICAL independent source/artifact/native/ZIP and raw10-run BEFORE proof. No world/browser creation.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyBuild, safePath, hash } from './browser-store.mjs';
const historical = process.argv.includes('--historical'),
  build = await verifyBuild(process.argv[2], historical),
  folder = resolve(process.argv[3]);
assert(
  folder.startsWith(resolve(build.captureRoot) + '\\') ||
    folder.startsWith(resolve(build.captureRoot) + '/'),
);
const { verifyRun, sequence, memorySummary } = await import(
  pathToFileURL(
    safePath(build.archiveRoot, 'tests/browser/vehicle-recovery-after/browser-proof.ts'),
  ).href
);
const names = await readdir(folder);
assert(!names.some((n) => /failure|rejected|partial|incomplete/i.test(n)), 'Failedcapturemarker');
const read = async (n) => JSON.parse(await readFile(safePath(folder, n)));
const start = await read('started.json'),
  complete = await read('complete.json');
assert.equal(start.captureId, complete.captureId);
assert.equal(start.backend, complete.backend);
assert.equal(complete.runs, 10);
assert.equal(complete.sceneDisposed, true);
assert.equal(complete.backendOwnership.totalCauses, 0);
assert.equal(complete.backendOwnership.resources, complete.backendOwnership.attempted);
assert.equal(complete.backendCleanup.sceneDisposed, true);
for (const key of ['meshes', 'materials', 'lights', 'cameras', 'engineScenes'])
  assert.equal(complete.backendCleanup[key], 0, 'Actualbackendcleanup ' + key);
assert(
  Date.parse(build.archivedAt) <= Date.parse(start.startedAt) &&
    Date.parse(start.startedAt) <= Date.parse(complete.completedAt),
);
for (const k of ['sourceHash', 'artifactHash', 'nativeHash'])
  assert.equal(start.build[k], build[k]);
const expected = ['started.json', 'complete.json'],
  runs = [],
  verdicts = [];
let checkpoints;
for (const spec of sequence()) {
  const prefix = 'run-' + String(spec.runOrdinal).padStart(2, '0'),
    begun = await read(prefix + '-started.json'),
    run = await read(prefix + '-raw.json'),
    submitted = await read(prefix + '-submitted.json'),
    terminal = await read(prefix + '-complete.json');
  expected.push(
    prefix + '-started.json',
    prefix + '-submitted.json',
    prefix + '-raw.json',
    prefix + '-complete.json',
  );
  assert.deepEqual(submitted, run, 'PreservedsubmittedmetadataBEFOREparttransport');
  assert.equal(run.identity.captureId, start.captureId);
  assert.equal(run.identity.backend, start.backend);
  assert.equal(run.identity.runOrdinal, spec.runOrdinal);
  assert.deepEqual(begun.identity, run.identity);
  assert.deepEqual(terminal.identity, run.identity);
  assert(Date.parse(begun.startedAt) <= Date.parse(run.firstWorldAt));
  assert(
    Date.parse(run.completedAt) <= Date.parse(terminal.completedAt) &&
      Date.parse(terminal.completedAt) <= Date.parse(complete.completedAt),
  );
  const parts = [];
  assert.equal(new Set(run.parts).size, run.parts.length);
  assert.deepEqual(
    terminal.partHashes.map(([id]) => id),
    run.parts,
  );
  for (const id of run.parts) {
    assert(id.startsWith(prefix + '-'));
    const bytes = await readFile(safePath(folder, id + '.json'));
    assert(bytes.length <= 128 * 1024);
    assert.equal(
      terminal.partHashes.find(([name]) => name === id)?.[1],
      hash(bytes),
      'Immutablepartbytehash',
    );
    expected.push(id + '.json');
    parts.push(JSON.parse(bytes));
  }
  const verdict = verifyRun(run, parts, build);
  assert.deepEqual(terminal.verdict, verdict);
  const trace = parts.find((p) => p.kind === 'trace');
  assert.equal(trace.checkpointHash, hash(Buffer.from(JSON.stringify(trace.hashes))));
  assert.equal(trace.physicalHash, trace.hashes.at(-1).hash);
  assert.equal(trace.values.length, 58 * 3 * 16);
  assert(trace.values.every(Number.isFinite));
  if (checkpoints) assert.deepEqual(trace.hashes, checkpoints, 'Allcommonfixedtick parityOFFON');
  else checkpoints = trace.hashes;
  const heap = parts.find((p) => p.kind === 'heap');
  assert(
    Array.isArray(heap.rows) &&
      heap.rows.length === heap.sampleCount * 4 &&
      heap.sampleCount <= 256,
  );
  assert(heap.rows.every(Number.isFinite));
  if (!run.identity.observer) {
    assert.equal(heap.sampleCount, 0);
    assert.equal(heap.peakUsedBytes, null);
  } else if (heap.sampleCount) {
    const observed = [];
    for (let i = 0; i < heap.rows.length; i += 4) {
      assert(heap.rows[i] >= heap.endpoints[1].timeMs && heap.rows[i] <= heap.endpoints[2].timeMs);
      observed.push(heap.rows[i + 1]);
    }
    assert.equal(heap.peakUsedBytes, Math.max(...observed));
  }
  assert(run.buffers.heapBytes === (run.identity.observer ? 8192 : 0));
  assert.equal(run.buffers.histogramBytes, (run.identity.observer ? 9 : 1) * 4096 * 4);
  assert.equal(run.buffers.trace, 64 * 3 * 16 * 8);
  assert.equal(run.buffers.physicalHashScratch, 70 * 16 * 8);
  assert.equal(run.buffers.actorTicks, 70 * 4);
  assert(
    run.buffers.pendingHashesMaximum === 64 &&
      run.buffers.checkpointCodecMaximumBytes === 128 * 1024,
  );
  assert.equal(run.ownership.causes.length, 0);
  assert.equal(run.ownership.totalCauses, 0);
  assert.equal(run.ownership.resources, run.ownership.attempted);
  verdicts.push(verdict);
  runs.push({
    identity: run.identity,
    verdict,
    memory: heap.endpoints,
    peak: heap.peakUsedBytes,
    ticks: run.measuredTicks,
    frames: run.measuredFrames,
    parts,
  });
}
assert.deepEqual(names.sort(), expected.sort(), 'Exactraw/terminalpartinventory');
assert(names.length <= 2 + 10 * (16 + 4));
const report = {
  verification: 'PASS',
  mode: historical ? 'HISTORICAL_ARCHIVE' : 'CURRENT_BYTES',
  backend: start.backend,
  captureId: start.captureId,
  sourceHash: build.sourceHash,
  artifactHash: build.artifactHash,
  nativeHash: build.nativeHash,
  runs: 10,
  commonCheckpoints: 58,
  comparisons: 580,
  cleanup: true,
  requiredAbsolute: verdicts.some((v) => v.required === 'FAIL')
    ? 'FAIL'
    : verdicts.some((v) => v.required === 'UNVALIDATED')
      ? 'UNVALIDATED'
      : 'PASS',
  optionalTiming: verdicts.some((v) => v.optional === 'FAIL')
    ? 'FAIL'
    : verdicts.some((v) => v.optional === 'UNVALIDATED')
      ? 'UNVALIDATED'
      : verdicts.every((v) => v.optional === 'NOT_MEASURED')
        ? 'NOT_MEASURED'
        : 'PASS',
  overall: verdicts.some((v) => v.overall === 'FAIL')
    ? 'FAIL'
    : verdicts.some((v) => v.overall === 'UNVALIDATED')
      ? 'UNVALIDATED'
      : 'PASS',
  relative: 'AFTER_PENDING',
  memory: memorySummary(verdicts.map((v) => v.memory)),
  perRun: runs.map(({ parts, ...run }) => run),
  scope:
    'Single AFTER backend raw/absolute validation only; strict BOTH original-baseline comparison and trustedR functional evidence still required',
};
console.log(JSON.stringify(report));
