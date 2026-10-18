// Paired isolated kernel diagnostic; no acceptance/native/FPS claim.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { immutable, digest, localClosure } from './wheel-capture-source.mjs';
import {
  longitudinalProfile,
  longitudinalValues,
} from '../tests/autonomy/longitudinal-reference.ts';
import { compileLongitudinalProfile } from '../src/autonomy/longitudinal-control.ts';
import { createLongitudinalTargetFixture } from '../tests/autonomy/longitudinal-target-fixture.ts';
assert.equal(process.env.PBI047_CPU_LEASE, 'parent-approved-exclusive');
const folder = 'Docs/Evidence/047-longitudinal-control/shape-diagnostic-v1';
await mkdir(folder);
const archive = 'Docs/Evidence/047-longitudinal-control/after-v7';
const binding = JSON.parse(await readFile(`${archive}/binding.json`));
const sourcePath = 'src/autonomy/longitudinal-control.ts';
const original = await readFile(`${archive}/source/${sourcePath}`);
assert.equal(digest(await readFile(sourcePath)), digest(original), 'Runtime remains frozen');
let candidate = original.toString('utf8');
function replace(from, to) {
  assert.equal(candidate.split(from).length - 1, 1, from);
  candidate = candidate.replace(from, to);
}
replace(
  'const inputScratch: Record<string, unknown> = Object.create(null),',
  'const inputScratch: Record<string, unknown> = { sessionId: undefined, worldEpoch: undefined, actor: undefined, tick: undefined, authority: undefined, profile: undefined, target: undefined, observation: undefined },',
);
replace(
  'subjectScratch: Record<string, unknown> = Object.create(null),',
  'subjectScratch: Record<string, unknown> = { id: undefined, incarnation: undefined },',
);
replace(
  'observationScratch: Record<string, unknown> = Object.create(null),',
  'observationScratch: Record<string, unknown> = { version: undefined, units: undefined, sessionId: undefined, worldEpoch: undefined, actor: undefined, tick: undefined, longitudinalSpeedMps: undefined, classId: undefined, classVersion: undefined },',
);
replace(
  'observationActorScratch: Record<string, unknown> = Object.create(null);',
  'observationActorScratch: Record<string, unknown> = { id: undefined, incarnation: undefined };',
);
replace(
  '          ...owner,\n          vehicleId: subject.id,',
  '          sessionId: owner.sessionId,\n          worldEpoch: owner.worldEpoch,\n          vehicleId: subject.id,',
);
const variants = [];
for (const variant of ['current', 'candidate']) {
  const root = resolve(`.pbi-validation-047/shape-${variant}-v1`);
  await mkdir(root);
  for (const input of binding.inputs) {
    const bytes = await readFile(`${archive}/source/${input.path}`);
    assert.equal(digest(bytes), input.sha256);
    await immutable(
      `${root}/${input.path}`,
      input.path === sourcePath && variant === 'candidate' ? candidate : bytes,
    );
  }
  variants.push(await import(pathToFileURL(`${root}/${sourcePath}`).href));
}
const entries = await localClosure(['scripts/diagnose-longitudinal-shapes.mjs']);
await immutable(`${folder}/binding.json`, {
  status: 'DIAGNOSTIC_ONLY',
  sourceHash: binding.sourceHash,
  originalHash: digest(original),
  candidateHash: digest(candidate),
  inputs: entries,
  samplesPerArm: 1200,
  warmupTicks: 600,
  populations: [70, 110],
  pairs: 3,
  native: false,
});
for (const entry of entries)
  await immutable(`${folder}/source/${entry.path}`, await readFile(entry.path));
await immutable(`${folder}/candidate.ts`, candidate);
const scope = { sessionId: '047-shape-diagnostic', worldEpoch: 0 };
const templateOwner = createLongitudinalTargetFixture(
  compileLongitudinalProfile(longitudinalProfile()).cruise,
  { id: 'template', incarnation: 1 },
  scope,
);
const runs = [];
try {
  for (const count of [70, 110])
    for (let pair = 0; pair < 3; pair++) {
      const actors = Array.from({ length: count }, (_, i) => ({
        id: `car-${i}`,
        incarnation: i + 1,
      }));
      const owners = variants.map((variant) => variant.createLongitudinalController(scope));
      const profiles = variants.map((variant) =>
        longitudinalValues.map((values, i) =>
          variant.compileLongitudinalProfile(longitudinalProfile(values, i)),
        ),
      );
      const samples = [new Float64Array(1200), new Float64Array(1200)];
      const order = pair % 2 ? [1, 0] : [0, 1];
      const targets = Array(count).fill(null);
      try {
        for (const owner of owners) owner.setActors(actors, scope);
        for (let tick = 1; tick <= 1800; tick++) {
          if (tick % 6 === 1) {
            const template = templateOwner.target(tick, tick % 120 >= 60);
            for (let i = 0; i < count; i++)
              targets[i] = Object.freeze({
                ...template,
                actor: Object.freeze({ ...actors[i] }),
                profileVersionId: profiles[0][i % 2].versionId,
                engineVersion: profiles[0][i % 2].engineVersion,
                ...(count === 110 && i >= 48 ? { reason: 'INCOMPLETE_CONTEXT', targetMps: 0 } : {}),
              });
          }
          const totals = [0, 0];
          for (let i = 0; i < count; i++) {
            const base = {
              ...scope,
              actor: actors[i],
              tick,
              authority: 'AUTO',
              target: targets[i],
              observation: {
                version: '047-observation-v1',
                units: 'SI',
                ...scope,
                actor: actors[i],
                tick,
                longitudinalSpeedMps: tick % 120 < 30 ? 0 : 15,
                classId: i % 2 ? 'compact' : 'sedan',
                classVersion: '023-mechanics-v1',
              },
            };
            const results = [];
            for (const index of order) {
              const input = { ...base, profile: profiles[index][i % 2] },
                started = performance.now();
              results[index] = owners[index].step(input);
              totals[index] += performance.now() - started;
            }
            assert.deepEqual(results[0], results[1]);
          }
          if (tick > 600) for (const index of [0, 1]) samples[index][tick - 601] = totals[index];
        }
      } finally {
        for (const owner of owners) owner.dispose();
      }
      for (const index of [0, 1]) {
        assert.equal(owners[index].getStats().scratchRetainedFields, 0);
        const raw = Array.from(samples[index]),
          sorted = [...raw].sort((a, b) => a - b);
        runs.push({
          count,
          pair,
          variant: index ? 'candidate' : 'current',
          fleetMeanMs: raw.reduce((sum, value) => sum + value, 0) / raw.length,
          fleetP95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)],
          samples: raw,
          cleanup: owners[index].getStats(),
        });
      }
      console.log(JSON.stringify({ count, pair, diagnosticComplete: true }));
    }
} finally {
  templateOwner.dispose();
}
assert.equal(digest(await readFile(sourcePath)), digest(original));
await immutable(`${folder}/report.json`, {
  status: 'DIAGNOSTIC_ONLY',
  native: false,
  syntheticIncompleteContext: true,
  runs,
});
console.log(
  JSON.stringify(
    runs.map((run) => ({
      count: run.count,
      pair: run.pair,
      variant: run.variant,
      fleetMeanMs: run.fleetMeanMs,
      fleetP95Ms: run.fleetP95Ms,
      cleanup: run.cleanup,
    })),
  ),
);
