import { performance } from 'node:perf_hooks';
import { cpus, release } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { minimalMap } from '../tests/world/fixture.ts';
import { parseRoadMap } from '../src/world/parser.ts';

const phase = process.argv[2] ?? 'before';
if (!['before', 'after'].includes(phase)) throw new Error('Unknown phase');
const fixture = minimalMap();
function measure(action, count = 1000) {
  for (let i = 0; i < 100; i++) action();
  return Array.from({ length: 5 }, () => {
    const values = [];
    for (let i = 0; i < count; i++) {
      const start = performance.now();
      action();
      values.push(performance.now() - start);
    }
    values.sort((a, b) => a - b);
    return {
      p50: values[Math.ceil(count * 0.5) - 1],
      p95: values[Math.ceil(count * 0.95) - 1],
      p99: values[Math.ceil(count * 0.99) - 1],
    };
  });
}
const report = {
  phase,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtime: process.version,
  cpu: cpus()[0].model,
  os: `${process.platform} ${release()}`,
  fixture: 'minimal-road-v1;100 warmup;5x1000 samples',
  scope:
    'CPU query microprobe, no renderer/FPS/GPU; provisional pre203 whole-tick desktop p95 5.5ms',
  parserMs: measure(() => parseRoadMap(fixture)),
};
if (phase === 'after') {
  const { createCrosswalkZones } = await import('../src/world/crosswalk-zones.ts');
  const zones = createCrosswalkZones(fixture);
  const query = { fromM: { x: 20, y: 0, z: 16 }, toM: { x: 20, y: 0, z: 23 }, laneId: 'lane-c' };
  report.queryMs = measure(() => zones.query(query));
  report.occupiedQueryMs = measure(() =>
    zones.query(query, [
      {
        entityId: 'pedestrian',
        kind: 'PEDESTRIAN',
        positionM: { x: 20, y: 0, z: 20 },
        radiusM: 0.4,
        active: true,
        observable: true,
      },
    ]),
  );
  report.stats = zones.getStats();
  const crowded = Array.from({ length: 4096 }, (_, index) => ({
    entityId: `ped-${index}`,
    kind: 'PEDESTRIAN',
    positionM: { x: 20, y: 0, z: 20 },
    radiusM: 0.4,
    active: true,
    observable: true,
  }));
  report.capacityQueryMs = measure(() => {
    if (zones.query(query, crowded)[0].observablePedestrianIds.length !== 4096)
      throw new Error('Truncated observations');
  }, 100);
  report.heapCycles = Array.from({ length: 20 }, () => {
    (() => {
      const cycle = createCrosswalkZones(fixture);
      cycle.query(query, crowded);
    })();
    global.gc?.();
    return process.memoryUsage().heapUsed;
  });
  report.gcAvailable = typeof global.gc === 'function';
}
mkdirSync('Docs/Evidence/039-crosswalk-zones', { recursive: true });
writeFileSync(
  `Docs/Evidence/039-crosswalk-zones/${phase}.json`,
  JSON.stringify(report, null, 2) + '\n',
);
console.log(`039 ${phase} baseline recorded`);
