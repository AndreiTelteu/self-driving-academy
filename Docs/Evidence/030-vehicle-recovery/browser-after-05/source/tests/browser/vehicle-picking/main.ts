import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import '@babylonjs/core/Meshes/instancedMesh';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { createRenderingBackend } from '../../../src/rendering/babylon';
import { VehiclePickingRegistry } from '../../../src/rendering/babylon/vehicle-picking-registry';
import {
  BabylonVehiclePicker,
  type SelectVehicleIntent,
} from '../../../src/rendering/babylon/vehicle-picking';
import { bindVehiclePickingInput } from '../../../src/rendering/babylon/vehicle-picking-input';
import { counts, gpuInfo, measure } from '../scene-adapter/baseline';
import type { BackendPreference } from '../../../src/rendering';
const element = (id: string) => document.getElementById(id)!;
function assert(value: unknown, message: string): asserts value {
  if (!value) throw Error(message);
}
let current: null | {
  dispose(): void;
  remap(): void;
  decor(): void;
  points(): unknown;
  state(): unknown;
} = null;
const authority = Object.freeze({ mode: 'AUTO', tick: 24, command: 0 });
let modal = false;
const setModal = (value: boolean) => {
  modal = value;
  element('overlay').style.display = value ? 'flex' : 'none';
};
function percentile(data: number[], p: number) {
  return [...data].sort((a, b) => a - b)[Math.ceil(data.length * p) - 1];
}
export async function runPickingProbe(preference: BackendPreference) {
  current?.dispose();
  current = null;
  setModal(false);
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  element('host').prepend(canvas);
  const backend = await createRenderingBackend(canvas, preference),
    scene = backend.scene,
    liveCanvas = backend.canvas;
  scene.getEngine().setSize(640, 360);
  scene.activeCamera!.position.set(0, 10, -22);
  (scene.activeCamera as FreeCamera).setTarget(Vector3.Zero());
  // Babylon lazily creates a scene-owned default material; include it in the baseline.
  scene.defaultMaterial.name = 'fixture-default';
  const beforeCounts = counts(backend);
  const material = new StandardMaterial('cars', scene);
  material.disableLighting = true;
  material.emissiveColor = new Color3(0.15, 0.8, 0.58);
  const taxi = CreateBox('taxi-body', { width: 1.8, height: 1.2, depth: 3.5 }, scene);
  taxi.position.set(-6, 0.6, 0);
  taxi.material = material;
  const civil = taxi.createInstance('civil');
  civil.position.x = -2;
  const thin = CreateBox('thin-batch', { width: 1.8, height: 1.2, depth: 3.5 }, scene);
  thin.material = material;
  thin.thinInstanceAdd(Matrix.Translation(2, 0.6, 0));
  thin.thinInstanceAdd(Matrix.Translation(6, 0.6, 0));
  thin.thinInstanceEnablePicking = true;
  const decor = CreateBox('decor', { width: 2.8, height: 3, depth: 1 }, scene);
  decor.position.set(-6, 1, -3);
  decor.setEnabled(false);
  const red = new StandardMaterial('decor', scene);
  red.disableLighting = true;
  red.emissiveColor = new Color3(0.85, 0.15, 0.12);
  decor.material = red;
  for (const mesh of scene.meshes) mesh.computeWorldMatrix(true);
  await scene.whenReadyAsync();
  backend.render();
  const targetPoints = [
    taxi.position,
    civil.position,
    new Vector3(2, 0.6, 0),
    new Vector3(6, 0.6, 0),
  ];
  const renderPoints = targetPoints.map((p) =>
    Vector3.Project(
      p,
      Matrix.Identity(),
      scene.getTransformMatrix(),
      scene.activeCamera!.viewport.toGlobal(640, 360),
    ),
  );
  const points = () => {
    const rect = liveCanvas.getBoundingClientRect();
    return renderPoints.map((p) => ({
      x: rect.left + (p.x / 640) * rect.width,
      y: rect.top + (p.y / 360) * rect.height,
    }));
  };
  const originalPick = scene.pick.bind(scene);
  let scans = 0;
  scene.pick = ((...args: Parameters<typeof scene.pick>) => {
    scans++;
    return originalPick(...args);
  }) as typeof scene.pick;
  const scanCost = (pick: () => unknown) => {
    const runs = [];
    for (let r = 0; r < 6; r++) {
      const samples = [];
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        const t = performance.now();
        pick();
        samples.push(performance.now() - t);
      }
      if (r)
        runs.push({
          p50: percentile(samples, 0.5),
          p95: percentile(samples, 0.95),
          p99: percentile(samples, 0.99),
          totalMs: performance.now() - start,
        });
    }
    return runs;
  };
  const baselineFrame = await measure(backend);
  const baselineClickCpu = scanCost(() => scene.pick(renderPoints[0].x, renderPoints[0].y));
  const registry = new VehiclePickingRegistry(scene);
  registry.register(taxi, 'taxi-mesh');
  registry.register(civil, 'civil-instance');
  registry.registerThinBatch(thin, ['taxi-thin', 'civil-thin']);
  const picker = new BabylonVehiclePicker(scene, registry);
  let selected: string | null = null;
  const selections: SelectVehicleIntent[] = [];
  const inputOptions = {
    canvas: liveCanvas,
    pick: (x: number, y: number) => picker.pick(x, y),
    isModalOpen: () => modal,
    onSelect: (intent: SelectVehicleIntent) => {
      selected = intent.entityId;
      selections.push(intent);
      element('selected').textContent = `Selected ${intent.entityId} · authority ${authority.mode}`;
    },
  };
  let unbind = bindVehiclePickingInput(inputOptions);
  for (let i = 0; i < 4; i++)
    assert(
      picker.pick(renderPoints[i].x, renderPoints[i].y)?.entityId ===
        ['taxi-mesh', 'civil-instance', 'taxi-thin', 'civil-thin'][i],
      `pick target${i}`,
    );
  const additionalClickCpu = scanCost(() => picker.pick(renderPoints[0].x, renderPoints[0].y));
  const afterFrame = await measure(backend);
  const beforeMoves = scans;
  for (let i = 0; i < 1000; i++)
    liveCanvas.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 100,
        clientY: 100,
        isPrimary: true,
        pointerId: 1,
      }),
    );
  assert(scans === beforeMoves, 'pointer movement scanned scene');
  const resourcesBefore = counts(backend),
    observersBefore = scene.meshes.map((m) => m.onDisposeObservable.observers.length);
  unbind();
  picker.dispose();
  registry.dispose();
  for (let cycle = 0; cycle < 20; cycle++) {
    const r = new VehiclePickingRegistry(scene);
    r.register(taxi, 'taxi-mesh');
    r.registerThinBatch(thin, ['taxi-thin', 'civil-thin']);
    const p = new BabylonVehiclePicker(scene, r);
    const u = bindVehiclePickingInput({ ...inputOptions, pick: (x, y) => p.pick(x, y) });
    u();
    p.dispose();
    r.dispose();
  }
  // Babylon Observable.remove defers physical compaction until the next task.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert(JSON.stringify(resourcesBefore) === JSON.stringify(counts(backend)), 'resource growth');
  assert(
    scene.meshes.every((m, i) => m.onDisposeObservable.observers.length <= observersBefore[i]),
    'observer growth',
  );
  const activeRegistry = new VehiclePickingRegistry(scene);
  activeRegistry.register(taxi, 'taxi-mesh');
  activeRegistry.register(civil, 'civil-instance');
  activeRegistry.registerThinBatch(thin, ['taxi-thin', 'civil-thin']);
  const activePicker = new BabylonVehiclePicker(scene, activeRegistry);
  unbind = bindVehiclePickingInput({ ...inputOptions, pick: (x, y) => activePicker.pick(x, y) });
  const report = {
    fixture: '018-four-vehicles-v1',
    backend: backend.rendererKind,
    preference,
    gpu: gpuInfo(backend),
    browser: navigator.userAgent,
    dpr: devicePixelRatio,
    cssResolution: [800, 450],
    internalResolution: [640, 360],
    preset: 'unlit semantic boxes, no shadows',
    baselineFrame,
    baselineClickCpu,
    afterFrame,
    additionalClickCpu,
    pointerMoveScans: scans - beforeMoves,
    cycles: 20,
    resourcesBefore,
    resourcesAfter: counts(backend),
    authority,
    hardwareGate: 'unvalidated early scoped probe; no display FPS',
    gpuTime: null,
  };
  element('result').textContent = JSON.stringify(report, null, 2);
  let disposed = false;
  current = {
    points,
    state: () => ({
      selected,
      selections: [...selections],
      scans,
      modal,
      authority,
      visible: document.visibilityState,
    }),
    remap: () => activeRegistry.registerThinBatch(thin, ['civil-thin', 'taxi-thin']),
    decor: () => {
      decor.setEnabled(!decor.isEnabled());
      backend.render();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unbind();
      activePicker.dispose();
      activeRegistry.dispose();
      scene.pick = originalPick;
      taxi.dispose();
      thin.dispose();
      decor.dispose();
      material.dispose();
      red.dispose();
      assert(
        JSON.stringify(counts(backend)) === JSON.stringify(beforeCounts),
        'mesh/material cleanup',
      );
      backend.dispose();
      liveCanvas.remove();
    },
  };
  return report;
}
element('gl').addEventListener('click', () =>
  runPickingProbe('WEBGL2')
    .then((report) => Object.assign(window, { pickingReport: report }))
    .catch((error) => (element('result').textContent = String(error))),
);
element('gpu').addEventListener('click', () =>
  runPickingProbe('WEBGPU')
    .then((report) => Object.assign(window, { pickingReport: report }))
    .catch((error) => (element('result').textContent = String(error))),
);
element('remap').addEventListener('click', () => current?.remap());
element('decor').addEventListener('click', () => current?.decor());
element('modal').addEventListener('click', () => setModal(true));
element('close').addEventListener('click', () => setModal(false));
Object.assign(window, {
  runPickingProbe,
  pickingPoints: () => current?.points(),
  pickingState: () => current?.state(),
  disposePicking: () => current?.dispose(),
});
