import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initializeBackend,
  OwnedCleanupError,
  RenderingInitializationError,
  type BackendDriver,
  type RendererKind,
} from '../../src/rendering/backend-policy';
import {
  ownPartialWebGPUCleanup,
  releaseOwnedCanvas,
} from '../../src/rendering/babylon/partial-cleanup';

function failureFixture(failed: readonly RendererKind[]) {
  const calls: string[] = [];
  const failures = new Map(
    (['WEBGPU', 'WEBGL2'] as const).map((kind) => [kind, {
      primary: new Error(`${kind}:initialize`),
      scene: new Error(`${kind}:scene`),
      engine: new Error(`${kind}:engine`),
      canvas: new Error(`${kind}:canvas`),
    }]),
  );
  let serial = 0;
  let reenter: (() => void) | undefined;
  type Resource = { kind: RendererKind; dispose(): void };
  const driver: BackendDriver<{ serial: number; kind?: RendererKind }, Resource, Resource> = {
    supportsWebGPU: async () => true,
    freshCanvas: (previous) => {
      calls.push(`fresh:${previous.serial}->${serial + 1}`);
      return { serial: ++serial };
    },
    createEngine: (canvas, kind) => {
      canvas.kind = kind;
      return { kind, dispose: () => {
        calls.push(`${kind}:engine`);
        throw failures.get(kind)!.engine;
      } };
    },
    initializeEngine: async () => {},
    createScene: ({ kind }) => ({ kind, dispose: () => {
      calls.push(`${kind}:scene`);
      reenter?.();
      throw failures.get(kind)!.scene;
    } }),
    initializeScene: async ({ kind }) => {
      if (failed.includes(kind)) throw failures.get(kind)!.primary;
    },
    releaseCanvas: ({ kind }) => {
      calls.push(`${kind}:canvas`);
      throw failures.get(kind!)!.canvas;
    },
  };
  return { calls, failures, driver, reenter: (dispose: () => void) => { reenter = dispose; } };
}

test('successful backend retains three cleanup causes in order, even on reentry and retry', async () => {
  const f = failureFixture([]);
  const backend = await initializeBackend({ serial: 0 }, 'WEBGL2', f.driver);
  f.reenter(backend.dispose);
  const errors = f.failures.get('WEBGL2')!;
  assert.throws(backend.dispose, (error: unknown) => {
    assert(error instanceof OwnedCleanupError);
    assert.equal(error.errors.length, 3);
    for (const [i, cause] of [errors.scene, errors.engine, errors.canvas].entries())
      assert.equal(error.errors[i], cause);
    return true;
  });
  backend.dispose();
  assert.deepEqual(f.calls, ['fresh:0->1', 'WEBGL2:scene', 'WEBGL2:engine', 'WEBGL2:canvas']);
});

test('failed initialization preserves primary and each cleanup identity for both fresh attempts', async () => {
  const f = failureFixture(['WEBGPU', 'WEBGL2']);
  await assert.rejects(initializeBackend({ serial: 0 }, 'AUTO', f.driver), (error: unknown) => {
    assert(error instanceof RenderingInitializationError);
    const expected = [...f.failures.values()].flatMap((v) => [v.primary, v.scene, v.engine, v.canvas]);
    assert.equal(error.errors.length, 8);
    expected.forEach((cause, i) => assert.equal(error.errors[i], cause));
    return true;
  });
  assert.deepEqual(f.calls, [
    'fresh:0->1', 'WEBGPU:scene', 'WEBGPU:engine', 'WEBGPU:canvas',
    'fresh:1->2', 'WEBGL2:scene', 'WEBGL2:engine', 'WEBGL2:canvas',
  ]);
});

test('all failed WebGPU releases precede successful fallback on a new canvas', async () => {
  const f = failureFixture(['WEBGPU']);
  const backend = await initializeBackend({ serial: 0 }, 'AUTO', f.driver);
  assert.equal(backend.rendererKind, 'WEBGL2');
  assert.equal(backend.canvas.serial, 2);
  assert.deepEqual(f.calls, [
    'fresh:0->1', 'WEBGPU:scene', 'WEBGPU:engine', 'WEBGPU:canvas', 'fresh:1->2',
  ]);
  assert.throws(backend.dispose, OwnedCleanupError);
});

test('partial Babylon owners, device, common and base cleanup are independently attempted once', () => {
  const calls: string[] = [];
  const causes = Array.from({ length: 8 }, (_, i) => new Error(`owner:${i}`));
  let dispose: () => void;
  const release = (i: number) => () => {
    calls.push(String(i));
    dispose();
    throw causes[i];
  };
  const partial = {
    _isDisposed: false,
    _timestampQuery: { dispose: release(0) },
    _mainTexture: { destroy: release(1) },
    _depthTexture: { destroy: release(2) },
    _textureHelper: { destroyDeferredTextures: release(3) },
    _bufferManager: { destroyDeferredBuffers: release(4) },
    _device: { destroy: release(5) },
  };
  dispose = ownPartialWebGPUCleanup(partial, release(6), release(7));
  assert.throws(dispose, (error: unknown) => {
    assert(error instanceof OwnedCleanupError);
    assert.equal(error.errors.length, 8);
    causes.forEach((cause, i) => assert.equal(error.errors[i], cause));
    return true;
  });
  dispose();
  assert.equal(partial._isDisposed, true);
  assert.deepEqual(calls, ['0', '1', '2', '3', '4', '5', '6', '7']);
});

test('absent partial GPU owners do not skip base cleanup after common failure', () => {
  const cause = new Error('common');
  let base = 0;
  const partial = { _isDisposed: false };
  const dispose = ownPartialWebGPUCleanup(partial, () => { throw cause; }, () => { base++; });
  assert.throws(dispose, (error: unknown) => error === cause);
  dispose();
  assert.equal(base, 1);
  assert.equal(partial._isDisposed, true);
});

test('context loss failure still zeros both canvas dimensions and retains actual cause', () => {
  const cause = new Error('loseContext');
  const canvas = { width: 1920, height: 1080 };
  let losses = 0;
  assert.throws(() => releaseOwnedCanvas(canvas, {
    getExtension: (name) => {
      assert.equal(name, 'WEBGL_lose_context');
      return { loseContext: () => { losses++; throw cause; } };
    },
  }), (error: unknown) => error === cause);
  assert.equal(losses, 1);
  assert.deepEqual(canvas, { width: 0, height: 0 });
});

test('canvas setter failures are independent and foreign AggregateError identity is retained', () => {
  const loss = new AggregateError([new Error('native')], 'context');
  const width = new Error('width');
  const height = new Error('height');
  const calls: string[] = [];
  const canvas = {
    get width() { return 1; },
    set width(_value: number) { calls.push('width'); throw width; },
    get height() { return 1; },
    set height(_value: number) { calls.push('height'); throw height; },
  };
  assert.throws(() => releaseOwnedCanvas(canvas, {
    getExtension: () => ({ loseContext: () => { calls.push('loss'); throw loss; } }),
  }), (error: unknown) => {
    assert(error instanceof OwnedCleanupError);
    assert.equal(error.errors.length, 3);
    [loss, width, height].forEach((cause, i) => assert.equal(error.errors[i], cause));
    return true;
  });
  assert.deepEqual(calls, ['loss', 'width', 'height']);
});

test('constructor failure owns only canvas; context cleanup remains available before engine handoff', async () => {
  const primary = new Error('Engine constructor');
  const cleanup = new Error('owned context');
  const calls: string[] = [];
  const canvas = { width: 1920, height: 1080 };
  await assert.rejects(initializeBackend(canvas, 'WEBGL2', {
    supportsWebGPU: async () => false,
    freshCanvas: () => canvas,
    createEngine: () => { throw primary; },
    initializeEngine: async () => {},
    createScene: () => { throw new Error('must not create scene'); },
    initializeScene: async () => {},
    releaseCanvas: (target) => releaseOwnedCanvas(target, {
      getExtension: () => ({ loseContext: () => { calls.push('context'); throw cleanup; } }),
    }),
  }), (error: unknown) => {
    assert(error instanceof RenderingInitializationError);
    assert.equal(error.errors[0], primary);
    assert.equal(error.errors[1], cleanup);
    assert.equal(error.errors.length, 2);
    return true;
  });
  assert.deepEqual(calls, ['context']);
  assert.deepEqual(canvas, { width: 0, height: 0 });
});
