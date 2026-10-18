import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { createRenderingBackend, type RenderingBackend } from '../../../src/rendering/babylon';
import type { BackendPreference } from '../../../src/rendering';

export function counts(backend: RenderingBackend) {
  const scene = backend.scene;
  return {
    nodes: scene.transformNodes.length,
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    textures: scene.textures.length,
    geometries: scene.geometries.length,
  };
}

export async function measure(backend: RenderingBackend, present: () => void = () => {}) {
  const repeats = [];
  for (let repeat = 0; repeat < 5; repeat++) {
    const cpu: number[] = [],
      intervals: number[] = [];
    let previous = 0;
    for (let frame = 0; frame < 150; frame++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      const now = performance.now();
      const started = performance.now();
      present();
      backend.render();
      if (frame >= 30) {
        cpu.push(performance.now() - started);
        intervals.push(now - previous);
      }
      previous = now;
    }
    const percentile = (data: number[], p: number) =>
      data.sort((a, b) => a - b)[Math.ceil(data.length * p) - 1];
    repeats.push({
      cpuP50Ms: percentile(cpu, 0.5),
      cpuP95Ms: percentile(cpu, 0.95),
      pacedIntervalP95Ms: percentile(intervals, 0.95),
      pacedIntervalP99Ms: percentile(intervals, 0.99),
    });
  }
  return {
    repeats,
    counts: counts(backend),
    gpuTime: null,
    exactGpuMemory: null,
    cadenceFps: null,
    visibility: document.visibilityState,
    pacing: `timer 5ms; not display FPS`,
  };
}

export async function bootstrapProbe(preference: BackendPreference) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  document.querySelector('#host')!.replaceChildren(canvas);
  const backend = await createRenderingBackend(canvas, preference);
  const report = {
    fixture: '013-empty-v1',
    preference,
    backend: backend.rendererKind,
    gpu: gpuInfo(backend),
    browser: navigator.userAgent,
    dpr: devicePixelRatio,
    resolution: [backend.canvas.width, backend.canvas.height],
    ...(await measure(backend)),
  };
  backend.dispose();
  document.querySelector('#result')!.textContent = JSON.stringify(report, null, 2);
  return report;
}

export function gpuInfo(backend: RenderingBackend) {
  const engine = backend.scene.getEngine();
  return engine instanceof Engine || engine instanceof WebGPUEngine ? engine.getInfo() : null;
}
