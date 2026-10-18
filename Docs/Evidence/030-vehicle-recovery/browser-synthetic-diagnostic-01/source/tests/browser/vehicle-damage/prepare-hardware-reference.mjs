// Preparation source only. Execute under a future parent CPU grant before build; no Git mutation.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const expectedRoot = 'F:\\Sites\\self-driving-academy\\.worktrees\\vehicle-damage-01';
assert.equal(process.cwd(), expectedRoot);
assert.equal(
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  'loop-pbi/vehicle-damage-01',
);
const published = 'f1c6428034c1d52ae0eb3e88857fb6f61ffd43ce';
const captureFolder = 'Docs/Evidence/027-braking-reverse';
const manifest = JSON.parse(await readFile(captureFolder + '/build-manifest.json', 'utf8'));
assert.equal(
  manifest.sourceHash,
  '11b8ea1e7217c40397928c225c559fa673b6118d13af16370df28362d9ee7609',
);
const sourcePaths = manifest.inputs.filter((path) =>
  /^src\/(vehicles|sessions|settings|input)\//.test(path),
);
assert.ok(
  sourcePaths.includes('src/vehicles/controller.ts') &&
    sourcePaths.includes('src/vehicles/drivetrain.ts'),
);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const semanticBytes = (bytes) => Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
const inputs = [];
for (const path of sourcePaths) {
  assert.ok(!path.includes('..') && !path.includes('\\') && !path.includes(':'));
  const archivePath = captureFolder + '/source-at-capture/' + path;
  const executed = await readFile(archivePath);
  const gitBlob = execFileSync('git', ['show', `${published}:${path}`], {
    maxBuffer: 16 * 1024 * 1024,
  });
  // EOL normalization is only an equality proof. Never rewrite archived/executed bytes.
  assert.equal(
    sha(semanticBytes(executed)),
    sha(semanticBytes(gitBlob)),
    `Published runtime source mismatch: ${path}`,
  );
  inputs.push({
    path,
    archivePath,
    executedBytes: executed.length,
    executedSha256: sha(executed),
    gitBlobBytes: gitBlob.length,
    gitBlobSha256: sha(gitBlob),
    byteIdentical: executed.equals(gitBlob),
    eolOnlyDifference: !executed.equals(gitBlob),
  });
}
const proof = {
  version: '029-published027-reference-v1',
  preparedAt: new Date().toISOString(),
  publishedCommit: published,
  captureCommit: manifest.commit,
  capturedSourceHash: manifest.sourceHash,
  sourceRoot: captureFolder + '/source-at-capture',
  allPublishedRuntimeSourcesMatched: true,
  inputs,
  limitations:
    'Git blob and executed archive byte identities are separate; EOL-only difference is explicitly recorded. Common rendering/native fixture and current source/build closure must also be frozen before hardware execution. This is a postimplementation hardware control, not replacement of original CPUbaseline.',
};
await writeFile(
  'Docs/Evidence/029-vehicle-damage/reference-provenance.json',
  JSON.stringify(proof, null, 2),
  { flag: 'wx' },
);
console.log(
  JSON.stringify({
    publishedCommit: published,
    files: inputs.length,
    eolOnly: inputs.filter((i) => i.eolOnlyDifference).length,
  }),
);
