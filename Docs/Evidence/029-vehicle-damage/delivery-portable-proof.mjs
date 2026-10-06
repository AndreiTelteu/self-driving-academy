// Additive historical delivery proof. No native world/browser/build/metadata mutation.
import assert from 'node:assert/strict';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
assert.equal(process.argv.length, 2, 'No flags: historical archive and explicit index audit only');
const root = fileURLToPath(new URL('../../../', import.meta.url));
assert.equal(resolve(process.cwd()), resolve(root), 'Run from the checkout containing this script');
const evidence = 'Docs/Evidence/029-vehicle-damage';
const base = evidence + '/hardware-20261006T034626897Z';
const oldRoot = 'F:/Sites/self-driving-academy/.worktrees/vehicle-damage-01/';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const normalized = bytes => Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
function relative(path) {
  assert.equal(typeof path, 'string');
  assert.ok(path && !path.includes('\\') && !path.includes(':') && !path.startsWith('/'));
  assert.ok(path.split('/').every(part => part && part !== '.' && part !== '..'));
  return path;
}
async function local(path) {
  const file = resolve(root, relative(path));
  assert.ok(file.startsWith(resolve(root) + sep));
  assert.ok((await realpath(file)).startsWith((await realpath(root)) + sep), 'No symlink escape');
  return file;
}
const read = async path => readFile(await local(path));
const json = async path => JSON.parse(await read(path));
function recordedPath(path, expected) {
  assert.equal(typeof path, 'string');
  const slash = path.replaceAll('\\', '/');
  const suffix = slash.startsWith(oldRoot) ? slash.slice(oldRoot.length) : slash;
  assert.equal(relative(suffix), expected, 'Only exact recorded final-evidence suffix admitted');
  return resolve(root, expected);
}
const recorded = await json(base + '/build-manifest.json');
assert.equal(recorded.sourceHash, 'bd02a51853838ad2a9375d044699bd604082518538ee09360b2a5dca0fbd2c4a');
assert.equal(recorded.artifactHash, '7d7687d2447c4bac2b3f4d8e703f8229dd54460032291cd0a31910ca3b25a1f4');
assert.equal(recorded.nativeHash, '02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0');
assert.equal(recorded.inputs.length, 71);
assert.equal(recorded.artifacts.length, 58);
const build = {
  ...recorded,
  archiveRoot: recordedPath(recorded.archiveRoot, base + '/source'),
  artifactRoot: recordedPath(recorded.artifactRoot, base + '/artifacts'),
  nativeArchivePath: recordedPath(recorded.nativeArchivePath, base + '/native/rapier.mjs'),
  captureRoot: recordedPath(recorded.captureRoot, base + '/captures'),
};
await local(base + '/source');
await local(base + '/artifacts');
await local(base + '/native/rapier.mjs');
// Execute the captured pure validators, not an unverified current replacement.
const pure = async name => import(pathToFileURL(await local(base + '/source/tests/browser/vehicle-damage/' + name)).href);
const { verifyFrozenArchive } = await pure('hardware-archive.mjs');
const archive = await verifyFrozenArchive(build, true);
const { fullBackendSequence } = await pure('hardware-protocol.ts');
const { verifyCompleteRun, compareBackend, rejectTerminalMarkers } = await pure('hardware-verifier.ts');
const { verifyFunctionalCases } = await pure('hardware-functional-verifier.ts');
const indexRows = [];
for (const input of recorded.inputs) {
  relative(input.path);
  const captured = await read(base + '/source/' + input.path);
  const blob = execFileSync('git', ['show', ':' + input.path], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  const current = await read(input.path);
  const indexExact = sha(blob) === input.sha256;
  const indexEolOnly = !indexExact && normalized(blob).equals(normalized(captured));
  assert.ok(indexExact || indexEolOnly, 'Non-EOL staged semantic drift: ' + input.path);
  indexRows.push({ path: input.path, capturedBytes: captured.length, capturedSha256: input.sha256,
    indexBytes: blob.length, indexSha256: sha(blob), indexExact, indexEolOnly,
    checkoutBytes: current.length, checkoutSha256: sha(current), checkoutExact: current.equals(captured),
    checkoutEolOnly: !current.equals(captured) && normalized(current).equals(normalized(captured)),
  });
}
const results = [];
for (const [kind, id, backend] of [
  ['functional', '20261006T034738523Z', 'WEBGPU'],
  ['functional', '20261006T035249070Z', 'WEBGL2'],
  ['hardware', '20261006T093158558Z', 'WEBGPU'],
  ['hardware', '20261006T102935092Z', 'WEBGL2'],
]) {
  const path = base + '/captures/' + (kind === 'functional' ? 'functional/' : '') + id;
  const folder = await local(path), files = await readdir(folder);
  rejectTerminalMarkers(files);
  const start = await json(path + '/start.json');
  assert.equal(start.captureId, id);
  assert.equal(start.backend, backend);
  assert.deepEqual(start.build, recorded, 'Original metadata bound to unchanged recorded manifest');
  assert.ok(Number.isFinite(Date.parse(start.startedAt)) && Date.parse(recorded.archivedAt) <= Date.parse(start.startedAt));
  const comparison = await json(path + '/comparison.json');
  if (kind === 'functional') {
    assert.deepEqual(files.slice().sort(), ['start.json', 'comparison.json', ...Array.from({length:32}, (_,i) => 'case-' + i + '.json')].sort());
    const cases = [];
    for (let ordinal = 0; ordinal < 32; ordinal++) {
      const bytes = await read(path + '/case-' + ordinal + '.json');
      assert.ok(bytes.length <= 128 * 1024);
      const row = JSON.parse(bytes);
      assert.equal(row.captureId, id);
      assert.equal(row.ordinal, ordinal);
      assert.ok(Date.parse(start.startedAt) <= Date.parse(row.result.startedAt));
      if (ordinal) assert.ok(Date.parse(cases[ordinal - 1].completedAt) <= Date.parse(row.result.startedAt));
      cases.push(row.result);
    }
    const verified = verifyFunctionalCases(cases, backend);
    for (const [key, value] of Object.entries({ captureId:id, backend, sourceHash:recorded.sourceHash, artifactHash:recorded.artifactHash, nativeHash:recorded.nativeHash, passed:true, nativeCases:verified.nativeCases, ownershipCycles:verified.ownershipCycles })) assert.equal(comparison[key], value);
    results.push({kind, captureId:id, backend, verification:'PASS', files:files.length, verified});
  } else {
    assert.deepEqual(start.sequence, fullBackendSequence());
    const expectedFiles = ['start.json', 'comparison.json'], runs = [];
    let totalParts = 0;
    for (const spec of fullBackendSequence()) {
      const mname = 'run-' + spec.runOrdinal + '-manifest.json', vname = 'run-' + spec.runOrdinal + '-verified.json';
      expectedFiles.push(mname,vname);
      const manifest = await json(path + '/' + mname);
      const expected = {captureId:id, backend, pair:spec.pair, observer:spec.observer, arm:spec.arm, runOrdinal:spec.runOrdinal, sourceHash:recorded.sourceHash, artifactHash:recorded.artifactHash, nativeHash:recorded.nativeHash};
      assert.ok(manifest.partIds.length <= 16);
      const parts = [];
      for (const partId of manifest.partIds) {
        assert.match(partId, /^[a-zA-Z0-9_-]+$/);
        const name = partId + '.json';expectedFiles.push(name);
        const bytes = await read(path + '/' + name);
        assert.ok(bytes.length <= 128 * 1024);parts.push(JSON.parse(bytes));
      }
      totalParts += parts.length;
      const run = verifyCompleteRun(manifest, parts.filter(p=>p.version==='029-metric-part-v1'), parts.find(p=>p.version==='029-trace-part-v1'), parts.find(p=>p.version==='029-heap-part-v1'), expected, build);
      assert.deepEqual(run, await json(path + '/' + vname));runs.push(run);
    }
    assert.ok(totalParts <= 320);
    assert.equal(new Set(expectedFiles).size, expectedFiles.length);
    assert.deepEqual(files.slice().sort(), expectedFiles.sort());
    assert.deepEqual(compareBackend(runs), comparison);
    assert.equal(comparison.requiredCpuFrameMemoryVerdict, 'PASS');
    results.push({kind, captureId:id, backend, verification:'PASS',files:files.length,totalParts,result:comparison});
  }
}
console.log(JSON.stringify({ verification:'PASS', mode:'PORTABLE_HISTORICAL_ARCHIVES_AND_INDEX_AUDIT', archive,
  rootBinding:'Only this checkout durable Evidence029, no nativePath/oldworktree read; captured pure validators reused',
  indexExactCount:indexRows.filter(r=>r.indexExact).length, indexEolOnlyCount:indexRows.filter(r=>r.indexEolOnly).length,
  checkoutExactCount:indexRows.filter(r=>r.checkoutExact).length, checkoutDifferences:indexRows.filter(r=>!r.checkoutExact), indexRows, results,
  limits:'Historical bytes verified; checkout/index EOL differences disclosed, never CURRENT byteexact by normalization. GPU/input remain NOT_MEASURED; JSproxy is not native/totalRAM; historical failures untouched.' }));