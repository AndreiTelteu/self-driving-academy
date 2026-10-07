import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = 'F:/Sites/self-driving-academy/.worktrees/vehicle-recovery-01';
assert.equal(process.cwd().replaceAll('\\', '/'), root);
assert.equal(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim().replaceAll('\\', '/'), root);
assert.equal(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), 'loop-pbi/vehicle-recovery-01');
const ns = 'Docs/Evidence/030-vehicle-recovery/native-calibration-checks-04';
await mkdir(ns);
const archiveStartedAt = new Date().toISOString();
const paths = execFileSync('rg', ['--files', 'src', 'tests'], { encoding: 'utf8' }).trim().split(/\r?\n/).map(path => path.replaceAll('\\', '/'));
paths.push('scripts/register-typescript.mjs', 'package.json', 'tsconfig.json', 'tsconfig.tests.json',
  'Docs/Evidence/030-vehicle-recovery/run-native-calibration-04.mjs');
const files = [], combined = createHash('sha256');
for (const path of [...new Set(paths)].sort()) {
  const bytes = await readFile(path), archived = `${ns}/source-before/${path}`;
  await mkdir(dirname(archived), { recursive: true });
  await writeFile(archived, bytes, { flag: 'wx' });
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  combined.update(path).update(bytes);
  files.push({ path, archived, bytes: bytes.length, sha256 });
}
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat'));
const nativeBytes = await readFile(nativePath), nativeHash = createHash('sha256').update(nativeBytes).digest('hex');
assert.equal(nativeHash, '02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0');
assert.equal(nativeBytes.length, 4340292);
await mkdir(`${ns}/native`);
await writeFile(`${ns}/native/rapier.mjs`, nativeBytes, { flag: 'wx' });
const archiveCompletedAt = new Date().toISOString();
await writeFile(`${ns}/source-native-before-world.json`, JSON.stringify({
  archiveStartedAt, archiveCompletedAt, sourceHash: combined.digest('hex'), files,
  native: { installed: nativePath, archived: `${ns}/native/rapier.mjs`, bytes: nativeBytes.length, sha256: nativeHash },
  firstWorldExecution: 'NOT_STARTED_AT_ARCHIVE_COMPLETION', scope: 'FINITE_NATIVE_UNIT_AND_CALIBRATION_NOT_BENCHMARK_OR_BROWSER',
}, null, 2), { flag: 'wx' });
const args = ['--import', './scripts/register-typescript.mjs', '--test-concurrency=1', '--test',
  'tests/vehicles/recovery-native.test.ts', 'tests/vehicles/recovery-functional-native.test.ts',
  'tests/vehicles/recovery-support-calibration.test.ts'];
let stdout = '', stderr = '', exit = 0;
const startedAt = new Date().toISOString();
try {
  const result = await promisify(execFile)(process.execPath, args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  stdout = result.stdout; stderr = result.stderr;
} catch (error) {
  stdout = error.stdout ?? ''; stderr = error.stderr ?? String(error); exit = Number.isInteger(error.code) ? error.code : 1;
}
const finishedAt = new Date().toISOString();
await writeFile(`${ns}/native-04.stdout.txt`, stdout, { flag: 'wx' });
await writeFile(`${ns}/native-04.stderr.txt`, stderr, { flag: 'wx' });
await writeFile(`${ns}/native-04.json`, JSON.stringify({ command: process.execPath, args, workdir: root,
  archiveCompletedAt, startedAt, finishedAt, exit }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ ns, archiveCompletedAt, startedAt, finishedAt, exit, sourceInputs: files.length, nativeHash }));
process.exitCode = exit;
