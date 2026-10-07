import { createRenderingBackend } from '../../../src/rendering/babylon/backend';
import { diagnoseBackend } from '../../../src/rendering/babylon/diagnostics-adapter';
import { showDevelopmentInspector } from '../../../src/rendering/babylon/dev-inspector';
import { createDiagnosticsPanel } from '../../../src/ui/diagnostics-panel';
import { UNAVAILABLE_DIAGNOSTIC_COUNTERS } from '../../../src/rendering/diagnostics';
import type { BackendPreference } from '../../../src/rendering';
import { bootstrapProbe, counts, gpuInfo } from '../scene-adapter/baseline';
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export async function diagnosticsProbe(preference: BackendPreference, keep = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  document.querySelector('#host')!.replaceChildren(canvas);
  const backend = await createRenderingBackend(canvas, preference);
  const baselineCounts = counts(backend);
  const engine = backend.scene.getEngine();
  const observerCounts = () => ({
    begin: engine.onBeginFrameObservable.observers.length,
    end: engine.onEndFrameObservable.observers.length,
    scene: backend.scene.onBeforeAnimationsObservable.observers.length,
    dispose: backend.scene.onDisposeObservable.observers.length,
  });
  const beforeObservers = observerCounts();
  const adapter = diagnoseBackend(backend, { capacity: 64, enabled: false });
  const panel = createDiagnosticsPanel(document.querySelector('#panel')!, {
    report: () => adapter.report(),
    setEnabled: (enabled) => adapter.setEnabled(enabled),
    ...(import.meta.env.DEV ? { inspector: () => showDevelopmentInspector(backend.scene) } : {}),
  });
  const scenarios = [];
  for (const enabled of [false, true]) {
    panel.root.open = enabled;
    adapter.setEnabled(enabled);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const runs = [];
    for (let repeat = 0; repeat < 5; repeat++) {
      const total: number[] = [],
        observer: number[] = [],
        ui: number[] = [],
        intervals: number[] = [];
      let previous = performance.now();
      const updatesBefore = panel.metrics.updates;
      for (let frame = 0; frame < 150; frame++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        const now = performance.now();
        const started = performance.now();
        adapter.backend.render();
        const rendered = performance.now();
        panel.refresh();
        const completed = performance.now();
        if (frame >= 30) {
          total.push(completed - started);
          observer.push(rendered - started);
          ui.push(completed - rendered);
          intervals.push(now - previous);
        }
        previous = now;
      }
      const percentiles = (values: number[]) => {
        values.sort((a, b) => a - b);
        return {
          p50: values[Math.ceil(values.length * 0.5) - 1],
          p95: values[Math.ceil(values.length * 0.95) - 1],
          p99: values[Math.ceil(values.length * 0.99) - 1],
          max: values.at(-1),
        };
      };
      runs.push({
        totalCpuMs: percentiles(total),
        renderAndCollectionCpuMs: percentiles(observer),
        uiCallCpuMs: percentiles(ui),
        pacedIntervalsMs: percentiles(intervals),
        uiUpdates: panel.metrics.updates - updatesBefore,
      });
    }
    scenarios.push({ enabled, runs, report: adapter.report(), ui: panel.metrics });
  }
  assert(adapter.report().retainedSamples === 64, 'ring capacity held');
  const updates = panel.metrics.updates;
  for (let index = 0; index < 1000; index++) panel.refresh();
  assert(panel.metrics.updates - updates <= 1, 'UI hard rate limit');
  const testNow = performance.now();
  adapter.setEnabled(false);
  const cpuReader = diagnoseBackend(backend, {
    enabled: true,
    counters: () => ({
      ...UNAVAILABLE_DIAGNOSTIC_COUNTERS,
      tick: 123,
      debtMs: 10,
      pendingBytes: 2048,
      queuedJobs: 2,
    }),
    tickCpuMs: () => 0.25,
  });
  cpuReader.backend.render();
  const counterProjection = cpuReader.report();
  cpuReader.dispose();
  assert(
    counterProjection.counters.tick === 123 &&
      counterProjection.counters.pendingBytes === 2048 &&
      counterProjection.tickCpuMs?.p95 === 0.25,
    'explicit synthetic contract inputs copied',
  );
  assert(performance.now() >= testNow, 'clock');
  panel.root.open = false;
  adapter.setEnabled(false);
  const writes = panel.metrics.writes;
  panel.refresh();
  assert(panel.metrics.writes === writes, 'closed panel no writes');
  panel.dispose();
  adapter.dispose();
  // Observable.remove defers array compaction; allow Babylon's scheduled cleanup.
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert(JSON.stringify(counts(backend)) === JSON.stringify(baselineCounts), 'resources unchanged');
  assert(JSON.stringify(observerCounts()) === JSON.stringify(beforeObservers), 'observers cleaned');
  const report = {
    fixture: '019-empty-v1',
    production: import.meta.env.PROD,
    backend: backend.rendererKind,
    gpu: gpuInfo(backend),
    browser: navigator.userAgent,
    resolution: [640, 360],
    dpr: devicePixelRatio,
    visibility: document.visibilityState,
    scenarios,
    beforeObservers,
    afterObservers: observerCounts(),
    resources: counts(backend),
    syntheticProjection: counterProjection,
    checks: [
      'bounded ring',
      '5Hz panel',
      'closed panel no writes',
      'CPU/GPU separate',
      'synthetic inputs copied (not gameplay)',
      'resource/observer cleanup',
    ],
    gpuTimeIsAsynchronous: true,
    exactGpuMemory: null,
    pacing: 'timer5ms; not display FPS',
  };
  document.querySelector('#result')!.textContent = JSON.stringify(report, null, 2);
  if (keep) {
    const live = diagnoseBackend(backend);
    const livePanel = createDiagnosticsPanel(document.querySelector('#panel')!, {
      report: () => live.report(),
      setEnabled: (enabled) => live.setEnabled(enabled),
      ...(import.meta.env.DEV ? { inspector: () => showDevelopmentInspector(backend.scene) } : {}),
    });
    livePanel.root.open = true;
    live.setEnabled(true);
    live.backend.render();
    livePanel.refresh();
    Object.assign(window, {
      inspectorProbe: async () => {
        const before = backend.scene.onDisposeObservable.observers.length;
        const firstShown = await showDevelopmentInspector(backend.scene);
        await new Promise((resolve) => setTimeout(resolve, 5));
        const afterFirst = backend.scene.onDisposeObservable.observers.length;
        const secondShown = await showDevelopmentInspector(backend.scene);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return {
          before,
          firstShown,
          secondShown,
          afterFirst,
          after: backend.scene.onDisposeObservable.observers.length,
          production: import.meta.env.PROD,
        };
      },
    });
    return {
      report,
      dispose: () => {
        livePanel.dispose();
        live.backend.dispose();
      },
    };
  }
  backend.dispose();
  return { report };
}
Object.assign(window, { diagnosticsProbe, bootstrapProbe });

async function inspectorOwnershipProbe() {
  const canvas = document.createElement('canvas');
  document.querySelector('#host')!.replaceChildren(canvas);
  const backend = await createRenderingBackend(canvas, 'WEBGL2');
  const firstShown = await showDevelopmentInspector(backend.scene);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const afterFirst = backend.scene.onDisposeObservable.observers.length;
  const secondShown = await showDevelopmentInspector(backend.scene);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const afterSecond = backend.scene.onDisposeObservable.observers.length;
  assert(afterFirst === afterSecond, 'repeated inspector owner remains bounded');
  backend.dispose();
  await new Promise((resolve) => setTimeout(resolve, 300));
  const disposedShown = await showDevelopmentInspector(backend.scene);
  assert(!disposedShown, 'disposed scene cannot reopen inspector');
  return {
    firstShown,
    secondShown,
    afterFirst,
    afterSecond,
    disposedShown,
    observersAfterDispose: backend.scene.onDisposeObservable.observers.length,
  };
}
Object.assign(window, { inspectorOwnershipProbe });
