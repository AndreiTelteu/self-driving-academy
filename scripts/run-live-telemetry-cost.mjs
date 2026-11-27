import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * PBI 272 local cost probe. It measures the real writer over the live V3 composition (58 vehicles)
 * with one MANUAL player segment, using the same fixed 60 Hz ticks. This is a software measurement
 * of the telemetry delta, not a browser/FPS/GPU or hardware claim.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  evidence = join(root, 'Docs', 'Evidence', '272-live-telemetry'),
  output = join(evidence, 'cost.json');

const app = await import(pathToFileURL(join(root, 'src', 'app', 'index.ts')).href);
const settings = await import(pathToFileURL(join(root, 'src', 'settings', 'index.ts')).href);

const context = Object.freeze({
  schemaVersion: 1,
  units: 'SI',
  sessionId: '272-cost-probe',
  worldEpoch: 1,
});
const world = app.createCompositionWorld();
const ambient = app.createAmbientTraffic({
  map: world.map,
  graph: world.graph,
  context,
  seed: 272,
  focus: { x: world.spawn.x, z: world.spawn.z },
  avoid: [
    { x: world.spawn.x, z: world.spawn.z },
    ...world.vehicles.map((vehicle) => ({
      x: vehicle.positionM.x,
      z: vehicle.positionM.z,
    })),
  ],
});
const modelRef = { current: undefined };
const segments = app.createLiveModeSegments({
  context,
  playerId: '272-player',
  profileId: 'profile-272-cost',
  baseVersionId: 'profile-272-cost@1',
  learningEpoch: 0,
  controlPreferencesVersion: 'control-272',
  engineVersion: 'engine-272',
  mapVersion: world.map.mapId,
  learningEligible: true,
  readAuthority: () =>
    modelRef.current === undefined
      ? { tick: 0, playerVehicleId: null, mode: 'AUTO', suspended: false }
      : modelRef.current.modeAuthority(),
});
const model = app.createV3Composition({
  layout: world.layout,
  start: world.spawn,
  control: settings.createDefaultSettings('272-cost').input.control,
  context,
  vehicles: world.vehicles,
  traffic: ambient.traffic,
  map: world.map,
  graph: world.graph,
});
modelRef.current = model;
model.attachModeSegments(segments);
const telemetry = app.createLiveTelemetryComposition({
  context,
  map: world.map,
  graph: world.graph,
  playerId: '272-player',
  modeSegments: () => segments,
  worldCapacity: 16_384,
});

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.floor((ordered.length - 1) * fraction))];
}

function summary(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return {
    samples: ordered.length,
    meanMs: ordered.reduce((sum, value) => sum + value, 0) / Math.max(1, ordered.length),
    p50Ms: percentile(ordered, 0.5),
    p95Ms: percentile(ordered, 0.95),
    p99Ms: percentile(ordered, 0.99),
    maxMs: ordered.at(-1) ?? 0,
  };
}

let tick = 0;
for (; tick < 30; tick += 1) {
  model.step({ tick: tick + 1 });
  telemetry.step(model.frame);
}
const taxi = ambient.list().find((actor) => actor.driverKind === 'TAXI');
model.selectVehicle(taxi.vehicleId);
model.requestModeAction('M');
tick += 1;
model.step({ tick });
telemetry.step(model.frame);
model.port.setAction('throttle', true);

const writerSamples = [];
const modelSamples = [];
for (let index = 0; index < 300; index += 1) {
  tick += 1;
  const modelStart = process.hrtime.bigint();
  model.step({ tick });
  const modelEnd = process.hrtime.bigint();
  const writerStart = process.hrtime.bigint();
  telemetry.step(model.frame);
  const writerEnd = process.hrtime.bigint();
  modelSamples.push(Number(modelEnd - modelStart) / 1e6);
  writerSamples.push(Number(writerEnd - writerStart) / 1e6);
}

globalThis.gc?.();
const heapBefore = process.memoryUsage().heapUsed;
const stats = telemetry.getStats();
globalThis.gc?.();
const heapAfter = process.memoryUsage().heapUsed;

const report = {
  version: '272-live-telemetry-cost-v1',
  label: 'PROVISIONAL_UNCALIBRATED',
  scope: 'writer step over the live V3 composition, 58 vehicles, one MANUAL player segment',
  hardware: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    cpu: cpus()[0]?.model ?? 'unknown',
  },
  ticks: writerSamples.length,
  vehicles: stats.vehiclesObserved,
  writer: summary(writerSamples),
  model: summary(modelSamples),
  memory: {
    ...stats.memory,
    heapUsedBytesBefore: heapBefore,
    heapUsedBytesAfter: heapAfter,
    note: 'bufferBytes are exact typed-array/identity ownership; heap is measured with --expose-gc and is not an exact total',
  },
  samples: {
    recorded: stats.samplesRecorded,
    rejected: stats.samplesRejected,
    worldRetained: stats.worldSamplesRetained,
    worldCapacity: stats.worldCapacity,
  },
  determinism: {
    wallClockUsedForSimulation: false,
    fpxClaimed: false,
  },
};

await mkdir(evidence, { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `writer p50 ${report.writer.p50Ms.toFixed(4)} ms, p95 ${report.writer.p95Ms.toFixed(4)} ms, max ${report.writer.maxMs.toFixed(4)} ms`,
);
console.log(
  `memory ${report.memory.totalBytes} B of ${report.memory.budgetBytes} B (within ${String(report.memory.withinBudget)})`,
);
console.log(`Wrote ${output}`);

try {
  telemetry.dispose();
} finally {
  segments.dispose();
  model.dispose();
  ambient.dispose();
}
