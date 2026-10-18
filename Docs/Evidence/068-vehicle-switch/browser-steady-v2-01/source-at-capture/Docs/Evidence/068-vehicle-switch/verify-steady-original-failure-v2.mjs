import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const EXPECTED_ROWS = [
  {
    path: 'Docs/Evidence/068-vehicle-switch/browser-steady-01/build-manifest.json',
    bytes: 32308,
    sha256: 'e878940437dc279c662c906488c2ec7f45a00704f9dc0dda32f7d422c8af5546',
  },
  {
    path: 'Docs/Evidence/068-vehicle-switch/browser-steady-01/native.json',
    bytes: 252,
    sha256: '177925ffbab3d6c0418d54e87feb3cf6a66f12ec86719c8ba56690b5505e12d6',
  },
  {
    path: 'Docs/Evidence/068-vehicle-switch/browser-steady-01/failure-webgpu.json',
    bytes: 11183,
    sha256: 'aff0fde815f7f5d070256f3157176e9becdc10cb4529b0cf000a0e9795a2e52b',
  },
  {
    path: 'Docs/Evidence/068-vehicle-switch/browser-steady-01/capture-webgpu-terminal.json',
    bytes: 356,
    sha256: '39341781cf289a74c8c360465bc946f28518d5bb3947f1bb78fe2360acfb9bc0',
  },
  {
    ordinal: 0,
    bytes: 5029378,
    sha256: '5ecff5f4503e5ab51d11fb13afa32831c938a095f30f9424117954aa21ec8723',
    parts: 10,
    disposition: 'PASS',
  },
  {
    ordinal: 1,
    bytes: 5290756,
    sha256: 'ee124447d520ac95129b5c191718cfc729d5ba27f5b0db87066afc7b93cfb3d6',
    parts: 11,
    disposition: 'PASS',
  },
  {
    ordinal: 2,
    bytes: 5109630,
    sha256: '49a1505b7e78001caa2a1cfcd128b9d9a881959ce2ec050193d21b97f2db8ed6',
    parts: 10,
    disposition: 'PASS',
  },
  {
    ordinal: 3,
    bytes: 68494,
    sha256: 'd0e2d2fd7e158305f39b75d822ca6877576b8414a59ab0726d4a9267647356bb',
    parts: 1,
    disposition: 'FAILED',
  },
];
export function validateOriginalFailureRows(rows) {
  assert.deepEqual(
    rows,
    EXPECTED_ROWS,
    'Exact four metadata rows and four unique ordinal0..3 raw worlds; hashes/dispositions cannot be substituted',
  );
}
/** Original failure is a mandatory immutable input, never a retroactively accepted arm. */
export async function verifyOriginalSteadyFailure() {
  const proof = JSON.parse(
    await readFile('Docs/Evidence/068-vehicle-switch/steady-v2-original-failure-proof.json'),
  );
  assert.equal(proof.status, 'IMMUTABLE_ORIGINAL_FULL_FAILED');
  const base = 'Docs/Evidence/068-vehicle-switch/browser-steady-01';
  assert.equal(
    proof.captureId,
    'de329df675e21bd24e88ce94f2d68758de7c4e34366be29096bc9d3b7a4dc7ca-webgpu',
  );
  validateOriginalFailureRows(proof.rows);
  const verifiedOrdinals = [];
  for (const row of proof.rows) {
    if (row.path) {
      assert.ok(row.path.startsWith(base + '/') && !row.path.includes('..'));
      const bytes = await readFile(row.path);
      assert.equal(bytes.length, row.bytes);
      assert.equal(sha(bytes), row.sha256);
    } else {
      assert.ok(Number.isSafeInteger(row.ordinal) && row.ordinal >= 0 && row.ordinal < 4);
      const stem = base + '/' + proof.captureId + '/world-' + row.ordinal,
        t = JSON.parse(await readFile(stem + '-terminal.json'));
      assert.equal(t.status, row.ordinal === 3 ? 'FAILED' : 'PASS');
      assert.equal(t.parts, row.parts);
      const chunks = [];
      for (let i = 0; i < t.parts; i++) chunks.push(await readFile(stem + '-part-' + i + '.bin'));
      const bytes = Buffer.concat(chunks);
      assert.equal(bytes.length, row.bytes);
      assert.equal(sha(bytes), row.sha256);
      assert.equal(t.sha256, row.sha256);
      verifiedOrdinals.push(row.ordinal);
    }
  }
  assert.deepEqual(verifiedOrdinals, [0, 1, 2, 3]);
  for (const [name, bytes, hash] of [
    [
      'build-archive.json',
      24571,
      'a431c6b1d145fac3750c2d97dda794ad69003e1343c8dfa728bb9952bb40320b',
    ],
    ['build-started.json', 151, 'e7fd310f3388c0bc8ddf5ea67fe3032315a1d20528899f6161761fc39efef896'],
    [
      'build-complete.json',
      263,
      'b1f9f9e017c10de6d2cf23f6d7101702596b39e1797840da6359fd989ccb3124',
    ],
  ]) {
    const raw = await readFile(base + '/' + name);
    assert.equal(raw.length, bytes);
    assert.equal(sha(raw), hash);
  }
  const zip = await readFile(base + '/build-at-capture.zip');
  assert.equal(zip.length, 3460298);
  assert.equal(sha(zip), '9a1c852549d840a89bb0ad3ebe9e31934c93023c3d9d9d8e3ffbf5c125be3edf');
  const native = JSON.parse(await readFile(base + '/native.json')),
    nativeBytes = await readFile(base + '/native/rapier.mjs');
  assert.equal(nativeBytes.length, native.bytes);
  assert.equal(sha(nativeBytes), native.sha256);
  const terminal = JSON.parse(await readFile(base + '/capture-webgpu-terminal.json'));
  assert.equal(terminal.status, 'FAILED');
  assert.equal(terminal.incomplete, true);
  const manifest = JSON.parse(await readFile(base + '/build-manifest.json'));
  assert.equal(
    manifest.sourceHash,
    'de329df675e21bd24e88ce94f2d68758de7c4e34366be29096bc9d3b7a4dc7ca',
  );
  const aggregate = createHash('sha256');
  for (const path of manifest.inputs) {
    assert.ok(!path.includes('..') && !path.startsWith('/'));
    aggregate.update(path).update(await readFile(base + '/source-at-capture/' + path));
  }
  assert.equal(aggregate.digest('hex'), manifest.sourceHash);
  return {
    status: 'ORIGINAL_FULL_FAILED_PRESERVED',
    sourceHash: manifest.sourceHash,
    arms: verifiedOrdinals.length,
  };
}
