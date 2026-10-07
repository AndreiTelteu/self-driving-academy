// Execute only after final source review + explicit coordinator CPU grant. No browser/server starts here.
import { build } from 'vite';
import { createScanner, SyntaxKind } from 'typescript/unstable/ast';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
assert.equal(process.cwd(), 'F:\\Sites\\self-driving-academy\\.worktrees\\vehicle-damage-01');
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/vehicle-damage-01',
);
const expectedCommit = 'bf78ad85bb0b32e63d065e663829c6aa8cad2fb1';
assert.equal(
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  expectedCommit,
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const proofPath = 'Docs/Evidence/029-vehicle-damage/reference-provenance.json';
const proofBytes = await readFile(proofPath),
  proof = JSON.parse(proofBytes);
assert.equal(proof.publishedCommit, 'f1c6428034c1d52ae0eb3e88857fb6f61ffd43ce');
assert.equal(proof.allPublishedRuntimeSourcesMatched, true);
assert.equal(proof.inputs.length, 22);
for (const input of proof.inputs) {
  const bytes = await readFile(input.archivePath);
  assert.equal(bytes.length, input.executedBytes);
  assert.equal(hash(bytes), input.executedSha256);
  const published = execFileSync('git', ['show', `${proof.publishedCommit}:${input.path}`], {
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(hash(published), input.gitBlobSha256);
  assert.equal(
    hash(Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'))),
    hash(Buffer.from(published.toString('utf8').replaceAll('\r\n', '\n'))),
  );
}
const consumed = new Set();
async function consume(path) {
  const absolute = resolve(path);
  if (consumed.has(absolute)) return;
  consumed.add(absolute);
  if (!['.ts', '.mjs', '.js'].includes(extname(absolute))) return;
  const scanner = createScanner(true);
  scanner.setText(await readFile(absolute, 'utf8'));
  const tokens = [];
  while (scanner.scan() !== SyntaxKind.EndOfFile)
    tokens.push({
      text: scanner.getTokenText(),
      kind: scanner.getToken(),
      value: scanner.getTokenValue(),
    });
  for (let index = 0; index < tokens.length; index++) {
    if (
      tokens[index].kind !== SyntaxKind.StringLiteral ||
      !['from', 'import'].includes(tokens[index - 1]?.text)
    )
      continue;
    let start = index - 1;
    while (start >= 0 && !['import', 'export', ';'].includes(tokens[start].text)) start--;
    if (start < 0 || !['import', 'export'].includes(tokens[start].text)) continue;
    const clause = tokens.slice(start + 1, index - 1).map((token) => token.text);
    if (clause[0] === 'type') continue;
    if (clause[0] === '{' && clause.at(-1) === '}') {
      const entries = clause
        .slice(1, -1)
        .join(' ')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (entries.length && entries.every((value) => /^type\s+(?!as\b)\S+/.test(value))) continue;
    }
    const specifier = tokens[index].value;
    if (!specifier.startsWith('.')) continue;
    const target = resolve(dirname(absolute), specifier.split('?')[0]);
    const candidate = [target, `${target}.ts`, resolve(target, 'index.ts')].find(
      (file) => existsSync(file) && extname(file),
    );
    assert.ok(candidate, `Unresolved runtime:${absolute}:${specifier}`);
    await consume(candidate);
  }
}
await consume('tests/browser/vehicle-damage/hardware-entry.ts');
await consume('tests/browser/vehicle-damage/hardware-server.mjs');
await consume('tests/browser/vehicle-damage/verify-hardware.mjs');
await consume('tests/browser/vehicle-damage/verify-functional.mjs');
const paths = [...consumed].map((path) => relative(resolve('.'), path).replaceAll('\\', '/'));
//Conservative frozen provenance closure includes every published file proven above, including re-export surfaces.
paths.push(...proof.inputs.map((input) => input.archivePath));
paths.push(
  proofPath,
  'tests/browser/vehicle-damage/hardware.html',
  'tests/browser/vehicle-damage/prepare-hardware-build.mjs',
  'tests/browser/vehicle-damage/prepare-hardware-reference.mjs',
  'tests/browser/vehicle-damage/verify-hardware.mjs',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
const unique = [...new Set(paths)].sort();
for (const path of unique) assert.ok(!path.startsWith('../') && !path.includes(':'));
const stamp = new Date().toISOString().replace(/[^0-9TZ]/g, '');
const evidence = `Docs/Evidence/029-vehicle-damage/hardware-${stamp}`,
  archiveRoot = `${evidence}/source`,
  artifactRoot = `${evidence}/artifacts`,
  captureRoot = `${evidence}/captures`;
await mkdir(evidence, { recursive: false });
await writeFile(`${evidence}/.gitattributes`, '* -text\n', { flag: 'wx' });
const inputs = [],
  source = createHash('sha256');
for (const path of unique) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  await mkdir(dirname(`${archiveRoot}/${path}`), { recursive: true });
  await writeFile(`${archiveRoot}/${path}`, bytes, { flag: 'wx' });
}
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')).replace(
    /rapier\.cjs$/,
    'rapier.mjs',
  ),
  native = await readFile(nativePath),
  nativeArchivePath = `${evidence}/native/rapier.mjs`;
await mkdir(dirname(nativeArchivePath), { recursive: true });
await writeFile(nativeArchivePath, native, { flag: 'wx' });
const sourceHash = source.digest('hex');
try {
  const output = resolve(`.pbi-validation-029/hardware-${stamp}`);
  await build({
    configFile: false,
    root: resolve('tests/browser/vehicle-damage'),
    base: './',
    cacheDir: resolve('.pbi-validation-029/hardware-cache'),
    build: {
      outDir: output,
      emptyOutDir: false,
      rollupOptions: { input: resolve('tests/browser/vehicle-damage/hardware.html') },
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
    await mkdir(dirname(`${artifactRoot}/${path}`), { recursive: true });
    await writeFile(`${artifactRoot}/${path}`, bytes, { flag: 'wx' });
  }
  await mkdir(captureRoot, { recursive: false });
  const manifest = {
    version: '029-frozen-hardware-build-v1',
    commit: expectedCommit,
    publishedReferenceCommit: proof.publishedCommit,
    sourceHash,
    artifactHash: artifact.digest('hex'),
    nativeHash: hash(native),
    nativeBytes: native.length,
    nativePath,
    nativeArchivePath,
    referenceProvenanceHash: hash(proofBytes),
    inputs,
    artifacts,
    archiveRoot,
    artifactRoot,
    captureRoot,
    archivedAt: new Date().toISOString(),
    scope:
      'Separate published027/current029 hardware control, both027opt-in. Original CPU baseline/historical failures unchanged.',
  };
  for (const input of inputs)
    assert.equal(hash(await readFile(input.path)), input.sha256, 'Source changed during build');
  await writeFile(`${evidence}/build-manifest.json`, JSON.stringify(manifest, null, 2), {
    flag: 'wx',
  });
  console.log(
    JSON.stringify({
      manifestPath: `${evidence}/build-manifest.json`,
      sourceHash,
      artifactHash: manifest.artifactHash,
      nativeHash: manifest.nativeHash,
      inputs: inputs.length,
      artifacts: artifacts.length,
    }),
  );
} catch (error) {
  await writeFile(
    `${evidence}/build-failure.json`,
    JSON.stringify({ failedAt: new Date().toISOString(), sourceHash, error: String(error) }),
    { flag: 'wx' },
  );
  throw error;
}
