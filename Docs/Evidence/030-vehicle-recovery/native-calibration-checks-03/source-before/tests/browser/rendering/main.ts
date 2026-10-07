import { createRenderingBackend } from '../../../src/rendering/babylon';
import { createRenderingLifecycle } from '../../../src/app';
import { createRenderingView } from '../../../src/ui';
import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { Scene } from '@babylonjs/core/scene';
import '../../../src/style.css';

type Mode =
  | 'auto'
  | 'webgl2'
  | 'unavailable'
  | 'init-failed'
  | 'initialized-failed'
  | 'scene-failed'
  | 'both-failed';
const root = document.querySelector<HTMLDivElement>('#app');
const output = document.querySelector<HTMLPreElement>('#result');
if (!root || !output) throw new Error('Rendering fixture missing');
const host = root;
const result = output;

/** Fault injection is fixture-only; real Babylon engines and browser contexts remain in use. */
async function withFault<T>(mode: Mode, action: () => Promise<T>): Promise<T> {
  const support = Object.getOwnPropertyDescriptor(WebGPUEngine, 'IsSupportedAsync');
  const init = WebGPUEngine.prototype.initAsync;
  const ready = Scene.prototype.whenReadyAsync;
  const context = HTMLCanvasElement.prototype.getContext;
  try {
    if (mode === 'unavailable' || mode === 'both-failed') {
      Object.defineProperty(WebGPUEngine, 'IsSupportedAsync', {
        configurable: true,
        get: () => Promise.resolve(false),
      });
    }
    if (mode === 'init-failed' || mode === 'initialized-failed') {
      WebGPUEngine.prototype.initAsync = async function (...args) {
        if (mode === 'initialized-failed') await init.apply(this, args);
        throw new Error(`Injected ${mode}`);
      };
    }
    if (mode === 'scene-failed') {
      Scene.prototype.whenReadyAsync = async function (...args) {
        await ready.apply(this, args);
        if (this.getEngine().isWebGPU) throw new Error('Injected scene failure');
      };
    }
    if (mode === 'both-failed') {
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
        if (args[0] === 'webgl2') return null;
        return context.apply(this, args);
      } as typeof context;
    }
    return await action();
  } finally {
    if (support) Object.defineProperty(WebGPUEngine, 'IsSupportedAsync', support);
    WebGPUEngine.prototype.initAsync = init;
    Scene.prototype.whenReadyAsync = ready;
    HTMLCanvasElement.prototype.getContext = context;
  }
}

export async function runProbe(mode: Mode = 'auto', cycles = 1) {
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 20) throw new Error('cycles 1..20');
  const before = EngineStore.Instances.length;
  const samples = [];
  for (let cycle = 0; cycle < cycles; cycle++) {
    const canvas = document.createElement('canvas');
    host.replaceChildren(canvas);
    const started = performance.now();
    try {
      const backend = await withFault(mode, () =>
        createRenderingBackend(canvas, mode === 'webgl2' ? 'WEBGL2' : 'AUTO'),
      );
      backend.resize();
      backend.render();
      const gl = backend.rendererKind === 'WEBGL2' ? backend.canvas.getContext('webgl2') : null;
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      const engine = backend.scene.getEngine();
      const sample = {
        rendererKind: backend.rendererKind,
        actualVersion: gl?.getParameter(gl.VERSION) ?? 'WebGPU',
        gpu: debug && gl ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
        adapter:
          engine instanceof Engine || engine instanceof WebGPUEngine ? engine.getInfo() : null,
        freshCanvas: backend.canvas !== canvas,
        loadingMs: performance.now() - started,
        scenes: engine.scenes.length,
        cameras: backend.scene.cameras.length,
        meshes: backend.scene.meshes.length,
        textures: backend.scene.textures.length,
        enginesDuring: EngineStore.Instances.length,
      };
      backend.dispose();
      backend.dispose();
      backend.render();
      backend.resize();
      if (EngineStore.Instances.length !== before) throw new Error('Engine leak');
      samples.push({
        ...sample,
        enginesAfter: EngineStore.Instances.length,
        scenesAfter: engine.scenes.length,
        canvasAfter: [backend.canvas.width, backend.canvas.height],
      });
    } catch (error: unknown) {
      if (mode !== 'both-failed') throw error;
      if (EngineStore.Instances.length !== before) throw new Error('Failed engine leak');
      samples.push({
        error: error instanceof Error ? error.message : String(error),
        enginesAfter: EngineStore.Instances.length,
      });
    }
  }
  const report = {
    mode,
    cycles,
    before,
    samples,
    browser: navigator.userAgent,
    dpr: devicePixelRatio,
  };
  result.textContent = JSON.stringify(report, null, 2);
  return report;
}

export function startRetryProbe() {
  host.replaceChildren();
  const view = createRenderingView(host);
  let fail = true;
  const states: string[] = [];
  let listeners = 0;
  const lifecycle = createRenderingLifecycle({
    createBackend: () =>
      withFault(fail ? 'both-failed' : 'unavailable', () =>
        createRenderingBackend(view.getCanvas()),
      ),
    show: (state) => {
      states.push(state.kind);
      view.show(state);
    },
    scheduleFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: cancelAnimationFrame,
    subscribeResize: (callback) => {
      listeners++;
      window.addEventListener('resize', callback);
      return () => {
        listeners--;
        window.removeEventListener('resize', callback);
      };
    },
  });
  view.onRetry(() => {
    fail = false;
    void lifecycle.start();
  });
  void lifecycle.start();
  return {
    states,
    getListeners: () => listeners,
    dispose: () => {
      lifecycle.dispose();
      view.dispose();
    },
  };
}
