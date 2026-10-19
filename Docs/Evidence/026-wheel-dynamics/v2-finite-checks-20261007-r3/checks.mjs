import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const cwd = 'F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01';
const out = resolve(cwd, 'Docs/Evidence/026-wheel-dynamics/v2-finite-checks-20261007-r3');
const handoff = 'Docs/Evidence/026-wheel-dynamics/v2-source-handoff-20261007-r2';
const require = createRequire(resolve(cwd, 'package.json'));
const json = path => JSON.parse(readFileSync(resolve(cwd, path), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const save = (name, value) => writeFileSync(join(out, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const files = json(`${handoff}/source-files.json`).sourceFiles.map(item => item.path);
function inventory(paths) { return paths.map(path => { const bytes = readFileSync(resolve(cwd, path)); return { path, bytes: bytes.length, sha256: digest(bytes) }; }); }
function records(value, paths = []) { if (Array.isArray(value)) value.forEach(item => records(item, paths)); else if (value && typeof value === 'object') { if (typeof value.path === 'string' && typeof value.sha256 === 'string') paths.push(value.path); Object.values(value).forEach(item => records(item, paths)); } return paths; }
function tree(path) { return readdirSync(resolve(cwd, path), { withFileTypes: true }).flatMap(item => item.isDirectory() ? tree(`${path}/${item.name}`) : [`${path}/${item.name}`]); }
function originals() { return inventory([...new Set([...tree(handoff), ...tree('Docs/Evidence/026-wheel-dynamics/v2-source-handoff-20261007'), ...records(json(`${handoff}/native-closure.json`)), ...records(json(`${handoff}/preserved-originals.json`)), ...json(`${handoff}/source-files.json`).readOnlyReferences.map(item => item.path)])].sort()); }
function run(label, args) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120000 });
  save(`${label}.stdout.txt`, result.stdout ?? ''); save(`${label}.stderr.txt`, result.stderr ?? '');
  const metadata = { label, command: process.execPath, args, cwd, startedAt, endedAt: new Date().toISOString(), pid: result.pid, exit: result.status, signal: result.signal, error: result.error ? String(result.error) : null };
  save(`${label}.json`, metadata); console.log(JSON.stringify(metadata));
  if (result.status !== 0) process.exitCode = 1;
  return result.status;
}
function cli(pkg, bin) { const path = require.resolve(`${pkg}/package.json`), info = JSON.parse(readFileSync(path, 'utf8')); return resolve(dirname(path), typeof info.bin === 'string' ? info.bin : info.bin[bin]); }
const action = process.argv[2];
if (action === 'before') {
  save('before.json', { at: new Date().toISOString(), cwd, pid: process.pid, source: inventory(files), originals: originals(), installed: ['prettier','typescript','eslint'].map(pkg => ({ pkg, path: require.resolve(`${pkg}/package.json`), version: require(`${pkg}/package.json`).version })) });
} else if (action === 'format') {
  run('format-first', [cli('prettier'), '--check', ...files]);
} else if (action === 'format-fix') {
  run('format-write', [cli('prettier'), '--write', ...files]);
  run('format-after', [cli('prettier'), '--check', ...files]);
} else if (action === 'lint') {
  run(`lint-${process.argv[3] ?? 'first'}`, [cli('eslint','eslint'), '--config', join(out,'eslint.config.mjs'), '--max-warnings','0', ...files.filter(file => /\.(mjs|ts|mts)$/.test(file))]);
} else if (action === 'types') {
  run('types-main-first', [cli('typescript','tsc'), '--noEmit', '-p', 'tsconfig.json']);
  run('types-tests-first', [cli('typescript','tsc'), '--noEmit', '-p', 'tsconfig.tests.json']);
} else if (action === 'syntax') {
  for (const [index, file] of files.filter(file => file.endsWith('.mjs')).entries()) run(`syntax-${index}`, ['--check', file]);
  run('architecture-first', ['scripts/verify-architecture.mjs']);
} else if (action === 'test') {
  const suite = process.argv[3];
  const args = suite === 'device-loss' ? ['--import', pathToFileURL(resolve(cwd,'scripts/register-typescript.mjs')).href] : [];
  run(`test-${suite}-${process.argv[4] ?? 'first'}`, [...args, '--test', `tests/browser/wheel-dynamics-v2/${suite}.test.mjs`]);
} else if (action === 'after') {
  const before = json(`${out}/before.json`), after = originals(), source = inventory(files);
  const declared = [];
  function verifyRecords(value, origin) {
    if (Array.isArray(value)) value.forEach(item => verifyRecords(item,origin));
    else if (value && typeof value === 'object') {
      if (typeof value.path === 'string' && typeof value.sha256 === 'string' && typeof value.bytes === 'number') {
        const actual = inventory([value.path])[0];
        declared.push({ origin, expected: {path:value.path,bytes:value.bytes,sha256:value.sha256}, actual, ownedMutable: files.includes(value.path), matches:actual.bytes === value.bytes && actual.sha256 === value.sha256 });
      }
      Object.values(value).forEach(item => verifyRecords(item,origin));
    }
  }
  for (const name of ['source-files','consumed-closure','native-closure','preserved-originals','handoff-index']) verifyRecords(json(`${handoff}/${name}.json`),name);
  const sourceHasher = createHash('sha256');
  for (const file of files) sourceHasher.update(file).update(readFileSync(resolve(cwd,file)));
  const sourceHash = sourceHasher.digest('hex');
  save('after.json', { at: new Date().toISOString(), cwd, originals: after, originalsEqual: JSON.stringify(after) === JSON.stringify(before.originals), source, sourceInventoryHash: digest(Buffer.from(JSON.stringify(source))), sourceHash, sourceHashScope:'Ordered 21 owned source files only; not runtime/build identity', changes: source.filter((item,index) => item.sha256 !== before.source[index].sha256), declared, immutableMetadataMatches:declared.filter(item => !item.ownedMutable).every(item => item.matches) });
  mkdirSync(join(out,'source'), {recursive:true});
  for (const file of files) {
    const destination=join(out,'source',file); mkdirSync(dirname(destination),{recursive:true});
    writeFileSync(destination,readFileSync(resolve(cwd,file)),{flag:'wx'});
  }
  save('future-exact-paths.txt', tree('Docs/Evidence/026-wheel-dynamics/v2-finite-checks-20261007-r3').concat(['Docs/Evidence/026-wheel-dynamics/v2-finite-checks-20261007-r3/future-exact-paths.txt']).sort().join('\n')+'\n');
} else if (action === 'final-format') {
  run('format-scoped-fix', [cli('prettier'), '--write', 'tests/browser/wheel-dynamics-v2/numeric-reader.mjs']);
  run('format-final', [cli('prettier'), '--check', ...files]);
}
