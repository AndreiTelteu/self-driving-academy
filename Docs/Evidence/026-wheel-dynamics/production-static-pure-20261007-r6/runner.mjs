import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = 'F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01';
if (resolve(process.cwd()).toLowerCase() !== resolve(root).toLowerCase()) throw Error('Wrong workdir');
const evidence = 'Docs/Evidence/026-wheel-dynamics/production-static-pure-20261007-r6';
const r2 = JSON.parse(readFileSync('Docs/Evidence/026-wheel-dynamics/production-disposal-source-20261007-r2/after.json'));
const owned = r2.owned.map(x => x.path).sort();
const node = 'C:/Program Files/nodejs/node.exe';
const bin = 'F:/Sites/self-driving-academy/node_modules/';
const commands = {
  pure: ['--import', './scripts/register-typescript.mjs', '--test', '--test-concurrency=1', 'tests/rendering/backend.test.ts', 'tests/rendering/backend-ownership.test.ts', 'tests/vehicles/world-ownership.test.ts', 'tests/vehicles/probe-cleanup.test.ts'],
  'types-main': [bin + 'typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json'],
  'types-tests': [bin + 'typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.tests.json'],
  architecture: ['scripts/verify-architecture.mjs'],
  lint: [bin + 'eslint/bin/eslint.js', ...owned, '--max-warnings', '0'],
  format: [bin + 'prettier/bin/prettier.cjs', '--check', ...owned],
  'format-write': [bin + 'prettier/bin/prettier.cjs', '--write', ...owned],
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const item = path => { const bytes = readFileSync(path); return { path, bytes: bytes.length, sha256: hash(bytes) }; };
const put = (name, value) => writeFileSync(`${evidence}/${name}`, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]); }
function aggregate(paths) { const h = createHash('sha256'); for (const p of paths.slice().sort()) h.update(p).update(readFileSync(p)); return h.digest('hex'); }
function snapshot(name) {
  const paths = [...new Set([...walk('src'), ...walk('tests'), ...walk('scripts')].filter(p => /\.(ts|mts|mjs|json)$/.test(p)).concat(['package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.tests.json', 'eslint.config.js', '.prettierrc.json'].filter(existsSync)))].sort();
  for (const p of paths) { const target = `${evidence}/${name}/${p}`; mkdirSync(dirname(target), { recursive: true }); copyFileSync(p, target); }
  put(`${name}.json`, { at: new Date().toISOString(), owned: owned.map(item), sourceOnlyHash: aggregate(owned), hashScope: 'Sorted ten owned UTF8 paths followed by raw bytes; SOURCE ONLY, no build/native identity', inputs: paths.map(item) });
}
const mode = process.argv[2];
if (mode === 'prepare') {
  const originals = JSON.parse(readFileSync('Docs/Evidence/026-wheel-dynamics/v2-source-handoff-20261007-r2/preserved-originals.json'));
  const verify = entries => entries.map(x => ({ ...item(x.path), expectedSha256: x.sha256, matches: item(x.path).sha256 === x.sha256 && item(x.path).bytes === x.bytes }));
  const checks = { original139: verify(originals), r2Protected304: verify(r2.protected), ownedMatchesR2: verify(r2.owned) };
  put('prior-manifest-check.json', checks);
  if (Object.values(checks).some(a => a.some(x => !x.matches))) throw Error('Prior manifest mismatch');
  const protectedPaths = [...new Set(walk('Docs/Evidence/026-wheel-dynamics').filter(p => !p.startsWith(evidence + '/')).concat(walk('tests/browser/wheel-dynamics-v2')))].sort();
  put('protected-before.json', protectedPaths.map(item));
  snapshot('source-before');
  put('commands-before.json', { at: new Date().toISOString(), workdir: root, executable: item(node), tools: ['typescript/bin/tsc', 'eslint/bin/eslint.js', 'prettier/bin/prettier.cjs'].map(p => item(bin + p)), commands, execution: 'spawnSync, explicit cwd, shell false, 60s timeout, raw stdout/stderr buffers; sequential CPU static/pure grant only' });
  console.log(JSON.stringify({ prepared: true, protectedFiles: protectedPaths.length, sourceOnlyHash: aggregate(owned), original139: checks.original139.length, r2Protected304: checks.r2Protected304.length }));
} else if (mode === 'snapshot') {
  snapshot(process.argv[3]);
  console.log(aggregate(owned));
} else if (mode === 'run') {
  const command = process.argv[3], label = process.argv[4];
  if (!commands[command] || !/^[a-z0-9-]+$/.test(label)) throw Error('Invalid command/label');
  if (existsSync(`${evidence}/${label}.json`)) throw Error('Immutable label exists');
  const start = new Date().toISOString(), clock = performance.now();
  const result = spawnSync(node, commands[command], { cwd: root, shell: false, windowsHide: true, encoding: null, timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  const end = new Date().toISOString(), elapsedMs = performance.now() - clock;
  writeFileSync(`${evidence}/${label}.stdout.txt`, result.stdout ?? Buffer.alloc(0), { flag: 'wx' });
  writeFileSync(`${evidence}/${label}.stderr.txt`, result.stderr ?? Buffer.alloc(0), { flag: 'wx' });
  const record = { executable: node, args: commands[command], workdir: root, start, end, elapsedMs, exit: result.status, signal: result.signal, error: result.error ? String(result.error) : null, sourceOnlyHash: aggregate(owned), stdout: item(`${evidence}/${label}.stdout.txt`), stderr: item(`${evidence}/${label}.stderr.txt`) };
  put(`${label}.json`, record);
  console.log(JSON.stringify(record));
  console.log((result.stdout ?? '').toString());
  console.error((result.stderr ?? '').toString());
  process.exitCode = result.status ?? 1;
} else if (mode === 'verify') {
  const before = JSON.parse(readFileSync(`${evidence}/protected-before.json`));
  const mismatches = before.filter(x => { const current = item(x.path); return current.bytes !== x.bytes || current.sha256 !== x.sha256; });
  put('protected-after.json', { at: new Date().toISOString(), checked: before.length, mismatches, files: before.map(x => item(x.path)) });
  console.log(JSON.stringify({ checked: before.length, mismatches, sourceOnlyHash: aggregate(owned) }));
  if (mismatches.length) process.exitCode = 1;
} else throw Error('Invalid mode');
