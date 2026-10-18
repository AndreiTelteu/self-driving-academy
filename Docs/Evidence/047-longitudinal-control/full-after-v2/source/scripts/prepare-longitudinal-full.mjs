// Derive one identical paced runner from the frozen chronological common adapter.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { immutable, digest } from './wheel-capture-source.mjs';
const afterLabel = process.argv[2] ?? 'after-v4';
const controlsLabel = process.argv[3] ?? 'v9';
assert(/^[a-z0-9-]+$/.test(afterLabel));
assert(/^[a-z0-9-]+$/.test(controlsLabel));
const evidence = 'Docs/Evidence/047-longitudinal-control';
const commonBytes = await readFile(
  `${evidence}/before-v1/source/scripts/benchmark-longitudinal-control.mjs`,
);
assert.equal(
  digest(commonBytes),
  digest(
    await readFile(`${evidence}/${afterLabel}/source/scripts/benchmark-longitudinal-control.mjs`),
  ),
  'Frozen common adapter changed',
);
let source = commonBytes.toString('utf8');
function replace(from, to, count = 1) {
  assert.equal(
    source.split(from).length - 1,
    count,
    `Unexpected frozen runner occurrence: ${from}`,
  );
  source = source.split(from).join(to);
}
replace(
  "import assert from 'node:assert/strict';",
  `import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { readLongitudinalPower, assertLongitudinalPowerComparable } from './longitudinal-full-power.mjs';
import { referenceFullCruise, referenceFullLongitudinal, recordFullReason, assertFiniteFullBody, assertFiniteFullProjection } from './longitudinal-full-oracle.mjs';
const preflight = process.env.PBI047_FULL_MODE === 'preflight';
const protocol = Object.freeze({ mode: preflight ? 'preflight' : 'full', pacedHz: 60, warmupTicks: preflight ? 30 : 1800, measuredTicks: preflight ? 60 : 7200, pairs: preflight ? 1 : 5, populations: [70,110], offlineInstrumentationBytes: (preflight ? 60 : 7200) * 3 * 8 });
async function pace(deadline) { for (;;) { const remaining = deadline - performance.now(); if (remaining <= 0) return; await sleep(remaining); } }
`,
);
replace(
  "'scripts/benchmark-longitudinal-control.mjs',",
  "'scripts/benchmark-longitudinal-full.mjs',\n    'scripts/benchmark-longitudinal-control.mjs',\n    'scripts/prepare-longitudinal-full.mjs',\n    'full-origin.json',",
);
replace(
  'for (let pair = 0; pair < 3; pair++)',
  'for (let pair = 0; pair < protocol.pairs; pair++)',
);
replace('observer ? 600 : 0', 'observer ? protocol.measuredTicks : 0', 3);
replace(
  '          const states = actors.map',
  '          const targetReasonCounts = Object.create(null), phaseCounts = Object.create(null), firstMissing = new Map();\n          let checkedBodyStates = 0;\n          const states = actors.map',
);
replace(
  '            road.updateFrame({',
  '            assert.deepEqual(world.counts(), { vehicles: count, bodies: count, colliders: count + 1 });\n            road.updateFrame({',
);
replace(
  '                const body = world.readBody(tokens[i]),',
  '                const body = world.readBody(tokens[i]);\n                assertFiniteFullBody(body); checkedBodyStates++;\n                const',
);
replace(
  '              assert(context?.laneId);\n              const postedLimitMps = fullContext.lane.lane.speedLimitMps;',
  '              const postedLimitMps = context?.laneId && fullContext?.lane ? fullContext.lane.lane.speedLimitMps : null;',
);
replace('const expected = referenceCruise(', 'const expected = referenceFullCruise(');
replace(
  '                facts: {\n                  ...referenceFacts(i, tick),',
  '                facts: postedLimitMps === null ? null : {\n                  ...referenceFacts(i, tick),',
);
replace(
  "                  facts: {\n                    version: '046-road-facts-v1',",
  "                  facts: postedLimitMps === null ? null : {\n                    version: '046-road-facts-v1',",
);
replace(
  '                target = targets[i].targetMps;',
  '                target = targets[i].targetMps;\n                recordFullReason(targetReasonCounts, targets[i].reason);\n                if (postedLimitMps === null && !firstMissing.has(actors[i].id)) {\n                  assert(firstMissing.size < count);\n                  const body = world.readBody(tokens[i]);\n                  firstMissing.set(actors[i].id, { tick, actor: actors[i], positionM: body.transform.positionM, velocityMps: body.velocityMps, contextReason: decision.reason, targetReason: targets[i].reason });\n                }',
);
// Replace the original scalar branch as a whole, preserving the independently documented046 reasons.
const scalarStart = source.indexOf('              let expected = {');
const scalarEnd = source.indexOf('              states[i] = expected.state;', scalarStart);
assert(scalarStart >= 0 && scalarEnd > scalarStart);
source =
  source.slice(0, scalarStart) +
  '              const expected = referenceFullLongitudinal(states[i], longitudinalValues[i % 2], speed, targets[i], tick, config);\n' +
  source.slice(scalarEnd);
replace(
  '              trace.update(\n',
  '              phaseCounts[result.phase] = (phaseCounts[result.phase] ?? 0) + 1;\n              trace.update(\n',
);
replace(
  '          longitudinal?.dispose();',
  '          const nativePopulation = world.counts();\n          longitudinal?.dispose();',
);
replace(
  '            sampleBytes: samples.byteLength',
  '            targetReasonCounts, phaseCounts, checkedBodyStates, nativePopulation, firstMissing: Array.from(firstMissing.values()),\n            sampleBytes: samples.byteLength',
);
replace(
  'const start = performance.now();',
  "console.log(JSON.stringify({ milestone: 'world-start', phase, count, pair, observer }));\n          const start = performance.now();\n          let measuredStarted = null, maxDeadlineLatenessMs = 0;",
);
replace(
  'for (let tick = 1; tick <= 780; tick++) {',
  `for (let tick = 1; tick <= protocol.warmupTicks + protocol.measuredTicks; tick++) {
            if (tick === protocol.warmupTicks + 1) measuredStarted = performance.now();
            const deadline = start + tick * 1000 / 60;
            await pace(deadline);
            maxDeadlineLatenessMs = Math.max(maxDeadlineLatenessMs, performance.now() - deadline);`,
);
replace('tick > 180', 'tick > protocol.warmupTicks', 4);
replace('tick - 181', 'tick - protocol.warmupTicks - 1', 3);
replace(
  '          }\n          const physical =',
  "            if (tick === protocol.warmupTicks || (tick > protocol.warmupTicks && (tick - protocol.warmupTicks) % 1800 === 0)) console.log(JSON.stringify({ milestone: tick <= protocol.warmupTicks ? 'warmup-complete' : 'measurement-progress', phase, count, pair, observer, tick }));\n          }\n          const physical =",
);
replace(
  'const physical = digest(JSON.stringify(tokens.map((t) => world.project(t.entityId))));',
  `await pace(measuredStarted + protocol.measuredTicks * 1000 / 60);
          const measuredWallMs = performance.now() - measuredStarted;
          const warmupWallMs = measuredStarted - start;
          const finalProjections = tokens.map((t) => world.project(t.entityId));
          for (const projection of finalProjections) assertFiniteFullProjection(projection);
          const physical = digest(JSON.stringify(finalProjections));`,
);
replace(
  'elapsedWallMs: performance.now() - start,',
  'elapsedWallMs: performance.now() - start,\n            warmupWallMs, measuredWallMs, maxDeadlineLatenessMs,',
);
replace(
  "fixture: '047-targeted-native-v1',",
  "fixture: '047-full-native-paced-v2',\n    protocol,\n    powerStart, powerEnd,\n    offlineInstrumentationBytes: protocol.offlineInstrumentationBytes,",
);
replace(
  "'Local unpaced CPU with real Rapier/024; fixed brake1 independent of computed047 commands; no FPS or driving proof. Native functional and browser driving are separate.'",
  "'Real-deadline-paced60Hz local native CPU;30s warmup/120s measure per full arm, fixed brake1 independent of047; no browser FPS or laptop hardware claim.'",
);
replace(
  'const binding = {\n    phase,',
  "const powerStart = readLongitudinalPower();\n  await immutable(folder + '/power-start.json', powerStart);\n  const binding = {\n    protocol, powerStart,\n    origin: JSON.parse(await readFile('full-origin.json')),\n    phase,",
);
replace(
  '  for (const input of inputs) assert.equal',
  "  const powerEnd = readLongitudinalPower();\n  await immutable(folder + '/power-end.json', powerEnd);\n  assertLongitudinalPowerComparable(powerStart, powerEnd);\n  for (const input of inputs) assert.equal",
);
// Every completed pair is durably checkpointed after both worlds have released resources.
replace(
  '          });\n        } catch (error) {',
  `          });
          const pairRuns = runs.filter((run) => run.count === count && run.pair === pair);
          if (pairRuns.length === 2) {
            const pairPath = folder + '/pairs/' + count + '-' + pair + '.json';
            await immutable(pairPath, { sourceHash: binding.sourceHash, nativeHash: binding.native.sha256, protocol, runs: pairRuns });
            await immutable(pairPath + '.sha256', digest(await readFile(pairPath)));
            console.log(JSON.stringify({ checkpoint: pairPath, phase, count, pair, ticks: protocol.measuredTicks }));
          }
        } catch (error) {`,
);
for (const [phase, label] of [
  ['before', 'before-v1'],
  ['after', afterLabel],
]) {
  const archive = `${evidence}/${label}`,
    original = await readFile(`${archive}/binding.json`),
    binding = JSON.parse(original);
  const target = resolve(`.pbi-validation-047/full-${phase}-${controlsLabel}`);
  await mkdir(target);
  for (const input of binding.inputs) {
    const bytes = await readFile(`${archive}/source/${input.path}`);
    assert.equal(bytes.length, input.bytes);
    assert.equal(digest(bytes), input.sha256);
    await immutable(`${target}/${input.path}`, bytes);
  }
  await immutable(`${target}/scripts/benchmark-longitudinal-full.mjs`, source);
  await immutable(
    `${target}/scripts/longitudinal-full-power.mjs`,
    await readFile('scripts/longitudinal-full-power.mjs'),
  );
  await immutable(
    `${target}/scripts/longitudinal-full-oracle.mjs`,
    await readFile('scripts/longitudinal-full-oracle.mjs'),
  );
  await immutable(
    `${target}/scripts/prepare-longitudinal-full.mjs`,
    await readFile('scripts/prepare-longitudinal-full.mjs'),
  );
  await immutable(`${target}/full-origin.json`, {
    phase,
    originLabel: label,
    originalBindingSha256: digest(original),
    originalSourceHash: binding.sourceHash,
    commonRunnerSha256: digest(commonBytes),
    derivedRunnerSha256: digest(source),
    retrospectiveBefore: phase === 'before',
    originalInputs: binding.inputs,
  });
  await immutable(`${target}/.gitattributes`, '* -text\n');
  console.log(JSON.stringify({ phase, target, runnerSha256: digest(source), origin: label }));
}
