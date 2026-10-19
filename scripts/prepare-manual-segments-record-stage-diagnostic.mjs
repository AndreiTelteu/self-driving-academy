// SOURCE draft. Preparation only; command does NOT launch a world/collector.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { verifyModuleClosure } from './manual-segments-archive-closure.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const expected = 'C:/Users/aandr/Sites/self-driving-academy/.worktrees/manual-segments-01';
const output = 'Docs/Evidence/069-manual-segments/record-stage-diagnostic-03';
const runtime = resolve('.pbi-validation-069/record-stage-diagnostic-03/runtime');
const observer = 'scripts/manual-segments-record-stage-observer.mjs';
const parserPin =
  'sha512-LpGDIYJAzc3Y3PT9x+FxBrGYu2PlWxLmyN7SwPTzaX0LSwEmFJBsRnPBqmaXF2r1v+Zhz6lNiEJ+7yKtM5+Ugg==';
export function exactReplace(source, from, to) {
  assert.equal(source.split(from).length - 1, 1, 'Exact derivation anchor');
  return source.replace(from, to);
}
export async function instrumentBody(source, method, stage) {
  const { parse } = await import('@babel/parser');
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript'],
    createImportExpressions: true,
  });
  const bodies = [];
  const pending = [ast];
  let visits = 0;
  while (pending.length) {
    assert(++visits < 100000);
    const n = pending.pop();
    if (!n || typeof n !== 'object') continue;
    if (
      (n.type === 'ObjectMethod' && n.key?.name === method) ||
      (n.type === 'FunctionDeclaration' && n.id?.name === method)
    )
      bodies.push(n.body);
    for (const [k, v] of Object.entries(n)) {
      if (['loc', 'comments', 'leadingComments', 'trailingComments', 'extra'].includes(k)) continue;
      if (Array.isArray(v)) {
        for (const x of v) {
          if (x && typeof x.type === 'string') pending.push(x);
        }
      } else if (v && typeof v.type === 'string') {
        pending.push(v);
      }
    }
  }
  assert.equal(bodies.length, 1, 'Unique method/function instrumentation');
  const b = bodies[0];
  return (
    source.slice(0, b.start + 1) +
    `\nreturn recordStage('${stage}', () => {` +
    source.slice(b.start + 1, b.end - 1) +
    '\n});\n' +
    source.slice(b.end - 1)
  );
}
export async function derive(path, source) {
  let changed = source;
  const stages = {
    'src/app/manual-segment-bridge.ts': ['step', 'bridge'],
    'src/telemetry/intervention-lifecycle.ts': ['appendSample', 'append'],
    'src/input/control-authority.ts': ['getStats', 'authorityStats'],
    'src/vehicles/controller.ts': ['getStats', 'controllerStats'],
  };
  if (stages[path]) changed = await instrumentBody(changed, ...stages[path]);
  if (path === 'src/telemetry/intervention-admission.ts') {
    changed = await instrumentBody(changed, 'interventionRecordBytes', 'bytewalk');
    changed = exactReplace(
      changed,
      'const record = parseInterventionSegment(value);',
      "const record = recordStage('parse005', () => parseInterventionSegment(value));",
    );
    changed = exactReplace(
      changed,
      'if (immutableParserResult(record))',
      "if (recordStage('immutability', () => immutableParserResult(record)))",
    );
    changed = exactReplace(
      changed,
      'if (admitted) return admitted;',
      "if (admitted) return recordStage('cachehit', () => admitted);",
    );
  }
  if (changed !== source) {
    let rel = relative(dirname(path), observer).replaceAll('\\', '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    changed = `import { recordStage } from '${rel}';\n` + changed;
  }
  if (path === 'scripts/manual-segments-after-records.mjs') {
    changed = exactReplace(
      changed,
      'for (const count of REFERENCE_PROTOCOL.populations)',
      'for (const count of [70])',
    );
    changed = exactReplace(
      changed,
      "  for (const classId of ['sedan', 'compact'])",
      '  for (const classId of [])',
    );
    changed = exactReplace(
      changed,
      '  for (const count of [70, 110])\n    for (let pair',
      '  for (const count of [70])\n    for (let pair',
    );
    changed = exactReplace(changed, '  populations: [70, 110],', '  populations: [70],');
    changed = exactReplace(changed, '  fleetWorlds: 20,', '  fleetWorlds: 10,');
    changed = exactReplace(changed, '  semanticWorlds: 4,', '  semanticWorlds: 0,');
    changed = exactReplace(
      changed,
      "    assert(record.distributions.tickMs.p95 <= 5.5, 'Normal tick absolute gate');",
      '    // DIAGNOSTIC: violation retained in final report, never accepted.',
    );
    changed = exactReplace(
      changed,
      "    assert(record.distributions.rapierMs.p95 <= 3, 'Normal Rapier absolute gate');",
      '    // DIAGNOSTIC: violation retained in final report, never accepted.',
    );
  }
  if (path === 'scripts/benchmark-manual-segments-after.mjs') {
    changed =
      "import {guardCopyRuntime} from './manual-segments-record-stage-guard.mjs';\nimport {resetStages,enterStages,finishStages} from './manual-segments-record-stage-observer.mjs';\n" +
      changed;
    changed = exactReplace(
      changed,
      "const folder = 'Docs/Evidence/069-manual-segments/native-after-10';",
      `const folder = '${output}/capture';`,
    );
    changed = exactReplace(
      changed,
      '  checkedProductReceipt: REUSE_PRODUCT_RECEIPT,',
      `  diagnosticRuntimeProof: JSON.parse(await readFile('${output}/runtime-proof.json')),\n  scopeDiagnostic: 'COPY_STAGE_DIAGNOSTIC_NOT_ACCEPTANCE',\n  checkedProductReceipt: REUSE_PRODUCT_RECEIPT,`,
    );
    changed = exactReplace(
      changed,
      'async function run(d) {',
      'async function run(d) {\n  resetStages(d.observer);\n  let stageExported=false;',
    );
    changed = exactReplace(
      changed,
      '    for (let tick = 1; tick <= 780; tick++) {',
      '\n    for (let tick = 1; tick <= 780; tick++) {\n      enterStages(d.observer,tick);',
    );
    changed = exactReplace(
      changed,
      '    progress.heap.afterMeasured = process.memoryUsage();',
      '    progress.heap.afterMeasured = process.memoryUsage();\n    await immutableJson(folder + "/worlds/world-" + d.ordinal + ".stages.json", finishStages());\n    stageExported=true;',
    );
    changed = exactReplace(
      changed,
      '  } finally {\n    if (failed && bridge !== null)',
      `  } finally {
    if(!stageExported){try{await immutableJson(folder+'/worlds/world-'+d.ordinal+'.stages.json',finishStages());stageExported=true;}catch(exportError){terminal=new AggregateError([...(failed?[terminal]:[]),exportError],'Primary/diagnostic-prefix export failure');failed=true;}}
    if (failed && bridge !== null)`,
    );
    // Stage files are separate owned channels; leave original inventory validator strict by reading
    // only the canonical execution records below instead of calling its old inventory helper.
    changed = exactReplace(
      changed,
      '  for (const d of descriptors()) await run(d);',
      '  guardCopyRuntime(); // BEFORE first native acquisition.\n  for (const d of descriptors()) await run(d);\n  guardCopyRuntime(); // AFTER final world cleanup.',
    );
    const start = changed.indexOf('  const records = await verifyInventory(folder, sourceHash);');
    const end = changed.indexOf('} catch (error) {', start);
    assert(start > 0 && end > start);
    changed =
      changed.slice(0, start) +
      `  const records=[];
  for(const d of descriptors()){const record=JSON.parse(await readFile(folder+'/worlds/world-'+d.ordinal+'.complete.json'));validateRecord(record,d,sourceHash);records.push(record);}
  assert.equal(records.length,10);
  for(let pair=0;pair<5;pair++){const arms=records.filter(r=>r.descriptor.pair===pair);assert.equal(arms.length,2);for(const f of ['nativeInputDigest','packetDigest','physicalDigest','rawInputDigest'])assert.equal(arms[0][f],arms[1][f]);assert.deepEqual(arms[0].checkpoints,arms[1].checkpoints);}
  await immutableJson(folder+'/complete.json',{status:'DIAGNOSTIC_COLLECTED_NOT_ACCEPTANCE',sourceHash,startedAt,archivedAt,firstWorldAt,completedAt:new Date().toISOString(),worlds:10,absoluteGateFlags:records.filter(r=>r.descriptor.observer).map(r=>({pair:r.descriptor.pair,tickP95:r.distributions.tickMs.p95,rapierP95:r.distributions.rapierMs.p95,normalTickViolation:r.distributions.tickMs.p95>5.5,normalRapierViolation:r.distributions.rapierMs.p95>3})),scope:'Nested observer timings; no originalbaseline replacement/performance acceptance'});
` +
      changed.slice(end);
  }
  return changed;
}
export async function prepare() {
  assert.equal(resolve('.').replaceAll('\\', '/'), expected);
  assert.equal(
    execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
    'loop-pbi/manual-segments-01',
  );
  assert.equal(
    execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    'd8e5756c9e06ab091587b58aa6549f2a977c30aa',
  );
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  assert.equal(lock.packages['node_modules/@babel/parser'].version, '8.0.6');
  assert.equal(lock.packages['node_modules/@babel/parser'].integrity, parserPin);
  const checked = JSON.parse(
    await readFile('Docs/Evidence/069-manual-segments/optimization-checks-01/results-final.json'),
  );
  assert.equal(
    checked.sourceFinal,
    'fb366a92e4e2c49d747bc92abe917eb56ba11fb484ce3115ea8c320e618cefb0',
  );
  for (const row of checked.source) {
    const bytes = await readFile(row.path);
    assert.equal(bytes.length, row.bytes);
    assert.equal(sha(bytes), row.sha256);
  }
  const original = JSON.parse(
    await readFile('Docs/Evidence/069-manual-segments/native-after-06/manifest.json'),
  );
  await mkdir(dirname(runtime), { recursive: true });
  await mkdir(runtime, { recursive: false });
  await mkdir(output, { recursive: false });
  const inputs = [],
    diff = [];
  for (const row of original.inputs) {
    const bytes = await readFile(row.path);
    assert.equal(bytes.length, row.bytes);
    assert.equal(sha(bytes), row.sha256);
    let derived = bytes;
    if (/\.(ts|mjs)$/.test(row.path))
      derived = Buffer.from(await derive(row.path, bytes.toString('utf8')));
    await mkdir(dirname(resolve(runtime, row.path)), { recursive: true });
    await writeFile(resolve(runtime, row.path), derived, { flag: 'wx' });
    await mkdir(dirname(resolve(output, 'runtime-source', row.path)), { recursive: true });
    await writeFile(resolve(output, 'runtime-source', row.path), derived, { flag: 'wx' });
    inputs.push({ path: row.path, bytes: derived.length, sha256: sha(derived) });
    if (!bytes.equals(derived))
      diff.push({
        path: row.path,
        originalSha256: sha(bytes),
        derivedSha256: sha(derived),
        originalText: bytes.toString(),
        derivedText: derived.toString(),
      });
  }
  for (const path of [
    observer,
    'scripts/manual-segments-record-stage-observer.d.mts',
    'scripts/manual-segments-record-stage-guard.mjs',
  ]) {
    const b = await readFile(path);
    await writeFile(resolve(runtime, path), b, { flag: 'wx' });
    await writeFile(resolve(output, 'runtime-source', path), b, { flag: 'wx' });
    inputs.push({ path, bytes: b.length, sha256: sha(b) });
  }
  const native = await readFile('node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs');
  assert.equal(sha(native), '02dc6a4e2fffc013bab08fbb44fa68f501d8303615e9afe4c7d89ad4eedda0d0');
  assert.equal(native.length, 4340292);
  await mkdir(output + '/native');
  await writeFile(output + '/native/rapier.mjs', native, { flag: 'wx' });
  inputs.sort((a, b) => a.path.localeCompare(b.path));
  const closure = await verifyModuleClosure({
    paths: inputs.map((r) => r.path),
    roots: inputs.filter((r) => /\.(ts|mjs|mts)$/.test(r.path)).map((r) => r.path),
    readSource: (path) => readFile(resolve(output, 'runtime-source', path)),
    lockBytes: await readFile('package-lock.json'),
  });
  const tools = [];
  for (const path of [
    'scripts/prepare-manual-segments-record-stage-diagnostic.mjs',
    'scripts/verify-manual-segments-record-stage-preflight.mjs',
    'scripts/verify-manual-segments-record-stage-diagnostic.mjs',
  ]) {
    const bytes = await readFile(path);
    await mkdir(dirname(resolve(output, 'tool-source', path)), { recursive: true });
    await writeFile(resolve(output, 'tool-source', path), bytes, { flag: 'wx' });
    tools.push({ path, bytes: bytes.length, sha256: sha(bytes) });
  }
  const proof = {
    scope: 'INSTRUMENTED_COPY_ONLY_NO_ACCEPTANCE',
    preparedAt: new Date().toISOString(),
    runtime,
    inputs,
    tools,
    closure,
    sourceHash: sha(Buffer.from(JSON.stringify(inputs))),
    nativeSha256: sha(native),
    nativeBytes: native.length,
    derivationCount: diff.length,
    observerBytes: 76800,
    metrics: 8,
    countsAndTimesChannels: 16,
    windowTicks: 600,
    externalScope:
      'Original lock and installed native pinned; Node builtins not archived; Babel parse only prep process, no measured collector import',
  };
  await writeFile(output + '/derivation.json', JSON.stringify(diff, null, 2), { flag: 'wx' });
  await writeFile(output + '/runtime-proof.json', JSON.stringify(proof, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(proof));
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await prepare();
