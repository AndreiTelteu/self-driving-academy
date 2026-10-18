import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { immutable, localClosure, digest, causes } from './wheel-capture-source.mjs';
import {
  followingProfile,
  followingValues,
  referenceFollowing,
} from '../tests/autonomy/following-reference.ts';
import { createFollowingTargetFixture } from '../tests/autonomy/following-target-fixture.ts';
import {
  compileLongitudinalProfile,
  createLongitudinalController,
} from '../src/autonomy/longitudinal-control.ts';
import { createRapierProbe } from '../src/vehicles/rapier/index.ts';
import { createVehicleController } from '../src/vehicles/controller.ts';
assert.equal(process.env.PBI048_CPU_LEASE, 'parent-approved-exclusive');
const [phase, label] = process.argv.slice(2);
assert(['before', 'after'].includes(phase) && /^[a-z0-9-]+$/.test(label));
const folder = `Docs/Evidence/048-following/${label}`;
await mkdir(folder, { recursive: true });
const productionPath = 'src/autonomy/following.ts';
if (phase === 'before') await assert.rejects(readFile(productionPath), { code: 'ENOENT' });
const moduleUrl = new URL('../src/autonomy/following.ts', import.meta.url);
const production = phase === 'after' ? await import(moduleUrl.href) : null;
const entries = [
  'scripts/benchmark-following.mjs',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
  ...(production ? [productionPath] : []),
];
const inputs = [];
for (const path of await localClosure(entries)) {
  const bytes = await readFile(path);
  inputs.push({ path, bytes: bytes.length, sha256: digest(bytes) });
}
// Bounded archive: exact small adapter/oracle inputs; closure hashes refer to prerequisite commit.
for (const path of [
  'scripts/benchmark-following.mjs',
  'tests/autonomy/following-reference.ts',
  'tests/autonomy/following-target-fixture.ts',
  'Docs/performance-budgets.json',
  ...(production ? [productionPath] : []),
])
  await immutable(`${folder}/source/${path}`, await readFile(path));
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat'));
const binding = {
  phase,
  capturedAt: new Date().toISOString(),
  inputs,
  sourceHash: digest(JSON.stringify(inputs)),
  native: { path: nativePath, sha256: digest(await readFile(nativePath)) },
};
await immutable(`${folder}/binding.json`, binding);
const runs = [];
const p95 = (a) => [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * 0.95)];
try {
  for (const count of [70, 110])
    for (let pair = 0; pair < 3; pair++)
      for (const observer of pair % 2 ? [true, false] : [false, true]) {
        const scope = { sessionId: '048-benchmark', worldEpoch: 0 },
          world = await createRapierProbe();
        let fixture, controller, policy;
        try {
          world.addClassCar('car', { x: -180, y: 0.8, z: -2 }, 'sedan');
          const identity = world.bodyIdentity('car'),
            actor = { id: 'car', incarnation: identity.generation };
          const raw = followingProfile(),
            longitudinal = compileLongitudinalProfile(raw),
            profile = production?.compileFollowingProfile(raw);
          fixture = createFollowingTargetFixture(longitudinal.cruise, actor, scope);
          controller = createVehicleController({ schemaVersion: 1, units: 'SI', ...scope }, world);
          controller.register(identity);
          policy = createLongitudinalController(scope);
          policy.setActors([actor], scope);
          const samples = new Float64Array(observer ? 600 : 0),
            own = new Float64Array(observer ? 600 : 0),
            physical = new Float64Array(observer ? 600 : 0),
            trace = [];
          let target;
          for (let tick = 1; tick <= 780; tick++) {
            const began = performance.now();
            const frame = fixture.input(
              tick,
              5,
              8 + (tick % 11),
              tick % 9 === 0 ? 0 : 4,
              tick % 29 === 0 ? null : tick % 17 === 0 ? 'new-leader' : 'leader',
            );
            const expected = frame.roadContext.leader
              ? referenceFollowing(
                  followingValues,
                  5,
                  frame.roadContext.leader.speedMps,
                  frame.roadContext.leader.gapM,
                  frame.cruise.targetMps,
                )
              : { desiredGapM: null, targetMps: frame.cruise.targetMps };
            assert.equal(frame.roadContext.laneId, 'west-in');
            assert(frame.cruise.targetMps > 0, 'Fixture must exercise actual usable cruise');
            assert.equal(
              frame.roadContext.leader?.id ?? null,
              tick % 29 === 0 ? null : tick % 17 === 0 ? 'new-leader' : 'leader',
            );
            const beganOwn = performance.now();
            for (let i = 0; i < count; i++) {
              const result = production
                ? production.evaluateFollowingTarget({
                    cruiseInput: frame.cruiseInput,
                    roadContext: frame.roadContext,
                    observation: frame.observation,
                    profile,
                  })
                : { ...expected, target: { ...frame.cruise, targetMps: expected.targetMps } };
              assert.equal(result.target.targetMps, expected.targetMps);
              assert.equal(result.desiredGapM, expected.desiredGapM);
              target = result.target;
            }
            const cost = performance.now() - beganOwn;
            const body = world.readBody(identity),
              speed = body.velocityMps.z;
            const command = policy.step({
              ...scope,
              actor,
              tick,
              authority: 'AUTO',
              profile: longitudinal,
              target,
              observation: {
                version: '047-observation-v1',
                units: 'SI',
                ...scope,
                actor,
                tick,
                longitudinalSpeedMps: speed,
                classId: 'sedan',
                classVersion: '023-mechanics-v1',
              },
            });
            // Controlled identical physical commands; genuine policy driving has separate episode.
            const realized = controller.step(
              { tick, dtSeconds: 1 / 60 },
              [{ identity, command: { ...command.command, throttle: 0, brake: 1 } }],
              [],
              observer,
            );
            if (observer && tick > 180) {
              samples[tick - 181] = performance.now() - began;
              own[tick - 181] = cost;
              physical[tick - 181] = realized.physics.stepMs;
            }
            if (tick % 60 === 0) trace.push([tick, target.targetMps, command.command.brake]);
          }
          const physicalHash = digest(JSON.stringify(world.project('car')));
          const cleanup = { fixture: fixture.dispose() };
          policy.dispose();
          controller.dispose();
          world.dispose();
          cleanup.policy = policy.getStats();
          cleanup.controller = controller.getStats();
          cleanup.body = world.bodyResources();
          runs.push({
            count,
            pair,
            observer,
            tickP95Ms: observer ? p95(samples) : null,
            ownP95Ms: observer ? p95(own) : null,
            rapierP95Ms: observer ? p95(physical) : null,
            samples: {
              tick: Array.from(samples),
              own: Array.from(own),
              rapier: Array.from(physical),
            },
            sampleBytes: samples.byteLength + own.byteLength + physical.byteLength,
            physicalHash,
            trace,
            cleanup,
          });
        } finally {
          for (const resource of [fixture, policy, controller, world]) resource?.dispose();
        }
      }
  for (const input of inputs) assert.equal(digest(await readFile(input.path)), input.sha256);
  await immutable(`${folder}/report.json`, {
    status: 'CAPTURE_COMPLETE',
    fixture: '048-targeted-local-v1',
    runtime: process.version,
    cpu: cpus()[0]?.model,
    os: `${platform()} ${release()}`,
    runs,
    scope:
      'Actual044/045/046/047/024/Rapier with one native body and70/110policy evaluations; local cost only, not population fleet FPS.',
  });
  await immutable(`${folder}/terminal.json`, {
    completedAt: new Date().toISOString(),
    reportSha256: digest(await readFile(`${folder}/report.json`)),
    sourceHash: binding.sourceHash,
  });
  console.log(JSON.stringify({ folder, runs: runs.length }));
} catch (error) {
  await immutable(`${folder}/failure.json`, { causes: causes(error), runs });
  throw error;
}
