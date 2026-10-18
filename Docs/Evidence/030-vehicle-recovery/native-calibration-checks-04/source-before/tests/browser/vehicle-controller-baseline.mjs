import { readFile, writeFile, mkdir, access, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { dirname } from 'node:path';
import { manyContacts } from '../vehicles/physics-fixture.ts';

const folder = 'Docs/Evidence/024-vehicle-controller';
const destination = `${folder}/before-node.json`;
const nativePath = 'node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs';
const nativeBytes = await readFile(nativePath);
const nativeArtifact = {
  path: nativePath,
  bytes: nativeBytes.length,
  sha256: createHash('sha256').update(nativeBytes).digest('hex'),
  description:
    'Installed official Rapier compatibility ESM including inlined WASM; dependency artifact identity, not owned application source.',
};
try {
  await access(destination);
  throw new Error(`Immutable baseline already exists: ${destination}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
try {
  await access(`${folder}/source-before`);
  throw new Error('Immutable before source archive already exists; preserve the previous attempt');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
try {
  await access('src/vehicles/controller.ts');
  throw new Error('Production controller exists before baseline capture');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const files = execFileSync('rg', ['--files', 'src/vehicles', 'src/sessions'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((path) => path.replaceAll('\\', '/'));
files.push(
  'tests/vehicles/physics-fixture.ts',
  'tests/vehicles/controller-reference.ts',
  'tests/browser/vehicle-controller-baseline.mjs',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
files.sort();
const source = createHash('sha256'),
  inputs = [];
await mkdir(`${folder}/source-before`, { recursive: true });
await writeFile(`${folder}/source-before/.gitattributes`, '* -text\n');
for (const path of files) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  await mkdir(dirname(`${folder}/source-before/${path}`), { recursive: true });
  await copyFile(path, `${folder}/source-before/${path}`);
}
const warmupTicks = 180,
  measuredTicks = 600;
const runs = [];
for (let pair = 0; pair < 5; pair++) {
  for (const observe of pair % 2 ? [true, false] : [false, true]) {
    const { world, inputs } = await manyContacts(70);
    const identity = world.bodyIdentity('car-0');
    let captured;
    try {
      const warmupStart = performance.now();
      for (let tick = 0; tick < warmupTicks; tick++) world.step(inputs, false);
      const warmupWallMs = performance.now() - warmupStart;
      const samples = new Float64Array(observe ? measuredTicks : 0);
      const phaseNames = ['controllerMs', 'stepMs', 'queryMs', 'bridgeMs', 'totalMs'];
      const phases = Object.fromEntries(
        phaseNames.map((name) => [name, new Float64Array(observe ? measuredTicks : 0)]),
      );
      const physicalTrace = [];
      const start = performance.now();
      for (let tick = 0; tick < measuredTicks; tick++) {
        const tickStart = observe ? performance.now() : 0;
        const costs = world.step(inputs, observe);
        if (observe) {
          samples[tick] = performance.now() - tickStart;
          for (const name of phaseNames) phases[name][tick] = costs[name];
        }
        if ((tick + 1) % 60 === 0)
          physicalTrace.push({
            tick: warmupTicks + tick + 1,
            states: ['car-0', 'car-35', 'car-69'].map((id) => world.project(id)),
          });
      }
      const elapsedWallMs = performance.now() - start;
      samples.sort();
      const percentile = (fraction) =>
        observe ? samples[Math.ceil(samples.length * fraction) - 1] : null;
      const nativePhasesMs = {};
      for (const name of phaseNames) {
        const values = phases[name];
        values.sort();
        nativePhasesMs[name] = {
          p50: observe ? values[Math.ceil(measuredTicks * 0.5) - 1] : null,
          p95: observe ? values[Math.ceil(measuredTicks * 0.95) - 1] : null,
          p99: observe ? values[Math.ceil(measuredTicks * 0.99) - 1] : null,
        };
      }
      captured = {
        pair,
        observer: observe,
        warmupTicks,
        measuredTicks,
        warmupWallMs,
        elapsedWallMs,
        simulatedSeconds: measuredTicks / 60,
        sampleBytes:
          samples.byteLength +
          Object.values(phases).reduce((sum, values) => sum + values.byteLength, 0),
        sampleSlotsPerChannel: observe ? measuredTicks : 0,
        nativePhasesMs,
        tickCpuMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) },
        physics: world.counts(),
        finalCar: world.project('car-0'),
        physicalTrace,
        effectiveInputHash: createHash('sha256')
          .update(JSON.stringify([...inputs]))
          .digest('hex'),
        finalPhysicalHash: createHash('sha256')
          .update(JSON.stringify([...inputs.keys()].map((id) => world.project(id))))
          .digest('hex'),
      };
    } finally {
      world.dispose();
      const bodies = world.bodyResources(),
        collisions = world.collisionResources();
      let disposedReadRejected = false;
      try {
        world.readBody(identity);
      } catch {
        disposedReadRejected = true;
      }
      if (
        bodies.entities !== 0 ||
        bodies.subscriptions !== 0 ||
        collisions.vehicles !== 0 ||
        collisions.obstacles !== 0 ||
        collisions.colliders !== 0 ||
        !collisions.disposed ||
        !disposedReadRejected
      )
        throw new Error('Baseline world cleanup failed');
      if (captured) captured.cleanup = { bodies, collisions, disposedReadRejected };
    }
    runs.push(captured);
  }
}
for (const input of inputs) {
  const bytes = await readFile(input.path);
  if (
    bytes.length !== input.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== input.sha256
  )
    throw new Error(`Source changed during baseline: ${input.path}`);
}
const nativeAfter = await readFile(nativePath);
if (
  nativeAfter.length !== nativeArtifact.bytes ||
  createHash('sha256').update(nativeAfter).digest('hex') !== nativeArtifact.sha256
)
  throw new Error('Installed native artifact changed during baseline');
try {
  await access('src/vehicles/controller.ts');
  throw new Error('Production controller appeared during baseline');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const report = {
  capturedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: source.digest('hex'),
  nativeArtifact,
  inputs,
  productionControllerAbsent: true,
  fixtureVersion: '024-before-direct-physics-v1',
  budgetVersion: '203-initial-1',
  runtime: process.version,
  runtimeArguments: process.execArgv,
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  backend: 'Real Rapier, unpaced Node CPU; no browser/GPU/FPS measurement',
  preset: null,
  cssResolution: null,
  internalResolution: null,
  workload:
    'Same manyContacts70 inputs and flat surface; direct PhysicsInput path before controller',
  observerComparison:
    'ON includes native PhysicsCosts instrumentation and external whole-step timer; same instrumentation must be used after. OFF has only elapsed wall total. Compare ON percentiles against ON after; no OFF percentile or per-decision overhead claim.',
  ownership:
    '10 sequential worlds disposed and native read rejected; this is not a 20-cycle lifecycle test.',
  scope:
    'Supplemental bounded observer-on/off CPU baseline, not wall-clock steady-state or gameplay gate',
  runs,
};
await writeFile(destination, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ saved: destination, sourceHash: report.sourceHash, runs: runs.length }),
);
