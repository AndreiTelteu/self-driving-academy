// SOURCE build-only proposal. No server/native/browser start; execute only after parent grant.
import { build } from 'vite';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, stat, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readNativeAfterBinding,
  NATIVE_AFTER,
} from '../vehicle-recovery-after/native-after-binding.mjs';
const root = resolve('.'),
  commit = 'ad32db9c609cce1132669c95312ae202a62b87ed';
assert.equal(
  root.replaceAll('\\', '/'),
  'F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01',
);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/vehicle-recovery-01',
);
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), commit);
const missing = async (path) => {
  try {
    await access(path);
    throw Error('Must be absent ' + path);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
};
await missing('.pbi-validation-030/build-synthetic-diagnostic-05');
await missing('Docs/Evidence/030-vehicle-recovery/browser-synthetic-diagnostic-05');
const evidence = 'Docs/Evidence/030-vehicle-recovery/browser-synthetic-diagnostic-05',
  archiveRoot = evidence + '/source',
  artifactRoot = evidence + '/artifacts',
  captureRoot = evidence + '/captures',
  functionalRoot = evidence + '/functional';
const hash = (b) => createHash('sha256').update(b).digest('hex');
await mkdir(evidence, { recursive: false });
await writeFile(evidence + '/.gitattributes', '* -text\n', { flag: 'wx' });
const startedAt = new Date().toISOString();
await writeFile(
  evidence + '/build-started.json',
  JSON.stringify({ commit, startedAt, scope: '030_SYNTHETIC_DIAGNOSTIC_BUILD_ONLY' }),
  { flag: 'wx' },
);
let sourceHash = null;
try {
  // Archive all actual test modules too: the native/pure proof imports have transitive
  // fixtures outside the browser directory. These bytes are evidence, not executed tests.
  const paths = execFileSync('rg', ['--files', 'src', 'tests'], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\r?\n/)
    .map((p) => p.replaceAll('\\', '/'));
  paths.push(
    'tests/vehicles/recovery-after-browser-observation.test.mjs',
    'tests/vehicles/recovery-native.test.ts',
    'tests/vehicles/recovery-functional-native.test.ts',
    'tests/browser/vehicle-recovery-after.mjs',
    'tests/browser/vehicle-recovery/verify-after.mjs',
    'tests/browser/vehicle-recovery/verify-after-records.mjs',
    'Docs/Evidence/030-vehicle-recovery/browser-after-source-handoff.md',
    'Docs/Evidence/030-vehicle-recovery/browser-after-readiness-source-01.md',
    'Docs/Evidence/030-vehicle-recovery/browser-synthetic-diagnostic-v5-source-01.md',
    'tests/vehicles/recovery-after-browser-boundaries.test.mjs',
    'tests/browser/vehicle-damage/hardware-collector.ts',
    'tests/browser/vehicle-damage/hardware-lifetime.ts',
    'scripts/register-typescript.mjs',
    'tests/vehicles/recovery-after-relative.test.mjs',
    'tests/vehicles/recovery-after-functional.test.mjs',
    'tests/vehicles/recovery-support-calibration.test.ts',
    'tests/input/recovery-input.test.ts',
    'package.json',
    'package-lock.json',
    'Docs/performance-budgets.json',
  );
  // Original raw reference is not a recaptured baseline. Verify its immutable historical proof before a build/world.
  execFileSync(
    process.execPath,
    [
      '--import',
      './scripts/register-typescript.mjs',
      'tests/browser/vehicle-recovery/verify-browser-set.mjs',
      'Docs/Evidence/030-vehicle-recovery/browser-before-20261006T132157019Z/build-manifest.json',
      '--historical',
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  execFileSync(
    process.execPath,
    [
      '--import',
      './scripts/register-typescript.mjs',
      'tests/browser/vehicle-recovery/verify-reference.mjs',
      'Docs/Evidence/030-vehicle-recovery/before-01',
      '--historical',
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  const inputs = [],
    source = createHash('sha256');
  for (const path of [...new Set(paths)].sort()) {
    const bytes = await readFile(path),
      gitBlob = execFileSync('git', ['hash-object', '--path=' + path, path], {
        encoding: 'utf8',
      }).trim();
    inputs.push({ path, bytes: bytes.length, sha256: hash(bytes), gitBlob });
    source.update(path).update(bytes);
    const target = archiveRoot + '/' + path;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
  sourceHash = source.digest('hex');
  const nativeAfterBinding = await readNativeAfterBinding(inputs);
  const nativeAfterValidation = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--import',
        './scripts/register-typescript.mjs',
        'tests/browser/vehicle-recovery/verify-after.mjs',
        NATIVE_AFTER.folder,
        '--historical',
      ],
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    ).trim(),
  );
  assert.equal(nativeAfterValidation.status, 'CPU_AFTER_ONLY_PASS');
  assert.equal(nativeAfterValidation.sourceHash, NATIVE_AFTER.sourceHash);
  assert.equal(nativeAfterValidation.physicalParity, true);
  assert.equal(nativeAfterValidation.cleanup, true);
  const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
    native = await readFile(nativePath),
    nativeArchivePath = evidence + '/native/rapier.mjs';
  await mkdir(dirname(nativeArchivePath), { recursive: true });
  await writeFile(nativeArchivePath, native, { flag: 'wx' });
  const sourceArchivedAt = new Date().toISOString();
  const output = resolve('.pbi-validation-030/build-synthetic-diagnostic-05');
  await build({
    configFile: false,
    root: resolve('tests/browser/vehicle-recovery-synthetic-diagnostic-v5'),
    base: './',
    cacheDir: resolve('.pbi-validation-030/cache-synthetic-diagnostic-05'),
    build: {
      outDir: output,
      emptyOutDir: false,
      rollupOptions: {
        input: resolve('tests/browser/vehicle-recovery-synthetic-diagnostic-v5/browser.html'),
      },
    },
  });
  const artifacts = [],
    artifact = createHash('sha256');
  for (const file of (await readdir(output, { recursive: true })).sort()) {
    if (!(await stat(resolve(output, file))).isFile()) continue;
    const path = file.replaceAll('\\', '/'),
      bytes = await readFile(resolve(output, file));
    artifacts.push({ path, bytes: bytes.length, sha256: hash(bytes) });
    artifact.update(path).update(bytes);
    await mkdir(dirname(artifactRoot + '/' + path), { recursive: true });
    await writeFile(artifactRoot + '/' + path, bytes, { flag: 'wx' });
  }
  for (const row of inputs)
    assert.equal(hash(await readFile(row.path)), row.sha256, 'Sourcechanged during build');
  assert.equal(hash(await readFile(nativePath)), hash(native));
  await mkdir(functionalRoot, { recursive: false });
  await mkdir(captureRoot, { recursive: false });
  const zipPath = evidence + '/whole-archive.zip';
  const quoted = (path) => "'" + resolve(path).replaceAll("'", "''") + "'";
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -LiteralPath @(${[archiveRoot, artifactRoot, evidence + '/native'].map(quoted).join(',')}) -DestinationPath ${quoted(zipPath)} -CompressionLevel Optimal -ErrorAction Stop`,
  ]);
  const zipBytes = await readFile(zipPath);
  const budget = JSON.parse(await readFile('Docs/performance-budgets.json'));
  const manifest = {
    version: '030-frozen-after-v1',
    fixtureRevision: '030-SYNTHETIC_DIAGNOSTIC_ONLY-v5',
    buildUUID: randomUUID(),
    commit,
    startedAt,
    sourceArchivedAt,
    archivedAt: new Date().toISOString(),
    sourceHash,
    artifactHash: artifact.digest('hex'),
    nativeHash: hash(native),
    nativeBytes: native.length,
    nativePath,
    nativeArchivePath,
    archiveRoot,
    artifactRoot,
    captureRoot,
    functionalRoot,
    inputs,
    artifacts,
    zip: { path: zipPath, bytes: zipBytes.length, sha256: hash(zipBytes) },
    budgets: budget.proposedBudgets.desktop,
    reference: {
      browserManifest:
        'Docs/Evidence/030-vehicle-recovery/browser-before-20261006T132157019Z/build-manifest.json',
      sourceHash: '6c203fb949dcd26c1074e91f344cfbf7cc4563f631205045d117bc4d4a1dc594',
      artifactHash: '00309f0f8140ed9d3e5735dbe64480a03d0900298f60b184892f0f45de63a54e',
      nativeBeforeSourceHash: 'e7e5241caa9ef9c5ac1a27460defc9de679a86de3c6a3287eb8409fe3e27d755',
      nativeAfter: nativeAfterBinding,
    },
    physicalAcceptance: false,
    performanceAcceptance: false,
    scope:
      'SYNTHETIC DOM diagnostic only; actual030 gameplay/005/native matrix retained, isTrusted=false. No physical/performance acceptance; original V4 trust proof unchanged.',
  };
  await writeFile(evidence + '/build-manifest.json', JSON.stringify(manifest, null, 2), {
    flag: 'wx',
  });
  console.log(
    JSON.stringify({
      manifestPath: evidence + '/build-manifest.json',
      sourceHash,
      artifactHash: manifest.artifactHash,
      nativeHash: manifest.nativeHash,
      inputs: inputs.length,
      artifacts: artifacts.length,
      zip: manifest.zip,
    }),
  );
} catch (error) {
  let exportError;
  try {
    await writeFile(
      evidence + '/build-failure.json',
      JSON.stringify({
        failedAt: new Date().toISOString(),
        sourceHash,
        message: String(error),
        stack: String(error.stack),
      }),
      { flag: 'wx' },
    );
  } catch (e) {
    exportError = e;
  }
  if (exportError) throw new AggregateError([error, exportError], 'Build/failureexportbothfailed');
  throw error;
}
