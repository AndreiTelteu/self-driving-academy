/**Independent030 historical/current BEFORE byte+raw+physical validator SOURCE draft.*/
import assert from 'node:assert/strict';
import { verifyRecordEnvelope } from './verify-records.mjs';
import { recoveryRoadFixture } from './road-fixture.ts';
import { readFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const folder = resolve(process.argv[2] ?? 'Docs/Evidence/030-vehicle-recovery/before-01');
const historical = process.argv.includes('--historical');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = async (name) => JSON.parse(await readFile(folder + '/' + name));
const manifest = await read('manifest.json'),
  complete = await read('complete.json'),
  first = await read('first-world.json');
const files = await readdir(folder);
assert(!files.includes('failure.json'), 'Immutable failed capture rejected');
assert.equal(complete.status, 'PASS');
assert.equal(complete.runCount, 20);
assert.equal(complete.sourceHash, manifest.sourceHash);
assert.equal(first.sourceHash, manifest.sourceHash);
assert.equal(manifest.expectedCommit, 'ad32db9c609cce1132669c95312ae202a62b87ed');
assert(Date.parse(manifest.startedAt) <= Date.parse(manifest.archivedAt));
assert(Date.parse(manifest.archivedAt) <= Date.parse(first.firstWorldAt));
const expectedSource = execFileSync(
  'git',
  ['ls-tree', '-r', '--name-only', manifest.expectedCommit, 'src'],
  { encoding: 'utf8' },
)
  .trim()
  .split(/\r?\n/)
  .sort();
assert.deepEqual(
  manifest.inputs
    .filter((r) => r.path.startsWith('src/'))
    .map((r) => r.path)
    .sort(),
  expectedSource,
  'Complete published source closure',
);
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
  if (row.path.startsWith('src/')) {
    const blob = execFileSync('git', ['rev-parse', manifest.expectedCommit + ':' + row.path], {
      encoding: 'utf8',
    }).trim();
    assert.equal(row.expectedHeadBlob, blob);
    assert.equal(row.gitBlob, blob);
    assert.equal(
      execFileSync('git', ['hash-object', '--stdin', '--path=' + row.path], {
        input: bytes,
        encoding: 'utf8',
      }).trim(),
      blob,
      'Archived normalized Git blob',
    );
  }
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
      assert.deepEqual(run.cleanup.attempts, ['controller', 'damage', 'world']);
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
console.log(
  JSON.stringify({
    status: 'PASS',
    mode: historical ? 'HISTORICAL_ARCHIVE' : 'CURRENT_BYTES',
    sourceHash: manifest.sourceHash,
    nativeSha256: manifest.native.sha256,
    inputs: manifest.inputs.length,
    runs: 20,
    physicalParity: true,
    cleanup: true,
    normalAbsoluteGate: true,
    relativeGate: 'AFTER pending; original >10% AND>1ms in>=3/5 required',
    memory:
      'Raw live heap proxy endpoints preserved; no030 owner/retention/totalRAM acceptance yet',
  }),
);
