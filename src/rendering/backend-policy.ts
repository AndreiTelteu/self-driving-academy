export type RendererKind = 'WEBGPU' | 'WEBGL2';
export type BackendPreference = 'AUTO' | RendererKind;

export interface Disposable {
  dispose(): void;
}

export interface BackendDriver<Canvas, Engine extends Disposable, Scene extends Disposable> {
  supportsWebGPU(): Promise<boolean>;
  freshCanvas(previous: Canvas): Canvas;
  createEngine(canvas: Canvas, kind: RendererKind): Engine;
  initializeEngine(engine: Engine, kind: RendererKind): Promise<void>;
  createScene(engine: Engine): Scene;
  initializeScene(scene: Scene): Promise<void>;
  releaseCanvas(canvas: Canvas): void;
}

export interface BackendResources<Canvas, Engine, Scene> {
  readonly canvas: Canvas;
  readonly engine: Engine;
  readonly scene: Scene;
  readonly rendererKind: RendererKind;
  dispose(): void;
}

export class RenderingInitializationError extends AggregateError {
  constructor(errors: unknown[]) {
    super(errors, 'Randarea nu a pornit. WebGPU și WebGL 2 nu sunt disponibile. Poți reîncerca.');
    this.name = 'RenderingInitializationError';
  }
}

/** Internal cleanup aggregate: only our owner lists are flattened, never foreign errors. */
export class OwnedCleanupError extends AggregateError {
  constructor(errors: unknown[]) {
    super(errors, 'Owned rendering resources could not all be released');
    this.name = 'OwnedCleanupError';
  }
}

/** The fixed owner list bounds retained causes; fence before any reentrant release. */
export function releaseOwnersOnce(owners: readonly (() => void)[]): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const errors: unknown[] = [];
    for (const release of owners) {
      try {
        release();
      } catch (error: unknown) {
        if (error instanceof OwnedCleanupError) errors.push(...error.errors);
        else errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new OwnedCleanupError(errors);
  };
}

/** Pure policy: ownership is acquired before each asynchronous initialization. */
export async function initializeBackend<
  Canvas,
  Engine extends Disposable,
  Scene extends Disposable,
>(
  initialCanvas: Canvas,
  preference: BackendPreference,
  driver: BackendDriver<Canvas, Engine, Scene>,
): Promise<BackendResources<Canvas, Engine, Scene>> {
  const errors: unknown[] = [];
  let canvas = initialCanvas;
  const kinds: RendererKind[] = [];
  if (preference !== 'WEBGL2') {
    try {
      if (await driver.supportsWebGPU()) kinds.push('WEBGPU');
      else errors.push(new Error('WebGPU unavailable'));
    } catch (error: unknown) {
      errors.push(error);
    }
  }
  kinds.push('WEBGL2');
  for (const rendererKind of kinds) {
    let engine: Engine | undefined;
    let scene: Scene | undefined;
    let ownsCanvas = false;
    let canvasForAttempt = canvas;
    const dispose = releaseOwnersOnce([
      () => scene?.dispose(),
      () => engine?.dispose(),
      () => {
        if (ownsCanvas) driver.releaseCanvas(canvasForAttempt);
      },
    ]);
    try {
      canvas = driver.freshCanvas(canvas);
      ownsCanvas = true;
      canvasForAttempt = canvas;
      engine = driver.createEngine(canvas, rendererKind);
      await driver.initializeEngine(engine, rendererKind);
      scene = driver.createScene(engine);
      await driver.initializeScene(scene);
      return { canvas, engine, scene, rendererKind, dispose };
    } catch (error: unknown) {
      errors.push(error);
      try {
        dispose();
      } catch (cleanupError: unknown) {
        if (cleanupError instanceof OwnedCleanupError) errors.push(...cleanupError.errors);
        else errors.push(cleanupError);
      }
    }
  }
  throw new RenderingInitializationError(errors);
}
