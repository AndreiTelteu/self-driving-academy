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

if (!process.argv.includes('--baseline')) throw new Error('028 after probe is not implemented yet');
const evidence = 'Docs/Evidence/028-collision-events';
if (existsSync(`${evidence}/before.json`))
  throw new Error('028 baseline already exists; preserve its raw capture');
const futureAlgorithmFiles = [
  'src/vehicles/collision-port.ts',
  'src/vehicles/collision-episodes.ts',
  'src/simulation/collision-events.ts',
];
if (futureAlgorithmFiles.some((file) => existsSync(file)))
  throw new Error('028 production algorithm exists before baseline');
const sources = [
  'scripts/benchmark-collision-events.mjs',
  'tests/vehicles/collision-baseline-fixture.ts',
  'tests/vehicles/physics-fixture.ts',
  'src/vehicles/physics.ts',
  'src/vehicles/rapier/index.ts',
  'src/vehicles/body-port.ts',
  'src/vehicles/body-registry.ts',
  'src/vehicles/vehicle-classes.ts',
  'src/vehicles/index.ts',
  'src/vehicles/contracts.ts',
  'src/sessions/index.ts',
  'src/sessions/validation.ts',
  'src/sessions/identity.ts',
  'src/sessions/random.ts',
  'node_modules/@dimforge/rapier3d-compat/package.json',
  'node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs',
  'package-lock.json',
];
const hashes = () =>
  Object.fromEntries(
    sources.map((file) => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]),
  );
const sourceHashes = hashes();
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
  if (samples.length >= COLLISION_FIXTURE.sampleCapacity)
    throw new Error('028 observer sample capacity');
  samples.push(value);
};
const report = {
  capturedAt: new Date().toISOString(),
  mode: 'BEFORE_LEGACY_CONTACT_QUERY',
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHashes,
  beforeAlgorithmProof: {
    productionFilesAbsent: futureAlgorithmFiles,
    owner: 'Codex gpt-6.1-sol medium PBI028',
    sourceArchive: `${evidence}/source-before`,
  },
  runtime: process.version,
  physicsVersion: 'Rapier0.21.0 /021-raycast-v1',
  fixture: COLLISION_FIXTURE,
  budgetVersion: '203-initial-1',
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
  scope:
    'Supplemental sequential Node CPU; no renderer, GPU, FPS, real-time throughput, 120s wall-time or complete-tick budget claim',
  protocol: {
    tickHz: 60,
    simulatedWarmupSeconds: COLLISION_FIXTURE.warmupTicks / 60,
    simulatedMeasuredSeconds: COLLISION_FIXTURE.measuredTicks / 60,
    wallWarmupSeconds: null,
    wallMeasuredSeconds: null,
    observer:
      'paired off/on: external contact query and whole-tick timing always; bounded sub-timer around native query only on',
    seed: 'none; existing deterministic manyContacts grid and commands',
    retainedTimingSamplesPerRun: 1800,
    timingNumericPayloadBoundBytesPerRun: 14400,
    contactsMeaning:
      'legacy numSolverContacts summed for native dynamic collider pairs, includes ground and anonymous obstacles; not incident count or impulse',
    memory:
      'forced-GC heap diagnostic if available; application-owned entity/subscription counts; exact WASM allocator memory unavailable',
  },
  runs: [],
};
mkdirSync(evidence, { recursive: true });
for (const file of sources.filter((file) => !file.startsWith('node_modules/'))) {
  const archived = `${evidence}/source-before/${file}`;
  mkdirSync(dirname(archived), { recursive: true });
  copyFileSync(file, archived);
}
for (let repetition = 0; repetition < COLLISION_FIXTURE.repetitions; repetition++) {
  // Alternate observer order to avoid always assigning the warmer process to observer-on.
  for (const observe of repetition % 2 ? [true, false] : [false, true]) {
    for (const dense of [false, true]) {
      const { world, inputs } = await collisionBaselineFixture(dense);
      const querySamples = [],
        tickSamples = [],
        observerSamples = [];
      let checksum = 0,
        maxContacts = 0;
      const counts = world.counts();
      global.gc?.();
      const heapBefore = process.memoryUsage().heapUsed;
      const wallStart = performance.now();
      try {
        for (
          let tick = 0;
          tick < COLLISION_FIXTURE.warmupTicks + COLLISION_FIXTURE.measuredTicks;
          tick++
        ) {
          const tickStart = performance.now();
          world.step(inputs, false);
          const queryStart = performance.now();
          const observedStart = observe ? performance.now() : 0;
          const contacts = world.contacts();
          const observedEnd = observe ? performance.now() : 0;
          const queryEnd = performance.now();
          if (!Number.isSafeInteger(contacts) || contacts < 0)
            throw new Error('028 invalid native contact count');
          checksum += contacts;
          maxContacts = Math.max(maxContacts, contacts);
          if (tick >= COLLISION_FIXTURE.warmupTicks) {
            append(querySamples, queryEnd - queryStart);
            append(tickSamples, queryEnd - tickStart);
            if (observe) append(observerSamples, observedEnd - observedStart);
          }
        }
      } finally {
        world.dispose();
      }
      const elapsedWallMs = performance.now() - wallStart;
      if (maxContacts === 0) throw new Error('028 native fixture produced no solver contacts');
      const paired = report.runs.find(
        (row) => row.repetition === repetition && row.dense === dense,
      );
      if (paired && (paired.checksum !== checksum || paired.maxContacts !== maxContacts))
        throw new Error('028 paired fixture diverged with observer state');
      if (world.bodyResources().entities !== 0 || world.bodyResources().subscriptions !== 0)
        throw new Error('028 disposed registry retained resources');
      let disposedReadRejected = false;
      try {
        world.counts();
      } catch {
        disposedReadRejected = true;
      }
      if (!disposedReadRejected) throw new Error('028 disposed native world remained readable');
      global.gc?.();
      report.runs.push({
        repetition,
        observe,
        dense,
        counts,
        checksum,
        maxContacts,
        elapsedWallMs,
        queryCpuMs: { count: querySamples.length, ...summary(querySamples) },
        stepAndQueryCpuMs: { count: tickSamples.length, ...summary(tickSamples) },
        observerQueryCpuMs: { count: observerSamples.length, ...summary(observerSamples) },
        heapBeforeBytes: heapBefore,
        heapAfterBytes: process.memoryUsage().heapUsed,
        forcedGc: typeof global.gc === 'function',
        disposed: world.bodyResources(),
        disposedReadRejected,
      });
      if (JSON.stringify(hashes()) !== JSON.stringify(sourceHashes))
        throw new Error('028 source closure changed during capture');
      writeFileSync(`${evidence}/before.json`, JSON.stringify(report, null, 2));
      console.log(
        `028 before repetition${repetition + 1}/5 observer=${observe} dense=${dense} saved`,
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
      queryP95MedianMs: summary(rows.map((row) => row.queryCpuMs.p95)).p50,
      stepAndQueryP95MedianMs: summary(rows.map((row) => row.stepAndQueryCpuMs.p95)).p50,
    };
  }),
);
report.completedAt = new Date().toISOString();
writeFileSync(`${evidence}/before.json`, JSON.stringify(report, null, 2));
