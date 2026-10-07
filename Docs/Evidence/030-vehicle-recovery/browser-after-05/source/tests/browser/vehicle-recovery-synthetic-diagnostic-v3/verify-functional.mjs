// Strict CURRENT build/raw inventory reader. No worlds, browser, server, retry or Git mutation.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { verifyBuild } from './build-binding.mjs';
import { safePath, hash } from '../vehicle-recovery-after/browser-store.mjs';
const build = await verifyBuild(process.argv[2], false);
assert.equal(process.argv.length, 3);
const { FUNCTIONAL, validateFunctional } = await import(
  pathToFileURL(
    safePath(
      build.archiveRoot,
      'tests/browser/vehicle-recovery-synthetic-diagnostic-v3/functional-proof.ts',
    ),
  ).href
);
const ids = await readdir(build.functionalRoot);
assert.equal(ids.length, 2, 'Both actual functional backend attempts');
const reports = [];
for (const id of ids) {
  assert(/^[0-9TZ]{10,40}$/.test(id));
  const folder = safePath(build.functionalRoot, id);
  assert.deepEqual(
    (await readdir(folder)).sort(),
    [
      'complete.json',
      'started.json',
      'start-submitted.json',
      'start-envelope.json',
      'submitted-envelope.json',
      'submitted.json',
    ].sort(),
    'No failed/incomplete/rejected/unknown sibling accepted',
  );
  const initial = await readFile(safePath(folder, 'start-submitted.json')),
    initialEnvelope = JSON.parse(await readFile(safePath(folder, 'start-envelope.json')));
  assert(initial.length <= FUNCTIONAL.reportBytes);
  assert.equal(initialEnvelope.bytes, initial.length);
  assert.equal(initialEnvelope.sha256, hash(initial));
  assert.equal(initialEnvelope.captureId, id);
  const start = JSON.parse(await readFile(safePath(folder, 'started.json'))),
    envelope = JSON.parse(await readFile(safePath(folder, 'submitted-envelope.json'))),
    terminal = JSON.parse(await readFile(safePath(folder, 'complete.json'))),
    bytes = await readFile(safePath(folder, 'submitted.json'));
  assert(bytes.length <= FUNCTIONAL.reportBytes);
  assert.equal(envelope.bytes, bytes.length);
  assert.equal(envelope.sha256, hash(bytes));
  assert.equal(terminal.sha256, hash(bytes));
  assert.equal(envelope.captureId, id);
  assert.equal(start.captureId, id);
  const report = JSON.parse(bytes);
  assert.equal(report.identity.captureId, id);
  assert.equal(report.identity.buildUUID, build.buildUUID);
  assert.equal(report.identity.backend, start.backend);
  for (const k of ['sourceHash', 'artifactHash', 'nativeHash', 'buildUUID'])
    assert.equal(start.build[k], build[k]);
  const initialData = JSON.parse(initial);
  for (const k of ['sourceHash', 'artifactHash', 'nativeHash', 'buildUUID'])
    assert.equal(initialData[k], build[k]);
  assert.equal(initialData.preference === 'AUTO' ? 'WEBGPU' : 'WEBGL2', start.backend);
  assert(Date.parse(initialEnvelope.receivedAt) <= Date.parse(start.startedAt));
  assert(
    Date.parse(build.archivedAt) <= Date.parse(start.startedAt) &&
      Date.parse(start.startedAt) <= Date.parse(report.firstWorldAt) &&
      Date.parse(report.completedAt) <= Date.parse(envelope.receivedAt) &&
      Date.parse(envelope.receivedAt) <= Date.parse(terminal.completedAt),
  );
  assert.equal(report.dpr, 1);
  assert.deepEqual(report.css, [1920, 1080]);
  assert.deepEqual(report.internal, [1920, 1080]);
  assert.equal(report.foreground, true);
  assert(/AMD/i.test(report.gpu) && !/swiftshader|llvmpipe/i.test(report.gpu));
  const verdict = validateFunctional(report, build);
  assert.deepEqual(terminal.verdict, verdict);
  reports.push({
    backend: start.backend,
    captureId: id,
    rawHash: hash(bytes),
    cases: report.cases.length,
    verdict,
  });
}
assert.deepEqual(reports.map((r) => r.backend).sort(), ['WEBGL2', 'WEBGPU']);
console.log(
  JSON.stringify({
    verification: 'SYNTHETIC_DIAGNOSTIC_BOTH_GAMEPLAY_ONLY',
    reports,
    physicalAcceptance: false,
    performanceAcceptance: false,
    pbiDone: false,
  }),
);
