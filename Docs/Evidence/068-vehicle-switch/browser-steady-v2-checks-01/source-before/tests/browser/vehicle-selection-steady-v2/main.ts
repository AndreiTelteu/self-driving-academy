import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createRenderingBackend, type RenderingBackend } from '../../../src/rendering/babylon';
import { actualSelectionHost } from '../vehicle-selection-actual/selection-host';
import { runSteadyArm } from './arm';
import { lifecycleCycles } from './lifecycle';
import { steadyOrder, STEADY } from './protocol';
import { startWorldTransport, finishWorldTransport, beginWorld, retainWorld } from './transport';
import { check } from './proof';
import { errorEvidence } from './diagnostics';
declare const __SELECTION_STEADY_BUILD__: {
  sourceHash: string;
  commit: string;
  inputs: string[];
  historicalDerivationHash: string;
};
const status = document.getElementById('status')!;
let invalidated: string | null = null;
let observedSurface: { cssResolution: number[]; internalResolution: number[]; dpr: number } | null =
  null;
function surface(backend: RenderingBackend) {
  const engine = backend.scene.getEngine();
  check(
    invalidated === null && document.hasFocus() && !document.hidden,
    'Foreground/context invalidated:' + invalidated,
  );
  observedSurface = {
    cssResolution: [backend.canvas.clientWidth, backend.canvas.clientHeight],
    internalResolution: [engine.getRenderWidth(), engine.getRenderHeight()],
    dpr: devicePixelRatio,
  };
  check(
    devicePixelRatio === 1 &&
      backend.canvas.clientWidth === 1920 &&
      backend.canvas.clientHeight === 1080 &&
      engine.getRenderWidth() === 1920 &&
      engine.getRenderHeight() === 1080,
    'CSS/internal/DPR changed',
  );
}
document.getElementById('run')!.addEventListener('click', async () => {
  const button = document.getElementById('run') as HTMLButtonElement;
  check(!button.disabled, 'Run already active');
  button.disabled = true;
  invalidated = null;
  observedSurface = null;
  const requestedBackend = (document.getElementById('backend') as HTMLSelectElement).value as
    'AUTO' | 'WEBGL2';
  let renderer: RenderingBackend | null = null,
    primary: unknown = null,
    captureId: string | null = null,
    firstWorldAt: string | null = null,
    worldsCreated = 0,
    captureListeners = 0;
  const startedAt = new Date().toISOString(),
    disposers: (() => void)[] = [],
    summaries: unknown[] = [],
    lifecycle: unknown[] = [];
  const blur = () => {
      invalidated ??= 'WINDOW_BLUR';
    },
    visibility = () => {
      if (document.hidden) invalidated ??= 'HIDDEN';
    };
  window.addEventListener('blur', blur);
  captureListeners++;
  disposers.push(() => {
    window.removeEventListener('blur', blur);
    captureListeners--;
  });
  document.addEventListener('visibilitychange', visibility);
  captureListeners++;
  disposers.push(() => {
    document.removeEventListener('visibilitychange', visibility);
    captureListeners--;
  });
  let gpuInfo: unknown = null,
    rendererCleanup: unknown = null;
  let removeContext: (() => void) | null = null,
    rendererDisposalAttempted = false;
  const disposeRenderer = () => {
    if (!renderer || rendererDisposalAttempted) return;
    const backend = renderer;
    rendererDisposalAttempted = true;
    renderer = null;
    const errors: unknown[] = [];
    const remove = removeContext;
    removeContext = null;
    try {
      remove?.();
    } catch (error) {
      errors.push(error);
    }
    try {
      backend.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      rendererCleanup = {
        disposed: backend.scene.isDisposed,
        meshes: backend.scene.meshes.length,
        materials: backend.scene.materials.length,
        cameras: backend.scene.cameras.length,
      };
    } catch (error) {
      errors.push(error);
    }
    if (errors.length)
      throw new AggregateError(errors, 'Renderer once-only disposal/readback causes');
  };
  try {
    check(requestedBackend === 'AUTO' || requestedBackend === 'WEBGL2', 'Requested renderer');
    const ready = await fetch('/capture-ready');
    check(ready.ok, await ready.text());
    const start = await fetch('/capture-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedBackend, startedAt }),
    });
    check(start.ok, await start.clone().text());
    captureId = ((await start.json()) as { captureId: string }).captureId;
    startWorldTransport(captureId, requestedBackend);
    renderer = await createRenderingBackend(
      document.getElementById('canvas') as HTMLCanvasElement,
      requestedBackend,
    );
    const backend = renderer,
      engine = backend.scene.getEngine();
    check(
      backend.rendererKind === (requestedBackend === 'AUTO' ? 'WEBGPU' : 'WEBGL2'),
      'Backend unsupported/no fallback',
    );
    const token = engine.onContextLostObservable.add(() => {
      invalidated ??= 'CONTEXT_LOST';
    });
    removeContext = () => {
      engine.onContextLostObservable.remove(token);
    };
    if (devicePixelRatio !== 1) throw Error('ActualDPR1 required');
    engine.setSize(1920, 1080);
    backend.canvas.focus();
    surface(backend);
    gpuInfo = 'getInfo' in engine ? (engine as unknown as { getInfo(): unknown }).getInfo() : null;
    new HemisphericLight('steady-light', new Vector3(0, 1, 0), backend.scene);
    const ground = MeshBuilder.CreateGround(
        'steady-ground',
        { width: 500, height: 500 },
        backend.scene,
      ),
      material = new StandardMaterial('steady-ground-material', backend.scene);
    ground.material = material;
    for (const arm of steadyOrder()) {
      status.textContent = `RUNNING ${backend.rendererKind} ${arm.ordinal + 1}/20 ${arm.treatment} ${arm.observer ? 'ON' : 'OFF'} —30s warm/120s actual measure`;
      await beginWorld(arm); // Immutable STARTED acknowledgment before acquiring any arm native owner.
      firstWorldAt ??= new Date().toISOString();
      const record = await runSteadyArm(
        backend,
        arm,
        arm.treatment === 'CURRENT_068' ? actualSelectionHost : null,
        () => surface(backend),
        retainWorld,
        () => {
          worldsCreated++;
        },
      );
      // Whole raw world is already durable. Keep only bounded summaries in browser between arms.
      summaries.push({
        arm,
        tick: record.tick,
        measuredTicks: record.measuredTicks,
        frames: record.frames,
        firstWorldAt: record.firstWorldAt,
        createdAt: record.createdAt,
        disposition: record.disposition,
      });
    }
    disposeRenderer();
    lifecycle.push(
      ...(await lifecycleCycles(
        document.getElementById('canvas') as HTMLCanvasElement,
        requestedBackend,
        surface,
        () => {
          worldsCreated++;
        },
      )),
    );
  } catch (error) {
    primary = error instanceof Error ? error : Error(String(error));
    if (
      error &&
      typeof error === 'object' &&
      'lifecycleReports' in error &&
      Array.isArray(error.lifecycleReports)
    )
      lifecycle.push(...error.lifecycleReports);
  }
  const failures: unknown[] = [...(primary ? [primary] : [])];
  try {
    disposeRenderer();
  } catch (error) {
    failures.push(error);
  }
  for (const dispose of [...disposers].reverse()) {
    try {
      dispose();
    } catch (error) {
      failures.push(error);
    }
  }
  const identity = __SELECTION_STEADY_BUILD__,
    manifest = await fetch('/build-manifest.json')
      .then(async (response) => {
        check(response.ok, 'Manifest transport');
        return response.json();
      })
      .catch((error) => {
        failures.push(error);
        return null;
      });
  const finalSurface = observedSurface as {
    cssResolution: number[];
    internalResolution: number[];
    dpr: number;
  } | null;
  const report = {
    status: failures.length ? 'FAILED' : 'PASS',
    fixtureVersion: STEADY.version,
    identity,
    artifactHash: manifest?.artifactHash ?? null,
    captureId,
    requestedBackend,
    renderer: requestedBackend === 'AUTO' ? 'WEBGPU' : 'WEBGL2',
    startedAt,
    firstWorldAt,
    createdAt: new Date().toISOString(),
    actualGpuInfo: gpuInfo,
    foreground: document.hasFocus() && !document.hidden,
    surfaceInvalidation: invalidated,
    cssResolution: finalSurface?.cssResolution ?? null,
    internalResolution: finalSurface?.internalResolution ?? null,
    dpr: finalSurface?.dpr ?? null,
    worldsCreated,
    summaries,
    lifecycle,
    rendererCleanup,
    rendererDisposalAttempted,
    captureListeners,
    causes: failures.map(String),
    causeDetails: failures.map((error) => errorEvidence(error)),
    browser: navigator.userAgent,
    scope:
      'Later audited historicalPRE068 composition/commonpublished029 versuscurrent068. Actual20×30s/120s arms and20 renderer/UI/native admissions perbackend.70physical bodies30taxi40civil eacharm; boundedstraightplacement pulse/brake. Originalchronological short/nativegates remainindependent. No trustedkeyboard/069training/wholegame/assets/laptop/exactheap claim.',
  };
  try {
    const exported = await fetch(failures.length ? '/failure' : '/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    check(
      exported.ok,
      'Terminal transport HTTP ' + exported.status + ':' + (await exported.text()),
    );
    status.textContent = failures.length
      ? 'FAILED ' + failures.map(String).join('; ')
      : `PASS ${report.renderer}: actual requiredsteady subset saved. Independent verifier required.`;
  } catch (transport) {
    failures.push(transport);
    status.textContent = 'FAILED terminal export: ' + failures.map(String).join('; ');
    try {
      const failure = await fetch('/failure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...report, status: 'FAILED', causes: failures.map(String) }),
      });
      check(failure.ok, 'Failure transport HTTP ' + failure.status + ':' + (await failure.text()));
    } catch (error) {
      status.textContent += '; unresolved transport: ' + String(error);
    }
  }
  finishWorldTransport();
  button.disabled = false;
});
