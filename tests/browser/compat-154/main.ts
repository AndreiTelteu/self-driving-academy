import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Vector3 } from '@babylonjs/core/Maths/math';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { createRendererRecovery } from '../../../src/app/renderer-recovery';
import type { BackendPreference } from '../../../src/rendering';
import {
  createBabylonRecoverySession,
  createRenderingBackend,
  type BabylonRecoverySession,
  type RecoverySceneSnapshot,
  type RenderingBackend,
} from '../../../src/rendering/babylon';
import type {
  CompatBackend,
  CompatCapabilities,
  CompatPreference,
  CompatRecoveryObservation,
} from '../../harness/compat-matrix';

declare global {
  interface Window {
    __compatReady?: boolean;
    __compatCapabilities?: (os: string) => Promise<CompatCapabilities>;
    __compatBackend?: (preference: CompatPreference) => Promise<BackendProbe>;
    __compatRecovery?: (preference: CompatPreference) => Promise<CompatRecoveryObservation>;
  }
}

interface BackendProbe {
  readonly status: 'READY' | 'ERROR';
  readonly backend: CompatBackend;
  readonly activeMeshes: number;
  readonly framesAdvanced: boolean;
  readonly contextAlive: boolean;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly error: string | null;
}

interface AdapterLike {
  readonly info?: {
    readonly vendor?: string;
    readonly architecture?: string;
    readonly device?: string;
    readonly description?: string;
  };
}

const statusNode = document.querySelector<HTMLElement>('#status');
const hostNode = document.querySelector<HTMLElement>('#host');
const resultNode = document.querySelector<HTMLElement>('#result');
const retryNode = document.querySelector<HTMLButtonElement>('#retry');
if (!statusNode || !hostNode || !resultNode || !retryNode)
  throw new Error('Missing harness controls');
const status: HTMLElement = statusNode;
const host: HTMLElement = hostNode;
const result: HTMLElement = resultNode;
const retryButton: HTMLButtonElement = retryNode;

const CHECKPOINT: { readonly tick: number; readonly scene: RecoverySceneSnapshot } = {
  tick: 417,
  scene: {
    render: {
      sessionId: 'compat-154',
      worldEpoch: 1,
      tick: 417,
      vehicles: [],
    },
    assets: [],
    bindings: [],
  },
};

const waitAnimationFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function adapterInfo(adapter: AdapterLike | null): CompatCapabilities['webgpu']['adapter'] {
  if (adapter === null) return null;
  const info = adapter.info;
  if (info === undefined) return null;
  const text = (value: string | undefined): string | null =>
    typeof value === 'string' && value.length > 0 ? value : null;
  return {
    vendor: text(info.vendor),
    architecture: text(info.architecture),
    device: text(info.device),
    description: text(info.description),
  };
}

async function capabilities(os: string): Promise<CompatCapabilities> {
  const userAgent = navigator.userAgent;
  const chrome = /HeadlessChrome\/([^\s]+)|Chrome\/([^\s]+)/.exec(userAgent);
  const browserVersion = chrome?.[1] ?? chrome?.[2] ?? 'unknown';
  const headless = /HeadlessChrome/.test(userAgent);

  let adapter: CompatCapabilities['webgpu']['adapter'] = null;
  let webgpuError: string | null = null;
  let available = false;
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<AdapterLike | null> } })
    .gpu;
  if (gpu !== undefined) {
    try {
      const requested = await Promise.race([
        gpu.requestAdapter(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
      ]);
      available = requested !== null;
      adapter = adapterInfo(requested);
    } catch (error: unknown) {
      webgpuError = errorMessageOf(error);
    }
  } else webgpuError = 'navigator.gpu lipsește';

  let webgl2: { available: boolean; vendor: string | null; renderer: string | null } | undefined;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (gl === null) webgl2 = { available: false, vendor: null, renderer: null };
    else {
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      webgl2 = {
        available: true,
        vendor: debug === null ? null : gl.getParameter(debug.UNMASKED_VENDOR_WEBGL),
        renderer: debug === null ? null : gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
      };
    }
  } catch (error: unknown) {
    webgpuError ??= `WebGL 2 probe: ${errorMessageOf(error)}`;
    webgl2 = { available: false, vendor: null, renderer: null };
  }

  let webgl1Available = false;
  try {
    webgl1Available = document.createElement('canvas').getContext('webgl') !== null;
  } catch {
    webgl1Available = false;
  }

  return {
    userAgent,
    browser: `Chromium ${browserVersion}`,
    browserVersion,
    headless,
    platform: os,
    secureContext: window.isSecureContext,
    devicePixelRatio: window.devicePixelRatio,
    webgpu: { available, adapter, error: webgpuError },
    webgl2: webgl2 ?? { available: false, vendor: null, renderer: null },
    webgl1: { available: webgl1Available },
  };
}

function decorate(session: BabylonRecoverySession | RenderingBackend): void {
  new HemisphericLight('compat-light', new Vector3(0, 1, 0), session.scene);
  const material = new StandardMaterial('compat-material', session.scene);
  material.diffuseColor = new Color3(0.9, 0.45, 0.1);
  const box = MeshBuilder.CreateBox('compat-box', { size: 1.2 }, session.scene);
  box.material = material;
}

function contextAlive(backend: RenderingBackend): boolean {
  if (backend.rendererKind === 'WEBGL2') {
    const gl = backend.canvas.getContext('webgl2');
    return gl !== null && !gl.isContextLost();
  }
  return backend.canvas.getContext('webgpu') !== null;
}

async function backendProbe(preference: CompatPreference): Promise<BackendProbe> {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  host.replaceChildren(canvas);
  try {
    const backend = await createRenderingBackend(canvas, preference as BackendPreference);
    try {
      decorate(backend);
      backend.resize();
      backend.render();
      const engine = backend.scene.getEngine();
      const firstFrame = engine.frameId;
      await waitAnimationFrame();
      backend.render();
      await waitAnimationFrame();
      backend.render();
      const probe: BackendProbe = {
        status: 'READY',
        backend: backend.rendererKind,
        activeMeshes: backend.scene.getActiveMeshes().length,
        framesAdvanced: engine.frameId > firstFrame,
        contextAlive: contextAlive(backend),
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        error: null,
      };
      return probe;
    } finally {
      backend.dispose();
    }
  } catch (error: unknown) {
    return {
      status: 'ERROR',
      backend: 'NONE',
      activeMeshes: 0,
      framesAdvanced: false,
      contextAlive: false,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      error: errorMessageOf(error),
    };
  } finally {
    canvas.remove();
  }
}

function waitFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count;
    const step = (): void => {
      remaining -= 1;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 30000): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return true;
    await waitFrames(1);
  }
  return predicate();
}

async function recovery(preference: CompatPreference): Promise<CompatRecoveryObservation> {
  host.replaceChildren();
  retryButton.hidden = true;
  const states: string[] = [];
  let current: BabylonRecoverySession | undefined;
  let failures = 0;
  let frames = 0;
  let running = true;
  let raf = 0;
  let retryAvailable = false;
  let errorMessage: string | null = null;
  const recoveryOwner = createRendererRecovery({
    suspendSimulation: () => {
      status.textContent = 'Simulare suspendată pentru recuperare.';
    },
    captureSnapshot: () => CHECKPOINT,
    show: (state) => {
      states.push(state.kind);
      retryAvailable = state.kind === 'ERROR' ? state.retryAvailable : false;
      errorMessage = state.kind === 'ERROR' ? state.message : null;
      if (state.kind === 'ERROR') {
        status.textContent = `Randarea nu a pornit. ${state.message}`;
        retryButton.hidden = false;
      } else if (state.kind === 'RECOVERING') {
        status.textContent = 'Se reconstruiește scena după pierderea dispozitivului…';
        retryButton.hidden = true;
      } else if (state.kind === 'READY') {
        status.textContent = `Scenă de probă READY · generația ${state.generation}`;
        retryButton.hidden = true;
      }
    },
    createRenderer: async (checkpoint, kind, onLost): Promise<BabylonRecoverySession> => {
      if (checkpoint.tick !== CHECKPOINT.tick) throw new Error('Checkpoint tick changed');
      if (failures-- > 0) throw new Error('Injected compat reconstruction failure');
      const attemptCanvas = document.createElement('canvas');
      attemptCanvas.width = 640;
      attemptCanvas.height = 360;
      host.replaceChildren(attemptCanvas);
      current = await createBabylonRecoverySession(attemptCanvas, kind, checkpoint.scene, onLost);
      decorate(current);
      return current;
    },
  });
  retryButton.onclick = () => void recoveryOwner.retry();

  const loop = (): void => {
    if (!running) return;
    recoveryOwner.render();
    frames += 1;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  await recoveryOwner.start(preference as BackendPreference);
  const initial = recoveryOwner.getState();
  const generationBefore = initial.generation;
  const tickBefore = recoveryOwner.getSnapshot()?.tick ?? -1;
  await waitFrames(4);
  const framesBeforeLoss = frames;

  const session = current;
  if (session === undefined) throw new Error('Recovery session missing after start');
  const engine = session.scene.getEngine();
  let lossSignal: CompatRecoveryObservation['lossSignal'] = 'none';
  if (engine instanceof WebGPUEngine) {
    lossSignal = 'GPUDevice.destroy';
    engine._device.destroy();
  } else if (engine instanceof Engine) {
    const gl = session.canvas.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (extension === null || extension === undefined)
      throw new Error('WEBGL_lose_context unavailable');
    lossSignal = 'WEBGL_lose_context.loseContext';
    extension.loseContext();
  }
  const recovered = await waitFor(() => {
    const state = recoveryOwner.getState();
    return state.kind === 'READY' && state.generation > generationBefore;
  });
  const afterLoss = recoveryOwner.getState();
  if (!recovered) status.textContent = `Recuperarea a eșuat: ${JSON.stringify(afterLoss)}`;
  const sessionAfterLoss = current;
  const lossFrameBefore = sessionAfterLoss?.scene.getEngine().frameId ?? 0;
  await waitFrames(4);
  const framesWhileReady = frames - framesBeforeLoss;
  const lossRenderEvidence =
    sessionAfterLoss === undefined
      ? { activeMeshes: 0, framesAdvanced: false }
      : {
          activeMeshes: sessionAfterLoss.scene.getActiveMeshes().length,
          framesAdvanced: sessionAfterLoss.scene.getEngine().frameId > lossFrameBefore,
        };

  failures = 2;
  await recoveryOwner.recover('compat forced failure');
  const failed = recoveryOwner.getState();
  const retryAvailableInError = retryAvailable;
  const errorMessageInError = errorMessage;
  const rendererReleasedOnError = recoveryOwner.getRenderer() === undefined;
  const framesBeforeError = frames;
  await waitFrames(6);
  const framesWhileError = frames - framesBeforeError;
  if (retryButton.hidden) status.textContent = 'Butonul de reîncercare nu este vizibil.';
  retryButton.click();
  await waitFor(() => recoveryOwner.getState().kind !== 'RECOVERING');
  const secondFailure = recoveryOwner.getState().kind;
  retryButton.click();
  const restored = await waitFor(() => recoveryOwner.getState().kind === 'READY');
  const final = recoveryOwner.getState();
  await waitFrames(3);
  const retryRestored = restored && final.kind === 'READY';
  const generationAfterRetry = final.generation;
  const tickAfterLoss = afterLoss.kind === 'READY' ? (recoveryOwner.getSnapshot()?.tick ?? -1) : -1;
  const tickAfterRetry = recoveryOwner.getSnapshot()?.tick ?? -1;

  recoveryOwner.render();
  const finalSession = current;
  const backendKind: CompatBackend = finalSession?.rendererKind ?? 'NONE';
  const activeMeshes = finalSession?.scene.getActiveMeshes().length ?? 0;
  const diagnostics =
    finalSession === undefined
      ? null
      : {
          meshes: finalSession.scene.meshes.length,
          camera: finalSession.scene.activeCamera !== null,
          canvasConnected: finalSession.canvas.isConnected,
        };

  running = false;
  cancelAnimationFrame(raf);
  recoveryOwner.dispose();

  const stateSequence = [...states];
  const pass =
    initial.kind === 'READY' &&
    lossSignal !== 'none' &&
    failed.kind === 'ERROR' &&
    generationBefore >= 1 &&
    afterLoss.kind === 'READY' &&
    afterLoss.generation > generationBefore &&
    generationAfterRetry > afterLoss.generation &&
    tickBefore === CHECKPOINT.tick &&
    tickAfterLoss === CHECKPOINT.tick &&
    tickAfterRetry === CHECKPOINT.tick &&
    lossRenderEvidence.activeMeshes > 0 &&
    lossRenderEvidence.framesAdvanced &&
    framesWhileReady > 0 &&
    stateSequence.includes('ERROR') &&
    errorMessageInError !== null &&
    retryAvailableInError &&
    rendererReleasedOnError &&
    framesWhileError > 0 &&
    secondFailure === 'ERROR' &&
    retryRestored &&
    diagnostics !== null &&
    diagnostics.meshes > 0 &&
    diagnostics.camera;

  return {
    preference,
    backend: backendKind,
    lossSignal,
    stateSequence,
    generationBefore,
    generationAfterLoss: afterLoss.generation,
    generationAfterRetry,
    tickBefore,
    tickAfterLoss,
    tickAfterRetry,
    framesWhileReady,
    framesWhileError,
    activeMeshes,
    framesAdvanced: lossRenderEvidence.framesAdvanced,
    errorMessage: errorMessageInError,
    retryAvailable: retryAvailableInError,
    rendererReleasedOnError,
    retryRestored,
    diagnostics,
    pass,
  };
}

window.__compatCapabilities = capabilities;
window.__compatBackend = backendProbe;
window.__compatRecovery = recovery;
window.__compatReady = true;
result.textContent = 'Harness pregătit.';
