import { readFile, writeFile, mkdir, access, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manyContacts } from '../vehicles/physics-fixture.ts';
import { createVehicleController } from './vehicle-damage-stage-copy/controller.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../vehicles/controller-reference.ts';
import assert from 'node:assert/strict';
import { createVehicleDamage } from '../../src/vehicles/damage-state.ts';

const startedAt = new Date().toISOString();
const folder = 'Docs/Evidence/029-vehicle-damage';
const destination = `${folder}/final-stage-diagnostic.json`;
const nativePath = fileURLToPath(import.meta.resolve('@dimforge/rapier3d-compat')).replace(
  /rapier\.cjs$/,
  'rapier.mjs',
);
const nativeBytes = await readFile(nativePath);
const nativeArtifact = {
  path: nativePath,
  archiveRelativePath: `${folder}/native-final-stage-diagnostic/rapier.mjs`,
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
  await access(`${folder}/source-final-stage-diagnostic`);
  throw new Error('Immutable before source archive already exists; preserve the previous attempt');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const productionControllerBytes = await readFile('src/vehicles/controller.ts');
const derivation = JSON.parse(await readFile('tests/browser/vehicle-damage-stage-copy/derivation.json','utf8'));
assert.equal(createHash('sha256').update(productionControllerBytes).digest('hex'),derivation.productionControllerSha256);
assert.equal(productionControllerBytes.length,derivation.productionControllerBytes);
const instrumentedControllerBytes = await readFile('tests/browser/vehicle-damage-stage-copy/controller.ts');
assert.equal(createHash('sha256').update(instrumentedControllerBytes).digest('hex'),derivation.instrumentedControllerSha256);
assert.equal(instrumentedControllerBytes.length,derivation.instrumentedControllerBytes);
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),derivation.productionCommit);
await access('src/vehicles/controller.ts');
const before = JSON.parse(await readFile(folder + '/before-node.json', 'utf8'));
const files = execFileSync('rg', ['--files', 'src/vehicles', 'src/sessions', 'src/settings', 'src/input'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((path) => path.replaceAll('\\', '/'));
files.push(
  'tests/vehicles/physics-fixture.ts',
  'tests/vehicles/controller-reference.ts',
  'tests/browser/vehicle-damage-final-stage-diagnostic.mjs',
  'tests/browser/vehicle-damage-stage-copy/controller.ts',
  'tests/browser/vehicle-damage-stage-copy/derivation.json',
  folder + '/before-node.json',
  'scripts/register-typescript.mjs',
  'package.json',
  'package-lock.json',
  'Docs/performance-budgets.json',
);
files.sort();
const source = createHash('sha256'),
  inputs = [];
await mkdir(`${folder}/source-final-stage-diagnostic`, { recursive: true });
await writeFile(`${folder}/source-final-stage-diagnostic/.gitattributes`, '* -text\n');
for (const path of files) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  await mkdir(dirname(`${folder}/source-final-stage-diagnostic/${path}`), { recursive: true });
  await copyFile(path, `${folder}/source-final-stage-diagnostic/${path}`);
}
await mkdir(folder + '/native-final-stage-diagnostic', { recursive: true });
await writeFile(folder + '/native-final-stage-diagnostic/rapier.mjs', nativeBytes, { flag: 'wx' });
const archivedAt = new Date().toISOString();
let firstWorldAt = null;
await writeFile(`${folder}/final-stage-start.json`,JSON.stringify({startedAt,archivedAt,sourceHash:source.copy().digest('hex'),inputs,nativeArtifact,instrumentedCopyDerivation:derivation},null,2),{flag:'wx'});
const warmupTicks = 180,
  measuredTicks = 600;
const runs = [];
assert.equal(nativeArtifact.sha256,before.nativeArtifact.sha256);
assert.equal(nativeArtifact.bytes,before.nativeArtifact.bytes);
for (let pair = 0; pair < 5; pair++) {
  for (const stageObserver of pair % 2 ? [true, false] : [false, true]) {
    const observe = true;
    const stageWindows = new Float64Array(stageObserver ? 600 * 70 * 2 : 0);
    const stageCounts = new Uint16Array(600);
    if(firstWorldAt === null) {
      firstWorldAt = new Date().toISOString();
      await writeFile(`${folder}/final-stage-first-world.json`,JSON.stringify({startedAt,archivedAt,firstWorldAt},null,2),{flag:'wx'});
    }
    const { world, inputs } = await manyContacts(70);
    const identity = world.bodyIdentity('car-0');
    const damage = createVehicleDamage(CONTROLLER_CONTEXT, world);
    for (const id of inputs.keys()) damage.register(world.bodyIdentity(id), 1400);
    let captured;
    let physicalElapsed = 0;
    let lastEffective;
    const controller = createVehicleController(
      CONTROLLER_CONTEXT,
      {
        bodyIdentity: (id) => world.bodyIdentity(id),
        readBody: (identity) => world.readBody(identity),
        step(effective, measure) {
          lastEffective = effective;
          const start = measure ? performance.now() : 0;
          const result = world.step(effective, measure);
          physicalElapsed = measure ? performance.now() - start : 0;
          return result;
        },
      },
      0,
      { availability: damage, drivetrainVersion: '027-braking-reverse-v1' },
      stageObserver ? (tick,start,end) => {
        const row = tick-181;
        assert.ok(row>=0 && row<600 && Number.isFinite(start) && Number.isFinite(end) && end>=start);
        const slot=stageCounts[row]++;
        assert.ok(slot<70,'Stage observation capacity exceeded');
        stageWindows[(row*70+slot)*2]=start;
        stageWindows[(row*70+slot)*2+1]=end;
      } : undefined,
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
      const rawTickCpuMs = Array.from(samples);
      const rawControllerIncrementalMs = Array.from(incremental);
      if(stageObserver) for(const count of stageCounts) assert.equal(count,70);
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
        startedAt,
        archivedAt,
        firstWorldAt,
        pair,
        observer: observe,
        stageObserver,
        rawTickCpuMs,
        rawControllerIncrementalMs,
        stageSampleBytes:stageWindows.byteLength+stageCounts.byteLength,
        stageWindowsMs:Array.from(stageWindows),
        stageCounts:Array.from(stageCounts),
        stageWindowScope:'From finalPhysicalInput setup through availability magnitude/signed-input/projection calculation and clones; excludes observer callback but includes observer clocks and shared guard. Not pure allocation time; instrumented copy only.',
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
      damage.dispose();
      assert.equal(damage.getStats().vehicles, 0);
      assert.equal(damage.getStats().historyRecords, 0);
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
    runs.push(captured);
    const bytes=JSON.stringify(captured);
    assert.ok(Buffer.byteLength(bytes)<=32*1024*1024,'Run serialization bound exceeded');
    await writeFile(`${folder}/final-stage-pair${pair}-${stageObserver ? 'on' : 'off'}.json`,bytes,{flag:'wx'});
    console.log(JSON.stringify({pair,stageObserver,elapsedWallMs:captured.elapsedWallMs}));
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
for (let index = 0; index < runs.length; index++) {
  const run = runs[index],
    reference = before.runs.find(r=>r.pair===run.pair && r.observer);
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
  startedAt,
  archivedAt,
  firstWorldAt,
  productionControllerPresent: true,
  instrumentedControllerUsed: true,
  instrumentedCopyDerivation:derivation,
  beforeSourceHash: before.sourceHash,
  damageMode: 'AVAILABLE_PROVIDER_ENABLED_ALL70',
  exactPhysicalCompatibility: true,
  fixtureVersion: '029-final-transform-stage-diagnostic-v1',
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
    'Native observer ON in BOTH arms, same current instrumented copy. Five stage-observerOFF/ON pairs, alternating order. OFF performs observer guard only; ON adds two clocks and bounded per-car record writer. Whole-tick/wall differences quantify instrumentation plus host variance, not exact observer overhead or acceptance.',
  ownership:
    '10 sequential worlds disposed and native read rejected; this is not a 20-cycle lifecycle test.',
  scope:
    'Diagnostic of NEW post027 finalTransform calculation/clones only. Original chronological v5FAIL5/5 remains unchanged. Not acceptance CPU, baseline replacement, allocation-byte attribution or hardware/FPS. No inspector profiler or forcedGC.',
  runs,
};
await writeFile(destination, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ saved: destination, sourceHash: report.sourceHash, runs: runs.length }),
);
