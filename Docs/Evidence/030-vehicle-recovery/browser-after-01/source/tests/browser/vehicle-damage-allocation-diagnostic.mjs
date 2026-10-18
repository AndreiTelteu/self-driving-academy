import { readFile, writeFile, mkdir, access, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, platform, release, loadavg, freemem } from 'node:os';
import { Session } from 'node:inspector';
import { performance, PerformanceObserver } from 'node:perf_hooks';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manyContacts } from '../vehicles/physics-fixture.ts';
import { createVehicleController } from '../../src/vehicles/controller.ts';
import { createVehicleController as createArchivedController } from '../../Docs/Evidence/029-vehicle-damage/source-before/src/vehicles/controller.ts';
import { CONTROLLER_CONTEXT, controllerCommand } from '../vehicles/controller-reference.ts';
import assert from 'node:assert/strict';
import { createVehicleDamage } from '../../src/vehicles/damage-state.ts';

const folder = 'Docs/Evidence/029-vehicle-damage';
const destination = `${folder}/allocation-stack-diagnostic.json`;
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
  await access(`${folder}/source-allocation-diagnostic`);
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
  'tests/browser/vehicle-damage-allocation-diagnostic.mjs',
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
await mkdir(`${folder}/source-allocation-diagnostic`, { recursive: true });
await writeFile(`${folder}/source-allocation-diagnostic/.gitattributes`, '* -text\n');
for (const path of files) {
  const bytes = await readFile(path);
  source.update(path).update(bytes);
  inputs.push({
    path,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  await mkdir(dirname(`${folder}/source-allocation-diagnostic/${path}`), { recursive: true });
  await copyFile(path, `${folder}/source-allocation-diagnostic/${path}`);
}
await mkdir(folder + '/native-allocation-diagnostic', { recursive: true });
await writeFile(folder + '/native-allocation-diagnostic/rapier.mjs', nativeBytes, { flag: 'wx' });
const inspector = new Session();
inspector.connect();
const post = (method, params = {}) =>
  new Promise((resolve, reject) =>
    inspector.post(method, params, (error, result) => (error ? reject(error) : resolve(result))),
  );
const profileOptions = {
  samplingInterval: 32768,
  includeObjectsCollectedByMajorGC: true,
  includeObjectsCollectedByMinorGC: true,
};
const relativeUrl = (url) => {
  const normalized = url.replaceAll('\\', '/');
  const root = process.cwd().replaceAll('\\', '/') + '/';
  if (normalized.startsWith('file:///' + root)) return normalized.slice(('file:///' + root).length);
  if (normalized.startsWith(root)) return normalized.slice(root.length);
  if (normalized.startsWith('node:')) return normalized;
  return normalized ? '[external-or-native]' : '[builtin-or-unmapped]';
};
const sanitizeFrame = (frame) => ({
  functionName: frame.functionName,
  url: relativeUrl(frame.url),
  lineNumber: frame.lineNumber,
  columnNumber: frame.columnNumber,
});
const boundProfile = (cpu, heap) => {
  assert.ok(cpu.nodes.length <= 20000 && (cpu.samples?.length ?? 0) <= 100000);
  assert.equal(cpu.samples?.length, cpu.timeDeltas?.length);
  cpu.nodes = cpu.nodes.map((n) => ({ ...n, callFrame: sanitizeFrame(n.callFrame) }));
  let nodes = 0;
  const visit = (n) => {
    if (++nodes > 20000) throw new Error('Allocation node bound exceeded');
    n.callFrame = sanitizeFrame(n.callFrame);
    for (const child of n.children ?? []) visit(child);
  };
  visit(heap.head);
  assert.ok((heap.samples?.length ?? 0) <= 100000);
  const profile = { cpu, heap, allocationNodes: nodes };
  const bytes = JSON.stringify(profile);
  assert.ok(Buffer.byteLength(bytes) <= 32 * 1024 * 1024, 'Serialized profile bound exceeded');
  return { profile, bytes };
};
await post('Profiler.enable');
await post('HeapProfiler.enable');
await post('Profiler.setSamplingInterval', { interval: 1000 });
const warmupTicks = 180,
  measuredTicks = 600;
const runs = [];
const gcEvents = [];
const gcSupported = PerformanceObserver.supportedEntryTypes.includes('gc');
const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (gcEvents.length >= 4096) throw new Error('GC observation capacity exceeded');
    gcEvents.push({
      startTimeMs: entry.startTime,
      durationMs: entry.duration,
      kind: entry.detail?.kind ?? null,
      flags: entry.detail?.flags ?? null,
    });
  }
});
if (gcSupported) gcObserver.observe({ entryTypes: ['gc'] });
const drainGcDelivery = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};
for (let pair = 0; pair < 5; pair++) {
  for (const profiled of pair % 2 ? [true, false] : [false, true]) {
    const observe = true;
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
      let activeProfiles = false;
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
        // Both live worlds are GC-aligned OUTSIDE timed measurement. Not a new acceptance baseline.
        global.gc?.();
        await drainGcDelivery();
        const heapLiveBeforeMeasuredGc = process.memoryUsage().heapUsed;
        const rawHeapSamples = [];
        const tickTimeline = new Float64Array(measuredTicks * 8);
        const processCpuStart = process.cpuUsage();
        const hostBefore = { loadAverage: loadavg(), freeMemoryBytes: freemem() };
        const profileStartCallMs = performance.now();
        if (profiled) {
          await post('HeapProfiler.startSampling', profileOptions);
          activeProfiles = true;
          await post('Profiler.start');
        }
        const profileSetupMs = performance.now() - profileStartCallMs;
        const start = performance.now();
        for (let tick = 0; tick < measuredTicks; tick++) {
          const row = tick * 8;
          tickTimeline[row] = performance.now();
          const packets = packetsFor(warmupTicks + tick + 1);
          tickTimeline[row + 1] = performance.now();
          const tickStart = observe ? performance.now() : 0;
          tickTimeline[row + 2] = tickStart;
          const costs = advance(warmupTicks + tick + 1, observe, packets).physics;
          tickTimeline[row + 3] = performance.now();
          if (observe) {
            samples[tick] = performance.now() - tickStart;
            incremental[tick] = samples[tick] - physicalElapsed;
            for (const name of phaseNames) phases[name][tick] = costs[name];
          }
          tickTimeline[row + 4] = performance.now();
          assert.deepEqual(
            [...lastEffective].map(([id, input]) => [
              id,
              { throttle: input.throttle, brake: input.brake, steering: input.steering },
            ]),
            [...inputs],
          );
          tickTimeline[row + 5] = performance.now();
          tickTimeline[row + 6] = performance.now();
          if ((tick + 1) % 60 === 0) {
            rawHeapSamples.push({
              measuredTick: tick + 1,
              heapUsedBytes: process.memoryUsage().heapUsed,
            });
          }
          if ((tick + 1) % 60 === 0)
            physicalTrace.push({
              tick: warmupTicks + tick + 1,
              states: ['car-0', 'car-35', 'car-69'].map((id) => world.project(id)),
            });
          tickTimeline[row + 7] = performance.now();
        }
        const measuredEnd = performance.now();
        const elapsedWallMs = measuredEnd - start;
        const heapRawImmediateAfterLoop = process.memoryUsage().heapUsed;
        const processCpuDelta = process.cpuUsage(processCpuStart);
        const hostAfter = { loadAverage: loadavg(), freeMemoryBytes: freemem() };
        const profileStopCallMs = performance.now();
        let profileMetadata = null;
        if (profiled) {
          const cpu = (await post('Profiler.stop')).profile;
          const heap = (await post('HeapProfiler.stopSampling')).profile;
          activeProfiles = false;
          const bounded = boundProfile(cpu, heap);
          const profileFile = `${folder}/allocation-profile-pair${pair}-${arm}.json`;
          await writeFile(profileFile, bounded.bytes, { flag: 'wx' });
          profileMetadata = {
            path: profileFile,
            bytes: Buffer.byteLength(bounded.bytes),
            sha256: createHash('sha256').update(bounded.bytes).digest('hex'),
            cpuNodes: cpu.nodes.length,
            cpuSamples: cpu.samples?.length ?? 0,
            allocationNodes: bounded.profile.allocationNodes,
            allocationSamples: heap.samples?.length ?? 0,
            requestedCpuIntervalUs: 1000,
            requestedHeapOptions: profileOptions,
            profileStartTimeUs: cpu.startTime,
            profileEndTimeUs: cpu.endTime,
            profileStartCallMs,
            profileStopCallMs,
          };
        }
        const profileTeardownMs = performance.now() - profileStopCallMs;
        await drainGcDelivery();
        const heapLiveBeforePostGc = process.memoryUsage().heapUsed;
        global.gc?.();
        await drainGcDelivery();
        const heapLiveAfterMeasuredGc = process.memoryUsage().heapUsed;
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
          profiled,
          profileMetadata,
          profileSetupMs,
          profileTeardownMs,
          processCpuDelta,
          hostBefore,
          hostAfter,
          tickTimelineColumns: [
            'packetStart',
            'packetEnd',
            'controllerStart',
            'controllerEnd',
            'assertionStart',
            'assertionEnd',
            'checkpointStart',
            'checkpointEnd',
          ],
          tickTimeline: Array.from(tickTimeline),
          heapBeforeWorld,
          heapLiveBeforeMeasuredGc,
          heapRawImmediateAfterLoop,
          heapLiveBeforePostGc,
          heapLiveAfterMeasuredGc,
          rawHeapSamples,
          measuredWindow: { startTimeMs: start, endTimeMs: measuredEnd },
          observationProtocol:
            '10rawheap samples at60tickcadence outsidecontroller timer, windowwall includes theircost. Botharms equal forcedGC before/after measurement with nativeworld/controller STILL LIVE; delivery drain outside window. Fulltimings now instrumented diagnostic, not acceptance nor replacement.',
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
        if (activeProfiles) {
          try {
            await post('Profiler.stop');
          } catch {}
          try {
            await post('HeapProfiler.stopSampling');
          } catch {}
        }
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
      await writeFile(
        `${folder}/allocation-run-pair${pair}-${arm}-${profiled ? 'profiled' : 'control'}.json`,
        JSON.stringify(captured),
        { flag: 'wx' },
      );
      console.log(JSON.stringify({ pair, arm, profiled, elapsedWallMs: captured.elapsedWallMs }));
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
await drainGcDelivery();
gcObserver.disconnect();
inspector.disconnect();
for (const run of runs) {
  run.gcMeasuredEvents = gcSupported
    ? gcEvents.filter(
        (entry) =>
          entry.startTimeMs >= run.measuredWindow.startTimeMs &&
          entry.startTimeMs <= run.measuredWindow.endTimeMs,
      )
    : null;
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
  fixtureVersion: '029-bounded-allocation-stack-v1',
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
    'All runs native observer ON. Control and profiled modes retain identical unsorted tick bookkeeping; profiled adds requested CPU1ms/heap32KiB collected-major/minor sampling. Inspector setup/teardown outside measured loop. Paired overhead is diagnostic, not acceptance.',
  ownership:
    '20 sequential worlds disposed and native read rejected; this is not a 20-cycle lifecycle test.',
  diagnosticProtocol:
    '5pairs alternate arm and control/profiled ordering;20worlds70cars180warmup600measured. Equal GC beforeworld/livebefore/liveafter/afterdispose outsidewindows. Tick timestamps preallocated. Local inspector Session no network listener, snapshot or values. Sampling estimates and GC overlap do not prove causality. Bounds CPU100000samples/20000nodes, heap100000samples/20000nodes/32MiB profile; inspector internal peak memory not bounded by output cap. Host frequency/thermal state uncontrolled.',
  scope:
    'Supplemental allocation/CPU-stack attribution with explicit profiler overhead; not acceptance CPU or baseline replacement',
  rawGcEvents: gcEvents,
  gcObservation: {
    supported: gcSupported,
    capacity: 4096,
    retainedEvents: gcEvents.length,
    observedOutsideMeasuredWindows: gcEvents.filter(
      (entry) =>
        !runs.some(
          (run) =>
            entry.startTimeMs >= run.measuredWindow.startTimeMs &&
            entry.startTimeMs <= run.measuredWindow.endTimeMs,
        ),
    ).length,
    deliveredAsynchronously: true,
    scope:
      'ObservedNodeGCevents; unsupported/delayed/missingevents cannot proveabsence, sums cannot decompose tickp95.',
  },
  runs,
};
await writeFile(destination, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ saved: destination, sourceHash: report.sourceHash, runs: runs.length }),
);
