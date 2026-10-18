// SOURCE build-only proposal. No server/native/browser start; execute only after parent grant.
import { build } from 'vite';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir, stat, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
for (const path of [
  'src/vehicles/recovery-state.ts',
  'src/vehicles/recovery-port.ts',
  '.pbi-validation-030/browser-before',
])
  await missing(path);
const stamp = new Date().toISOString().replace(/[^0-9TZ]/g, '');
const evidence = 'Docs/Evidence/030-vehicle-recovery/browser-before-' + stamp,
  archiveRoot = evidence + '/source',
  artifactRoot = evidence + '/artifacts',
  captureRoot = evidence + '/captures';
const hash = (b) => createHash('sha256').update(b).digest('hex');
await mkdir(evidence, { recursive: false });
await writeFile(evidence + '/.gitattributes', '* -text\n', { flag: 'wx' });
const startedAt = new Date().toISOString();
await writeFile(
  evidence + '/build-started.json',
  JSON.stringify({ commit, startedAt, scope: 'PRE030_CHRONOLOGICAL_BROWSER_BEFORE' }),
  { flag: 'wx' },
);
let sourceHash = null;
try {
  const paths = execFileSync('rg', ['--files', 'src', 'tests/browser/vehicle-recovery'], {
    encoding: 'utf8',
  })
    .trim()
    .split(/\r?\n/)
    .map((p) => p.replaceAll('\\', '/'));
  paths.push(
    'tests/vehicles/recovery-browser-observation.test.mjs',
    'tests/vehicles/recovery-browser-boundaries.test.mjs',
    'tests/browser/vehicle-damage/hardware-collector.ts',
    'tests/browser/vehicle-damage/hardware-lifetime.ts',
    'scripts/register-typescript.mjs',
    'package.json',
    'package-lock.json',
    'Docs/performance-budgets.json',
  );
  const inputs = [],
    source = createHash('sha256');
  for (const path of [...new Set(paths)].sort()) {
    const bytes = await readFile(path),
      gitBlob = execFileSync('git', ['hash-object', '--path=' + path, path], {
        encoding: 'utf8',
      }).trim();
    if (path.startsWith('src/'))
      assert.equal(
        gitBlob,
        execFileSync('git', ['rev-parse', commit + ':' + path], { encoding: 'utf8' }).trim(),
        'Actualad32production ' + path,
      );
    inputs.push({ path, bytes: bytes.length, sha256: hash(bytes), gitBlob });
    source.update(path).update(bytes);
    const target = archiveRoot + '/' + path;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }
  sourceHash = source.digest('hex');
  const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')),
    native = await readFile(nativePath),
    nativeArchivePath = evidence + '/native/rapier.mjs';
  await mkdir(dirname(nativeArchivePath), { recursive: true });
  await writeFile(nativeArchivePath, native, { flag: 'wx' });
  const sourceArchivedAt = new Date().toISOString();
  const output = resolve('.pbi-validation-030/browser-before');
  await build({
    configFile: false,
    root: resolve('tests/browser/vehicle-recovery'),
    base: './',
    cacheDir: resolve('.pbi-validation-030/cache'),
    build: {
      outDir: output,
      emptyOutDir: false,
      rollupOptions: { input: resolve('tests/browser/vehicle-recovery/browser.html') },
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
    version: '030-frozen-before-v1',
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
    inputs,
    artifacts,
    zip: { path: zipPath, bytes: zipBytes.length, sha256: hash(zipBytes) },
    budgets: budget.proposedBudgets.desktop,
    scope:
      'Actualad32 mixedclasses/contact/road reference; NO030production. BEFORE10runs/backend OFFON30/120; CPU baseline supplemental; optionalGPUinput notmeasured; JSproxy memory only.',
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
