import { cpus, platform, release, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  COLLISION_FIXTURE,
  collisionBaselineFixture,
} from '../tests/vehicles/collision-baseline-fixture.ts';
import { createCollisionEventAdapter } from '../src/simulation/collision-events.ts';
import { createEventBus } from '../src/simulation/event-bus.ts';

const evidence = 'Docs/Evidence/028-collision-events';
if (existsSync(`${evidence}/after.json`)) throw new Error('Preserve existing028 after capture');
const beforeBytes = readFileSync(`${evidence}/before.json`);
const beforeHash = createHash('sha256').update(beforeBytes).digest('hex');
const before = JSON.parse(beforeBytes);
if (!before.completedAt || before.runs.length !== 20) throw new Error('Incomplete before capture');
const sources = [
  ...Object.keys(before.sourceHashes),
  'scripts/benchmark-collision-events-after.mjs',
  'src/vehicles/collision-port.ts',
  'src/vehicles/collision-episodes.ts',
  'src/simulation/collision-events.ts',
  'src/simulation/event-bus.ts',
  'src/simulation/events.ts',
  'src/simulation/index.ts',
];
const hashes = () =>
  Object.fromEntries(
    sources.map((file) => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]),
  );
const sourceHashes = hashes();
for (const file of [
  'tests/vehicles/collision-baseline-fixture.ts',
  'tests/vehicles/physics-fixture.ts',
  'package-lock.json',
]) {
  if (sourceHashes[file] !== before.sourceHashes[file])
    throw new Error(`Physical fixture/version changed: ${file}`);
}
const summary = (samples) => {
  const sorted = samples.slice().sort((a, b) => a - b);
  return Object.fromEntries(
    [
      ['p50', 0.5],
      ['p95', 0.95],
      ['p99', 0.99],
    ].map(([key, p]) => [key, sorted[Math.floor((sorted.length - 1) * p)] ?? null]),
  );
};
const append = (samples, value) => {
  if (samples.length >= COLLISION_FIXTURE.sampleCapacity) throw new Error('Timing sample capacity');
  samples.push(value);
};
const report = {
  capturedAt: new Date().toISOString(),
  mode: 'AFTER_COLLISION_COMPOSITION',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  beforeSha256: beforeHash,
  sourceHashes,
  sourceArchive: `${evidence}/source-after`,
  runtime: process.version,
  physicsVersion: before.physicsVersion,
  fixture: COLLISION_FIXTURE,
  budgetVersion: before.budgetVersion,
  hardware: {
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    ramBytes: totalmem(),
    os: `${platform()} ${release()}`,
    powerScheme:
      platform() === 'win32'
        ? execFileSync('powercfg', ['/getactivescheme'], { encoding: 'utf8' }).trim()
        : null,
  },
  scope: before.scope,
  protocol: {
    tickHz: 60,
    warmupTicks: 100,
    measuredTicks: 600,
    repetitions: 5,
    worlds: 20,
    observer:
      'paired off/on; external legacy query/full pipeline/native readback/bus timers always, extra bounded capture sub-timer on only',
    legacy:
      'same existing physical fixture and query; stepAndQuery begins after composition admission and ends before collision capture',
    readback:
      'real native numContacts/contactDist/contactImpulse readback, ground/anonymous filtered; no invented IDs',
    trackerAndComposition:
      'capture elapsed minus native readback and synchronous bus publish; includes validation, episode update/drain and adapter overhead',
    diagnostics:
      'only car candidates enumerated; obs-obs and sensor counter zero does not prove native absence',
    retainedTimingSamplesPerRun: 4200,
    timingNumericPayloadBoundBytesPerRun: 33600,
    memory: before.protocol.memory,
  },
  runs: [],
};
for (const file of sources.filter((file) => !file.startsWith('node_modules/'))) {
  const archived = `${evidence}/source-after/${file}`;
  mkdirSync(dirname(archived), { recursive: true });
  copyFileSync(file, archived);
}
for (let repetition = 0; repetition < COLLISION_FIXTURE.repetitions; repetition++) {
  for (const observe of repetition % 2 ? [true, false] : [false, true]) {
    for (const dense of [false, true]) {
      const { world, inputs } = await collisionBaselineFixture(dense);
      const context = {
        schemaVersion: 1,
        units: 'SI',
        sessionId: `028-probe-${repetition}-${observe}-${dense}`,
        worldEpoch: 1,
      };
      const bus = createEventBus({ sessionId: context.sessionId, worldEpoch: 1 });
      let readbackMs = 0,
        busMs = 0,
        received = 0,
        impulseSumNs = 0;
      bus.subscribe(() => {
        received++;
      });
      const physics = {
        collisionSource: world.collisionSource,
        collisionStepSerial: () => world.collisionStepSerial(),
        readCollisionContacts: () => {
          const start = performance.now();
          const result = world.readCollisionContacts();
          readbackMs += performance.now() - start;
          return result;
        },
      };
      const wrappedBus = {
        ...bus,
        publish(value) {
          const start = performance.now();
          try {
            return bus.publish(value);
          } finally {
            busMs += performance.now() - start;
          }
        },
      };
      const adapter = createCollisionEventAdapter({ context, physics, eventBus: wrappedBus });
      const samples = Object.fromEntries(
        [
          'query',
          'stepAndQuery',
          'pipeline',
          'readback',
          'bus',
          'trackerAndComposition',
          'observerCapture',
        ].map((key) => [key, []]),
      );
      let checksum = 0,
        maxContacts = 0,
        mappedContacts = 0,
        maxMappedContacts = 0,
        emitted = 0;
      const counts = world.counts();
      global.gc?.();
      const heapBefore = process.memoryUsage().heapUsed,
        wallStart = performance.now();
      let disposedAdapter, disposedBus;
      try {
        for (let tick = 0; tick < 700; tick++) {
          readbackMs = 0;
          busMs = 0;
          const pipelineStart = performance.now();
          if (!adapter.beforePhysicsStep(tick).ready) throw new Error('Blocked collision pipeline');
          const stepStart = performance.now();
          world.step(inputs, false);
          const queryStart = performance.now(),
            contacts = world.contacts(),
            queryEnd = performance.now();
          if (!Number.isSafeInteger(contacts) || contacts < 0)
            throw new Error('Invalid native contacts');
          checksum += contacts;
          maxContacts = Math.max(maxContacts, contacts);
          const captureStart = performance.now(),
            observedStart = observe ? performance.now() : 0;
          const result = adapter.captureAfterPhysicsStep(tick);
          const observedEnd = observe ? performance.now() : 0,
            captureEnd = performance.now();
          if (result.publication.pending || result.publication.listenerFailures)
            throw new Error('Collision delivery incomplete');
          emitted += result.emitted;
          mappedContacts += result.readback.contacts.length;
          maxMappedContacts = Math.max(maxMappedContacts, result.readback.contacts.length);
          for (const contact of result.readback.contacts) impulseSumNs += contact.impulseNs;
          if (tick >= 100) {
            append(samples.query, queryEnd - queryStart);
            append(samples.stepAndQuery, queryEnd - stepStart);
            append(samples.pipeline, captureEnd - pipelineStart);
            append(samples.readback, readbackMs);
            append(samples.bus, busMs);
            append(
              samples.trackerAndComposition,
              Math.max(0, captureEnd - captureStart - readbackMs - busMs),
            );
            if (observe) append(samples.observerCapture, observedEnd - observedStart);
          }
        }
        if (emitted !== received || maxMappedContacts === 0 || impulseSumNs <= 0)
          throw new Error('No real mapped collision/impulse or delivery mismatch');
      } finally {
        adapter.dispose();
        disposedAdapter = adapter.getStats();
        bus.dispose();
        disposedBus = bus.getStats();
        world.dispose();
      }
      const elapsedWallMs = performance.now() - wallStart;
      const original = before.runs.find(
        (row) => row.repetition === repetition && row.observe === observe && row.dense === dense,
      );
      if (original.checksum !== checksum || original.maxContacts !== maxContacts)
        throw new Error('Before/after native fixture diverged');
      const paired = report.runs.find(
        (row) => row.repetition === repetition && row.dense === dense,
      );
      if (
        paired &&
        (paired.emitted !== emitted ||
          paired.mappedContacts !== mappedContacts ||
          paired.impulseSumNs !== impulseSumNs)
      )
        throw new Error('Observer changed native incidents');
      const resources = world.bodyResources(),
        collisionResources = world.collisionResources();
      if (
        resources.entities ||
        resources.subscriptions ||
        collisionResources.colliders ||
        disposedAdapter.trackedPairs ||
        disposedAdapter.pending ||
        disposedBus.listeners ||
        disposedBus.retainedEvents
      )
        throw new Error('Retained disposed ownership');
      let disposedReadRejected = false;
      try {
        world.counts();
      } catch {
        disposedReadRejected = true;
      }
      if (!disposedReadRejected) throw new Error('Disposed world readable');
      global.gc?.();
      report.runs.push({
        repetition,
        observe,
        dense,
        counts,
        checksum,
        maxContacts,
        mappedContacts,
        maxMappedContacts,
        emitted,
        received,
        impulseSumNs,
        elapsedWallMs,
        metrics: Object.fromEntries(
          Object.entries(samples).map(([key, values]) => [
            key,
            { count: values.length, ...summary(values) },
          ]),
        ),
        heapBeforeBytes: heapBefore,
        heapAfterBytes: process.memoryUsage().heapUsed,
        forcedGc: typeof global.gc === 'function',
        disposed: {
          body: resources,
          collision: collisionResources,
          adapter: disposedAdapter,
          bus: disposedBus,
        },
        disposedReadRejected,
      });
      if (JSON.stringify(hashes()) !== JSON.stringify(sourceHashes))
        throw new Error('After source drift');
      if (
        createHash('sha256')
          .update(readFileSync(`${evidence}/before.json`))
          .digest('hex') !== beforeHash
      )
        throw new Error('Before raw capture changed');
      writeFileSync(`${evidence}/after.json`, JSON.stringify(report, null, 2));
      console.log(
        `028 after repetition${repetition + 1}/5 observer=${observe} dense=${dense} saved`,
      );
    }
  }
}
report.medians = [false, true].flatMap((observe) =>
  [false, true].map((dense) => {
    const rows = report.runs.filter((row) => row.observe === observe && row.dense === dense);
    return {
      observe,
      dense,
      metrics: Object.fromEntries(
        Object.keys(rows[0].metrics).map((key) => [
          key,
          summary(rows.map((row) => row.metrics[key].p95)).p50,
        ]),
      ),
    };
  }),
);
report.completedAt = new Date().toISOString();
writeFileSync(`${evidence}/after.json`, JSON.stringify(report, null, 2));
