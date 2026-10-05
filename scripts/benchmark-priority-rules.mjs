import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createIntersectionConflicts } from '../src/world/intersection-conflicts.ts';
import { intersectionConflictFixture } from '../tests/world/intersection-conflicts-fixture.ts';
const conflicts = createIntersectionConflicts(intersectionConflictFixture());
function measure(run) {
  run();
  return Array.from({ length: 5 }, () => {
    const started = performance.now();
    const checksum = run();
    return { ms: performance.now() - started, checksum };
  });
}
const report = {
  stage: process.argv.includes('--before') ? 'before' : 'final',
  source: process.argv.includes('--before')
    ? 'parent known revision e573338 plus037/038 and other independent working-tree changes; no isolated checkout'
    : 'parent known revision1044d0f plus038 working-tree changes; no isolated checkout',
  runtime: process.version,
  hardware: { cpu: cpus()[0]?.model, os: `${platform()} ${release()}` },
  backend: 'Node CPU algorithm only; no browser/GPU/FPS',
  budget: 'provisional pre203; no isolated gap-query budget fixed',
  fixture: 'intersection-CROSS-v1',
  method: 'one warmup+five repetitions; batch CPU durations',
  conflictQueries10000: measure(() => {
    let total = 0;
    for (let i = 0; i < 10000; i++)
      total += Number(
        conflicts.getRelation('junction', 'west-straight', 'south-straight')?.incompatible,
      );
    return total;
  }),
};
if (!process.argv.includes('--before')) {
  const { createPriorityRules } = await import('../src/world/priority-rules.ts');
  const { priorityFixture, priorityObservation } =
    await import('../tests/world/priority-rules-fixture.ts');
  const { map, policy } = priorityFixture();
  const observationBatch = Array.from({ length: 10000 }, (_, index) =>
    priorityObservation(index + 1, 'priority-bench'),
  );
  const runObservations = (observerEnabled) => {
    const rules = createPriorityRules(map, policy, { sessionId: 'priority-bench', worldEpoch: 0 });
    const observer = observerEnabled ? new Float64Array(observationBatch.length) : null;
    let total = 0;
    for (let index = 0; index < observationBatch.length; index++) {
      const started = observer ? performance.now() : 0;
      total += Number(rules.observe(observationBatch[index]).hasPriorityExposure);
      if (observer) observer[index] = performance.now() - started;
    }
    const statsBeforeDispose = rules.getStats();
    rules.dispose();
    const statsAfterDispose = rules.getStats();
    return {
      total,
      observerBytes: observer?.byteLength ?? 0,
      statsBeforeDispose,
      statsAfterDispose,
    };
  };
  report.additionalCost = {
    construction: measure(() => {
      const rules = createPriorityRules(map, policy, {
        sessionId: 'priority-bench',
        worldEpoch: 0,
      });
      const count = rules.getStats().rules;
      rules.dispose();
      return count;
    }),
    observations10000: measure(() => runObservations(false)),
    observations10000ObserverEnabled: measure(() => runObservations(true)),
    observerMethod:
      'Preallocated 80000-byte Float64Array records synchronous per-observation CPU elapsed time; batch duration includes collector overhead. Both modes use the same preconstructed observations.',
    lifecycle20Cycles: Array.from({ length: 20 }, () => {
      const stats = runObservations(false);
      globalThis.gc?.();
      return { ...stats, heapUsedAfterOptionalGc: process.memoryUsage().heapUsed };
    }),
    garbageCollectorAvailable: typeof globalThis.gc === 'function',
  };
}
console.log(JSON.stringify(report, null, 2));
