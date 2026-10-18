// Read-only verification. No browser, world, server or production module imports.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
if (
  args.length < 1 ||
  args.length > 2 ||
  args[0].startsWith('--') ||
  (args.length === 2 && args[1] !== '--build-only')
)
  throw new Error('Usage: verify.mjs <evidence-folder> [--build-only]');
const buildOnly = args[1] === '--build-only';
const folder = resolve(args[0]);
assert.ok(process.argv[2] && folder.startsWith(resolve('Docs/Evidence/052-yield-policy') + sep));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const build = await json(resolve(folder, 'build-manifest.json'));
assert.equal(build.captureRevision, 'raf-scheduling-observation-v1');
assert.equal(build.collectorRevision, 'raf-scheduling-observation-v1');
assert.equal(build.validationRevision, 'diagnostic-transport-v1-no-performance-acceptance');
const historical =
  'Docs/Evidence/052-yield-policy/browser-v2-20261006T122201743Z/captures/WEBGL2-smoke';
assert.equal(
  sha(await readFile(resolve(historical, 'rejected.json'))),
  '7c30a3321834ea3ca866e0828d9661c96641d942f42eab0e9e47081deafdb049',
);
assert.equal(
  sha(await readFile(resolve(historical, 'failure.json'))),
  '50e03371fdc7ab8ce83d747fc61dad3fd54680cc177a16c5e62afce4d916b362',
);
const historicalFailure = await json(resolve(historical, 'failure.json'));
assert.equal(
  historicalFailure.identity.sourceHash,
  '9992f05e5f417f03b21b742e8536eda665891952c60fff683e055ce00c15ade1',
);
assert.equal(historicalFailure.failure, 'Error: HTTP500: 052 observed simulation/wall ratio');
const historicalV3 =
  'Docs/Evidence/052-yield-policy/browser-v3-20261006T124300565Z/captures/WEBGPU-smoke';
assert.equal(
  sha(await readFile(resolve(historicalV3, 'rejected.json'))),
  '2a7752afeadad88d811ffffa61aaded539715112dc304fae323bd1741660fce3',
);
assert.equal(
  sha(await readFile(resolve(historicalV3, 'failure.json'))),
  '8a4b79158110f20b319306a04d09abf42177739b878496a9c0ef96b60bb7ebd5',
);
assert.equal(
  sha(await readFile(resolve(historicalV3, 'submitted-arm-9.json'))),
  '00a13c94e10a9db19ff34891b34a685675b66dd04ea71511556504690d12afed',
);
const historicalV4 =
  'Docs/Evidence/052-yield-policy/browser-v4-20261006T132524979Z/captures/WEBGPU-smoke';
for (const [name, hash] of [
  ['failure.json', '8aa5d9585f5345c1f18a56809e6d6ca61166cf96c4732b9422ad16a7b2f7f376'],
  ['rejected.json', '60142e08e937b1e8081dc904b6dd3120ed606e08aeaee787d51a7825b2de36fd'],
  ['submitted-arm-1.json', '7c04ba0dcfb312e7c5fe2897666894cda59c46a0ce1eb7fdee5fe17667eba83d'],
  ['arm-1-rafTime-0.json', '1293d0590b4844c1c722fc5cec74dffe2b9b7429d0538fe038404ccd1b579441'],
  ['arm-1-rafReadTime-0.json', '3332f013498a82e33b4a3acc54ce63db86db1f52f63fb8621d2589b80a26868f'],
])
  assert.equal(sha(await readFile(resolve(historicalV4, name))), hash);
const historicalV5 =
  'Docs/Evidence/052-yield-policy/browser-v5-20261006T134014726Z/captures/WEBGPU-smoke';
for (const [name, hash] of [
  ['failure.json', 'e29a5a37f0faff6c522b02515b540337cfcd803b60a8fae043ed6b73511cb895'],
  ['incomplete-arm-12.json', 'f6fd4a166fc3adaa76230f37d4c50985d2928ae3a84aff313ad704f654acc604'],
  ['submitted-arm-12.json', '4d698d9da1866ea49161aab57307277940a28b5d0dc5394440584844f88a0e46'],
])
  assert.equal(sha(await readFile(resolve(historicalV5, name))), hash);
const historicalV6 =
  'Docs/Evidence/052-yield-policy/browser-v6-20261006T135845838Z/captures/WEBGPU-full';
for (const [name, hash] of [
  ['failure.json', '3fc4e54abdcd09cf272e6cade1f395f0b5df242bd020af5bc954f597276348c5'],
  ['incomplete-arm-4.json', 'a1ac457229c335ea5d48b37de0c461ae75cab31bdcb9da31ffd6bdbd58540d8e'],
  ['submitted-arm-4.json', '0087617760860c78c09c38be8b78f397ab2fb65e891babfce2d438938634d7c2'],
])
  assert.equal(sha(await readFile(resolve(historicalV6, name))), hash);
const historicalDisposition =
  'V2 WEBGL2-smoke, V3 WEBGPU-smoke and V4 WEBGPU-smoke and V5 WEBGPU-smoke FAILED and preserved; V6 FULL FAILED preserved; separate scheduling observations are diagnostic-only, no retroactive acceptance';
const archive = await json(folder + '-archive.json');
assert.equal(sha(await readFile(archive.zipPath)), archive.zipSha256);
assert.equal(archive.sourceHash, build.sourceHash);
assert.equal(archive.artifactHash, build.artifactHash);
const source = createHash('sha256');
const expectedZip = {};
assert.equal(new Set(build.inputs).size, build.inputs.length);
assert.deepEqual(build.inputs, [...build.inputs].sort());
for (const input of build.inputs) {
  assert.ok(!input.includes('..') && !input.includes('\\') && !input.startsWith('/'));
  const bytes = await readFile(resolve(build.archive, input));
  assert.deepEqual(await readFile(input), bytes, '052 CURRENT source differs');
  source.update(input).update(bytes);
  expectedZip[`source/${input}`] = { bytes: bytes.length, sha256: sha(bytes) };
}
assert.equal(source.digest('hex'), build.sourceHash);
assert.equal(sha(JSON.stringify(build.artifacts)), build.artifactHash);
for (const artifact of build.artifacts) {
  const bytes = await readFile(resolve(build.artifactRoot, artifact.path));
  assert.equal(bytes.length, artifact.bytes);
  assert.equal(sha(bytes), artifact.sha256);
  assert.deepEqual(await readFile(resolve(build.liveArtifactRoot, artifact.path)), bytes);
  expectedZip[`artifacts/${artifact.path}`] = { bytes: artifact.bytes, sha256: artifact.sha256 };
}
const native = await readFile(resolve(folder, 'rapier.mjs'));
assert.equal(native.length, build.nativeBytes);
assert.equal(sha(native), build.nativeHash);
assert.deepEqual(await readFile(new URL(build.nativePath)), native);
expectedZip['rapier.mjs'] = { bytes: native.length, sha256: sha(native) };
for (const name of ['build-manifest.json', '.gitattributes']) {
  const bytes = await readFile(resolve(folder, name));
  expectedZip[name] = { bytes: bytes.length, sha256: sha(bytes) };
}
const actualZip = JSON.parse(
  execFileSync(
    'python',
    [
      '-c',
      "import zipfile,hashlib,json,sys; z=zipfile.ZipFile(sys.argv[1]); fs=[i for i in z.infolist() if not i.is_dir()]; assert len(fs)<=1000; assert len(set(i.filename for i in fs))==len(fs); assert sum(i.file_size for i in fs)<=67108864; assert all(i.file_size<=8388608 for i in fs); prefix=sys.argv[2]+'/'; assert all(i.filename.startswith(prefix) for i in fs); print(json.dumps({i.filename[len(prefix):]:{'bytes':i.file_size,'sha256':hashlib.sha256(z.read(i)).hexdigest()} for i in fs}))",
      archive.zipPath,
      basename(folder),
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
  ),
);
assert.deepEqual(actualZip, expectedZip, '052 actual ZIP entries differ from archived bytes');
assert.ok(
  build.hardware.gpu.some((gpu) => /AMD|Radeon/i.test(gpu.Name)),
  '052 actual startup AMD evidence',
);
assert.equal(
  buildOnly,
  true,
  'Diagnostic source integrity tool requires --build-only; no hardware acceptance',
);
console.log(
  JSON.stringify({
    status: 'DIAGNOSTIC_BUILD_ONLY_PASS',
    sourceHash: build.sourceHash,
    artifactHash: build.artifactHash,
    nativeHash: build.nativeHash,
    zipSha256: archive.zipSha256,
    inputCount: build.inputs.length,
    artifactCount: build.artifacts.length,
    performanceAcceptance: false,
    hardwareFullAcceptance: false,
  }),
);
