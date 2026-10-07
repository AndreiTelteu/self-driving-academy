// SOURCE DRAFT UNEXECUTED. Full raw validations first; no browser/native creation.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { verifyBuild, safePath } from './browser-store.mjs';
const manifest = process.argv[2];
assert(manifest && process.argv.length === 3, 'Exact current AFTER manifest arg');
const build = await verifyBuild(manifest, false);
const beforeManifest =
  'Docs/Evidence/030-vehicle-recovery/browser-before-20261006T132157019Z/build-manifest.json';
const before = JSON.parse(await readFile(beforeManifest));
assert.equal(before.sourceHash, '6c203fb949dcd26c1074e91f344cfbf7cc4563f631205045d117bc4d4a1dc594');
assert.equal(
  before.artifactHash,
  '00309f0f8140ed9d3e5735dbe64480a03d0900298f60b184892f0f45de63a54e',
);
assert.equal(build.nativeHash, before.nativeHash);
const runReader = (script, args) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      ['--import', './scripts/register-typescript.mjs', script, ...args],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    ).trim(),
  );
const historicalBefore = runReader('tests/browser/vehicle-recovery/verify-browser-set.mjs', [
  beforeManifest,
  '--historical',
]);
assert.equal(historicalBefore.verification, 'PASS');
assert.equal(historicalBefore.runs, 20);
const nativeAfter = runReader('tests/browser/vehicle-recovery/verify-after.mjs', [
  'Docs/Evidence/030-vehicle-recovery/after-01',
]);
assert.equal(nativeAfter.status, 'CPU_AFTER_ONLY_PASS');
const { comparePhysical, compareMetric, confirmations, compareJsProxy } = await import(
  pathToFileURL(
    safePath(build.archiveRoot, 'tests/browser/vehicle-recovery-after/relative-proof.mjs'),
  ).href
);
async function inventory(m, script, historical = false) {
  const ids = await readdir(m.captureRoot);
  assert.equal(ids.length, 2, 'Exactly both attempts; no failed sibling ignored');
  const result = new Map();
  for (const id of ids) {
    const folder = safePath(m.captureRoot, id);
    const report = runReader(script, [
      historical ? beforeManifest : manifest,
      folder,
      ...(historical ? ['--historical'] : []),
    ]);
    assert.equal(report.verification, 'PASS');
    assert(!result.has(report.backend));
    const rows = [];
    for (let ordinal = 0; ordinal < 10; ordinal++) {
      const run = JSON.parse(
        await readFile(safePath(folder, 'run-' + String(ordinal).padStart(2, '0') + '-raw.json')),
      );
      const parts = [];
      for (const name of run.parts)
        parts.push(JSON.parse(await readFile(safePath(folder, name + '.json'))));
      rows.push({ run, parts });
    }
    result.set(report.backend, { report, rows });
  }
  assert.deepEqual([...result.keys()].sort(), ['WEBGL2', 'WEBGPU']);
  return result;
}
const prior = await inventory(before, 'tests/browser/vehicle-recovery/verify-browser.mjs', true);
const current = await inventory(build, 'tests/browser/vehicle-recovery-after/verify-browser.mjs');
const backends = [];
for (const backend of ['WEBGPU', 'WEBGL2']) {
  const a = prior.get(backend),
    b = current.get(backend);
  const pairs = new Map(),
    heap = { OFF: [], ON: [] };
  for (let ordinal = 0; ordinal < 10; ordinal++) {
    const x = a.rows[ordinal],
      y = b.rows[ordinal];
    assert.equal(x.run.identity.observer, y.run.identity.observer);
    assert.equal(x.run.identity.pair, y.run.identity.pair);
    comparePhysical(
      x.parts.find((p) => p.kind === 'trace'),
      y.parts.find((p) => p.kind === 'trace'),
    );
    const mode = y.run.identity.observer ? 'ON' : 'OFF';
    heap[mode].push(compareJsProxy(x.parts, y.parts));
    for (const part of x.parts.filter((p) => p.kind === 'metric'))
      for (const quantile of [0.95, 0.99]) {
        const metric = part.metric,
          key = mode + '/' + metric + '/' + quantile;
        const comparison = compareMetric(x.parts, y.parts, metric, quantile);
        if (comparison.verdict === 'NOT_MEASURED') continue;
        if (!pairs.has(key)) pairs.set(key, []);
        pairs.get(key).push(comparison);
      }
  }
  const relative = [...pairs].map(([metric, rows]) => ({
    metric,
    rows,
    ...confirmations(rows.map((r) => r.verdict)),
  }));
  backends.push({
    backend,
    absolute: b.report.requiredAbsolute,
    optional: b.report.optionalTiming,
    relative,
    memoryCompleteness:
      a.report.memory === 'UNVALIDATED' || b.report.memory === 'UNVALIDATED'
        ? 'UNVALIDATED'
        : 'RAW_JS_PROXY_ONLY',
    jsProxy: {
      scope: 'RAW_JS_PROXY_ONLY_NOT_RETAINED_RAM',
      OFF: { rows: heap.OFF, ...confirmations(heap.OFF.map((r) => r.verdict)) },
      ON: { rows: heap.ON, ...confirmations(heap.ON.map((r) => r.verdict)) },
    },
    comparisons: 580,
  });
}
const gates = backends.flatMap((b) => [
  b.absolute,
  ...b.relative.map((r) => r.verdict),
  b.jsProxy.OFF.verdict,
  b.jsProxy.ON.verdict,
  ...(b.memoryCompleteness === 'UNVALIDATED' ? ['UNVALIDATED'] : []),
]);
const required = gates.includes('FAIL')
  ? 'FAIL'
  : gates.includes('UNVALIDATED')
    ? 'UNVALIDATED'
    : 'PASS';
const functional = runReader('tests/browser/vehicle-recovery-after/verify-functional.mjs', [
  manifest,
]);
assert.equal(functional.verification, 'TRUSTED_R_BOTH_FUNCTIONAL_RAW_PASS');
console.log(
  JSON.stringify({
    verification: 'AFTER_RAW_COMPARISON_COMPLETE',
    required,
    backends,
    sourceHash: build.sourceHash,
    artifactHash: build.artifactHash,
    nativeHash: build.nativeHash,
    originalBeforeSource: before.sourceHash,
    originalNativeBeforeSource: build.reference.nativeBeforeSourceHash,
    nativeAfter,
    functionalAcceptance: functional,
    memoryScope: 'RAW_JS_PROXY_ONLY',
    overall:
      required === 'FAIL' || backends.some((b) => b.optional === 'FAIL') ? 'FAIL' : 'UNVALIDATED',
    hardwarePerformanceAcceptance: false,
    pbiDone: false,
    scope: 'No optional/trustedR/nativeRAM/fullgame acceptance from performance alone',
  }),
);
