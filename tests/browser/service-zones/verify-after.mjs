import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = 'C:/Users/aandr/Sites/self-driving-academy/.worktrees/service-zones-01';
assert.equal(resolve('.').replaceAll('\\', '/'), root);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/service-zones-01',
);
const historical = process.argv.includes('--historical');
assert(process.argv.slice(2).every((x) => x === '--historical'));
const folder = 'Docs/Evidence/040-service-zones/after-01',
  original = 'Docs/Evidence/040-service-zones/before-02';
const sha = (b) => createHash('sha256').update(b).digest('hex'),
  read = async (file, base = folder) => JSON.parse(await readFile(base + '/' + file));
const manifest = await read('manifest.json'),
  complete = await read('complete.json'),
  first = await read('first-world.json');
const beforeManifest = await read('manifest.json', original),
  beforeComplete = await read('complete.json', original);
assert.equal(
  beforeManifest.sourceHash,
  'c7f1b0211abdbc97c505f2843b9de4e178e3a69d7ca76577ad3e5430e8badb87',
);
assert.equal(beforeComplete.status, 'PASS');
assert.equal(manifest.phase, 'AFTER_040');
assert.equal(manifest.originalBeforeSourceHash, beforeManifest.sourceHash);
assert.equal(complete.status, 'PASS');
assert.equal(complete.errors, null);
assert.equal(complete.runCount, 20);
assert.equal(complete.sourceHash, manifest.sourceHash);
assert.equal(first.sourceHash, manifest.sourceHash);
assert.deepEqual(
  (await readdir(folder)).sort(),
  [
    '.gitattributes',
    'started.json',
    'manifest.json',
    'first-world.json',
    'complete.json',
    'road-fixture.json',
    'hardware.json',
    'comparison.json',
    'source',
    'native',
    ...Array.from({ length: 20 }, (_, i) => 'run-' + String(i).padStart(2, '0') + '.json'),
  ].sort(),
);
const time = (v) => {
  const t = Date.parse(v);
  assert(Number.isFinite(t));
  return t;
};
assert(time(manifest.startedAt) <= time(manifest.archivedAt));
assert(time(manifest.archivedAt) <= time(first.firstWorldAt));
async function archive(meta, base, current) {
  const h = createHash('sha256'),
    paths = meta.inputs.map((x) => x.path);
  assert.deepEqual(paths, [...new Set(paths)].sort());
  for (const item of meta.inputs) {
    assert(!item.path.includes('..') && !item.path.includes('\\') && !item.path.startsWith('/'));
    const bytes = await readFile(base + '/source/' + item.path);
    assert.equal(bytes.length, item.bytes);
    assert.equal(sha(bytes), item.sha256);
    h.update(item.path).update(bytes);
    if (current) assert.equal(sha(await readFile(item.path)), item.sha256);
  }
  assert.equal(h.digest('hex'), meta.sourceHash);
  const native = await readFile(base + '/' + meta.native.archiveRelativePath);
  assert.equal(native.length, meta.native.bytes);
  assert.equal(sha(native), meta.native.sha256);
  if (current) assert.equal(sha(await readFile(meta.native.path)), meta.native.sha256);
}
await archive(beforeManifest, original, false);
await archive(manifest, folder, !historical);
assert.equal(manifest.native.sha256, beforeManifest.native.sha256);
assert.equal(complete.nativeSha256, manifest.native.sha256);
for (const path of [
  'src/world/service-zones.ts',
  'src/app/service-zones.ts',
  'tests/browser/service-zones-after.mjs',
  'tests/browser/service-zones/after-query.ts',
  'tests/browser/service-zones/verify-after.mjs',
])
  assert(manifest.inputs.some((x) => x.path === path));
if (!historical)
  assert.deepEqual(
    manifest.inputs.filter((x) => x.path.startsWith('src/')).map((x) => x.path),
    execFileSync('rg', ['--files', 'src'], { encoding: 'utf8' })
      .trim()
      .split(/\r?\n/)
      .map((x) => x.replaceAll('\\', '/'))
      .sort(),
  );
const originalProtocol = beforeManifest.protocol;
assert.deepEqual(manifest.protocol, originalProtocol);
const hardwareRaw = await readFile(folder + '/hardware.json');
assert.equal(hardwareRaw.length, manifest.hardware.bytes);
assert.equal(sha(hardwareRaw), manifest.hardware.sha256);
const hw = JSON.parse(hardwareRaw);
assert(time(hw.startedAt) <= time(hw.cim.capturedAt));
assert(time(hw.cim.capturedAt) <= time(hw.completedAt));
assert(time(hw.completedAt) <= time(manifest.archivedAt));
assert.equal(hw.cim.profile, 'CPU_NATIVE_ONLY');
assert(hw.cim.cpu.some((x) => x.Name.includes('Ryzen 7 7735U')));
assert(hw.cim.gpu.some((x) => x.Name.includes('Radeon(TM) Graphics')));
const { verifyRun } = await import(
  pathToFileURL(resolve(original, 'source/tests/browser/service-zones/verify-query-records.mjs'))
    .href
);
const semanticRoot = historical ? resolve(folder, 'source') : resolve('.');
const { verifyProductQuery } = await import(
  pathToFileURL(resolve(semanticRoot, 'tests/browser/service-zones/after-proof.mjs')).href
);
const rows = [];
let ordinal = 0;
const comparisons = {};
for (const count of [70, 110]) {
  comparisons[count] = [];
  for (let pair = 0; pair < 5; pair++)
    for (const observer of pair % 2 ? [true, false] : [false, true]) {
      const name = 'run-' + String(ordinal).padStart(2, '0') + '.json',
        row = await read(name),
        before = await read(name, original);
      assert.equal(row.ordinal, ordinal++);
      assert.equal(row.count, count);
      assert.equal(row.pair, pair);
      assert.equal(row.observer, observer);
      assert(time(first.firstWorldAt) <= time(row.startedAt));
      assert(time(row.startedAt) <= time(row.completedAt));
      assert(time(row.completedAt) <= time(complete.completedAt));
      assert.deepEqual(row.cleanup.attempts, [
        'availability',
        'catalog',
        'recovery',
        'eventBus',
        'controller',
        'damage',
        'world',
      ]);
      assert.equal(row.cleanup.catalog.disposed, true);
      assert.equal(row.cleanup.catalog.sites, 0);
      assert.equal(row.cleanup.catalog.queriesInFlight, 0);
      assert.equal(row.cleanup.availability.disposed, true);
      assert.equal(row.cleanup.availability.queriesInFlight, 0);
      assert.equal(row.cleanup.availability.ownedNativePorts, 0);
      // Validate original run contract after separately proving the two extra040 owners.
      verifyRun({ ...row, cleanup: { ...row.cleanup, attempts: row.cleanup.attempts.slice(2) } });
      const baseQueries = [];
      for (const q of row.queries) {
        baseQueries.push(verifyProductQuery(q));
      }
      assert.deepEqual(baseQueries, before.queries, 'Exact native oracle proof ' + row.ordinal);
      for (const key of [
        'checkpoints',
        'physicalDigest',
        'controlDigest',
        'nativeInputDigest',
        'initialMechanics',
        'finalMechanics',
        'catalog',
      ])
        assert.deepEqual(row[key], before[key], key + '/' + row.ordinal);
      if (observer) {
        const a = before.summaries.wholeMs.p95,
          b = row.summaries.wholeMs.p95;
        comparisons[count].push({
          pair,
          before: a,
          after: b,
          deltaMs: b - a,
          ratio: b / a,
          regression: b - a > 1 && b / a > 1.1,
        });
      }
      rows.push(row);
    }
  assert(
    comparisons[count].filter((x) => x.regression).length < 3,
    'Original joint relative gate ' + count,
  );
}
const comparison = await read('comparison.json');
assert.equal(comparison.originalBeforeSourceHash, beforeManifest.sourceHash);
assert.equal(comparison.sourceHash, manifest.sourceHash);
assert.deepEqual(comparison.comparisons, comparisons);
console.log(
  JSON.stringify({
    status: '040_NATIVE_AFTER_VALID',
    sourceHash: manifest.sourceHash,
    mode: historical ? 'HISTORICAL' : 'CURRENT',
    worlds: rows.length,
    queries: 2600,
    comparisons,
    normalAbsolute: true,
    physicalParity: true,
    cleanup: true,
    memory: 'RAW_JS_PROXY_ONLY; hardware/retention pending',
    hardwarePerformanceAcceptance: false,
  }),
);
