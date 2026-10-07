import { createRenderingBackend } from '../../../src/rendering/babylon/backend';
import { diagnoseBackend } from '../../../src/rendering/babylon/diagnostics-adapter';
import { subscribeRenderingLoss } from '../../../src/rendering/babylon/recovery-session';
import { createFixedTickLoop } from '../../../src/simulation/fixed-tick';
import {
  createPerformanceCollector,
  createPerformanceReport,
  distribution,
  type PerformanceRun,
} from '../../../src/telemetry/performance';

declare const __HARNESS_BUILD__: {
  readonly commit: string;
  readonly sourceHash: string;
  readonly budgetVersion: string;
  readonly engineVersion: string;
  readonly inputs: readonly string[];
};
const element = (id: string) => document.getElementById(id)!;
let running = false;
let exported: unknown;
const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
async function run(short: boolean) {
  if (running) return;
  running = true;
  exported = undefined;
  (element('export') as HTMLButtonElement).disabled = true;
  Object.assign(window, {
    performanceHarnessReport: undefined,
    performanceHarnessError: undefined,
  });
  const warmupMs = short ? 100 : 30000,
    durationMs = short ? 400 : 120000;
  let hidden = document.hidden,
    blurred = !document.hasFocus(),
    lost: unknown;
  const hide = () => {
      hidden ||= document.hidden;
    },
    blur = () => {
      blurred = true;
    };
  document.addEventListener('visibilitychange', hide);
  window.addEventListener('blur', blur);
  const check = () => {
    if (hidden || blurred || document.hidden || !document.hasFocus() || lost)
      throw new Error(
        `Invalid foreground or GPU context: hidden=${hidden}, blurred=${blurred}, loss=${String(lost)}`,
      );
  };
  let backend: Awaited<ReturnType<typeof createRenderingBackend>> | undefined;
  let diagnostic: ReturnType<typeof diagnoseBackend> | undefined;
  let unsubscribe: (() => void) | undefined;
  try {
    const hardware = (await fetch('/hardware.json', { cache: 'no-store' }).then((r) =>
      r.json(),
    )) as Record<string, unknown>;
    if (
      !hardware.cpu ||
      !hardware.gpu ||
      !hardware.os ||
      !hardware.powerScheme ||
      hardware.profile !== 'desktop'
    )
      throw new Error('Missing real desktop metadata');
    const buildManifest = (await fetch('/build-manifest.json', { cache: 'no-store' }).then((r) =>
      r.json(),
    )) as Record<string, unknown>;
    if (
      buildManifest.commit !== __HARNESS_BUILD__.commit ||
      buildManifest.sourceHash !== __HARNESS_BUILD__.sourceHash
    )
      throw new Error('Build manifest mismatch');
    const coldLoad = [],
      warmLoad = [];
    const runs: PerformanceRun[] = [];
    let gpuInfo: unknown = null;
    for (let repeat = 1; repeat <= 5; repeat++) {
      check();
      element('status').textContent =
        `Repetarea ${repeat}/5: backend fresh și primul render; cache HTTP no-store, OS/driver cache necontrolat.`;
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      element('host').replaceChildren(canvas);
      const startup = performance.now();
      backend = await createRenderingBackend(canvas, 'WEBGPU');
      unsubscribe = subscribeRenderingLoss(backend, (reason) => {
        lost = reason;
      });
      const initialized = performance.now();
      const engine = backend.scene.getEngine();
      engine.setSize(1920, 1080);
      if (backend.rendererKind !== 'WEBGPU')
        throw new Error('Requested hardware WebGPU not obtained');
      gpuInfo =
        'getInfo' in engine ? (engine as typeof engine & { getInfo(): unknown }).getInfo() : null;
      const first = performance.now();
      backend.render();
      coldLoad.push({
        repeat,
        freshBackendStartupMs: initialized - startup,
        firstRenderCpuMs: performance.now() - first,
        context:
          'Fresh engine/context and first-use; HTTP no-store, OS/driver cache uncontrolled; not controlled cold navigation or first command gate',
      });
      await nextFrame();
      const warm = performance.now();
      backend.render();
      warmLoad.push({
        repeat,
        secondRenderCpuMs: performance.now() - warm,
        context: 'Same initialized engine, second render; distinct from steady-state warmup',
      });
      diagnostic = diagnoseBackend(backend, { enabled: false, capacity: 4096 });
      for (const enabled of repeat % 2 ? [false, true] : [true, false]) {
        check();
        element('status').textContent =
          `Repetarea ${repeat}/5, colector ${enabled ? 'pornit' : 'oprit'}, warmup ${warmupMs}ms + measure ${durationMs}ms.`;
        const collector = createPerformanceCollector(60000, enabled);
        collector.record(
          'inputToCommandMs',
          null,
          'Driving command controller not implemented; no synthetic input latency',
        );
        collector.record(
          'gpuMs',
          null,
          'GPU timer is separate diagnostics window, exported under gpuTimer',
        );
        collector.record(
          'tickCpuMs',
          null,
          'Full authoritative physics tick instrumentation not implemented; fixed-loop frame work measured as simulationCpuMs',
        );
        diagnostic.setEnabled(false);
        diagnostic.setEnabled(enabled);
        let value = 42;
        const loop = createFixedTickLoop({
          captureSnapshot: () => ({ value }),
          step: () => {
            value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
          },
          interpolate: (_previous, current) => current,
        });
        let now = await nextFrame();
        loop.frame(now);
        const warmStart = now;
        while (now - warmStart < warmupMs) {
          check();
          now = await nextFrame();
          loop.frame(now);
          diagnostic.backend.render();
        }
        const warmState = loop.getState();
        const actualWarmupMs = now - warmStart;
        diagnostic.collector.clear();
        const cpu = new Float64Array(60000),
          intervals = new Float64Array(60000);
        let count = 0,
          previous = now;
        const began = now,
          wallStart = performance.now();
        let longCount = 0,
          longMax = 0,
          longOverflow = false;
        const supported =
          typeof PerformanceObserver !== 'undefined' &&
          PerformanceObserver.supportedEntryTypes.includes('longtask');
        const recordLong = (entries: readonly PerformanceEntry[]) => {
          for (const entry of entries) {
            if (entry.startTime < began) continue;
            if (longCount >= 1024) longOverflow = true;
            else {
              longCount++;
              longMax = Math.max(longMax, entry.duration);
            }
          }
        };
        const observer = supported
          ? new PerformanceObserver((list) => recordLong(list.getEntries()))
          : null;
        observer?.observe({ type: 'longtask', buffered: false });
        try {
          do {
            now = await nextFrame();
            check();
            if (count >= 60000) throw new Error('Reference observer sample cap exceeded');
            const frameStart = performance.now();
            const state = loop.frame(now).state;
            const simulationCpuMs = performance.now() - frameStart;
            diagnostic.backend.render();
            if (enabled) {
              collector.record('frameMs', now - previous);
              collector.record('mainThreadMs', performance.now() - frameStart);
              collector.record('simulationCpuMs', simulationCpuMs);
              collector.record('debtMs', state.debtSeconds * 1000);
            }
            cpu[count] = performance.now() - frameStart;
            intervals[count] = now - previous;
            count++;
            previous = now;
          } while (now - began < durationMs);
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        } finally {
          if (observer) recordLong(observer.takeRecords());
          observer?.disconnect();
        }
        check();
        const wallDurationMs = performance.now() - wallStart;
        const state = loop.getState();
        const diagnosticReport = diagnostic.report();
        const simulatedSeconds = state.simulatedSeconds - warmState.simulatedSeconds;
        const admittedClockSeconds = state.activeRealSeconds - warmState.activeRealSeconds;
        const retainedSnapshotsBeforeDispose = state.snapshots === null ? 0 : 2;
        loop.dispose();
        const retainedSnapshotsAfterDispose = loop.getState().snapshots === null ? 0 : 2;
        runs.push({
          repeat,
          seed: 42,
          enabled,
          warmupMs: actualWarmupMs,
          activeDurationMs: now - began,
          wallDurationMs,
          collector: collector.finish({ frameMs: 18.5, mainThreadMs: 10, tickCpuMs: 5.5 }),
          referenceCpuMs: distribution(cpu, count)!,
          referenceFrameMs: distribution(intervals, count, 18.5),
          simulation: {
            clock: 'real-raf',
            measuredWallSeconds: wallDurationMs / 1000,
            simulatedSeconds,
            admittedClockSeconds,
            ratio: admittedClockSeconds ? simulatedSeconds / admittedClockSeconds : null,
            tick: state.tick - warmState.tick,
            overloads: state.overloadCount - warmState.overloadCount,
          },
          resources: {
            ...diagnosticReport.resources,
            exactPageMemoryBytes: null,
            exactGpuMemoryBytes: null,
            retainedSnapshotsBeforeDispose,
            retainedSnapshotsAfterDispose,
            diagnosticBufferBytes: diagnosticReport.bufferBytes,
            referenceObserverBytes: cpu.byteLength + intervals.byteLength,
          },
          gpuTimer: {
            status: diagnosticReport.gpuStatus,
            sampleWindow:
              'Last 4096 admitted frames; asynchronous available samples only, separate from full CPU/frame window',
            percentiles: diagnosticReport.gpuMs,
          },
          longTasks: {
            supported,
            count: supported ? longCount : null,
            maximumMs: supported ? longMax : null,
            overflow: longOverflow,
          },
        });
        if (longOverflow) throw new Error('Long task observation cap exceeded');
      }
      unsubscribe();
      unsubscribe = undefined;
      diagnostic.dispose();
      diagnostic = undefined;
      backend.dispose();
      backend = undefined;
    }
    check();
    exported = createPerformanceReport({
      role: 'hardware-browser',
      identity: {
        ...__HARNESS_BUILD__,
        fixtureVersion: short ? '218-browser-counter-v1-SMOKE' : '218-browser-counter-v1',
        physicsVersion: null,
        mapVersion: null,
        seeds: [42],
        hardware: { ...hardware, browserGpu: gpuInfo, buildManifest },
        browser: navigator.userAgent,
        backend: 'WEBGPU',
        preset: 'MEDIUM context; empty scene has no preset-dependent assets',
        cssResolution: [1920, 1080],
        internalResolution: [1920, 1080],
        devicePixelRatio,
        cache: 'HTTP no-store; OS/driver caches uncontrolled',
        network: 'Local HTTP unthrottled; not 25Mbit/s RTT40ms cold gate',
        powerState: String(hardware.powerScheme),
      },
      scope:
        'Babylon empty scene plus real fixed-tick deterministic counter; no vehicles, physics or learning. Foreground maintained throughout.',
      coldLoad,
      warmLoad,
      runs,
      unavailable: {
        authoritativeInput: 'Driving input/controller not implemented',
        physics: 'Rapier not implemented',
        learning: 'Pipeline not implemented',
        storage: 'Checkpoint/recorder not implemented',
        memory:
          'Exact GPU/page memory API not measured; owned buffers and resource counts separate',
        laptop: 'Not measured in218; future hardware gameplay gates remain required',
        controlledColdNavigation:
          'HTTP no-store fresh backend only; no traffic shaping or controlled OS/driver cache',
      },
      exclusions: [
        short
          ? 'SMOKE: short durations, never baseline'
          : 'Full 30s warmup + minimum120s steady-state,5 paired repeats',
        'Warmup excluded from steady-state, fresh-engine first-use retained separately for each repetition',
        'Common reference observer always active; overhead delta includes optional collector+diagnostic GPU observer; negative deltas are noise, not causal speedups',
        'simulationCpuMs measures complete fixed-loop frame work including snapshots/interpolation; authoritative tickCpuMs remains unavailable',
        'Unavailable subsystems not assigned zero or PASS; gameplay thresholds only provisional context',
      ],
    });
    element('result').textContent = JSON.stringify({ completed: true, short, repeats: 5 });
    element('status').textContent = 'Proba finalizată; raport disponibil pentru export.';
    Object.assign(window, { performanceHarnessReport: exported });
    (element('export') as HTMLButtonElement).disabled = false;
  } catch (error) {
    element('status').textContent = String(error);
    Object.assign(window, { performanceHarnessError: String(error) });
  } finally {
    unsubscribe?.();
    diagnostic?.dispose();
    backend?.dispose();
    document.removeEventListener('visibilitychange', hide);
    window.removeEventListener('blur', blur);
    running = false;
  }
}
element('start').addEventListener('click', () => {
  void run(false);
});
element('smoke').addEventListener('click', () => {
  void run(true);
});
element('export').addEventListener('click', () => {
  if (!exported || running) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'performance-218.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
