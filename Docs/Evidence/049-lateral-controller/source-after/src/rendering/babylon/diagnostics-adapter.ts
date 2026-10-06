import '@babylonjs/core/Engines/Extensions/engine.query';
import '@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.query';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation';
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation';
import {
  DiagnosticsCollector,
  type DiagnosticCounters,
  type DiagnosticReport,
} from '../diagnostics';
import type { RenderingBackend } from './backend';

export interface BabylonDiagnostics {
  readonly backend: RenderingBackend;
  readonly collector: DiagnosticsCollector;
  setEnabled(enabled: boolean): void;
  report(): DiagnosticReport;
  /** Dispose diagnostics only, before the external backend/scene owner. */
  dispose(): void;
}
export function diagnoseBackend(
  backend: RenderingBackend,
  options: {
    capacity?: number;
    now?: () => number;
    counters?: () => DiagnosticCounters;
    tickCpuMs?: () => number | null;
    enabled?: boolean;
  } = {},
): BabylonDiagnostics {
  const collector = new DiagnosticsCollector(options.capacity);
  const now = options.now ?? (() => performance.now());
  const scene = backend.scene,
    engine = scene.getEngine();
  let engineInstrumentation: EngineInstrumentation | undefined;
  let sceneInstrumentation: SceneInstrumentation | undefined;
  let previous: number | null = null,
    gpuCount = 0;
  let discardFirstGpuResult = true;
  let gpuStatus = 'disabled',
    disposed = false;
  const setEnabled = (enabled: boolean): void => {
    if (disposed) return;
    collector.setEnabled(enabled);
    previous = null;
    if (!enabled) {
      if (engineInstrumentation) {
        engineInstrumentation.captureGPUFrameTime = false;
        engineInstrumentation.dispose();
        engineInstrumentation = undefined;
      }
      sceneInstrumentation?.dispose();
      sceneInstrumentation = undefined;
      gpuStatus = 'disabled';
    } else if (!engineInstrumentation) {
      sceneInstrumentation = new SceneInstrumentation(scene);
      engineInstrumentation = new EngineInstrumentation(engine);
      if (engine.getCaps().timerQuery) {
        engineInstrumentation.captureGPUFrameTime = true;
        gpuCount = engineInstrumentation.gpuFrameTimeCounter.count;
        discardFirstGpuResult = true;
        gpuStatus = 'supported; awaiting fresh timer result';
      } else gpuStatus = 'unavailable: timer query unsupported';
    }
  };
  const dispose = (): void => {
    if (disposed) return;
    setEnabled(false);
    disposed = true;
    scene.onDisposeObservable.remove(observer);
  };
  const observer = scene.onDisposeObservable.addOnce(dispose);
  setEnabled(options.enabled ?? true);
  return {
    collector,
    setEnabled,
    dispose,
    backend: {
      ...backend,
      render: () => {
        if (disposed || !collector.enabled) {
          backend.render();
          return;
        }
        const started = now();
        const frameMs = previous === null ? null : started - previous;
        previous = started;
        backend.render();
        const cpuRenderMs = now() - started;
        let gpuMs: number | null = null;
        if (engineInstrumentation?.captureGPUFrameTime) {
          const counter = engineInstrumentation.gpuFrameTimeCounter;
          if (counter.count > gpuCount) {
            gpuCount = counter.count;
            if (discardFirstGpuResult) discardFirstGpuResult = false;
            else {
              gpuMs = counter.current / 1_000_000;
              gpuStatus = 'available: asynchronous timer, milliseconds';
            }
          }
        }
        collector.record({ cpuRenderMs, frameMs, gpuMs, tickCpuMs: options.tickCpuMs?.() ?? null });
      },
      dispose: () => {
        try {
          dispose();
        } finally {
          backend.dispose();
        }
      },
    },
    report: () =>
      collector.report(
        backend.rendererKind,
        gpuStatus,
        {
          drawCalls: sceneInstrumentation?.drawCallsCounter.current ?? null,
          meshes: scene.meshes.length,
          nodes: scene.transformNodes.length,
          materials: scene.materials.length,
          textures: scene.textures.length,
          geometries: scene.geometries.length,
        },
        options.counters?.(),
      ),
  };
}
