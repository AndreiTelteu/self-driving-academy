import { readFile, writeFile, mkdir, access, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manyContacts } from '../vehicles/physics-fixture.ts';
import { createVehicleController } from '../../src/vehicles/controller.ts';
import { createVehicleController as createArchivedController } from '../../Docs/Evidence/029-vehicle-damage/source-before/src/vehicles/controller.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../vehicles/controller-reference.ts';
import assert from 'node:assert/strict';
import { createVehicleDamage } from '../../src/vehicles/damage-state.ts';

const folder = 'Docs/Evidence/029-vehicle-damage';
const destination = `${folder}/same-host-diagnostic.json`;
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')).replace(
  /rapier\.cjs$/,
  'rapier.mjs',
);
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
  await access(`${folder}/source-diagnostic`);
  throw new Error('Immutable before source archive already exists; preserve the previous attempt');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
await access('src/vehicles/controller.ts');
const before = JSON.parse(await readFile(folder + '/before-node.json', 'utf8'));
const files = execFileSync('rg', ['--files', 'src/vehicles', 'src/sessions'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((path) => path.replaceAll('\\', '/'));
files.push(
  'tests/vehicles/physics-fixture.ts',
  'tests/vehicles/controller-reference.ts',
  'tests/browser/vehicle-damage-diagnostic.mjs',
  'tests/browser/vehicle-damage-calibration.mjs',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
files.push(
  ...before.inputs.map((input) => 'Docs/Evidence/029-vehicle-damage/source-before/' + input.path),
);
for (const input of before.inputs) {
  const original = await readFile('Docs/Evidence/029-vehicle-damage/source-before/' + input.path);
  assert.equal(createHash('sha256').update(original).digest('hex'), input.sha256);
}
assert.equal(nativeArtifact.sha256, before.nativeArtifact.sha256);
files.sort();
const source = createHash('sha256'),
  inputs = [];
await mkdir(`${folder}/source-diagnostic`, { recursive: true });
await writeFile(`${folder}/source-diagnostic/.gitattributes`, '* -text\n');
for (const path of files) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  await mkdir(dirname(`${folder}/source-diagnostic/${path}`), { recursive: true });
  await copyFile(path, `${folder}/source-diagnostic/${path}`);
}
await mkdir(folder + '/native-diagnostic', { recursive: true });
await writeFile(folder + '/native-diagnostic/rapier.mjs', nativeBytes, { flag: 'wx' });
const warmupTicks = 180,
  measuredTicks = 600;
const runs = [];
for (let pair = 0; pair < 5; pair++) {
  for (const observe of pair % 2 ? [true, false] : [false, true]) {
    for (const arm of pair % 2
      ? ['CURRENT_029', 'ARCHIVED_024']
      : ['ARCHIVED_024', 'CURRENT_029']) {
      global.gc?.();
      const heapBeforeWorld = process.memoryUsage().heapUsed;
      const { world, inputs } = await manyContacts(70);
      const identity = world.bodyIdentity('car-0');
      const damage =
        arm === 'CURRENT_029' ? createVehicleDamage(CONTROLLER_CONTEXT, world) : undefined;
      for (const id of inputs.keys()) damage?.register(world.bodyIdentity(id), 1400);
      let captured;
      let physicalElapsed = 0;
      let lastEffective;
      const factory = arm === 'CURRENT_029' ? createVehicleController : createArchivedController;
      const controller = factory(
        CONTROLLER_CONTEXT,
        {
          bodyIdentity: (id) => world.bodyIdentity(id),
          step(effective, measure) {
            lastEffective = effective;
            const start = measure ? performance.now() : 0;
            const result = world.step(effective, measure);
            physicalElapsed = measure ? performance.now() - start : 0;
            return result;
          },
        },
        0,
        { availability: damage },
      );
      for (const id of inputs.keys()) controller.register(world.bodyIdentity(id));
      const packetsFor = (tick) =>
        (tick - 1) % 6 === 0
          ? [...inputs].map(([id, input]) => ({
              identity: world.bodyIdentity(id),
              command: controllerCommand(id, tick, 'AUTONOMY', input),
            }))
          : [];
      const advance = (tick, observe, packets = packetsFor(tick)) =>
        controller.step({ tick, dtSeconds: 1 / 60 }, packets, [], observe);
      try {
        const warmupStart = performance.now();
        for (let tick = 0; tick < warmupTicks; tick++) advance(tick + 1, false);
        const warmupWallMs = performance.now() - warmupStart;
        const samples = new Float64Array(observe ? measuredTicks : 0);
        const incremental = new Float64Array(observe ? measuredTicks : 0);
        const phaseNames = ['controllerMs', 'stepMs', 'queryMs', 'bridgeMs', 'totalMs'];
        const phases = Object.fromEntries(
          phaseNames.map((name) => [name, new Float64Array(observe ? measuredTicks : 0)]),
        );
        const physicalTrace = [];
        const start = performance.now();
        for (let tick = 0; tick < measuredTicks; tick++) {
          const packets = packetsFor(warmupTicks + tick + 1);
          const tickStart = observe ? performance.now() : 0;
          const costs = advance(warmupTicks + tick + 1, observe, packets).physics;
          if (observe) {
            samples[tick] = performance.now() - tickStart;
            incremental[tick] = samples[tick] - physicalElapsed;
            for (const name of phaseNames) phases[name][tick] = costs[name];
          }
          assert.deepEqual(
            [...lastEffective].map(([id, input]) => [
              id,
              { throttle: input.throttle, brake: input.brake, steering: input.steering },
            ]),
            [...inputs],
          );
          if ((tick + 1) % 60 === 0)
            physicalTrace.push({
              tick: warmupTicks + tick + 1,
              states: ['car-0', 'car-35', 'car-69'].map((id) => world.project(id)),
            });
        }
        const elapsedWallMs = performance.now() - start;
        samples.sort();
        incremental.sort();
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
          arm,
          heapBeforeWorld,
          heapAfterMeasured: process.memoryUsage().heapUsed,
          pair,
          observer: observe,
          warmupTicks,
          measuredTicks,
          warmupWallMs,
          elapsedWallMs,
          simulatedSeconds: measuredTicks / 60,
          sampleBytes:
            samples.byteLength +
            incremental.byteLength +
            Object.values(phases).reduce((sum, values) => sum + values.byteLength, 0),
          sampleSlotsPerChannel: observe ? measuredTicks : 0,
          nativePhasesMs,
          tickCpuMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) },
          controllerIncrementalMs: {
            p50: observe ? incremental[299] : null,
            p95: observe ? incremental[569] : null,
            p99: observe ? incremental[593] : null,
          },
          incrementalScope:
            'External whole-controller elapsed minus wrapped physical-port elapsed; includes admission, arbitration, realization, actuation dispatch, descriptor validation and two extra clocks. Packet preparation and semantic assertions occur outside sampled controller timing. Elapsed wall total includes them and remains diagnostic. Not a separately isolated algorithm timer.',
          controllerStats: controller.getStats(),
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
        controller.dispose();
        damage?.dispose();
        if (damage) assert.equal(damage.getStats().vehicles, 0);
        if (damage) assert.equal(damage.getStats().historyRecords, 0);
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
        if (captured)
          captured.cleanup = {
            bodies,
            collisions,
            disposedReadRejected,
            controller: controller.getStats(),
          };
      }
      global.gc?.();
      captured.heapAfterDisposedGc = process.memoryUsage().heapUsed;
      runs.push(captured);
    }
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
for (const run of runs) {
  const reference = before.runs.find(
    (row) => row.pair === run.pair && row.observer === run.observer,
  );
  assert.equal(run.finalPhysicalHash, reference.finalPhysicalHash);
  assert.equal(run.effectiveInputHash, reference.effectiveInputHash);
  assert.equal(JSON.stringify(run.physicalTrace), JSON.stringify(reference.physicalTrace));
}
const report = {
  capturedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: source.digest('hex'),
  nativeArtifact,
  inputs,
  productionControllerPresent: true,
  beforeSourceHash: before.sourceHash,
  damageMode: 'CONTROLLED_ARCHIVED024_VS_CURRENT029_AVAILABLE_DIAGNOSTIC_NOT_BASELINE_REPLACEMENT',
  exactPhysicalCompatibility: true,
  fixtureVersion: '029-same-process-paired-diagnostic-v1',
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
    'Same manyContacts70 inputs and flat surface; actual unified AUTO controller at 60Hz with fresh targets at 10Hz',
  observerComparison:
    'ON includes native PhysicsCosts instrumentation and external whole-step timer; same instrumentation must be used after. OFF has only elapsed wall total. Compare ON percentiles against ON before; no OFF percentile or per-decision overhead claim.',
  ownership:
    '20 sequential worlds disposed and native read rejected; this is not a 20-cycle lifecycle test.',
  diagnosticProtocol:
    '5pairs, sameprocess, alternatearmsperpair, observeroff/onorderalternates. GC beforeworld andafterdispose equally BOTHarms, nonewithinmeasurement.180warmup/600measure, ALL70nativecars. Hostfrequency/thermal state isnotcontrolled; nocausality/autopassorbaseline-replacement claim.',
  scope:
    'Supplemental bounded observer-on/off CPU baseline, not wall-clock steady-state or gameplay gate',
  runs,
};
await writeFile(destination, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ saved: destination, sourceHash: report.sourceHash, runs: runs.length }),
);
