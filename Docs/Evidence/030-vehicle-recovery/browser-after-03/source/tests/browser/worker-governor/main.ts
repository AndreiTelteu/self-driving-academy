import { runGovernorProbe } from '../../harness/governor-probe';
import { messageTransport, governorLimits } from '../../../src/workers';
import { distribution, createPerformanceCollector } from '../../../src/telemetry';
declare const __GOVERNOR_BUILD__: { commit: string; sourceHash: string; inputs: string[] };
const status = document.querySelector<HTMLPreElement>('#status')!;
const button = document.querySelector<HTMLButtonElement>('#start')!;
async function frames(durationMs: number, action?: () => Promise<unknown>) {
  const buffer = new Float64Array(1024);
  let count = 0;
  let previous: number | undefined;
  let frameId = 0;
  let foregroundLost = document.hidden || !document.hasFocus();
  const start = performance.now();
  const tick = (at: number) => {
    foregroundLost ||= document.hidden || !document.hasFocus();
    if (previous !== undefined && count < buffer.length) buffer[count++] = at - previous;
    previous = at;
    frameId = requestAnimationFrame(tick);
  };
  frameId = requestAnimationFrame(tick);
  try {
    const work = action?.();
    await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
    const result = await work;
    if (foregroundLost || document.hidden || !document.hasFocus())
      throw new Error('Foreground/focus lost during measurement');
    return {
      distribution: distribution(buffer, count, 25),
      measuredMs: performance.now() - start,
      result,
    };
  } finally {
    cancelAnimationFrame(frameId);
  }
}
button.addEventListener('click', () => {
  button.disabled = true;
  void (async () => {
    const hardware = await (await fetch('/hardware.json')).json();
    const repeats = [];
    const collector = createPerformanceCollector(64);
    for (let repeat = 1; repeat <= 5; repeat++) {
      if (document.hidden || !document.hasFocus()) throw new Error('Foreground focus required');
      status.textContent = `Proba${repeat}/5 — baseline + worker`;
      const baseline = await frames(1000);
      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      try {
        const enabled = await frames(1000, () => runGovernorProbe(messageTransport(worker)));
        const probe = enabled.result as Awaited<ReturnType<typeof runGovernorProbe>>;
        if (
          probe.maxSliceMs > 10 ||
          probe.interactiveEndToEndMs > 2000 ||
          probe.measurements.some(
            (sample) => sample.cancellationMs !== null && sample.cancellationMs > 100,
          )
        )
          throw new Error('Synthetic worker budget exceeded');
        for (const sample of probe.measurements)
          if (sample.key.includes('learning-short')) {
            collector.record('learningQueueMs', sample.queueMs);
            collector.record('learningServiceMs', sample.serviceMs);
            collector.record('learningEndToEndMs', sample.endToEndMs);
          }
        repeats.push({
          repeat,
          baseline: baseline.distribution,
          workerFrames: enabled.distribution,
          probe,
          p95DeltaMs: enabled.distribution!.p95 - baseline.distribution!.p95,
          measuredBaselineMs: baseline.measuredMs,
          measuredWorkerMs: enabled.measuredMs,
        });
      } finally {
        worker.terminate();
      }
    }
    const report = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      fixtureVersion: '221-browser-worker-raf-v1',
      build: __GOVERNOR_BUILD__,
      hardware,
      browser: navigator.userAgent,
      backend:
        'Native browser Worker and foreground requestAnimationFrame; no renderer/GPU gameplay',
      cssResolution: [innerWidth, innerHeight],
      devicePixelRatio,
      budgetVersion: '203-initial-1',
      foreground: { visibleAndFocusedThroughout: true, checkedEveryAnimationFrame: true },
      workerBudgetVersion: governorLimits.version,
      limits: governorLimits,
      scope:
        '221-event-burst5pairs1sphase: lifecycle/preemption long-short jobs and incremental frame burst;1s percentile estimates coarse, no30s warmup/120s steady-state/gameplay gate',
      collector: collector.finish({ learningEndToEndMs: 2000 }),
      repeats,
      longTasks: {
        supported: PerformanceObserver.supportedEntryTypes?.includes('longtask') ?? false,
        count: null,
        maximumMs: null,
        reason: 'Not collected; frame intervals measured independently',
      },
      exactPageMemoryBytes: null,
      gpuMs: null,
      residentRapierWorlds: 'not implemented; one synthetic task world token',
      protectedStore:
        'bounded16MiB/8record memory persistence double; IndexedDB integration future222/234',
      gameplayGate: 'NOT_VALIDATED',
      laptop: 'NOT_MEASURED',
    };
    const response = await fetch('/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    if (!response.ok) throw new Error(`Export failed${response.status}`);
    status.textContent = `PASS — exported${repeats.length} repetitions\n${JSON.stringify(
      repeats.map((r) => ({
        repeat: r.repeat,
        delta: r.p95DeltaMs,
        cancel: r.probe.measurements
          .filter((m) => m.cancellationMs !== null)
          .map((m) => m.cancellationMs),
      })),
      null,
      2,
    )}`;
  })()
    .catch((error: unknown) => {
      status.textContent = `FAIL${String(error)}`;
    })
    .finally(() => {
      button.disabled = false;
    });
});
