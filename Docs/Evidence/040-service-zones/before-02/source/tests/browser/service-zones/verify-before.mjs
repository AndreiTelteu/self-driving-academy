import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = 'C:/Users/aandr/Sites/self-driving-academy/.worktrees/service-zones-01';
assert.equal(resolve('.').replaceAll('\\', '/'), root);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/service-zones-01',
);
const historical = process.argv.includes('--historical');
assert(
  process.argv.slice(2).every((x) => x === '--historical'),
  'Only --historical supported',
);
const folder = 'Docs/Evidence/040-service-zones/before-02';
const hash = (b) => createHash('sha256').update(b).digest('hex');
const read = async (p) => JSON.parse(await readFile(folder + '/' + p));
const manifest = await read('manifest.json'),
  first = await read('first-world.json'),
  started = await read('started.json'),
  complete = await read('complete.json');
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
    'source',
    'native',
    ...Array.from({ length: 20 }, (_, i) => 'run-' + String(i).padStart(2, '0') + '.json'),
  ].sort(),
);
assert.equal(manifest.expectedCommit, '0853a4d94d5ac7aed00fbacdf4723a0a3de4e906');
assert.equal(manifest.phase, 'BEFORE_040');
assert.equal(started.protocol, '040-before-v1');
assert.equal(started.implementationPresent, false);
assert.deepEqual(manifest.protocol.populations, [70, 110]);
assert.equal(manifest.protocol.pairs, 5);
assert.equal(manifest.protocol.hz, 60);
assert.equal(manifest.protocol.warmupTicks, 180);
assert.equal(manifest.protocol.measuredTicks, 600);
assert.equal(manifest.protocol.observerOrder, 'even OFF/ON; odd ON/OFF');
assert.equal(
  manifest.protocol.samples,
  'ON600 whole/controllerIncremental/nativeStep/nativeQuery/nativeBridge/nativeTotal/explicitQuery; OFF null',
);
assert.deepEqual(
  manifest.protocol.checkpointTicks,
  [240, 300, 360, 420, 480, 540, 600, 660, 720, 780],
);
assert.equal(started.startedAt, manifest.startedAt);
assert.equal(complete.status, 'PASS');
assert.equal(complete.errors, null);
assert.equal(complete.runCount, 20);
assert.equal(first.sourceHash, manifest.sourceHash);
assert.equal(complete.sourceHash, manifest.sourceHash);
assert.equal(complete.nativeSha256, manifest.native.sha256);
const time = (v) => {
  const n = Date.parse(v);
  assert(Number.isFinite(n));
  return n;
};
assert(time(manifest.startedAt) <= time(manifest.archivedAt));
assert(time(manifest.archivedAt) <= time(first.firstWorldAt));
const paths = manifest.inputs.map((x) => x.path);
assert.deepEqual(paths, [...new Set(paths)].sort());
const expected = execFileSync(
  'git',
  ['ls-tree', '-r', '--name-only', manifest.expectedCommit, 'src'],
  { encoding: 'utf8' },
)
  .trim()
  .split(/\r?\n/)
  .sort();
assert.deepEqual(
  paths.filter((p) => p.startsWith('src/')),
  expected,
);
assert(
  !paths.includes('src/world/service-zones.ts') && !paths.includes('src/app/service-zones.ts'),
);
for (const p of [
  'tests/browser/service-zones-before.mjs',
  'tests/browser/service-zones/road-fixture.ts',
  'tests/browser/service-zones/reference-query.ts',
  'tests/browser/service-zones/verify-before.mjs',
  'tests/browser/service-zones/verify-query-records.mjs',
  'tests/browser/service-zones/failure-info.mjs',
  'tests/world/service-zones-reference.test.mjs',
  'scripts/register-typescript.mjs',
  'package-lock.json',
  'Docs/performance-budgets.json',
])
  assert(paths.includes(p));
const source = createHash('sha256');
for (const item of manifest.inputs) {
  assert(!item.path.includes('..') && !item.path.includes('\\') && !item.path.startsWith('/'));
  const raw = await readFile(folder + '/source/' + item.path);
  assert.equal(raw.length, item.bytes);
  assert.equal(hash(raw), item.sha256);
  source.update(item.path).update(raw);
  if (item.path.startsWith('src/')) {
    const expectedBlob = execFileSync(
      'git',
      ['rev-parse', manifest.expectedCommit + ':' + item.path],
      { encoding: 'utf8' },
    ).trim();
    assert.equal(item.expectedHeadBlob, expectedBlob);
    assert.equal(item.gitBlob, expectedBlob);
    assert.equal(
      execFileSync('git', ['hash-object', '--stdin', '--path=' + item.path], {
        input: raw,
        encoding: 'utf8',
      }).trim(),
      expectedBlob,
    );
  }
  if (!historical)
    assert.equal(hash(await readFile(item.path)), item.sha256, 'Current ' + item.path);
}
assert.equal(source.digest('hex'), manifest.sourceHash);
assert.equal(manifest.native.archiveRelativePath, 'native/rapier.mjs');
const native = await readFile(folder + '/' + manifest.native.archiveRelativePath);
assert.equal(native.length, manifest.native.bytes);
assert.equal(hash(native), manifest.native.sha256);
if (!historical) assert.equal(hash(await readFile(manifest.native.path)), manifest.native.sha256);
assert.equal(manifest.hardware.path, 'hardware.json');
const hardwareRaw = await readFile(folder + '/hardware.json');
assert.equal(hardwareRaw.length, manifest.hardware.bytes);
assert.equal(hash(hardwareRaw), manifest.hardware.sha256);
const hardware = JSON.parse(hardwareRaw);
assert(time(manifest.startedAt) <= time(hardware.startedAt));
assert(time(hardware.startedAt) <= time(hardware.cim.capturedAt));
assert(time(hardware.cim.capturedAt) <= time(hardware.completedAt));
assert(time(hardware.completedAt) <= time(manifest.archivedAt));
assert.equal(hardware.cim.profile, 'CPU_NATIVE_ONLY');
assert.equal(hardware.cim.browserBackend, null);
assert.equal(hardware.cim.browserResolution, null);
assert(hardware.cim.cpu.some((x) => typeof x.Name === 'string' && x.Name.includes('Ryzen 7 7735U')));
assert(
  hardware.cim.gpu.some(
    (x) =>
      typeof x.Name === 'string' &&
      x.Name.includes('Radeon(TM) Graphics') &&
      typeof x.DriverVersion === 'string',
  ),
);
assert(Number.isFinite(hardware.cim.physicalMemoryBytes) && hardware.cim.physicalMemoryBytes > 0);
assert(typeof hardware.cim.powerScheme === 'string' && hardware.cim.powerScheme.length > 0);
// Historical semantics come exclusively from the hash-verified archived import closure.
const semanticRoot = historical ? resolve(folder, 'source') : resolve('.');
const { constructReference } = await import(
  pathToFileURL(resolve(semanticRoot, 'tests/browser/service-zones/reference-query.ts')).href
);
const { verifyRun } = await import(
  pathToFileURL(resolve(semanticRoot, 'tests/browser/service-zones/verify-query-records.mjs')).href
);
const fixture = constructReference();
const road = await read('road-fixture.json');
assert.deepEqual(road.map, fixture.map);
assert.deepEqual(road.graphStats, fixture.graph.getStats());
const rows = [];
let ordinal = 0;
for (const count of [70, 110])
  for (let pair = 0; pair < 5; pair++)
    for (const observer of pair % 2 ? [true, false] : [false, true]) {
      const row = await read('run-' + String(ordinal).padStart(2, '0') + '.json');
      assert.equal(row.ordinal, ordinal++);
      assert.equal(row.count, count);
      assert.equal(row.pair, pair);
      assert.equal(row.observer, observer);
      assert(time(first.firstWorldAt) <= time(row.startedAt));
      assert(time(row.startedAt) <= time(row.completedAt));
      assert(time(row.completedAt) <= time(complete.completedAt));
      verifyRun(row);
      assert.deepEqual(row.catalog, { map: fixture.map, graphStats: fixture.graph.getStats() });
      rows.push(row);
    }
for (const count of [70, 110]) {
  const group = rows.filter((x) => x.count === count);
  for (const row of group)
    for (const key of [
      'checkpoints',
      'physicalDigest',
      'controlDigest',
      'nativeInputDigest',
      'initialMechanics',
      'finalMechanics',
      'queries',
    ])
      assert.deepEqual(row[key], group[0][key], count + '/' + key);
}
console.log(
  JSON.stringify({
    status: 'PRE040_BASELINE_VALID',
    mode: historical ? 'HISTORICAL' : 'CURRENT',
    sourceHash: manifest.sourceHash,
    nativeSha256: manifest.native.sha256,
    worlds: 20,
    queries: 2600,
    normalAbsolute: true,
    physicalParity: true,
    cleanup: true,
    relative: 'AFTER_PENDING',
    loading: 'CPU construction only; no cold game claim',
    memory: 'RAW_JS_PROXY_ONLY; no whole heap/WASM/RAM acceptance',
    hardwarePerformanceAcceptance: false,
  }),
);
