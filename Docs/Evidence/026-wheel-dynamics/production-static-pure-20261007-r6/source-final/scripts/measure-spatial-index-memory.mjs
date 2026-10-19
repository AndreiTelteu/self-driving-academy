import { createSpatialIndex } from '../src/world/spatial-index.ts';
import { spatialFixture } from '../tests/world/spatial-index-reference.ts';
import { writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { execFileSync } from 'node:child_process';
const fixture = spatialFixture(true),
  cycles = [],
  index = createSpatialIndex();
global.gc?.();
const beforeHeapBytes = process.memoryUsage().heapUsed;
for (let i = 0; i < 20; i++) {
  for (const entity of fixture) index.upsert(entity);
  const populated = index.getStats();
  index.query({ centerM: { x: 0, y: 0, z: 0 }, radiusM: 1000000 });
  index.reset();
  global.gc?.();
  const cleared = index.getStats();
  for (const key of [
    'entities',
    'vehicles',
    'obstacles',
    'zones',
    'zoneVertices',
    'cells',
    'spatialReferences',
    'fallbackEntities',
  ])
    if (cleared[key] !== 0) throw new Error(`Resource not cleared: ${key}`);
  cycles.push({ cycle: i + 1, populated, cleared, heapBytes: process.memoryUsage().heapUsed });
}
index.dispose();
const report = {
  capturedAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: process.version,
  cpu: cpus()[0]?.model,
  os: `${platform()} ${release()}`,
  fixture: '034-local-mutable-v1 dense110vehicles96obstacles256zones',
  forcedGc: typeof global.gc === 'function',
  beforeHeapBytes,
  afterHeapBytes: cycles.at(-1).heapBytes,
  cycles,
  disposed: index.getStats(),
  exactIndexBytes: null,
  listeners: 0,
  timers: 0,
  historicalQueryEntries: 0,
  scope:
    'Node heap diagnostic with forcedGC; fixture remains owned by harness; not exact index RAM, WASM/GPU or full-game soak',
};
writeFileSync('Docs/Evidence/034-spatial-index/memory.json', JSON.stringify(report, null, 2));
console.log('034 memory20cycles retained ownership zero');
