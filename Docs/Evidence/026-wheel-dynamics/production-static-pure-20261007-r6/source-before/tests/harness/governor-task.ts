import type { TaskFactory } from '../../src/workers';

/** Synthetic jobs own one world token; no Rapier/gameplay world is claimed. */
export function governorTaskFactory(): TaskFactory {
  let worlds = 0;
  return (job) => {
    if (++worlds > 1) throw new Error('World concurrency violated');
    let slices = 0;
    let maxSliceMs = 0;
    const wanted = new Uint32Array(job.buffer)[0] || 1;
    return {
      step(deadline) {
        const start = performance.now();
        if (job.segmentId.startsWith('throw')) throw new Error('Synthetic failure');
        if (wanted > 1)
          while (performance.now() < Math.min(deadline, start + 2)) {
            /* CPU slice */
          }
        slices++;
        maxSliceMs = Math.max(maxSliceMs, performance.now() - start);
        return {
          done: slices >= wanted,
          progress: slices / wanted,
          ...(slices >= wanted
            ? { result: new Float64Array([slices, maxSliceMs, worlds]).buffer }
            : {}),
        };
      },
      dispose() {
        worlds--;
      },
    };
  };
}
