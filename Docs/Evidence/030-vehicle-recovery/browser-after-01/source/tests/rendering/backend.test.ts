import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initializeBackend,
  RenderingInitializationError,
  type BackendDriver,
  type RendererKind,
} from '../../src/rendering/backend-policy';

function fixture(
  options: {
    supported?: boolean;
    failInit?: RendererKind[];
    failScene?: RendererKind[];
    supportThrows?: boolean;
    cleanupThrows?: boolean;
  } = {},
) {
  const events: string[] = [];
  let nextCanvas = 0;
  type Resource = { kind: RendererKind; dispose(): void };
  const driver: BackendDriver<number, Resource, Resource> = {
    supportsWebGPU: async () => {
      events.push('support');
      if (options.supportThrows) throw new Error('adapter failure');
      return options.supported !== false;
    },
    freshCanvas: () => ++nextCanvas,
    createEngine: (canvas, kind) => {
      events.push(`engine:${kind}:${canvas}`);
      return {
        kind,
        dispose: () => {
          events.push(`disposeEngine:${kind}`);
        },
      };
    },
    initializeEngine: async (engine) => {
      if (options.failInit?.includes(engine.kind)) throw new Error(`init:${engine.kind}`);
    },
    createScene: (engine) => {
      events.push(`scene:${engine.kind}`);
      return {
        kind: engine.kind,
        dispose: () => {
          events.push(`disposeScene:${engine.kind}`);
          if (options.cleanupThrows) throw new Error('cleanup');
        },
      };
    },
    initializeScene: async (scene) => {
      if (options.failScene?.includes(scene.kind)) throw new Error(`scene:${scene.kind}`);
    },
    releaseCanvas: (canvas) => {
      events.push(`release:${canvas}`);
    },
  };
  return { driver, events };
}

test('WebGPU preferred, scene owned, disposal exactly once in dependency order', async () => {
  const { driver, events } = fixture();
  const backend = await initializeBackend(0, 'AUTO', driver);
  assert.equal(backend.rendererKind, 'WEBGPU');
  backend.dispose();
  backend.dispose();
  assert.deepEqual(events, [
    'support',
    'engine:WEBGPU:1',
    'scene:WEBGPU',
    'disposeScene:WEBGPU',
    'disposeEngine:WEBGPU',
    'release:1',
  ]);
});
test('unavailable or throwing support check uses only WebGL2', async () => {
  for (const options of [{ supported: false }, { supportThrows: true }]) {
    const { driver, events } = fixture(options);
    const backend = await initializeBackend(0, 'AUTO', driver);
    assert.equal(backend.rendererKind, 'WEBGL2');
    assert(!events.some((event) => event.startsWith('engine:WEBGPU')));
    backend.dispose();
  }
});
test('WebGL2 preference skips WebGPU support completely', async () => {
  const { driver, events } = fixture();
  (await initializeBackend(0, 'WEBGL2', driver)).dispose();
  assert(!events.includes('support'));
});
test('init failure cleans engine before fallback on a distinct canvas', async () => {
  const { driver, events } = fixture({ failInit: ['WEBGPU'] });
  const backend = await initializeBackend(0, 'WEBGPU', driver);
  assert.equal(backend.rendererKind, 'WEBGL2');
  assert.deepEqual(events.slice(0, 5), [
    'support',
    'engine:WEBGPU:1',
    'disposeEngine:WEBGPU',
    'release:1',
    'engine:WEBGL2:2',
  ]);
  backend.dispose();
});
test('scene failure reconstructs a new scene after disposing all tentative resources', async () => {
  const { driver, events } = fixture({ failScene: ['WEBGPU'] });
  const backend = await initializeBackend(0, 'AUTO', driver);
  assert.equal(backend.scene.kind, 'WEBGL2');
  assert(events.indexOf('disposeScene:WEBGPU') < events.indexOf('disposeEngine:WEBGPU'));
  assert(events.indexOf('release:1') < events.indexOf('scene:WEBGL2'));
  backend.dispose();
});
test('both fail with recoverable aggregate; cleanup exceptions do not stop engine/canvas release', async () => {
  const { driver, events } = fixture({ failScene: ['WEBGPU', 'WEBGL2'], cleanupThrows: true });
  await assert.rejects(initializeBackend(0, 'AUTO', driver), RenderingInitializationError);
  assert(events.includes('disposeEngine:WEBGPU'));
  assert(events.includes('disposeEngine:WEBGL2'));
  assert(events.includes('release:1') && events.includes('release:2'));
});
