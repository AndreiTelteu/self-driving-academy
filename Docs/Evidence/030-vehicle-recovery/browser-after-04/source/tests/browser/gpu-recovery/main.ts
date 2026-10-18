import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { createRendererRecovery } from '../../../src/app/renderer-recovery';
import {
  createBabylonRecoverySession,
  type BabylonRecoverySession,
  type RecoverySceneSnapshot,
} from '../../../src/rendering/babylon/recovery-session';
import type { BackendPreference } from '../../../src/rendering';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import { triangleGlb } from '../asset-registry/glb-fixture';
import { bootstrapProbe, counts, measure, gpuInfo } from '../scene-adapter/baseline';
const preference: BackendPreference =
  new URLSearchParams(location.search).get('backend') === 'WEBGPU' ? 'WEBGPU' : 'WEBGL2';
const functionalOnly = new URLSearchParams(location.search).has('functional');
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function equal(a: unknown, b: unknown, message: string) {
  assert(
    JSON.stringify(a) === JSON.stringify(b),
    message + ': ' + JSON.stringify(a) + ' / ' + JSON.stringify(b),
  );
}
const result = document.querySelector('#result')!,
  host = document.querySelector('#host')!;
const freshCanvas = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  host.replaceChildren(canvas);
  return canvas;
};
function observers(session: BabylonRecoverySession) {
  return {
    sceneDispose: session.scene.onDisposeObservable.observers.length,
    beforeRender: session.scene.onBeforeRenderObservable.observers.length,
    afterRender: session.scene.onAfterRenderObservable.observers.length,
    lossSubscriptions: session.ownedLossSubscriptions,
    progressListeners: 0,
  };
}

async function runProbe() {
  const baselineBackend = await createRenderingBackend(freshCanvas(), preference),
    baseline = functionalOnly ? null : await measure(baselineBackend);
  const baselineGpu = gpuInfo(baselineBackend);
  baselineBackend.dispose();
  const url = URL.createObjectURL(
    new Blob([triangleGlb(true) as Uint8Array<ArrayBuffer>], { type: 'model/gltf-binary' }),
  );
  const snapshot: RecoverySceneSnapshot = {
    render: {
      sessionId: 'recover',
      worldEpoch: 2,
      tick: 417,
      vehicles: [
        {
          vehicleId: 'taxi',
          incarnation: 'taxi-1',
          transform: {
            positionM: { x: 1, y: 0, z: 2 },
            rotationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
          },
          wheels: [],
        },
      ],
    },
    assets: [
      { id: 'car', version: '1', url, critical: true, source: 'original fixture', license: 'CC0' },
    ],
    bindings: [{ entityId: 'taxi', assetId: 'car' }],
  };
  let paused = false,
    failures = 0,
    created = 0,
    released = 0,
    maxLive = 0,
    live = 0,
    retained: BabylonRecoverySession | null = null;
  const ticks = 417;
  let resizeListeners = 0,
    rafOwners = 0;
  const states: string[] = [],
    cycleCounts: unknown[] = [],
    cycleMs: number[] = [];
  const recovery = createRendererRecovery({
    captureSnapshot: () => ({
      tick: ticks,
      physics: { bodyPose: snapshot.render.vehicles[0].transform },
      scene: snapshot,
    }),
    suspendSimulation: () => {
      paused = true;
    },
    show: (state) => {
      states.push(state.kind);
      result.textContent = JSON.stringify({
        running: true,
        state,
        completedCycles: cycleCounts.length,
      });
    },
    createRenderer: async (checkpoint, kind, onLost) => {
      assert(paused, 'simulation paused during create');
      assert(checkpoint.tick === 417, 'tick retained');
      if (failures-- > 0) throw new Error('Injected reconstruction failure');
      const session = await createBabylonRecoverySession(
        freshCanvas(),
        kind,
        checkpoint.scene,
        onLost,
      );
      retained = session;
      new HemisphericLight('fixture-light', new Vector3(0, 1, 0), session.scene);
      const camera = session.scene.activeCamera as FreeCamera;
      camera.setTarget(new Vector3(1, 0, 2));
      created++;
      live++;
      maxLive = Math.max(maxLive, live);
      const dispose = session.dispose.bind(session);
      let done = false;
      session.dispose = () => {
        if (done) return;
        done = true;
        dispose();
        released++;
        live--;
      };
      return session;
    },
  });
  await recovery.start(preference);
  assert(
    recovery.getState().kind === 'READY',
    'initial ready: ' + JSON.stringify(recovery.getState()),
  );
  const first = retained!,
    expected = { resources: counts(first), observers: observers(first) };
  const authority = JSON.stringify(snapshot),
    checkpoint = recovery.getSnapshot();
  const initial = functionalOnly
    ? null
    : await measure({ ...first, render: () => recovery.render() });
  const resize = () => recovery.resize();
  window.addEventListener('resize', resize);
  resizeListeners++;
  let running = true;
  let raf = 0;
  const frame = () => {
    if (!running) return;
    recovery.render();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  rafOwners++;
  const stopFrames = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    rafOwners--;
  };
  for (let cycle = 0; cycle < 20; cycle++) {
    const started = performance.now();
    const current: BabylonRecoverySession = retained!;
    current.canvas.style.width = cycle % 2 ? '480px' : '640px';
    current.canvas.style.height = cycle % 2 ? '270px' : '360px';
    recovery.resize();
    if (cycle % 2 === 0) {
      const engine = current.scene.getEngine();
      if (engine instanceof WebGPUEngine) engine._device.destroy();
      else if (engine instanceof Engine) {
        const extension = (
          current.canvas.getContext('webgl2') as WebGL2RenderingContext
        ).getExtension('WEBGL_lose_context');
        assert(extension, 'lose-context extension available');
        extension.loseContext();
      }
      const deadline = performance.now() + 15000;
      while (retained === current && performance.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 5));
      assert(retained !== current, 'native browser loss signal rebuilt scene');
      while (recovery.getState().kind === 'RECOVERING' && performance.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 5));
    } else await recovery.recover('explicit renderer reload');
    assert(recovery.getState().kind === 'READY', 'cycle ready');
    equal(
      { resources: counts(retained!), observers: observers(retained!) },
      expected,
      'resource/observer plateau',
    );
    assert(retained!.adapter.getNode('taxi')!.position.x === 1, 'body pose reconstructed');
    assert(retained!.adapter.getNode('taxi')!.position.z === 2, 'body position reconstructed');
    assert(ticks === 417 && paused, 'same authoritative tick remains paused');
    assert(JSON.stringify(snapshot) === authority, 'authoritative snapshot unchanged');
    assert(EngineStore.Instances.length === 1, 'one live Babylon engine');
    cycleCounts.push({
      cycle,
      ...counts(retained!),
      ...observers(retained!),
      resizeListeners,
      rafOwners,
    });
    cycleMs.push(performance.now() - started);
  }
  failures = 2;
  await recovery.recover('simulated repeated failure');
  const kept = recovery.getSnapshot();
  assert(recovery.getState().kind === 'ERROR' && live === 0, 'failure removes damaged renderer');
  await recovery.retry();
  assert(recovery.getState().kind === 'ERROR', 'repeated failure is retryable');
  assert(
    recovery.getSnapshot() === kept && kept!.tick === 417,
    'same immutable RAM checkpoint after failures',
  );
  await recovery.retry();
  assert(
    recovery.getState().kind === 'READY' && ticks === 417,
    'explicit retry restores unchanged world',
  );
  stopFrames();
  const after = functionalOnly
    ? null
    : await measure({ ...retained!, render: () => recovery.render() });
  equal(
    { resources: counts(retained!), observers: observers(retained!) },
    expected,
    'retry resource plateau',
  );
  const finalGpu = gpuInfo(retained!);
  recovery.render();
  const report = {
    pass: true,
    fixture: '020-recovery-v1',
    preference,
    backend: retained!.rendererKind,
    browser: navigator.userAgent,
    gpu: finalGpu,
    baselineGpu,
    dpr: devicePixelRatio,
    resolution: [640, 360],
    baseline,
    initial,
    after,
    cycles: cycleCounts,
    cycleMs,
    created,
    released,
    live,
    maxLive,
    tick: ticks,
    paused,
    states,
    retainedCheckpointSameAcrossRetry: true,
    nativeLossSimulation:
      preference === 'WEBGPU'
        ? 'GPUDevice.destroy triggers real device.lost promise; deliberate destruction, not hardware fault'
        : 'WEBGL_lose_context triggers actual canvas loss event; deliberate simulation, not hardware fault',
    durableSave: false,
    initialCheckpointTick: checkpoint!.tick,
  };
  result.textContent = JSON.stringify(report, null, 2);
  const dispose = () => {
    window.removeEventListener('resize', resize);
    resizeListeners--;
    stopFrames();
    const ramTick = recovery.getSnapshot()!.tick;
    recovery.dispose();
    URL.revokeObjectURL(url);
    assert(live === 0 && EngineStore.Instances.length === 0, 'final engine/resource cleanup');
    return {
      live,
      resizeListeners,
      rafOwners,
      lossSubscriptions: retained!.ownedLossSubscriptions,
      sceneDisposed: retained!.scene.isDisposed,
      ramTickBeforeDisposal: ramTick,
      ramCleared: recovery.getSnapshot() === null,
    };
  };
  return { report, recovery, dispose };
}
if (new URLSearchParams(location.search).has('baseline')) {
  bootstrapProbe(preference).then((report) => Object.assign(window, { probe020: report }));
} else
  runProbe()
    .then((probe) => Object.assign(window, { probe020: probe }))
    .catch((error: unknown) => {
      result.textContent = String(error);
      throw error;
    });
