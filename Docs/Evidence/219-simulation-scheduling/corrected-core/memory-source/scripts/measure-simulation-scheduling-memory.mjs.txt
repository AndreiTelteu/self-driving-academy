import assert from 'node:assert/strict';
import { cpus, platform, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSimulationScheduler, SCHEDULING_LIMITS } from '../src/simulation/scheduling.ts';

if (!global.gc) throw new Error('Run with --expose-gc');
const evidence =
  'Docs/Evidence/219-simulation-scheduling' +
  (process.argv.includes('--corrected-core') ? '/corrected-core' : '');
if (existsSync(`${evidence}/memory.json`))
  throw new Error('Memory evidence already exists; preserve original before another capture');
const files = [
  'scripts/measure-simulation-scheduling-memory.mjs',
  'src/simulation/scheduling.ts',
  'src/simulation/index.ts',
  'src/sessions/validation.ts',
  'src/sessions/index.ts',
];
const sourceHashes = Object.fromEntries(
  files.map((file) => {
    const bytes = readFileSync(file),
      hash = createHash('sha256').update(bytes).digest('hex');
    const archive = `${evidence}/memory-source/${file}.txt`;
    mkdirSync(dirname(archive), { recursive: true });
    writeFileSync(archive, bytes);
    return [file, hash];
  }),
);
const actors = Array.from({ length: 110 }, (_, id) => ({ id: `actor-${id}`, incarnation: 1 }));
let results = 0,
  tasks = 0,
  disposedTasks = 0;
const engine = createSimulationScheduler({
  sessionId: '219-memory',
  worldEpoch: 0,
  ports: {
    input() {},
    decision() {},
    controller() {},
    physics() {},
    routeResult() {
      results++;
    },
    createRouteTask(request) {
      tasks++;
      return {
        step() {
          if (request.destination === 'pending') return { done: false, path: null };
          return {
            done: true,
            path: [
              request.origin,
              ...Array.from({ length: 254 }, (_, index) => `lane-${index}`.padEnd(256, 'x')),
              request.destination,
            ],
          };
        },
        dispose() {
          disposedTasks++;
        },
      };
    },
  },
});
global.gc();
const beforeHeapBytes = process.memoryUsage().heapUsed,
  cycles = [];
for (let epoch = 0; epoch < 20; epoch++) {
  const scope = { sessionId: '219-memory', worldEpoch: epoch };
  engine.setActors(actors, scope);
  engine.setRouteVersions({ graphVersion: 'g1', costVersion: 'c1' }, scope);
  const request = (index, destination) => ({
    ...scope,
    actor: actors[index],
    graphVersion: 'g1',
    costVersion: 'c1',
    origin: `origin-${index}`.padEnd(256, 'x'),
    destination,
    access: 'CIVIL',
    priority: 'normal',
  });
  for (let tick = 1; tick <= 64; tick++) {
    engine.requestRoute(request(tick - 1, `destination-${tick}`.padEnd(256, 'x')));
    engine.step({ ...scope, tick, dtSeconds: 1 / 60 });
  }
  assert.equal(engine.getStats().routeCache, 64);
  assert.equal(engine.getStats().routeCachePathCodeUnits, 64 * 256 * 256);
  for (let index = 0; index < 16; index++) engine.requestRoute(request(index, 'pending'));
  for (const actor of actors) engine.markUrgent(actor, scope);
  const urgentPeak = engine.getStats().urgent;
  assert.equal(urgentPeak, 110);
  engine.step({ ...scope, tick: 65, dtSeconds: 1 / 60 });
  const populated = engine.getStats();
  assert.equal(populated.routeJobs, 16);
  assert.equal(populated.residentRouteTasks, 1);
  const unchanged = JSON.stringify(populated);
  assert.throws(() => engine.requestRoute(request(16, 'pending')));
  assert.equal(JSON.stringify(engine.getStats()), unchanged);
  engine.reset(scope.sessionId, epoch + 1);
  global.gc();
  const cleaned = engine.getStats();
  for (const field of [
    'actors',
    'identities',
    'retiredIdentities',
    'urgent',
    'routeJobs',
    'residentRouteTasks',
    'routeCache',
    'routeCachePathCodeUnits',
  ])
    assert.equal(cleaned[field], 0);
  cycles.push({
    epoch,
    urgentPeak,
    populated,
    cleaned,
    heapAfterCleanupBytes: process.memoryUsage().heapUsed,
  });
}
engine.dispose();
global.gc();
const report = {
  capturedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHashes,
  sourceHashScope:
    'Declared scheduler/public barrel/validation and memory harness; not full transitive closure',
  runtime: process.version,
  hardware: { cpu: cpus()[0]?.model, os: `${platform()} ${release()}` },
  fixtureVersion: '219-admission-memory-v1',
  beforeHeapBytes,
  afterHeapBytes: process.memoryUsage().heapUsed,
  cycles,
  disposed: engine.getStats(),
  taskAccounting: { tasks, disposedTasks, results },
  limits: SCHEDULING_LIMITS,
  ownedPeak: {
    residentTasks: 1,
    routeJobs: 16,
    actors: 110,
    identitiesPerEpoch: 1024,
    cachePathCodeUnits: 4194304,
    cachePathPayloadUtf16Bytes: 8388608,
  },
  exactSchedulerBytes: null,
  scope:
    '20epoch-reset cycles +finaldispose on one engine; no renderer/Rapier/GPU/whole-game soak. Heap is process/harness diagnostic, arithmetic caps exclude objects/owner task internals. Bounded rows/actor fixture remain harness-owned.',
};
assert.equal(tasks, disposedTasks);
for (const [file, hash] of Object.entries(sourceHashes))
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== hash)
    throw new Error(`Memory source drift: ${file}`);
mkdirSync(evidence, { recursive: true });
writeFileSync(`${evidence}/memory.json`, JSON.stringify(report, null, 2));
console.log('219memory20cycles/task cleanup PASS');
