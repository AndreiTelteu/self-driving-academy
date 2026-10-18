// Supplemental V7 TARGETED smoke proof; outside frozen build inputs.
// Derived from the frozen V7 verifier by disclosed textual replacement only. It runs every integrity
// assertion of the frozen verifier plus the backend-independent criterion assertions, requires a
// limitations.md that declares the unmet WebGPU probe and the deferral to 220/224, and reports
// TARGETED_SMOKE_PASS_NO_HARDWARE_ACCEPTANCE. It never reports a generic PASS.
import { readFile as readDerivationFile } from 'node:fs/promises';
import { createHash as createDerivationHash } from 'node:crypto';
if (process.argv.length !== 3) throw new Error('Exactly one evidence-folder argument; no flags');
const derivation = {
  "frozenVerifierPath": "tests/browser/yield-policy-v7/verify.mjs",
  "frozenVerifierSha256": "231cd90b47b6710e293824c3147591bfc5ddce7796545c516e94cee923297ae3",
  "frozenProtocolPath": "tests/browser/yield-policy-v7/protocol.ts",
  "frozenProtocolSha256": "2b64dfa0c678cb9c00038fbad069ef85ab22fb55a5da5c5f268655f08a2d4f7f",
  "replacements": [
    {
      "from": "  validateCalibrationNative,\n} from './protocol.ts';",
      "to": "  validateCalibrationNative,\n} from '../../../tests/browser/yield-policy-v7/protocol.ts';"
    },
    {
      "from": "import { validateObservationMetadata, V7_REVISION } from './protocol.ts';",
      "to": "import { validateObservationMetadata, V7_REVISION } from '../../../tests/browser/yield-policy-v7/protocol.ts';"
    },
    {
      "from": "  validateCaptureInventory(inventory, build.sourceHash);",
      "to": "  async function validateTargetedSmokeInventory(rows, sourceHash, targetFolder) {\n    const limitations = await readFile(resolve(targetFolder, 'limitations.md'), 'utf8');\n    for (const token of [\n      'WEBGPU_UNMET',\n      'DEFERRED_TO 220',\n      'DEFERRED_TO 224',\n      'APPROVED 2026-10-19',\n      'browser-v7-20261018T192001395Z',\n      'browser-v7-20261018T193106239Z',\n      'browser-v7-20261018T203144981Z',\n      'browser-v7-20261018T212619137Z',\n      'raf-scheduling-20261018-analysis',\n      'stall-attribution',\n    ])\n      assert.ok(limitations.includes(token), '052 limitations.md missing token: ' + token);\n    if (rows.length !== 1 || rows[0].name !== 'WEBGL2-smoke')\n      throw new Error('052 targeted smoke requires exactly one WEBGL2-smoke attempt');\n    const row = rows[0];\n    if (\n      row.start.full !== false ||\n      row.start.sourceHash !== sourceHash ||\n      row.files.some((file) => /failure|rejected|incomplete/i.test(file)) ||\n      !row.terminal ||\n      row.terminal.captureId !== row.start.captureId ||\n      row.terminal.status !== 'SAVED_PENDING_VERIFICATION' ||\n      row.terminal.arms !== 14 ||\n      !row.files.includes('report.json')\n    )\n      throw new Error('052 targeted smoke attempt is not a complete clean smoke');\n  }\n  await validateTargetedSmokeInventory(inventory, build.sourceHash, folder);"
    },
    {
      "from": "      verified: true,",
      "to": "      verified: true,\n      status: 'TARGETED_SMOKE_PASS_NO_HARDWARE_ACCEPTANCE',\n      performanceAcceptance: false,\n      hardwareFullAcceptance: false,\n      amendment:\n        'user-approved 2026-10-19: targeted close on native + WEBGL2 smoke; full dual-backend deferred to 220/224',"
    }
  ],
  "scope": "TARGETED smoke-only derivation of the frozen V7 verifier: exactly one complete WEBGL2 smoke plus a mandatory limitations.md; no performance/hardware acceptance",
  "executed": false
};
const derivationHash = (bytes) => createDerivationHash('sha256').update(bytes).digest('hex');
const frozenVerifier = await readDerivationFile(new URL('../../../tests/browser/yield-policy-v7/verify.mjs', import.meta.url), 'utf8');
const frozenProtocol = await readDerivationFile(new URL('../../../tests/browser/yield-policy-v7/protocol.ts', import.meta.url));
if (
  derivationHash(frozenVerifier) !== derivation.frozenVerifierSha256 ||
  derivationHash(frozenProtocol) !== derivation.frozenProtocolSha256
)
  throw new Error('Frozen V7 verifier/protocol changed');
let expectedDerivation = frozenVerifier;
for (const { from, to } of derivation.replacements) {
  if (expectedDerivation.split(from).length !== 2) throw new Error('Nonunique V7 derivation anchor');
  expectedDerivation = expectedDerivation.replace(from, to);
}
const self = await readDerivationFile(new URL(import.meta.url), 'utf8');
const marker = "// BEGIN HASH-GUARDED DERIVED FROZEN V7 VERIFIER\n";
if (self.slice(self.lastIndexOf(marker) + marker.length) !== expectedDerivation)
  throw new Error('Supplemental differs from exact disclosed V7 derivation');
// BEGIN HASH-GUARDED DERIVED FROZEN V7 VERIFIER
// Read-only verification. No browser, world, server or production module imports.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  validateTimingArm,
  validateCalibrationArm,
  validateSmokeArm,
  validateCaptureInventory,
  validateCalibrationNative,
} from '../../../tests/browser/yield-policy-v7/protocol.ts';
import { validateObservationMetadata, V7_REVISION } from '../../../tests/browser/yield-policy-v7/protocol.ts';
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
assert.equal(build.captureRevision, '052-v7-boundary-callback-longtask-observations');
assert.equal(build.collectorRevision, '052-v6-derived-diagnostic-collector-v7');
assert.equal(build.validationRevision, '052-v5-cross-api-clock-numerical-consistency');
assert.equal(build.observationRevision, V7_REVISION);
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
const historicalDisposition =
  'V2 WEBGL2-smoke, V3 WEBGPU-smoke and V4 WEBGPU-smoke and V5 WEBGPU-smoke FAILED and preserved; V7 diagnostic collector inherits exact V5 validator; original V6 FAIL remains unresolved, no retroactive acceptance';
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
if (buildOnly) {
  console.log(
    JSON.stringify({
      status: 'BUILD_ONLY_PASS',
      sourceHash: build.sourceHash,
      artifactHash: build.artifactHash,
      nativeHash: build.nativeHash,
      zipSha256: archive.zipSha256,
      historicalDisposition,
      inputCount: build.inputs.length,
      artifactCount: build.artifacts.length,
      scope:
        'CURRENT source/artifact/native/ZIP/startup AMD integrity only; no capture or hardware acceptance',
    }),
  );
} else {
  const budget = await json('Docs/performance-budgets.json');
  const captureNames = await readdir(build.captureRoot);
  const inventory = [];
  for (const name of captureNames) {
    const capture = resolve(build.captureRoot, name),
      files = await readdir(capture);
    inventory.push({
      name,
      files,
      start: await json(resolve(capture, 'started.json')),
      terminal: files.includes('terminal.json')
        ? await json(resolve(capture, 'terminal.json'))
        : undefined,
    });
  }
  async function validateTargetedSmokeInventory(rows, sourceHash, targetFolder) {
    const limitations = await readFile(resolve(targetFolder, 'limitations.md'), 'utf8');
    for (const token of [
      'WEBGPU_UNMET',
      'DEFERRED_TO 220',
      'DEFERRED_TO 224',
      'APPROVED 2026-10-19',
      'browser-v7-20261018T192001395Z',
      'browser-v7-20261018T193106239Z',
      'browser-v7-20261018T203144981Z',
      'browser-v7-20261018T212619137Z',
      'raf-scheduling-20261018-analysis',
      'stall-attribution',
    ])
      assert.ok(limitations.includes(token), '052 limitations.md missing token: ' + token);
    if (rows.length !== 1 || rows[0].name !== 'WEBGL2-smoke')
      throw new Error('052 targeted smoke requires exactly one WEBGL2-smoke attempt');
    const row = rows[0];
    if (
      row.start.full !== false ||
      row.start.sourceHash !== sourceHash ||
      row.files.some((file) => /failure|rejected|incomplete/i.test(file)) ||
      !row.terminal ||
      row.terminal.captureId !== row.start.captureId ||
      row.terminal.status !== 'SAVED_PENDING_VERIFICATION' ||
      row.terminal.arms !== 14 ||
      !row.files.includes('report.json')
    )
      throw new Error('052 targeted smoke attempt is not a complete clean smoke');
  }
  await validateTargetedSmokeInventory(inventory, build.sourceHash, folder);
  const smokeDisposition = [];
  for (const attempt of inventory) {
    const backend = attempt.start.backend,
      full = attempt.start.full;
    const capture = resolve(build.captureRoot, attempt.name);
    const files = await readdir(capture);
    assert.ok(
      !files.some((file) => /failure|rejected|incomplete/i.test(file)),
      '052 terminal failure marker',
    );
    const start = await json(resolve(capture, 'started.json'));
    const terminal = await json(resolve(capture, 'terminal.json'));
    const report = await json(resolve(capture, 'report.json'));
    const expectedCaptureFiles = new Set(['started.json', 'terminal.json', 'report.json']);
    assert.equal(start.sourceHash, build.sourceHash);
    assert.equal(start.observationRevision, V7_REVISION);
    assert.equal(report.identity.observationRevision, V7_REVISION);
    assert.equal(start.backend, backend);
    assert.equal(terminal.captureId, start.captureId);
    assert.equal(terminal.status, 'SAVED_PENDING_VERIFICATION');
    assert.equal(terminal.arms, 14);
    assert.equal(report.captureId, start.captureId);
    assert.equal(report.full, full);
    assert.equal(report.fixtureVersion, '052-yield-browser-v4');
    assert.equal(report.renderer, backend);
    assert.equal(report.identity.sourceHash, build.sourceHash);
    assert.equal(report.artifactHash, build.artifactHash);
    assert.deepEqual(report.rendererCleanup, {
      sceneDisposed: true,
      engineScenes: 0,
      sceneMeshes: 0,
      sceneMaterials: 0,
      sceneTextures: 0,
      canvasCount: 1,
    });
    assert.equal(report.ownerCleanup.total, 0);
    assert.equal(report.ownerCleanup.resources, report.ownerCleanup.attempted);
    assert.equal(report.foreground, true);
    assert.equal(report.dpr, 1);
    assert.deepEqual(report.cssResolution, [1920, 1080]);
    assert.deepEqual(report.internalResolution, [1920, 1080]);
    assert.ok(/Chrome\//.test(report.browser));
    assert.ok(
      /AMD|Radeon/i.test(JSON.stringify(report.rendererInfo)) &&
        !/swiftshader|llvmpipe|software rasterizer/i.test(JSON.stringify(report.rendererInfo)),
      '052 actual AMD browser renderer',
    );
    assert.ok(Date.parse(build.createdAt) <= Date.parse(start.startedAt));
    assert.ok(Date.parse(start.startedAt) <= Date.parse(report.createdAt));
    assert.ok(Date.parse(report.createdAt) <= Date.parse(terminal.createdAt));
    assert.equal(report.runs.length, 10);
    assert.equal(report.calibration.length, 4);
    assert.equal(files.filter((file) => /^submitted-arm-\d+\.json$/.test(file)).length, 14);
    let totalParts = 0,
      totalBytes = 0;
    const reconstructed = [];
    for (let ordinal = 0; ordinal < 14; ordinal++) {
      const retained = await json(resolve(capture, `arm-${ordinal}.json`));
      assert.equal(retained.captureId, start.captureId);
      const meta = retained.metadata;
      validateObservationMetadata(meta, true, true);
      expectedCaptureFiles.add('arm-' + ordinal + '.json');
      const submittedFile = 'submitted-arm-' + ordinal + '.json';
      expectedCaptureFiles.add(submittedFile);
      const submittedEnvelopeBytes = await readFile(resolve(capture, submittedFile));
      assert.ok(submittedEnvelopeBytes.length <= 4 * 1024 * 1024 + 4096);
      const submitted = JSON.parse(submittedEnvelopeBytes);
      assert.deepEqual(Object.keys(submitted).sort(), [
        'captureId',
        'ordinal',
        'parsedRequestBytes',
        'parsedRequestSha256',
        'receivedAt',
        'request',
      ]);
      assert.deepEqual(Object.keys(submitted.request).sort(), ['captureId', 'metadata', 'ordinal']);
      assert.equal(submitted.captureId, start.captureId);
      assert.equal(submitted.ordinal, ordinal);
      assert.equal(submitted.request.captureId, start.captureId);
      assert.equal(submitted.request.ordinal, ordinal);
      const submittedBytes = Buffer.from(JSON.stringify(submitted.request));
      assert.equal(submittedBytes.length, submitted.parsedRequestBytes);
      assert.ok(submittedBytes.length <= 4 * 1024 * 1024);
      assert.equal(sha(submittedBytes), submitted.parsedRequestSha256);
      assert.deepEqual(submitted.request.metadata, meta);
      assert(Date.parse(start.startedAt) <= Date.parse(submitted.receivedAt));
      assert(Date.parse(submitted.receivedAt) <= Date.parse(report.createdAt));
      assert.deepEqual(meta, ordinal < 4 ? report.calibration[ordinal] : report.runs[ordinal - 4]);
      assert.equal(meta.ordinal, ordinal);
      assert.ok(retained.parts.length <= 132);
      const raw = {
        frame: [],
        main: [],
        tick: [],
        step: [],
        policy: [],
        rafTime: [],
        rafReadTime: [],
        nativeSerial: [],
        controllerTick: [],
      };
      for (const part of retained.parts) {
        assert.equal(part.file, `arm-${ordinal}-${part.channel}-${part.part}.json`);
        expectedCaptureFiles.add(part.file);
        const bytes = await readFile(resolve(capture, part.file));
        assert.equal(bytes.length, part.bytes);
        assert.ok(bytes.length <= 128 * 1024);
        assert.equal(sha(bytes), part.sha256);
        const value = JSON.parse(bytes);
        assert.equal(value.captureId, start.captureId);
        assert.equal(value.ordinal, ordinal);
        assert.equal(value.channel, part.channel);
        assert.equal(value.part, part.part);
        assert.equal(value.numbers.length, part.count);
        assert.ok(part.count <= 3000);
        assert.equal(part.part, Math.floor(raw[part.channel].length / 3000));
        raw[part.channel].push(...value.numbers);
        totalParts++;
        totalBytes += bytes.length;
      }
      assert.deepEqual(
        meta.rawParts,
        retained.parts.map(({ channel, part, count }) => ({ channel, part, count })),
      );
      assert.equal(meta.rendererCleanup.meshesBefore, meta.rendererCleanup.meshesAfter);
      assert.equal(meta.rendererCleanup.materialsBefore, meta.rendererCleanup.materialsAfter);
      assert.equal(meta.rendererCleanup.observerDisconnected, true);
      assert.equal(meta.cleanup.bodies.entities, 0);
      assert.equal(meta.cleanup.controller.vehicles, 0);
      assert.equal(meta.cleanup.priority.vehicles, 0);
      assert.equal(meta.cleanup.collision.colliders, 0);
      assert.equal(meta.finalBodies.length, ordinal < 4 ? 2 : 70);
      assert.deepEqual(
        meta.initialMechanics,
        meta.finalMechanics,
        '052 readonly mechanics changed',
      );
      for (const body of meta.finalBodies) {
        assert.ok(
          [
            ...Object.values(body.position),
            ...Object.values(body.velocity),
            ...Object.values(body.rotation),
            body.speed,
          ].every(Number.isFinite),
        );
      }
      if (ordinal >= 4) {
        const offset = ordinal - 4,
          pair = Math.floor(offset / 2);
        assert.equal(meta.pair, pair);
        assert.equal(meta.current, pair % 2 ? offset % 2 === 0 : offset % 2 === 1);
        if (full) validateTimingArm({ ...meta, raw });
        else validateSmokeArm({ ...meta, raw });
        assert.ok(
          meta.simulationToActiveWallTime >=
            budget.proposedBudgets.simulationToActiveWallTimeMinimum,
        );
        if (full)
          for (const [channel, limit] of [
            ['frame', budget.proposedBudgets.desktop.frameP95Ms],
            ['main', budget.proposedBudgets.desktop.mainThreadP95Ms],
            ['tick', budget.proposedBudgets.desktop.authoritativeTickP95Ms],
            ['step', budget.proposedBudgets.desktop.rapierStepP95Ms],
          ])
            assert.ok(meta.stats[channel].p95 <= limit);
        if (full) assert.ok(meta.stats.frame.p99 <= budget.proposedBudgets.desktop.frameP99Ms);
        assert.equal(typeof meta.longTasks.supported, 'boolean');
        assert.ok(
          Number.isSafeInteger(meta.longTasks.count) &&
            meta.longTasks.count >= 0 &&
            meta.longTasks.count <= 60000,
        );
        assert.ok(Number.isFinite(meta.longTasks.maxMs) && meta.longTasks.maxMs >= 0);
        if (full && meta.longTasks.supported)
          assert.ok(
            meta.longTasks.maxMs <=
              budget.proposedBudgets.normalSteadyStateApplicationLongTaskMaximumMs,
          );
        assert.equal(meta.memory.retainedProductionHistory, 0);
        for (const key of ['exactHeapBytes', 'exactWasmBytes', 'gpuMs'])
          assert.equal(meta.memory[key], null);
        assert.deepEqual(
          meta.checkpoints.map((row) => row.tick),
          Array.from({ length: full ? 75 : 2 }, (_, index) => (index + 1) * 120),
        );
      } else {
        assert.equal(meta.classId, ordinal < 2 ? 'sedan' : 'compact');
        assert.equal(meta.thresholdS, ordinal % 2 ? 3 : 0.2);
        assert.equal(meta.current, true);
        assert.equal(meta.otherDistanceM, 14);
        assert.equal(meta.warmupSeconds, 0);
        assert.equal(meta.measuredSeconds, 13);
        validateCalibrationArm({ ...meta, raw });
        validateCalibrationNative(meta);
        assert.deepEqual(
          meta.nativeReadbacks.map((row) => row.tick),
          Array.from({ length: 130 }, (_, index) => (index + 1) * 6),
        );
        assert.deepEqual(
          meta.checkpoints.map((row) => row.tick),
          Array.from({ length: 6 }, (_, index) => (index + 1) * 120),
        );
        for (const row of meta.nativeReadbacks) {
          assert.ok(Number.isSafeInteger(row.tick) && row.tick % 6 === 0);
          assert.equal(row.packets.length, 2);
          assert.equal(row.controls.length, 2);
          assert.equal(row.nativeInputs.length, 2);
          for (let index = 0; index < 2; index++) {
            assert.deepEqual(row.packets[index].identity, row.controls[index].identity);
            assert.deepEqual(row.packets[index].command, row.controls[index].raw);
            assert.equal(row.nativeInputs[index][0], row.controls[index].identity.entityId);
            for (const key of ['throttle', 'brake', 'steering', 'handbrake'])
              assert.equal(row.nativeInputs[index][1][key], row.controls[index].command[key]);
          }
        }
        assert.ok(meta.evidence.length <= 2048);
        assert.ok(Number.isFinite(meta.maxImpulseNs) && meta.maxImpulseNs >= 0);
      }
      reconstructed.push(meta);
    }
    assert.deepEqual(
      [...files].sort(),
      [...expectedCaptureFiles].sort(),
      '052 unknown/diagnostic/incomplete capture file',
    );
    assert.equal(totalParts, terminal.totalParts);
    assert.equal(totalBytes, terminal.totalBytes);
    assert.ok(totalParts <= 1848 && totalBytes <= 231 * 1024 * 1024);
    assert.equal(
      files.filter((file) =>
        /^arm-\d+-(frame|main|tick|step|policy|rafTime|rafReadTime|nativeSerial|controllerTick)-\d+\.json$/.test(
          file,
        ),
      ).length,
      totalParts,
    );
    let regressions = 0;
    for (let pair = 0; pair < 5; pair++) {
      const reference = reconstructed.slice(4).find((row) => row.pair === pair && !row.current);
      const current = reconstructed.slice(4).find((row) => row.pair === pair && row.current);
      for (const key of ['commandDigest', 'packetDigest', 'nativeDigest', 'physicalDigest'])
        assert.equal(reference[key], current[key]);
      for (const key of ['finalBodies', 'checkpoints'])
        assert.deepEqual(reference[key], current[key]);
      if (
        ['frame', 'main', 'tick'].some(
          (channel) =>
            current.stats[channel].p95 > reference.stats[channel].p95 * 1.1 &&
            current.stats[channel].p95 - reference.stats[channel].p95 > 1,
        )
      )
        regressions++;
    }
    if (full) assert.ok(regressions < 3, '052 confirmed relative hardware regression');
    if (!full)
      smokeDisposition.push({
        backend,
        captureId: start.captureId,
        status: 'COMPLETE_SMOKE_ONLY_NO_PERFORMANCE_ACCEPTANCE',
      });
    for (const classId of ['sedan', 'compact']) {
      const risky = report.calibration.find(
        (row) => row.classId === classId && row.thresholdS === 0.2,
      );
      const prudent = report.calibration.find(
        (row) => row.classId === classId && row.thresholdS === 3,
      );
      assert.ok(risky.firstEntryTick < prudent.firstEntryTick);
      assert.ok(risky.collisionTick !== null && risky.maxImpulseNs > 0);
      assert.equal(prudent.collisionTick, null); // This14m fixture only; no general3s guarantee.
      assert.ok(
        risky.evidence.some(
          (row) => row.kind === 'CROSSED_WITH_PRIORITY_EXPOSURE' && row.learningEligible === null,
        ),
      );
    }
  }
  console.log(
    JSON.stringify({
      verified: true,
      status: 'TARGETED_SMOKE_PASS_NO_HARDWARE_ACCEPTANCE',
      performanceAcceptance: false,
      hardwareFullAcceptance: false,
      amendment:
        'user-approved 2026-10-19: targeted close on native + WEBGL2 smoke; full dual-backend deferred to 220/224',
      sourceHash: build.sourceHash,
      artifactHash: build.artifactHash,
      zipSha256: archive.zipSha256,
      historicalDisposition,
      smokeDisposition,
      scope:
        '052 bounded single-subject physical fixture, not fullfleet/game/laptop/heap acceptance',
    }),
  );
}
