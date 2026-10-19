import { createRoadContext } from '../src/autonomy/index.ts';
import { roadContextFixture } from '../tests/autonomy/road-context-reference.ts';
import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const { map, policy, frame } = roadContextFixture(true);
const engine = createRoadContext(map, { priorityPolicy: policy });
const cycles = [];
global.gc?.();
const beforeHeapBytes = process.memoryUsage().heapUsed;
for (let epoch = 0; epoch < 20; epoch++) {
  frame.worldEpoch = epoch;
  engine.updateFrame(frame);
  for (const vehicle of frame.vehicles) engine.getContext(vehicle.id);
  const populated = engine.getStats();
  // Bad admission must preserve the complete accepted frame and dispose its candidate.
  const rejected = structuredClone(frame);
  rejected.vehicles[0].speedMps++;
  let rejectedAtomically = false;
  try {
    engine.updateFrame(rejected);
  } catch {
    rejectedAtomically = true;
  }
  if (!rejectedAtomically || JSON.stringify(engine.getStats()) !== JSON.stringify(populated))
    throw new Error('044 failed atomic lifecycle admission');
  engine.reset(frame.sessionId, epoch + 1);
  global.gc?.();
  const cleared = engine.getStats();
  for (const key of [
    'vehicles',
    'cachedContexts',
    'laneProjections',
    'invalidatedContexts',
    'identities',
    'retiredIdentities',
    'fingerprintCodeUnits',
  ])
    if (cleared[key] !== 0) throw new Error(`044 retained resource: ${key}`);
  for (const key of ['entities', 'cells', 'spatialReferences', 'zoneVertices', 'fallbackEntities'])
    if (cleared.index[key] !== 0) throw new Error(`044 retained spatial resource: ${key}`);
  cycles.push({
    epoch,
    populated,
    cleared,
    rejectedAtomically,
    heapBytes: process.memoryUsage().heapUsed,
  });
}
engine.dispose();
const sources = [
  'scripts/measure-road-context-memory.mjs',
  'tests/autonomy/road-context-reference.ts',
  'tests/world/intersection-conflicts-fixture.ts',
];
for (const directory of [
  'src/autonomy',
  'src/world',
  'src/simulation',
  'src/sessions',
  'src/vehicles',
])
  for (const name of readdirSync(directory)
    .filter((file) => file.endsWith('.ts'))
    .sort())
    sources.push(`${directory}/${name}`);
const report = {
  capturedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHashes: Object.fromEntries(
    sources.map((source) => [
      source,
      createHash('sha256').update(readFileSync(source)).digest('hex'),
    ]),
  ),
  sourceHashScope:
    'Declared harness/fixtures and all top-level autonomy/world/simulation/sessions/vehicles TS files; includes public barrels and primary contracts, not a verified transitive dependency closure',
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  fixture: '044-road-context-cross-v1 dense110/96/256;110cachedcontexts;20epoch-reset cycles',
  forcedGc: typeof global.gc === 'function',
  beforeHeapBytes,
  afterHeapBytes: cycles.at(-1).heapBytes,
  cycles,
  disposed: engine.getStats(),
  transientAdmissionBounds: {
    populatedIndexes: 2,
    spatialReferences: 32768,
    cells: 32768,
    indexEntities: 1436,
    indexZoneVertices: 131072,
    validatedTemporaryZoneVertices: 65536,
    emptyIndexEntities: 0,
    fingerprintCodeUnits: 16777216,
    identityEntries: 1024,
    cacheEntries: 110,
    laneProjectionEntries: 110,
  },
  exactContextBytes: null,
  listeners: 0,
  timers: 0,
  historicalFrameLists: 0,
  scope:
    'Node forcedGC heap diagnostic; current-index stats are not transient peak allocations. Declared peak bounds are admission arithmetic, not measured allocator RAM. Fixture/static map and bounded stats rows remain harness-owned; no GPU/WASM/full-game soak.',
};
writeFileSync('Docs/Evidence/044-road-context/memory.json', JSON.stringify(report, null, 2));
console.log('044 memory20cycles cleanup and rejected-frame ownership PASS');
