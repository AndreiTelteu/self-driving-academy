import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { _CommonDispose } from '@babylonjs/core/Engines/engine.common';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import glslangJs from '@babylonjs/core/assets/glslang/glslang.js?url';
import glslangWasm from '@babylonjs/core/assets/glslang/glslang.wasm?url';
import twgslJs from '@babylonjs/core/assets/twgsl/twgsl.js?url';
import twgslWasm from '@babylonjs/core/assets/twgsl/twgsl.wasm?url';
import { initializeBackend, type BackendPreference, type RendererKind } from '../backend-policy';

export interface RenderingBackend {
  readonly rendererKind: RendererKind;
  readonly canvas: HTMLCanvasElement;
  readonly scene: Scene;
  render(): void;
  resize(): void;
  dispose(): void;
}

/** Fresh canvas per attempt: a canvas with a WebGPU context cannot become WebGL2. */
export async function createRenderingBackend(
  canvas: HTMLCanvasElement,
  preference: BackendPreference = 'AUTO',
): Promise<RenderingBackend> {
  const contexts = new WeakMap<HTMLCanvasElement, WebGL2RenderingContext>();
  interface OwnedEngine {
    readonly engine: Engine | WebGPUEngine;
    initialized: boolean;
    dispose(): void;
  }
  const resources = await initializeBackend<HTMLCanvasElement, OwnedEngine, Scene>(
    canvas,
    preference,
    {
      supportsWebGPU: () => WebGPUEngine.IsSupportedAsync,
      freshCanvas: (previous) => {
        const next = previous.cloneNode(false) as HTMLCanvasElement;
        previous.replaceWith(next);
        return next;
      },
      createEngine: (target, kind) => {
        if (kind === 'WEBGPU') {
          const engine = new WebGPUEngine(target, {
            antialias: false,
            doNotHandleContextLost: true,
            glslangOptions: { jsPath: glslangJs, wasmPath: glslangWasm },
            twgslOptions: { jsPath: twgslJs, wasmPath: twgslWasm },
          });
          const owned: OwnedEngine = {
            engine,
            initialized: false,
            dispose: () => {
              if (owned.initialized) {
                engine.dispose();
                return;
              }
              // 9.29 dispose dereferences helpers absent after requestAdapter/requestDevice failure.
              // Partial initialization uses the common/base cleanup, plus every acquired GPU owner.
              const partial = engine as unknown as {
                _isDisposed: boolean;
                _timestampQuery?: { dispose(): void };
                _textureHelper?: { destroyDeferredTextures(): void };
                _bufferManager?: { destroyDeferredBuffers(): void };
                _mainTexture?: { destroy(): void };
                _depthTexture?: { destroy(): void };
                _device?: { destroy(): void };
              };
              partial._isDisposed = true;
              try {
                partial._timestampQuery?.dispose();
                partial._mainTexture?.destroy();
                partial._depthTexture?.destroy();
                partial._textureHelper?.destroyDeferredTextures();
                partial._bufferManager?.destroyDeferredBuffers();
              } finally {
                try {
                  partial._device?.destroy();
                } finally {
                  _CommonDispose(engine, target);
                  AbstractEngine.prototype.dispose.call(engine);
                }
              }
            },
          };
          return owned;
        }
        // Pass an actual WebGL2 context: Babylon's canvas constructor may fall back to WebGL1.
        const context = target.getContext('webgl2', { antialias: false, alpha: false });
        if (!context) throw new Error('WebGL 2 context unavailable');
        contexts.set(target, context);
        const engine = new Engine(context, false, {
          disableWebGL2Support: false,
          audioEngine: false,
        });
        return { engine, initialized: true, dispose: () => engine.dispose() };
      },
      initializeEngine: async (owned, kind) => {
        if (kind === 'WEBGPU') {
          await (owned.engine as WebGPUEngine).initAsync();
          owned.initialized = true;
        } else if ((owned.engine as Engine).webGLVersion !== 2)
          throw new Error('WebGL 1 is unsupported');
      },
      createScene: (owned) => new Scene(owned.engine),
      initializeScene: async (scene) => {
        scene.clearColor = new Color4(0.074, 0.145, 0.121, 1);
        // Fixed bootstrap camera only; vehicle camera/controller belongs to a later PBI.
        const camera = new FreeCamera('bootstrap-camera', new Vector3(0, 0, -5), scene);
        camera.setTarget(Vector3.Zero());
        scene.activeCamera = camera;
        await scene.whenReadyAsync();
        const engine = scene.getEngine();
        engine.beginFrame();
        try {
          scene.render();
        } finally {
          engine.endFrame();
        }
      },
      releaseCanvas: (target) => {
        // Engine.dispose does not explicitly lose a WebGL context. Release this owned context.
        const gl = contexts.get(target);
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
        target.width = 0;
        target.height = 0;
      },
    },
  );
  let disposed = false;
  return {
    canvas: resources.canvas,
    scene: resources.scene,
    rendererKind: resources.rendererKind,
    render: () => {
      if (disposed) return;
      resources.engine.engine.beginFrame();
      try {
        resources.scene.render();
      } finally {
        resources.engine.engine.endFrame();
      }
    },
    resize: () => {
      if (!disposed) resources.engine.engine.resize();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      resources.dispose();
    },
  };
}
