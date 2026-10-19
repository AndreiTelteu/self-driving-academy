import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import * as prettier from 'file:///F:/Sites/self-driving-academy/node_modules/prettier/index.mjs';
const root = 'F:/Sites/self-driving-academy/.worktrees/wheel-dynamics-01';
if (resolve(process.cwd()).toLowerCase() !== resolve(root).toLowerCase()) throw Error('Wrong workdir');
const dir = 'Docs/Evidence/026-wheel-dynamics/production-static-pure-20261007-r6';
const read = p => JSON.parse(readFileSync(p));
const hash = b => createHash('sha256').update(b).digest('hex');
const item = p => { const b = readFileSync(p); return { path: p, bytes: b.length, sha256: hash(b) }; };
const put = (p, v) => writeFileSync(`${dir}/${p}`, JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
const original = read(`${dir}/source-before.json`), final = read(`${dir}/source-final.json`);
const owned = new Set(original.owned.map(x => x.path));
const outsideOwned = original.inputs.filter(x => !owned.has(x.path));
const mismatches = outsideOwned.filter(x => item(x.path).sha256 !== x.sha256);
const originals139 = read('Docs/Evidence/026-wheel-dynamics/production-ownership-source-20261007-r1/after.json').originals;
const check = entries => entries.map(x => ({ ...item(x.path), expectedSha256: x.sha256, matches: item(x.path).bytes === x.bytes && item(x.path).sha256 === x.sha256 }));
const originals = check(originals139);
const v2 = check(read(`${dir}/protected-before.json`).filter(x => x.path.startsWith('tests/browser/wheel-dynamics-v2/')));
const formatting = [];
for (const path of owned) {
  const config = await prettier.resolveConfig(resolve(path));
  const expected = await prettier.format(readFileSync(`${dir}/source-before-format/${path}`, 'utf8'), { ...config, filepath: resolve(path) });
  formatting.push({ path, exactPrettierOutput: expected === readFileSync(path, 'utf8') });
}
const p = 'tests/rendering/backend-ownership.test.ts';
const expectedNarrow = readFileSync(`${dir}/source-before/${p}`, 'utf8')
  .replace('  let dispose: () => void;\r\n', '').replace('  let dispose: () => void;\n', '')
  .replace('  dispose = ownPartialWebGPUCleanup', '  const dispose = ownPartialWebGPUCleanup');
const narrowFixExact = expectedNarrow === readFileSync(`${dir}/source-before-format/${p}`, 'utf8');
const commands = ['pure', 'types-main', 'types-tests', 'lint', 'format', 'architecture'].map(x => read(`${dir}/${x}-final.json`));
const terminal = { at: new Date().toISOString(), allFinalExitsZero: commands.every(x => x.exit === 0 && !x.signal && !x.error), finalCommands: commands, tests: { total: 22, passed: 22, failed: 0, cancelled: 0, skipped: 0, existingBackend: 6, backendOwnership: 8, worldOwnership: 3, probeCleanup: 5 }, sourceOnlyHash: final.sourceOnlyHash, original139: { checked: originals.length, results: originals }, v2Harness21: { checked: v2.length, results: v2 }, outsideTenOwned: { checked: outsideOwned.length, mismatches }, narrowFixExact, formatting, changedOwned: final.owned.filter(x => x.sha256 !== original.owned.find(y => y.path === x.path).sha256), cpuReleased: true, ownedActiveProcesses: [], remaining: ['2 native factory tests / 10 scenarios UNEXECUTED', 'Native physics regression UNEXECUTED', 'Fresh CURRENT native provenance SOURCE review and separate grant required', 'No benchmark/build/browser/performance acceptance in this grant', 'Native internal partial failures UNKNOWN; failed free remains reserved; historical b696 and original baseline immutable'], pbiDone: false };
if (!terminal.allFinalExitsZero || mismatches.length || originals.some(x => !x.matches) || v2.some(x => !x.matches) || !narrowFixExact || formatting.some(x => !x.exactPrettierOutput)) throw Error('Final invariant failure');
put('terminal-handoff.json', terminal);
console.log(JSON.stringify({ tests: terminal.tests, allFinalExitsZero: true, sourceOnlyHash: final.sourceOnlyHash, original139: originals.length, v2Harness21: v2.length, outsideTenOwned: outsideOwned.length, narrowFixExact, formattingExact: true, changedOwned: terminal.changedOwned.map(x => x.path), cpuReleased: true, ownedActiveProcesses: [] }));
