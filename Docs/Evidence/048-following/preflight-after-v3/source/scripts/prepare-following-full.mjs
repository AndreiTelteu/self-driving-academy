// Strictly derive an identical paced runner from the accepted-equivalent frozen048 v2 adapter.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { immutable, digest } from './wheel-capture-source.mjs';
const version = process.argv[2];
assert(/^[a-z0-9-]+$/.test(version));
const evidence = 'Docs/Evidence/048-following',
  beforeLabel = 'reference-v2',
  afterLabel = process.argv[3] ?? 'after-v2';
assert(/^[a-z0-9-]+$/.test(afterLabel));
const overlayCurrent = process.argv.includes('--current-following-overlay');
const overlayCommon = process.argv.includes('--current-provenance-common');
const provenanceCommon = new Set([
  'src/autonomy/road-context.ts',
  'src/autonomy/cruise-targets.ts',
]);
const commonBytes = await readFile(
  `${evidence}/${beforeLabel}/source/scripts/benchmark-following.mjs`,
);
assert.equal(
  digest(commonBytes),
  digest(await readFile(`${evidence}/${afterLabel}/source/scripts/benchmark-following.mjs`)),
  'Original matching runner changed',
);
let source = commonBytes.toString('utf8');
function replace(from, to, count = 1) {
  assert.equal(
    source.split(from).length - 1,
    count,
    'Frozen runner transformation occurrence ' + from,
  );
  source = source.split(from).join(to);
}
replace(
  "import assert from 'node:assert/strict';",
  `import assert from 'node:assert/strict';
import {nativeValidationProtocol,paceNativeDeadline} from './native-validation-protocol.mjs';
import {readLongitudinalPower,assertLongitudinalPowerComparable} from './longitudinal-full-power.mjs';
const protocol=nativeValidationProtocol(process.env.PBI048_FULL_MODE??'full');`,
);
replace(
  "  'scripts/benchmark-following.mjs',",
  "  'scripts/benchmark-following-full.mjs',\n  'scripts/benchmark-following.mjs',\n  'scripts/prepare-following-full.mjs',\n  'full-origin.json',",
  2,
);
// Archive only changed/new closure bytes; other exact inputs are recoverable from the immutable prerequisite commit.
const archiveStart = source.indexOf('// Bounded archive:'),
  archiveEnd = source.indexOf('const nativePath =', archiveStart);
assert(archiveStart >= 0 && archiveEnd > archiveStart);
source =
  source.slice(0, archiveStart) +
  `for (const {path} of inputs) {
 const bytes=await readFile(path);let original;
 try{original=execFileSync('git',['show',execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()+':'+path],{stdio:['ignore','pipe','ignore']});}catch{original=null;}
 if(!original?.equals(bytes))await immutable(folder+'/source/'+path,bytes);
}
` +
  source.slice(archiveEnd);
replace(
  'const binding = {',
  "const powerStart=readLongitudinalPower(); await immutable(folder+'/power-start.json',powerStart);\nconst binding = {\n  protocol,powerStart,origin:JSON.parse(await readFile('full-origin.json')),",
);
replace('for (const count of [70, 110])', 'for (const count of protocol.populations)');
replace(
  'for (let pair = 0; pair < 3; pair++)',
  'for (let pair = 0; pair < protocol.pairs; pair++)',
);
replace('observer ? 600 : 0', 'observer ? protocol.measuredTicks : 0', 3);
replace(
  '          let target;',
  "          let target; console.log(JSON.stringify({milestone:'world-start',phase,count,pair,observer}));\n          const start=performance.now(); let measuredStarted=null,maxDeadlineLatenessMs=0;",
);
replace(
  'for (let tick = 1; tick <= 780; tick++) {',
  `for (let tick = 1; tick <= protocol.warmupTicks+protocol.measuredTicks; tick++) {
            if(tick===protocol.warmupTicks+1)measuredStarted=performance.now();
            const deadline=start+tick*1000/60;await paceNativeDeadline(deadline);
            maxDeadlineLatenessMs=Math.max(maxDeadlineLatenessMs,performance.now()-deadline);`,
);
replace('tick > 180', 'tick > protocol.warmupTicks');
replace('tick - 181', 'tick - protocol.warmupTicks - 1', 3);
replace(
  '          const physicalHash =',
  `          await paceNativeDeadline(measuredStarted+protocol.measuredTicks*1000/60);
          const measuredWallMs=performance.now()-measuredStarted,warmupWallMs=measuredStarted-start;
          const physicalHash =`,
);
replace(
  '            count,\n            pair,',
  '            warmupWallMs,measuredWallMs,elapsedWallMs:performance.now()-start,maxDeadlineLatenessMs,\n            count,\n            pair,',
);
replace(
  '            trace,\n            cleanup,\n          });',
  "            trace,\n            cleanup,\n          });\n          const pairRuns=runs.filter(run=>run.count===count&&run.pair===pair);\n          if(pairRuns.length===2){const path=folder+'/pairs/'+count+'-'+pair+'.json';await immutable(path,{sourceHash:binding.sourceHash,nativeHash:binding.native.sha256,protocol,runs:pairRuns});await immutable(path+'.sha256',digest(await readFile(path)));console.log(JSON.stringify({checkpoint:path,phase,count,pair}));}",
);
replace(
  '  for (const input of inputs) assert.equal',
  "  const powerEnd=readLongitudinalPower();await immutable(folder+'/power-end.json',powerEnd);assertLongitudinalPowerComparable(powerStart,powerEnd);\n  for (const input of inputs) assert.equal",
);
replace(
  "fixture: '048-targeted-local-v2',",
  "fixture: '048-full-native-paced-v1',\n    protocol,powerStart,powerEnd,",
);
replace(
  "'Actual044/045/046/047/024/Rapier with one native body and70/110policy evaluations; local cost only, not population fleet FPS.'",
  "'Actual048 local algorithm investigation, one native body and70policy evaluations; real60Hz deadline pacing, full30s/120s5pairs or technical. No fleet/browser FPS claim.'",
);
for (const phase of ['before', 'after']) {
  const archive = `${evidence}/${phase === 'before' ? beforeLabel : afterLabel}`,
    bindingBytes = await readFile(`${archive}/binding.json`),
    binding = JSON.parse(bindingBytes),
    target = resolve(`.pbi-validation-048/full-${phase}-${version}`);
  await mkdir(target);
  const overlays = [];
  for (const input of binding.inputs) {
    let bytes;
    try {
      bytes = await readFile(`${archive}/source/${input.path}`);
    } catch (error) {
      assert.equal(error.code, 'ENOENT');
      bytes = execFileSync('git', ['show', binding.prerequisiteCommit + ':' + input.path]);
    }
    assert.equal(digest(bytes), input.sha256);
    assert.equal(bytes.length, input.bytes);
    if (
      (phase === 'after' && overlayCurrent && input.path === 'src/autonomy/following.ts') ||
      (overlayCommon && provenanceCommon.has(input.path))
    ) {
      bytes = await readFile(input.path);
      overlays.push({
        path: input.path,
        originalSha256: input.sha256,
        sha256: digest(bytes),
        bytes: bytes.length,
      });
    }
    await immutable(target + '/' + input.path, bytes);
  }
  for (const path of [
    'scripts/native-validation-protocol.mjs',
    'src/telemetry/validation-protocol.ts',
    'scripts/longitudinal-full-power.mjs',
    'scripts/prepare-following-full.mjs',
  ])
    await immutable(target + '/' + path, await readFile(path));
  await immutable(target + '/scripts/benchmark-following-full.mjs', source);
  await immutable(target + '/full-origin.json', {
    phase,
    originalLabel: phase === 'before' ? beforeLabel : afterLabel,
    originalBindingSha256: digest(bindingBytes),
    originalSourceHash: binding.sourceHash,
    originalInputs: binding.inputs,
    overlays,
    commonProvenanceOverlay: overlayCommon,
    commonRunnerSha256: digest(commonBytes),
    derivedRunnerSha256: digest(source),
    retrospectiveBefore: phase === 'before',
  });
  console.log(JSON.stringify({ phase, target, runnerSha256: digest(source) }));
}
